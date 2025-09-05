const express = require("express");
const userRouter = require("./users");
const gameRouter = require("./game");
const bankAccountsRouter = require("./bankAccounts");
const paymentRouter = require("./payment");
const withDrawRouter = require("./withdraw");
const adminRoute = require("./admin");
const agoraRoute = require("./agora");
const transactionRoute = require("./upiTransaction");
const agentRoutes = require("./agent")

const mainRouter = express.Router();

mainRouter.use("/user", userRouter);
mainRouter.use("/agents", agentRoutes);
mainRouter.use("/game", gameRouter);
mainRouter.use("/bank", bankAccountsRouter);
mainRouter.use("/payment", paymentRouter);
mainRouter.use("/transaction", transactionRoute);
mainRouter.use("/withdraw", withDrawRouter);
mainRouter.use("/admin", adminRoute);
mainRouter.use("/live", agoraRoute);

module.exports = mainRouter;
