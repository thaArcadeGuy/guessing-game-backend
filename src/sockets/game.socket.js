const GameService = require("../services/game.service");

function validateGameInputs(question, answer) {
  if (!question?.trim() || question.trim().length < 5) {
    throw new Error("Question must be at least 5 characters");
  }
  if (!answer?.trim() || answer.trim().length < 1) {
    throw new Error("Answer cannot be empty");
  }
}

module.exports = (io, socket) => {
  socket.on("start-game", (data) => {
    try {
      const { question, answer } = data;
      validateGameInputs(question, answer);

      const session = GameService.getSessionByMasterId(socket.id);
      if (!session) 
        throw new Error("You are not a game master of any session");

      // Find which session this player is master of
      const sessionId = Array.from(GameService.sessions.entries())
        .find(([id, session]) => session.masterId === socket.id)?.[0];
      
      if (!sessionId) {
        throw new Error("You are not a game master of any session");
      }

      GameService.startGame(sessionId, question, answer, io);

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
  });

  socket.on("reconnect-game", () => {
    try {
      const sessionId = GameService.playerSessions.get(socket.id);
      const session = GameService.getSession(sessionId);

      if (session) {
        socket.join(sessionId);
        socket.emit("game-reconnected", {
          status: session.status,
          question: session.currentQuestion,
          timeRemaining: session.timeRemaining,
          players: GameService.getPlayersData(session)
        })
      }
    } catch (error) {
      socket.emit("error", { message: error.message });
    }
  });

  socket.on("force-end-game", () => {
    try {
      const session = GameService.getSessionByMasterId(socket.id);
      if (!session) throw new Error("Not a game master");
      
      GameService.endGameByTimeout(session.id, io);
    } catch (error) {
      socket.emit("error", { message: error.message });
    }
  });

  socket.on("skip-to-next-round", () => {
    try {
      const session = GameService.getSessionByMasterId(socket.id);
      if (!session) throw new Error("Not a game master");
      
      GameService.prepareNextRound(session.id, io);
    } catch (error) {
      socket.emit("error", { message: error.message });
    }
  });

  socket.on("chat-message", (data) => {
    try {
      const { sessionId, message } = data;
      const session = GameService.getSession(sessionId);

      if (!session) {
        socket.emit("error", { message: "Session not found" });
        return;
      }

      const player = session.players.get(socket.id);
      if (!player) {
        socket.emit("error", { message: "Player not in session " });
        return;
      }

      io.to(sessionId).emit("chat-message", {
        playerId: socket.id,
        playerName: player.name,
        message: message
      })
    } catch (error) {
      socket.emit("error", { message: error.message });
    }
  })
}