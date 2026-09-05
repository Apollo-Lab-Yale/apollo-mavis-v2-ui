/** Welcome-page pieces, pure helpers + small renders (phase-09a): the
 * `hardwareCaption` twin segment, `twinCaption` / `armMonitorText`,
 * `overlayNote` (wire " - " → middle dot), the `ArmStatusCard` C19 chip and the
 * five-cell `ObservationGrid` with overlay notes from store telemetry. */
import { act, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  makeArmMonitor,
  makeArmStatus,
  makeHardwareArms,
  makeHardwareCameras,
  makeHardwareMonitor,
  makeHardwareWorkcell,
  makeMicrophoneInfo,
  makeOverlayCameras,
  makeTelemetry,
  makeTwinOverlay,
} from "../../tests/mocks/fixtures";
import { useStore } from "../store";
import {
  ArmStatusCard,
  armMonitorText,
  hardwareCaption,
  ObservationGrid,
  overlayNote,
  twinCaption,
} from "./landing";

const setMonitor = (m: ReturnType<typeof makeHardwareMonitor> | null) =>
  act(() => useStore.getState().setTelemetry(makeTelemetry({ hardware_monitor: m ?? undefined })));

describe("landing helpers (phase-09a)", () => {
  afterEach(() => {
    act(() => useStore.getState().resetForEpochChange());
  });

  it("armMonitorText / twinCaption: status per arm, error C<code> wins, Manipulation Arm first", () => {
    expect(armMonitorText(makeArmMonitor())).toBe("running");
    expect(armMonitorText(makeArmMonitor({ status: "paused" }))).toBe("paused");
    expect(armMonitorText(makeArmMonitor({ status: "stale", error_code: 19 }))).toBe("error C19");
    expect(twinCaption(makeHardwareMonitor())).toBe(
      "twin: Manipulation Arm running, Perception Arm error C19",
    );
    // Runtime order view-first is re-ordered; paused arms read "paused".
    expect(
      twinCaption(
        makeHardwareMonitor({
          paused: true,
          arms: [
            makeArmMonitor({ arm_id: "view", status: "paused" }),
            makeArmMonitor({ arm_id: "grip", status: "paused" }),
          ],
        }),
      ),
    ).toBe("twin: Manipulation Arm paused, Perception Arm paused");
    // Monitor inert (`enabled: false` / hardware package missing): the runtime still
    // lists every configured arm, each `status: "off"`.
    expect(
      twinCaption(
        makeHardwareMonitor({
          enabled: false,
          arms: [
            makeArmMonitor({ status: "off", q: [], seq: 0, age_s: null, detail: "disabled" }),
            makeArmMonitor({ arm_id: "view", status: "off", q: [], seq: 0, age_s: null }),
          ],
          overlays: [],
        }),
      ),
    ).toBe("twin: Manipulation Arm off, Perception Arm off");
    // "twin: off" only when the block lists no arm (no hardware workcell configured).
    expect(twinCaption(makeHardwareMonitor({ enabled: false, arms: [] }))).toBe("twin: off");
    expect(twinCaption({})).toBe("twin: off");
  });

  it("hardwareCaption appends the twin segment after the cameras only when the block exists", () => {
    const status = makeHardwareWorkcell({ hardware_ready: true, arms: makeHardwareArms("open") });
    const cams = makeHardwareCameras(true);
    const mic = makeMicrophoneInfo();
    expect(hardwareCaption(status, cams, mic, true)).toBe(
      "Manipulation Arm reachable, Perception Arm reachable · grip_wrist (live), view_wrist (live) · mic: RØDE NT-USB Mini (live)",
    );
    expect(hardwareCaption(status, cams, mic, true, null)).toBe(
      hardwareCaption(status, cams, mic, true),
    );
    expect(hardwareCaption(status, cams, mic, true, makeHardwareMonitor())).toBe(
      "Manipulation Arm reachable, Perception Arm reachable · grip_wrist (live), view_wrist (live) · twin: Manipulation Arm running, Perception Arm error C19 · mic: RØDE NT-USB Mini (live)",
    );
    // Overlay rows never enter the camera segment; no mic → "mic: none".
    expect(
      hardwareCaption(null, [...cams, ...makeOverlayCameras(true)], null, true, {
        enabled: false,
      }),
    ).toBe("No arms detected · grip_wrist (live), view_wrist (live) · twin: off · mic: none");
  });

  it("overlayNote: the stream's detail with ' - ' as a middle dot; empty when missing", () => {
    const m = makeHardwareMonitor();
    expect(overlayNote(m, "grip_wrist_align")).toBe("rail not homed · twin assumes 0.65 m");
    expect(overlayNote(m, "view_wrist_align")).toBe("");
    expect(overlayNote(m, "nope_align")).toBe("");
    expect(overlayNote(null, "grip_wrist_align")).toBe("");
    expect(overlayNote(undefined, "grip_wrist_align")).toBe("");
    expect(
      overlayNote({ overlays: [makeTwinOverlay({ detail: "monitor stale" })] }, "grip_wrist_align"),
    ).toBe("monitor stale");
    // Only the spaced separator is a dot: hyphens inside words / negatives stay.
    expect(
      overlayNote(
        { overlays: [makeTwinOverlay({ detail: "joint1 offset -0.5 rad - re-check" })] },
        "grip_wrist_align",
      ),
    ).toBe("joint1 offset -0.5 rad · re-check");
    // The runtime joins parts with "; " (monitor text; rail fallback): one separator style.
    expect(
      overlayNote(
        {
          overlays: [
            makeTwinOverlay({
              detail:
                "monitor stale: no fresh sample for 1.2 s; rail not homed - twin assumes 0.65 m",
            }),
          ],
        },
        "grip_wrist_align",
      ),
    ).toBe("monitor stale: no fresh sample for 1.2 s · rail not homed · twin assumes 0.65 m");
    expect(
      overlayNote(
        {
          overlays: [
            makeTwinOverlay({ detail: "no sample from view yet - monitor error: connect failed" }),
          ],
        },
        "grip_wrist_align",
      ),
    ).toBe("no sample from view yet · monitor error: connect failed");
  });

  it("ArmStatusCard: error_code != 0 → red chip C<code>; 0 → no chip", () => {
    const { rerender } = render(
      <ArmStatusCard
        arm={makeArmStatus({ arm_id: "view", gripper: "none", reachable: "open", error_code: 19 })}
        kind="hardware"
      />,
    );
    const chip = screen.getByTestId("arm-error-view");
    expect(chip.textContent).toBe("C19");
    expect(chip.className).toBe("chip chip-red");
    expect(chip.getAttribute("title")).toBe("controller error 19");
    rerender(
      <ArmStatusCard arm={makeArmStatus({ arm_id: "view", reachable: "open" })} kind="hardware" />,
    );
    expect(screen.queryByTestId("arm-error-view")).toBeNull();
  });

  it("ObservationGrid (hardware): five cells in DOM order, overlay notes from store telemetry, mic last", () => {
    render(
      <ObservationGrid
        tab="hardware"
        cameras={[...makeHardwareCameras(false), ...makeOverlayCameras(false)]}
        microphone={makeMicrophoneInfo()}
      />,
    );
    const grid = screen.getByTestId("camera-preview-grid");
    expect(grid.className).toBe("obs-grid obs-grid-5");
    expect(Array.from(grid.children).map((el) => (el as HTMLElement).dataset["testid"])).toEqual([
      "stream-grip_wrist",
      "stream-grip_wrist_align",
      "stream-view_wrist",
      "stream-view_wrist_align",
      "mic-tile",
    ]);
    expect(screen.queryByTestId("stream-note")).toBeNull();
    setMonitor(makeHardwareMonitor());
    const grip = screen.getByTestId("stream-grip_wrist_align");
    expect(within(grip).getByTestId("stream-note").textContent).toBe(
      "rail not homed · twin assumes 0.65 m",
    );
    expect(within(grip).getByTestId("stream-note").className).toBe("tile-badge tile-note");
    expect(grip.dataset["state"]).toBe("absent"); // the note shows regardless of liveness
    expect(
      within(screen.getByTestId("stream-view_wrist_align")).queryByTestId("stream-note"),
    ).toBeNull();
    // Real camera tiles never get a note, even with a same-named detail.
    expect(within(screen.getByTestId("stream-grip_wrist")).queryByTestId("stream-note")).toBeNull();
    setMonitor(null);
    expect(screen.queryByTestId("stream-note")).toBeNull();
  });

  it("ObservationGrid (hardware, no microphone): four cells, obs-grid-4; sim: 2×2", () => {
    const { rerender } = render(<ObservationGrid tab="hardware" cameras={[]} microphone={null} />);
    const grid = screen.getByTestId("camera-preview-grid");
    expect(grid.className).toBe("obs-grid obs-grid-4");
    expect(grid.children).toHaveLength(4);
    rerender(<ObservationGrid tab="sim" cameras={[]} microphone={makeMicrophoneInfo()} />);
    expect(grid.className).toBe("obs-grid obs-grid-4");
    expect(screen.queryByTestId("mic-tile")).toBeNull();
    expect(screen.queryByTestId("stream-grip_wrist_align")).toBeNull();
  });
});
