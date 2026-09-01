/** Integration smoke (05-ui §11): Cockpit + mock control/telemetry/2×video.
 *
 * Real timers + mock-socket end to end: arm capture, hold KeyW, assert the
 * server receives the transition + heartbeats; push a blocked collision
 * fixture → red banner + tile flash; kill the control server → CONTROL LINK
 * DOWN + auto-disarm.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WebSocket as MockWebSocket } from "mock-socket";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetClients } from "../src/api/clients";
import { buildBindings } from "../src/input/bindings";
import { Cockpit } from "../src/pages/Cockpit";
import { useStore } from "../src/store";
import { KEYMAP, makeTelemetry, makeWorkcell } from "./mocks/fixtures";
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
});
