const GameService = require("../services/game.service");

function safeCallback(callback, data) {
  if (callback && typeof callback === "function") {
    callback(data);
  }
}

function validateGameInputs(question, answer) {
  if (!question?.trim() || question.trim().length < 5) {
    throw new Error("Question must be at least 5 characters");
  }
  if (!answer?.trim() || answer.trim().length < 1) {
    throw new Error("Answer cannot be empty");
  }
}

module.exports = (io, socket) => {
  socket.on("start-game", (data, callback) => {
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

      console.log('✅ Game started successfully');
      console.log('Question:', question);
      console.log('Players in session:', session.getPlayerCount());

      io.to(sessionId).emit("game-started", {
        question: session.currentQuestion,
        timeRemaining: session.timeRemaining,
        playerCount: session.getPlayerCount()
      });
    } catch (error) {
      console.log("Error starting game:", error);
      safeCallback(callback, { error: error.message });
    }
  });

  socket.on("submit-answer", (data, callback) => {
    try {
      console.log("SUBMIT-ANSWER event received:", data);
      const { answer } = data;

      if (!answer?.trim()) {
        throw new Error("answer cannot be empty")
      }

      const result = GameService.submitAnswer(socket.id, answer, io);

      console.log("✅ Answer processed successfully:", {
          correct: result.correct,
          winner: result.winner?.name,
          attemptsLeft: result.attemptsLeft
      });

      // Only send success response for wrong answers
      // For correct answers, the game-ended event will handle the UI update
      if (!result.correct) {
          safeCallback(callback, { 
              success: true, 
              correct: false,
              attemptsLeft: result.attemptsLeft,
              message: result.message
          });
      } else {
          // For correct answers, don't send callback immediately
          // Let the game-ended event handle the UI transition
          safeCallback(callback, { 
              success: true, 
              correct: true,
              winner: result.winner
          });
      }

    } catch (error) {
      console.log("Error submitting answer:", error.message);
      safeCallback(callback, { 
        error: error.message,
        success: false 
      });
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
  });

  socket.on("debug-session-state", (data, callback) => {
    try {
        const { sessionId } = data;
        const state = GameService.debugSessionState(sessionId);
        safeCallback(callback, state);
    } catch (error) {
        safeCallback(callback, { error: error.message });
    }
  });

  socket.on("skip-to-next-round", () => {
    try {
      const session = GameService.getSessionByMasterId(socket.id);
      if (!session) throw new Error("Not a game master");
      
      console.log('🔄 Manually skipping to next round for session:', session.id);
      GameService.prepareNextRound(session.id, io);
    } catch (error) {
      socket.emit("error", { message: error.message });
    }
  });
}