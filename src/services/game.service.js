const { GameSession } = require("../models");

class GameService {
  constructor() {
    this.sessions = new Map();
    this.playerSessions = new Map();
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

  startGame(sessionId, question, answer) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.canStartGame()) {
      throw new Error("Cannot start game");
    }

    session.currentQuestion = question;
    session.currentAnswer = answer.toLowerCase().trim();
    session.status = "in-progress";
    session.timeRemaining = 60;

    // Reset all players for new round
    session.players.forEach(player => player.resetForNewRound());

    return session;
  }

  submitAnswer(playerId, answer) {
    const sessionId = this.playerSessions.get(playerId);
    const session = this.sessions.get(sessionId);
    const player = session.players.get(playerId);

    if (player.attempts >= 3 || player.hasAnswered) {
      throw new Error("No more attempts allowed");
    }

    player.attempts++;
    const isCorrect = answer.toLowerCase().trim() === session.currentAnswer;

    if (isCorrect) {
      player.hasAnswered = true;
      player.addScore(10);
      session.status = "ended";
      return { correct: true, winner: player };
    }

    return { correct: false, attemptsLeft: 3 - player.attempts };
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  removePlayer(playerId) {
    const sessionId = this.playerSessions.get(playerId);

    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.players.delete(playerId);
        if (session.players.size === 0) {
          this.sessions.delete(sessionId);
        }
      }
      this.playerSessions.delete(playerId);
    }
  }
}

module.exports = new GameService();