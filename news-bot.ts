/**
 * Cyber Comet — AIBTC News Bot (v3 — spec-compliant + LLM synthesis)
 *
 * Fixes from official aibtc-news/aibtc-news.ts SKILL audit:
 *  1. API field: "body" → "content" (was silently rejected by API)
 *  2. Content hard limit: 1000 chars (target 200-380 chars — not words)
 *  3. disclosure: JSON object { models, tools, notes } — not a plain string
 *  4. sources: array of URL strings — not [{url, title}] objects
 *  5. btc_address removed from body (auth is via X-BTC-Address header only)
 *  6. Rate limit: 1 per 4 hours — cron changed from 3-hourly to 4-hourly
 *  7. Signals must open with a verifiable specific number (pre-flight rule)
 *  8. LLM synthesis so every signal is unique (no templated aibtcBridge)
 *  9. Seen-paper cache to prevent duplicate submissions across runs
 * 10. Authors regex fixed: /<n>/ → /<name>/
 */

import "dotenv/config";
import { p2wpkh, NETWORK as BTC_MAINNET } from "@scure/btc-signer";
import { deriveBitcoinKeyPair } from "./src/utils/bitcoin.js";
import { bip322Sign } from "./src/utils/bip322.js";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import cron from "node-cron";

if (process.env.CYBER_COMET_USE_LEGACY_NEWS_BOT === "1") {

// ─── Env ──────────────────────────────────────────────────────────────────────

const MNEMONIC = process.env.CLIENT_MNEMONIC?.trim();
const NETWORK = (process.env.NETWORK as "mainnet" | "testnet") || "mainnet";
const GROQ_API_KEY = process.env.GROQ_API_KEY?.trim();

if (!MNEMONIC) {
  console.error("❌ CLIENT_MNEMONIC is not set.");
  process.exit(1);
}
if (!GROQ_API_KEY) {
  console.error("❌ GROQ_API_KEY is not set. Get a free key at console.groq.com");
  process.exit(1);
}

const {
  address: BTC_ADDRESS,
  privateKey: BTC_PRIVATE_KEY,
  publicKeyBytes: BTC_PUBLIC_KEY,
} = deriveBitcoinKeyPair(MNEMONIC, NETWORK);

console.log(`[news-bot] BTC address: ${BTC_ADDRESS}`);

// ─── Seen-paper cache ─────────────────────────────────────────────────────────

const SEEN_PATH = join(process.cwd(), "seen-papers.json");

function loadSeen(): Set<string> {
  try {
    if (existsSync(SEEN_PATH)) return new Set(JSON.parse(readFileSync(SEEN_PATH, "utf-8")));
  } catch (_) {}
  return new Set<string>();
}
function saveSeen(s: Set<string>) {
  try { writeFileSync(SEEN_PATH, JSON.stringify([...s].slice(-500)), "utf-8"); } catch (_) {}
}
const seenPapers = loadSeen();

// ─── Beat config ──────────────────────────────────────────────────────────────

const BEAT_CONFIGS = [
  {
    slug: "agent-trading",
    name: "Agent Trading",
    tags: ["ai-agents", "autonomous-trading", "bitcoin", "defi"],
    queries: [
      "cat:cs.AI+AND+(autonomous+agent+trading+OR+reinforcement+learning+market)",
      "cat:cs.MA+AND+(multi-agent+market+OR+mechanism+design+decentralized)",
      "cat:q-fin.TR+AND+(machine+learning+OR+deep+reinforcement+portfolio)",
    ],
    editorBrief:
      "You cover Agent Trading for aibtc.news — the paper of record for AI agents on Bitcoin. " +
      "450+ registered agents execute autonomous trades across sBTC pools and ALEX DEX. " +
      "Every signal must open with a specific verifiable number (finding size, accuracy %, dataset count, etc.). " +
      "Bridge the research concretely to aibtc trading agents: what should they build or change right now?",
  },
  {
    slug: "infrastructure",
    name: "Infrastructure",
    tags: ["bitcoin", "mcp", "stacks", "sbtc", "erc8004"],
    queries: [
      "cat:cs.DC+AND+(bitcoin+OR+stacks+OR+layer2+OR+blockchain+consensus)",
      "cat:cs.NI+AND+(agent+protocol+OR+decentralized+identity+OR+verifiable+credential)",
      "cat:cs.CR+AND+(bitcoin+script+OR+taproot+OR+threshold+signature+OR+MPC)",
    ],
    editorBrief:
      "You cover Infrastructure for aibtc.news. " +
      "The aibtc stack: Stacks L2 smart contracts, sBTC for Bitcoin-backed capital, MCP servers, ERC-8004 identity. " +
      "Every signal must open with a specific verifiable number. " +
      "Tell node operators or MCP skill builders exactly what this means for them — not vague 'relevance' language.",
  },
  {
    slug: "bitcoin-macro",
    name: "Bitcoin Macro",
    tags: ["bitcoin", "macro", "monetary-policy", "ai-agents"],
    queries: [
      "cat:econ.GN+AND+(bitcoin+OR+cryptocurrency+OR+digital+asset+monetary)",
      "cat:cs.CL+AND+(financial+reasoning+OR+economic+agent+OR+market+prediction)",
      "cat:q-fin.EC+AND+(digital+currency+OR+bitcoin+OR+stablecoin+capital+flow)",
    ],
    editorBrief:
      "You cover Bitcoin Macro for aibtc.news. " +
      "The community tracks sBTC peg flows, Bitcoin L2 adoption, and how macro conditions shape agent economics. " +
      "Every signal must open with a specific verifiable number from the paper (dataset size, model accuracy, measured effect). " +
      "Connect macro research to what aibtc agents should watch or act on — avoid generic crypto commentary.",
  },
];

let beatIndex = 0;

// ─── Arxiv ────────────────────────────────────────────────────────────────────

interface ArxivPaper {
  title: string;
  summary: string;
  url: string;
  authors: string;
  published: string;
}

async function fetchArxivPapers(query: string, count = 5): Promise<ArxivPaper[]> {
  const url =
    `http://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}` +
    `&sortBy=submittedDate&sortOrder=descending&max_results=${count}`;
  const res = await fetch(url);
  const xml = await res.text();
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
  const papers: ArxivPaper[] = [];

  for (const match of entries) {
    const x = match[1];
    const titleM = x.match(/<title>([\s\S]+?)<\/title>/);
    const summaryM = x.match(/<summary>([\s\S]+?)<\/summary>/);
    const idM = x.match(/<id>([^<]+)<\/id>/);
    const pubM = x.match(/<published>([^<]+)<\/published>/);
    // Fix #10: was /<n>/ — now correctly matches <name>
    const authorMs = [...x.matchAll(/<name>([^<]+)<\/name>/g)];

    if (!titleM || !summaryM || !idM) continue;
    const paperUrl = idM[1].trim().replace("http://", "https://");
    if (seenPapers.has(paperUrl)) continue;

    papers.push({
      title: titleM[1].replace(/\s+/g, " ").trim(),
      summary: summaryM[1].replace(/\s+/g, " ").trim(),
      url: paperUrl,
      authors: authorMs.slice(0, 3).map((a) => a[1]).join(", ") || "Unknown authors",
      published: pubM ? pubM[1].substring(0, 10) : "recent",
    });
  }
  return papers;
}

// ─── LLM synthesis ────────────────────────────────────────────────────────────
// CRITICAL: content must be ≤ 1000 chars. Target 200-380 chars (the "150-400 char
// target" from the correspondent skill). This is characters, NOT words.

async function synthesiseSignal(
  papers: ArxivPaper[],
  beat: (typeof BEAT_CONFIGS)[0]
): Promise<{ headline: string; content: string }> {
  const primary = papers[0];
  const secondary = papers[1];

  const paperCtx = [
    `PAPER 1\nTitle: ${primary.title}\nAuthors: ${primary.authors}\nPublished: ${primary.published}\nAbstract: ${primary.summary.substring(0, 600)}`,
    secondary
      ? `PAPER 2\nTitle: ${secondary.title}\nAbstract: ${secondary.summary.substring(0, 400)}`
      : null,
  ].filter(Boolean).join("\n\n---\n\n");

  const system = `You are a correspondent filing for aibtc.news, the on-chain newspaper for autonomous AI agents on Bitcoin.

${beat.editorBrief}

HARD RULES — violation = auto-rejection:
1. Headline: max 100 chars. Lead with the specific fact/number. Not the paper title. Not clickbait.
2. Content: 200-380 CHARACTERS (not words). Structure: [number/fact] → [why it matters] → [aibtc implication].
   The content field is a single tight paragraph. No markdown. No headers. No bullet points.
3. First word of content must set up or include a specific verifiable number from the paper
   (dataset size, accuracy %, count, measured effect, model parameter count — anything quantified).
4. AIBTC connection must name a specific component: sBTC, ERC-8004, ALEX DEX, Stacks L2, MCP server — only where real.
5. No speculation. No "this suggests." Lead with what was measured or built, then implication.

Return ONLY valid JSON (no markdown fences):
{"headline": "...", "content": "..."}`;

  // Groq uses OpenAI-compatible format — free at console.groq.com
  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: `File a ${beat.name} signal:\n\n${paperCtx}` },
      ],
    }),
  });

  if (!resp.ok) throw new Error(`Groq API ${resp.status}: ${(await resp.text()).substring(0, 200)}`);

  const data = await resp.json();
  const raw = data.choices?.[0]?.message?.content?.trim() ?? "";

  const parsed: { headline: string; content: string } = JSON.parse(raw);
  if (!parsed.headline || !parsed.content) throw new Error("LLM response missing fields");

  // Enforce hard limits in code, not just the prompt
  const headline = parsed.headline.substring(0, 120);
  const content = parsed.content.substring(0, 1000);

  return { headline, content };
}

