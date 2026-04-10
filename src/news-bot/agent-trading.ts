export interface NewsSource {
  url: string;
  title: string;
}

export interface CandidateSignal {
  kind: "venue-spread" | "auction-imbalance" | "market-share" | "zest-liquidity";
  headline: string;
  content: string;
  sources: NewsSource[];
  tags: string[];
  fingerprint: string;
  score: number;
}

export interface RemoteSignal {
  id?: string;
  headline: string;
  body: string;
  timestamp: string;
  status?: string;
  pacificDate?: string;
  sourceUrls: string[];
}

export interface BotAttempt {
  at: string;
  kind?: CandidateSignal["kind"];
  fingerprint?: string;
  outcome: "submitted" | "skipped" | "failed";
  signalId?: string;
  note: string;
}

export interface BotState {
  postedFingerprints: string[];
  attempts: BotAttempt[];
}

export interface BitflowTickerSnapshot {
  tickerId: string;
  lastPrice: number;
  liquidityUsd: number;
}

export interface MarketStatsPoint {
  period: string;
  volumeUsd: number;
  buyVolumeUsd: number;
  sellVolumeUsd: number;
  netflowUsd: number;
  uniqueTraders: number;
  uniqueBuyers: number;
  uniqueSellers: number;
  uniquePools: number;
}

export interface TrendingPoolSnapshot {
  poolId: string;
  liquidityUsd: number;
  volume1dUsd: number;
  swaps1d: number;
}

export interface JingswapDexSnapshot {
  xykStxPerBtc: number | null;
  dlmmStxPerBtc: number | null;
  xykSbtcBalance: number;
  xykStxBalance: number;
}

export interface JingswapCycleStateSnapshot {
  currentCycle: number;
  phase: number;
  blocksElapsed: number;
  totalStx: number;
  totalSbtc: number;
}

export interface JingswapDepositorsSnapshot {
  cycle: number;
  stxDepositors: string[];
  sbtcDepositors: string[];
}

export interface JingswapSettlementSnapshot {
  cycle: number;
  stxCleared: number;
  sbtcCleared: number;
  stxPerBtc: number;
}

export interface ZestReserveSnapshot {
  supplyApyPct: number;
  totalBorrowsSats: number;
}

export interface AgentTradingSnapshot {
  bitflow?: BitflowTickerSnapshot;
  marketStats?: MarketStatsPoint[];
  trendingPool?: TrendingPoolSnapshot;
  jingswapDex?: JingswapDexSnapshot;
  jingswapCycle?: JingswapCycleStateSnapshot;
  jingswapDepositors?: JingswapDepositorsSnapshot;
  previousSettlement?: JingswapSettlementSnapshot;
  zestReserve?: ZestReserveSnapshot;
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "or",
  "the",
  "to",
  "via",
  "while",
  "with",
]);

function clampText(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1).trimEnd()}...`;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function formatUsd(value: number): string {
  if (value >= 1_000_000) {
    return `$${round(value / 1_000_000, 2)}M`;
  }
  if (value >= 1_000) {
    return `$${round(value / 1_000, 1)}k`;
  }
  return `$${round(value, 0)}`;
}

function formatPct(value: number): string {
  return `${round(value, 1)}%`;
}

function formatSignedPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${round(value, 1)}%`;
}

function finishSentence(text: string): string {
  return `${text.trim().replace(/\s+/g, " ").replace(/[.!?]+$/, "")}.`;
}

function buildEditorialBody(
  claim: string,
  evidence: string,
  implication: string,
  maxLength = 1000
): string {
  return clampText(
    [claim, evidence, implication].map((sentence) => finishSentence(sentence)).join(" "),
    maxLength
  );
}

function normaliseText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function jaccardSimilarity(left: string, right: string): number {
  const leftSet = new Set(normaliseText(left));
  const rightSet = new Set(normaliseText(right));
  if (leftSet.size === 0 || rightSet.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) {
      intersection += 1;
    }
  }

  const union = new Set([...leftSet, ...rightSet]).size;
  return union === 0 ? 0 : intersection / union;
}

