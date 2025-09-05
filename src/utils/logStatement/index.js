const AccountStatement = require("../../models/AccountStatement");

async function logStatement({
  userId,
  type,
  amount,
  walletBefore,
  walletAfter,
  gameId = null,
  card = null,
  status = "success",
  description = ""
}) {
  try {
    const statement = new AccountStatement({
      userId,
      type,
      amount,
      walletBefore,
      walletAfter,
      gameId,
      card,
      status,
      description
    });

    await statement.save();
    return { success: true };
  } catch (error) {
    console.error("Failed to log statement:", error);
    return { success: false, error };
  }
}

module.exports = logStatement;
