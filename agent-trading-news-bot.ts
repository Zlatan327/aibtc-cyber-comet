import "dotenv/config";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import cron from "node-cron";
import {
  NETWORK as BTC_MAINNET,
  TEST_NETWORK as BTC_TESTNET,
  p2wpkh,
} from "@scure/btc-signer";
import { contractPrincipalCV, cvToHex, cvToValue, hexToCV } from "@stacks/transactions";
import { deriveBitcoinKeyPair } from "./src/utils/bitcoin.js";
import { bip322Sign } from "./src/utils/bip322.js";
import {
  buildAgentTradingCandidates,
  createEmptyBotState,
  normaliseSignal,
  selectCandidate,
  type AgentTradingSnapshot,
  type BitflowTickerSnapshot,
  type BotAttempt,
  type BotState,
  type JingswapCycleStateSnapshot,
  type JingswapDepositorsSnapshot,
  type JingswapDexSnapshot,
  type JingswapSettlementSnapshot,
  type MarketStatsPoint,
  type RemoteSignal,
  type TrendingPoolSnapshot,
  type ZestReserveSnapshot,
} from "./src/news-bot/agent-trading.js";

const MNEMONIC = process.env.CLIENT_MNEMONIC?.trim();
const NETWORK = (process.env.NETWORK as "mainnet" | "testnet") || "mainnet";
const NEWS_API = "https://aibtc.news/api";
const NEWS_BOT_TIMEZONE = process.env.NEWS_BOT_TIMEZONE?.trim() || "UTC";
const NEWS_BOT_CRON = process.env.NEWS_BOT_CRON?.trim() || "5 */4 * * *";
const TRANSITION_DATE_UTC = "2026-04-07";
const TRANSITION_GUIDE_CRON_UTC = "5 13,20 7 4 *";
const TRANSITION_CATCHUP_AFTER_UTC = "2026-04-07T13:05:00Z";
const TRANSITION_END_UTC = "2026-04-08T00:00:00Z";
const STATE_PATH = join(process.cwd(), "news-bot-state.json");
const LOG_PATH = join(process.cwd(), "news-log.md");

const BITFLOW_TICKER_URL = "https://bitflow-sdk-api-gateway-7owjsmt8.uc.gateway.dev/ticker";
const TENERO_MARKET_STATS_URL = "https://api.tenero.io/v1/stacks/market/stats";
const TENERO_TRENDING_POOLS_URL = "https://api.tenero.io/v1/stacks/pools/trending/1h?limit=10";
const JINGSWAP_API = process.env.JINGSWAP_API_URL || "https://faktory-dao-backend.vercel.app";
const JINGSWAP_API_KEY =
  process.env.JINGSWAP_API_KEY ||
  "jc_b058d7f2e0976bd4ee34be3e5c7ba7ebe45289c55d3f5e45f666ebc14b7ebfd0";
const HIRO_MAINNET_API = "https://api.mainnet.hiro.so";
const ZEST_POOL_CONTRACT = "SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N";
const ZEST_POOL_NAME = "pool-borrow-v2-3";

const SBTC_CONTRACT = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const [SBTC_TOKEN_ADDRESS, SBTC_TOKEN_NAME] = SBTC_CONTRACT.split(".");
const BITFLOW_SBTC_STX_TICKER_ID = `${SBTC_CONTRACT}_Stacks`;
const BITFLOW_SBTC_STX_POOL_ID = "SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.xyk-pool-sbtc-stx-v-1-1";

if (!MNEMONIC) {
  console.error("[news-bot] CLIENT_MNEMONIC is not set.");
  process.exit(1);
}

const {
  address: BTC_ADDRESS,
  privateKey: BTC_PRIVATE_KEY,
  publicKeyBytes: BTC_PUBLIC_KEY,
} = deriveBitcoinKeyPair(MNEMONIC, NETWORK);

console.log(`[news-bot] Agent Trading bot ready for ${BTC_ADDRESS}`);
console.log(`[news-bot] Editorial timezone: ${NEWS_BOT_TIMEZONE}`);

type StatusResponse = {
  canFileSignal?: boolean;
  waitMinutes?: number | null;
  signalsToday?: number;
  maxSignalsPerDay?: number;
  signals?: unknown[];
};

function safeNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function safeBigIntToNumber(value: bigint): number {
  return value > BigInt(Number.MAX_SAFE_INTEGER)
    ? Number.MAX_SAFE_INTEGER
    : Number(value);
}

function decodeTupleField(result: string, field: string): bigint | null {
  try {
    const hex = result.startsWith("0x") ? result.slice(2) : result;
    const cv = hexToCV(hex);
    const decoded = cvToValue(cv, true) as Record<string, unknown>;
    const value = decoded[field];

    if (typeof value === "bigint") {
      return value;
    }
    if (typeof value === "number") {
      return BigInt(value);
    }
    return null;
  } catch {
    return null;
  }
}

function rayToPct(value: bigint): number {
  return Number(value / 10n ** 23n) / 100;
}

function formatDateParts(date: Date, timeZone: string): Record<string, string> {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return formatter.formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});
}

function getPacificDate(date = new Date()): string {
  const parts = formatDateParts(date, NEWS_BOT_TIMEZONE);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getTimezoneHour(date = new Date()): number {
  const parts = formatDateParts(date, NEWS_BOT_TIMEZONE);
  return Number(parts.hour || "0");
}

function getUtcDate(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function ensureLogHeader(): void {
  if (existsSync(LOG_PATH)) {
    return;
  }

  writeFileSync(
    LOG_PATH,
    "| Timestamp | Pacific Date | Outcome | Kind | Headline | Details |\n| --- | --- | --- | --- | --- | --- |\n",
    "utf-8"
  );
}

function appendLog(outcome: string, kind: string, headline: string, details: string): void {
  ensureLogHeader();
  appendFileSync(
    LOG_PATH,
    `| ${new Date().toISOString()} | ${getPacificDate()} | ${outcome} | ${kind} | ${headline.replace(/\|/g, "/")} | ${details.replace(/\|/g, "/")} |\n`,
    "utf-8"
  );
}

function loadState(): BotState {
  try {
    if (!existsSync(STATE_PATH)) {
      return createEmptyBotState();
    }

    const raw = JSON.parse(readFileSync(STATE_PATH, "utf-8")) as Partial<BotState>;
    return {
      postedFingerprints: Array.isArray(raw.postedFingerprints)
        ? raw.postedFingerprints.slice(-300)
        : [],
      attempts: Array.isArray(raw.attempts) ? raw.attempts.slice(-300) : [],
    };
  } catch {
    return createEmptyBotState();
  }
}

function saveState(state: BotState): void {
  writeFileSync(
    STATE_PATH,
    JSON.stringify(
      {
        postedFingerprints: state.postedFingerprints.slice(-300),
        attempts: state.attempts.slice(-300),
      },
      null,
      2
    ),
    "utf-8"
  );
}

function rememberAttempt(state: BotState, attempt: BotAttempt): void {
  state.attempts.push(attempt);
  if (attempt.outcome === "submitted" && attempt.fingerprint) {
    state.postedFingerprints.push(attempt.fingerprint);
  }
  state.attempts = state.attempts.slice(-300);
  state.postedFingerprints = state.postedFingerprints.slice(-300);
  saveState(state);
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "Unknown error");
    throw new Error(`${response.status} ${response.statusText}: ${body.slice(0, 240)}`);
  }

  return (await response.json()) as T;
}

async function fetchStatus(): Promise<StatusResponse> {
  return fetchJson<StatusResponse>(`${NEWS_API}/status/${BTC_ADDRESS}`);
}

async function fetchRecentBeatSignals(): Promise<RemoteSignal[]> {
  const response = await fetchJson<{ signals?: unknown[] }>(
    `${NEWS_API}/signals?beat=agent-trading&limit=100`
  );

  return (response.signals || [])
    .map((signal) => normaliseSignal(signal as Record<string, unknown>))
    .filter((signal): signal is RemoteSignal => signal !== null);
}

