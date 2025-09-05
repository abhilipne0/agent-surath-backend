const DragonTigerGame = require("../../../models/dragon-tiger/session");
const { getDeck, shuffleDeck } = require("../../../utils/andar-bahar/index");
const Bet = require("../../../models/dragon-tiger/bets");
const User = require("../../../models/users");
const logStatement = require("../../../utils/logStatement");
const GameSetting = require("../../../models/settings");

class DragonTigerSession {
  // ✅ ADD THIS
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
      { game: "dragon-tiger" },
      { value: mode },
      { upsert: true }
    );
  }
  constructor(io) {
    this.io = io;
    this.currentSession = null;
    this.lastSession = null;
    this.sessionCounter = 1;
    this.isSessionActiveFlag = false;
    this.betFetchSession = false;
    this.mode = "automatic";

    this.initializeSettings(); // 👈 check or insert setting
    this.runSession(); // Start first session

    this.io.on("connection", (socket) => {
      socket.on("dragonTiger:joinSession", ({ userId }) => {
        socket.userId = userId;

        if (this.currentSession) {
          socket.emit("dragonTiger:currentSession", {
            sessionId: this.currentSession._id,
            startTime: this.currentSession.startTime.getTime?.() || this.currentSession.startTime,
            endTime: this.currentSession.endTime.getTime?.() || this.currentSession.endTime,
            sessionEnded: this.currentSession.isEnded,
            dragonCard: this.currentSession.dragonCard || null,
            tigerCard: this.currentSession.tigerCard || null,
            winner: this.currentSession.winner || null,
          });
        } else {
          socket.emit("dragonTiger:currentSession", {
            error: "No active session available"
          });
        }
      });
    });
  }

  async initializeSettings() {
    try {
      const existing = await GameSetting.findOne({ game: "dragon-tiger" });

      if (!existing) {
        const newSetting = new GameSetting({
          game: "dragon-tiger",
          key: "sessionModeb",
          value: "automatic"
        });
        await newSetting.save();
        console.log("Initialized default setting for dragon-tiger game.");
      } else {
        console.log("Setting for dragon-tiger already exists.");
      }

      this.mode = existing?.value || "automatic";
    } catch (error) {
      console.error("Failed to initialize dragon-tiger setting:", error);
      this.mode = "automatic"; // fallback
    }
  }

  async runSession() {
    try {
      // Mark any previous session as ended
      await DragonTigerGame.updateMany({ isEnded: false }, { isEnded: true });

      const startTime = new Date();
      const endTime = new Date(startTime.getTime() + 30000); // 30s session

      const session = new DragonTigerGame({
        startTime,
        endTime,
        duration: 30,
        isEnded: false,
        dragonCard: null,
        tigerCard: null,
        winner: null,
      });

      await session.save();
      this.currentSession = session;
      this.isSessionActiveFlag = true;
      this.betFetchSession = true;

      this.io.emit("dragonTiger:sessionStarted", { startTime, endTime });

      setTimeout(() => this.endSession(session), 30000);
    } catch (err) {
      console.error("Error starting Dragon Tiger session:", err);
    }
  }

  async endSession(session) {
    try {

      // ⏫ Fetch latest game setting each time
      const setting = await GameSetting.findOne({ game: "dragon-tiger" });
      this.mode = setting?.value || "automatic";


      const bets = await Bet.find({ gameSessionId: session._id });
      const deck = shuffleDeck(getDeck());

      let dragonCard, tigerCard, winner;

      if (this.mode === "manual") {
        let dragonTotal = 0, tigerTotal = 0;
        for (const bet of bets) {
          const side = bet.side.toLowerCase();
          if (side === "dragon") dragonTotal += bet.amount;
          if (side === "tiger") tigerTotal += bet.amount;
        }

        const hasBets = dragonTotal > 0 || tigerTotal > 0;

        let c1 = deck.pop();
        let c2 = deck.pop();

        const order = {
          A: 1, "2": 2, "3": 3, "4": 4, "5": 5,
          "6": 6, "7": 7, "8": 8, "9": 9,
          "10": 10, J: 11, Q: 12, K: 13
        };

        const v1 = order[c1.value];
        const v2 = order[c2.value];

        if (hasBets && dragonTotal !== tigerTotal) {
          const targetWinner = dragonTotal < tigerTotal ? "Dragon" : "Tiger";

          // ✅ If cards are equal → must be Tie (cannot force)
          if (v1 === v2) {
            winner = "Tie";
          } else {
            // ✅ Swap to force result to target winner
            if (targetWinner === "Dragon" && v1 <= v2) [c1, c2] = [c2, c1];
            if (targetWinner === "Tiger" && v2 <= v1) [c1, c2] = [c2, c1];
            winner = targetWinner;
          }
        } else {
          // ✅ Normal rule if no bets or equal bets
          winner = this.getWinner(c1, c2);
        }

        dragonCard = c1;
        tigerCard = c2;
      } else {
        // ✅ Automatic mode: normal random cards
        dragonCard = deck.pop();
        tigerCard = deck.pop();
        winner = this.getWinner(dragonCard, tigerCard);
      }

      // Save session result
      await DragonTigerGame.findByIdAndUpdate(session._id, {
        isEnded: true,
        dragonCard,
        tigerCard,
        winner,
      });

      this.currentSession = {
        ...this.currentSession.toObject(),
        isEnded: true,
        dragonCard,
        tigerCard,
        winner,
      };

      // Process winners
      for (const bet of bets) {
        const user = await User.findById(bet.userId);
        const isWinner = bet.side.toLowerCase() === winner.toLowerCase();

        if (isWinner) {
          const winMultiplier = winner.toLowerCase() === "tie" ? 5 : 1.9;
          const amountWon = +(bet.amount * winMultiplier).toFixed(2); // ✅ FIXED FLOATING ISSUE
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
            gameId: "DragonTiger",
            card: bet.side,
            description: `Won ₹${amountWon} on ${bet.side}`,
          });
        } else {
          bet.isWinner = false;
          bet.amountWon = 0; // ✅ Force it to 0
          await bet.save();
        }
      }

      // Emit result to users
      for (const [_, socket] of this.io.sockets.sockets) {
        const userId = socket.userId;
        const userBets = bets.filter(b => b.userId.toString() === userId);
        let totalWon = 0;
        let isWinner = false;

        for (const bet of userBets) {
          if (bet.side.toLowerCase() === winner.toLowerCase()) {
            isWinner = true;
            const winMultiplier = winner.toLowerCase() === "tie" ? 5 : 1.9;
            totalWon += +(bet.amount * winMultiplier).toFixed(2); // ✅ FIXED FLOATING ISSUE
          }
        }

        socket.emit("dragonTiger:sessionEnded", {
          winner,
          dragonCard,
          tigerCard,
          userResult: userBets.length > 0
            ? { isWinner, amountWon: totalWon }
            : null
        });
      }

      this.lastSession = this.currentSession;
      this.isSessionActiveFlag = false;

      setTimeout(() => {
        this.betFetchSession = true;
        this.currentSession = null;
      }, 4000);

      setTimeout(() => this.runSession(), 10000);
    } catch (err) {
      console.error("Error ending Dragon Tiger session:", err);
    }
  }


  getCurrentSession() {
    return this.currentSession;
  }

  isActive() {
    return this.isSessionActiveFlag;
  }

  fetchBetSession() {
    return this.betFetchSession;
  }

  getWinner(dragonCard, tigerCard) {
    const order = {
      A: 1, "2": 2, "3": 3, "4": 4, "5": 5,
      "6": 6, "7": 7, "8": 8, "9": 9,
      "10": 10, J: 11, Q: 12, K: 13
    };

    const d = order[dragonCard.value];
    const t = order[tigerCard.value];

    if (d > t) return "Dragon";
    if (t > d) return "Tiger";
    return "Tie";
  }
}

module.exports = DragonTigerSession;
