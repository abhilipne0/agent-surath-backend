const Bet = require('../../../models/dragon-tiger/bets');
const GameSession = require('../../../models/dragon-tiger/session');
const User = require('../../../models/users');
const Setting = require('../../../models/settings');
const { InternalServerError } = require('../../../utils/errorHandler');
const logStatement = require('../../../utils/logStatement');
const moment = require("moment-timezone");
const mongoose = require('mongoose');

const placeDragonTigerBet = async (req, res) => {
  try {
    const { userId, side, amount } = req.body;

    if (!side || amount <= 0) {
      return res.status(400).json({
        status: false,
        message: "Side (Dragon Tiger) and a positive amount are required.",
      });
    }

    if (!['dragon', 'tiger', 'tie'].includes(side)) {
      return res.status(400).json({
        status: false,
        message: "Invalid bet side. Must be 'dragon', 'tiger', 'tie'.",
      });
    }

    if (amount < 10) {
      return res.status(400).json({
        status: false,
        message: "Minimum bet amount is ₹10.",
      });
    }

    const sessionManager = req.app.get("DragonTigerSession");
    if (!sessionManager || !sessionManager.isActive()) {
      return res.status(400).json({
        status: false,
        message: "No active Dragon Tiger session. Please wait for the next round.",
      });
    }

    const currentSession = sessionManager.getCurrentSession();
    if (!currentSession) {
      return res.status(400).json({
        status: false,
        message: "No active session found. Please try again shortly.",
      });
    }

    // Parallel queries
    const [gameSession, user, existingBet] = await Promise.all([
      GameSession.findById(currentSession._id),
      User.findById(userId),
      Bet.findOne({
        gameSessionId: currentSession._id,
        userId,
        side,
      }),
    ]);

    if (!gameSession || !user) {
      return res.status(404).json({
        status: false,
        message: !gameSession ? "Game session not found." : "User not found.",
      });
    }

    if (new Date() > gameSession.endTime) {
      return res.status(400).json({
        status: false,
        message: "Betting time is over for this session.",
      });
    }

    // Deduct balance
    const walletBefore = user.balance;
    try {
      await user.deductBalance(amount);
    } catch (err) {
      return res.status(400).json({
        status: false,
        message: err.message || "Insufficient balance.",
      });
    }
    const walletAfter = walletBefore - amount;

    // ✅ FIXED: Calculate correct potential winning amount based on side
    const winMultiplier = side.toLowerCase() === "tie" ? 5 : 1.9;
    const potentialWinAmount = +(amount * winMultiplier).toFixed(2);

    const bulkOps = [];

    if (existingBet) {
      const newTotalAmount = existingBet.amount + amount;
      const newPotentialWin = +(newTotalAmount * winMultiplier).toFixed(2);

      bulkOps.push({
        updateOne: {
          filter: { _id: existingBet._id },
          update: {
            $inc: { amount: amount },
            $set: {
              amountWon: newPotentialWin, // Store potential win, not actual
              betCreatedAt: new Date()
            }
          },
        },
      });
    } else {
      bulkOps.push({
        insertOne: {
          document: {
            gameSessionId: gameSession._id,
            userId,
            side,
            amount,
            isWinner: false,
            amountWon: potentialWinAmount, // Store potential win amount
            betCreatedAt: new Date(),
          },
        },
      });
    }

    await Bet.bulkWrite(bulkOps);

    await logStatement({
      userId,
      type: "bet",
      amount,
      walletBefore,
      walletAfter,
      gameId: 'DragonTiger',
      card: side,
      description: `Placed Dragon Tiger bet of ₹${amount} on ${side}`,
    });

    const openBets = await Bet.find({
      gameSessionId: gameSession._id,
      userId,
    }).select("amount side -_id");

    res.status(200).json({
      status: true,
      message: "Bet placed successfully.",
      openBets,
    });
  } catch (error) {
    console.error("Error placing Dragon Tiger bet:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error.",
    });
  }
};