async function fetchBitflowTicker(): Promise<BitflowTickerSnapshot | undefined> {
  const tickers = await fetchJson<Array<Record<string, unknown>>>(BITFLOW_TICKER_URL);
  const ticker = tickers.find((item) => item.ticker_id === BITFLOW_SBTC_STX_TICKER_ID);
  if (!ticker) {
    return undefined;
  }

  return {
    tickerId: BITFLOW_SBTC_STX_TICKER_ID,
    lastPrice: safeNumber(ticker.last_price),
    liquidityUsd: safeNumber(ticker.liquidity_in_usd),
  };
}

async function fetchMarketStats(): Promise<MarketStatsPoint[]> {
  const response = await fetchJson<{ data?: Array<Record<string, unknown>> }>(TENERO_MARKET_STATS_URL);
  return (response.data || [])
    .map((item) => ({
      period: typeof item.period === "string" ? item.period : "",
      volumeUsd: safeNumber(item.volume_usd),
      buyVolumeUsd: safeNumber(item.buy_volume_usd),
      sellVolumeUsd: safeNumber(item.sell_volume_usd),
      netflowUsd: safeNumber(item.netflow_usd),
      uniqueTraders: safeNumber(item.unique_traders),
      uniqueBuyers: safeNumber(item.unique_buyers),
      uniqueSellers: safeNumber(item.unique_sellers),
      uniquePools: safeNumber(item.unique_pools),
    }))
    .filter((point) => point.period);
}

async function fetchTrendingPool(): Promise<TrendingPoolSnapshot | undefined> {
  const response = await fetchJson<{ data?: Array<Record<string, unknown>> }>(TENERO_TRENDING_POOLS_URL);
  const pool = (response.data || []).find((item) => item.pool_id === BITFLOW_SBTC_STX_POOL_ID);
  if (!pool || typeof pool.metrics !== "object" || pool.metrics === null) {
    return undefined;
  }

  const metrics = pool.metrics as Record<string, unknown>;
  return {
    poolId: BITFLOW_SBTC_STX_POOL_ID,
    liquidityUsd: safeNumber(pool.liquidity_usd),
    volume1dUsd: safeNumber(metrics.volume_1d_usd),
    swaps1d: safeNumber(metrics.swaps_1d),
  };
}

async function fetchJingswapJson<T>(path: string): Promise<T> {
  return fetchJson<T>(`${JINGSWAP_API}${path}`, {
    headers: {
      "x-api-key": JINGSWAP_API_KEY,
    },
  });
}

async function fetchJingswapDex(): Promise<JingswapDexSnapshot | undefined> {
  const response = await fetchJingswapJson<{ data?: Record<string, unknown> }>(
    "/api/auction/dex-price"
  );

  const data = response.data;
  if (!data || typeof data !== "object") {
    return undefined;
  }

  const balances =
    typeof data.xykBalances === "object" && data.xykBalances !== null
      ? (data.xykBalances as Record<string, unknown>)
      : {};
  const xykSbtcBalance = safeNumber(balances.xBalance) / 1e8;
  const xykStxBalance = safeNumber(balances.yBalance) / 1e6;
  const xykStxPerBtc =
    xykSbtcBalance > 0 ? xykStxBalance / xykSbtcBalance : null;
  const rawDlmm = safeNumber(data.dlmmPrice);
  const dlmmStxPerBtc = rawDlmm > 0 ? 1 / (rawDlmm * 1e-10) : null;

  return {
    xykStxPerBtc,
    dlmmStxPerBtc,
    xykSbtcBalance,
    xykStxBalance,
  };
}

async function fetchJingswapCycle(): Promise<JingswapCycleStateSnapshot | undefined> {
  const response = await fetchJingswapJson<{ data?: Record<string, unknown> }>(
    "/api/auction/cycle-state"
  );

  const data = response.data;
  if (!data || typeof data !== "object") {
    return undefined;
  }

  const totals =
    typeof data.cycleTotals === "object" && data.cycleTotals !== null
      ? (data.cycleTotals as Record<string, unknown>)
      : {};

  return {
    currentCycle: safeNumber(data.currentCycle),
    phase: safeNumber(data.phase),
    blocksElapsed: safeNumber(data.blocksElapsed),
    totalStx: safeNumber(totals.totalStx) / 1e6,
    totalSbtc: safeNumber(totals.totalSbtc),
  };
}