function extractUrlKey(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

function getLatestMarketPoints(points?: MarketStatsPoint[]): {
  latest: MarketStatsPoint;
  previous: MarketStatsPoint | null;
} | null {
  if (!points || points.length === 0) {
    return null;
  }

  const sorted = [...points].sort((left, right) =>
    left.period.localeCompare(right.period)
  );
  const latest = sorted[sorted.length - 1];
  const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;
  return { latest, previous };
}

function buildVenueSpreadCandidate(
  snapshot: AgentTradingSnapshot
): CandidateSignal | null {
  const bitflow = snapshot.bitflow;
  const dex = snapshot.jingswapDex;
  const cycle = snapshot.jingswapCycle;
  const depositors = snapshot.jingswapDepositors;

  if (!bitflow || !dex || !cycle || !depositors || !dex.xykStxPerBtc || !dex.dlmmStxPerBtc) {
    return null;
  }

  const pricePoints = [bitflow.lastPrice, dex.xykStxPerBtc, dex.dlmmStxPerBtc];
  const minPrice = Math.min(...pricePoints);
  const maxPrice = Math.max(...pricePoints);
  const spreadPct = ((maxPrice - minPrice) / minPrice) * 100;
  const bidOnly = cycle.totalStx === 0 && cycle.totalSbtc > 0;

  if (!bidOnly && spreadPct < 0.3) {
    return null;
  }

  const headline = clampText(
    `AIBTC agents face a non-executable JingSwap quote: cycle ${cycle.currentCycle} shows ${formatInteger(cycle.totalSbtc)} sats bid and 0 STX`,
    120
  );

  const content = buildEditorialBody(
    `AIBTC agents are looking at a phantom top-of-book on JingSwap because cycle ${cycle.currentCycle} still has buyers but no STX resting on the other side`,
    `Bitflow prints ${formatInteger(bitflow.lastPrice)} STX/BTC, JingSwap XYK ${formatInteger(dex.xykStxPerBtc)}, and JingSwap DLMM ${formatInteger(dex.dlmmStxPerBtc)}, but that headline-high quote sits beside only ${formatInteger(cycle.totalSbtc)} sats from ${depositors.sbtcDepositors.length} sBTC depositors and 0 STX after ${formatInteger(cycle.blocksElapsed)} blocks`,
    `For AIBTC agent traders, that means routing executable size to Bitflow or JingSwap XYK until real STX liquidity arrives and the spread becomes tradable`
  );

  const sources: NewsSource[] = [
    {
      url: "https://bitflow-sdk-api-gateway-7owjsmt8.uc.gateway.dev/ticker",
      title: `Bitflow sBTC/STX ticker - ${formatInteger(bitflow.lastPrice)} STX/BTC, ${formatUsd(bitflow.liquidityUsd)} liquidity`,
    },
    {
      url: "https://faktory-dao-backend.vercel.app/api/auction/dex-price",
      title: `JingSwap dex-price - XYK ${formatInteger(dex.xykStxPerBtc)} and DLMM ${formatInteger(dex.dlmmStxPerBtc)} STX/BTC`,
    },
    {
      url: "https://faktory-dao-backend.vercel.app/api/auction/cycle-state",
      title: `JingSwap cycle ${cycle.currentCycle} - ${formatInteger(cycle.totalSbtc)} sats, ${formatInteger(cycle.totalStx)} STX, ${formatInteger(cycle.blocksElapsed)} blocks elapsed`,
    },
    {
      url: `https://faktory-dao-backend.vercel.app/api/auction/depositors/${cycle.currentCycle}`,
      title: `JingSwap depositors - ${depositors.sbtcDepositors.length} sBTC vs ${depositors.stxDepositors.length} STX wallets in cycle ${cycle.currentCycle}`,
    },
  ];

  return {
    kind: "venue-spread",
    headline,
    content,
    sources,
    tags: ["agent-trading", "bitflow", "jingswap", "liquidity", "sbtc", "stacks"],
    fingerprint: `venue-spread:${round(bitflow.lastPrice, 0)}:${round(dex.xykStxPerBtc, 0)}:${round(dex.dlmmStxPerBtc, 0)}:${cycle.currentCycle}:${cycle.totalStx}:${cycle.totalSbtc}`,
    score: 80 + Math.min(spreadPct, 10) + (bidOnly ? 8 : 0),
  };
}

function buildAuctionImbalanceCandidate(
  snapshot: AgentTradingSnapshot
): CandidateSignal | null {
  const cycle = snapshot.jingswapCycle;
  const settlement = snapshot.previousSettlement;
  const depositors = snapshot.jingswapDepositors;

  if (!cycle || !settlement || !depositors) {
    return null;
  }

  const bidOnly = cycle.totalSbtc > 0 && cycle.totalStx === 0;
  const askOnly = cycle.totalStx > 0 && cycle.totalSbtc === 0;
  if (!bidOnly && !askOnly) {
    return null;
  }

  const queueAmount = bidOnly ? `${formatInteger(cycle.totalSbtc)} sats` : `${formatInteger(cycle.totalStx)} STX`;
  const missingSide = bidOnly ? "STX" : "sBTC";
  const activeWallets = bidOnly ? depositors.sbtcDepositors.length : depositors.stxDepositors.length;

  const headline = clampText(
    `JingSwap reopened cycle ${cycle.currentCycle} one-sided, so AIBTC agents still lack a reliable opening price`,
    120
  );

  const content = buildEditorialBody(
    `JingSwap is acting like a queue, not a balanced market, at the start of cycle ${cycle.currentCycle}`,
    `Cycle ${settlement.cycle} cleared ${formatInteger(settlement.sbtcCleared)} sats against ${round(settlement.stxCleared, 2)} STX at ${formatInteger(settlement.stxPerBtc)} STX/BTC, then cycle ${cycle.currentCycle} reopened with ${queueAmount} from ${activeWallets} wallets and 0 ${missingSide} after ${formatInteger(cycle.blocksElapsed)} blocks`,
    `For AIBTC agent traders, that means treating the venue as a first-mover auction where the next ${missingSide} order can define the opening book instead of assuming continuous liquidity`
  );

  return {
    kind: "auction-imbalance",
    headline,
    content,
    sources: [
      {
        url: `https://faktory-dao-backend.vercel.app/api/auction/settlement/${settlement.cycle}`,
        title: `JingSwap settlement ${settlement.cycle} - ${formatInteger(settlement.sbtcCleared)} sats cleared at ${formatInteger(settlement.stxPerBtc)} STX/BTC`,
      },
      {
        url: "https://faktory-dao-backend.vercel.app/api/auction/cycle-state",
        title: `JingSwap cycle ${cycle.currentCycle} - ${queueAmount}, 0 ${missingSide}, ${formatInteger(cycle.blocksElapsed)} blocks elapsed`,
      },
      {
        url: `https://faktory-dao-backend.vercel.app/api/auction/depositors/${cycle.currentCycle}`,
        title: `JingSwap cycle ${cycle.currentCycle} depositors - ${depositors.sbtcDepositors.length} sBTC vs ${depositors.stxDepositors.length} STX wallets`,
      },
    ],
    tags: ["agent-trading", "auction", "jingswap", "order-book", "sbtc", "stacks"],
    fingerprint: `auction-imbalance:${settlement.cycle}:${settlement.sbtcCleared}:${round(settlement.stxPerBtc, 0)}:${cycle.currentCycle}:${cycle.totalStx}:${cycle.totalSbtc}`,
    score: 76 + Math.min(activeWallets * 2, 10),
  };
}

function buildMarketShareCandidate(
  snapshot: AgentTradingSnapshot
): CandidateSignal | null {
  const pool = snapshot.trendingPool;
  const marketPoints = getLatestMarketPoints(snapshot.marketStats);

  if (!pool || !marketPoints) {
    return null;
  }

  const { latest, previous } = marketPoints;
  if (latest.volumeUsd <= 0 || pool.volume1dUsd <= 0) {
    return null;
  }

  const sharePct = (pool.volume1dUsd / latest.volumeUsd) * 100;
  const previousVolume = previous?.volumeUsd ?? latest.volumeUsd;
  const dailyChangePct =
    previousVolume > 0
      ? ((latest.volumeUsd - previousVolume) / previousVolume) * 100
      : 0;

  if (sharePct < 3) {
    return null;
  }

  const headline = clampText(
    `Bitflow handled ${formatPct(sharePct)} of Stacks DEX volume, showing how thin sBTC execution still is for AIBTC agents`,
    120
  );

  const content = buildEditorialBody(
    `AIBTC agent trading is still concentrated in one thin sBTC corridor instead of a deep multi-venue market`,
    `Bitflow's sBTC/STX pool handled ${formatUsd(pool.volume1dUsd)} across ${formatInteger(pool.swaps1d)} swaps in the last day, ${formatPct(sharePct)} of the full ${formatUsd(latest.volumeUsd)} Stacks DEX tape, while market-wide netflow sat at ${formatUsd(latest.netflowUsd)} with ${formatInteger(latest.uniqueTraders)} traders and ${formatInteger(latest.uniquePools)} pools, a ${formatSignedPct(dailyChangePct)} move versus the prior session`,
    `For AIBTC agent traders, that concentration means a single agent-sized sBTC order can still move price more than headline spreads suggest`
  );

  return {
    kind: "market-share",
    headline,
    content,
    sources: [
      {
        url: "https://api.tenero.io/v1/stacks/pools/trending/1h?limit=10",
        title: `Tenero pool stats - Bitflow sBTC/STX ${formatUsd(pool.volume1dUsd)} over ${formatInteger(pool.swaps1d)} swaps`,
      },
      {
        url: "https://api.tenero.io/v1/stacks/market/stats",
        title: `Tenero market stats - ${formatUsd(latest.volumeUsd)} volume, ${formatUsd(latest.netflowUsd)} netflow, ${formatInteger(latest.uniqueTraders)} traders on ${latest.period}`,
      },
    ],
    tags: ["agent-trading", "bitflow", "market-share", "order-flow", "sbtc", "stacks"],
    fingerprint: `market-share:${latest.period}:${round(pool.volume1dUsd, 0)}:${round(latest.volumeUsd, 0)}:${pool.swaps1d}`,
    score: 70 + Math.min(sharePct, 15),
  };
}

function buildZestLiquidityCandidate(
  snapshot: AgentTradingSnapshot
): CandidateSignal | null {
  const zest = snapshot.zestReserve;
  if (!zest) {
    return null;
  }

  if (zest.supplyApyPct < 0.5 && zest.totalBorrowsSats < 2_000_000) {
    return null;
  }

  const headline = clampText(
    `Zest is paying ${formatPct(zest.supplyApyPct)} on sBTC while ${formatInteger(zest.totalBorrowsSats)} sats are already borrowed`,
    120
  );

  const content = buildEditorialBody(
    "Zest's sBTC market is active enough to matter for how AIBTC agents park capital between trades",
    `The live reserve state implies ${formatPct(zest.supplyApyPct)} supply APY with ${formatInteger(zest.totalBorrowsSats)} sats already borrowed from the pool, so agent demand for idle sBTC carry is no longer trivial`,
    "For AIBTC agent traders, that makes Zest part of the execution stack: idle inventory can earn yield between trades, but tighter lending liquidity can also crowd short-term funding and position management"
  );

  return {
    kind: "zest-liquidity",
    headline,
    content,
    sources: [
      {
        url: "https://api.mainnet.hiro.so/v2/contracts/call-read/SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N/pool-borrow-v2-3/get-reserve-state",
        title: `Hiro read-only call - Zest sBTC reserve at ${formatPct(zest.supplyApyPct)} APY with ${formatInteger(zest.totalBorrowsSats)} sats borrowed`,
      },
      {
        url: "https://explorer.hiro.so/address/SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-borrow-v2-3?chain=mainnet",
        title: "Hiro Explorer - Zest sBTC lending pool contract",
      },
    ],
    tags: ["agent-trading", "positions", "sbtc", "stacks", "yield", "zest"],
    fingerprint: `zest-liquidity:${round(zest.supplyApyPct, 1)}:${round(zest.totalBorrowsSats, 0)}`,
    score:
      68 +
      Math.min(zest.supplyApyPct, 12) +
      Math.min(zest.totalBorrowsSats / 5_000_000, 8),
  };
}

export function buildAgentTradingCandidates(
  snapshot: AgentTradingSnapshot
): CandidateSignal[] {
  return [
    buildVenueSpreadCandidate(snapshot),
    buildAuctionImbalanceCandidate(snapshot),
    buildMarketShareCandidate(snapshot),
    buildZestLiquidityCandidate(snapshot),
  ]
    .filter((candidate): candidate is CandidateSignal => candidate !== null)
    .sort((left, right) => right.score - left.score);
}

function getCandidateTheme(kind: CandidateSignal["kind"]): "jingswap" | "bitflow" | "zest" {
  if (kind === "venue-spread" || kind === "auction-imbalance") {
    return "jingswap";
  }
  if (kind === "market-share") {
    return "bitflow";
  }
  return "zest";
}

function getSelectionScore(candidate: CandidateSignal, state: BotState): number {
  const recentSubmittedAttempts = state.attempts.filter((attempt) => {
    if (attempt.outcome !== "submitted" || !attempt.kind) {
      return false;
    }

    const ageMs = Date.now() - new Date(attempt.at).getTime();
    return ageMs >= 0 && ageMs <= 36 * 60 * 60 * 1000;
  });

  let score = candidate.score;
  if (recentSubmittedAttempts.some((attempt) => attempt.kind === candidate.kind)) {
    score -= 18;
  } else if (
    recentSubmittedAttempts.some(
      (attempt) => getCandidateTheme(attempt.kind!) === getCandidateTheme(candidate.kind)
    )
  ) {
    score -= 10;
  }

  return score;
}

function isDuplicateAgainstRecentSignals(
  candidate: CandidateSignal,
  recentSignals: RemoteSignal[],
  pacificDate: string
): boolean {
  const candidateSourceKeys = new Set(candidate.sources.map((source) => extractUrlKey(source.url)));
  const candidateText = `${candidate.headline} ${candidate.content}`;

  return recentSignals.some((signal) => {
    const sourceOverlap = signal.sourceUrls.filter((url) =>
      candidateSourceKeys.has(extractUrlKey(url))
    ).length;
    const headlineSimilarity = jaccardSimilarity(candidate.headline, signal.headline);
    const bodySimilarity = jaccardSimilarity(candidateText, `${signal.headline} ${signal.body}`);
    const samePacificDay = signal.pacificDate === pacificDate;

    if (headlineSimilarity >= 0.55) {
      return true;
    }

    if (sourceOverlap >= 2 && (headlineSimilarity >= 0.2 || bodySimilarity >= 0.25)) {
      return true;
    }

    if (
      samePacificDay &&
      sourceOverlap >= 1 &&
      (headlineSimilarity >= 0.25 || bodySimilarity >= 0.35)
    ) {
      return true;
    }

    return false;
  });
}

export function selectCandidate(
  candidates: CandidateSignal[],
  recentSignals: RemoteSignal[],
  state: BotState,
  pacificDate: string
): CandidateSignal | null {
  const eligible = candidates.filter((candidate) => {
    if (state.postedFingerprints.includes(candidate.fingerprint)) {
      return false;
    }

    if (isDuplicateAgainstRecentSignals(candidate, recentSignals, pacificDate)) {
      return false;
    }

    return true;
  });

  if (eligible.length === 0) {
    return null;
  }

  return eligible.sort((left, right) => {
    const scoreDelta = getSelectionScore(right, state) - getSelectionScore(left, state);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    return right.score - left.score;
  })[0];
}

export function createEmptyBotState(): BotState {
  return {
    postedFingerprints: [],
    attempts: [],
  };
}

export function normaliseSignal(raw: {
  id?: string;
  headline?: unknown;
  body?: unknown;
  content?: unknown;
  timestamp?: unknown;
  created_at?: unknown;
  status?: unknown;
  pacificDate?: unknown;
  pacific_date?: unknown;
  sources?: unknown;
}): RemoteSignal | null {
  const headline = typeof raw.headline === "string" ? raw.headline.trim() : "";
  const bodyCandidate =
    typeof raw.content === "string"
      ? raw.content
      : typeof raw.body === "string"
        ? raw.body
        : "";
  const timestamp =
    typeof raw.timestamp === "string"
      ? raw.timestamp
      : typeof raw.created_at === "string"
        ? raw.created_at
        : "";

  if (!headline || !timestamp) {
    return null;
  }

  const signalSources = (() => {
    if (Array.isArray(raw.sources)) {
      return raw.sources;
    }

    if (typeof raw.sources === "string") {
      try {
        const parsed = JSON.parse(raw.sources) as unknown;
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    return [];
  })();

  const sourceUrls = signalSources
    .map((source) => {
      if (typeof source === "string") {
        return source;
      }
      if (
        typeof source === "object" &&
        source !== null &&
        "url" in source &&
        typeof source.url === "string"
      ) {
        return source.url;
      }
      return null;
    })
    .filter((url): url is string => Boolean(url));

  return {
    id: typeof raw.id === "string" ? raw.id : undefined,
    headline,
    body: bodyCandidate.trim(),
    timestamp,
    status: typeof raw.status === "string" ? raw.status : undefined,
    pacificDate:
      typeof raw.pacificDate === "string"
        ? raw.pacificDate
        : typeof raw.pacific_date === "string"
          ? raw.pacific_date
          : undefined,
    sourceUrls,
  };
}

