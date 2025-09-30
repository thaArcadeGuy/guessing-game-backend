const http = require("http");
const app = require("./app");
console.log('🔧 Loading socket handlers...');
const { setupSockets } = require("./sockets");

const PORT = process.env.PORT || 4000;

const server = http.createServer(app);

const io = setupSockets(server);
console.log("✅ Socket handlers loaded");

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
})