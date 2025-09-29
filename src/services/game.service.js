const { GameSession } = require("../models");

class GameService {
  constructor() {
    this.sessions = new Map();
    this.playerSessions = new Map();
    this.gameTimers = new Map();
  }

  createSession(masterId, masterName) {
    const session = new GameSession(masterId, masterName);
    this.sessions.set(session.id, session);
    this.playerSessions.set(masterId, session.id);
    return session;
  }

  joinSession(sessionId,playerId, playerName) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    if (session.status !== "waiting") {
      throw new Error("Cannot join game in progress");
    }

    session.addPlayer(playerId, playerName);
    this.playerSessions.set(playerId, sessionId);
    return session;
  }

  startGame(sessionId, question, answer, io) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.canStartGame()) {
      throw new Error("Cannot start game");
    }

    session.currentQuestion = question;
    session.currentAnswer = answer.toLowerCase().trim();
    session.status = "in-progress";
    session.timeRemaining = 60;

    
    session.players.forEach(player => player.resetForNewRound());

    this.startGameTimer(sessionId, io);

    return session;
  }

  startGameTimer(sessionId, io) {
    this.clearGameTimer(sessionId);

    const session = this.sessions.get(sessionId);
    if (!session) return;

    const tick = () => {
      session.timeRemaining--;

      io.to(sessionId).emit("timer-update", {
        timeRemaining: session.timeRemaining
      });

      if (session.timeRemaining <= 0) {
        this.endGameByTimeout(sessionId, io);
      } else {
        this.gameTimers.set(sessionId, setTimeout(tick, 1000));
      }
    }
    this.gameTimers.set(sessionId, setTimeout(tick, 1000));
  }

  endGameByTimeout(sessionId, io) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = "ended";
    this.clearGameTimer(sessionId);

    // Notify all players that time expired
    io.to(sessionId).emit("game-ended", {
      reason: "timeout",
      answer: session.currentAnswer,
      winner: null,
      players: this.getPlayersData(session)
    });

    setTimeout(() => {
      this.prepareNextRound(sessionId, io);
    }, 5000);
  }

  endGameByWin(sessionId, winner, io) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = "ended";
    this.clearGameTimer(sessionId);

    io.to(sessionId).emit("game-ended", {
      reason: "winner",
      answer: session.currentAnswer,
      winner: {
        id: winner.id,
        name: winner.name,
        score: winner.score
      },
      players: this.getPlayersData(session)
    });

    setTimeout(() => {
      this.prepareNextRound(sessionId, io);
    }, 5000);
  }

  submitAnswer(playerId, answer) {
    const sessionId = this.playerSessions.get(playerId);
    const session = this.sessions.get(sessionId);
    const player = session.players.get(playerId);

    if (!session || !player) {
      throw new Error("Player or session not found");
    }

    if (session.status !== "in-progress") {
      throw new Error("Game is not in progress");
    }

    if (player.attempts >= 3 || player.hasAnswered) {
      throw new Error("No more attempts allowed");
    }

    player.attempts++;
    const isCorrect = answer.toLowerCase().trim() === session.currentAnswer;

    if (isCorrect) {
      player.hasAnswered = true;
      player.addScore(10);

      // End game immediately - winner found!
      this.endGameByWin(sessionId, player,io);

      return { correct: true, winner: player };
    }

    // Wrong Answer - notify the player
    io.to(playerId).emit("answer-result", {
      correct: false,
      attemptsLeft: 3 - player.attempts,
      message: player.attempts >= 3 ? "No more attempts!" : `Wrong! ${3 - player.attempts} attempts left`
    })

    return { correct: false, attemptsLeft: 3 - player.attempts };
  }

  prepareNextRound(sessionId, io) {
    const session = this.sessions.get(sessionId);
    if (!session || session.players.size === 0) {
      // Session is empty, clean it up
      this.cleanupSession(sessionId);
      return
    }

    // Rotate game master to next player
    const playersArray = Array.from(session.players.values());
    const currentMasterIndex =playersArray.findIndex(player => player.isGameMaster);
    const nextMasterIndex = (currentMasterIndex + 1) % playersArray.length;

    // Update game master
    playersArray.forEach((player, index) => {
      player.isGameMaster = index === nextMasterIndex;
    });

    session.masterId = playersArray[nextMasterIndex].id;
    session.status = "waiting";
    session.currentQuestion = "";
    session.currentAnswer = "";
    session.timeRemaining = 60;

    // Notify all players about the new game master
    io.to(sessionId).emit("new-round-ready", {
      newGameMaster: {
        id: session.masterId,
        name: playersArray[nextMasterIndex].name
      },
      players: this.getPlayersData(session)
    });
  }

  clearGameTimer(sessionId) {
    const timer = this.gameTimers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.gameTimers.delete(sessionId);
    }
  }

  cleanupSession(sessionId) {
    this.clearGameTimer(sessionId);
    this.sessions.delete(sessionId);

    // Remove all players from this session
    for (const [playerId, playerSessionId] of this.playerSessions.entries()) {
      if (playerSessionId === sessionId) {
        this.playerSessions.delete(playerId);
      }
    } 
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  removePlayer(playerId, io) {
    const sessionId = this.playerSessions.get(playerId);
    if(!sessionId) return;

    const session = this.sessions.get(sessionId);
    if (!session) return;

    const leavingPlayer = session.players.get(playerId);
    session.players.delete(playerId);
    this.playerSessions.delete(playerId);

    // If no players left cleanup session
    if (session.players.size === 0) {
      this.cleanupSession(sessionId);
      return;
    }

    // If the leaving player was game master, assign new one
    if (leavingPlayer?.isGameMaster && session.status === "waiting") {
      const remainingPlayers = Array.from(session.players.values());
      remainingPlayers[0].isGameMaster = true;
      session.masterId = remainingPlayers[0].id;
    }

    // If game was in progress and player leaves, continue game
    if (session.status === "in-progress") {
      // Check if all remaining players have answered or used all attempts
      const allPlayersFinished = Array.from(session.players.values())
        .every(player => player.hasAnswered || player.attempts >= 3);

      if (allPlayersFinished) {
        this.endGameByTimeout(sessionId, io);
        return;
      }
    }

    // Notify remaining players
    io.to(sessionId).emit("player-left", {
      playerId,
      playerName: leavingPlayer?.name,
      playerCount: session.players.size,
      players: this.getPlayersData(session),
      newGameMaster: session.masterId
    })
  }

  getPlayersData(session) {
    return Array.from(session.players.values()).map(player => ({
      id: player.id,
      name: player.name,
      score: player.score,
      attempts: player.attempts,
      hasAnswered: player.hasAnswered,
      isGameMaster: player.isGameMaster
    }));
  }
}

module.exports = new GameService();