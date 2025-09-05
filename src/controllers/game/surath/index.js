const GameSession = require("../../../models/game");
const User = require("../../../models/users");
const SessionManager = require("../../../services/session/surath");
// const BankDetails = require("../../models/bankAccounts");
const Bet = require("../../../models/bets"); // Import the Bet model
const logStatement = require("../../../utils/logStatement");
const { InternalServerError } = require("../../../utils/errorHandler");

/**
 * Function to place a bet in the current session.
 */
const placeBet = async (req, res) => {
  try {
    const { userId, card, amount } = req.body;

    if (!card || amount <= 0) {
      return res.status(400).json({
        status: false,
        message: "Card and positive amount are required to place a bet.",
      });
    }

    // Check if the bet amount is greater than ₹10
    if (amount < 10) {
      return res.status(400).json({
        status: false,
        message: "Bet amount must be greater than ₹10.",
      });
    }

    // Access the session manager from the app
    const sessionManager = req.app.get("sessionManager");

    if (!sessionManager.isActive()) {
      return res.status(400).json({
        status: false,
        message: "No active betting session. Please wait for the next session.",
      });
    }

    const currentSession = sessionManager.getCurrentSession();
    if (!currentSession) {
      return res.status(400).json({
        status: false,
        message: "No active betting session. Please wait for the next session.",
      });
    }

    // Run the queries in parallel
    const [gameSession, user, existingBet] = await Promise.all([
      GameSession.findById(currentSession._id),
      User.findById(userId),
      Bet.findOne({
        gameSessionId: currentSession._id,
        userId,
        card,
      }),
    ]);

    if (!gameSession || !user) {
      return res.status(404).json({
        status: false,
        message: !gameSession ? "Current session not found." : "User not found.",
      });
    }

    // Check if betting time is over
    if (new Date() > gameSession.endTime) {
      return res.status(400).json({ status: false, message: "Betting time is over." });
    }

    // Deduct balance
    const walletBefore = user.balance;
    try {
      await user.deductBalance(amount);
    } catch (deductionError) {
      return res.status(400).json({
        status: false,
        message: deductionError.message || "Insufficient balance to place the bet.",
      });
    }
    const walletAfter = walletBefore - amount;

    // Prepare bulk write operations
    const bulkOps = [];

    // Check if bet exists and update or create it
    if (existingBet) {
      bulkOps.push({
        updateOne: {
          filter: { _id: existingBet._id },
          update: { $inc: { amount: amount }, $set: { betCreatedAt: new Date() } },
        },
      });
    } else {
      bulkOps.push({
        insertOne: {
          document: {
            gameSessionId: gameSession._id,
            userId,
            card,
            amount,
            betCreatedAt: new Date(),
          },
        },
      });
    }

    // Execute bulk operations
    await Bet.bulkWrite(bulkOps);

    // Log the bet in account statement
    await logStatement({
      userId,
      type: "bet",
      amount,
      walletBefore,
      walletAfter,
      gameId: gameSession._id,
      card,
      description: `Placed bet of ₹${amount} on ${card}`,
    });

    const openBets = await Bet.find({
      gameSessionId: gameSession._id,
      userId: userId,
    }).select("amount card -_id");

    res.status(200).json({
      status: true,
      message: "Bet placed successfully.",
      openBets,
    });
  } catch (error) {
    console.error("Error placing bet:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error.",
    });
  }
};



// get all bets

const getBets = async (req, res) => {
  try {
    const { userId } = req.body;

    // Access the session manager from the app
    const sessionManager = req.app.get("sessionManager");

    // Check if a session is active
    if (!sessionManager.isActive()) {
      return res.status(400).json({
        status: false,
        message: "No active betting session. Please wait for the next session.",
      });
    }

    const currentSession = sessionManager.getCurrentSession();

    if (!currentSession) {
      return res.status(400).json({
        status: false,
        message: "No active betting session. Please wait for the next session.",
      });
    }

    const openBets = await Bet.find({
      gameSessionId: currentSession._id,
      userId: userId,
    }).select("amount card -_id");

    res.status(200).json({
      status: true,
      message: "Current session bets fetched successfully.",
      openBets: openBets,
    });
  } catch (error) {
    console.error("Error fetching bets:", error);
    InternalServerError(res, error);
  }
};