async function fetchJingswapDepositors(
  cycle: number
): Promise<JingswapDepositorsSnapshot | undefined> {
  const response = await fetchJingswapJson<{ data?: Record<string, unknown> }>(
    `/api/auction/depositors/${cycle}`
  );
  const data = response.data;
  if (!data || typeof data !== "object") {
    return undefined;
  }

  const stxDepositors = Array.isArray(data.stxDepositors)
    ? data.stxDepositors.filter((value): value is string => typeof value === "string")
    : [];
  const sbtcDepositors = Array.isArray(data.sbtcDepositors)
    ? data.sbtcDepositors.filter((value): value is string => typeof value === "string")
    : [];

  return {
    cycle,
    stxDepositors,
    sbtcDepositors,
  };
}

async function fetchJingswapSettlement(
  cycle: number
): Promise<JingswapSettlementSnapshot | undefined> {
  if (cycle < 0) {
    return undefined;
  }

  const response = await fetchJingswapJson<{ data?: Record<string, unknown> }>(
    `/api/auction/settlement/${cycle}`
  );
  const data = response.data;
  if (!data || typeof data !== "object") {
    return undefined;
  }

  const settlement =
    typeof data.settlement === "object" && data.settlement !== null
      ? (data.settlement as Record<string, unknown>)
      : null;
  if (!settlement) {
    return undefined;
  }

  const stxCleared = safeNumber(settlement.stxCleared) / 1e6;
  const sbtcCleared = safeNumber(settlement.sbtcCleared);
  const stxPerBtc =
    stxCleared > 0 && sbtcCleared > 0 ? (stxCleared / (sbtcCleared / 1e8)) : 0;

  return {
    cycle,
    stxCleared,
    sbtcCleared,
    stxPerBtc,
  };
}

async function fetchZestReserve(): Promise<ZestReserveSnapshot | undefined> {
  if (NETWORK !== "mainnet") {
    return undefined;
  }

  const sbtcPrincipal = cvToHex(contractPrincipalCV(SBTC_TOKEN_ADDRESS, SBTC_TOKEN_NAME));
  const response = await fetchJson<{ okay?: boolean; result?: string }>(
    `${HIRO_MAINNET_API}/v2/contracts/call-read/${ZEST_POOL_CONTRACT}/${ZEST_POOL_NAME}/get-reserve-state`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: ZEST_POOL_CONTRACT,
        arguments: [sbtcPrincipal],
      }),
    }
  );

  if (!response.okay || !response.result) {
    return undefined;
  }

  const liquidityRate = decodeTupleField(response.result, "current-liquidity-rate");
  const borrowsStable = decodeTupleField(response.result, "total-borrows-stable") ?? 0n;
  const borrowsVariable = decodeTupleField(response.result, "total-borrows-variable") ?? 0n;

  return {
    supplyApyPct: liquidityRate ? rayToPct(liquidityRate) : 0,
    totalBorrowsSats: safeBigIntToNumber(borrowsStable + borrowsVariable),
  };
}

async function buildSnapshot(): Promise<{
  status: StatusResponse;
  recentSignals: RemoteSignal[];
  snapshot: AgentTradingSnapshot;
}> {
  const [status, recentSignals] = await Promise.all([
    fetchStatus(),
    fetchRecentBeatSignals(),
  ]);

  const [bitflow, marketStats, trendingPool, jingswapDex, jingswapCycle, zestReserve] =
    await Promise.allSettled([
      fetchBitflowTicker(),
      fetchMarketStats(),
      fetchTrendingPool(),
      fetchJingswapDex(),
      fetchJingswapCycle(),
      fetchZestReserve(),
    ]);

  const snapshot: AgentTradingSnapshot = {
    bitflow: bitflow.status === "fulfilled" ? bitflow.value : undefined,
    marketStats: marketStats.status === "fulfilled" ? marketStats.value : undefined,
    trendingPool: trendingPool.status === "fulfilled" ? trendingPool.value : undefined,
    jingswapDex: jingswapDex.status === "fulfilled" ? jingswapDex.value : undefined,
    jingswapCycle: jingswapCycle.status === "fulfilled" ? jingswapCycle.value : undefined,
    zestReserve: zestReserve.status === "fulfilled" ? zestReserve.value : undefined,
  };

  if (snapshot.jingswapCycle) {
    const [depositors, settlement] = await Promise.allSettled([
      fetchJingswapDepositors(snapshot.jingswapCycle.currentCycle),
      fetchJingswapSettlement(snapshot.jingswapCycle.currentCycle - 1),
    ]);

    snapshot.jingswapDepositors =
      depositors.status === "fulfilled" ? depositors.value : undefined;
    snapshot.previousSettlement =
      settlement.status === "fulfilled" ? settlement.value : undefined;
  }

  return { status, recentSignals, snapshot };
}

