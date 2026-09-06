/** Integration smoke (05-ui §11): Cockpit + mock control/telemetry/2×video.
 *
 * Real timers + mock-socket end to end: arm capture, hold KeyW, assert the
 * server receives the transition + heartbeats; push a blocked collision
 * fixture → red banner + tile flash; kill the control server → CONTROL LINK
 * DOWN + auto-disarm; (phase-09b) a controller fault raises the FaultBanner,
 * whose recover button exists only while `hardware_monitor.paused` says a
 * hardware session owns the boxes; (phase-09c) a hardware session shows the
 * bring-up progress list until running, the `speed <n>%` badge and the
 * frozen-arm hint for the arm it did not include.
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
  makeHardwareMonitor,
  makeHardwareSession,
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

  beforeEach(() => {
    vi.stubGlobal("WebSocket", MockWebSocket); // singleton clients use the default factory
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/session")) {
          // Hello-resync fetch: serve whatever session the test seeded.
          const s = useStore.getState().session;
          return s
            ? new Response(JSON.stringify(s), { status: 200 })
            : new Response(JSON.stringify({ detail: "no active session" }), { status: 404 });
        }
        if (url.includes("/api/profiles")) return new Response("[]", { status: 200 });
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
});
