class Player {
  constructor(id, name, isGameMaster = false, socketId = null) {
    this.id = id;
    this.name = name;
    this.score = 0;
    this.attempts = 0;
    this.hasAnswered = false;
    this.isGameMaster = isGameMaster;
    this.socketId = socketId || id;
  }

  resetForNewRound() {
    this.attempts = 0;
    this.hasAnswered = false
    console.log(`Reset player ${this.name} for new round`);
  }

  addScore(points) {
    this.score += points;
  }

  canGuess(maxAttempts = 3) {
    return this.attempts < maxAttempts && !this.hasAnswered;
  }

  recordGuess() {
    this.attempts += 1;
  }
}

module.exports = Player;