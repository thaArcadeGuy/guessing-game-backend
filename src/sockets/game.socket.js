const GameService = require("../services/game.service");

module.exports = (socket, io) => {
  socket.on("start-game", (data) => {
    try {
      const { question, answer } = data;

      if (!question?.trim() || !answer?.trim()) {
        throw new Error("Question and answer are required");
      }

      // Find which session this player is master of
      const sessionId = Array.from(GameService.sessions.entries())
        .find(([id, session]) => session.masterId === socket.id)?.[0];
      
      if (!sessionId) {
        throw new Error("You are not a game master of any session");
      }

      const session = GameService.startGame(sessionId, question, answer, io);

      io.to(sessionId).emit("game-started", {
        question: session.currentQuestion,
        timeRemaining: session.timeRemaining,
        playerCount: session.getPlayerCount()
      });
    } catch (error) {
      socket.emit("error", { message: error.message });
    }
  });

  socket.on("submit-answer", (data) => {
    try {
      const { answer } = data;

      if (!answer?.trim()) {
        throw new Error("answer cannot be empty")
      }

      GameService.submitAnswer(socket.id, answer, io);

    } catch (error) {
      socket.emit("error", { message: error.message });
    }
  });

  socket.on("get-game-status", () => {
    try {
      const sessionId = GameService.playerSessions.get(socket.id);
      const session = GameService.getSession(sessionId);

      if (!session) {
        socket.emit("error", { message: "No active session" });
        return;
      }

      socket.emit("game-status", {
        sessionId: session.id,
        status: session.status,
        question: session.status === "in-progress" ? session.currentQuestion: null,
        timeRemaining: session.timeRemaining,
        players: GameService.getPlayersData(session),
        isGameMaster: session.masterId === socket.id
      });
    } catch (error) {
      socket.emit("error", { message: error.message });
    }
  })
}