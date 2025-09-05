const Bet = require('../../../models/andar-bahar/bets');
const GameSession = require('../../../models/andar-bahar/session');
const User = require('../../../models/users');
const Setting = require('../../../models/settings');
const { InternalServerError } = require('../../../utils/errorHandler');
const logStatement = require('../../../utils/logStatement');
const moment = require("moment-timezone");
const mongoose = require('mongoose');

const placeAndarBaharBet = async (req, res) => {
  try {
    const { userId, side, amount } = req.body;

    if (!side || amount <= 0) {
      return res.status(400).json({
        status: false,
        message: "Side (andar or bahar) and a positive amount are required.",
      });
    }

    if (!['andar', 'bahar', 'tie'].includes(side)) {
      return res.status(400).json({
        status: false,
        message: "Invalid bet side. Must be 'andar', 'bahar', or 'tie'.",
      });
    }

    if (amount < 10) {
      return res.status(400).json({
        status: false,
        message: "Minimum bet amount is ₹10.",
      });
    }

    const sessionManager = req.app.get("AndarBaharSession");
    if (!sessionManager || !sessionManager.isActive()) {
      return res.status(400).json({
        status: false,
        message: "No active Andar Bahar session. Please wait for the next round.",
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

    const bulkOps = [];

    if (existingBet) {
      bulkOps.push({
        updateOne: {
          filter: { _id: existingBet._id },
          update: { $inc: { amount: amount, wonAmount: amount * 1.9 }, $set: { betCreatedAt: new Date() } },
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
            wonAmount: amount * 1.9,
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
      gameId: 'AndarBahar',
      card: side,
      description: `Placed Andar Bahar bet of ₹${amount} on ${side}`,
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
    console.error("Error placing Andar Bahar bet:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error.",
    });
  }
};

const getAndarBaharBets = async (req, res) => {
  try {
    const { userId } = req.body;

    // Access the session manager from the app
    const sessionManager = req.app.get("AndarBaharSession");

    // Check if a session is active
    if (!sessionManager.isActive()) {
      return res.status(400).json({
        status: false,
        message: "No active betting session. Please wait for the next session. isActive",
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
      card: session.mainCard,
      winner: session.side
    }));

    return res.status(200).json({ success: true, history });
  } catch (error) {
    console.error("Error fetching game history:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// Helper to get start and end of the day in IST
function getISTDayRange(dateString = null) {
  const date = dateString ? moment.tz(dateString, 'Asia/Kolkata') : moment.tz('Asia/Kolkata');
  const startOfDay = date.clone().startOf('day').toDate();
  const endOfDay = date.clone().endOf('day').toDate();
  return { startOfDay, endOfDay };
}

const getAndarBaharDailyStats = async (req, res) => {
  try {
    const { date } = req.query; // e.g., '2025-06-21'
    const { startOfDay, endOfDay } = getISTDayRange(date);

    const [totalStats, winStats] = await Promise.all([
      // 1. All bets (for total bet amount)
      Bet.aggregate([
        {
          $match: {
            createdAt: { $gte: startOfDay, $lte: endOfDay }
          }
        },
        {
          $group: {
            _id: null,
            totalBetAmount: { $sum: '$amount' }
          }
        }
      ]),

      // 2. Only winners (for total win amount)
      Bet.aggregate([
        {
          $match: {
            createdAt: { $gte: startOfDay, $lte: endOfDay },
            isWinner: true
          }
        },
        {
          $group: {
            _id: null,
            totalWinningAmount: { $sum: '$wonAmount' }
          }
        }
      ])
    ]);

    const totalBetAmount = totalStats[0]?.totalBetAmount || 0;
    const totalWinningAmount = winStats[0]?.totalWinningAmount || 0;

    res.status(200).json({
      success: true,
      date: date || moment.tz('Asia/Kolkata').format('YYYY-MM-DD'),
      totalBetAmount,
      totalWinningAmount
    });
  } catch (err) {
    console.error(err);
    throw new InternalServerError('Failed to fetch andar bahar bet stats');
  }
};

const getAndarBaharSessionsWithStats = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const searchText = req.query.searchText?.trim();

    const filter = {};

    if (searchText) {
      if (mongoose.Types.ObjectId.isValid(searchText)) {
        filter._id = new mongoose.Types.ObjectId(searchText);
      } else {
        return res.status(400).json({ success: false, message: 'Invalid session ID' });
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
              $cond: [{ $eq: ['$isWinner', true] }, '$wonAmount', 0],
            }
          },
          uniqueUserIds: { $addToSet: '$userId' },
          andarTotalAmount: {
            $sum: {
              $cond: [{ $eq: ['$side', 'andar'] }, '$amount', 0],
            },
          },
          baharTotalAmount: {
            $sum: {
              $cond: [{ $eq: ['$side', 'bahar'] }, '$amount', 0],
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
          andarTotalAmount: 1,
          baharTotalAmount: 1,
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
        andarTotalAmount: 0,
        baharTotalAmount: 0,
      };

      return {
        sessionId: session._id,
        startTime: moment(session.startTime).tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss'),
        totalBetAmount: stat.totalBetAmount,
        totalWinningAmount: stat.totalWinningAmount,
        uniqueUserCount: stat.uniqueUserCount,
        andarTotalAmount: stat.andarTotalAmount,
        baharTotalAmount: stat.baharTotalAmount,
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

const getAndarBaharSessionMode = async (req, res) => {
  try {
    const setting = await Setting.findOne({ game: "andar-bahar", key: "sessionModea" });

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
    console.error("Error in get Andar Bahar SessionMode:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error.",
    });
  }
};

const setAndarBaharSessionMode = async (req, res) => {
  try {
    const { mode } = req.body;
    if (!mode || !["automatic", "manual"].includes(mode)) {
      return res.status(400).json({
        status: false,
        message: "Invalid mode. Choose 'automatic' or 'manual'.",
      });
    }

    const andarBaharSessionManager = req.app.get("AndarBaharSession");
    if (!andarBaharSessionManager) {
      return res.status(500).json({
        status: false,
        message: "Dragon Tiger session manager is not initialized.",
      });
    }

    // Update mode in class and DB
    await andarBaharSessionManager.setMode(mode);
    await andarBaharSessionManager.updateModeInDB(mode);

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
  placeAndarBaharBet,
  getAndarBaharBets,
  getHistory,
  getAndarBaharDailyStats,
  getAndarBaharSessionsWithStats,
  getAndarBaharSessionMode,
  setAndarBaharSessionMode
};
