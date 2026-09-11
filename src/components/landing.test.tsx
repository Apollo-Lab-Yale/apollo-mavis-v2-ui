/** Welcome-page pieces, pure helpers + small renders (phase-09a): the
 * `hardwareCaption` twin segment, `twinCaption` / `armMonitorText`,
 * `overlayNote` (wire " - " → middle dot), the `ArmStatusCard` C19 chip and the
 * five-cell `ObservationGrid` with overlay notes from store telemetry;
 * (phase-09b) the card's safety read-back line and the Clear errors / Apply
 * safety settings buttons — enablement matrix, POST bodies, toast copy;
 * (phase-09c) the rail read-back pill, the Home rail button + HomeRailSheet
 * (dry run → verdict → destructive confirm → real POST → toast); (phase-09d)
 * the card's session-eligibility line (the Include switch is gone) and the
 * sheet's pre-positioning flow (planned → 202 job → telemetry progress →
 * `/maintenance/last` → toast; refused plan; failed job). */
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
  makeMaintenanceProgress,
  makeMaintenanceResult,
  makeMicrophoneInfo,
  makeOverlayCameras,
  makePlannedSweepVerdict,
  makePrePositionPlan,
  makeProfile,
  makeRailSweepVerdict,
  makeTelemetry,
  makeTwinOverlay,
} from "../../tests/mocks/fixtures";
import { useStore } from "../store";
import { JOB_FALLBACK } from "./HomeRailSheet";
import {
  ArmStatusCard,
  armMonitorText,
  hardwareCaption,
  ObservationGrid,
  overlayNote,
  StartFrom,
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

// -- phase-09c: rail read-back, Home rail → HomeRailSheet, session eligibility ------------
describe("ArmStatusCard rail homing + session eligibility (phase-09c)", () => {
  interface Post {
    url: string;
    body: { op: string; dry_run?: boolean };
    signal: AbortSignal | null | undefined;
  }
  let posts: Post[];
  /** Answer for a POST body (dry run / real op) — a Response or a thrown error. */
  let answer: (armId: string, body: Post["body"]) => Response | Promise<Response>;
  const grip = makeArmStatus({ arm_id: "grip", ip: "192.168.1.201", reachable: "open" });
  const setMonitorArms = (arms: ArmMonitorTelemetry[], paused = false) =>
    setMonitor(makeHardwareMonitor({ paused, arms }));
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
  const homed = (over: Partial<ArmMonitorTelemetry> = {}) =>
    makeArmMonitor({ rail_homed: true, rail_enabled: true, rail_pos_m: 0, ...over });
  /** The runtime's dry-run answer: `ok = clear && dry_run`, the verdict attached. */
  const dryRunAnswer = (verdict = makeRailSweepVerdict()) =>
    json(
      makeMaintenanceResult({
        arm_id: "grip",
        op: "home_rail",
        ok: verdict.clear,
        detail: verdict.clear ? "" : "rail sweep blocked at 0.120 m: grip/link6 <-> table",
        sdk_codes: {},
        before: makeArmMonitor(),
        after: null,
        rail_sweep: verdict,
      }),
    );
  const homedAnswer = () =>
    json(
      makeMaintenanceResult({
        arm_id: "grip",
        op: "home_rail",
        detail: "rail homed",
        sdk_codes: {
          set_linear_track_back_origin: 0,
          set_linear_track_enable: 0,
          set_linear_track_speed: 0,
        },
        before: makeArmMonitor(),
        after: homed(),
        rail_sweep: makeRailSweepVerdict(),
      }),
    );

  beforeEach(() => {
    posts = [];
    answer = (_armId, body) => (body.dry_run ? dryRunAnswer() : homedAnswer());
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "POST") {
          const body = JSON.parse(String(init.body)) as Post["body"];
          posts.push({ url, body, signal: init.signal });
          const armId = /\/arms\/([^/]+)\//.exec(url)?.[1] ?? "";
          return answer(armId, body);
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

  it("rail read-back: config text without telemetry; amber 'rail not homed' pill + Home rail while unhomed; 'rail 0.000 m' once homed; 'no rail'", () => {
    render(<ArmStatusCard arm={grip} kind="hardware" />);
    const rail = () => screen.getByTestId("arm-rail-grip");
    expect(rail().textContent).toBe("rail 0–0.65 m");
    expect(rail().dataset["rail"]).toBe("unknown");
    expect(screen.queryByTestId("arm-home-rail-grip")).toBeNull();
    // The real cell after power-up: track present, on_zero 0, not enabled.
    setMonitorArms([makeArmMonitor()]);
    expect(rail().textContent).toBe("rail not homed");
    expect(rail().className).toBe("pill pill-warn arm-card-rail");
    expect(rail().querySelector("svg")).not.toBeNull(); // never colour alone
    const home = screen.getByTestId("arm-home-rail-grip");
    expect(home.textContent).toBe("Home rail");
    expect(home.className).toBe("btn-secondary btn-sm");
    expect(home).toBeEnabled();
    expect(screen.queryByTestId("arm-home-rail-reason-grip")).toBeNull();
    // Homed but not enabled still counts as unhomed (position unknown to the twin).
    setMonitorArms([makeArmMonitor({ rail_homed: true, rail_enabled: false })]);
    expect(rail().textContent).toBe("rail not homed");
    // Homed + enabled: the measured position, three decimals; the button is gone.
    setMonitorArms([homed({ rail_pos_m: 0.6497 })]);
    expect(rail().textContent).toBe("rail 0.650 m");
    expect(rail().dataset["rail"]).toBe("homed");
    expect(rail().className).toBe("");
    expect(screen.queryByTestId("arm-home-rail-grip")).toBeNull();
    // No track on this arm.
    setMonitorArms([
      makeArmMonitor({ rail_present: false, rail_homed: false, rail_enabled: false }),
    ]);
    expect(rail().textContent).toBe("no rail");
    expect(screen.queryByTestId("arm-home-rail-grip")).toBeNull();
  });

  it("Home rail enablement: controller error → disabled + 'Clear errors first'; session → 'Use the Cockpit'; busy → disabled", () => {
    render(<ArmStatusCard arm={grip} kind="hardware" />);
    setMonitorArms([makeArmMonitor({ error_code: 19 })]);
    const home = () => screen.getByTestId("arm-home-rail-grip");
    expect(home()).toBeDisabled();
    expect(screen.getByTestId("arm-home-rail-reason-grip").textContent).toBe("Clear errors first");
    expect(home().getAttribute("title")).toBe("Clear errors first");
    // A warning alone does not block homing (the runtime checks error_code only).
    setMonitorArms([makeArmMonitor({ warn_code: 11 })]);
    expect(home()).toBeEnabled();
    expect(screen.queryByTestId("arm-home-rail-reason-grip")).toBeNull();
    // A hardware session owns the boxes: every card op is off, one shared reason.
    setMonitorArms([makeArmMonitor()], true);
    expect(home()).toBeDisabled();
    expect(screen.getByTestId("arm-actions-reason-grip").textContent).toBe("Use the Cockpit");
    expect(screen.queryByTestId("arm-home-rail-reason-grip")).toBeNull();
    // Another client's op running: disabled, the shared indicator, no aria-busy here.
    setMonitorArms([makeArmMonitor({ maintenance_busy: true })]);
    expect(home()).toBeDisabled();
    expect(home().getAttribute("aria-busy")).toBeNull();
    expect(screen.getByTestId("arm-actions-busy-grip")).toBeInTheDocument();
    // Sim cards never show it.
    render(<ArmStatusCard arm={makeArmStatus({ arm_id: "view" })} kind="sim" />);
    expect(screen.queryByTestId("arm-home-rail-view")).toBeNull();
  });

  it("Home rail → sheet: dry run first (zero writes), verdict rendered, destructive confirm → real POST with the 60 s deadline → toast, sheet closes", async () => {
    // Hold the dry-run answer to observe the checking state.
    let release: (() => void) | null = null;
    answer = () =>
      new Promise<Response>((r) => {
        release = () => r(dryRunAnswer());
      });
    render(<ArmStatusCard arm={grip} kind="hardware" />);
    setMonitorArms([makeArmMonitor()]);
    fireEvent.click(screen.getByTestId("arm-home-rail-grip"));
    const host = (await screen.findByTestId("home-rail-sheet")) as HTMLDialogElement;
    expect(host.open).toBe(true);
    const panel = screen.getByTestId("home-rail-panel");
    expect(within(panel).getByRole("heading").textContent).toBe("Home rail");
    expect(panel.textContent).toContain("Manipulation Arm (grip) · APOLLO MAVIS V2 Digital Twin");
    // The notice is there from the first frame, before the verdict.
    expect(screen.getByTestId("home-rail-notice").textContent).toBe(
      "The carriage drives to the operator's LEFT (+X) end at the track's homing speed (positioning cap 75 mm/s) — the only maintenance action that moves hardware.",
    );
    expect(screen.getByTestId("home-rail-checking")).toBeInTheDocument();
    expect(screen.queryByTestId("home-rail-confirm")).toBeNull();
    // Exactly one POST so far: the dry run, no deadline.
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      url: "/api/hardware/arms/grip/maintenance",
      body: { op: "home_rail", dry_run: true },
    });
    expect(posts[0]!.signal ?? null).toBeNull();
    act(() => release?.());
    // Verdict: clear pill + the facts in reading order.
    const verdict = await screen.findByTestId("home-rail-verdict");
    expect(verdict.textContent).toBe("Sweep clear — safe to home");
    expect(verdict.className).toBe("pill pill-ok home-rail-verdict");
    expect(verdict.dataset["clear"]).toBe("true");
    expect(screen.queryByTestId("home-rail-checking")).toBeNull();
    expect(screen.getByTestId("home-rail-recipe").textContent).toBe(
      "Full travel 0–0.650 m at the current posture · inflation 25 mm · step 5 mm",
    );
    expect(screen.queryByTestId("home-rail-blocked")).toBeNull();
    expect(screen.getByTestId("home-rail-clearance").textContent).toBe(
      "min clearance 32 mm at 0.315 m (grip/link2 ↔ table)",
    );
    expect(screen.getByTestId("home-rail-other").textContent).toBe(
      "Perception Arm posed at its last sample (rail 0.000 m)",
    );
    expect(screen.getByTestId("home-rail-assumption").textContent).toBe(
      "view rail unknown - used fallback 0.00 m",
    );
    expect(screen.queryByTestId("home-rail-hint")).toBeNull();
    expect(screen.queryByTestId("home-rail-error")).toBeNull();
    // Cancel holds the initial focus (destructive confirm is never the default).
    expect(document.activeElement).toBe(screen.getByTestId("home-rail-cancel"));
    const confirm = screen.getByTestId("home-rail-confirm");
    expect(confirm.className).toBe("btn-destructive");
    expect(confirm.textContent).toBe("Home rail — move carriage");
    // Hold the real POST to observe the in-flight state.
    release = null;
    answer = () =>
      new Promise<Response>((r) => {
        release = () => r(homedAnswer());
      });
    fireEvent.click(confirm);
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1]).toMatchObject({ body: { op: "home_rail", dry_run: false } });
    expect(posts[1]!.signal).toBeInstanceOf(AbortSignal); // the 60 s client deadline
    expect(screen.getByTestId("home-rail-homing").textContent).toContain(
      "Homing… the carriage is moving to the operator's LEFT end.",
    );
    expect(confirm).toBeDisabled();
    expect(confirm.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByTestId("home-rail-cancel")).toBeDisabled();
    expect(screen.queryByTestId("home-rail-close")).toBeNull(); // no close path while moving
    fireEvent.keyDown(host, { key: "Escape" });
    expect(host.open).toBe(true);
    // The card marks Home rail busy (not the shared "maintenance running…" line).
    const cardButton = screen.getByTestId("arm-home-rail-grip");
    expect(cardButton.getAttribute("aria-busy")).toBe("true");
    expect(cardButton).toBeDisabled();
    expect(screen.getByTestId("arm-clear-errors-grip")).toBeDisabled();
    setMonitorArms([makeArmMonitor({ maintenance_busy: true })]);
    expect(screen.queryByTestId("arm-actions-busy-grip")).toBeNull();
    act(() => release?.());
    await waitFor(() => expect(useStore.getState().toasts).toHaveLength(1));
    expect(useStore.getState().toasts[0]).toMatchObject({
      text: "Manipulation Arm · rail homed (rail 0.000 m)",
      tone: "success",
    });
    await waitFor(() => expect(host.open).toBe(false));
    await waitFor(() => expect(screen.queryByTestId("home-rail-sheet")).toBeNull());
    expect(cardButton.getAttribute("aria-busy")).toBeNull();
  });

  it("blocked by the OTHER arm: the Studio steps name the Perception Arm as the one to fold", async () => {
    answer = () =>
      dryRunAnswer(
        makeRailSweepVerdict({
          clear: false,
          first_blocked_m: 0.005,
          first_blocked_pair: ["grip_link4", "view_link3"],
          min_clearance_m: -0.083,
          min_clearance_at_m: 0.225,
          min_clearance_pair: ["grip_link6", "view_link5"],
          assumptions: ["view rail unknown - used fallback 0.00 m"],
        }),
      );
    render(<ArmStatusCard arm={grip} kind="hardware" />);
    setMonitorArms([makeArmMonitor()]);
    fireEvent.click(screen.getByTestId("arm-home-rail-grip"));
    await screen.findByTestId("home-rail-verdict");
    const steps = screen.getByTestId("home-rail-studio-steps");
    expect(steps.dataset["foldArm"]).toBe("view");
    expect(screen.getByTestId("home-rail-studio-target").textContent).toBe(
      "The Perception Arm is in the way: fold the Perception Arm first (or both arms).",
    );
    expect(steps.textContent).toContain("Close Live control in Studio");
    expect(screen.queryByTestId("home-rail-confirm")).toBeNull();
  });

  it("blocked verdict: danger pill, first blocked position + pair, hint, NO confirm button; Cancel closes", async () => {
    answer = () =>
      dryRunAnswer(
        makeRailSweepVerdict({
          clear: false,
          first_blocked_m: 0.12,
          first_blocked_pair: ["grip/link6", "table"],
          min_clearance_m: -0.004,
          min_clearance_at_m: 0.2,
          min_clearance_pair: ["grip/link6", "table"],
          assumptions: [],
        }),
      );
    render(<ArmStatusCard arm={grip} kind="hardware" />);
    setMonitorArms([makeArmMonitor()]);
    fireEvent.click(screen.getByTestId("arm-home-rail-grip"));
    const verdict = await screen.findByTestId("home-rail-verdict");
    expect(verdict.textContent).toBe("Sweep blocked — homing refused");
    expect(verdict.className).toBe("pill pill-danger home-rail-verdict");
    expect(screen.getByTestId("home-rail-blocked").textContent).toBe(
      "first blocked at 0.120 m: grip/link6 ↔ table",
    );
    expect(screen.getByTestId("home-rail-clearance").textContent).toBe(
      "min clearance -4 mm at 0.200 m (grip/link6 ↔ table)",
    );
    expect(screen.queryByTestId("home-rail-assumption")).toBeNull();
    expect(screen.getByTestId("home-rail-hint").textContent).toBe(
      "Fold the arm to a tighter posture in xArm Studio, then open Home rail again.",
    );
    // Dead end ⇒ the UFACTORY Studio steps, naming the arm to fold (this one: the pair is arm↔table).
    const steps = screen.getByTestId("home-rail-studio-steps");
    expect(steps.dataset["foldArm"]).toBe("grip");
    expect(steps.textContent).toContain("UFACTORY Studio");
    expect(screen.getByTestId("home-rail-studio-target").textContent).toBe(
      "Fold the Manipulation Arm.",
    );
    expect(steps.querySelectorAll("li")).toHaveLength(4);
    // The runtime detail is shown too; no confirm anywhere.
    expect(screen.getByTestId("home-rail-error").textContent).toContain(
      "rail sweep blocked at 0.120 m",
    );
    expect(screen.queryByTestId("home-rail-confirm")).toBeNull();
    fireEvent.click(screen.getByTestId("home-rail-cancel"));
    await waitFor(() => expect(screen.queryByTestId("home-rail-sheet")).toBeNull());
    expect(posts).toHaveLength(1); // the dry run only — nothing moved
    expect(useStore.getState().toasts).toHaveLength(0); // dry runs are never toasted
  });

  it("refused dry run (409 / ok:false without a verdict) → error inside the sheet, no confirm; a failed real op keeps the sheet open with the detail", async () => {
    answer = () => json({ detail: "monitor not connected" }, 409);
    render(<ArmStatusCard arm={grip} kind="hardware" />);
    setMonitorArms([makeArmMonitor()]);
    fireEvent.click(screen.getByTestId("arm-home-rail-grip"));
    const err = await screen.findByTestId("home-rail-error");
    expect(err.textContent).toContain("monitor not connected");
    expect(err.getAttribute("role")).toBe("alert");
    expect(screen.queryByTestId("home-rail-verdict")).toBeNull();
    expect(screen.queryByTestId("home-rail-confirm")).toBeNull();
    expect(screen.getByTestId("home-rail-cancel").textContent).toBe("Close");
    fireEvent.click(screen.getByTestId("home-rail-cancel"));
    await waitFor(() => expect(screen.queryByTestId("home-rail-sheet")).toBeNull());
    // ok:false without rail_sweep = refused before the sweep.
    answer = () =>
      json(
        makeMaintenanceResult({
          arm_id: "grip",
          op: "home_rail",
          ok: false,
          detail: "maintenance busy",
          before: null,
          after: null,
        }),
      );
    fireEvent.click(screen.getByTestId("arm-home-rail-grip"));
    expect((await screen.findByTestId("home-rail-error")).textContent).toContain(
      "maintenance busy",
    );
    fireEvent.click(screen.getByTestId("home-rail-cancel"));
    await waitFor(() => expect(screen.queryByTestId("home-rail-sheet")).toBeNull());
    // Clear verdict, then the real op fails (registers never showed on_zero): error toast
    // + the detail in the sheet, which stays open until closed.
    answer = (_armId, body) =>
      body.dry_run
        ? dryRunAnswer()
        : json(
            makeMaintenanceResult({
              arm_id: "grip",
              op: "home_rail",
              ok: false,
              detail: "track did not report on_zero within 30 s",
              before: makeArmMonitor(),
              after: makeArmMonitor(),
              rail_sweep: makeRailSweepVerdict(),
            }),
          );
    fireEvent.click(screen.getByTestId("arm-home-rail-grip"));
    fireEvent.click(await screen.findByTestId("home-rail-confirm"));
    await waitFor(() => expect(useStore.getState().toasts).toHaveLength(1));
    expect(useStore.getState().toasts[0]).toMatchObject({
      text: "Manipulation Arm · track did not report on_zero within 30 s",
      tone: "error",
    });
    expect(screen.getByTestId("home-rail-sheet")).toBeInTheDocument();
    expect(screen.getByTestId("home-rail-error").textContent).toContain(
      "track did not report on_zero within 30 s",
    );
    expect(screen.queryByTestId("home-rail-confirm")).toBeNull();
    expect(screen.getByTestId("home-rail-cancel")).toBeEnabled();
  });

  it("session-eligibility line (phase-09d, no Include switch): monitor off / controller error explain the block; the rail case has its pill; hidden during a session and on sim cards", () => {
    const { rerender } = render(<ArmStatusCard arm={grip} kind="hardware" />);
    expect(screen.queryByTestId("arm-include-grip")).toBeNull();
    expect(screen.queryByText("Include in session")).toBeNull();
    // No monitor row yet: the twin cannot be posed.
    const line = () => screen.getByTestId("arm-session-reason-grip");
    expect(line().textContent).toBe(
      "Not ready for a session — Monitor not connected — no sample to pose the twin",
    );
    expect(line().dataset["gate"]).toBe("monitor_off");
    expect(line().querySelector("svg")).not.toBeNull(); // glyph + words
    // Unhomed rail: the amber pill + Home rail button say it; no second line.
    setMonitorArms([makeArmMonitor()]);
    expect(screen.queryByTestId("arm-session-reason-grip")).toBeNull();
    expect(screen.getByTestId("arm-home-rail-grip")).toBeInTheDocument();
    setMonitorArms([homed({ error_code: 24 })]);
    expect(line().textContent).toBe(
      "Not ready for a session — Controller error C24 — clear errors first",
    );
    expect(line().dataset["gate"]).toBe("error");
    setMonitorArms([homed({ status: "error" })]);
    expect(line().dataset["gate"]).toBe("monitor_off");
    // Eligible → no line.
    setMonitorArms([homed()]);
    expect(screen.queryByTestId("arm-session-reason-grip")).toBeNull();
    // A hardware session owns the boxes → the strip's "Use the Cockpit" is enough.
    setMonitorArms([homed({ error_code: 24 })], true);
    expect(screen.queryByTestId("arm-session-reason-grip")).toBeNull();
    expect(screen.getByTestId("arm-actions-reason-grip").textContent).toBe("Use the Cockpit");
    // Sim cards never show it.
    rerender(<ArmStatusCard arm={grip} kind="sim" />);
    expect(screen.queryByTestId("arm-session-reason-grip")).toBeNull();
  });
});

