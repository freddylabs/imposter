import { spawn } from "node:child_process";

const server = spawn(process.execPath, ["server/index.ts"], { stdio: "inherit" });
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5173"], {
  stdio: "inherit",
});

function shutdown() {
  server.kill("SIGTERM");
  vite.kill("SIGTERM");
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});
process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});

server.on("exit", (code) => {
  if (code) {
    vite.kill("SIGTERM");
    process.exit(code);
  }
});