function buildDisclosure(): string {
  return "Cyber Comet | deterministic market-data synthesis via Bitflow, JingSwap, Tenero and aibtc.news API reads";
}

function buildDisclosureObject(): { models: string[]; tools: string[]; notes: string } {
  return {
    models: ["deterministic"],
    tools: ["bitflow-ticker", "jingswap-cycle-state", "jingswap-dex-price", "jingswap-depositors", "jingswap-settlement", "tenero-market-stats", "tenero-trending-pools", "hiro-zest-reserve"],
    notes: buildDisclosure(),
  };
}

function buildAuthHeaders(): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const message = `POST /api/signals:${timestamp}`;
  const btcNetwork = NETWORK === "testnet" ? BTC_TESTNET : BTC_MAINNET;
  const scriptPubKey = p2wpkh(BTC_PUBLIC_KEY, btcNetwork).script;
  const signature = bip322Sign(message, BTC_PRIVATE_KEY, scriptPubKey);

  return {
    "X-BTC-Address": BTC_ADDRESS,
    "X-BTC-Signature": signature,
    "X-BTC-Timestamp": String(timestamp),
    "Content-Type": "application/json",
  };
}

function shouldRunStartupCatchup(state: BotState): boolean {
  const currentHour = getTimezoneHour();
  if (currentHour < 0 || currentHour > 5) {
    return false;
  }

  const lastAttempt = state.attempts[state.attempts.length - 1];
  if (!lastAttempt) {
    return true;
  }

  const elapsed = Date.now() - new Date(lastAttempt.at).getTime();
  return elapsed > 55 * 60 * 1000;
}

function shouldRunTransitionCatchup(state: BotState): boolean {
  const now = new Date();
  if (getUtcDate(now) !== TRANSITION_DATE_UTC) {
    return false;
  }

  const nowMs = now.getTime();
  if (
    nowMs < Date.parse(TRANSITION_CATCHUP_AFTER_UTC) ||
    nowMs >= Date.parse(TRANSITION_END_UTC)
  ) {
    return false;
  }

  const lastAttempt = state.attempts[state.attempts.length - 1];
  if (!lastAttempt) {
    return true;
  }

  const elapsed = nowMs - new Date(lastAttempt.at).getTime();
  return elapsed > 55 * 60 * 1000;
}

let runInProgress = false;
const state = loadState();

