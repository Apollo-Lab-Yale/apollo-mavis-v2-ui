/** MicTile (phase-11 §4): draws on the canvas from `telemetry.microphone`,
 * de-duplicates on `seq`, exposes the RMS level as a meter, and degrades to
 * absent / starting / stalled states. */
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { canvas2d } from "../../tests/setup";
import { makeMicrophone, makeMicrophoneInfo, makeTelemetry } from "../../tests/mocks/fixtures";
import { useStore } from "../store";
import { dbNorm, EnvelopeBuffer, fmtDbfs, MicTile } from "./MicTile";

const push = (over: Parameters<typeof makeMicrophone>[0]) =>
  act(() => useStore.getState().setTelemetry(makeTelemetry({ microphone: makeMicrophone(over) })));
const strokes = () => canvas2d.stroke.mock.calls.length;
const settle = () => new Promise((r) => setTimeout(r, 60));

describe("MicTile", () => {
  afterEach(() => {
    act(() => useStore.getState().resetForEpochChange());
  });

  it("absent without telemetry or info; `info` alone drives starting / absent", () => {
    const { rerender } = render(<MicTile />);
    const tile = screen.getByTestId("mic-tile");
    expect(tile.dataset["state"]).toBe("absent");
    expect(tile.getAttribute("role")).toBe("meter");
    expect(screen.getByTestId("mic-message").textContent).toContain("Microphone · not detected");
    expect(screen.getByTestId("mic-title").textContent).toBe("Perception · microphone");
    rerender(<MicTile info={makeMicrophoneInfo({ live: true, status: "live" })} />);
    expect(tile.dataset["state"]).toBe("starting"); // live device, no telemetry frame yet
    rerender(
      <MicTile info={makeMicrophoneInfo({ live: false, status: "absent", detail: "unplugged" })} />,
    );
    expect(tile.dataset["state"]).toBe("absent");
    expect(screen.getByTestId("mic-message").textContent).toContain("unplugged");
  });

  it("draws a frame per new seq and ignores repeated seqs", async () => {
    render(<MicTile subtitle="RØDE NT-USB Mini · 48 kHz mono" />);
    push({ seq: 1, rms_dbfs: -18.3, peak_dbfs: -6.1 });
    const tile = screen.getByTestId("mic-tile");
    expect(tile.dataset["state"]).toBe("live");
    await waitFor(() => expect(strokes()).toBeGreaterThan(0));
    const after1 = strokes();
    expect(screen.getByTestId("mic-readout").textContent).toBe("-18.3 dBFS");
    expect(tile.getAttribute("aria-valuenow")).toBe("-18");
    expect(tile.getAttribute("aria-valuetext")).toBe("-18.3 dBFS");
    expect(screen.getByText("RØDE NT-USB Mini · 48 kHz mono")).toBeInTheDocument();
    // Same seq (25 Hz telemetry vs 20 Hz frames) → no redraw, readout unchanged.
    push({ seq: 1, rms_dbfs: -3.0 });
    await settle();
    expect(strokes()).toBe(after1);
    expect(screen.getByTestId("mic-readout").textContent).toBe("-18.3 dBFS");
    push({ seq: 2, rms_dbfs: -3.0, peak_dbfs: -0.5, clipping: true });
    await waitFor(() => expect(strokes()).toBeGreaterThan(after1));
    expect(screen.getByTestId("mic-readout").textContent).toBe("-3.0 dBFS");
    expect(tile.dataset["clipping"]).toBe("true");
  });

  it("stalled when telemetry goes stale or the runtime reports it; keeps the scope", () => {
    render(<MicTile />);
    push({ seq: 5 });
    const tile = screen.getByTestId("mic-tile");
    act(() => useStore.getState().setTelemetryStale(true));
    expect(tile.dataset["state"]).toBe("stalled");
    expect(screen.getByTestId("mic-stalled")).toBeInTheDocument();
    expect(screen.getByTestId("mic-status").textContent).toBe("STALLED");
    act(() => useStore.getState().setTelemetryStale(false));
    push({ seq: 6, status: "stalled", detail: "no frames for 0.8 s" });
    expect(tile.dataset["state"]).toBe("stalled");
    push({ seq: 7, status: "error", detail: "device busy" });
    expect(tile.dataset["state"]).toBe("error");
    expect(screen.getByTestId("mic-message").textContent).toContain("device busy");
  });

  it("ignores blocks for another mic id", () => {
    render(<MicTile micId="mic_other" />);
    push({ seq: 1, mic_id: "mic_view" });
    expect(screen.getByTestId("mic-tile").dataset["state"]).toBe("absent");
  });

  it("helpers: dbNorm clamps −60..0, fmtDbfs formats, EnvelopeBuffer wraps oldest→newest", () => {
    expect(dbNorm(null)).toBe(0);
    expect(dbNorm(-60)).toBe(0);
    expect(dbNorm(-30)).toBeCloseTo(0.5);
    expect(dbNorm(3)).toBe(1);
    expect(fmtDbfs(null)).toBe("—");
    expect(fmtDbfs(-120)).toBe("-inf");
    expect(fmtDbfs(-18.34)).toBe("-18.3");
    const buf = new EnvelopeBuffer(4);
    buf.push([-10, -20, -30], [10, 20, 30]);
    expect(buf.filled).toBe(3);
    expect(Array.from({ length: 3 }, (_, i) => buf.max[buf.index(i)])).toEqual([10, 20, 30]);
    buf.push([-40, -50], [40, 200]); // clamps to int8, wraps
    expect(buf.filled).toBe(4);
    expect(Array.from({ length: 4 }, (_, i) => buf.max[buf.index(i)])).toEqual([20, 30, 40, 127]);
  });
});
