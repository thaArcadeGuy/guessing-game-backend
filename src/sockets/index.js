const sessionSocket = require("./session.socket");
const gameSocket = require("./game.socket");

function setupSockets(server) {
  const io = require("socket.io")(server, {
    cors: { origin: "*" }
  });

  const connectedUsers = new Map();

  io.on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);
    connectedUsers.set(socket.id, { connectedAt: new Date() });

    try {
      // Initialize socket modules
      sessionSocket(io, socket);
      gameSocket(io, socket);

      socket.on("ping", () => {
        socket.emit("pong", { timestamp: Date.now() });
      });

      socket.on("reconnect-attempt", (attemptNumber) => {
        console.log(`Reconnection attempt ${attemptNumber} for ${socket.id}`);
      });

      socket.on("reconnect", (data) => {
        try {
          const GameService = require("../services/game.service");
          const oldSocketId = data.oldSocketId;

          const session = GameService.handlePlayerReconnect(
            oldSocketId,
            socket.id,
            io
          );

          if (session) {
            socket.join(session.id);
            socket.emit("reconnect-success", {
              sessionId: session.id,
              gameState: session.status,
              players: GameService.getPlayersData(session),
            });
          } else {
            socket.emit("reconnect-failed", { message: "Session not found" });
          }
        } catch (error) {
          console.error(`Reconnection error for ${socket.id}:`, error);
          socket.emit("reconnect-failed", { message: error.message });
        }
      });

      // Add error handler for this specific socket
      socket.on("error", (error) => {
        console.error(`Socket error for ${socket.id}:`, error);
      });

    } catch (error) {
      console.error(`Error setting up socket ${socket.id}:`, error);
      socket.emit("error", { message: "Connection setup failed" });
    }
    socket.on("disconnect", (reason) => {
      console.log(`User disconnected: ${socket.id} - Reason: ${reason}`);
      connectedUsers.delete(socket.id);

      setTimeout(() => {
        try {
          const GameService = require("../services/game.service");
          GameService.handlePlayerDisconnect(socket.id, io);
        } catch (error) {
          console.error(`Error during disconnect cleanup for ${socket.id}:`, error);
        }
      }, 0);
    });
  });

  const adminNamespace = io.of("/admin");
  adminNamespace.on("connection", (socket) => {
    console.log("Admin connected:", socket.id);
    
    socket.on("get-stats", () => {
      socket.emit("stats", {
        connectedUsers: connectedUsers.size,
        timestamp: new Date().toISOString()
      });
    });
  });

  return io;
}

module.exports = { setupSockets };