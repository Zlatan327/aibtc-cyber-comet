/**
 * Render Web Service wrapper
 * Starts a minimal HTTP server so Render doesn't mark us as crashed,
 * while the real work runs in background threads.
 */
import { createServer } from "http";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const PORT = process.env.PORT || 3000;
const __dirname = dirname(fileURLToPath(import.meta.url));

// Boot the heartbeat process
const heartbeat = spawn("npx", ["tsx", join(__dirname, "heartbeat.ts")], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env }
});

// Boot the Agent Trading news bot in daemon mode
const newsbot = spawn("npx", ["tsx", join(__dirname, "agent-trading-news-bot.ts"), "--daemon"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env }
});

heartbeat.on("exit", (code) => console.log(`[heartbeat] exited with code ${code}`));
newsbot.on("exit", (code) => console.log(`[newsbot] exited with code ${code}`));

// Minimal HTTP server — just enough to keep Render happy
const server = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    agent: "Cyber Comet",
    status: "online",
    description: "AIBTC autonomous news correspondent",
    btcAddress: "bc1qu7xnmfmcavj7y8t22ye6g43hjaq2ak7yfyxjnd",
    network: "aibtc"
  }));
});

server.listen(PORT, () => {
  console.log(`[server] Cyber Comet agent running on port ${PORT}`);
  console.log("[server] Heartbeat + News Bot launched in background");
});
