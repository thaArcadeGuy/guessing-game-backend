class GameSession {
  constructor(masterId, masterName) {
    this.id = this._generatedId();
    this.masterId = masterId;
    this.players = new Map();
    this.status = "waiting";
    this.currentQuestion = "";
    this.currentAnswer = "";
    this.timeRemaining = 60;
    this.timer = null;
    this.createdAt = new Date();
    this.addPlayer(masterId, masterName, true);
  }

  _generatedId() {
    return "session_" + Math.random().toString(36).substr(2,9);
  }

  addPlayer(playerId, playerName, isGameMaster = false) {
    const Player = require("./Player");
    const player = new Player(playerId, playerName, isGameMaster);
    this.players.set(playerId, player);
    return player;
  }

  getPlayerCount() {
    return this.players.size;
  }

  canStartGame() {
    return this.getPlayerCount() >= 2 && this.status === "waiting"
  }

   getPlayer(playerId) {
    return this.players.get(playerId);
  }

  removePlayer(playerId) {
    return this.players.delete(playerId);
  }

  getPlayersList() {
    return Array.from(this.players.values());
  }

  isPlayerInSession(playerId) {
    return this.players.has(playerId);
  }
}

module.exports = GameSession;