// -- phase-09d: pre-positioning plan → asynchronous RailHomingJob ---------------------------
describe("HomeRailSheet pre-positioning job (phase-09d)", () => {
  interface Post {
    url: string;
    body: { op: string; dry_run?: boolean };
  }
  let posts: Post[];
  let lastGets: number;
  /** Answers for `POST …/maintenance` by body. */
  let answer: (body: Post["body"]) => Response;
  /** Consecutive answers for `GET …/maintenance/last` (the last one repeats). */
  let lastAnswers: (() => Response)[];
  const grip = makeArmStatus({ arm_id: "grip", ip: "192.168.1.201", reachable: "open" });
  const setMonitorArms = (arms: ArmMonitorTelemetry[], paused = false) =>
    setMonitor(makeHardwareMonitor({ paused, arms }));
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
  const homed = (over: Partial<ArmMonitorTelemetry> = {}) =>
    makeArmMonitor({ rail_homed: true, rail_enabled: true, rail_pos_m: 0, ...over });
  /** Dry run whose posture blocks the sweep but has a plan (`ok` false WITH the verdict). */
  const plannedDryRun = (verdict = makePlannedSweepVerdict(), detail = "") =>
    json(
      makeMaintenanceResult({
        arm_id: "grip",
        op: "home_rail",
        ok: false,
        detail,
        sdk_codes: {},
        before: makeArmMonitor(),
        after: null,
        rail_sweep: verdict,
      }),
    );
  /** The 202: job accepted, nothing written yet. */
  const accepted = (jobId = "job-7") =>
    makeMaintenanceResult({
      arm_id: "grip",
      op: "home_rail",
      ok: true,
      status: "accepted",
      job_id: jobId,
      detail: "rail homing job started",
      sdk_codes: {},
      before: makeArmMonitor(),
      after: null,
      rail_sweep: makePlannedSweepVerdict(),
    });
  /** The job's final result as `/maintenance/last` stores it. */
  const finalDone = (jobId = "job-7") =>
    makeMaintenanceResult({
      arm_id: "grip",
      op: "home_rail",
      ok: true,
      status: "done",
      job_id: jobId,
      detail: "rail homed after pre-positioning",
      sdk_codes: {
        set_linear_track_back_origin: 0,
        set_linear_track_enable: 0,
        set_linear_track_speed: 0,
      },
      before: makeArmMonitor(),
      after: homed(),
      rail_sweep: makePlannedSweepVerdict(),
    });
  const phaseRow = (p: string) => screen.getByTestId(`home-rail-phase-${p}`);

  beforeEach(() => {
    posts = [];
    lastGets = 0;
    answer = (body) => (body.dry_run ? plannedDryRun() : json(accepted(), 202));
    lastAnswers = [() => json(finalDone())];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "POST") {
          const body = JSON.parse(String(init.body)) as Post["body"];
          posts.push({ url, body });
          return answer(body);
        }
        if (url.endsWith("/maintenance/last")) {
          const i = Math.min(lastGets, lastAnswers.length - 1);
          lastGets += 1;
          return lastAnswers[i]!();
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

  it("planned plan: amber verdict + the contract explanation, target posture in degrees, 'move arm, then carriage' confirm → 202 → progress view from telemetry → done → GET last (polled past `accepted`) → toast, closes", async () => {
    render(<ArmStatusCard arm={grip} kind="hardware" />);
    setMonitorArms([makeArmMonitor()]);
    fireEvent.click(screen.getByTestId("arm-home-rail-grip"));
    const verdict = await screen.findByTestId("home-rail-verdict");
    expect(verdict.textContent).toBe("Current posture blocks the sweep — pre-positioning planned");
    expect(verdict.className).toBe("pill pill-warn home-rail-verdict");
    expect(verdict.dataset["clear"]).toBe("false");
    const panel = screen.getByTestId("home-rail-panel");
    expect(panel.dataset["plan"]).toBe("planned");
    expect(panel.dataset["phase"]).toBe("verdict");
    // The sweep facts stay (where the current posture collides) …
    expect(screen.getByTestId("home-rail-blocked").textContent).toBe(
      "first blocked at 0.120 m: grip/link6 ↔ table",
    );
    // … plus the plan: contract sentence, target posture, validation line.
    expect(screen.getByTestId("home-rail-plan-text").textContent).toBe(
      "The arm will first move along a planned path (12 waypoints, ~19 s at 10 %) to a folded posture that clears the whole rail travel, then the rail homes, then the arm holds that posture.",
    );
    expect(screen.getByTestId("home-rail-plan-target").textContent).toBe(
      "Target posture · joints 1–7: 180.0°, 0.0°, 0.0°, 0.0°, 0.0°, 0.0°, 0.0°",
    );
    expect(screen.getByTestId("home-rail-plan-check").textContent).toBe(
      "path checked at 131 rail positions · posture from the scene keyframe",
    );
    // No Studio hint / steps (the runtime plans the fold), no error, the destructive confirm.
    expect(screen.queryByTestId("home-rail-hint")).toBeNull();
    expect(screen.queryByTestId("home-rail-studio-steps")).toBeNull();
    expect(screen.queryByTestId("home-rail-error")).toBeNull();
    const confirm = screen.getByTestId("home-rail-confirm");
    expect(confirm.className).toBe("btn-destructive");
    expect(confirm.textContent).toBe("Home rail — move arm, then carriage");
    expect(screen.getByTestId("home-rail-cancel").textContent).toBe("Cancel");
    expect(document.activeElement).toBe(screen.getByTestId("home-rail-cancel"));

    fireEvent.click(confirm);
    const job = await screen.findByTestId("home-rail-job");
    expect(posts).toHaveLength(2);
    expect(posts[1]).toMatchObject({
      url: "/api/hardware/arms/grip/maintenance",
      body: { op: "home_rail", dry_run: false },
    });
    expect(panel.dataset["phase"]).toBe("job");
    expect(job.dataset["jobId"]).toBe("job-7");
    expect(job.textContent).toContain(
      "Rail homing job running — the arm moves first, then the carriage. Keep clear of the cell.",
    );
    expect(useStore.getState().toasts).toHaveLength(0); // the 202 is not a result
    // Un-closable while the job runs; the card marks Home rail busy.
    expect(screen.queryByTestId("home-rail-confirm")).toBeNull();
    expect(screen.getByTestId("home-rail-cancel")).toBeDisabled();
    expect(screen.queryByTestId("home-rail-close")).toBeNull();
    const host = screen.getByTestId("home-rail-sheet") as HTMLDialogElement;
    fireEvent.keyDown(host, { key: "Escape" });
    expect(host.open).toBe(true);
    const cardButton = screen.getByTestId("arm-home-rail-grip");
    expect(cardButton.getAttribute("aria-busy")).toBe("true");
    expect(cardButton).toBeDisabled();
    // Before the first telemetry frame: queued active, the rest pending.
    for (const p of [
      "queued",
      "sweeping",
      "planning",
      "connecting",
      "positioning",
      "homing",
      "verifying",
    ])
      expect(phaseRow(p).dataset["state"]).toBe(p === "queued" ? "active" : "pending");
    expect(job.dataset["jobPhase"]).toBe("queued");
    expect(screen.getByTestId("home-rail-progress").getAttribute("aria-valuenow")).toBe("0");
    // Telemetry: positioning, waypoint 4/12, 55 %.
    setMonitorArms([
      makeArmMonitor({
        status: "paused",
        maintenance_busy: true,
        maintenance: makeMaintenanceProgress({
          job_id: "job-7",
          phase: "positioning",
          detail: "waypoint 4/12",
          progress: 0.55,
        }),
      }),
    ]);
    expect(job.dataset["jobPhase"]).toBe("positioning");
    expect(phaseRow("queued").dataset["state"]).toBe("done");
    expect(phaseRow("connecting").dataset["state"]).toBe("done");
    expect(phaseRow("positioning").dataset["state"]).toBe("active");
    expect(phaseRow("positioning").querySelector(".spinner")).not.toBeNull();
    expect(phaseRow("homing").dataset["state"]).toBe("pending");
    expect(screen.getByTestId("home-rail-job-detail").textContent).toBe("waypoint 4/12");
    expect(screen.getByTestId("home-rail-progress").getAttribute("aria-valuenow")).toBe("55");
    expect(screen.getByTestId("home-rail-progress").getAttribute("role")).toBe("progressbar");
    expect(phaseRow("positioning").textContent).toContain(
      "moving the arm to the folded posture at 10 %",
    );
    expect(lastGets).toBe(0); // nothing fetched while running
    // The terminal `done` frame → the sheet fetches /maintenance/last, which still
    // answers the stale `accepted` once (the job thread stores its result a beat
    // later) and is polled until the final result appears.
    lastAnswers = [() => json(accepted()), () => json(finalDone())];
    setMonitorArms([
      homed({
        maintenance_busy: false,
        maintenance: makeMaintenanceProgress({
          job_id: "job-7",
          phase: "done",
          detail: "rail homed; posture held",
          progress: 1,
        }),
      }),
    ]);
    await waitFor(() => expect(useStore.getState().toasts).toHaveLength(1), { timeout: 4000 });
    expect(useStore.getState().toasts[0]).toMatchObject({
      text: "Manipulation Arm · rail homed (rail 0.000 m)",
      tone: "success",
    });
    expect(lastGets).toBeGreaterThanOrEqual(2); // polled past the stale `accepted`
    await waitFor(() => expect(screen.queryByTestId("home-rail-sheet")).toBeNull());
    // The rail is homed → the Home rail button is gone; the card's pending op was
    // released (another client's op now shows the shared indicator again).
    expect(screen.queryByTestId("arm-home-rail-grip")).toBeNull();
    expect(screen.getByTestId("arm-rail-grip").textContent).toBe("rail 0.000 m");
    setMonitorArms([homed({ maintenance_busy: true })]);
    expect(screen.getByTestId("arm-actions-busy-grip")).toBeInTheDocument();
    expect(posts).toHaveLength(2); // the dry run + the one real POST
  }, 10000);

  it("refused plan (needed, not clear): red verdict, the runtime's suggestion, NO confirm; Close", async () => {
    answer = () =>
      plannedDryRun(
        makePlannedSweepVerdict({
          pre_position: makePrePositionPlan({
            clear: false,
            source: "home",
            detail: "no candidate posture clears the sweep",
          }),
        }),
        "fold the arm toward the factory zero posture in Studio and retry",
      );
    render(<ArmStatusCard arm={grip} kind="hardware" />);
    setMonitorArms([makeArmMonitor()]);
    fireEvent.click(screen.getByTestId("arm-home-rail-grip"));
    const verdict = await screen.findByTestId("home-rail-verdict");
    expect(verdict.textContent).toBe("Sweep blocked — no safe pre-positioning path");
    expect(verdict.className).toBe("pill pill-danger home-rail-verdict");
    expect(screen.getByTestId("home-rail-panel").dataset["plan"]).toBe("refused");
    expect(screen.getByTestId("home-rail-error").textContent).toContain(
      "fold the arm toward the factory zero posture in Studio and retry",
    );
    expect(screen.queryByTestId("home-rail-plan")).toBeNull();
    expect(screen.queryByTestId("home-rail-hint")).toBeNull(); // the runtime's suggestion replaces it
    expect(screen.queryByTestId("home-rail-confirm")).toBeNull();
    expect(screen.getByTestId("home-rail-cancel").textContent).toBe("Close");
    fireEvent.click(screen.getByTestId("home-rail-cancel"));
    await waitFor(() => expect(screen.queryByTestId("home-rail-sheet")).toBeNull());
    expect(posts).toHaveLength(1);
    expect(useStore.getState().toasts).toHaveLength(0);
    // Without a top-level detail the plan's own detail is shown; without either, the generic hint.
    answer = () =>
      plannedDryRun(
        makePlannedSweepVerdict({
          pre_position: makePrePositionPlan({ clear: false, detail: "planner: no path" }),
        }),
      );
    fireEvent.click(screen.getByTestId("arm-home-rail-grip"));
    expect((await screen.findByTestId("home-rail-error")).textContent).toContain(
      "planner: no path",
    );
    fireEvent.click(screen.getByTestId("home-rail-cancel"));
    await waitFor(() => expect(screen.queryByTestId("home-rail-sheet")).toBeNull());
    answer = () =>
      plannedDryRun(
        makePlannedSweepVerdict({ pre_position: makePrePositionPlan({ clear: false }) }),
      );
    fireEvent.click(screen.getByTestId("arm-home-rail-grip"));
    expect((await screen.findByTestId("home-rail-error")).textContent).toContain(
      "fold the arm toward the factory-zero posture in xArm Studio",
    );
  });

  it("failed job: telemetry `failed` marks the phase it was in, GET last (ok:false) → error toast, sheet stays open with the detail", async () => {
    lastAnswers = [
      () =>
        json(
          makeMaintenanceResult({
            arm_id: "grip",
            op: "home_rail",
            ok: false,
            status: "done",
            job_id: "job-7",
            detail: "positioning aborted: gate blocked at waypoint 5 (grip/link4 ↔ obstacle)",
            sdk_codes: {},
            before: makeArmMonitor(),
            after: makeArmMonitor(),
            rail_sweep: makePlannedSweepVerdict(),
          }),
        ),
    ];
    render(<ArmStatusCard arm={grip} kind="hardware" />);
    setMonitorArms([makeArmMonitor()]);
    fireEvent.click(screen.getByTestId("arm-home-rail-grip"));
    fireEvent.click(await screen.findByTestId("home-rail-confirm"));
    await screen.findByTestId("home-rail-job");
    setMonitorArms([
      makeArmMonitor({
        status: "paused",
        maintenance_busy: true,
        maintenance: makeMaintenanceProgress({
          job_id: "job-7",
          phase: "positioning",
          progress: 0.5,
        }),
      }),
    ]);
    expect(phaseRow("positioning").dataset["state"]).toBe("active");
    setMonitorArms([
      makeArmMonitor({
        maintenance_busy: false,
        maintenance: makeMaintenanceProgress({
          job_id: "job-7",
          phase: "failed",
          detail: "positioning aborted: gate blocked",
          progress: 0.5,
        }),
      }),
    ]);
    // The failed row is the phase the job was in; earlier rows done, later pending.
    expect(phaseRow("connecting").dataset["state"]).toBe("done");
    expect(phaseRow("positioning").dataset["state"]).toBe("failed");
    expect(phaseRow("homing").dataset["state"]).toBe("pending");
    expect(screen.getByTestId("home-rail-job-detail").textContent).toBe(
      "positioning aborted: gate blocked",
    );
    await waitFor(() => expect(useStore.getState().toasts).toHaveLength(1));
    expect(useStore.getState().toasts[0]).toMatchObject({
      text: "Manipulation Arm · positioning aborted: gate blocked at waypoint 5 (grip/link4 ↔ obstacle)",
      tone: "error",
    });
    // The sheet stays open with the detail and a Close button; the card is no longer busy.
    expect(screen.getByTestId("home-rail-sheet")).toBeInTheDocument();
    expect(screen.getByTestId("home-rail-panel").dataset["phase"]).toBe("failed");
    expect(screen.getByTestId("home-rail-error").textContent).toContain(
      "positioning aborted: gate blocked at waypoint 5",
    );
    expect(screen.queryByTestId("home-rail-confirm")).toBeNull();
    expect(screen.getByTestId("home-rail-cancel")).toBeEnabled();
    expect(screen.getByTestId("home-rail-cancel").textContent).toBe("Close");
    expect(screen.getByTestId("arm-home-rail-grip").getAttribute("aria-busy")).toBeNull();
    fireEvent.click(screen.getByTestId("home-rail-cancel"));
    await waitFor(() => expect(screen.queryByTestId("home-rail-sheet")).toBeNull());
  });

  it("job vanished from telemetry after being seen → GET last decides (done → toast + close); a 404 there → error with the last detail", async () => {
    render(<ArmStatusCard arm={grip} kind="hardware" />);
    setMonitorArms([makeArmMonitor()]);
    fireEvent.click(screen.getByTestId("arm-home-rail-grip"));
    fireEvent.click(await screen.findByTestId("home-rail-confirm"));
    await screen.findByTestId("home-rail-job");
    setMonitorArms([
      makeArmMonitor({
        maintenance_busy: true,
        maintenance: makeMaintenanceProgress({ job_id: "job-7", phase: "homing", progress: 0.8 }),
      }),
    ]);
    expect(lastGets).toBe(0);
    // The runtime dropped the block without a terminal frame (short terminal visibility).
    setMonitorArms([homed({ maintenance: null })]);
    await waitFor(() => expect(useStore.getState().toasts).toHaveLength(1));
    expect(useStore.getState().toasts[0]).toMatchObject({
      text: "Manipulation Arm · rail homed (rail 0.000 m)",
      tone: "success",
    });
    await waitFor(() => expect(screen.queryByTestId("home-rail-sheet")).toBeNull());
    // Same, but /maintenance/last has nothing → the last detail seen, error tone.
    // (The rail reads homed now, so the button is gone; an unhomed row brings it back.)
    useStore.setState({ toasts: [] });
    lastAnswers = [() => json({ detail: "no result" }, 404)];
    answer = (body) => (body.dry_run ? plannedDryRun() : json(accepted("job-8"), 202));
    setMonitorArms([makeArmMonitor()]);
    fireEvent.click(screen.getByTestId("arm-home-rail-grip"));
    fireEvent.click(await screen.findByTestId("home-rail-confirm"));
    await screen.findByTestId("home-rail-job");
    setMonitorArms([
      makeArmMonitor({
        maintenance_busy: true,
        maintenance: makeMaintenanceProgress({
          job_id: "job-8",
          phase: "connecting",
          detail: "pausing the monitor",
        }),
      }),
    ]);
    setMonitorArms([makeArmMonitor({ maintenance: null })]);
    await waitFor(() => expect(useStore.getState().toasts).toHaveLength(1));
    expect(useStore.getState().toasts[0]).toMatchObject({
      text: "Manipulation Arm · pausing the monitor",
      tone: "error",
    });
    expect(screen.getByTestId("home-rail-error").textContent).toContain("pausing the monitor");
    expect(screen.getByTestId("home-rail-cancel")).toBeEnabled();
  });

  it("telemetry never shows the job → after the grace the sheet polls GET last itself; only OUR job_id settles it (foreign / accepted results are ignored)", async () => {
    const saved = { ...JOB_FALLBACK };
    JOB_FALLBACK.graceMs = 30;
    JOB_FALLBACK.pollMs = 20;
    try {
      answer = (body) => (body.dry_run ? plannedDryRun() : json(accepted("job-9"), 202));
      // an older op's result (foreign job_id) and a stale `accepted` must not end the job
      lastAnswers = [() => json(finalDone("job-1")), () => json(accepted("job-9"))];
      render(<ArmStatusCard arm={grip} kind="hardware" />);
      setMonitorArms([makeArmMonitor()]);
      fireEvent.click(screen.getByTestId("arm-home-rail-grip"));
      fireEvent.click(await screen.findByTestId("home-rail-confirm"));
      const job = await screen.findByTestId("home-rail-job");
      expect(job.dataset["jobId"]).toBe("job-9");
      await waitFor(() => expect(lastGets).toBeGreaterThanOrEqual(2));
      expect(screen.getByTestId("home-rail-job")).toBeInTheDocument(); // still running
      expect(screen.queryByTestId("home-rail-job-finishing")).toBeNull();
      expect(useStore.getState().toasts).toHaveLength(0);
      expect(screen.getByTestId("home-rail-cancel")).toBeDisabled(); // un-closable while running …
      // … until /last carries OUR final result (no telemetry frame ever arrived)
      lastAnswers = [() => json(finalDone("job-9"))];
      await waitFor(() => expect(useStore.getState().toasts).toHaveLength(1));
      expect(useStore.getState().toasts[0]).toMatchObject({
        text: "Manipulation Arm · rail homed (rail 0.000 m)",
        tone: "success",
      });
      await waitFor(() => expect(screen.queryByTestId("home-rail-sheet")).toBeNull());
      // the card's Home rail button is released too (onHomingChange false)
      expect(screen.getByTestId("arm-home-rail-grip").getAttribute("aria-busy")).toBeNull();
    } finally {
      Object.assign(JOB_FALLBACK, saved);
    }
  });

  it("a final result with a foreign job_id after a terminal frame is the lost case, never toasted as ours", async () => {
    render(<ArmStatusCard arm={grip} kind="hardware" />);
    setMonitorArms([makeArmMonitor()]);
    fireEvent.click(screen.getByTestId("arm-home-rail-grip"));
    fireEvent.click(await screen.findByTestId("home-rail-confirm"));
    await screen.findByTestId("home-rail-job");
    lastAnswers = [() => json(finalDone("job-1"))]; // an older op's result, ok: true
    setMonitorArms([
      makeArmMonitor({
        maintenance_busy: true,
        maintenance: makeMaintenanceProgress({
          job_id: "job-7",
          phase: "homing",
          detail: "carriage driving",
        }),
      }),
    ]);
    setMonitorArms([
      makeArmMonitor({
        maintenance: makeMaintenanceProgress({ job_id: "job-7", phase: "done", progress: 1 }),
      }),
    ]);
    await waitFor(() => expect(useStore.getState().toasts).toHaveLength(1));
    // the foreign result is never toasted as ours: the lost case (the terminal frame
    // carried no detail, so the generic text), error tone, sheet open and closable
    expect(useStore.getState().toasts[0]).toMatchObject({ tone: "error" });
    expect(useStore.getState().toasts[0]!.text).not.toContain("rail homed");
    expect(useStore.getState().toasts[0]!.text).toContain("stopped reporting the homing job");
    expect(screen.getByTestId("home-rail-error").textContent).toContain(
      "stopped reporting the homing job",
    );
    expect(screen.getByTestId("home-rail-cancel")).toBeEnabled();
  });

  it("09c path unchanged: `needed: false` (or no plan block) → 'move carriage' confirm, synchronous 200 status done → toast, closes; a `refused` real op → error", async () => {
    const dryRun = (verdict: ReturnType<typeof makeRailSweepVerdict>) =>
      json(
        makeMaintenanceResult({
          arm_id: "grip",
          op: "home_rail",
          ok: true,
          sdk_codes: {},
          before: makeArmMonitor(),
          after: null,
          rail_sweep: verdict,
        }),
      );
    answer = (body) =>
      body.dry_run
        ? dryRun(makeRailSweepVerdict()) // pre_position: {needed: false}
        : json(
            makeMaintenanceResult({
              arm_id: "grip",
              op: "home_rail",
              status: "done",
              detail: "rail homed",
              before: makeArmMonitor(),
              after: homed(),
              rail_sweep: makeRailSweepVerdict(),
            }),
          );
    render(<ArmStatusCard arm={grip} kind="hardware" />);
    setMonitorArms([makeArmMonitor()]);
    fireEvent.click(screen.getByTestId("arm-home-rail-grip"));
    const confirm = await screen.findByTestId("home-rail-confirm");
    expect(screen.getByTestId("home-rail-panel").dataset["plan"]).toBe("none");
    expect(screen.queryByTestId("home-rail-plan")).toBeNull();
    expect(confirm.textContent).toBe("Home rail — move carriage");
    fireEvent.click(confirm);
    await waitFor(() => expect(useStore.getState().toasts).toHaveLength(1));
    expect(useStore.getState().toasts[0]).toMatchObject({
      text: "Manipulation Arm · rail homed (rail 0.000 m)",
      tone: "success",
    });
    await waitFor(() => expect(screen.queryByTestId("home-rail-sheet")).toBeNull());
    expect(lastGets).toBe(0); // synchronous: nothing to fetch
    // A pre-09d verdict (no plan block at all) behaves the same.
    useStore.setState({ toasts: [] });
    answer = (body) =>
      body.dry_run
        ? dryRun(makeRailSweepVerdict({ pre_position: undefined }))
        : json(
            makeMaintenanceResult({
              arm_id: "grip",
              op: "home_rail",
              ok: false,
              status: "refused",
              detail: "posture moved since the sweep",
              sdk_codes: {},
              before: makeArmMonitor(),
              after: makeArmMonitor(),
              rail_sweep: makeRailSweepVerdict({ pre_position: undefined }),
            }),
          );
    fireEvent.click(screen.getByTestId("arm-home-rail-grip"));
    const confirm2 = await screen.findByTestId("home-rail-confirm");
    expect(confirm2.textContent).toBe("Home rail — move carriage");
    fireEvent.click(confirm2);
    await waitFor(() => expect(useStore.getState().toasts).toHaveLength(1));
    expect(useStore.getState().toasts[0]).toMatchObject({
      text: "Manipulation Arm · posture moved since the sweep",
      tone: "error",
    });
    expect(screen.getByTestId("home-rail-error").textContent).toContain(
      "posture moved since the sweep",
    );
    expect(screen.queryByTestId("home-rail-job")).toBeNull();
  });
});

// -- phase-09d review: a RailHomingJob pauses the monitor WITHOUT a session -------------------
describe("Welcome page arm cards during a RailHomingJob (monitor paused, no session)", () => {
  const grip = makeArmStatus({ arm_id: "grip", ip: "192.168.1.201", reachable: "open" });
  const view = makeArmStatus({ arm_id: "view", ip: "192.168.2.219", reachable: "open" });
  const HOMING = "Rail homing in progress — wait for it to finish";

  afterEach(() => {
    act(() => useStore.getState().resetForEpochChange());
  });

  it("job on the Manipulation Arm: no 'Use the Cockpit' anywhere — the homing arm shows the running indicator, the other arm the homing reason", () => {
    render(
      <>
        <ArmStatusCard arm={grip} kind="hardware" />
        <ArmStatusCard arm={view} kind="hardware" />
      </>,
    );
    setMonitor(
      makeHardwareMonitor({
        paused: true, // the JOB's driver owns the box - not a session
        arms: [
          makeArmMonitor({
            arm_id: "grip",
            status: "paused",
            maintenance_busy: true,
            maintenance: makeMaintenanceProgress({ job_id: "job-7", phase: "positioning" }),
          }),
          makeArmMonitor({ arm_id: "view", status: "paused", error_code: 19 }),
        ],
      }),
    );
    expect(screen.queryByText("Use the Cockpit")).toBeNull();
    // the homing arm: the shared indicator, no reason line, every button off
    expect(screen.getByTestId("arm-actions-busy-grip")).toBeInTheDocument();
    expect(screen.queryByTestId("arm-actions-reason-grip")).toBeNull();
    expect(screen.getByTestId("arm-home-rail-grip")).toBeDisabled();
    // the other arm: Clear errors / Home rail off with the homing reason (409 meanwhile)
    expect(screen.getByTestId("arm-actions-reason-view").textContent).toBe(HOMING);
    const clear = screen.getByTestId("arm-clear-errors-view");
    expect(clear).toBeDisabled();
    expect(clear.getAttribute("title")).toBe(HOMING);
    expect(screen.getByTestId("arm-home-rail-view")).toBeDisabled();
    expect(screen.getByTestId("arm-home-rail-view").getAttribute("title")).toBe(HOMING);
    expect(screen.queryByTestId("arm-actions-busy-view")).toBeNull();
    expect(screen.queryByTestId("arm-session-reason-view")).toBeNull();
    // the job ended (terminal phase lingers, busy false) and a real hardware session
    // took the boxes: the strip reads "Use the Cockpit" again
    setMonitor(
      makeHardwareMonitor({
        paused: true,
        arms: [
          makeArmMonitor({
            arm_id: "grip",
            status: "paused",
            rail_homed: true,
            rail_enabled: true,
            rail_pos_m: 0,
            maintenance: makeMaintenanceProgress({ job_id: "job-7", phase: "done", progress: 1 }),
          }),
          makeArmMonitor({ arm_id: "view", status: "paused", error_code: 19 }),
        ],
      }),
    );
    expect(screen.getByTestId("arm-actions-reason-view").textContent).toBe("Use the Cockpit");
    expect(screen.getByTestId("arm-actions-reason-grip").textContent).toBe("Use the Cockpit");
    // a synchronous 09c homing (monitor NOT paused, one arm busy) shows the same reason
    setMonitor(
      makeHardwareMonitor({
        paused: false,
        arms: [
          makeArmMonitor({ arm_id: "grip", status: "stale", maintenance_busy: true }),
          makeArmMonitor({ arm_id: "view", error_code: 19 }),
        ],
      }),
    );
    expect(screen.getByTestId("arm-actions-reason-view").textContent).toBe(HOMING);
    expect(screen.getByTestId("arm-actions-busy-grip")).toBeInTheDocument();
  });
});

// -- StartFrom (2026-09-08): the tab's profiles only -------------------------------------
// `seed_initial` designates one initial condition PER kind, both named alike; the
// unfiltered list showed two identical rows. Rows without `workcell_kind` (older
// runtime) stay on both tabs; the empty state and the count follow the filtered rows.
describe("StartFrom: the tab's profiles only (2026-09-08)", () => {
  const sim = makeProfile({
    profile_id: "s0",
    name: "default posture (2026-09-08)",
    is_initial_condition: true,
    workcell_kind: "sim",
  });
  const hw = makeProfile({
    profile_id: "h0",
    name: "default posture (2026-09-08)",
    is_initial_condition: true,
    workcell_kind: "hardware",
  });
  const legacy = makeProfile({ profile_id: "l0", name: "legacy", workcell_kind: undefined });
  const props = {
    arms: ["grip", "view"],
    startFrom: "profile" as const,
    onStartFromChange: vi.fn(),
    profileId: null,
    onProfileChange: vi.fn(),
  };

  it("one row per tab for the two identically named initial conditions; a kind-less row on both; badge kept", () => {
    const { rerender } = render(<StartFrom {...props} profiles={[sim, hw, legacy]} kind="sim" />);
    const list = screen.getByTestId("profile-list");
    expect(list.dataset["kind"]).toBe("sim");
    expect(list.dataset["count"]).toBe("2");
    expect(screen.getByTestId("profile-row-s0")).toBeInTheDocument();
    expect(screen.queryByTestId("profile-row-h0")).toBeNull();
    expect(screen.getByTestId("profile-row-l0")).toBeInTheDocument();
    expect(screen.getByTestId("initial-badge-s0")).toBeInTheDocument();
    expect(screen.queryByTestId("profile-empty")).toBeNull();

    rerender(<StartFrom {...props} profiles={[sim, hw, legacy]} kind="hardware" />);
    expect(screen.getByTestId("profile-list").dataset["kind"]).toBe("hardware");
    expect(screen.getByTestId("profile-list").dataset["count"]).toBe("2");
    expect(screen.getByTestId("profile-row-h0")).toBeInTheDocument();
    expect(screen.queryByTestId("profile-row-s0")).toBeNull();
    expect(screen.getByTestId("profile-row-l0")).toBeInTheDocument();
    expect(screen.getByTestId("initial-badge-h0")).toBeInTheDocument();
  });

  it("the empty state follows the filtered rows and counts the hidden ones", () => {
    const { rerender } = render(<StartFrom {...props} profiles={[hw]} kind="sim" />);
    expect(screen.getByTestId("profile-list").dataset["count"]).toBe("0");
    expect(screen.getByTestId("profile-empty").textContent).toBe(
      "No Sim profiles — 1 saved profile belongs to the Hardware workcell",
    );
    rerender(
      <StartFrom
        {...props}
        profiles={[
          hw,
          makeProfile({ profile_id: "h1", name: "hw-alt", workcell_kind: "hardware" }),
        ]}
        kind="sim"
      />,
    );
    expect(screen.getByTestId("profile-empty").textContent).toBe(
      "No Sim profiles — 2 saved profiles belong to the Hardware workcell",
    );
    rerender(<StartFrom {...props} profiles={[sim]} kind="hardware" />);
    expect(screen.getByTestId("profile-empty").textContent).toBe(
      "No Hardware profiles — 1 saved profile belongs to the Sim workcell",
    );
    // nothing saved at all: the doc-pinned hint
    rerender(<StartFrom {...props} profiles={[]} kind="sim" />);
    expect(screen.getByTestId("profile-empty").textContent).toBe(
      "No saved profiles — save one from Teleop",
    );
  });

  it("promises no 'safe path' anywhere in the Start-from copy", () => {
    render(<StartFrom {...props} profiles={[sim]} kind="sim" />);
    expect(screen.getByTestId("profile-picker").textContent).not.toMatch(/safe/i);
  });
});

// -- 2026-09-11: the collision-sensitivity dropdown on the arm card (monitor path) ---------
describe("ArmStatusCard collision sensitivity (2026-09-11)", () => {
  let posts: { url: string; body: unknown }[];
  let answer: (armId: string, body: Record<string, unknown>) => Response;
  let release: (() => void) | null;
  const grip = makeArmStatus({ arm_id: "grip", ip: "192.168.1.201", reachable: "open" });
  const setMonitorArms = (arms: ArmMonitorTelemetry[], paused = false) =>
    setMonitor(makeHardwareMonitor({ paused, arms }));
  const ok = (r: Partial<ArmMaintenanceResult>) =>
    new Response(JSON.stringify(makeMaintenanceResult(r)), { status: 200 });

  beforeEach(() => {
    posts = [];
    release = null;
    answer = (armId, body) =>
      ok({
        arm_id: armId,
        op: "set_collision_sensitivity",
        detail: `collision sensitivity set to ${body["collision_sensitivity"]} (was 3; the config value 3 is re-applied at the next connect)`,
        sdk_codes: { set_collision_sensitivity: 0 },
        before: makeArmMonitor({ arm_id: armId }),
        after: makeArmMonitor({
          arm_id: armId,
          collision_sensitivity: body["collision_sensitivity"] as number,
        }),
        collision_sensitivity: body["collision_sensitivity"] as number,
      });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "POST") {
          const body = JSON.parse(String(init.body)) as Record<string, unknown>;
          posts.push({ url, body });
          const armId = /\/arms\/([^/]+)\//.exec(url)?.[1] ?? "";
          if (release !== null) {
            await new Promise<void>((r) => {
              release = r;
            });
          }
          return answer(armId, body);
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

  const select = (armId = "grip") =>
    screen.getByTestId(`arm-sensitivity-${armId}`) as HTMLSelectElement;

  it("renders the labelled 1 / 2 / 3 select with the controller's read-back as its value; placeholder + disabled when unknown or out of range", () => {
    render(<ArmStatusCard arm={grip} kind="hardware" />);
    // No telemetry yet: the select exists (the strip does), disabled, "—" placeholder.
    let sel = select();
    expect(sel.getAttribute("aria-label")).toBe("Collision sensitivity");
    expect(screen.getByLabelText("Collision sensitivity")).toBe(sel);
    expect(screen.getByTestId("arm-sensitivity-field-grip").textContent).toContain(
      "Collision sensitivity",
    );
    expect(sel).toBeDisabled();
    expect(sel.value).toBe("");
    expect(sel.dataset["readback"]).toBe("none");
    const placeholder = sel.options[0]!;
    expect(placeholder.textContent).toBe("—");
    expect(placeholder.disabled).toBe(true);
    expect(Array.from(sel.options).map((o) => o.value)).toEqual(["", "1", "2", "3"]);
    // Read-back 3 (the default): enabled, value 3, no placeholder.
    setMonitorArms([makeArmMonitor()]);
    sel = select();
    expect(sel).not.toBeDisabled();
    expect(sel.value).toBe("3");
    expect(sel.dataset["readback"]).toBe("3");
    expect(Array.from(sel.options).map((o) => o.textContent)).toEqual(["1", "2", "3"]);
    expect(screen.getByTestId("arm-sensitivity-field-grip").getAttribute("title")).toBe(
      "as written to the controller; the config value 3 returns at the next connect",
    );
    // Read-back 5 (a value Studio can set): shown raw as the disabled placeholder.
    setMonitorArms([makeArmMonitor({ collision_sensitivity: 5 })]);
    expect(sel).toBeDisabled();
    expect(sel.value).toBe("");
    expect(sel.options[0]!.textContent).toBe("5");
    expect(sel.dataset["readback"]).toBe("5");
    // null read-back (before the first slow poll): "—" again.
    setMonitorArms([makeArmMonitor({ collision_sensitivity: null })]);
    expect(sel).toBeDisabled();
    expect(sel.options[0]!.textContent).toBe("—");
    // The meta line stays a pure read-back (unchanged by the control).
    setMonitorArms([makeArmMonitor({ collision_sensitivity: 2 })]);
    expect(screen.getByTestId("arm-safety-grip").textContent).toBe(
      "sensitivity 2 · payload 0.95 kg",
    );
    expect(sel.value).toBe("2");
  });

  it("disabled matrix: session → 'Use the Cockpit' title; homing on the other arm; op running; monitor not live", () => {
    render(<ArmStatusCard arm={grip} kind="hardware" />);
    setMonitorArms([makeArmMonitor()]);
    const sel = select();
    expect(sel).not.toBeDisabled();
    // A hardware session (monitor paused, nothing running): disabled, reason as title.
    setMonitorArms([makeArmMonitor({ status: "paused" })], true);
    expect(sel).toBeDisabled();
    expect(screen.getByTestId("arm-sensitivity-field-grip").getAttribute("title")).toBe(
      "Use the Cockpit",
    );
    expect(screen.getByTestId("arm-actions-reason-grip").textContent).toBe("Use the Cockpit");
    // A RailHomingJob on the OTHER arm (paused + busy elsewhere): disabled, homing reason.
    setMonitorArms(
      [
        makeArmMonitor({ status: "stale" }),
        makeArmMonitor({ arm_id: "view", status: "stale", maintenance_busy: true }),
      ],
      true,
    );
    expect(sel).toBeDisabled();
    expect(screen.getByTestId("arm-sensitivity-field-grip").getAttribute("title")).toBe(
      "Rail homing in progress — wait for it to finish",
    );
    // An op running on THIS arm: disabled, the shared indicator says so.
    setMonitorArms([makeArmMonitor({ maintenance_busy: true })]);
    expect(sel).toBeDisabled();
    expect(sel.getAttribute("aria-busy")).toBeNull();
    expect(screen.getByTestId("arm-actions-busy-grip")).toBeInTheDocument();
    // Monitor off / error: no sample to trust, disabled.
    setMonitorArms([makeArmMonitor({ status: "error", detail: "connect failed" })]);
    expect(sel).toBeDisabled();
    // Live again: enabled.
    setMonitorArms([makeArmMonitor()]);
    expect(sel).not.toBeDisabled();
  });

  it("choosing 2 → POST {op: set_collision_sensitivity, collision_sensitivity: 2}; busy until the toast; never optimistic — the value follows the read-back", async () => {
    release = () => undefined;
    render(<ArmStatusCard arm={grip} kind="hardware" />);
    setMonitorArms([makeArmMonitor()]);
    const sel = select();
    const clear = screen.getByTestId("arm-clear-errors-grip");
    fireEvent.change(sel, { target: { value: "2" } });
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({
      url: "/api/hardware/arms/grip/maintenance",
      body: { op: "set_collision_sensitivity", collision_sensitivity: 2 },
    });
    // In flight: only the select is busy; every control of the strip is disabled.
    expect(sel.getAttribute("aria-busy")).toBe("true");
    expect(sel).toBeDisabled();
    expect(clear).toBeDisabled();
    expect(clear.getAttribute("aria-busy")).toBeNull();
    expect(
      screen.getByTestId("arm-sensitivity-field-grip").querySelector(".spinner"),
    ).not.toBeNull();
    // NOT optimistic: the read-back still says 3, so the select still says 3.
    expect(sel.value).toBe("3");
    act(() => release?.());
    await waitFor(() => expect(useStore.getState().toasts).toHaveLength(1));
    expect(useStore.getState().toasts[0]).toMatchObject({
      text: "Manipulation Arm · collision sensitivity set to 2",
      tone: "success",
    });
    await waitFor(() => expect(sel.getAttribute("aria-busy")).toBeNull());
    expect(sel).not.toBeDisabled();
    expect(sel.value).toBe("3"); // still the read-back
    // The next telemetry read-back moves it.
    setMonitorArms([makeArmMonitor({ collision_sensitivity: 2 })]);
    expect(sel.value).toBe("2");
    // Re-selecting the current level posts nothing.
    fireEvent.change(sel, { target: { value: "2" } });
    await new Promise((r) => setTimeout(r, 20));
    expect(posts).toHaveLength(1);
    // The body never carries dry_run and never a level outside 1..3 (the options).
    expect(Object.keys(posts[0]!.body as object)).toEqual(["op", "collision_sensitivity"]);
  });

  it("failures: ok:false → error toast with the runtime detail; 422 / 409 → error toast with the server detail; the value never moves", async () => {
    answer = (armId) =>
      ok({
        arm_id: armId,
        op: "set_collision_sensitivity",
        ok: false,
        detail: "collision sensitivity still reads 3 after writing 1",
        sdk_codes: { set_collision_sensitivity: 0 },
        before: null,
        after: null,
      });
    render(<ArmStatusCard arm={grip} kind="hardware" />);
    setMonitorArms([makeArmMonitor()]);
    const sel = select();
    fireEvent.change(sel, { target: { value: "1" } });
    await waitFor(() => expect(useStore.getState().toasts).toHaveLength(1));
    expect(useStore.getState().toasts[0]).toMatchObject({
      text: "Manipulation Arm · collision sensitivity still reads 3 after writing 1",
      tone: "error",
    });
    expect(sel.value).toBe("3");
    answer = () =>
      new Response(
        JSON.stringify({ detail: "monitor paused - a hardware session owns the boxes" }),
        { status: 409 },
      );
    await waitFor(() => expect(sel).not.toBeDisabled());
    fireEvent.change(sel, { target: { value: "2" } });
    await waitFor(() => expect(useStore.getState().toasts).toHaveLength(2));
    expect(useStore.getState().toasts[1]).toMatchObject({
      text: "Manipulation Arm · monitor paused - a hardware session owns the boxes",
      tone: "error",
    });
    expect(
      posts.map((p) => (p.body as { collision_sensitivity: number }).collision_sensitivity),
    ).toEqual([1, 2]);
  });

  it("sim cards carry no sensitivity control", () => {
    render(<ArmStatusCard arm={makeArmStatus({ arm_id: "grip" })} kind="sim" />);
    setMonitorArms([makeArmMonitor()]);
    expect(screen.queryByTestId("arm-sensitivity-grip")).toBeNull();
  });
});
