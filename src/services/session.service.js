class SessionService {
  constructor() {
    this.sessions = new Map();
  }

  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error("Session not found");
    return session;
  }

  leaveSession(sessionId, socketId) {
    const session = this.getSession(sessionId);

    if (!session.players.has(socketId)) {
      throw new Error("Player not in this session");
    }

    session.players.delete(socketId);

    if (session.players.size === 0) {
      this.sessions.delete(sessionId);
    }

    return session
  }

  endSession(sessionId, socketId) {
    const session = this.getSession(sessionId);

    const player = session.players.get(socketId);
    if (!player || !player.isGameMaster) {
      throw new Error("Only game master can end the session");
    }

    this.sessions.delete(sessionId);
    return session;
  }

  getAllSessions() {
    return Array.from(this.sessions.values()).map(session => ({
      id: session.id,
      playerCount: session.players.size,
      createdAt: session.createdAt,
      gameStarted: session.gameStarted
    }));
  }

   registerSession(session) {
    this.sessions.set(session.id, session);
  }
}

module.exports = new SessionService();