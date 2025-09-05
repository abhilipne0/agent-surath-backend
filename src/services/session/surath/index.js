const GameSession = require("../../../models/game");
const Bet = require("../../../models/bets");
const User = require("../../../models/users");
const BankDetails = require("../../../models/bankAccounts");
const Setting = require("../../../models/settings");
const mongoose = require("mongoose");
const logStatement = require("../../../utils/logStatement");

class SessionManager {
  constructor(io) {
    this.io = io;
    this.currentSession = null;
    this.sessionInterval = 60000; // 1 minite
    this.cooldownInterval = 5000; // 5 seconds
    this.isSessionActive = false;
    this.mode = "automatic"; // Default mode
    this.init();
  }
  async init() {
    try {
      await this.loadModeFromDB();
      // Start the first session immediately
      await this.startSession();
      // Await the loop (this will block the rest of init)
      await this.scheduleNextSession();
    } catch (error) {
      console.error("Error during initialization:", error);
    }
  }

  /**
   * Dynamically update the session mode during an active session.
   * @param {String} mode - The new mode ('automatic' or 'manual').
   */
  async setMode(mode) {
    if (!["automatic", "manual"].includes(mode)) {
      throw new Error(
        "Invalid mode. Allowed values are 'automatic' or 'manual'."
      );
    }

    if (this.isSessionTransitioning) {
      console.warn(
        "Session transition in progress. Mode change will not be applied immediately."
      );
      return;
    }

    this.mode = mode;
    await this.updateModeInDB(mode);

    this.io.emit("modeChanged", {
      mode: this.mode,
      message: `Session mode has been updated to ${this.mode}.`,
    });

    // Handle immediate actions based on mode
    if (this.mode === "automatic" && this.isSessionActive) {
      // Schedule automatic ending if not already
      const remainingTime = this.currentSession.endTime - Date.now();
      if (remainingTime > 0) {
        setTimeout(() => this.endSession(), remainingTime);
      }
    }
  }

  /**
   * Load the current mode from the Settings collection.
   */
  async loadModeFromDB(game = "surath") {
    try {
      let setting = await Setting.findOne({ game, key: "sessionMode" });
      if (!setting) {
        setting = new Setting({ game, key: "sessionMode", value: "automatic" });
        await setting.save();
      }

      this.mode = setting.value;
      console.log(`Session Mode Loaded for ${game}: ${this.mode}`);
    } catch (error) {
      console.error(`Error loading session mode for ${game}:`, error);
      this.mode = "automatic";
    }
  }

  async updateModeInDB(mode, game = "surath") {
    try {
      await Setting.findOneAndUpdate(
        { game, key: "sessionMode" },
        { value: mode },
        { new: true, upsert: true }
      );
      console.log(`Session Mode Updated for ${game}: ${mode}`);
    } catch (error) {
      console.error(`Failed to update session mode for ${game}:`, error);
      throw new Error("Failed to update session mode in the database.");
    }
  }


  /**
   * Schedule the next session based on the current mode.
   */
  async scheduleNextSession() {
    while (true) {
      try {
        if (!this.isSessionActive && !this.isSessionTransitioning) {
          await this.startSession();
        }
      } catch (error) {
        console.error("Error scheduling the next session:", error);
      }
      console.log("aaaaa =>", this.sessionInterval + this.cooldownInterval);
      await this.sleep(this.sessionInterval + this.cooldownInterval);
    }
  }

  async startSession() {
    try {
      // Mark any unfinished sessions as ended
      const result = await GameSession.updateMany(
        { isEnded: false },
        { $set: { isEnded: true } }
      );
      console.log(
        `${result.modifiedCount} unfinished sessions marked as ended.`,
        "surath"
      );
    } catch (error) {
      console.error("Error marking unfinished sessions as ended:", error);
    }
    this.isSessionActive = true;

    // Create a new game session
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + this.sessionInterval);

    const gameSession = new GameSession({
      startTime,
      endTime,
      duration: this.sessionInterval / 1000, // Duration in seconds
      isEnded: false,
      mode: this.mode,
    });

