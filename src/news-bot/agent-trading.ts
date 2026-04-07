export interface NewsSource {
  url: string;
  title: string;
}

export interface CandidateSignal {
  kind: "venue-spread" | "auction-imbalance" | "market-share";
  headline: string;
  body: string;
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

export interface AgentTradingSnapshot {
  bitflow?: BitflowTickerSnapshot;
  marketStats?: MarketStatsPoint[];
  trendingPool?: TrendingPoolSnapshot;
  jingswapDex?: JingswapDexSnapshot;
  jingswapCycle?: JingswapCycleStateSnapshot;
  jingswapDepositors?: JingswapDepositorsSnapshot;
  previousSettlement?: JingswapSettlementSnapshot;
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

  if (!bidOnly && spreadPct < 1) {
    return null;
  }

  const headline = clampText(
    `JingSwap quotes ${formatInteger(dex.dlmmStxPerBtc)} STX/BTC vs Bitflow ${formatInteger(bitflow.lastPrice)} while cycle ${cycle.currentCycle} still has ${formatInteger(cycle.totalSbtc)} sats and 0 STX`,
    120
  );

  const body = clampText(
    `3 sBTC/STX venues currently print ${formatInteger(bitflow.lastPrice)}, ${formatInteger(dex.xykStxPerBtc)} and ${formatInteger(dex.dlmmStxPerBtc)} STX/BTC, a ${formatPct(spreadPct)} spread from best to worst. Cycle ${cycle.currentCycle} still has ${formatInteger(cycle.totalSbtc)} sats from ${depositors.sbtcDepositors.length} sBTC depositors against 0 STX after ${formatInteger(cycle.blocksElapsed)} blocks, so the high JingSwap quote has no executable depth. Agents routing size should use Bitflow or JingSwap XYK until real STX liquidity arrives.`,
    1000
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
    body,
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
    `Cycle ${settlement.cycle} cleared ${formatInteger(settlement.sbtcCleared)} sats at ${formatInteger(settlement.stxPerBtc)} STX/BTC; cycle ${cycle.currentCycle} reopened ${queueAmount} with no ${missingSide}`,
    120
  );

  const body = clampText(
    `Cycle ${settlement.cycle} settled ${formatInteger(settlement.sbtcCleared)} sats against ${round(settlement.stxCleared, 2)} STX at ${formatInteger(settlement.stxPerBtc)} STX/BTC. Cycle ${cycle.currentCycle} has already reopened with ${queueAmount} from ${activeWallets} wallets and 0 ${missingSide} after ${formatInteger(cycle.blocksElapsed)} blocks, so the next ${missingSide} order will set the opening book. That makes JingSwap a first-mover auction right now, not a continuous market agents can size against safely.`,
    1000
  );

  return {
    kind: "auction-imbalance",
    headline,
    body,
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

  if (sharePct < 8) {
    return null;
  }

  const headline = clampText(
    `Bitflow sBTC/STX took ${formatPct(sharePct)} of Stacks DEX volume on ${formatInteger(pool.swaps1d)} swaps while daily flow stayed at ${formatUsd(latest.volumeUsd)}`,
    120
  );

  const body = clampText(
    `Bitflow's sBTC/STX pool handled ${formatUsd(pool.volume1dUsd)} across ${formatInteger(pool.swaps1d)} swaps in the last day, ${formatPct(sharePct)} of the full ${formatUsd(latest.volumeUsd)} Stacks DEX tape. Market-wide netflow sat at ${formatUsd(latest.netflowUsd)} with ${formatInteger(latest.uniqueTraders)} traders and ${formatInteger(latest.uniquePools)} pools, a ${formatSignedPct(dailyChangePct)} move versus the prior session. That concentration means one agent-sized sBTC order can still distort the market more than the headline spread implies.`,
    1000
  );

  return {
    kind: "market-share",
    headline,
    body,
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

export function buildAgentTradingCandidates(
  snapshot: AgentTradingSnapshot
): CandidateSignal[] {
  return [
    buildVenueSpreadCandidate(snapshot),
    buildAuctionImbalanceCandidate(snapshot),
    buildMarketShareCandidate(snapshot),
  ]
    .filter((candidate): candidate is CandidateSignal => candidate !== null)
    .sort((left, right) => right.score - left.score);
}

function isDuplicateAgainstRecentSignals(
  candidate: CandidateSignal,
  recentSignals: RemoteSignal[],
  pacificDate: string
): boolean {
  const candidateSourceKeys = new Set(candidate.sources.map((source) => extractUrlKey(source.url)));
  const candidateText = `${candidate.headline} ${candidate.body}`;

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
  for (const candidate of candidates) {
    if (state.postedFingerprints.includes(candidate.fingerprint)) {
      continue;
    }

    if (isDuplicateAgainstRecentSignals(candidate, recentSignals, pacificDate)) {
      continue;
    }

    return candidate;
  }

  return null;
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

