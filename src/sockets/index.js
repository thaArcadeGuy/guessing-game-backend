const sessionSocket = require("./session.socket");
const gameSocket = require("./game.socket");
const playerSocket = require("./player.socket");

function setupSockets(server) {
  const io = require("socket.io")(server, {
    cors: { origin: "*" }
  });

  io.on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Initialize socket modules
    sessionSocket(io, socket);
    gameSocket(io, socket);
    playerSocket(io, socket);
  })
}

module.exports = { setupSockets };