const getDragonTigerBets = async (req, res) => {
  try {
    const { userId } = req.body;

    // Access the session manager from the app
    const sessionManager = req.app.get("DragonTigerSession");

    // Check if a session is active
    if (!sessionManager.fetchBetSession()) {
      return res.status(400).json({
        status: false,
        message: "No active betting session. Please wait for the next session",
      });
    }

    const currentSession = sessionManager.getCurrentSession();

    if (!currentSession) {
      return res.status(400).json({
        status: false,
        message: "No active betting session. Please wait for the next session. getCurrentSession",
      });
    }

    const openBets = await Bet.find({
      gameSessionId: currentSession._id,
      userId: userId,
    }).select("amount side -_id");

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

const getHistory = async (req, res) => {
  try {
    const limit = 8; // 👈 Fixed limit, ignore query params

    const sessions = await GameSession.find({ isEnded: true })
      .sort({ endTime: -1 })
      .limit(limit);

    const history = sessions.map(session => ({
      sessionId: session._id,
      dragonCard: session.dragonCard,
      tigerCard: session.tigerCard,
      winner: session.winner,
      startTime: session.startTime,
      endTime: session.endTime,
    }));

    return res.status(200).json({ success: true, history });
  } catch (error) {
    console.error("Error fetching game history:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// Helper to get start and end of a given day in IST
function getISTDayRange(dateString = null) {
  const date = dateString ? moment.tz(dateString, 'Asia/Kolkata') : moment.tz('Asia/Kolkata');
  const startOfDay = date.clone().startOf('day').toDate();
  const endOfDay = date.clone().endOf('day').toDate();
  return { startOfDay, endOfDay };
}

const getDragonTigerDailyStats = async (req, res) => {
  try {
    const { date } = req.query;
    const { startOfDay, endOfDay } = getISTDayRange(date);

    const stats = await Bet.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfDay, $lte: endOfDay }
        }
      },
      {
        $group: {
          _id: null,
          // Total amount users spent (bet amount)
          totalBetAmount: { $sum: '$amount' },
          // Total amount won by users (only for winning bets)
          totalWinningAmount: {
            $sum: {
              $cond: [
                { $eq: ['$isWinner', true] },
                '$amountWon', // Use stored amountWon for winners
                0
              ]
            }
          },
          // Count of total bets
          totalBets: { $sum: 1 },
          // Count of winning bets
          winningBets: {
            $sum: {
              $cond: [{ $eq: ['$isWinner', true] }, 1, 0]
            }
          }
        }
      }
    ]);

    const result = stats[0] || {
      totalBetAmount: 0,
      totalWinningAmount: 0,
      totalBets: 0,
      winningBets: 0
    };

    // Calculate profit/loss for house
    const houseProfitLoss = result.totalBetAmount - result.totalWinningAmount;
    const winPercentage = result.totalBets > 0 ?
      ((result.winningBets / result.totalBets) * 100).toFixed(2) : 0;

    res.status(200).json({
      success: true,
      date: date || moment.tz('Asia/Kolkata').format('YYYY-MM-DD'),
      totalBetAmount: result.totalBetAmount,      // Money users spent
      totalWinningAmount: result.totalWinningAmount, // Money users won
      houseProfitLoss,                          // Positive = house profit, Negative = house loss
      totalBets: result.totalBets,
      winningBets: result.winningBets,
      winPercentage: `${winPercentage}%`
    });
  } catch (err) {
    console.error(err);
    throw new InternalServerError('Failed to fetch dragon tiger bet stats');
  }
};


