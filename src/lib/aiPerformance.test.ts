import { describe, expect, it } from "vitest";
import {
  performancePeriod,
  percentile,
  selectionLengthBucket,
  summarizeAiPerformance,
  type AiPerformanceEvent,
} from "./aiPerformance";

function event(overrides: Partial<AiPerformanceEvent> = {}): AiPerformanceEvent {
  return {
    attempts: 1,
    cfColo: "LAX",
    clientTotalMs: 1500,
    errorClass: null,
    id: crypto.randomUUID(),
    inputTokens: 500,
    mode: "english",
    model: "gemini-3.5-flash-lite",
    outputTokens: 80,
    platform: "web",
    provider: "gemini",
    providerMs: 1000,
    schemaVersion: 1,
    selectionKind: "passage",
    selectionLength: "medium",
    startedAt: "2026-08-22T00:00:00.000Z",
    success: true,
    surface: "pdf",
    workerMs: 1200,
    ...overrides,
  };
}

describe("PDF AI performance metadata", () => {
  it("uses coarse selection lengths without retaining source text", () => {
    expect(selectionLengthBucket("brief phrase")).toBe("short");
    expect(selectionLengthBucket("x".repeat(80))).toBe("medium");
    expect(selectionLengthBucket("x".repeat(300))).toBe("long");
  });

  it("assigns UTC timestamps to fixed UTC+8 reading periods", () => {
    expect(performancePeriod("2026-08-22T00:00:00.000Z")).toBe("morning");
    expect(performancePeriod("2026-08-22T06:00:00.000Z")).toBe("afternoon");
    expect(performancePeriod("2026-08-22T12:00:00.000Z")).toBe("evening");
    expect(performancePeriod("2026-08-22T20:00:00.000Z")).toBe("overnight");
  });

  it("reports nearest-rank percentiles and separates time periods", () => {
    const events = [
      event({ clientTotalMs: 1000, startedAt: "2026-08-22T00:00:00.000Z" }),
      event({ clientTotalMs: 1200, startedAt: "2026-08-22T01:00:00.000Z" }),
      event({ clientTotalMs: 1500, startedAt: "2026-08-22T06:00:00.000Z" }),
      event({ clientTotalMs: 3000, startedAt: "2026-08-22T12:00:00.000Z" }),
      event({ clientTotalMs: 5000, errorClass: "server_5xx", startedAt: "2026-08-22T13:00:00.000Z", success: false }),
    ];
    const summary = summarizeAiPerformance(events, new Date("2026-08-23T00:00:00.000Z"));
    expect(summary).toMatchObject({ count: 5, p50Ms: 1500, p95Ms: 5000, successRate: 0.8 });
    expect(summary.byPeriod.morning).toMatchObject({ count: 2, p50Ms: 1000, p95Ms: 1200 });
    expect(summary.byPeriod.evening).toMatchObject({ count: 2, p50Ms: 3000, p95Ms: 5000 });
    expect(summary.colos).toEqual([{ colo: "LAX", count: 5 }]);
    expect(percentile([], 0.95)).toBeNull();
  });
});
