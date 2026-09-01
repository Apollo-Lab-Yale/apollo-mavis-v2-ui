import { describe, expect, it } from "vitest";
import { SkewEstimator } from "./time";

describe("SkewEstimator", () => {
  it("reports zero latency for the fastest frame and growth after", () => {
    const est = new SkewEstimator();
    // Server clock is wildly skewed (+1000 s) — only relative growth matters.
    expect(est.observe(1000.0, 100)).toBe(0); // first sample defines the offset
    expect(est.observe(1000.1, 250)).toBeCloseTo(50); // 150 ms later, 100 ms of server time
    expect(est.observe(1000.2, 300)).toBeCloseTo(0); // back to min offset
  });

  it("never returns negative latency", () => {
    const est = new SkewEstimator();
    est.observe(10, 500);
    // A frame that arrives "faster" than the current min just lowers the offset.
    expect(est.observe(11, 400)).toBe(0);
    expect(est.observe(12, 5000)).toBeGreaterThanOrEqual(0);
  });

  it("forgets samples outside the 5 s window", () => {
    const est = new SkewEstimator(5000);
    est.observe(0, 0); // offset 0
    est.observe(1, 7000); // old sample expired; new min offset = 6000
    expect(est.observe(2, 8000)).toBeCloseTo(0);
  });
});
