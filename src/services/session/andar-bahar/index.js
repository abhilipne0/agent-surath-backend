const AndarBaharSessionModel = require("../../../models/andar-bahar/session");
const Bet = require("../../../models/andar-bahar/bets");
const User = require("../../../models/users");
const BankDetails = require("../../../models/bankAccounts");
const logStatement = require("../../../utils/logStatement");
const { getDeck, shuffleDeck } = require("../../../utils/andar-bahar/index");
const GameSetting = require("../../../models/settings");

class AndarBaharSession {
  setMode(mode) {
    if (["automatic", "manual"].includes(mode)) {
      this.mode = mode;
    } else {
      throw new Error("Invalid mode");
    }
  }

  // ✅ You already have this
  async updateModeInDB(mode) {
    await GameSetting.findOneAndUpdate(
      { game: "andar-bahar" },
      { value: mode },
      { upsert: true }
    );
  }
  constructor(io) {
    this.io = io;
    this.currentSession = null;
    this.lastSession = null;
    this.isSessionActiveFlag = false;
    this.betCurrentSession = null;
    this.mode = "automatic";

    this.initializeSettings();
    this.runSession(); // Start immediately

    this.io.on("connection", (socket) => {
      socket.on("joinSession", ({ userId }) => {
        socket.userId = userId;

        // Calculate the true end time factoring in card delays
        const cardDelayMs = (this.lastSession?.otherCards?.length || 0) * 1200;
        const finalEndTime = new Date(this.lastSession?.endTime).getTime() + cardDelayMs;
        const now = Date.now();

        if (this.currentSession && !this.currentSession.isEnded) {
          socket.emit("currentSession", {
            sessionId: this.currentSession._id,
            matchCard: this.currentSession.mainCard,
            startTime: this.currentSession.startTime,
            endTime: this.currentSession.endTime,
            otherCards: null,
            sessionEnded: false,
          });
        } else if (this.lastSession) {
          socket.emit("currentSession", {
            sessionId: this.lastSession._id,
            matchCard: now > finalEndTime ? null : this.lastSession.mainCard,
            startTime: this.lastSession.startTime,
            endTime: this.lastSession.endTime,
            otherCards: now > finalEndTime ? null : this.lastSession.otherCards,
            sessionEnded: true,
            side: this.lastSession.side
          });
        } else {
          socket.emit("currentSession", {
            error: "No active session available",
          });
        }
      });
    });
  }

  async initializeSettings() {
    try {
      const existing = await GameSetting.findOne({ game: "andar-bahar" });
      if (!existing) {
        const newSetting = new GameSetting({
          game: "andar-bahar",
          key: "sessionModea",
          value: "automatic"
        });
        await newSetting.save();
        console.log("Initialized default setting for andar-bahar game.");
      } else {
        console.log("Setting for andar-bahar already exists.");
      }

      this.mode = existing?.value || "automatic";
    } catch (error) {
      console.error("Failed to initialize andar-bahar setting:", error);
      this.mode = "automatic"; // fallback
    }
  }

