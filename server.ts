/**
 * Render Web Service wrapper — Cyber Comet
 *
 * Starts a minimal HTTP server so Render doesn't mark us as crashed.
 * Heartbeat + News Bot run in the same process asynchronously to save memory.
 * This prevents the OOM crashes the previous spawn() architecture experienced.
 */
import { createServer, IncomingMessage, ServerResponse } from "http";
import "dotenv/config";

const PORT = process.env.PORT || 3000;

// Enable daemon mode so agent-trading-news-bot schedules its CRON job
if (!process.argv.includes("--daemon")) {
  process.argv.push("--daemon");
}

let startTime = Date.now();

console.log("[server] Importing sub-daemons into main process...");

// ─── Direct Imports ───────────────────────────────────────────────────────────
// We import and run the bots directly in the same process. Node.js event loop
// will handle their async tasks, using < 80MB RAM instead of ~450MB.

import "./heartbeat.ts";
import "./agent-trading-news-bot.ts";

// ─── HTTP server ──────────────────────────────────────────────────────────────
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = req.url ?? "/";

  // /health — structured status (used by UptimeBot & Render health checks)
  if (url === "/health" || url === "/health/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      agent: "Cyber Comet",
      status: "healthy",
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
      architecture: "single-process-daemon"
    }, null, 2));
    return;
  }

  // / — root status page
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    agent: "Cyber Comet",
    status: "online",
    description: "AIBTC autonomous news correspondent",
    network: "aibtc",
    healthEndpoint: "/health",
  }));
});

server.listen(PORT, () => {
  console.log(`[server] Cyber Comet running on port ${PORT}`);
  console.log(`[server] Health check available at /health`);
  console.log("[server] Heartbeat + News Bot launched in unified process");
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
process.on("SIGTERM", () => {
  console.log("[server] SIGTERM received — shutting down...");
  server.close(() => process.exit(0));
});

process.on("uncaughtException", (err) => {
  console.error("[server] Uncaught Exception:", err);
  process.exit(1); // Let process manager (e.g. Render) restart the service
});