// ─── Signal submission ────────────────────────────────────────────────────────

async function executeSignal() {
  try {
    console.log(`\n[${new Date().toISOString()}] Checking status...`);

    // Status check
    try {
      const s = await fetch(`https://aibtc.news/api/status/${BTC_ADDRESS}`);
      if (s.ok) {
        const d = await s.json();
        if (d.canFileSignal === false) {
          console.log(`Cooldown: wait ${d.waitMinutes || 0} min. Skipping.`);
          return;
        }
      }
    } catch (_) { console.log("Status check failed — proceeding."); }

    const beat = BEAT_CONFIGS[beatIndex % BEAT_CONFIGS.length];
    beatIndex++;

    // Fetch papers across queries until we have ≥ 2 unseen
    console.log(`Fetching papers for beat: ${beat.name}...`);
    const all: ArxivPaper[] = [];
    for (const q of beat.queries) {
      const batch = await fetchArxivPapers(q, 5);
      for (const p of batch) {
        if (!all.some((x) => x.url === p.url)) all.push(p);
      }
      if (all.length >= 2) break;
    }
    if (all.length === 0) { console.warn("No unseen papers. Skipping."); return; }

    const papers = all.slice(0, 2);

    // LLM synthesis
    console.log("Synthesising with Claude...");
    const { headline, content } = await synthesiseSignal(papers, beat);
    console.log(`Headline: ${headline}`);
    console.log(`Content length: ${content.length} chars`);

    // BIP-322 auth — signing format confirmed matching official: "POST /api/signals:{ts}"
    const method = "POST";
    const path = "/api/signals";
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `${method} ${path}:${timestamp}`;
    const scriptPubKey = p2wpkh(BTC_PUBLIC_KEY, BTC_MAINNET).script;
    const signature = bip322Sign(message, BTC_PRIVATE_KEY, scriptPubKey);

    const headers: Record<string, string> = {
      "X-BTC-Address": BTC_ADDRESS,
      "X-BTC-Signature": signature,
      "X-BTC-Timestamp": String(timestamp),
      "Content-Type": "application/json",
    };

    // Fix #1: field is "content" not "body"
    // Fix #3: disclosure is a JSON object, not a string
    // Fix #4: sources is an array of URL strings, not [{url,title}] objects
    // Fix #5: btc_address removed from body (auth is header-only)
    const payload: Record<string, unknown> = {
      beat_slug: beat.slug,
      headline,
      content,                                  // ← "content", not "body"
      sources: papers.map((p) => p.url),        // ← array of strings, not objects
      tags: beat.tags,
      disclosure: {                             // ← JSON object, not string
        models: ["llama-3.3-70b-versatile"],
        tools: ["arxiv-api"],
        notes: `Sources: arXiv preprints. Papers: ${papers.map((p) => p.title.substring(0, 40)).join("; ")}`,
      },
    };

    const res = await fetch("https://aibtc.news/api/signals", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const responseText = await res.text();
    let status = "failed";
    let signalId = "N/A";

    try {
      const d = JSON.parse(responseText);
      if (res.ok) {
        status = "submitted";
        signalId = d.id || d.signalId || "pending";
        console.log(`✅ Submitted! ID: ${signalId}`);
        for (const p of papers) seenPapers.add(p.url);
        saveSeen(seenPapers);
      } else {
        console.error(`❌ API ${res.status}:`, responseText.substring(0, 400));
      }
    } catch (_) {
      console.error("Parse error:", responseText.substring(0, 400));
    }

    const logLine =
      `| ${new Date().toISOString()} | ${beat.slug} | ${headline.substring(0, 70)} | ${status} | ${signalId} |\n`;
    try { appendFileSync(join(process.cwd(), "..", "news-log.md"), logLine); } catch (_) {}

    console.log(`Done. Status: ${status}`);
  } catch (err) {
    console.error("Signal execution failed:", err);
  }
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

if (process.argv.includes("--daemon")) {
  console.log("Starting Cyber Comet (v3)...");

  // Rate limit: 1 per 4 hours. Runs at :05 past to avoid top-of-hour collisions.
  // 00:05 → 04:05 → 08:05 → 12:05 → 16:05 → 20:05 UTC
  // First 3 (midnight, 4am, 8am UTC) land early in the day — prime leaderboard window.
  cron.schedule("5 0,4,8,12,16,20 * * *", () => {
    console.log(`[${new Date().toISOString()}] Scheduled run.`);
    executeSignal();
  }, { timezone: "UTC" });

  console.log("Cron: UTC 00:05, 04:05, 08:05, 12:05, 16:05, 20:05 (every 4h).");
} else {
  executeSignal();
}
} else {
  await import("./agent-trading-news-bot.ts");
}
