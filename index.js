require("dotenv").config();
const http = require("http");
const express = require("express");
const compression = require("compression");
const cors = require("cors");
const { Server } = require("socket.io");

const { connectDb } = require("./src/db");
const mainRouter = require("./src/routes");
const config = require("./src/config");

const SessionManager = require("./src/services/session/surath");
const AndarBaharSession = require("./src/services/session/andar-bahar");
const DragonTigerSession = require("./src/services/session/dragon-tiger");
const TeenPattiSession = require("./src/services/session/teen-patti");

const app = express();

// ─────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────
app.use(
  compression({
    threshold: 0,
    brotli: {
      enabled: true,
      zlib: require("zlib"),
    },
  })
);
app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────
// Connect to Database
// ─────────────────────────────────────────────
connectDb();

// ─────────────────────────────────────────────
// Create HTTP server
// ─────────────────────────────────────────────
const server = http.createServer(app);

// ─────────────────────────────────────────────
// Initialize Socket.IO
// ─────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});
app.set("io", io);

// ─────────────────────────────────────────────
// Initialize Session Managers
// ─────────────────────────────────────────────
const sessionManager = new SessionManager(io);
app.set("sessionManager", sessionManager);

const andarBaharSession = new AndarBaharSession(io);
app.set("AndarBaharSession", andarBaharSession);

const dragonTigerSession = new DragonTigerSession(io);
app.set("DragonTigerSession", dragonTigerSession);

const teenpattiSession = new TeenPattiSession(io);
app.set("teenPatti", teenpattiSession);

// ─────────────────────────────────────────────
// Socket.IO Events
// ─────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// ─────────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────────
app.use("/", mainRouter);

// ─────────────────────────────────────────────
// Start Server
// ─────────────────────────────────────────────
const PORT = config.port || 6969;
const isProduction = process.env.NODE_ENV === "production";

server.listen(PORT, () => {
  console.log(
    `Server running on ${isProduction ? "HTTPS" : "HTTP"} at port ${PORT}`
  );
});
