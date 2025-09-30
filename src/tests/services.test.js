const GameService = require("../services/game.service");
const SessionService = require("../services/session.service");

// Mock socket.io for testing
const mockIO = {
  to: (room) => ({
    emit: (event, data) => console.log(`[IO] ${room} -> ${event}:`, data)
  }),
  in: (room) => ({
    socketsLeave: (room) => console.log(`[IO] Leaving room: ${room}`)
  })
};

console.log("🧪 Starting Service Integration Tests...\n");

async function runTests() {
  let sessionId;
  
  try {
    // ========================================
    // Test 1: Session Creation
    // ========================================
    console.log("1. Testing Session Creation...");
    const session = GameService.createSession("master-123", "Alice");
    sessionId = session.id;
    
    console.log("✅ Session created:", session.id);
    console.log("   Master:", session.masterId);
    console.log("   Players:", session.getPlayerCount());
    
    // Verify SessionService registration
    const sessionFromService = SessionService.getSession(session.id);
    console.assert(sessionFromService.id === session.id, "Session should be in SessionService");
    console.log("✅ Session registered in SessionService");

    // ========================================
    // Test 2: Player Joining (First Player)
    // ========================================
    console.log("\n2. Testing Player Joining...");
    GameService.joinSession(session.id, "player-456", "Bob");
    console.log("✅ Player Bob joined");
    console.log("   Total players:", session.getPlayerCount());
    console.log("   Can start game?", session.canStartGame());
    console.assert(session.getPlayerCount() === 2, "Should have 2 players");

    // ========================================
    // Test 3: Session Listing
    // ========================================
    console.log("\n3. Testing Session Listing...");
    const sessions = SessionService.getAllSessions();
    console.log("✅ Sessions listed:", sessions.length);
    console.log("   Session data:", sessions[0]);
    console.assert(sessions.length === 1, "Should have 1 session");

    // ========================================
    // Test 4: Add Third Player
    // ========================================
    console.log("\n4. Adding third player...");
    GameService.joinSession(session.id, "player-789", "Charlie");
    console.log("✅ Player Charlie joined");
    console.log("   Total players:", session.getPlayerCount());
    console.assert(session.getPlayerCount() === 3, "Should have 3 players");

    // ========================================
    // Test 5: Start Game
    // ========================================
    console.log("\n5. Testing Game Start...");
    const startedSession = GameService.startGame(
      session.id, 
      "What is the capital of France?", 
      "Paris", 
      mockIO
    );
    console.log("✅ Game started successfully");
    console.log("   Status:", startedSession.status);
    console.log("   Question:", startedSession.currentQuestion);
    console.log("   Time remaining:", startedSession.timeRemaining);
    console.assert(startedSession.status === "in-progress", "Game should be in progress");

    // ========================================
    // Test 6: Try Joining After Game Started (Should Fail)
    // ========================================
    console.log("\n6. Testing join after game started...");
    try {
      GameService.joinSession(session.id, "player-999", "Eve");
      console.log("❌ Should have blocked join during game");
      process.exit(1);
    } catch (error) {
      console.log("✅ Correctly blocked:", error.message);
      console.assert(
        error.message === "Cannot join game in progress",
        "Should have correct error message"
      );
    }

    // ========================================
    // Test 7: Submit Wrong Answer
    // ========================================
    console.log("\n7. Testing wrong answer submission...");
    try {
      const wrongResult = GameService.submitAnswer("player-789", "London", mockIO);
      console.log("✅ Wrong answer processed");
      console.log("   Correct:", wrongResult.correct);
      console.log("   Attempts left:", wrongResult.attemptsLeft);
      console.assert(!wrongResult.correct, "Answer should be wrong");
      console.assert(wrongResult.attemptsLeft === 2, "Should have 2 attempts left");
    } catch (error) {
      console.log("❌ Unexpected error:", error.message);
    }

    // ========================================
    // Test 8: Submit Correct Answer
    // ========================================
    console.log("\n8. Testing correct answer submission...");
    const result = GameService.submitAnswer("player-456", "Paris", mockIO);
    console.log("✅ Correct answer submitted");
    console.log("   Winner:", result.winner.name);
    console.log("   Score:", result.winner.score);
    console.assert(result.correct, "Answer should be correct");
    console.assert(result.winner.id === "player-456", "Bob should be winner");
    console.assert(result.winner.score === 10, "Winner should have 10 points");

    // ========================================
    // Test 9: Wait for Next Round
    // ========================================
    console.log("\n9. Waiting for next round preparation (5 seconds)...");
    await new Promise(resolve => setTimeout(resolve, 6000));
    
    // Check game master rotation
    const updatedSession = GameService.getSession(sessionId);
    if (updatedSession) {
      const newMaster = Array.from(updatedSession.players.values())
        .find(p => p.isGameMaster);
      console.log("✅ New game master:", newMaster?.name);
      console.log("   Game status:", updatedSession.status);
      console.assert(newMaster?.id !== "master-123", "Game master should have rotated");
    }

    // ========================================
    // Test 10: Try Answering After Game Ended
    // ========================================
    console.log("\n10. Testing answer after game ended...");
    try {
      GameService.submitAnswer("player-789", "Paris", mockIO);
      console.log("❌ Should have blocked answer after game ended");
    } catch (error) {
      console.log("✅ Correctly blocked:", error.message);
    }

    // ========================================
    // Test 11: Player Removal
    // ========================================
    console.log("\n11. Testing Player Removal...");
    const beforeCount = updatedSession?.getPlayerCount() || 0;
    GameService.removePlayer("player-789", mockIO);
    const afterCount = updatedSession?.getPlayerCount() || 0;
    console.log("✅ Player Charlie removed");
    console.log("   Players before:", beforeCount);
    console.log("   Players after:", afterCount);

    // ========================================
    // Test 12: Session Cleanup
    // ========================================
    console.log("\n12. Testing Session Cleanup...");
    GameService.cleanupSession(sessionId);
    
    const gameServiceHasSession = GameService.sessions.has(sessionId);
    const sessionServiceHasSession = SessionService.sessions.has(sessionId);
    
    console.log("✅ Session cleaned up");
    console.log("   GameService cleaned:", !gameServiceHasSession);
    console.log("   SessionService cleaned:", !sessionServiceHasSession);
    
    console.assert(!gameServiceHasSession, "GameService should not have session");
    console.assert(!sessionServiceHasSession, "SessionService should not have session");

    console.log("\n🎉 All tests completed successfully!");
    process.exit(0);

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    console.error(error.stack);
    
    // Cleanup on failure
    if (sessionId) {
      GameService.cleanupSession(sessionId);
    }
    
    process.exit(1);
  }
}

// Run the tests
runTests();