async function executeSignal(reason: string): Promise<void> {
  if (runInProgress) {
    console.log("[news-bot] A run is already in progress. Skipping overlap.");
    return;
  }

  runInProgress = true;
  const startedAt = new Date().toISOString();

  try {
    console.log(`\n[news-bot] ${startedAt} starting run (${reason})`);
    const pacificDate = getPacificDate();
    const { status, recentSignals, snapshot } = await buildSnapshot();

    if (status.canFileSignal === false) {
      const note = `API cooldown active for ${status.waitMinutes ?? 0} minutes`;
      console.log(`[news-bot] ${note}`);
      rememberAttempt(state, { at: startedAt, outcome: "skipped", note });
      appendLog("skipped", "cooldown", "n/a", note);
      return;
    }

    if (
      typeof status.signalsToday === "number" &&
      typeof status.maxSignalsPerDay === "number" &&
      status.signalsToday >= status.maxSignalsPerDay
    ) {
      const note = `Daily cap reached (${status.signalsToday}/${status.maxSignalsPerDay})`;
      console.log(`[news-bot] ${note}`);
      rememberAttempt(state, { at: startedAt, outcome: "skipped", note });
      appendLog("skipped", "cap", "n/a", note);
      return;
    }

    const ownSignals = Array.isArray(status.signals)
      ? status.signals
          .map((signal) => normaliseSignal(signal as Record<string, unknown>))
          .filter((signal): signal is RemoteSignal => signal !== null)
      : [];
    const recentUniverse = [...recentSignals, ...ownSignals];

    const candidates = buildAgentTradingCandidates(snapshot);
    if (candidates.length === 0) {
      const note = "No on-beat market-data candidate passed generation thresholds";
      console.log(`[news-bot] ${note}`);
      rememberAttempt(state, { at: startedAt, outcome: "skipped", note });
      appendLog("skipped", "no-candidate", "n/a", note);
      return;
    }

    const candidate = selectCandidate(candidates, recentUniverse, state, pacificDate);
    if (!candidate) {
      const note = "All generated candidates were duplicates or already used";
      console.log(`[news-bot] ${note}`);
      rememberAttempt(state, { at: startedAt, outcome: "skipped", note });
      appendLog("skipped", "dedupe", "n/a", note);
      return;
    }

    const payload = {
      beat_slug: "agent-trading",
      headline: candidate.headline,
      content: candidate.content,
      sources: candidate.sources.map((s) => s.url),
      tags: candidate.tags,
      disclosure: buildDisclosureObject(),
    };

    console.log(`[news-bot] Filing ${candidate.kind}: ${candidate.headline}`);

    const response = await fetch(`${NEWS_API}/signals`, {
      method: "POST",
      headers: buildAuthHeaders(),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });

    const responseText = await response.text();
    const parsed = responseText ? JSON.parse(responseText) as Record<string, unknown> : {};

    if (!response.ok) {
      throw new Error(`Signal post failed (${response.status}): ${responseText.slice(0, 240)}`);
    }

    const signalObj =
      typeof parsed.signal === "object" && parsed.signal !== null
        ? (parsed.signal as Record<string, unknown>)
        : parsed;
    const signalId =
      typeof signalObj.id === "string"
        ? signalObj.id
        : typeof parsed.id === "string"
          ? parsed.id
          : "pending";

    const note = `submitted ${signalId}`;
    console.log(`[news-bot] Submitted successfully: ${signalId}`);
    rememberAttempt(state, {
      at: startedAt,
      kind: candidate.kind,
      fingerprint: candidate.fingerprint,
      outcome: "submitted",
      signalId,
      note,
    });
    appendLog("submitted", candidate.kind, candidate.headline, signalId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[news-bot] Run failed:", message);
    rememberAttempt(state, { at: startedAt, outcome: "failed", note: message });
    appendLog("failed", "error", "n/a", message);
  } finally {
    runInProgress = false;
  }
}

function startDaemon(): void {
  if (!cron.validate(NEWS_BOT_CRON)) {
    throw new Error(`Invalid NEWS_BOT_CRON expression: ${NEWS_BOT_CRON}`);
  }

  console.log(`[news-bot] Scheduling: ${NEWS_BOT_CRON} (${NEWS_BOT_TIMEZONE})`);

  cron.schedule(
    NEWS_BOT_CRON,
    () => {
      void executeSignal("scheduled");
    },
    { timezone: NEWS_BOT_TIMEZONE }
  );

  if (cron.validate(TRANSITION_GUIDE_CRON_UTC) && getUtcDate() === TRANSITION_DATE_UTC) {
    console.log(
      `[news-bot] Transition schedule for ${TRANSITION_DATE_UTC}: ${TRANSITION_GUIDE_CRON_UTC} (UTC)`
    );

    cron.schedule(
      TRANSITION_GUIDE_CRON_UTC,
      () => {
        void executeSignal("transition-guide-slot");
      },
      { timezone: "UTC" }
    );
  }

  if (shouldRunTransitionCatchup(state)) {
    console.log(`[news-bot] ${TRANSITION_DATE_UTC} transition catch-up is eligible.`);
    void executeSignal("transition-catchup");
  }

  if (shouldRunStartupCatchup(state)) {
    console.log("[news-bot] Startup catch-up run is eligible.");
    void executeSignal("startup-catchup");
  }
}

if (process.argv.includes("--daemon")) {
  startDaemon();
} else {
  void executeSignal("manual");
}