const getDragonTigerSessionsWithStats = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const searchText = req.query.searchText?.trim();

    const filter = {};

    if (searchText) {
      // Only apply if it's a valid ObjectId
      if (mongoose.Types.ObjectId.isValid(searchText)) {
        filter._id = new mongoose.Types.ObjectId(searchText);
      } else {
        return res.status(400).json({ success: false, message: 'Invalid search ID' });
      }
    }

    const totalSessions = await GameSession.countDocuments(filter);

    const sessions = await GameSession.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const sessionIds = sessions.map((s) => s._id);

    const stats = await Bet.aggregate([
      {
        $match: {
          gameSessionId: { $in: sessionIds },
        },
      },
      {
        $group: {
          _id: '$gameSessionId',
          totalBetAmount: { $sum: '$amount' },
          totalWinningAmount: {
            $sum: {
              $cond: [{ $eq: ['$isWinner', true] }, '$amountWon', 0],
            }
          },
          uniqueUserIds: { $addToSet: '$userId' },
          dragonTotalAmount: {
            $sum: {
              $cond: [{ $eq: ['$side', 'dragon'] }, '$amount', 0],
            },
          },
          tigerTotalAmount: {
            $sum: {
              $cond: [{ $eq: ['$side', 'tiger'] }, '$amount', 0],
            },
          },
        },
      },
      {
        $project: {
          _id: 1,
          totalBetAmount: 1,
          totalWinningAmount: 1,
          uniqueUserCount: { $size: '$uniqueUserIds' },
          dragonTotalAmount: 1,
          tigerTotalAmount: 1,
        },
      },
    ]);

    const statsMap = {};
    stats.forEach((stat) => {
      statsMap[stat._id.toString()] = stat;
    });

    const result = sessions.map((session) => {
      const stat = statsMap[session._id.toString()] || {
        totalBetAmount: 0,
        totalWinningAmount: 0,
        uniqueUserCount: 0,
        dragonTotalAmount: 0,
        tigerTotalAmount: 0,
      };

      return {
        sessionId: session._id,
        startTime: moment(session.startTime).tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss'),
        totalBetAmount: stat.totalBetAmount,
        totalWinningAmount: stat.totalWinningAmount,
        uniqueUserCount: stat.uniqueUserCount,
        dragonTotalAmount: stat.dragonTotalAmount,
        tigerTotalAmount: stat.tigerTotalAmount,
      };
    });

    return res.status(200).json({
      success: true,
      currentPage: page,
      totalPages: Math.ceil(totalSessions / limit),
      totalSessions,
      sessions: result,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message,
    });
  }
};

const getDragonTigerSessionMode = async (req, res) => {
  try {
    const setting = await Setting.findOne({ game: "dragon-tiger", key: "sessionModeb" });
    if (!setting) {
      return res.status(404).json({
        status: false,
        message: "Session mode setting not found.",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Settings fetched successfully.",
      data: {
        sessionMode: setting.value,
      },
    });
  } catch (error) {
    console.error("Error in getDragonTigerSessionMode:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error.",
    });
  }
};

const setDragonTigerSessionMode = async (req, res) => {
  try {
    const { mode } = req.body;
    if (!mode || !["automatic", "manual"].includes(mode)) {
      return res.status(400).json({
        status: false,
        message: "Invalid mode. Choose 'automatic' or 'manual'.",
      });
    }

    const dragonTigerSessionManager = req.app.get("DragonTigerSession");
    if (!dragonTigerSessionManager) {
      return res.status(500).json({
        status: false,
        message: "Dragon Tiger session manager is not initialized.",
      });
    }

    // Update mode in class and DB
    await dragonTigerSessionManager.setMode(mode);
    await dragonTigerSessionManager.updateModeInDB(mode);

    // ✅ Updated response
    return res.status(200).json({
      status: true,
      message: "Settings updated successfully.",
      data: {
        sessionMode: mode,
      },
    });
  } catch (error) {
    console.error("Error in setDragonTigerSessionMode:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error.",
    });
  }
};




module.exports = {
  placeDragonTigerBet,
  getDragonTigerBets,
  getHistory,
  getDragonTigerDailyStats,
  getDragonTigerSessionsWithStats,
  setDragonTigerSessionMode,
  getDragonTigerSessionMode
};