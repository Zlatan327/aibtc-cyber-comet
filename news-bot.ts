import { getWalletManager } from "./src/services/wallet-manager.js";
import { p2wpkh, NETWORK as BTC_MAINNET } from "@scure/btc-signer";
import { bip322Sign } from "./src/utils/bip322.js";
import { appendFileSync } from "fs";
import { join } from "path";
import cron from "node-cron";

// ─── Beat Config ────────────────────────────────────────────────────────────
// Each beat has tailored Arxiv search queries and editorial angles
const BEAT_CONFIGS = [
  {
    slug: "agent-trading",
    name: "Agent Trading",
    tags: ["ai-agents", "autonomous-trading", "bitcoin", "reinforcement-learning"],
    queries: [
      "cat:cs.AI+AND+(trading+OR+market+OR+portfolio+OR+finance)",
      "cat:cs.MA+AND+(multi-agent+OR+auction+OR+mechanism)",
      "cat:q-fin.TR+AND+(machine+learning+OR+deep+reinforcement)",
    ],
    angle: "trading and autonomous agent market behaviour",
  },
  {
    slug: "infrastructure",
    name: "Infrastructure",
    tags: ["bitcoin", "mcp", "agent-infrastructure", "protocols"],
    queries: [
      "cat:cs.NI+AND+(agent+OR+protocol+OR+decentralized)",
      "cat:cs.DC+AND+(bitcoin+OR+blockchain+OR+consensus)",
      "cat:cs.CR+AND+(zero-knowledge+OR+cryptography+OR+proof)",
    ],
    angle: "decentralised infrastructure, protocols, and cryptographic primitives",
  },
  {
    slug: "bitcoin-macro",
    name: "Bitcoin Macro",
    tags: ["bitcoin", "macro", "monetary-policy", "llm"],
    queries: [
      "cat:econ.GN+AND+(bitcoin+OR+cryptocurrency+OR+monetary)",
      "cat:cs.CL+AND+(finance+OR+macro+OR+economics+OR+market)",
      "cat:q-fin.EC+AND+(digital+currency+OR+central+bank)",
    ],
    angle: "macroeconomics, Bitcoin monetary dynamics, and AI reasoning over markets",
  },
];

let beatIndex = 0;

// ─── Arxiv Fetch ─────────────────────────────────────────────────────────────
interface ArxivPaper {
  title: string;
  summary: string;
  url: string;
  authors: string;
}

async function fetchArxivPapers(query: string, count = 3): Promise<ArxivPaper[]> {
  const arxivUrl = `http://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}&sortBy=submittedDate&sortOrder=descending&max_results=${count}`;
  const res = await fetch(arxivUrl);
  const xml = await res.text();

  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
  const papers: ArxivPaper[] = [];

  for (const match of entries) {
    const entryXml = match[1];
    const titleMatch = entryXml.match(/<title>([\s\S]+?)<\/title>/);
    const summaryMatch = entryXml.match(/<summary>([\s\S]+?)<\/summary>/);
    const idMatch = entryXml.match(/<id>([^<]+)<\/id>/);
    const authorMatches = [...entryXml.matchAll(/<name>([^<]+)<\/name>/g)];

    if (!titleMatch || !summaryMatch || !idMatch) continue;

    const title = titleMatch[1].replace(/\s+/g, " ").trim();
    const summary = summaryMatch[1].replace(/\s+/g, " ").trim();
    const url = idMatch[1].trim().replace("http://", "https://");
    const authors = authorMatches
      .slice(0, 3)
      .map((a) => a[1])
      .join(", ");

    papers.push({ title, summary, url, authors });
  }

  return papers;
}

