const GameService = require("../services/game.service");
const SessionService = require("../services/session.service");

module.exports = (socket, io) => {
  socket.on("create-session", (data) => {
    try {
      const { playerName } = data;
      const session = GameService.createSession(socket.id, playerName);

      socket.join(session.id);
      socket.emit("session-created", {
        sessionId: session.id,
        playerCount: session.getPlayerCount()
      })
    } catch (error) {
      socket.emit("error", { message: error.message });
    }
  });

  socket.on("join-session", (data) => {
    try {
      const { sessionId, playerName } = data;
      const session = GameService.joinSession(sessionId, socket.id, playerName);

      socket.join(sessionId);

      // Notify all players in session
      io.to(sessionId).emit("player-joined", {
        playerCount: session.getPlayerCount(),
        players: Array.from(session.players.values()).map(player => ({
          id: player.id,
          name: player.name,
          score: player.score,
          isGameMaster: player.isGameMaster
        }))
      });
    } catch (error) {
      socket.emit("error", { message: error.message });
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

      io.to(sessionId).emit("session-ended", { sessionId });

      // Force all players to leave session room
      io.in(sessionId).socketsLeave(sessionId);
    } catch (error) {
      socket.emit("error", { message: error.message });
    }
  });

  socket.on("list-sessions", () => {
    try {
      const sessions = SessionService.getAllSessions();
      socket.emit("sessions-list", { sessions })
    } catch (error) {
      socket.emit("error", { message: error.message });
    }
  })
}