/** Devices page smoke (13-tracker §5): mock control + telemetry servers, a
 * TelemetryMsg carrying `tracker`, a fake gamepad, settings → ActionMsg,
 * session start via POST /api/session. */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WebSocket as MockWebSocket } from "mock-socket";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetClients } from "../api/clients";
import type { GamepadLike } from "../input/gamepad";
import { useStore } from "../store";
import { KEYMAP, makeTelemetry, makeTracker } from "../../tests/mocks/fixtures";
import { MockControlServer, MockTelemetryServer } from "../../tests/mocks/mockWs";
import { DEVICES_SESSION_SPEC, Devices } from "./Devices";

const base = `ws://${location.host}`;

describe("Devices page", () => {
  let control: MockControlServer;
  let telemetry: MockTelemetryServer;
  let posts: unknown[];
  let pad: GamepadLike | null;

  beforeEach(() => {
    posts = [];
    pad = null;
    vi.stubGlobal("WebSocket", MockWebSocket);
    // jsdom has no Gamepad API; the hook's default reads navigator.getGamepads.
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [pad],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/session") && init?.method === "POST") {
          const spec = JSON.parse(String(init.body)) as Record<string, unknown>;
          posts.push(spec);
          return new Response(
            JSON.stringify({
              session_id: "s-dev",
              epoch: "epoch-1",
              mode: spec["mode"],
              arms: spec["arms"],
              streams: ["sim", "cam0"],
              state: "running",
            }),
            { status: 200 },
          );
        }
        if (url.includes("/api/session") && init?.method === "DELETE")
          return new Response(null, { status: 204 });
        if (url.includes("/api/session")) {
          const s = useStore.getState().session;
          return s
            ? new Response(JSON.stringify(s), { status: 200 })
            : new Response(JSON.stringify({ detail: "no active session" }), { status: 404 });
        }
        if (url.includes("/api/keymap"))
          return new Response(JSON.stringify(KEYMAP), { status: 200 });
        return new Response("{}", { status: 200 });
      }),
    );
    control = new MockControlServer(`${base}/ws/control`);
    telemetry = new MockTelemetryServer(`${base}/ws/telemetry`);
  });

  afterEach(() => {
    resetClients();
    control.stop();
    telemetry.stop();
    vi.unstubAllGlobals();
    useStore.getState().resetForEpochChange();
    useStore.getState().setKeymap(null, null);
    useStore.getState().setConn("control", "closed");
    useStore.getState().setConn("telemetry", "closed");
    useStore.getState().setRole(null);
  });

  const mount = () =>
    render(
      <MemoryRouter initialEntries={["/devices"]}>
        <Devices />
      </MemoryRouter>,
    );

  it("renders tracker telemetry, echoes settings, sends tracker_settings, starts a session", async () => {
    mount();
    await waitFor(() => expect(useStore.getState().conn.control).toBe("open"));
    await waitFor(() => expect(useStore.getState().bindings).not.toBeNull());
    expect(screen.getByTestId("no-streams")).toBeInTheDocument();
    expect(screen.getByTestId("tracker-status").textContent).toContain("no telemetry");

    // Telemetry with a tracker block (pre-session: device fields only).
    const settings = { yaw_deg: 90, pos_scale: 1.5, follow_rotation: false };
    act(() =>
      telemetry.push(
        makeTelemetry({ arms: [], active_arm: null, tracker: makeTracker({ settings }) }),
      ),
    );
    await waitFor(() => expect(screen.getByTestId("tracker-status").textContent).toBe("tracking"));
    expect(screen.getByTestId("tracker-device").textContent).toContain("backend fake");
    expect(screen.getByTestId("tracker-device").textContent).toContain("120.0 Hz");
    expect(screen.getByTestId("tracker-z").textContent).toBe("1.100 m");
    expect(screen.getByTestId("pose-world").textContent).toContain("0.120, 0.210, 1.100");
    expect(screen.getByTestId("tracker-clutch").textContent).toBe("released");
    expect(screen.getByTestId("tracker-settings-echo").textContent).toContain("yaw 90°");
    expect((screen.getByTestId("tracker-yaw") as HTMLInputElement).value).toBe("90");
    expect((screen.getByTestId("tracker-scale") as HTMLInputElement).value).toBe("1.5");
    expect((screen.getByTestId("tracker-follow-rotation") as HTMLInputElement).checked).toBe(false);
    expect(screen.getByTestId("tracker-trail")).toBeInTheDocument();

    // Engaged clutch → chip shows the arm.
    act(() =>
      telemetry.push(
        makeTelemetry({
          seq: 2,
          tracker: makeTracker({
            settings,
            seq: 43,
            clutch: true,
            engaged_arm: "view",
            anchor_tcp: { position: [0.3, 0.0, 0.4], orientation: [1, 0, 0, 0] },
            target_tcp: { position: [0.32, 0.01, 0.4], orientation: [1, 0, 0, 0] },
          }),
        }),
      ),
    );
    await waitFor(() => expect(screen.getByTestId("tracker-clutch").textContent).toContain("view"));
    expect(screen.getByTestId("pose-anchor").textContent).toContain("0.300");

    // Settings form → ActionMsg tracker_settings.
    fireEvent.change(screen.getByTestId("tracker-scale"), { target: { value: "2" } });
    fireEvent.click(screen.getByTestId("tracker-follow-rotation"));
    fireEvent.change(screen.getByTestId("tracker-scale"), { target: { value: "9" } }); // out of range → dropped
    await waitFor(() => expect(control.actions.length).toBe(2));
    expect(control.actions[0]).toMatchObject({ name: "tracker_settings", args: { pos_scale: 2 } });
    expect(control.actions[1]).toMatchObject({
      name: "tracker_settings",
      args: { follow_rotation: true },
    });

    // Session start → fixed spec, streams appear.
    fireEvent.click(screen.getByTestId("session-start"));
    await screen.findByTestId("session-stop");
    expect(posts[0]).toEqual(DEVICES_SESSION_SPEC);
    expect(posts[0]).toMatchObject({
      mode: "teleop",
      kind: "sim",
      arms: ["view", "grip"],
      frames: { view: "arm_base:view", grip: "arm_base:grip" },
      sim_scene: "mavis_v2",
    });
    expect(screen.getByTestId("session-summary").textContent).toContain("mavis_v2");
    expect(screen.getByTestId("stream-sim")).toBeInTheDocument();
    expect(screen.getByTestId("stream-cam0")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("session-stop"));
    await screen.findByTestId("session-start");
    expect(useStore.getState().session).toBeNull();
  }, 15000);

  it("gamepad panel lights raw buttons + mapped actions, auto-arms, feeds the held set", async () => {
    mount();
    await waitFor(() => expect(useStore.getState().conn.control).toBe("open"));
    await waitFor(() => expect(useStore.getState().bindings).not.toBeNull());
    expect(screen.getByTestId("gamepad-connected").textContent).toBe("no gamepad");

    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
    pad = {
      index: 0,
      id: "Xbox Wireless Controller",
      mapping: "standard",
      connected: true,
      buttons,
      axes: [0, 0, 0, 0],
    };
    await waitFor(() =>
      expect(screen.getByTestId("gamepad-connected").textContent).toBe("connected"),
    );
    expect(screen.getByTestId("gamepad-id").textContent).toBe("Xbox Wireless Controller");
    expect(screen.getByTestId("gamepad-mapping").textContent).toContain("standard");
    expect(screen.getByTestId("gp-map-A").textContent).toContain("gripper_open");
    expect(screen.getByTestId("gp-map-RT").textContent).toContain("tracker_clutch");
    expect(screen.getByTestId("gp-map-A").dataset["lit"]).toBe("false");

    buttons[0] = { pressed: true, value: 1 }; // A → KeyH (held)
    await waitFor(() => expect(screen.getByTestId("gp-map-A").dataset["lit"]).toBe("true"));
    expect(screen.getByTestId("gp-btn-0").className).toContain("raw-cell-lit");
    await screen.findByTestId("gamepad-armed-chip");
    expect(useStore.getState().gamepad.armed).toBe(true);
    await waitFor(() => expect(control.lastHeld).toEqual(["KeyH"]));

    buttons[0] = { pressed: false, value: 0 };
    buttons[5] = { pressed: true, value: 1 }; // RB → switch_arm (discrete)
    await waitFor(() => expect(control.actions.some((a) => a.name === "switch_arm")).toBe(true));
    await waitFor(() => expect(control.lastHeld).toEqual([]));

    // Disconnect → release-all + disarm.
    pad = null;
    act(() => {
      window.dispatchEvent(new Event("gamepaddisconnected"));
    });
    await waitFor(() => expect(useStore.getState().gamepad.armed).toBe(false));
    await waitFor(() =>
      expect(screen.getByTestId("gamepad-connected").textContent).toBe("no gamepad"),
    );
  }, 15000);
});
