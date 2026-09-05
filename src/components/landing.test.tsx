/** Welcome-page pieces, pure helpers + small renders (phase-09a): the
 * `hardwareCaption` twin segment, `twinCaption` / `armMonitorText`,
 * `overlayNote` (wire " - " → middle dot), the `ArmStatusCard` C19 chip and the
 * five-cell `ObservationGrid` with overlay notes from store telemetry;
 * (phase-09b) the card's safety read-back line and the Clear errors / Apply
 * safety settings buttons — enablement matrix, POST bodies, toast copy. */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArmMaintenanceResult, ArmMonitorTelemetry } from "../gen";
import {
  makeArmMonitor,
  makeArmStatus,
  makeHardwareArms,
  makeHardwareCameras,
  makeHardwareMonitor,
  makeHardwareWorkcell,
  makeMaintenanceResult,
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

// -- phase-09b: arm-card maintenance strip -----------------------------------------------
describe("ArmStatusCard maintenance (phase-09b)", () => {
  let posts: { url: string; body: unknown }[];
  let answer: (armId: string, op: string) => Response;
  let release: (() => void) | null;
  const view = makeArmStatus({
    arm_id: "view",
    ip: "192.168.2.219",
    gripper: "none",
    reachable: "open",
    error_code: 19,
  });
  const grip = makeArmStatus({ arm_id: "grip", ip: "192.168.1.201", reachable: "open" });

  const setMonitorArms = (arms: ArmMonitorTelemetry[], paused = false) =>
    setMonitor(makeHardwareMonitor({ paused, arms }));
  const ok = (r: Partial<ArmMaintenanceResult>) =>
    new Response(JSON.stringify(makeMaintenanceResult(r)), { status: 200 });

  beforeEach(() => {
    posts = [];
    release = null;
    answer = (armId, op) =>
      ok({
        arm_id: armId,
        op: op as ArmMaintenanceResult["op"],
        after: makeArmMonitor({ arm_id: armId, tcp_load_kg: armId === "view" ? 0.55 : 0.95 }),
      });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "POST") {
          const body = JSON.parse(String(init.body)) as { op: string };
          posts.push({ url, body });
          const armId = /\/arms\/([^/]+)\//.exec(url)?.[1] ?? "";
          if (release !== null) {
            await new Promise<void>((r) => {
              release = r;
            });
          }
          return answer(armId, body.op);
        }
        return new Response("{}", { status: 200 });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    act(() => useStore.getState().resetForEpochChange());
    useStore.setState({ toasts: [] });
  });

  it("meta line 'sensitivity N · payload X kg' from the monitor row; amber + title when it differs", () => {
    render(<ArmStatusCard arm={grip} kind="hardware" />);
    expect(screen.queryByTestId("arm-safety-grip")).toBeNull(); // no telemetry yet
    setMonitorArms([makeArmMonitor()]);
    const meta = screen.getByTestId("arm-safety-grip");
    expect(meta.textContent).toBe("sensitivity 3 · payload 0.95 kg");
    expect(meta.className).toBe("arm-card-safety");
    expect(meta.dataset["mismatch"]).toBe("false");
    expect(meta.getAttribute("title")).toBeNull();
    expect(meta.querySelector("svg")).toBeNull();
    setMonitorArms([
      makeArmMonitor({ collision_sensitivity: 1, tcp_load_kg: 0, backstops_match: false }),
    ]);
    expect(meta.textContent).toBe("sensitivity 1 · payload 0.00 kg");
    expect(meta.className).toBe("arm-card-safety is-mismatch");
    expect(meta.dataset["mismatch"]).toBe("true");
    expect(meta.getAttribute("title")).toBe("differs from config");
    expect(meta.querySelector("svg")).not.toBeNull(); // never colour alone
    // The card keeps its other meta entries and the C-chip logic untouched.
    expect(screen.getByTestId("arm-card-grip").textContent).toContain("192.168.1.201");
    expect(screen.queryByTestId("arm-error-grip")).toBeNull();
  });

  it("button matrix: errors → Clear; mismatch → Apply; session → both off + 'Use the Cockpit'; busy → both off", () => {
    render(<ArmStatusCard arm={view} kind="hardware" />);
    const clear = screen.getByTestId("arm-clear-errors-view");
    const apply = screen.getByTestId("arm-apply-backstops-view");
    expect(clear.textContent).toBe("Clear errors");
    expect(apply.textContent).toBe("Apply safety settings");
    expect(clear.className).toBe("btn-secondary btn-sm");
    // No telemetry: the REST error_code (19) alone enables Clear; Apply needs a read-back.
    expect(clear).not.toBeDisabled();
    expect(apply).toBeDisabled();
    expect(screen.queryByTestId("arm-actions-reason-view")).toBeNull();
    // Monitor: no error, no warning, matching → both disabled.
    setMonitorArms([makeArmMonitor({ arm_id: "view" })]);
    expect(clear).toBeDisabled();
    expect(apply).toBeDisabled();
    // warn_code alone enables Clear.
    setMonitorArms([makeArmMonitor({ arm_id: "view", warn_code: 11 })]);
    expect(clear).not.toBeDisabled();
    // error_code enables Clear; backstops_match false enables Apply.
    setMonitorArms([makeArmMonitor({ arm_id: "view", error_code: 19, backstops_match: false })]);
    expect(clear).not.toBeDisabled();
    expect(apply).not.toBeDisabled();
    // A hardware session (monitor paused) disables both with the visible reason.
    setMonitorArms(
      [makeArmMonitor({ arm_id: "view", error_code: 19, backstops_match: false })],
      true,
    );
    expect(clear).toBeDisabled();
    expect(apply).toBeDisabled();
    expect(screen.getByTestId("arm-actions-reason-view").textContent).toBe("Use the Cockpit");
    expect(clear.getAttribute("title")).toBe("Use the Cockpit");
    // An op running server-side (maintenance_busy, e.g. another client's curl) disables
    // both; neither button claims to be the one in flight - a single shared indicator
    // says so instead (only one op can run on an arm); no "Use the Cockpit" reason.
    setMonitorArms([
      makeArmMonitor({
        arm_id: "view",
        error_code: 19,
        backstops_match: false,
        maintenance_busy: true,
      }),
    ]);
    expect(clear).toBeDisabled();
    expect(apply).toBeDisabled();
    expect(clear.getAttribute("aria-busy")).toBeNull();
    expect(apply.getAttribute("aria-busy")).toBeNull();
    expect(clear.querySelector(".spinner")).toBeNull();
    const busy = screen.getByTestId("arm-actions-busy-view");
    expect(busy.textContent).toContain("maintenance running…");
    expect(busy.querySelector(".spinner")).not.toBeNull();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.queryByTestId("arm-actions-reason-view")).toBeNull();
    // Gone once the op finished.
    setMonitorArms([makeArmMonitor({ arm_id: "view", error_code: 19, backstops_match: false })]);
    expect(screen.queryByTestId("arm-actions-busy-view")).toBeNull();
    expect(clear).not.toBeDisabled();
  });

  it("sim cards carry neither the read-back line nor the buttons", () => {
    render(<ArmStatusCard arm={makeArmStatus({ arm_id: "grip" })} kind="sim" />);
    setMonitorArms([makeArmMonitor({ error_code: 19, backstops_match: false })]);
    expect(screen.queryByTestId("arm-safety-grip")).toBeNull();
    expect(screen.queryByTestId("arm-actions-grip")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("Clear errors → POST {op: clear_errors}, busy in flight, success toast 'Perception Arm · errors cleared'", async () => {
    release = () => undefined;
    render(<ArmStatusCard arm={view} kind="hardware" />);
    setMonitorArms([makeArmMonitor({ arm_id: "view", error_code: 19, backstops_match: false })]);
    const clear = screen.getByTestId("arm-clear-errors-view");
    const apply = screen.getByTestId("arm-apply-backstops-view");
    fireEvent.click(clear);
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({
      url: "/api/hardware/arms/view/maintenance",
      body: { op: "clear_errors" },
    });
    // One request at a time per card: both buttons disabled, the pressed one busy.
    expect(clear).toBeDisabled();
    expect(clear.getAttribute("aria-busy")).toBe("true");
    expect(clear.querySelector(".spinner")).not.toBeNull();
    expect(apply).toBeDisabled();
    expect(apply.getAttribute("aria-busy")).toBeNull();
    fireEvent.click(apply);
    expect(posts).toHaveLength(1);
    act(() => release?.());
    await waitFor(() => expect(useStore.getState().toasts).toHaveLength(1));
    expect(useStore.getState().toasts[0]).toMatchObject({
      text: "Perception Arm · errors cleared",
      tone: "success",
    });
    await waitFor(() => expect(clear).not.toBeDisabled());
    expect(clear.getAttribute("aria-busy")).toBeNull();
  });

  it("Apply safety settings → POST {op: apply_backstops}, toast with the read-back", async () => {
    render(<ArmStatusCard arm={grip} kind="hardware" />);
    setMonitorArms([
      makeArmMonitor({ collision_sensitivity: 3, tcp_load_kg: 0, backstops_match: false }),
    ]);
    fireEvent.click(screen.getByTestId("arm-apply-backstops-grip"));
    await waitFor(() => expect(useStore.getState().toasts).toHaveLength(1));
    expect(posts).toEqual([
      { url: "/api/hardware/arms/grip/maintenance", body: { op: "apply_backstops" } },
    ]);
    expect(useStore.getState().toasts[0]).toMatchObject({
      text: "Manipulation Arm · safety settings applied (sensitivity 3, payload 0.95 kg)",
      tone: "success",
    });
  });

  it("failures: ok:false → error toast with detail; 409 → error toast with the server detail", async () => {
    answer = (armId, op) =>
      ok({
        arm_id: armId,
        op: op as ArmMaintenanceResult["op"],
        ok: false,
        detail: "monitor not connected",
        before: null,
        after: null,
      });
    render(<ArmStatusCard arm={view} kind="hardware" />);
    setMonitorArms([makeArmMonitor({ arm_id: "view", error_code: 19 })]);
    fireEvent.click(screen.getByTestId("arm-clear-errors-view"));
    await waitFor(() => expect(useStore.getState().toasts).toHaveLength(1));
    expect(useStore.getState().toasts[0]).toMatchObject({
      text: "Perception Arm · monitor not connected",
      tone: "error",
    });
    answer = () =>
      new Response(
        JSON.stringify({ detail: "monitor paused - a hardware session owns the boxes" }),
        {
          status: 409,
        },
      );
    await waitFor(() => expect(screen.getByTestId("arm-clear-errors-view")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("arm-clear-errors-view"));
    await waitFor(() => expect(useStore.getState().toasts).toHaveLength(2));
    expect(useStore.getState().toasts[1]).toMatchObject({
      text: "Perception Arm · monitor paused - a hardware session owns the boxes",
      tone: "error",
    });
  });
});
