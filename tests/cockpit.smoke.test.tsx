/** Integration smoke (05-ui §11): Cockpit + mock control/telemetry/2×video.
 *
 * Real timers + mock-socket end to end: arm capture, hold KeyW, assert the
 * server receives the transition + heartbeats; push a blocked collision
 * fixture → red banner + tile flash; kill the control server → CONTROL LINK
 * DOWN + auto-disarm; (phase-09b) a controller fault raises the FaultBanner,
 * whose recover button exists only while `hardware_monitor.paused` says a
 * hardware session owns the boxes; (phase-09c) a hardware session shows the
 * bring-up progress list until running, the `speed <n>%` badge and the
 * frozen-arm hint for the arm it did not include; (phase-14) a dagger session
 * whose telemetry carries `dagger.online_dagger` renders the Online DAgger title,
 * panel, banner and actor split, and Take over / Hand back / Train now ride the
 * control WS (Train now with its ack toast).
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WebSocket as MockWebSocket } from "mock-socket";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetClients } from "../src/api/clients";
import { buildBindings } from "../src/input/bindings";
import { HARDWARE_GRID_SLOTS } from "../src/lib/streams";
import { Cockpit } from "../src/pages/Cockpit";
import { useStore } from "../src/store";
import {
  KEYMAP,
  makeArm,
  makeBringupRow,
  makeExternal,
  makeHardwareMonitor,
  makeHardwareSession,
  makeOnlineDagger,
  makeProfile,
  makeTelemetry,
  makeWorkcell,
} from "./mocks/fixtures";
import { MockControlServer, MockTelemetryServer, MockVideoServer } from "./mocks/mockWs";

const base = `ws://${location.host}`;

describe("Cockpit integration smoke", () => {
  let control: MockControlServer;
  let telemetry: MockTelemetryServer;
  let video0: MockVideoServer;
  let video1: MockVideoServer;
  // `POST /api/session/return_home` (2026-09-08): what the runtime answers, and how
  // many times the page asked. Reset per test.
  let returnHomeBody: unknown;
  let returnHomeCalls = 0;
  // `GET /api/profiles`: what the Profiles panel's Go-to select lists. Reset per test.
  let profilesBody: unknown;

  beforeEach(() => {
    returnHomeBody = { ok: true, status: "done", detail: "", arms: ["arm0"] };
    returnHomeCalls = 0;
    profilesBody = [];
    vi.stubGlobal("WebSocket", MockWebSocket); // singleton clients use the default factory
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/session/return_home")) {
          returnHomeCalls++;
          return new Response(JSON.stringify(returnHomeBody), { status: 200 });
        }
        if (url.includes("/api/session")) {
          // Hello-resync fetch: serve whatever session the test seeded.
          const s = useStore.getState().session;
          return s
            ? new Response(JSON.stringify(s), { status: 200 })
            : new Response(JSON.stringify({ detail: "no active session" }), { status: 404 });
        }
        if (url.includes("/api/profiles"))
          return new Response(JSON.stringify(profilesBody), { status: 200 });
        return new Response("{}", { status: 200 });
      }),
    );
    control = new MockControlServer(`${base}/ws/control`);
    telemetry = new MockTelemetryServer(`${base}/ws/telemetry`);
    video0 = new MockVideoServer(`${base}/ws/video/cam0`);
    video1 = new MockVideoServer(`${base}/ws/video/cam1`);

    const st = useStore.getState();
    st.setSession({
      session_id: "s1",
      epoch: "epoch-1",
      mode: "teleop",
      arms: ["arm0"],
      streams: ["cam0", "cam1"],
      state: "running",
    });
    st.setWorkcell(makeWorkcell());
    st.setKeymap(KEYMAP, buildBindings(KEYMAP));
  });

  afterEach(() => {
    resetClients();
    control.stop();
    telemetry.stop();
    video0.stop();
    video1.stop();
    vi.unstubAllGlobals();
    useStore.getState().resetForEpochChange();
    useStore.getState().setWorkcell(null);
    useStore.getState().setKeymap(null, null);
    useStore.getState().setConn("control", "closed");
    useStore.getState().setConn("telemetry", "closed");
  });

  const mount = () =>
    render(
      <MemoryRouter>
        <Cockpit mode="teleop" />
      </MemoryRouter>,
    );

  it("arms capture, streams KeyW transitions + heartbeats, disarms on control loss", async () => {
    mount();
    // Control connects and hello arrives → conn open.
    await waitFor(() => expect(useStore.getState().conn.control).toBe("open"));
    // Telemetry drives the side panel.
    act(() => telemetry.push(makeTelemetry()));
    await screen.findByTestId("arm-indicator");

    // Click-to-arm, then hold KeyW.
    fireEvent.click(screen.getByTestId("teleop-surface"));
    await screen.findByTestId("capturing-chip");
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { code: "KeyW", cancelable: true, bubbles: true }),
      );
    });
    // Immediate transition with held=[KeyW].
    await waitFor(() => {
      expect(control.keys.some((k) => k.held.length === 1 && k.held[0] === "KeyW")).toBe(true);
    });
    // Heartbeats keep flowing at 40 ms while held.
    const count = control.keys.length;
    await new Promise((r) => setTimeout(r, 200));
    expect(control.keys.length).toBeGreaterThanOrEqual(count + 3);
    expect(control.keys[control.keys.length - 1]!.held).toEqual(["KeyW"]);
    // seq strictly increasing across transition + heartbeats.
    const seqs = control.keys.map((k) => k.seq);
    for (let i = 1; i < seqs.length; i++) expect(seqs[i]!).toBeGreaterThan(seqs[i - 1]!);

    // Kill the control server → CONTROL LINK DOWN + auto-disarm.
    control.stop();
    await screen.findByTestId("control-link-down");
    await waitFor(() => expect(screen.queryByTestId("capturing-chip")).toBeNull());
    expect(useStore.getState().captureArmed).toBe(false);
  }, 15000);

  it("blocked collision fixture → red banner + flashing sim/twin tile border", async () => {
    const st = useStore.getState();
    st.setSession({
      session_id: "s1",
      epoch: "epoch-1",
      mode: "teleop",
      arms: ["arm0"],
      streams: ["cam0", "sim"],
      state: "running",
    });
    const sim = new MockVideoServer(`${base}/ws/video/sim`);
    try {
      mount();
      await waitFor(() => expect(useStore.getState().conn.control).toBe("open"));
      act(() =>
        telemetry.push(
          makeTelemetry({
            seq: 2,
            collision: {
              blocked: true,
              severity: "blocked",
              pairs: [["arm0/link5", "arm1/link3"]],
              min_clearance_m: 0.004,
            },
            clearances: [{ pair: ["arm0/link5", "arm1/link3"], dist_m: 0.004 }],
          }),
        ),
      );
      const banner = await screen.findByTestId("collision-banner");
      expect(banner.textContent).toContain("COMMAND BLOCKED BY TWIN GATE");
      expect(banner.textContent).toContain("arm0/link5");
      expect(screen.getByTestId("stream-sim").className).toContain("tile-blocked");
      expect(screen.getByTestId("stream-cam0").className).not.toContain("tile-blocked");
      // Clearance readout shows the mm-graded pair.
      expect(screen.getByTestId("clearance-readout").textContent).toContain("4 mm");
    } finally {
      sim.stop();
    }
  }, 15000);

  it("controller fault (phase-09b): FaultBanner with the recover button only while the monitor is paused (hardware session)", async () => {
    mount();
    await waitFor(() => expect(useStore.getState().conn.control).toBe("open"));
    // Sim session (monitor not paused): the fault shows, no button.
    act(() =>
      telemetry.push(
        makeTelemetry({
          seq: 2,
          arms: [
            makeArm({
              arm_id: "grip",
              error_code: 24,
              fault_detail: "controller error 24: Speed Exceeds Limit",
            }),
            makeArm({ arm_id: "view" }),
          ],
          session: { state: "fault" },
          hardware_monitor: makeHardwareMonitor({ paused: false }),
        }),
      ),
    );
    const banner = await screen.findByTestId("fault-banner");
    expect(banner.className).toContain("banner-red");
    expect(screen.getByTestId("fault-row-grip").textContent).toContain(
      "Manipulation Arm C24 Speed Exceeds Limit",
    );
    expect(screen.queryByTestId("fault-recover-grip")).toBeNull();
    // The ArmIndicator chip is the red C24 (no "err 24").
    expect(screen.getByTestId("arm-error-grip").textContent).toBe("C24");
    expect(screen.getByTestId("arm-error-grip").className).toBe("chip chip-red");
    // Hardware session (monitor paused): the button appears.
    act(() =>
      telemetry.push(
        makeTelemetry({
          seq: 3,
          arms: [
            makeArm({
              arm_id: "grip",
              error_code: 24,
              fault_detail: "controller error 24: Speed Exceeds Limit",
            }),
            makeArm({ arm_id: "view" }),
          ],
          session: { state: "fault" },
          hardware_monitor: makeHardwareMonitor({ paused: true }),
        }),
      ),
    );
    await screen.findByTestId("fault-recover-grip");
    // Recovering → amber, button busy; running + no fault → banner gone.
    act(() =>
      telemetry.push(
        makeTelemetry({
          seq: 4,
          arms: [
            makeArm({
              arm_id: "grip",
              error_code: 24,
              fault_detail: "controller error 24: Speed Exceeds Limit",
              recovering: true,
            }),
            makeArm({ arm_id: "view" }),
          ],
          session: { state: "recovering" },
          hardware_monitor: makeHardwareMonitor({ paused: true }),
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId("fault-banner").className).toContain("banner-amber"),
    );
    expect(screen.getByTestId("fault-recover-grip")).toBeDisabled();
    act(() =>
      telemetry.push(
        makeTelemetry({
          seq: 5,
          session: { state: "running" },
          hardware_monitor: makeHardwareMonitor({ paused: true }),
        }),
      ),
    );
    await waitFor(() => expect(screen.queryByTestId("fault-banner")).toBeNull());
  }, 15000);

  it("observer role shows the read-only banner and blocks arming", async () => {
    control.stop();
    control = new MockControlServer(`${base}/ws/control`);
    control.role = "observer";
    mount();
    await waitFor(() => expect(useStore.getState().conn.role).toBe("observer"));
    await screen.findByTestId("observer-banner");
    fireEvent.click(screen.getByTestId("teleop-surface"));
    expect(screen.queryByTestId("capturing-chip")).toBeNull();
  }, 15000);
  it("phase-09c hardware session: bring-up rows until running, speed badge, frozen Perception Arm hint", async () => {
    // A phase-09c hardware teleop session at 10 %, here with the Manipulation Arm
    // alone to exercise the D1 frozen-arm hint (phase-09d sessions include every
    // arm, so this is the defensive path for an older runtime). The wire shape has
    // `streams: []` (the previews are adopted, not re-added), so the grid must
    // come from HARDWARE_GRID_SLOTS: both wrist cameras + their `_align` overlays.
    const hw = makeHardwareSession({ state: "bringup", arms: ["grip"] });
    expect(hw.streams).toEqual([]);
    useStore.getState().setSession(hw);
    const cams = HARDWARE_GRID_SLOTS.map((id) => new MockVideoServer(`${base}/ws/video/${id}`));
    try {
      mount();
      await waitFor(() => expect(useStore.getState().conn.control).toBe("open"));
      expect(screen.getByTestId("speed-badge").textContent).toBe("speed 10%");
      expect(screen.getByTestId("speed-badge").dataset["scale"]).toBe("0.1");
      // Four tiles, each camera followed by its overlay (DOM order = grid order).
      expect(
        Array.from(document.querySelectorAll("[data-testid^='stream-']"))
          .map((el) => (el as HTMLElement).dataset["testid"])
          .filter((id) => id !== "stream-title" && id !== "stream-status"),
      ).toEqual([
        "stream-grip_wrist",
        "stream-grip_wrist_align",
        "stream-view_wrist",
        "stream-view_wrist_align",
      ]);
      // Bring-up in progress: the list above the grid, rows Manipulation Arm first.
      act(() =>
        telemetry.push(
          makeTelemetry({
            arms: [makeArm({ arm_id: "grip", rail_pos_m: 0 })],
            hardware_monitor: makeHardwareMonitor({ paused: true }),
            session: {
              state: "bringup",
              bringup: [
                makeBringupRow({
                  arm_id: "view",
                  step: "frozen",
                  status: "warning",
                  detail: "Perception Arm frozen at last sample",
                }),
                makeBringupRow({ step: "connect", status: "ok" }),
                makeBringupRow({ step: "rail", status: "pending" }),
              ],
            },
          }),
        ),
      );
      const list = await screen.findByTestId("bringup-progress");
      expect(
        Array.from(list.querySelectorAll("[data-testid^='bringup-row-']")).map(
          (el) => (el as HTMLElement).dataset["testid"],
        ),
      ).toEqual(["bringup-row-grip-connect", "bringup-row-grip-rail", "bringup-row-view-frozen"]);
      expect(screen.getByTestId("bringup-row-view-frozen").textContent).toContain(
        "Perception Arm frozen at last sample",
      );
      // The frozen hint: every monitor arm outside `session.arms`, from the side panel.
      expect(screen.getByTestId("frozen-hint-view").textContent).toBe(
        "Perception Arm frozen at last sample — do not move it from Studio",
      );
      expect(screen.queryByTestId("frozen-hint-grip")).toBeNull();
      // Running → the list is gone; the badge and the hint stay for the session.
      act(() =>
        telemetry.push(
          makeTelemetry({
            seq: 2,
            arms: [makeArm({ arm_id: "grip", rail_pos_m: 0 })],
            hardware_monitor: makeHardwareMonitor({ paused: true }),
            session: { state: "running" },
          }),
        ),
      );
      await waitFor(() => expect(screen.queryByTestId("bringup-progress")).toBeNull());
      expect(screen.getByTestId("speed-badge").textContent).toBe("speed 10%");
      expect(screen.getByTestId("frozen-hint-view")).toBeInTheDocument();
      // The recover button relies on either hardware signal (phase-09b + SessionInfo.kind).
      act(() =>
        telemetry.push(
          makeTelemetry({
            seq: 3,
            arms: [
              makeArm({
                arm_id: "grip",
                rail_pos_m: 0,
                error_code: 24,
                fault_detail: "controller error 24: Speed Exceeds Limit",
              }),
            ],
            hardware_monitor: makeHardwareMonitor({ paused: false }),
            session: { state: "fault" },
          }),
        ),
      );
      await screen.findByTestId("fault-recover-grip");
    } finally {
      cams.forEach((c) => c.stop());
    }
  });

  it("arm switching without the controller (2026-09-07): a row click sends the explicit arm_id, Tab cycles while capture is disarmed and only then", async () => {
    mount();
    await waitFor(() => expect(useStore.getState().conn.control).toBe("open"));
    act(() =>
      telemetry.push(
        makeTelemetry({
          arms: [makeArm({ arm_id: "grip" }), makeArm({ arm_id: "view", rail_pos_m: null })],
          active_arm: "grip",
        }),
      ),
    );
    await screen.findByTestId("arm-indicator");
    // The hint names whatever the served keymap binds (Tab in the fixture).
    expect(screen.getByTestId("arm-indicator").textContent).toContain("click a row or press Tab");

    // Click the inactive row → explicit switch_arm {arm_id}. The row does NOT
    // pre-highlight: `aria-pressed` follows telemetry, which the server owns.
    fireEvent.click(screen.getByTestId("arm-chip-view"));
    await waitFor(() => expect(control.actions).toHaveLength(1));
    expect(control.actions[0]).toMatchObject({ name: "switch_arm", args: { arm_id: "view" } });
    expect(screen.getByTestId("arm-chip-grip").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("arm-chip-view").getAttribute("aria-pressed")).toBe("false");
    act(() =>
      telemetry.push(
        makeTelemetry({
          seq: 2,
          arms: [makeArm({ arm_id: "grip" }), makeArm({ arm_id: "view", rail_pos_m: null })],
          active_arm: "view",
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId("arm-chip-view").getAttribute("aria-pressed")).toBe("true"),
    );

    // Tab from the page (capture disarmed) → a plain cycle, no args.
    const tab = () =>
      act(() => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { code: "Tab", cancelable: true, bubbles: true }),
        );
      });
    tab();
    await waitFor(() => expect(control.actions).toHaveLength(2));
    expect(control.actions[1]).toMatchObject({ name: "switch_arm" });
    expect(control.actions[1]!.args).toBeUndefined();

    // Tab inside the Joint panel's number box keeps meaning "next field".
    const numberBox = screen
      .getByTestId("joint-panel")
      .querySelector("input[type=number]") as HTMLInputElement;
    act(() => {
      numberBox.dispatchEvent(
        new KeyboardEvent("keydown", { code: "Tab", cancelable: true, bubbles: true }),
      );
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(control.actions).toHaveLength(2);

    // With capture armed, `useKeyCapture` owns Tab — the page listener must not
    // double-fire it (one press, one switch).
    fireEvent.click(screen.getByTestId("teleop-surface"));
    await screen.findByTestId("capturing-chip");
    tab();
    await waitFor(() => expect(control.actions).toHaveLength(3));
    await new Promise((r) => setTimeout(r, 50));
    expect(control.actions).toHaveLength(3);
  }, 15000);

  it("episode keys (phase-13): capture armed + keydown Enter → episode_save ActionMsg; disarmed → nothing", async () => {
    useStore.getState().setSession({
      session_id: "s1",
      epoch: "epoch-1",
      mode: "collect",
      arms: ["arm0"],
      streams: ["cam0", "cam1"],
      state: "running",
    });
    render(
      <MemoryRouter>
        <Cockpit mode="collect" />
      </MemoryRouter>,
    );
    await waitFor(() => expect(useStore.getState().conn.control).toBe("open"));
    act(() =>
      telemetry.push(
        makeTelemetry({
          episode: {
            state: "recording",
            index: 0,
            frames: 12,
            duration_s: 0.48,
            frames_skipped: 3,
          },
        }),
      ),
    );
    await screen.findByTestId("episode-controls");
    expect(screen.getByTestId("rec-skipped").textContent).toContain("skipped 3");
    // disarmed: Enter is not captured
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { code: "Enter", cancelable: true, bubbles: true }),
      );
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(control.actions.filter((a) => a.name === "episode_save")).toHaveLength(0);
    // armed: the served keymap's Enter row fires episode_save, same path as the button
    fireEvent.click(screen.getByTestId("teleop-surface"));
    await screen.findByTestId("capturing-chip");
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { code: "Enter", cancelable: true, bubbles: true }),
      );
    });
    await waitFor(() =>
      expect(control.actions.filter((a) => a.name === "episode_save")).toHaveLength(1),
    );
    fireEvent.click(screen.getByTestId("episode-save"));
    await waitFor(() =>
      expect(control.actions.filter((a) => a.name === "episode_save")).toHaveLength(2),
    );
  }, 15000);

  it("sim session: no speed badge, no frozen hint, no bring-up list", async () => {
    mount();
    await waitFor(() => expect(useStore.getState().conn.control).toBe("open"));
    act(() =>
      telemetry.push(
        makeTelemetry({ hardware_monitor: makeHardwareMonitor(), session: { state: "running" } }),
      ),
    );
    await screen.findByTestId("arm-indicator");
    expect(screen.queryByTestId("speed-badge")).toBeNull();
    expect(screen.queryByTestId("frozen-arms")).toBeNull();
    expect(screen.queryByTestId("bringup-progress")).toBeNull();
  });

  // -- leaving the cockpit returns the arms first (2026-09-08 operator request) ------
  it("End session returns the arms to the initial condition, then tears down", async () => {
    mount();
    await waitFor(() => expect(useStore.getState().conn.control).toBe("open"));
    fireEvent.click(screen.getByTestId("end-session"));
    // The button reports the motion instead of navigating straight away.
    await screen.findByText("Returning to start…");
    expect(screen.getByTestId("end-session")).toBeDisabled();
    await waitFor(() => expect(returnHomeCalls).toBe(1));
    // Arrived -> the session is dropped from the store (and the page navigates away).
    await waitFor(() => expect(useStore.getState().session).toBeNull());
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
  }, 15000);

  it("a return that cannot be planned holds the page with the Studio dialog", async () => {
    returnHomeBody = {
      ok: false,
      status: "failed",
      detail:
        "the digital twin could not plan a collision-free path: blocked (arm0_link4 / table).",
      arms: ["arm0"],
    };
    mount();
    await waitFor(() => expect(useStore.getState().conn.control).toBe("open"));
    fireEvent.click(screen.getByTestId("end-session"));
    const dialog = await screen.findByTestId("confirm-dialog");
    expect(dialog).toHaveTextContent("could not plan a collision-free path");
    expect(dialog).toHaveTextContent("UFACTORY Studio");
    // Still in the session: nothing was torn down and the button works again.
    expect(useStore.getState().session).not.toBeNull();
    await waitFor(() => expect(screen.getByTestId("end-session")).not.toBeDisabled());
    // "Stay in session" dismisses without leaving.
    fireEvent.click(screen.getByTestId("confirm-cancel"));
    await waitFor(() => expect(screen.queryByTestId("confirm-dialog")).toBeNull());
    expect(useStore.getState().session).not.toBeNull();
    // "End session anyway" leaves without retrying the return.
    fireEvent.click(screen.getByTestId("end-session"));
    await screen.findByTestId("confirm-dialog");
    fireEvent.click(screen.getByTestId("confirm-ok"));
    await waitFor(() => expect(useStore.getState().session).toBeNull());
    expect(returnHomeCalls).toBe(2);
  }, 15000);

  it("a workcell with no initial condition leaves straight away (skipped is a success)", async () => {
    returnHomeBody = {
      ok: true,
      status: "skipped",
      detail: "no initial condition designated for the sim workcell",
      arms: [],
    };
    mount();
    await waitFor(() => expect(useStore.getState().conn.control).toBe("open"));
    fireEvent.click(screen.getByTestId("end-session"));
    await waitFor(() => expect(useStore.getState().session).toBeNull());
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
  }, 15000);

  it("R (reset_to_initial) sends the action and toasts the ack detail", async () => {
    mount();
    await waitFor(() => expect(useStore.getState().conn.control).toBe("open"));
    act(() => telemetry.push(makeTelemetry()));
    control.ackDetail = "returning to 'home'"; // the manager's ack detail
    fireEvent.click(screen.getByTestId("teleop-surface"));
    await screen.findByTestId("capturing-chip");
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { code: "KeyR", cancelable: true, bubbles: true }),
      );
    });
    await waitFor(() =>
      expect(control.actions.some((a) => a.name === "reset_to_initial")).toBe(true),
    );
    await waitFor(() =>
      expect(
        useStore.getState().toasts.some((toast) => toast.text.includes("returning to 'home'")),
      ).toBe(true),
    );
  }, 15000);

  it("Online DAgger session (phase-14): title, panel, actor split, Take over / Hand back / Train now → actions + ack toast, trainer banner", async () => {
    useStore.getState().setSession({
      session_id: "s-od",
      epoch: "epoch-1",
      mode: "dagger",
      arms: ["grip", "view"],
      streams: ["cam0", "cam1"],
      state: "running",
      policy_source: "external",
    });
    render(
      <MemoryRouter>
        <Cockpit mode="dagger" />
      </MemoryRouter>,
    );
    await waitFor(() => expect(useStore.getState().conn.control).toBe("open"));
    const odDagger = (over: Partial<ReturnType<typeof makeOnlineDagger>> = {}) => ({
      control_mode: "policy" as const,
      engaged_arm: null,
      policy_version: "v4",
      policy_stale: false,
      online_dagger: makeOnlineDagger(over),
    });
    act(() =>
      telemetry.push(
        makeTelemetry({
          episode: {
            state: "idle",
            index: 1,
            frames: 0,
            duration_s: 0,
            repo_id: "online_dagger/pick_cube_v1",
          },
          dagger: odDagger(),
          external: makeExternal(),
        }),
      ),
    );
    await screen.findByTestId("online-dagger-panel");
    expect(document.title).toBe("APOLLO MAVIS V2 · Online DAgger");
    expect(screen.getByTestId("cockpit-title").textContent).toBe("Online DAgger · pick_cube_v1");
    expect(screen.queryByTestId("dagger-panel")).toBeNull(); // the legacy panel is replaced
    expect(screen.getByTestId("od-phase").textContent).toBe("ROLLOUT");
    expect(screen.getByTestId("od-rollouts").textContent).toBe("3 rollouts saved");
    // The actor split renders ONCE, in the panel (15-online-dagger §8) — not in
    // EpisodeControls, which carries only the new-episode reason.
    expect(screen.getByTestId("od-expert-frames").textContent).toBe("120 / 480 novice");
    expect(screen.queryByTestId("episode-actor-split")).toBeNull();
    expect(screen.getByTestId("episode-repo").textContent).toContain("online_dagger/pick_cube_v1");
    expect(screen.queryByTestId("online-dagger-banner")).toBeNull();
    // No episode open, policy driving: Take over is live (the runtime accepts it at
    // any time, like Space), Hand back names its no-op; Train now is live.
    expect(screen.getByTestId("od-takeover")).toBeEnabled();
    expect(screen.getByTestId("od-handback")).toBeDisabled();
    expect(screen.getByTestId("od-gate-reason").textContent).toBe(
      "Hand back: the policy is already driving",
    );
    // Train now: the ActionMsg rides the control WS; a nack toasts the runtime's reason.
    control.ackOk = false;
    control.ackDetail = "save or discard the episode first";
    fireEvent.click(screen.getByTestId("od-train-now"));
    await waitFor(() => expect(control.actions.some((a) => a.name === "train_now")).toBe(true));
    await waitFor(() =>
      expect(
        useStore
          .getState()
          .toasts.some((t) => t.text === "Train now refused: save or discard the episode first"),
      ).toBe(true),
    );
    // Only the panel's toast, not the generic nack one.
    expect(useStore.getState().toasts.filter((t) => t.text.includes("train_now"))).toEqual([]);
    // An ok ack toasts the runtime's own detail.
    control.ackOk = true;
    control.ackDetail = "train_now published (3 rollouts saved)";
    fireEvent.click(screen.getByTestId("od-train-now"));
    await waitFor(() =>
      expect(
        useStore
          .getState()
          .toasts.some(
            (t) => t.text === "train_now published (3 rollouts saved)" && t.tone === "info",
          ),
      ).toBe(true),
    );
    // In `rollout` New episode is live (the runtime accepts episode_new).
    expect(screen.getByTestId("episode-new")).toBeEnabled();
    expect(screen.queryByTestId("episode-new-reason")).toBeNull();
    // A recording rollout: Take over sends `takeover`; after telemetry flips the
    // control mode, Hand back sends `handback`. No optimistic UI in between.
    act(() =>
      telemetry.push(
        makeTelemetry({
          seq: 2,
          episode: { state: "recording", index: 1, frames: 40, duration_s: 1.6 },
          dagger: odDagger(),
          external: makeExternal(),
        }),
      ),
    );
    await waitFor(() => expect(screen.getByTestId("od-takeover")).toBeEnabled());
    fireEvent.click(screen.getByTestId("od-takeover"));
    await waitFor(() => expect(control.actions.some((a) => a.name === "takeover")).toBe(true));
    expect(screen.getByTestId("od-handback")).toBeDisabled();
    act(() =>
      telemetry.push(
        makeTelemetry({
          seq: 3,
          episode: { state: "recording", index: 1, frames: 80, duration_s: 3.2 },
          dagger: { ...odDagger(), control_mode: "human" },
          external: makeExternal(),
        }),
      ),
    );
    await waitFor(() => expect(screen.getByTestId("od-handback")).toBeEnabled());
    expect(screen.getByTestId("dagger-mode-chip").textContent).toBe(
      "HUMAN TAKEOVER — recording intervention",
    );
    fireEvent.click(screen.getByTestId("od-handback"));
    await waitFor(() => expect(control.actions.some((a) => a.name === "handback")).toBe(true));
    expect(screen.getByTestId("od-train-now")).toBeDisabled(); // episode open
    // 15-online-dagger §3: while `waiting_trainer` / `training` the runtime refuses
    // episode_new — New episode is disabled with the runtime's detail (or the phase
    // wording) and the panel's N hint greys out; the operator never meets the nack toast.
    act(() =>
      telemetry.push(
        makeTelemetry({
          seq: 4,
          episode: { state: "idle", index: 1, frames: 0, duration_s: 0 },
          dagger: odDagger({
            phase: "waiting_trainer",
            detail: "waiting for the trainer to report ready (loading the offline pool)",
          }),
          external: makeExternal(),
        }),
      ),
    );
    await waitFor(() => expect(screen.getByTestId("episode-new")).toBeDisabled());
    expect(screen.getByTestId("episode-new-reason").textContent).toBe(
      "waiting for the trainer to report ready (loading the offline pool)",
    );
    expect(screen.getByTestId("od-hint-new").className).toBe("od-hint-off");
    expect(screen.getByTestId("od-phase").textContent).toBe("WAITING FOR TRAINER");
    act(() =>
      telemetry.push(
        makeTelemetry({
          seq: 5,
          episode: { state: "idle", index: 1, frames: 0, duration_s: 0 },
          dagger: odDagger({ phase: "training", detail: "" }),
          external: makeExternal(),
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId("episode-new-reason").textContent).toBe("training in progress"),
    );
    expect(screen.getByTestId("episode-new")).toBeDisabled();
    expect(screen.getByTestId("od-train-now-reason").textContent).toBe("training in progress");
    // Trainer lost → the red banner in the main column. The coordinator's phase is a
    // function of the LAST status, so it still says `rollout` — yet `_refuse_locked`
    // checks aliveness first: New episode must be disabled with THAT reason (the
    // runtime ships it in `detail`) and the N hint greyed, not left live for a nack.
    act(() =>
      telemetry.push(
        makeTelemetry({
          seq: 6,
          episode: { state: "idle", index: 1, frames: 0, duration_s: 0 },
          dagger: odDagger({
            phase: "rollout",
            trainer_alive: false,
            trainer_age_s: 9,
            detail: "no Online DAgger trainer attached",
          }),
          external: makeExternal(),
        }),
      ),
    );
    const banner = await screen.findByTestId("online-dagger-banner");
    expect(banner.textContent).toContain("TRAINER LOST");
    expect(banner.closest(".cockpit-main")).not.toBeNull();
    expect(screen.getByTestId("od-phase").textContent).toBe("ROLLOUT");
    expect(screen.getByTestId("episode-new")).toBeDisabled();
    expect(screen.getByTestId("episode-new-reason").textContent).toBe(
      "no Online DAgger trainer attached",
    );
    expect(screen.getByTestId("od-hint-new").className).toBe("od-hint-off");
    expect(screen.getByTestId("od-train-now-reason").textContent).toBe(
      "no Online DAgger trainer attached",
    );
    // A legacy block → the old panel.
    act(() =>
      telemetry.push(
        makeTelemetry({
          seq: 7,
          dagger: { ...odDagger(), online_dagger: null },
        }),
      ),
    );
    await screen.findByTestId("dagger-panel");
    expect(screen.queryByTestId("online-dagger-panel")).toBeNull();
    expect(screen.getByTestId("cockpit-title").textContent).toBe("Online DAgger");
  }, 15000);

  // -- Profiles panel: Go to profile (2026-09-08) ---------------------------------------
  it("Go to profile sends goto_profile {profile_id} over the control WS and toasts the ack / the nack reason; link down disables it with the reason", async () => {
    profilesBody = [
      makeProfile({ profile_id: "p1", name: "grasp-ready" }),
      makeProfile({ profile_id: "p0", name: "start-pose", is_initial_condition: true }),
      // the other kind's initial condition never reaches a sim session's select
      makeProfile({
        profile_id: "h0",
        name: "hw-start",
        is_initial_condition: true,
        workcell_kind: "hardware",
      }),
    ];
    mount();
    await waitFor(() => expect(useStore.getState().conn.control).toBe("open"));
    const select = (await screen.findByTestId("goto-profile-select")) as HTMLSelectElement;
    await waitFor(() => expect(select.options.length).toBe(2));
    expect([...select.options].map((o) => o.value)).toEqual(["p0", "p1"]); // initial first
    expect(select.value).toBe("p0");

    control.ackDetail = "going to 'start-pose' (14 waypoints)";
    fireEvent.click(screen.getByTestId("goto-profile"));
    await waitFor(() => expect(control.actions.some((a) => a.name === "goto_profile")).toBe(true));
    expect(control.actions.find((a) => a.name === "goto_profile")!.args).toEqual({
      profile_id: "p0",
    });
    await waitFor(() =>
      expect(
        useStore
          .getState()
          .toasts.some(
            (t) => t.text === "going to 'start-pose' (14 waypoints)" && t.tone === "info",
          ),
      ).toBe(true),
    );

    // A nack toasts the runtime's reason — once, not also the generic "goto_profile: …".
    control.ackOk = false;
    control.ackDetail = "an episode is recording";
    fireEvent.change(select, { target: { value: "p1" } });
    fireEvent.click(screen.getByTestId("goto-profile"));
    await waitFor(() =>
      expect(control.actions.filter((a) => a.name === "goto_profile")).toHaveLength(2),
    );
    expect(control.actions.filter((a) => a.name === "goto_profile")[1]!.args).toEqual({
      profile_id: "p1",
    });
    await waitFor(() =>
      expect(
        useStore
          .getState()
          .toasts.some(
            (t) =>
              t.text === "Go to profile refused: an episode is recording" && t.tone === "warning",
          ),
      ).toBe(true),
    );
    expect(useStore.getState().toasts.some((t) => t.text.startsWith("goto_profile:"))).toBe(false);

    // Control link down → disabled with the reason next to it.
    control.stop();
    await screen.findByTestId("control-link-down");
    await waitFor(() => expect(screen.getByTestId("goto-profile")).toBeDisabled());
    expect(screen.getByTestId("goto-profile-reason").textContent).toBe("Control link down");
  }, 15000);

  it("a refused profile start (telemetry.session.fault_detail) is shown verbatim in the fault banner", async () => {
    mount();
    await waitFor(() => expect(useStore.getState().conn.control).toBe("open"));
    const detail =
      "start_from refused: Manipulation Arm C24 Speed Exceeds Limit — the loop did not accept the plan";
    act(() =>
      telemetry.push(makeTelemetry({ session: { state: "running", fault_detail: detail } })),
    );
    const banner = await screen.findByTestId("fault-banner");
    expect(banner.className).toContain("banner-amber");
    expect(screen.getByTestId("fault-row-session-detail").textContent).toBe(`SESSION — ${detail}`);
    expect(screen.queryByTestId("fault-recover-grip")).toBeNull(); // the arms are held, not faulted
    // The next frame without it clears the banner.
    act(() => telemetry.push(makeTelemetry({ seq: 2, session: { state: "running" } })));
    await waitFor(() => expect(screen.queryByTestId("fault-banner")).toBeNull());
  }, 15000);
});