// get last 15 session result

const getLastResults = async (req, res) => {
  try {
    // Find the last 15 past sessions that have ended and contain a result
    const pastSessions = await GameSession.find({
      isEnded: true,
      result: { $exists: true, $ne: null }, // Ensure the session has a result
    })
      .sort({ endTime: -1 }) // Sort by end time, latest first
      .limit(2) // Limit to the last 15 sessions
      .select("result _id"); // Select only the result and _id fields

    if (!pastSessions || pastSessions.length === 0) {
      return res.status(404).json({
        status: false,
        message: "No past sessions found.",
      });
    }

    // Modify the response to remove the extra "id" field
    const formattedResults = pastSessions.map((session) => ({
      SessionId: session._id, // Keep only _id
      result: session.result, // Keep only result
    }));

    // Directly send pastSessions in response
    res.status(200).json({
      status: true,
      message: "Past session results fetched successfully.",
      results: formattedResults, // Array of objects with _id and result directly from query
    });
  } catch (error) {
    console.error("Error fetching past session results:", error);
    res.status(500).json({ status: false, message: "Internal server error." });
  }
};

/**
 * Retrieves the current session status.
 */
const getCurrentSession = async (req, res) => {
  try {
    const sessionManager = req.app.get("sessionManager");
    const currentSession = sessionManager.getCurrentSession();
    const isActive = sessionManager.isActive();

    const sessionCount = await GameSession.countDocuments({ isEnded: true }); // Fetch total session count
    const remainder = sessionCount % 50;

    if (currentSession) {
      res.status(200).json({
        status: true,
        data: {
          sessionRemainder: remainder,
          sessionId: currentSession._id,
          startTime: currentSession.startTime,
          endTime: currentSession.endTime,
          own: currentSession.mode === 'automatic' ? 'A' : 'S',
          isActive,
        },
      });
    } else {
      res.status(200).json({
        status: true,
        data: {
          sessionRemainder: remainder,
          message: "No active session at the moment.",
        },
      });
    }
  } catch (error) {
    console.error("Error fetching current session:", error);
    res.status(500).json({
      status: false,
      message: "Failed to retrieve current session.",
    });
  }
};