  async runSession() {
    try {
      // End any lingering sessions
      await AndarBaharSessionModel.updateMany({ isEnded: false }, { $set: { isEnded: true } });

      // Start new session
      const deck = shuffleDeck(getDeck());
      const mainCard = deck.pop();
      const startTime = new Date();
      const endTime = new Date(startTime.getTime() + 30000); // 30s

      const gameSession = new AndarBaharSessionModel({
        mainCard,
        startTime,
        endTime,
        duration: 30,
        isEnded: false,
      });

      await gameSession.save();
      this.currentSession = gameSession;
      this.betCurrentSession = gameSession;
      this.isSessionActiveFlag = true;

      console.log(`[AndarBahar] Session started: ${gameSession._id}`);

      this.io.emit("andarBahar:sessionStarted", {
        sessionId: gameSession._id,
        matchCard: mainCard,
        startTime,
        endTime,
      });

      // End session after 30s

      setTimeout(async () => {
        try {
          const drawDeck = shuffleDeck(getDeck());
          let otherCards = [];
          let matchCard = null;
          let matchIndex = 0;
          let side = "Andar";

          // Get game setting
          const gameSetting = await GameSetting.findOne({ game: "andar-bahar" });
          const mode = gameSetting?.value || "automatic";

          // Fetch bets
          const bets = await Bet.find({ gameSessionId: gameSession._id });
          let andarAmount = 0;
          let baharAmount = 0;

          bets.forEach(bet => {
            if (bet.side.toLowerCase() === "andar") andarAmount += bet.amount;
            else if (bet.side.toLowerCase() === "bahar") baharAmount += bet.amount;
          });

          console.log("amounr =>", andarAmount, baharAmount)

          const isManual = mode === "manual";
          const bothZero = andarAmount === 0 && baharAmount === 0;
          const equal = andarAmount === baharAmount;

          const useManualLogic = isManual && !bothZero && !equal;
          const preferredSide = useManualLogic
            ? (andarAmount < baharAmount ? "Andar" : "Bahar")
            : null;

          let drawIndex = 0;

          for (const card of drawDeck) {
            drawIndex++;

            if (card.value === mainCard.value) {
              // Check if we should skip this match in manual mode
              if (useManualLogic && side !== preferredSide) {
                continue; // skip match, don't flip side
              }

              matchCard = card;
              matchIndex = drawIndex;
              break;
            }

            otherCards.push({ ...card, side });
            side = side === "Andar" ? "Bahar" : "Andar";
          }

          // Assign match card to proper side
          side = otherCards.length % 2 === 0 ? "Andar" : "Bahar";
          otherCards.push({ ...matchCard, side });

          await AndarBaharSessionModel.findByIdAndUpdate(gameSession._id, {
            $set: {
              matchCard,
              matchIndex,
              side,
              otherCards,
              isEnded: true,
            },
          });

          // Payouts
          const winners = [];

          for (const bet of bets) {
            const isWinner = bet.side.toLowerCase() === side.toLowerCase();
            const user = await User.findById(bet.userId);

            if (!user) continue;

            if (isWinner) {
              const amountWon = +(bet.amount * 1.9).toFixed(2); // ✅ fixed
              const walletBefore = user.balance;

              bet.isWinner = true;
              bet.amountWon = amountWon;
              await bet.save();

              user.availableBalance += amountWon;
              user.balance += amountWon;
              await user.save();

              await logStatement({
                userId: user._id,
                type: "win",
                amount: amountWon,
                walletBefore,
                walletAfter: user.balance,
                gameId: 'andarBahar',
                card: bet.side,
                description: `Won ₹${amountWon} on ${bet.side}`,
              });

              winners.push({ userId: user._id, amountWon });
            } else {
              bet.isWinner = false;
              bet.amountWon = 0; // ✅ Force it to 0
              await bet.save();
            }
          }

          console.log(`[AndarBahar] Session ended: ${gameSession._id}`);

          this.io.emit("andarBahar:sessionEnded", {
            matchCard: { ...matchCard, side },
            matchIndex,
            side,
            otherCards,
          });

          // Delay for showing card animation
          const extraDelay = otherCards.length * 1300;

          setTimeout(() => {
            this.io.sockets.sockets.forEach((socket) => {
              const userId = socket.userId;
              if (!userId) return;

              const userBets = bets.filter(b => b.userId.toString() === userId);
              if (userBets.length === 0) return;

              let totalWon = 0;
              let isWinner = false;

              for (const bet of userBets) {
                if (bet.side.toLowerCase() === side.toLowerCase()) {
                  isWinner = true;
                  totalWon += +(bet.amount * 1.9).toFixed(2); // ✅ fixed
                }
              }

              socket.emit("andarBahar:yourResult", {
                isWinner,
                amountWon: totalWon,
                side,
                matchCard: { ...matchCard, side },
              });
            });
          }, extraDelay);

          // Save last session
          this.lastSession = {
            _id: gameSession._id,
            mainCard,
            startTime,
            endTime,
            otherCards,
            side
          };

          // Reset state
          this.currentSession = null;
          setTimeout(() => {
            this.isSessionActiveFlag = false;
            this.betCurrentSession = null;
          }, extraDelay);

          // Start next session
          console.log(`[AndarBahar] Starting new session after ${extraDelay + 5000}ms`);
          setTimeout(() => {
            try {
              this.runSession();
            } catch (err) {
              console.error("runSession failed to start:", err);
            }
          }, extraDelay + 10000);

        } catch (error) {
          console.error("Error during session ending:", error);
        }
      }, 30000);



    } catch (error) {
      console.error("Error running session:", error);
    }
  }

  getCurrentSession() {
    return this.betCurrentSession;
  }

  isActive() {
    return this.isSessionActiveFlag;
  }
}

module.exports = AndarBaharSession;