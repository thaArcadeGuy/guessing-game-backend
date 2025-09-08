const http = require("http");
const app = require("./app");
const { setupSockets } = require("./sockets");

const PORT = process.env.PORT || 4000;

const server = http.createServer(app);

setupSockets(server);

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
})