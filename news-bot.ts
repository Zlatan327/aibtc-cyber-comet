import { getWalletManager } from "./src/services/wallet-manager.js";
import { p2wpkh, NETWORK as BTC_MAINNET } from "@scure/btc-signer";
import { bip322Sign } from "./src/utils/bip322.js";
import { appendFileSync } from "fs";
import { join } from "path";
import cron from "node-cron";

// Used to cycle through tags each run based on time of day
const BEATS = [
  { slug: "agent-trading", tags: ["ai", "crypto", "trading"] },
  { slug: "infrastructure", tags: ["mcp", "agents", "bitcoin"] },
  { slug: "bitcoin-macro", tags: ["btc", "macro", "llms"] }
];
let beatIndex = 0;

async function fetchLatestArxiv(): Promise<{ title: string; summary: string; url: string }> {
  const arxivUrl = "http://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.MA&sortBy=submittedDate&sortOrder=descending&max_results=1";
  const res = await fetch(arxivUrl);
  const xml = await res.text();
  
  // Extract only the content inside the first <entry> block
  const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
  if (!entryMatch) throw new Error("Could not find <entry> in Arxiv response");
  const entryXml = entryMatch[1];

  const titleMatch = entryXml.match(/<title>([^<]+)<\/title>/);
  const summaryMatch = entryXml.match(/<summary>([^<]+)<\/summary>/);
  const idMatch = entryXml.match(/<id>([^<]+)<\/id>/);
  
  if (!titleMatch || !summaryMatch || !idMatch) {
    throw new Error("Could not parse Arxiv entry details");
  }
  
  const title = titleMatch[1].replace(/\n/g, " ").trim();
  let summary = summaryMatch[1].replace(/\n/g, " ").trim();
  const url = idMatch[1].trim();

  const sentences = summary.split(/(?<=\.)\s+/);
  summary = sentences.slice(0, 3).join(" ");
  if (summary.length > 500) summary = summary.substring(0, 497) + "...";
  
  return { title, summary, url };
}

async function executeSignal() {
  try {
    console.log(`[${new Date().toISOString()}] Getting intelligence for signal...`);
    const paper = await fetchLatestArxiv();

    const wm = getWalletManager();
    const activeWalletId = await wm.getActiveWalletId();
    if (!activeWalletId) throw new Error("No active wallet");
    const account = await wm.unlock(activeWalletId, "aibtc-secure-password123");

    const method = "POST";
    const path = "/api/signals";
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `${method} ${path}:${timestamp}`;

    const scriptPubKey = p2wpkh(account.btcPublicKey!, BTC_MAINNET).script;
    const signature = bip322Sign(message, account.btcPrivateKey!, scriptPubKey);

    const authHeaders = {
      "X-BTC-Address": account.btcAddress!,
      "X-BTC-Signature": signature,
      "X-BTC-Timestamp": String(timestamp),
      "Content-Type": "application/json",
    };

    const currentBeat = BEATS[beatIndex % BEATS.length];
    beatIndex++;

    const payload = {
      beat_slug: currentBeat.slug, // Uses standard ones like Infrastructure since our first one succeeded for agent-trading
      btc_address: account.btcAddress,
      headline: paper.title.substring(0, 120),
      body: `According to a newly published AI research paper on Arxiv:\n\n${paper.summary}\n\nRead the full technical paper here: ${paper.url}`,
      sources: [{ url: paper.url, title: "Arxiv Pre-print Document" }],
      tags: currentBeat.tags,
      disclosure: "Intelligence signal automatically sourced from Arxiv API endpoints via Cyber Comet agent."
    };

    const res = await fetch("https://aibtc.news/api/signals", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(payload),
    });

    const responseText = await res.text();
    let status = "failed";
    let txid = "N/A";
    try {
      const data = JSON.parse(responseText);
      if (res.ok) { status = "submitted"; txid = data.id || "pending"; }
    } catch(e) { }

    const logEntry = `| ${new Date().toISOString()} | ${currentBeat.slug} | ${payload.headline.replace(/\|/g,"-")} | [Arxiv](${paper.url}) | ${status} | ${txid} |\n`;
    appendFileSync(join(process.cwd(), "..", "news-log.md"), logEntry);
    console.log(`Signal execution completed. Log updated (Status: ${status}).`);
  } catch (error) {
    console.error("Signal Execution failed:", error);
  }
}

// Check if running as a one-off or daemon mode
if (process.argv.includes("--daemon")) {
  console.log("Starting aibtc-news daemon...");
  
  // Scrapes Arxiv at 06:00 UTC
  cron.schedule("0 6 * * *", () => {
    console.log("Running 06:00 UTC Signal...");
    executeSignal();
  }, { timezone: "UTC" });

  // Scrapes Arxiv at 13:00 UTC
  cron.schedule("0 13 * * *", () => {
    console.log("Running 13:00 UTC Signal...");
    executeSignal();
  }, { timezone: "UTC" });

  // Scrapes Arxiv at 20:00 UTC
  cron.schedule("0 20 * * *", () => {
    console.log("Running 20:00 UTC Signal...");
    executeSignal();
  }, { timezone: "UTC" });
  
  console.log("Cron schedules loaded. Bot is actively waiting for next trigger.");
} else {
  // If run normally, just execute once for testing/manual triggering
  executeSignal();
}
