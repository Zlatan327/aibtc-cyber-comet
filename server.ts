/**
 * Render Web Service wrapper — Cyber Comet
 *
 * Starts a minimal HTTP server so Render doesn't mark us as crashed,
 * while the real work (heartbeat + news-bot) runs as supervised child processes.
 *
 * Features:
 *  - Auto-restarts crashed child processes (with exponential back-off)
 *  - /health endpoint shows live process status (used by UptimeBot)
 *  - Graceful shutdown on SIGTERM
 */
import { createServer, IncomingMessage, ServerResponse } from "http";
import { spawn, ChildProcess } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const PORT = process.env.PORT || 3000;
const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Process state tracking ──────────────────────────────────────────────────
interface ManagedProcess {
  name: string;
  pid: number | undefined;
  running: boolean;
  restarts: number;
  lastStarted: string;
  lastExitCode: number | null;
}

const state: Record<string, ManagedProcess> = {
  heartbeat: { name: "heartbeat", pid: undefined, running: false, restarts: 0, lastStarted: "", lastExitCode: null },
  newsbot:   { name: "newsbot",   pid: undefined, running: false, restarts: 0, lastStarted: "", lastExitCode: null },
};

// ─── Supervised spawn with auto-restart ──────────────────────────────────────
function spawnManaged(
  key: "heartbeat" | "newsbot",
  args: string[],
  delayMs = 0
): void {
  setTimeout(() => {
    console.log(`[server] Launching ${key}...`);
    const proc: ChildProcess = spawn("npx", ["tsx", ...args], {
      stdio: "inherit",
      shell: true,
      env: { ...process.env },
    });

    const s = state[key];
    s.pid = proc.pid;
    s.running = true;
    s.lastStarted = new Date().toISOString();

    proc.on("exit", (code) => {
      s.running = false;
      s.pid = undefined;
      s.lastExitCode = code;
      console.log(`[server] ${key} exited with code ${code}`);

      // Back-off: 10s, 20s, 40s … cap at 5 min
      const backoffMs = Math.min(10_000 * 2 ** s.restarts, 5 * 60_000);
      s.restarts++;
      console.log(`[server] Restarting ${key} in ${backoffMs / 1000}s (attempt #${s.restarts})...`);
      spawnManaged(key, args, backoffMs);
    });

    proc.on("error", (err) => {
      console.error(`[server] Failed to start ${key}:`, err.message);
    });
  }, delayMs);
}

// ─── Boot children ────────────────────────────────────────────────────────────
spawnManaged("heartbeat", [join(__dirname, "heartbeat.ts")]);
// Small delay so heartbeat logs appear first
spawnManaged("newsbot", [join(__dirname, "news-bot.ts"), "--daemon"], 2_000);

// ─── HTTP server ──────────────────────────────────────────────────────────────
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = req.url ?? "/";

  // /health — structured status (used by UptimeBot & Render health checks)
  if (url === "/health" || url === "/health/") {
    const healthy = state.heartbeat.running && state.newsbot.running;
    res.writeHead(healthy ? 200 : 503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      agent: "Cyber Comet",
      status: healthy ? "healthy" : "degraded",
      uptime: Math.floor(process.uptime()),
      processes: {
        heartbeat: {
          running: state.heartbeat.running,
          pid: state.heartbeat.pid,
          restarts: state.heartbeat.restarts,
          lastStarted: state.heartbeat.lastStarted,
          lastExitCode: state.heartbeat.lastExitCode,
        },
        newsbot: {
          running: state.newsbot.running,
          pid: state.newsbot.pid,
          restarts: state.newsbot.restarts,
          lastStarted: state.newsbot.lastStarted,
          lastExitCode: state.newsbot.lastExitCode,
        },
      },
      timestamp: new Date().toISOString(),
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
  console.log("[server] Heartbeat + News Bot launched with auto-restart supervision");
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
process.on("SIGTERM", () => {
  console.log("[server] SIGTERM received — shutting down...");
  server.close(() => process.exit(0));
});