// ─── Editorial Signal Assembly ────────────────────────────────────────────────
// This function builds a high-quality, analytical signal from multiple papers
// mimicking the editorial voice of top agents on aibtc.news
function craftSignal(papers: ArxivPaper[], beat: typeof BEAT_CONFIGS[0]): {
  headline: string;
  body: string;
  sources: { url: string; title: string }[];
} {
  if (papers.length === 0) throw new Error("No papers found for signal crafting");

  const primary = papers[0];
  const secondary = papers[1];

  // Headline: concise, specific, uses the primary paper's finding
  const headline = primary.title.length > 120
    ? primary.title.substring(0, 117) + "..."
    : primary.title;

  // ─── Body: structured editorial format ───────────────────────────────────
  // Paragraph 1: What is the primary finding and why it matters to the beat
  const primarySummaryShort = primary.summary
    .split(/(?<=\.)\s+/)
    .slice(0, 4)
    .join(" ");

  let body = `**${primary.title}**\n\n`;
  body += `${primarySummaryShort}\n\n`;

  if (secondary) {
    // Paragraph 2: Connect the secondary paper to build a fuller picture
    const secondarySummaryShort = secondary.summary
      .split(/(?<=\.)\s+/)
      .slice(0, 3)
      .join(" ");

    body += `**Context: ${secondary.title}**\n\n`;
    body += `${secondarySummaryShort}\n\n`;
  }

  // Paragraph 3: Editorial synthesis — why this matters to Bitcoin/AI agents
  body += `**Signal Relevance — ${beat.name} Beat**\n\n`;
  body += `These findings intersect directly with ${beat.angle}. `;

  if (beat.slug === "agent-trading") {
    body += `Autonomous AI agents operating in Bitcoin-native markets depend on advances in multi-agent coordination and decision theory. `;
    body += `The research above captures the current frontier: where machine reasoning meets market microstructure. `;
    body += `Agents that incorporate these techniques will better navigate adversarial market conditions and optimise execution in ordinals and sBTC liquidity pools.`;
  } else if (beat.slug === "infrastructure") {
    body += `The decentralised agent stack — from MCP servers to on-chain identity registries — relies on the cryptographic and networking primitives being developed in this research. `;
    body += `Protocol designers building Bitcoin-native tooling should track these results closely.`;
  } else if (beat.slug === "bitcoin-macro") {
    body += `LLMs are increasingly being deployed to reason over macroeconomic signals. `;
    body += `As Bitcoin's role as a macro asset deepens, agents that can synthesise monetary research and economic signals will have a structural edge in longer-horizon portfolio positioning.`;
  }

  // Sources
  const sources: { url: string; title: string }[] = [
    { url: primary.url, title: primary.title.substring(0, 80) },
  ];
  if (secondary) {
    sources.push({ url: secondary.url, title: secondary.title.substring(0, 80) });
  }

  return { headline, body, sources };
}

// ─── Main Signal Execution ────────────────────────────────────────────────────
async function executeSignal() {
  try {
    console.log(`[${new Date().toISOString()}] Getting intelligence for signal...`);

    const beat = BEAT_CONFIGS[beatIndex % BEAT_CONFIGS.length];
    beatIndex++;

    // Fetch from two different queries to get diverse papers
    const query1 = beat.queries[0];
    const query2 = beat.queries[1] || beat.queries[0];

    const [batch1, batch2] = await Promise.all([
      fetchArxivPapers(query1, 3),
      fetchArxivPapers(query2, 2),
    ]);

    // Deduplicate by URL and pick best 2
    const all = [...batch1, ...batch2];
    const seen = new Set<string>();
    const papers: ArxivPaper[] = [];
    for (const p of all) {
      if (!seen.has(p.url) && papers.length < 2) {
        seen.add(p.url);
        papers.push(p);
      }
    }

    if (papers.length === 0) throw new Error("No papers found from Arxiv queries");

    const { headline, body, sources } = craftSignal(papers, beat);

    // ─── Build Auth Headers ──────────────────────────────────────────────────
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

    // ─── Submit Signal ───────────────────────────────────────────────────────
    const payload = {
      beat_slug: beat.slug,
      btc_address: account.btcAddress,
      headline,
      body,
      sources,
      tags: beat.tags,
      disclosure: "Signal researched and synthesised by Cyber Comet. Sources: Arxiv preprint database. AI assistance: claude-sonnet-4-6.",
    };

    console.log(`[${new Date().toISOString()}] Submitting signal to beat: ${beat.name}...`);
    console.log(`Headline: ${headline}`);

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
      if (res.ok) {
        status = "submitted";
        txid = data.id || "pending";
        console.log(`✅ Signal submitted! ID: ${txid}`);
      } else {
        console.error(`❌ API error ${res.status}:`, responseText.substring(0, 200));
      }
    } catch (e) {
      console.error("Failed to parse API response:", responseText.substring(0, 200));
    }

    const logEntry = `| ${new Date().toISOString()} | ${beat.slug} | ${headline.replace(/\|/g, "-").replace(/\*\*/g, "").substring(0, 80)} | ${sources[0].url} | ${status} | ${txid} |\n`;
    try {
      appendFileSync(join(process.cwd(), "..", "news-log.md"), logEntry);
    } catch (_) { /* log file is optional */ }

    console.log(`Signal execution completed. Status: ${status}`);
  } catch (error) {
    console.error("Signal Execution failed:", error);
  }
}

// ─── Scheduler ───────────────────────────────────────────────────────────────
if (process.argv.includes("--daemon")) {
  console.log("Starting Cyber Comet news daemon...");

  // 06:00 UTC — Morning briefing
  cron.schedule("0 6 * * *", () => {
    console.log("Running 06:00 UTC morning signal...");
    executeSignal();
  }, { timezone: "UTC" });

  // 13:00 UTC — Midday signal
  cron.schedule("0 13 * * *", () => {
    console.log("Running 13:00 UTC midday signal...");
    executeSignal();
  }, { timezone: "UTC" });

  // 20:00 UTC — Evening signal
  cron.schedule("0 20 * * *", () => {
    console.log("Running 20:00 UTC evening signal...");
    executeSignal();
  }, { timezone: "UTC" });

  console.log("Cron schedules loaded. Cyber Comet is watching the research frontier.");
} else {
  // Manual / one-off run
  executeSignal();
}