const getSessionBets = async (req, res) => {
  try {
    const { gameSessionId } = req.body;

    if (!gameSessionId) {
      return res.status(400).json({
        status: false,
        message: "gameSessionId is required.",
      });
    }

    // Get current date in Indian timezone (IST)
    const istNow = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
    const istDate = new Date(istNow.getTime() + istOffset);

    // Get start and end of today in IST
    const startOfTodayIST = new Date(istDate);
    startOfTodayIST.setHours(0, 0, 0, 0);

    const endOfTodayIST = new Date(istDate);
    endOfTodayIST.setHours(23, 59, 59, 999);

    // Convert IST times back to UTC for MongoDB query
    const startOfTodayUTC = new Date(startOfTodayIST.getTime() - istOffset);
    const endOfTodayUTC = new Date(endOfTodayIST.getTime() - istOffset);

    // Fetch all bets for the given session (existing functionality)
    const bets = await Bet.find({ gameSessionId })
      .select("card amount betCreatedAt isWinner -_id"); // Added betCreatedAt and isWinner for calculations

    // Fetch all today's bets (regardless of session)
    const todaysBets = await Bet.find({
      betCreatedAt: {
        $gte: startOfTodayUTC,
        $lte: endOfTodayUTC
      }
    }).select("card amount isWinner -_id");

    // Process session bets (existing functionality)
    let consolidatedBets = [];
    if (bets && bets.length > 0) {
      const consolidatedBetsObj = bets.reduce((acc, bet) => {
        if (acc[bet.card]) {
          acc[bet.card] += bet.amount;
        } else {
          acc[bet.card] = bet.amount;
        }
        return acc;
      }, {});

      consolidatedBets = Object.keys(consolidatedBetsObj).map((card) => ({
        card,
        amount: consolidatedBetsObj[card],
      }));
    }

    // Process today's bets
    let todaysConsolidatedBets = [];
    let todaysTotalAmount = 0;
    let todaysTotalWinningAmount = 0; // New - total winning amount

    if (todaysBets && todaysBets.length > 0) {
      const todaysConsolidatedBetsObj = todaysBets.reduce((acc, bet) => {
        todaysTotalAmount += bet.amount; // Calculate total amount

        // Calculate winning amount (amount * 9) only for winners
        if (bet.isWinner) {
          todaysTotalWinningAmount += bet.amount * 9;
        }

        if (acc[bet.card]) {
          acc[bet.card] += bet.amount;
        } else {
          acc[bet.card] = bet.amount;
        }
        return acc;
      }, {});

      todaysConsolidatedBets = Object.keys(todaysConsolidatedBetsObj).map((card) => ({
        card,
        amount: todaysConsolidatedBetsObj[card],
      }));
    }

    // Always return response with all data (even if session bets are empty)
    res.status(200).json({
      status: true,
      message: bets && bets.length > 0 ? "Bets consolidated successfully." : "No session bets found, but today's data included.",
      bets: consolidatedBets, // Existing functionality - all bets for the session
      todaysBets: todaysConsolidatedBets, // New - today's consolidated bets
      todaysTotalAmount: todaysTotalAmount, // New - sum of all today's bet amounts
      todaysTotalWinningAmount: todaysTotalWinningAmount, // New - sum of winning amounts (amount * 9) for isWinner = true
      todaysDate: istDate.toISOString().split('T')[0], // Today's date in IST for reference
    });

  } catch (error) {
    console.error("Error fetching session bets:", error);
    res.status(500).json({
      status: false,
      message: "Failed to retrieve session bets.",
    });
  }
};

const getAllGameSessions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1; // default page 1
    const limit = parseInt(req.query.limit) || 10; // default 10 items per page
    const sessionIdQuery = req.query.sessionId;

    const filter = {};

    // If sessionId is passed in query, validate and filter by it
    if (sessionIdQuery) {
      if (!mongoose.Types.ObjectId.isValid(sessionIdQuery)) {
        return res.status(400).json({
          success: false,
          message: "Invalid sessionId format",
        });
      }
      filter._id = sessionIdQuery;
    }

    const totalCount = await GameSession.countDocuments(filter);

    const sessions = await GameSession.find(filter)
      .sort({ startTime: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const sessionStats = await Promise.all(
      sessions.map(async (session) => {
        const bets = await Bet.find({ gameSessionId: session._id });

        const totalBetAmount = bets.reduce((sum, bet) => sum + bet.amount, 0);
        const totalWinningAmount = bets
          .filter((bet) => bet.isWinner)
          .reduce((sum, bet) => sum + bet.amountWon, 0);

        return {
          _id: session._id,
          startTime: session.startTime,
          endTime: session.endTime,
          duration: session.duration,
          result: session.result,
          isEnded: session.isEnded,
          totalBets: bets.length,
          totalBetAmount,
          totalWinningAmount,
        };
      })
    );

    res.status(200).json({
      success: true,
      message: "Game sessions fetched successfully",
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit),
      totalSessions: totalCount,
      data: sessionStats,
    });
  } catch (error) {
    console.error("Error fetching sessions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch sessions",
      error: error.message,
    });
  }
};

module.exports = { placeBet, getCurrentSession, getBets, getLastResults, getSessionBets, getAllGameSessions };
