const GameService = require("../services/game.service");
const SessionService = require("../services/session.service");

function safeCallback(callback, data) {
  if (callback && typeof callback === "function") {
    callback(data);
  }
}

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
      safeCallback(callback, {
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

      socket.emit("session-created", {
        sessionId: session.id,
        playerCount: session.getPlayerCount()
      })
    } catch (error) {
      console.log("Error creating session:", error);
      safeCallback(callback, { error: error.message });
    }
  });

  socket.on("join-session", (data, callback) => {
    try {
      const { sessionId, playerName } = data;
      const normalizedSessionId = sessionId.toLowerCase();

      console.log("🎯 JOIN-SESSION event received:", normalizedSessionId, playerName);

      const session = GameService.joinSession(normalizedSessionId, socket.id, playerName);

      socket.join(normalizedSessionId);

      console.log("Player joined successfully:", playerName);
      console.log("Total players now:", session.getPlayerCount());

      const playersData = Array.from(session.players.values()).map(player => ({
        id: player.id,
        name: player.name,
        score: player.score,
        isGameMaster: player.isGameMaster
      }));

      // Send response to the joining player
      safeCallback(callback, {
        session: {
          id: session.id,
          status: session.status,
          players: playersData
        }
      });

      // Notify all players in session
      io.to(normalizedSessionId).emit("session-updated", {
        type: "player-joined",
        playerId: socket.id,
        playerName: playerName,
        playerCount: session.getPlayerCount(),
        players: playersData
      });

      console.log(`Broadcasted player-joined to ${session.getPlayerCount()} players`);

    } catch (error) {
      console.log("Error joining session:", error);
      safeCallback(callback, { error: error.message });
    }
  });

  socket.on("leave-session", (data, callback) => {
    try {
      const { sessionId } = data;
      const normalizedSessionId = sessionId.toLowerCase();

      const session = SessionService.leaveSession(sessionId, socket.id);

      socket.leave(normalizedSessionId);

      const playersData = Array.from(session.players.values()).map(player => ({
        id: player.id,
        name: player.name,
        score: player.score,
        isGameMaster: player.isGameMaster
      }));

      io.to(sessionId).emit("session-updated", {
        type: "player-left",
        playerId: socket.id,
        playerCount: session.getPlayerCount(),
        players: playersData
      });

      safeCallback(callback, { success: true });
      
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
      safeCallback(callback, { sessions });
    } catch (error) {
      console.log("Error listing sessions:", error);
      safeCallback(callback, { sessions });
    }
  })
}