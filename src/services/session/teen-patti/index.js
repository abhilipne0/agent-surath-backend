const TeenPattiGame = require("../../../models/teenpatti/session");
const Bet = require("../../../models/teenpatti/bets");
const User = require("../../../models/users");
const logStatement = require("../../../utils/logStatement");
const GameSetting = require("../../../models/settings");
const { getDeck, shuffleDeck } = require("../../../utils/andar-bahar");

class TeenPattiSession {
    setMode(mode) {
        if (["automatic", "manual"].includes(mode)) {
            this.mode = mode;
        } else {
            throw new Error("Invalid mode");
        }
    }

    async updateModeInDB(mode) {
        await GameSetting.findOneAndUpdate(
            { game: "teen-patti" },
            { value: mode },
            { upsert: true }
        );
    }

    constructor(io) {
        this.io = io;
        this.currentSession = null;
        this.lastSession = null;
        this.isSessionActiveFlag = false;
        this.betFetchSession = false;
        this.mode = "automatic";

        this.initializeSettings();
        this.runSession();

        this.io.on("connection", (socket) => {
            socket.on("teenPatti:joinSession", ({ userId }) => {
                socket.userId = userId;

                if (this.currentSession) {
                    socket.emit("teenPatti:currentSession", {
                        sessionId: this.currentSession._id,
                        startTime: this.currentSession.startTime.getTime?.() || this.currentSession.startTime,
                        endTime: this.currentSession.endTime.getTime?.() || this.currentSession.endTime,
                        sessionEnded: this.currentSession.isEnded,
                        playerCards: this.currentSession.playerCards || null,
                        winner: this.currentSession.winner || null,
                    });
                } else {
                    socket.emit("teenPatti:currentSession", { error: "No active session available" });
                }
            });
        });
    }

    async initializeSettings() {
        try {
            const existing = await GameSetting.findOne({ game: "teen-patti" });
            if (!existing) {
                const newSetting = new GameSetting({
                    game: "teen-patti",
                    key: "sessionMode",
                    value: "automatic"
                });
                await newSetting.save();
                console.log("Initialized default setting for Teen Patti game.");
            } else {
                console.log("Setting for Teen Patti already exists.");
                this.mode = existing?.value || "automatic";
            }
        } catch (error) {
            console.error("Failed to initialize Teen Patti setting:", error);
            this.mode = "automatic";
        }
    }

    async runSession() {
        try {
            // End previous un-ended sessions
            await TeenPattiGame.updateMany({ isEnded: false }, { isEnded: true });

            const startTime = new Date();
            const duration = 30; // 30 seconds
            const endTime = new Date(startTime.getTime() + duration * 1000);

            const session = new TeenPattiGame({
                startTime,
                endTime,
                duration,
                isEnded: false,
                playerCards: [],
                winner: null,
            });

            await session.save();
            this.currentSession = session;
            this.isSessionActiveFlag = true;
            this.betFetchSession = true;

            this.io.emit("teenPatti:sessionStarted", { startTime, endTime });

            // Start next session slightly before this ends for continuous flow
            setTimeout(() => this.runSession(), (duration - 5) * 1000); // 5s overlap
            setTimeout(() => this.endSession(session), duration * 1000);
        } catch (err) {
            console.error("Error starting Teen Patti session:", err);
        }
    }

    async endSession(session) {
        try {
            const setting = await GameSetting.findOne({ game: "teen-patti" });
            this.mode = setting?.value || "automatic";

            const bets = await Bet.find({ gameSessionId: session._id });
            const deck = shuffleDeck(getDeck());

            let player1Cards, player2Cards, winner;

            if (this.mode === "manual") {
                let player1Total = 0, player2Total = 0;
                for (const bet of bets) {
                    if (bet.player === 1) player1Total += bet.amount;
                    if (bet.player === 2) player2Total += bet.amount;
                }

                const c1 = deck.splice(0, 3);
                const c2 = deck.splice(0, 3);

                if (player1Total !== player2Total) {
                    winner = player1Total > player2Total ? 1 : 2;
                } else {
                    winner = this.getWinner(c1, c2);
                }

                player1Cards = c1;
                player2Cards = c2;
            } else {
                player1Cards = deck.splice(0, 3);
                player2Cards = deck.splice(0, 3);
                winner = this.getWinner(player1Cards, player2Cards);
            }

            await TeenPattiGame.findByIdAndUpdate(session._id, {
                isEnded: true,
                playerCards: [player1Cards, player2Cards],
                winner,
            });

            this.currentSession = { ...this.currentSession.toObject(), isEnded: true, playerCards: [player1Cards, player2Cards], winner };

            // Process bets
            for (const bet of bets) {
                const user = await User.findById(bet.userId);
                const isWinner = bet.player === winner;

                if (isWinner) {
                    const amountWon = +(bet.amount * 2).toFixed(2);
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
                        gameId: "TeenPatti",
                        card: bet.player,
                        description: `Won ₹${amountWon} on Player ${bet.player}`,
                    });
                } else {
                    bet.isWinner = false;
                    bet.amountWon = 0;
                    await bet.save();
                }
            }

            // Emit results
            for (const [_, socket] of this.io.sockets.sockets) {
                const userId = socket.userId;
                const userBets = bets.filter(b => b.userId.toString() === userId);
                let totalWon = 0;
                let isWinner = false;

                for (const bet of userBets) {
                    if (bet.player === winner) {
                        isWinner = true;
                        totalWon += +(bet.amount * 2).toFixed(2);
                    }
                }

                socket.emit("teenPatti:sessionEnded", {
                    winner,
                    playerCards: [player1Cards, player2Cards],
                    userResult: userBets.length > 0 ? { isWinner, amountWon: totalWon } : null
                });
            }

            this.lastSession = this.currentSession;
            this.isSessionActiveFlag = false;

            setTimeout(() => {
                this.betFetchSession = true;
                this.currentSession = null;
            }, 4000);

        } catch (err) {
            console.error("Error ending Teen Patti session:", err);
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

    getWinner(cards1, cards2) {
        // Simple sum of card values (placeholder for Teen Patti ranking)
        const order = { A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13 };
        const sum = (cards) => cards.reduce((acc, c) => acc + order[c.value], 0);
        const s1 = sum(cards1);
        const s2 = sum(cards2);
        if (s1 > s2) return 1;
        if (s2 > s1) return 2;
        return Math.random() > 0.5 ? 1 : 2;
    }
}

module.exports = TeenPattiSession;
