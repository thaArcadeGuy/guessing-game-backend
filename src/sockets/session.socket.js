const GameService = require("../services/game.service");
const SessionService = require("../services/session.service");

module.exports = (io, socket) => {
  console.log(`🔌 Session socket handlers registered for: ${socket.id}`);

  // Add this to debug all incoming events
  socket.onAny((eventName, ...args) => {
    console.log(`📨 Incoming event: ${eventName}`, args);
  });

  socket.on("create-session", (data, callback) => {
    try {
      console.log("🎯 CREATE-SESSION event received on backend");
      console.log("Data:", data);
      console.log("Socket ID:", socket.id);

      const { playerName } = data;

      if (!playerName || playerName.trim().length < 2) {
        if (callback) callback({ error: "Name must be at least 2 characters" });
        return;
      }
      const session = GameService.createSession(socket.id, playerName.trim());
      SessionService.registerSession(session);

      socket.join(session.id);

      console.log("Session created:", session.id);
      console.log("Players:", session.getPlayerCount());

      // Send response back via callback
      if (callback) {
        callback({
          sessionId: session.id,
          session: {
            id: session.id,
            status: session.status,
            masterId: session.masterId,
            players: Array.from(session.players.values()).map(player => ({
              id: player.id,
              name: player.name,
              score: player.score,
              isGameMaster: player.isGameMaster
            }))
          }
        });
      }

      socket.emit("session-created", {
        sessionId: session.id,
        playerCount: session.getPlayerCount()
      })
    } catch (error) {
      console.log("Error creating session:", error);
      if (callback) {
        callback({ error: error.message });
      } else {
        socket.emit("error", { message: error.message });
      }
    }
  });

  socket.on("join-session", (data, callback) => {
    try {
      const { sessionId, playerName } = data;
      const normalizedSessionId = sessionId.toLowerCase();

      console.log("🎯 JOIN-SESSION event received:", normalizedSessionId, playerName);

      const session = GameService.joinSession(normalizedSessionId, socket.id, playerName);

      socket.join(normalizedSessionId);

      // Send response to the joining player
      if (callback) {
        callback({
          session: {
            id: session.id,
            status: session.status,
            players: Array.from(session.players.values()).map(player => ({
              id: player.id,
              name: player.name,
              score: player.score,
              isGameMaster: player.isGameMaster
            }))
          }
        });
      }

      // Notify all players in session
      io.to(normalizedSessionId).emit("player-joined", {
        playerCount: session.getPlayerCount(),
        players: Array.from(session.players.values()).map(player => ({
          id: player.id,
          name: player.name,
          score: player.score,
          isGameMaster: player.isGameMaster
        }))
      });
    } catch (error) {
      console.log("Error joining session:", error);
      if (callback) {
        callback({ error: error.message });
      } else {
        socket.emit("error", { message: error.message });
      }
    }
  });

  socket.on("leave-session", (data) => {
    try {
      const { sessionId } = data;
      const session = SessionService.leaveSession(sessionId, socket.id);

      socket.leave(sessionId);

      io.to(sessionId).emit("player-left", {
        playerId: socket.id,
        playerCount: session.getPlayerCount(),
        players: session.getPlayersList()
      })
    } catch (error) {
      socket.emit("error", { message: error.message });
    }
  });

  socket.on("end-session", (data) => {
    try {
      const { sessionId } = data;
      const session = SessionService.endSession(sessionId, socket.id);

      GameService.cleanupSession(sessionId);

      io.to(sessionId).emit("session-ended", { sessionId });
      io.in(sessionId).socketsLeave(sessionId);

    } catch (error) {
      socket.emit("error", { message: error.message });
    }
  });

  socket.on("list-sessions", (data, callback) => {
    try {
      const sessions = SessionService.getAllSessions();
      console.log('📋 Sessions available:', sessions.map(s => s.id));

      if (callback && typeof callback === "function") {
        callback({ sessions });
      } else {
        socket.emit("sessions-list", { sessions })
      }
    } catch (error) {
      console.log("Error listing sessions:", error);
      if (callback && typeof callback === "function") {
        callback({ error: error.message });
      } else {
        socket.emit("error", { message: error.message });
      }
    }
  })
}