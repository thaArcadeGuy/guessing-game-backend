const GameService = require("../services/game.service");

// Enhanced mock IO with better logging
const mockIO = {
  to: (room) => ({
    emit: (event, data) => console.log(`   [${room}] ${event}:`, JSON.stringify(data).substring(0, 100))
  }),
  in: (room) => ({
    socketsLeave: (room) => console.log(`   [IO] Leaving room: ${room}`)
  })
};

console.log("🎮 Starting Game Logic Tests...\n");

async function runAllTests() {
  try {
    await testThreeAttemptsLimit();
    await testCaseInsensitiveAnswers();
    await testGameMasterLeaving();
    await testWinnerScenario();
    await testTimeoutScenario();
    await testMultiplePlayers();
    
    console.log("\n🎉 All game logic tests completed!");
  } catch (error) {
    console.error("❌ Test suite failed:", error);
  }
}

async function testThreeAttemptsLimit() {
  console.log("=== Testing 3 Attempts Limit ===");
  
  const session = GameService.createSession("m1", "Alice");
  GameService.joinSession(session.id, "p1", "Bob");
  GameService.joinSession(session.id, "p2", "Charlie"); // Need 2+ players to start
  
  GameService.startGame(session.id, "Question?", "correct", mockIO);
  
  // Attempt 1
  let result = GameService.submitAnswer("p1", "wrong1", mockIO);
  console.log(`   Attempt 1: ${result.attemptsLeft} attempts left`);
  
  // Attempt 2
  result = GameService.submitAnswer("p1", "wrong2", mockIO);
  console.log(`   Attempt 2: ${result.attemptsLeft} attempts left`);
  
  // Attempt 3
  result = GameService.submitAnswer("p1", "wrong3", mockIO);
  console.log(`   Attempt 3: ${result.attemptsLeft} attempts left`);
  
  // Attempt 4 - should fail
  try {
    GameService.submitAnswer("p1", "wrong4", mockIO);
    console.log("❌ Should block 4th attempt");
  } catch (error) {
    console.log("✅ Correctly blocked 4th attempt:", error.message);
  }
  
  GameService.cleanupSession(session.id);
}

async function testCaseInsensitiveAnswers() {
  console.log("\n=== Testing Case Insensitive Answers ===");
  
  const session = GameService.createSession("m1", "Alice");
  GameService.joinSession(session.id, "p1", "Bob");
  GameService.joinSession(session.id, "p2", "Charlie");
  
  GameService.startGame(session.id, "Capital of France?", "Paris", mockIO);
  
  const tests = [
    { input: "PARIS", shouldWork: true },
    { input: "paris", shouldWork: true },
    { input: "PaRiS", shouldWork: true },
    { input: "  Paris  ", shouldWork: true },
    { input: "london", shouldWork: false }
  ];
  
  for (const test of tests) {
    try {
      const result = GameService.submitAnswer("p1", test.input, mockIO);
      if (test.shouldWork && result.correct) {
        console.log(`✅ "${test.input}" → Correct (game ended)`);
        break; // Game ends on correct answer
      } else if (!test.shouldWork && !result.correct) {
        console.log(`✅ "${test.input}" → Wrong (as expected)`);
      } else {
        console.log(`❌ "${test.input}" → Unexpected result`);
      }
    } catch (error) {
      console.log(`⚠️  "${test.input}" → Error:`, error.message);
    }
  }
  
  GameService.cleanupSession(session.id);
}

async function testGameMasterLeaving() {
  console.log("\n=== Testing Game Master Leaving ===");
  
  const session = GameService.createSession("m1", "Alice");
  GameService.joinSession(session.id, "p1", "Bob");
  GameService.joinSession(session.id, "p2", "Charlie");
  
  console.log(`   Before: Master is ${session.masterId} (Alice)`);
  
  // Remove game master
  GameService.removePlayer("m1", mockIO);
  
  // Bob should become new game master (first remaining player)
  const newMaster = Array.from(session.players.values())
    .find(p => p.isGameMaster);
  
  if (newMaster && newMaster.id === "p1") {
    console.log(`   After: Master is ${newMaster.id} (${newMaster.name}) ✅`);
  } else {
    console.log(`   ❌ Expected p1 to be master, got:`, newMaster);
  }
  
  GameService.cleanupSession(session.id);
}

async function testWinnerScenario() {
  console.log("\n=== Testing Winner Scenario ===");
  
  const session = GameService.createSession("m1", "Alice");
  GameService.joinSession(session.id, "p1", "Bob");
  GameService.joinSession(session.id, "p2", "Charlie");
  
  GameService.startGame(session.id, "2+2?", "4", mockIO);
  
  // Bob answers correctly
  const result = GameService.submitAnswer("p1", "4", mockIO);
  
  if (result.correct && result.winner) {
    console.log(`   ✅ ${result.winner.name} won with score: ${result.winner.score}`);
    
    // Verify Bob"s score increased
    const bob = session.players.get("p1");
    if (bob.score === 10) {
      console.log("   ✅ Score correctly increased to 10");
    } else {
      console.log(`   ❌ Expected score 10, got: ${bob.score}`);
    }
  } else {
    console.log("   ❌ Winner scenario failed");
  }
  
  GameService.cleanupSession(session.id);
}

async function testTimeoutScenario() {
  console.log("\n=== Testing Timeout Scenario ===");
  
  const session = GameService.createSession("m1", "Alice");
  GameService.joinSession(session.id, "p1", "Bob");
  GameService.joinSession(session.id, "p2", "Charlie");
  
  GameService.startGame(session.id, "Hard question?", "answer", mockIO);
  
  // Manually trigger timeout by setting time to 0
  session.timeRemaining = 0;
  GameService.endGameByTimeout(session.id, mockIO);
  
  if (session.status === "ended") {
    console.log("   ✅ Game ended by timeout");
  } else {
    console.log("   ❌ Timeout scenario failed");
  }
  
  GameService.cleanupSession(session.id);
}

async function testMultiplePlayers() {
  console.log("\n=== Testing Multiple Players ===");
  
  const session = GameService.createSession("m1", "Alice");
  GameService.joinSession(session.id, "p1", "Bob");
  GameService.joinSession(session.id, "p2", "Charlie");
  GameService.joinSession(session.id, "p3", "Diana");
  
  console.log(`   Players: ${session.getPlayerCount()}`);
  console.log(`   Can start: ${session.canStartGame()}`);
  
  // Test that only game master can start
  try {
    // This should fail if we try as non-master (but our service doesn"t check sender)
    GameService.startGame(session.id, "Test?", "answer", mockIO);
    console.log("   ✅ Game started with multiple players");
  } catch (error) {
    console.log("   ❌ Failed to start with multiple players:", error.message);
  }
  
  GameService.cleanupSession(session.id);
}

// Run all tests
runAllTests();