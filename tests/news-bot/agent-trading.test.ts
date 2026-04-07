import { describe, expect, it } from "vitest";
import {
  buildAgentTradingCandidates,
  createEmptyBotState,
  normaliseSignal,
  selectCandidate,
  type AgentTradingSnapshot,
  type RemoteSignal,
} from "../../src/news-bot/agent-trading.js";

function createSnapshot(): AgentTradingSnapshot {
  return {
    bitflow: {
      tickerId: "sbtc_stx",
      lastPrice: 317750.97,
      liquidityUsd: 1_320_027.83,
    },
    marketStats: [
      {
        period: "2026-04-05",
        volumeUsd: 79_032.52,
        buyVolumeUsd: 39_048.46,
        sellVolumeUsd: 39_984.05,
        netflowUsd: -935.59,
        uniqueTraders: 92,
        uniqueBuyers: 73,
        uniqueSellers: 52,
        uniquePools: 57,
      },
      {
        period: "2026-04-06",
        volumeUsd: 80_403.06,
        buyVolumeUsd: 38_837.23,
        sellVolumeUsd: 41_565.82,
        netflowUsd: -2_728.59,
        uniqueTraders: 104,
        uniqueBuyers: 78,
        uniqueSellers: 54,
        uniquePools: 42,
      },
    ],
    trendingPool: {
      poolId: "bitflow-sbtc-stx",
      liquidityUsd: 1_320_027.83,
      volume1dUsd: 8_369.31,
      swaps1d: 74,
    },
    jingswapDex: {
      xykStxPerBtc: 316205.85,
      dlmmStxPerBtc: 321926.79,
      xykSbtcBalance: 9.7006,
      xykStxBalance: 3_067_392.1,
    },
    jingswapCycle: {
      currentCycle: 11,
      phase: 0,
      blocksElapsed: 9_149,
      totalStx: 0,
      totalSbtc: 43_664,
    },
    jingswapDepositors: {
      cycle: 11,
      stxDepositors: [],
      sbtcDepositors: ["SP2...", "SPV..."],
    },
    previousSettlement: {
      cycle: 10,
      stxCleared: 1.01,
      sbtcCleared: 319,
      stxPerBtc: 315_701.61,
    },
  };
}

describe("agent-trading candidates", () => {
  it("builds on-beat market-data candidates", () => {
    const candidates = buildAgentTradingCandidates(createSnapshot());

    expect(candidates.map((candidate) => candidate.kind)).toEqual(
      expect.arrayContaining([
        "venue-spread",
        "auction-imbalance",
        "market-share",
      ])
    );
    expect(candidates[0].headline).toContain("AIBTC agents");
    expect(candidates[0].body).toContain("For AIBTC agent traders");
    expect(candidates[0].body).toContain("0 STX");
    expect(candidates[0].body.length).toBeLessThanOrEqual(1000);
    expect(candidates.every((candidate) => candidate.body.includes("For AIBTC agent traders"))).toBe(true);
  });

  it("skips duplicate recent signals and falls back to the next candidate", () => {
    const candidates = buildAgentTradingCandidates(createSnapshot());
    const recentSignals: RemoteSignal[] = [
      {
        headline:
          "JingSwap quotes 321,927 STX/BTC vs Bitflow 317,751 while cycle 11 still has 43,664 sats and 0 STX",
        body:
          "3 sBTC/STX venues currently print 317,751, 316,206 and 321,927 STX/BTC. Cycle 11 still has 43,664 sats against 0 STX.",
        timestamp: "2026-04-07T09:30:00.000Z",
        pacificDate: "2026-04-07",
        sourceUrls: [
          "https://bitflow-sdk-api-gateway-7owjsmt8.uc.gateway.dev/ticker",
          "https://faktory-dao-backend.vercel.app/api/auction/dex-price",
          "https://faktory-dao-backend.vercel.app/api/auction/cycle-state",
        ],
      },
    ];

    const selected = selectCandidate(
      candidates,
      recentSignals,
      createEmptyBotState(),
      "2026-04-07"
    );

    expect(selected?.kind).not.toBe("venue-spread");
    expect(["auction-imbalance", "market-share"]).toContain(selected?.kind);
  });
});

describe("normaliseSignal", () => {
  it("parses stringified source arrays from the status endpoint", () => {
    const signal = normaliseSignal({
      id: "abc123",
      headline: "Test headline",
      body: "Test body",
      created_at: "2026-04-07T10:00:00.000Z",
      sources:
        '[{"url":"https://example.com/one","title":"One"},{"url":"https://example.com/two","title":"Two"}]',
      status: "rejected",
      pacific_date: "2026-04-07",
    });

    expect(signal).toEqual({
      id: "abc123",
      headline: "Test headline",
      body: "Test body",
      timestamp: "2026-04-07T10:00:00.000Z",
      status: "rejected",
      pacificDate: "2026-04-07",
      sourceUrls: ["https://example.com/one", "https://example.com/two"],
    });
  });
});
