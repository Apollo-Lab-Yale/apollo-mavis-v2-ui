/** Twin-proximity frame (05-ui §8.2, 2026-09-07): the pure classifier's
 * breakpoints agree with ClearanceReadout (0.05 amber / 0.02 red), the sentinel
 * `min_clearance_m: 1.0` never alarms, a gate block is full red, stale greys,
 * and the frame renders `--prox` + `data-tone` + the chip from the store. */
import { render, screen } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { makeTelemetry } from "../../tests/mocks/fixtures";
import { useStore } from "../store";
import {
  PROXIMITY_CLEAR,
  PROXIMITY_CLOSE_M,
  PROXIMITY_FAR_M,
  PROXIMITY_NEAR_M,
  ProximityFrame,
  proximity,
  proximityLevel,
} from "./proximity";

const item = (dist_m: number, pair: [string, string] = ["grip/link6", "table"]) => ({
  pair,
  dist_m,
});

describe("proximity()", () => {
  it("levels: 0 at the sweep range, 0.5 at the amber grade, 1 at the red grade", () => {
    expect(proximityLevel(PROXIMITY_FAR_M)).toBe(0);
    expect(proximityLevel(0.5)).toBe(0);
    expect(proximityLevel(0.075)).toBeCloseTo(0.25, 6);
    expect(proximityLevel(PROXIMITY_NEAR_M)).toBeCloseTo(0.5, 6);
    expect(proximityLevel(0.035)).toBeCloseTo(0.75, 6);
    expect(proximityLevel(PROXIMITY_CLOSE_M)).toBe(1);
    expect(proximityLevel(0.001)).toBe(1);
    expect(proximityLevel(Number.NaN)).toBe(0);
    // Whole-millimetre input, 1/100 steps: a 25 Hz stream does not re-render on float noise.
    expect(proximityLevel(0.0733)).toBe(proximityLevel(0.07304));
    expect(proximityLevel(0.0733) * 100).toBeCloseTo(Math.round(proximityLevel(0.0733) * 100), 9);
  });

  it("no telemetry / no pairs / far pairs / the 1.0 sentinel are all clear", () => {
    expect(proximity(null)).toBe(PROXIMITY_CLEAR);
    expect(proximity(makeTelemetry())).toEqual(PROXIMITY_CLEAR); // min_clearance_m 1.0, []
    expect(proximity(makeTelemetry({ clearances: [item(0.2)] })).tone).toBe("clear");
    expect(proximity(makeTelemetry({ clearances: [item(PROXIMITY_FAR_M)] })).tone).toBe("clear");
    expect(proximity(makeTelemetry(), true)).toEqual({ ...PROXIMITY_CLEAR, stale: true });
  });

  it("near then close, from the SMALLEST pair, with mm + pair text", () => {
    const near = proximity(makeTelemetry({ clearances: [item(0.2), item(0.06, ["a", "b"])] }));
    expect(near).toEqual({
      tone: "near",
      level: proximityLevel(0.06),
      distMm: 60,
      pairText: "a ↔ b",
      stale: false,
    });
    const close = proximity(makeTelemetry({ clearances: [item(0.034)] }));
    expect(close.tone).toBe("close");
    expect(close.level).toBeCloseTo(0.77, 6); // 0.5 + 0.5 * (50 - 34) / 30 = 0.7667 -> 1/100 steps
    expect(close.distMm).toBe(34);
    expect(close.pairText).toBe("grip/link6 ↔ table");
    // Exactly the amber grade is still "near" (matches ClearanceReadout's < 0.05 red rule).
    expect(proximity(makeTelemetry({ clearances: [item(PROXIMITY_NEAR_M)] })).tone).toBe("near");
    expect(proximity(makeTelemetry({ clearances: [item(0.0499)] })).tone).toBe("close");
  });

  it("a gate block is full red whatever the sweep says; distance from the gate if needed", () => {
    const blocked = proximity(
      makeTelemetry({
        collision: {
          blocked: true,
          severity: "blocked",
          pairs: [["grip/link5", "view/link3"]],
          min_clearance_m: 0.004,
        },
        clearances: [],
      }),
    );
    expect(blocked).toEqual({
      tone: "blocked",
      level: 1,
      distMm: 4,
      pairText: "grip/link5 ↔ view/link3",
      stale: false,
    });
    const withSweep = proximity(
      makeTelemetry({
        collision: { blocked: true, severity: "blocked", pairs: [], min_clearance_m: 1.0 },
        clearances: [item(0.007, ["x", "y"])],
      }),
    );
    expect(withSweep.distMm).toBe(7);
    expect(withSweep.pairText).toBe("x ↔ y");
    // Sentinel-only block: no distance is invented.
    const bare = proximity(
      makeTelemetry({ collision: { blocked: true, severity: "blocked", min_clearance_m: 1.0 } }),
    );
    expect(bare.tone).toBe("blocked");
    expect(bare.distMm).toBeNull();
    expect(bare.pairText).toBeNull();
  });
});

describe("<ProximityFrame>", () => {
  beforeEach(() => act(() => useStore.setState({ telemetry: null, telemetryStale: false })));

  it("clear: ring off, no chip; near/close: --prox + tone + chip copy; stale greys", () => {
    render(<ProximityFrame />);
    const frame = screen.getByTestId("proximity-frame");
    expect(frame.dataset.tone).toBe("clear");
    expect(frame.style.getPropertyValue("--prox")).toBe("0");
    expect(screen.queryByTestId("proximity-chip")).toBeNull();
    expect(frame.getAttribute("aria-hidden")).toBe("true");

    act(() => useStore.getState().setTelemetry(makeTelemetry({ clearances: [item(0.034)] })));
    expect(frame.dataset.tone).toBe("close");
    expect(Number(frame.style.getPropertyValue("--prox"))).toBeCloseTo(0.77, 6);
    expect(frame.getAttribute("aria-hidden")).toBe("false");
    const chip = screen.getByTestId("proximity-chip");
    expect(chip.textContent).toContain("Very close");
    expect(chip.textContent).toContain("34 mm");
    expect(chip.textContent).toContain("grip/link6 ↔ table");
    expect(frame.dataset.stale).toBeUndefined();

    act(() => useStore.getState().setTelemetry(makeTelemetry({ clearances: [item(0.08)] })));
    expect(frame.dataset.tone).toBe("near");
    expect(screen.getByTestId("proximity-chip").textContent).toContain("Near obstacle");

    act(() => useStore.getState().setTelemetryStale(true));
    expect(frame.dataset.stale).toBe("true");
    expect(screen.getByTestId("proximity-chip").textContent).toContain("stale");

    act(() => useStore.getState().setTelemetry(makeTelemetry()));
    expect(frame.dataset.tone).toBe("clear");
    expect(screen.queryByTestId("proximity-chip")).toBeNull();
  });
});