    try {
      await gameSession.save();
      this.currentSession = gameSession;

      // Notify all clients that a new session has started
      this.io.emit("sessionStarted", {
        sessionId: gameSession._id,
        startTime: gameSession.startTime,
        endTime: gameSession.endTime,
        own: this.mode === "automatic" ? "A" : "S",
        message: "A new betting session has started.",
      });

      // Schedule the session to end automatically if in automatic mode
      if (this.mode === "automatic") {
        // Schedule the end of the session
        setTimeout(() => {
          this.endSession();
        }, this.sessionInterval);
      }
    } catch (error) {
      console.error("Error starting a new session:", error);
      this.isSessionActive = false; // Reset the flag in case of error
    }
  }

  async endSession(manualWinningCard = null) {
    // Prevent concurrent executions of endSession
    if (this.isEndingSession) {
      console.warn("endSession is already running. Skipping this invocation.");
      return;
    }

    this.isEndingSession = true;
    if (!this.currentSession) {
      console.warn("No current session to end.");
      this.isEndingSession = false;
      return;
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      if (this.mode === "manual" && !manualWinningCard) {
        throw new Error("Manual mode requires a winning card.");
      }

      // Set session ended flag
      this.currentSession.isEnded = true;

      // Determine the winner
      let winningCard;
      if (manualWinningCard) {
        // Validate the manualWinningCard
        const possibleCards = this.determinePossibleCards();
        if (!possibleCards.includes(manualWinningCard)) {
          throw new Error("Invalid manual winning card.");
        }
        winningCard = manualWinningCard;
      } else {
        winningCard = await this.determineWinner();
      }

      if (!winningCard) {
        throw new Error("Could not determine winning card.");
      }

      this.currentSession.result = winningCard;

      // Fetch all bets for the current session
      const bets = await Bet.find({ gameSessionId: this.currentSession._id }).session(session);
      const winners = [];

      for (const bet of bets) {
        if (bet.card === winningCard) {
          const amountWon = bet.amount * 9;

          bet.isWinner = true;
          bet.amountWon = amountWon;
          await bet.save({ session });

          // Update bank details
          const bankDetails = await BankDetails.findOne({ userId: bet.userId }).session(session);
          if (bankDetails) {
            bankDetails.totalDeposit += amountWon;
            bankDetails.totalMoneyDeposited += amountWon;
            await bankDetails.save({ session });
          }

          // Update user balance
          const user = await User.findById(bet.userId).session(session);
          if (user) {
            const walletBefore = user.balance;
            user.availableBalance += amountWon;
            user.balance += amountWon;
            await user.save({ session });

            winners.push({ userId: user._id, amountWon });

            // ✅ Log the winning statement
            await logStatement({
              userId: user._id,
              type: "win",
              amount: amountWon,
              walletBefore,
              walletAfter: user.balance,
              gameId: "Sorath",
              card: bet.card,
              description: `Won ₹${amountWon} on card ${bet.card}`,
            });
          } else {
            console.warn(`User with ID ${bet.userId} not found.`);
          }

        } else {
          bet.isWinner = false;
          await bet.save({ session });
        }
      }

      this.currentSession.winners = winners;
      await this.currentSession.save({ session });

      await session.commitTransaction();
      session.endSession();

      // Notify all clients only after everything is successful
      const sessionCount = await GameSession.countDocuments({ isEnded: true });
      const remainder = sessionCount % 50;

      this.io.emit("sessionEnded", {
        sessionId: this.currentSession._id,
        winningCard,
        winners,
        sessionRemainder: remainder,
        message: "The betting session has ended.",
      });

      this.isSessionActive = false;
      this.currentSession = null;

    } catch (err) {
      console.error("❌ Error ending session:", err);
      await session.abortTransaction();
      session.endSession();

      // You could also log the failure to a database for retry/alert
    } finally {
      this.isEndingSession = false;
    }
  }

  /**
   * Manually draw the result by specifying the winning card.
   * Only available in manual mode.
   * @param {String} winningCard - The card selected by the admin as the winner.
   */
  async manualDrawResult(winningCard) {
    if (this.mode !== "manual") {
      throw new Error("Manual drawing is only allowed in manual mode.");
    }
    if (!this.isSessionActive) {
      throw new Error("No active session to draw the result.");
    }
    // End the current session with the specified winning card
    await this.endSession(winningCard);

    // Start the next session
    console.log("Starting a new session after manual result draw...");
    await this.startSession();
  }

  /**
   * Determine the winning card automatically.
   * @returns {String} - The winning card.
   */
  determineWinner() {
    // Example logic: randomly select a card from the possible cards
    const possibleCards = this.determinePossibleCards();
    const randomIndex = Math.floor(Math.random() * possibleCards.length);
    return possibleCards[randomIndex];
  }

  /**
   * Define the possible cards for the game.
   * @returns {Array} - An array of possible card strings.
   */
  determinePossibleCards() {
    return [
      "UMBRELLA",
      "FOOTBALL",
      "SUN",
      "OIL_LAMP",
      "COW",
      "BUCKET",
      "KITE",
      "SPINNER",
      "ROSE",
      "BUTTERFLY",
      "HOPE",
      "RABBIT",
    ];
  }

  /**
   * Get the current session.
   * @returns {Object|null} - The current game session or null.
   */
  getCurrentSession() {
    return this.currentSession;
  }

  /**
   * Check if a session is active.
   * @returns {Boolean} - True if a session is active, else false.
   */
  isActive() {
    return this.isSessionActive;
  }

  /**
   * Sleep for the specified milliseconds.
   * @param {Number} ms - Milliseconds to sleep.
   * @returns {Promise}
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Wait for manual draw to be triggered.
   * This function resolves when manualDrawResult is called.
   * @returns {Promise}
   */
  async waitForManualDraw() {
    await this.sleep(5000); // Wait for 5 seconds more after result
    return new Promise((resolve) => {
      this.resolveManualDraw = resolve;
    });
  }
}

module.exports = SessionManager;
