const { GameSession } = require("../models");
const SessionService = require("./session.service");

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

    SessionService.registerSession(session);

    return session;
  }

  joinSession(sessionId, playerId, playerName) {
    const normalizedSessionId = sessionId.toLowerCase();

    const session = this.sessions.get(normalizedSessionId);
    if (!session) {
      console.log("❌ Session not found: ${sessionId} (looking for: ${normalizedSessionId})");
      console.log("Available sessions:", Array.from(this.sessions.keys()));

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
        const timeoutId = setTimeout(tick, 1000);
        this.gameTimers.set(sessionId, timeoutId);
      }
    }

    const initialTimeoutId = setTimeout(tick, 1000);
    this.gameTimers.set(sessionId, initialTimeoutId);
  }

  clearGameTimer(sessionId) {
    const timer = this.gameTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.gameTimers.delete(sessionId);
    }
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

    console.log(`🏆 Game ended by win - Winner: ${winner.name}, Session: ${sessionId}`);
    console.log(`📊 Session state before ending:`, {
        status: session.status,
        timeRemaining: session.timeRemaining
    });

    session.status = "ended";
    this.clearGameTimer(sessionId);

    const gameEndData = {
      reason: "winner",
      answer: session.currentAnswer,
      question: session.currentQuestion,
      winner: {
        id: winner.id,
        name: winner.name,
        score: winner.score
      },
      players: this.getPlayersData(session)
    };

    console.log("Broadcasting game-ended event");
    io.to(sessionId).emit("game-ended", gameEndData);

    console.log(`Preparing next round in 5 seconds for session: ${sessionId}`);

    setTimeout(() => {
      this.prepareNextRound(sessionId, io);
    }, 5000);
  }

  submitAnswer(playerId, answer, io) {
    const sessionId = this.playerSessions.get(playerId);
    const session = this.sessions.get(sessionId);
    const player = session.players.get(playerId);

    if (!session || !player) {
      throw new Error("Player or session not found");
    }

    // Add detailed logging to debug state issues
    console.log(`🎯 Answer submission check:`, {
        player: player.name,
        sessionStatus: session.status,
        timeRemaining: session.timeRemaining,
        playerAttempts: player.attempts,
        playerHasAnswered: player.hasAnswered
    });

    if (session.status !== "in-progress") {
      console.log(`❌ Game is not in progress. Current status: ${session.status}`);
      throw new Error("Game is not in progress");
    }

    if (player.attempts >= 3 || player.hasAnswered) {
      throw new Error("No more attempts allowed");
    }

    player.attempts++;
    const isCorrect = answer.toLowerCase().trim() === session.currentAnswer;

    console.log(`📝 Answer evaluation:`, {
        player: player.name,
        submitted: answer,
        expected: session.currentAnswer,
        isCorrect: isCorrect,
        attempts: player.attempts
    });

    if (isCorrect) {
      player.hasAnswered = true;
      player.addScore(10);

      console.log(`Correct answer! ${player.name} wins this round`);
      console.log(`🏆 Ending game immediately for session: ${sessionId}`);

      // End game immediately - winner found!
      this.endGameByWin(sessionId, player, io);

      return { 
        correct: true, 
        winner: player, 
        players: this.getPlayersData(session) 
      };
    }

    // Wrong Answer - notify the player
    const attemptsLeft = 3 - player.attempts;
    console.log(`Wrong answer - ${player.name} has ${attemptsLeft} attempts left`);

    io.to(playerId).emit("answer-result", {
      correct: false,
      attemptsLeft: attemptsLeft,
      message: player.attempts >= 3 ? "No more attempts!" : `Wrong! ${attemptsLeft} attempts left`
    })

    return { 
      correct: false, 
      attemptsLeft: attemptsLeft, 
      message: player.attempts >= 3 ? "No more attempts!" : `Wrong! ${attemptsLeft} attempts left` 
    };
  }

  prepareNextRound(sessionId, io) {
    const session = this.sessions.get(sessionId);
    if (!session || session.players.size === 0) {
      console.log(`Cannot prepare next round - session not found: ${sessionId}`);
      console.log(`Session ${sessionId} has no players - cleaning up`);
      // Session is empty, clean it up
      this.cleanupSession(sessionId);
      return
    }

    console.log(`Preparing next round for session: ${sessionId}`);
    console.log(`Players remaining: ${session.players.size}`);

    // Rotate game master to next player
    const playersArray = Array.from(session.players.values());
    const currentMasterIndex =playersArray.findIndex(player => player.isGameMaster);
    const nextMasterIndex = (currentMasterIndex + 1) % playersArray.length;

    console.log(`👑 Game master rotation: ${playersArray[currentMasterIndex]?.name} → ${playersArray[nextMasterIndex]?.name}`);


    // Update game master
    playersArray.forEach((player, index) => {
      player.isGameMaster = index === nextMasterIndex;
    });

    session.masterId = playersArray[nextMasterIndex].id;
    session.status = "waiting";
    session.currentQuestion = "";
    session.currentAnswer = "";
    session.timeRemaining = 60;

    // Reset player states for new round
    playersArray.forEach(player => {
      player.resetForNewRound();
      console.log(`🔄 Reset ${player.name}: attempts=${player.attempts}, hasAnswered=${player.hasAnswered}`);
    });

    console.log(`Next round ready - New master: ${playersArray[nextMasterIndex].name}`);

    console.log(`📢 Emitting new-round-ready to session: ${sessionId}`);
    console.log(`👥 Players in room:`, Array.from(io.sockets.adapter.rooms.get(sessionId) || []));

    // Notify all players about the new game master
    io.to(sessionId).emit("new-round-ready", {
      newGameMaster: {
        id: session.masterId,
        name: playersArray[nextMasterIndex].name
      },
      players: this.getPlayersData(session)
    });
    console.log(`✅ new-round-ready event emitted`);
  }

  clearGameTimer(sessionId) {
    const timer = this.gameTimers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.gameTimers.delete(sessionId);
    }
  }

  cleanupSession(sessionId) {
    const normalizedSessionId = sessionId.toLowerCase();
    this.clearGameTimer(normalizedSessionId);
    this.sessions.delete(normalizedSessionId);

    SessionService.sessions.delete(normalizedSessionId);

    // Remove all players from this session
    for (const [playerId, playerSessionId] of this.playerSessions.entries()) {
      if (playerSessionId === normalizedSessionId) {
        this.playerSessions.delete(playerId);
      }
    } 
  }

  getSession(sessionId) {
    const normalizedSessionId = sessionId.toLowerCase();
    return this.sessions.get(normalizedSessionId);
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

  handlePlayerDisconnect(playerId, io) {
    try {
      console.log("🔌 Handling disconnect for player: ${playerId}");
      const sessionId = this.playerSessions.get(playerId);
      
      if (!sessionId) {
        console.log("No session found for disconnected player");
        return;
      }

      const session = this.sessions.get(sessionId);
      if (!session) {
        this.playerSessions.delete(playerId);
        return;
      }

      // Remove player from session
      const player = session.players.get(playerId);
      if (player) {
        session.players.delete(playerId);
        this.playerSessions.delete(playerId);
        console.log("Removed player ${player.name} from session ${sessionId}");
      }

      // If no players left, cleanup session
      if (session.players.size === 0) {
        this.cleanupSession(sessionId);
        console.log("Cleaned up empty session: ${sessionId}");
        return;
      }

      // If game master left during waiting, assign new master
      if (player && player.isGameMaster && session.status === "waiting") {
        const remainingPlayers = Array.from(session.players.values());
        if (remainingPlayers.length > 0) {
          remainingPlayers[0].isGameMaster = true;
          session.masterId = remainingPlayers[0].id;
          console.log("New game master: ${remainingPlayers[0].name}");
          
          // Notify players about new master
          io.to(sessionId).emit("new-game-master", {
            newMasterId: remainingPlayers[0].id,
            newMasterName: remainingPlayers[0].name
          });
        }
      }

      // Notify remaining players
      io.to(sessionId).emit("player-left", {
        playerId: playerId,
        playerName: player?.name,
        playerCount: session.players.size,
        players: this.getPlayersData(session)
      });

    } catch (error) {
      console.error("Error in handlePlayerDisconnect:", error);
    }
  }

  getSessionByMasterId(masterId) {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.masterId === masterId) {
        return session;
      }
    }
    return null;
  }

  debugSessionState(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
        return { error: "Session not found" };
    }

    return {
        sessionId: session.id,
        status: session.status,
        currentQuestion: session.currentQuestion,
        currentAnswer: session.currentAnswer,
        timeRemaining: session.timeRemaining,
        masterId: session.masterId,
        players: this.getPlayersData(session),
        hasActiveTimer: this.gameTimers.has(sessionId)
    };
  }
}

module.exports = new GameService();