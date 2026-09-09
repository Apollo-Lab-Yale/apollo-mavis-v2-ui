/** Debug page (`#/devices`) smoke (13-tracker §5; named "Debug" since
 * phase-09d): mock control + telemetry servers, a
 * TelemetryMsg carrying `tracker` (+ `controller` / `device_held` /
 * `device_action` / `pose_filtered`), a fake gamepad (incl. the release-all
 * latch), the settings form's commit semantics + nack toasts, the keyboard
 * capture surface (KeyC clutch), session start via POST /api/session and the
 * tracker-calibration panel + wizard (phase-10, REST + telemetry). */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WebSocket as MockWebSocket } from "mock-socket";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetClients } from "../api/clients";
import type { GamepadLike } from "../input/gamepad";
import { useStore } from "../store";
import { KEYMAP, makeCalibration, makeTelemetry, makeTracker } from "../../tests/mocks/fixtures";
import { MockControlServer, MockTelemetryServer } from "../../tests/mocks/mockWs";
import { DEBUG_PAGE_HEADING, DEVICES_SESSION_SPEC, Devices } from "./Devices";

const base = `ws://${location.host}`;

describe("Devices page", () => {
  let control: MockControlServer;
  let telemetry: MockTelemetryServer;
  let posts: unknown[];
  let calibPosts: unknown[];
  let calib409: string | null;
  let pad: GamepadLike | null;

  beforeEach(() => {
    posts = [];
    calibPosts = [];
    calib409 = null;
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
        if (url.includes("/api/tracker/calibration") && init?.method === "POST") {
          const cmd = JSON.parse(String(init.body)) as { kind: "base_station" | "yaw" };
          calibPosts.push(cmd);
          if (calib409) return new Response(JSON.stringify({ detail: calib409 }), { status: 409 });
          return new Response(
            JSON.stringify(makeCalibration({ kind: cmd.kind, phase: "starting" })),
            { status: 200 },
          );
        }
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
    useStore.setState({ toasts: [] }); // toasts never auto-dismiss; do not leak across tests
  });

  const mount = () =>
    render(
      <MemoryRouter initialEntries={["/devices"]}>
        <Devices />
      </MemoryRouter>,
    );

  const pushTracker = (over: Parameters<typeof makeTracker>[0], seq = 1) =>
    act(() =>
      telemetry.push(
        makeTelemetry({ seq, arms: [], active_arm: null, tracker: makeTracker(over) }),
      ),
    );

  it("renders tracker telemetry (incl. filter echo + filtered pose), starts a grip-first session", async () => {
    mount();
    await waitFor(() => expect(useStore.getState().conn.control).toBe("open"));
    await waitFor(() => expect(useStore.getState().bindings).not.toBeNull());
    // Phase-09d: the page is called "Debug" (route and testids keep `devices`).
    expect(document.title).toBe("APOLLO MAVIS V2 · Debug");
    expect(DEBUG_PAGE_HEADING).toBe("Debug — gamepad & tracker");
    expect(screen.getByTestId("debug-heading").textContent).toBe("Debug — gamepad & tracker");
    expect(screen.getByTestId("devices-page").textContent).not.toContain("Devices —");
    expect(screen.getByTestId("no-streams")).toBeInTheDocument();
    expect(screen.getByTestId("tracker-status").textContent).toContain("no telemetry");
    // No session → the settings form is disabled with a reason.
    expect((screen.getByTestId("tracker-yaw") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByTestId("tracker-settings-disabled").textContent).toContain(
      "Start a session",
    );

    // Telemetry with a tracker block (pre-session: device fields only), tuned filter.
    const settings = {
      yaw_deg: 90,
      pos_scale: 1.5,
      follow_rotation: false,
      filter_enabled: false,
      filter_min_cutoff_hz: 2.5,
      filter_beta: 0.2,
    };
    pushTracker({ settings });
    await waitFor(() => expect(screen.getByTestId("tracker-status").textContent).toBe("tracking"));
    expect(screen.getByTestId("tracker-device").textContent).toContain("backend fake");
    expect(screen.getByTestId("tracker-device").textContent).toContain("120.0 Hz");
    expect(screen.getByTestId("tracker-z").textContent).toBe("1.100 m");
    expect(screen.getByTestId("pose-world").textContent).toContain("0.120, 0.210, 1.100");
    expect(screen.getByTestId("pose-filtered").textContent).toBe("filtered—"); // not reported yet
    expect(screen.getByTestId("tracker-clutch").textContent).toBe("released");
    // Battery/charging chip is device-level (shown even with no controller state);
    // `charging` omitted by the fixture → unreported. True/false states: own test below.
    expect(screen.getByTestId("tracker-charging").textContent).toBe("battery —");
    // `controller` omitted by the fixture (pre-§1.1 runtime) → none.
    expect(screen.getByTestId("controller-status").textContent).toBe("controller: none");
    const echo = screen.getByTestId("tracker-settings-echo").textContent ?? "";
    expect(echo).toContain("yaw 90°");
    expect(echo).toContain("scale 1.5");
    expect(echo).toContain("rotation off");
    expect(echo).toContain("filter off (cutoff 2.5 Hz, beta 0.2)");
    expect((screen.getByTestId("tracker-yaw") as HTMLInputElement).value).toBe("90");
    expect((screen.getByTestId("tracker-scale") as HTMLInputElement).value).toBe("1.5");
    expect((screen.getByTestId("tracker-filter-cutoff") as HTMLInputElement).value).toBe("2.5");
    expect((screen.getByTestId("tracker-filter-beta") as HTMLInputElement).value).toBe("0.2");
    expect((screen.getByTestId("tracker-follow-rotation") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId("tracker-filter-enabled") as HTMLInputElement).checked).toBe(false);
    expect(screen.getByTestId("tracker-trail")).toBeInTheDocument();

    // Legacy producer (no filter fields) → additive defaults in the echo.
    pushTracker({ settings: { yaw_deg: 0, pos_scale: 1, follow_rotation: true } }, 2);
    await waitFor(() =>
      expect(screen.getByTestId("tracker-settings-echo").textContent).toContain(
        "filter on (cutoff 1 Hz, beta 10)",
      ),
    );
    expect((screen.getByTestId("tracker-filter-enabled") as HTMLInputElement).checked).toBe(true);

    // Engaged clutch with a filtered pose → chip shows the arm, filtered row + z.
    pushTracker(
      {
        settings,
        seq: 43,
        clutch: true,
        engaged_arm: "grip",
        pose_filtered: { position: [0.121, 0.209, 1.098], orientation: [1, 0, 0, 0] },
        anchor_tcp: { position: [0.3, 0.0, 0.4], orientation: [1, 0, 0, 0] },
        target_tcp: { position: [0.32, 0.01, 0.4], orientation: [1, 0, 0, 0] },
      },
      3,
    );
    await waitFor(() =>
      expect(screen.getByTestId("tracker-clutch").textContent).toBe(
        "CLUTCH · Manipulation Arm (grip)",
      ),
    );
    expect(screen.getByTestId("pose-anchor").textContent).toContain("0.300");
    expect(screen.getByTestId("pose-filtered").textContent).toContain("0.121, 0.209, 1.098");
    expect(screen.getByTestId("tracker-z").textContent).toBe("1.098 m"); // from pose_filtered

    // Session start → fixed spec: Manipulation Arm first (active by default), streams appear.
    fireEvent.click(screen.getByTestId("session-start"));
    await screen.findByTestId("session-stop");
    expect(posts[0]).toEqual(DEVICES_SESSION_SPEC);
    expect(posts[0]).toMatchObject({
      mode: "teleop",
      kind: "sim",
      arms: ["grip", "view"],
      frames: { grip: "arm_base:grip", view: "arm_base:view" },
      sim_scene: "mavis_v2",
    });
    expect(screen.getByTestId("session-summary").textContent).toContain("mavis_v2");
    expect(screen.getByTestId("session-summary").textContent).toContain(
      "arms Manipulation Arm (grip), Perception Arm (view)",
    );
    expect(screen.getByTestId("stream-sim")).toBeInTheDocument();
    expect(screen.getByTestId("stream-cam0")).toBeInTheDocument();
    // With a session the form is live.
    expect((screen.getByTestId("tracker-yaw") as HTMLInputElement).disabled).toBe(false);
    expect(screen.queryByTestId("tracker-settings-disabled")).toBeNull();
    fireEvent.click(screen.getByTestId("session-stop"));
    await screen.findByTestId("session-start");
    expect(useStore.getState().session).toBeNull();
  }, 15000);

  it("tracker charging chip reflects the controller USB-power state", async () => {
    mount();
    await waitFor(() => expect(useStore.getState().conn.control).toBe("open"));
    pushTracker({ charging: true }, 1);
    await waitFor(() =>
      expect(screen.getByTestId("tracker-charging").textContent).toBe("🔌 charging"),
    );
    pushTracker({ charging: false }, 2);
    await waitFor(() =>
      expect(screen.getByTestId("tracker-charging").textContent).toBe("🔋 battery"),
    );
  });

  it("settings form commits on Enter / blur (never per keystroke), drops out-of-range, toasts nacks", async () => {
    mount();
    await waitFor(() => expect(useStore.getState().conn.control).toBe("open"));
    await waitFor(() => expect(useStore.getState().bindings).not.toBeNull());
    const settings = {
      yaw_deg: 90,
      pos_scale: 1.5,
      follow_rotation: false,
      filter_enabled: false,
      filter_min_cutoff_hz: 2.5,
      filter_beta: 0.2,
    };
    pushTracker({ settings });
    await waitFor(() => expect(screen.getByTestId("tracker-status").textContent).toBe("tracking"));
    fireEvent.click(screen.getByTestId("session-start"));
    await screen.findByTestId("session-stop");
    await waitFor(() =>
      expect((screen.getByTestId("tracker-scale") as HTMLInputElement).disabled).toBe(false),
    );

    // Typing alone sends nothing.
    const scale = screen.getByTestId("tracker-scale") as HTMLInputElement;
    fireEvent.focus(scale);
    fireEvent.change(scale, { target: { value: "2" } });
    await new Promise((r) => setTimeout(r, 60));
    expect(control.actions.length).toBe(0);
    // Echo frames while editing do not clobber the draft.
    pushTracker({ settings }, 5);
    await new Promise((r) => setTimeout(r, 20));
    expect(scale.value).toBe("2");
    // Enter commits exactly one action.
    fireEvent.keyDown(scale, { key: "Enter" });
    await waitFor(() => expect(control.actions.length).toBe(1));
    expect(control.actions[0]).toMatchObject({ name: "tracker_settings", args: { pos_scale: 2 } });
    // Same value again on blur → unchanged vs the draft? No: unchanged vs the ECHO
    // is what is skipped; the echo still says 1.5 so blur re-sends 2 once.
    fireEvent.blur(scale);
    await waitFor(() => expect(control.actions.length).toBe(2));
    // Out of range → dropped and the field snaps back to the echoed value.
    fireEvent.focus(scale);
    fireEvent.change(scale, { target: { value: "9" } });
    fireEvent.blur(scale);
    await waitFor(() => expect(scale.value).toBe("1.5"));
    await new Promise((r) => setTimeout(r, 60));
    expect(control.actions.length).toBe(2);
    // Unchanged vs the echo → nothing sent.
    fireEvent.focus(scale);
    fireEvent.change(scale, { target: { value: "1.5" } });
    fireEvent.keyDown(scale, { key: "Enter" });
    await new Promise((r) => setTimeout(r, 60));
    expect(control.actions.length).toBe(2);

    // Filter fields → the new TrackerSettingsArgs keys.
    const cutoff = screen.getByTestId("tracker-filter-cutoff") as HTMLInputElement;
    fireEvent.focus(cutoff);
    fireEvent.change(cutoff, { target: { value: "3" } });
    fireEvent.blur(cutoff);
    await waitFor(() => expect(control.actions.length).toBe(3));
    expect(control.actions[2]).toMatchObject({
      name: "tracker_settings",
      args: { filter_min_cutoff_hz: 3 },
    });
    const beta = screen.getByTestId("tracker-filter-beta") as HTMLInputElement;
    fireEvent.focus(beta);
    fireEvent.change(beta, { target: { value: "0.5" } });
    fireEvent.keyDown(beta, { key: "Enter" });
    await waitFor(() => expect(control.actions.length).toBe(4));
    expect(control.actions[3]).toMatchObject({
      name: "tracker_settings",
      args: { filter_beta: 0.5 },
    });
    fireEvent.change(beta, { target: { value: "500" } }); // > 200 → dropped on blur
    fireEvent.blur(beta);
    await waitFor(() => expect(beta.value).toBe("0.2"));
    fireEvent.click(screen.getByTestId("tracker-filter-enabled"));
    fireEvent.click(screen.getByTestId("tracker-follow-rotation"));
    await waitFor(() => expect(control.actions.length).toBe(6));
    expect(control.actions[4]).toMatchObject({ args: { filter_enabled: true } });
    expect(control.actions[5]).toMatchObject({ args: { follow_rotation: true } });
    expect(control.actions.every((a) => a.name === "tracker_settings")).toBe(true);

    // Nack → one toast (page-specific, the generic one is suppressed), pending cleared.
    control.ackOk = false;
    control.ackDetail = "tracker backend none";
    const yaw = screen.getByTestId("tracker-yaw") as HTMLInputElement;
    fireEvent.focus(yaw);
    fireEvent.change(yaw, { target: { value: "45" } });
    fireEvent.keyDown(yaw, { key: "Enter" });
    await waitFor(() => expect(control.actions.length).toBe(7));
    const toast = await screen.findByTestId("toast");
    expect(toast.textContent).toBe("tracker_settings rejected: tracker backend none");
    expect(toast.className).toContain("toast-error");
    await new Promise((r) => setTimeout(r, 40));
    expect(screen.getAllByTestId("toast").length).toBe(1);
    expect(useStore.getState().devices.pendingTrackerSettings).toBeNull();
    // Nack without detail still toasts.
    control.ackDetail = "";
    fireEvent.change(yaw, { target: { value: "46" } });
    fireEvent.keyDown(yaw, { key: "Enter" });
    await waitFor(() => expect(screen.getAllByTestId("toast").length).toBe(2));
    expect(screen.getAllByTestId("toast")[1]!.textContent).toBe("tracker_settings rejected");
  }, 15000);

  it("gamepad panel lights raw buttons + mapped actions, auto-arms, feeds the held set, latches on blur", async () => {
    mount();
    await waitFor(() => expect(useStore.getState().conn.control).toBe("open"));
    await waitFor(() => expect(useStore.getState().bindings).not.toBeNull());
    expect(screen.getByTestId("gamepad-connected").textContent).toBe("no gamepad");
    // Secondary input: the panel is a collapsed <details> until a pad connects.
    const panel = screen.getByTestId("gamepad-panel") as HTMLDetailsElement;
    expect(panel.tagName).toBe("DETAILS");
    expect(panel.open).toBe(false);
    expect(screen.getByTestId("gamepad-summary").textContent).toContain("optional");

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
    await waitFor(() => expect(panel.open).toBe(true));
    expect(screen.getByTestId("gamepad-id").textContent).toBe("Xbox Wireless Controller");
    expect(screen.getByTestId("gamepad-mapping").textContent).toContain("standard");
    expect(screen.getByTestId("gp-map-A").textContent).toContain("gripper_open");
    expect(screen.getByTestId("gp-map-RT").textContent).toContain("tracker_clutch");
    expect(screen.getByTestId("gp-map-A").dataset["lit"]).toBe("false");

    buttons[0] = { pressed: true, value: 1 }; // A → KeyH (held)
    await waitFor(() => expect(screen.getByTestId("gp-map-A").dataset["lit"]).toBe("true"));
    expect(screen.getByTestId("gp-btn-0").className).toContain("raw-cell-lit");
    // Armed chip comes from the shared TeleopSurface (same surface as the cockpit).
    const chip = await screen.findByTestId("gamepad-armed-chip");
    expect(chip.textContent).toBe("GAMEPAD");
    expect(screen.getByTestId("teleop-surface")).toContainElement(chip);
    expect(useStore.getState().gamepad.armed).toBe(true);
    await waitFor(() => expect(control.lastHeld).toEqual(["KeyH"]));

    // Blur while A is held → release-all + LATCHED chip; A still down → nothing.
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    await waitFor(() => expect(useStore.getState().gamepad.armed).toBe(false));
    await screen.findByTestId("gamepad-latched");
    await waitFor(() => expect(control.lastHeld).toEqual([]));
    const keysBefore = control.keys.length;
    await new Promise((r) => setTimeout(r, 120));
    expect(control.lastHeld).toEqual([]);
    // The heartbeat keeps running (it is the socket's liveness deadman since
    // 2026-09-07) but every beat while latched must carry an EMPTY held set —
    // A is still physically down and must not reach the server.
    for (const m of control.keys.slice(keysBefore)) {
      expect((m as unknown as { held: string[] }).held).toEqual([]);
    }
    expect(useStore.getState().gamepad.armed).toBe(false);
    // Release → latch lifts; press again → works.
    buttons[0] = { pressed: false, value: 0 };
    await waitFor(() => expect(screen.queryByTestId("gamepad-latched")).toBeNull());
    buttons[0] = { pressed: true, value: 1 };
    await waitFor(() => expect(control.lastHeld).toEqual(["KeyH"]));
    expect(useStore.getState().gamepad.armed).toBe(true);

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

  it("keyboard capture surface: click to arm, KeyC clutch + Tab switch_arm work on the devices page", async () => {
    mount();
    await waitFor(() => expect(useStore.getState().conn.control).toBe("open"));
    await waitFor(() => expect(useStore.getState().bindings).not.toBeNull());
    const surface = screen.getByTestId("teleop-surface");
    expect(surface).toContainElement(screen.getByTestId("no-streams"));
    expect(screen.queryByTestId("capturing-chip")).toBeNull();
    fireEvent.click(surface);
    await screen.findByTestId("capturing-chip");
    expect(useStore.getState().captureArmed).toBe(true);
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { code: "KeyC", cancelable: true, bubbles: true }),
      );
    });
    await waitFor(() => expect(control.lastHeld).toEqual(["KeyC"]));
    // Heartbeat keeps flowing while the clutch is held.
    const n = control.keys.length;
    await new Promise((r) => setTimeout(r, 150));
    expect(control.keys.length).toBeGreaterThanOrEqual(n + 2);
    expect(control.lastHeld).toEqual(["KeyC"]);
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keyup", { code: "KeyC", cancelable: true, bubbles: true }),
      );
    });
    await waitFor(() => expect(control.lastHeld).toEqual([]));
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { code: "Tab", cancelable: true, bubbles: true }),
      );
    });
    await waitFor(() => expect(control.actions.some((a) => a.name === "switch_arm")).toBe(true));
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { code: "Escape", cancelable: true, bubbles: true }),
      );
    });
    await waitFor(() => expect(screen.queryByTestId("capturing-chip")).toBeNull());
    expect(useStore.getState().captureArmed).toBe(false);
  }, 15000);
  it("controller sub-panel: none when null; chips, trigger bar and pad dot from telemetry", async () => {
    mount();
    await waitFor(() => expect(useStore.getState().conn.control).toBe("open"));
    await waitFor(() => expect(useStore.getState().bindings).not.toBeNull());
    expect(screen.getByTestId("controller-status").textContent).toBe("controller: none");

    // Backend reports no controller → explicit null.
    act(() =>
      telemetry.push(
        makeTelemetry({ tracker: makeTracker({ controller: null, device_held: [] }) }),
      ),
    );
    await waitFor(() => expect(screen.getByTestId("tracker-status").textContent).toBe("tracking"));
    expect(screen.getByTestId("controller-status").textContent).toBe("controller: none");
    expect(screen.queryByTestId("controller-trigger-bar")).toBeNull();
    expect(screen.queryByTestId("controller-held")).toBeNull();

    // Trigger pulled + clicked, pad clicked up → KeyC + KeyH injected
    // (plus an unexpected code, shown raw); a menu click fired switch_arm.
    act(() =>
      telemetry.push(
        makeTelemetry({
          seq: 2,
          tracker: makeTracker({
            clutch: true,
            engaged_arm: "grip",
            controller: {
              trigger: 0.63,
              trigger_pressed: true,
              trackpad_touch: true,
              trackpad_click: true,
              trackpad_x: 0.5,
              trackpad_y: 0.6,
              grip: false,
              menu: false,
              system: false,
            },
            device_held: ["KeyC", "KeyH", "F13"],
            device_action: "switch_arm",
          }),
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId("controller-status").textContent).toBe("controller: live"),
    );
    expect(screen.getByTestId("controller-trigger-fill").style.width).toBe("63%"); // jsdom normalises "63.0%"
    expect(screen.getByTestId("controller-trigger-bar").getAttribute("aria-valuenow")).toBe("0.63");
    expect(screen.getByTestId("controller-trigger-value").textContent).toBe("0.63");
    expect(screen.getByTestId("controller-trigger-pressed").dataset["lit"]).toBe("true");
    const dot = screen.getByTestId("controller-pad-dot");
    expect(dot.style.left).toBe("75%"); // x = +0.5 → right of centre
    expect(dot.style.top).toBe("20%"); // y = +0.6 → upper part (+y = top)
    expect(dot.className).toContain("trackpad-dot-click");
    expect(screen.getByTestId("controller-pad-touch").dataset["lit"]).toBe("true");
    expect(screen.getByTestId("controller-pad-click").dataset["lit"]).toBe("true");
    expect(screen.getByTestId("controller-pad-xy").textContent).toBe("x +0.50 · y +0.60");
    expect(screen.getByTestId("controller-grip").dataset["lit"]).toBe("false");
    expect(screen.getByTestId("controller-menu").dataset["lit"]).toBe("false");
    expect(screen.getByTestId("controller-system").dataset["lit"]).toBe("false");
    // device_held codes → lit action chips labelled via the served keymap.
    const clutch = screen.getByTestId("controller-held-tracker_clutch");
    expect(clutch.dataset["lit"]).toBe("true");
    expect(clutch.textContent).toBe("trigger → tracker_clutch (C)");
    expect(clutch.title).toBe("KeyC · tracker clutch (hold)");
    const open = screen.getByTestId("controller-held-gripper_open");
    expect(open.dataset["lit"]).toBe("true");
    expect(open.textContent).toBe("pad ▲ → gripper_open (H)");
    const close = screen.getByTestId("controller-held-gripper_close");
    expect(close.dataset["lit"]).toBe("false");
    expect(close.textContent).toBe("pad ▼ → gripper_close (F)");
    const railNeg = screen.getByTestId("controller-held-rail_neg");
    expect(railNeg.dataset["lit"]).toBe("false");
    expect(railNeg.textContent).toBe("pad ◀ → rail_neg (←)");
    const railPos = screen.getByTestId("controller-held-rail_pos");
    expect(railPos.dataset["lit"]).toBe("false");
    expect(railPos.textContent).toBe("pad ▶ → rail_pos (→)");
    // Discrete row (menu click) lights from device_action, not device_held.
    const next = screen.getByTestId("controller-held-switch_arm");
    expect(next.dataset["lit"]).toBe("true");
    expect(next.textContent).toBe("menu → switch_arm (Tab)");
    // switch_arm_prev has no controller input → no chip.
    expect(screen.queryByTestId("controller-held-switch_arm_prev")).toBeNull();
    const flash = screen.getByTestId("controller-device-action");
    expect(flash.textContent).toBe("switch_arm");
    expect(flash.dataset["lit"]).toBe("true");
    expect(flash.className).toContain("chip-flash");
    const extra = screen.getByTestId("controller-held-F13");
    expect(extra.dataset["lit"]).toBe("true");
    expect(extra.textContent).toBe("F13");

    // Released; grip/menu/system down; stale sample → device_held empty, dot idle at bottom-left.
    act(() =>
      telemetry.push(
        makeTelemetry({
          seq: 3,
          tracker: makeTracker({
            status: "stale",
            controller: {
              trigger: 0,
              trigger_pressed: false,
              trackpad_touch: false,
              trackpad_click: false,
              trackpad_x: -1,
              trackpad_y: -1,
              grip: true,
              menu: true,
              system: true,
            },
            device_held: [],
            device_action: null,
          }),
        }),
      ),
    );
    await waitFor(() => expect(screen.getByTestId("controller-grip").dataset["lit"]).toBe("true"));
    expect(screen.getByTestId("controller-held-switch_arm").dataset["lit"]).toBe("false");
    const cleared = screen.getByTestId("controller-device-action");
    expect(cleared.textContent).toBe("no recent action");
    expect(cleared.dataset["lit"]).toBe("false");
    expect(cleared.className).not.toContain("chip-flash");
    expect(screen.getByTestId("controller-menu").dataset["lit"]).toBe("true");
    expect(screen.getByTestId("controller-system").dataset["lit"]).toBe("true");
    expect(screen.getByTestId("controller-held-tracker_clutch").dataset["lit"]).toBe("false");
    expect(screen.getByTestId("controller-held-gripper_open").dataset["lit"]).toBe("false");
    expect(screen.queryByTestId("controller-held-F13")).toBeNull();
    expect(screen.getByTestId("controller-trigger-fill").style.width).toBe("0%");
    expect(screen.getByTestId("controller-trigger-pressed").dataset["lit"]).toBe("false");
    const idle = screen.getByTestId("controller-pad-dot");
    expect(idle.style.left).toBe("0%");
    expect(idle.style.top).toBe("100%");
    expect(idle.className).toContain("trackpad-dot-idle");
    expect(screen.getByTestId("controller-pad-xy").textContent).toBe("x -1.00 · y -1.00");
  }, 15000);

  it("calibration panel: disabled reasons, yaw chips, opens the wizard which POSTs and toasts 409s", async () => {
    mount();
    await waitFor(() => expect(useStore.getState().conn.control).toBe("open"));
    // No telemetry → both buttons disabled with a reason.
    expect(screen.getByTestId("calibration-open-base_station")).toBeDisabled();
    expect(screen.getByTestId("calibration-open-yaw")).toBeDisabled();
    expect(screen.getByTestId("calibration-disabled").textContent).toBe("No tracker telemetry.");
    expect(screen.getByTestId("calibration-yaw-chip").textContent).toBe("yaw —");
    // Backend none.
    pushTracker({ backend: "none", status: "no_backend", calibration: makeCalibration() }, 1);
    await waitFor(() =>
      expect(screen.getByTestId("calibration-disabled").textContent).toContain("backend is none"),
    );
    // A runtime without the block (fixture omits `calibration`) is disabled too.
    pushTracker({}, 2);
    await waitFor(() =>
      expect(screen.getByTestId("calibration-disabled").textContent).toContain(
        "no calibration state",
      ),
    );
    // yaw_valid false → amber chip; last install date; buttons live.
    pushTracker(
      { calibration: makeCalibration({ yaw_valid: false, base_station_installed_at: 1756900000 }) },
      3,
    );
    await waitFor(() =>
      expect(screen.getByTestId("calibration-yaw-chip").textContent).toBe("yaw alignment needed"),
    );
    expect(screen.getByTestId("calibration-yaw-chip").className).toContain("chip-amber");
    expect(screen.getByTestId("calibration-installed").textContent).toContain("installed");
    expect(screen.getByTestId("calibration-open-yaw")).not.toBeDisabled();
    expect(screen.queryByTestId("calibration-disabled")).toBeNull();
    // 2026-09-07: the fixture backend is `fake`, and the runtime refuses
    // `base_station start` unless it is libsurvive (409 "backend is not
    // libsurvive"), so that button is disabled with its own note instead of
    // handing the operator a 409 toast (13-tracker §5 said so all along).
    expect(screen.getByTestId("calibration-open-base_station")).toBeDisabled();
    expect(screen.getByTestId("calibration-kind-note").textContent).toContain(
      "needs the libsurvive backend",
    );

    // Session → "Stop the session first."
    fireEvent.click(screen.getByTestId("session-start"));
    await screen.findByTestId("session-stop");
    expect(screen.getByTestId("calibration-disabled").textContent).toBe("Stop the session first.");
    expect(screen.getByTestId("calibration-open-base_station")).toBeDisabled();
    expect(screen.getByTestId("calibration-open-yaw")).toBeDisabled();
    fireEvent.click(screen.getByTestId("session-stop"));
    await screen.findByTestId("session-start");
    // yaw aligned chip with a date; a live base_station run marks the other button.
    pushTracker(
      { calibration: makeCalibration({ yaw_valid: true, yaw_calibrated_at: 1756900000 }) },
      4,
    );
    await waitFor(() =>
      expect(screen.getByTestId("calibration-yaw-chip").textContent).toContain("yaw aligned"),
    );
    expect(screen.getByTestId("calibration-yaw-chip").className).toContain("chip-green");
    expect(screen.getByTestId("calibration-installed").textContent).toContain(
      "no install recorded",
    );
    pushTracker(
      { calibration: makeCalibration({ kind: "base_station", phase: "capturing", scenes: 1 }) },
      5,
    );
    await screen.findByTestId("calibration-active");
    expect(screen.getByTestId("calibration-active").textContent).toBe("base_station · capturing");
    expect(screen.getByTestId("calibration-open-yaw")).toBeDisabled();
    expect(screen.getByTestId("calibration-open-base_station").textContent).toContain("Resume");
    // yaw fitted but not applied: the runtime still counts the run as active
    // (session start → 409), so the chip says so and base-station stays blocked.
    pushTracker(
      { calibration: makeCalibration({ kind: "yaw", phase: "done", fitted_yaw_deg: 102.1 }) },
      6,
    );
    await waitFor(() =>
      expect(screen.getByTestId("calibration-active").textContent).toBe("yaw · done, not applied"),
    );
    expect(screen.getByTestId("calibration-open-base_station")).toBeDisabled();
    expect(screen.getByTestId("calibration-open-base_station").title).toBe(
      "yaw calibration in progress",
    );
    expect(screen.getByTestId("calibration-open-yaw").textContent).toContain("Resume");
    pushTracker({ calibration: makeCalibration() }, 7);
    await waitFor(() => expect(screen.queryByTestId("calibration-active")).toBeNull());

    // Open the yaw wizard: dialog semantics, Start → POST body, telemetry drives the step.
    fireEvent.click(screen.getByTestId("calibration-open-yaw"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.dataset["view"]).toBe("intro");
    fireEvent.click(screen.getByTestId("wizard-start"));
    await waitFor(() => expect(calibPosts).toEqual([{ kind: "yaw", op: "start" }]));
    pushTracker(
      { calibration: makeCalibration({ kind: "yaw", phase: "capturing", next_point: "start" }) },
      8,
    );
    await waitFor(() => expect(dialog.dataset["view"]).toBe("points"));
    expect(screen.getByTestId("wizard-next-point").textContent).toBe("START");
    // 409 → error toast with the runtime's detail.
    calib409 = "stop the session first";
    await waitFor(() => expect(screen.getByTestId("wizard-capture")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("wizard-capture"));
    const toast = await screen.findByText("calibration: stop the session first");
    expect(toast.dataset["testid"]).toBe("toast");
    expect(toast.className).toContain("toast-error");
    expect(calibPosts[1]).toEqual({ kind: "yaw", op: "capture" });
    // Close while capturing → abort prompt; Continue keeps the wizard; once the
    // run has ended Escape closes it.
    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    expect(screen.getByTestId("wizard-abort-confirm")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("wizard-abort-cancel"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    pushTracker(
      { calibration: makeCalibration({ kind: "yaw", phase: "aborted", detail: "aborted" }) },
      9,
    );
    await waitFor(() => expect(dialog.dataset["view"]).toBe("failed"));
    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  }, 15000);

  it("base-station calibration is offered only on the libsurvive backend", async () => {
    mount();
    await waitFor(() => expect(useStore.getState().conn.control).toBe("open"));
    // libsurvive: both kinds are live, no per-kind note.
    pushTracker({ backend: "libsurvive", status: "tracking", calibration: makeCalibration() }, 1);
    await waitFor(() =>
      expect(screen.getByTestId("calibration-open-base_station")).not.toBeDisabled(),
    );
    expect(screen.getByTestId("calibration-open-yaw")).not.toBeDisabled();
    expect(screen.queryByTestId("calibration-kind-note")).toBeNull();
    // fake: the yaw gesture still works, the base-station run would 409.
    pushTracker({ backend: "fake", status: "tracking", calibration: makeCalibration() }, 2);
    await waitFor(() => expect(screen.getByTestId("calibration-open-base_station")).toBeDisabled());
    expect(screen.getByTestId("calibration-open-yaw")).not.toBeDisabled();
    expect(screen.getByTestId("calibration-kind-note").textContent).toContain(
      "needs the libsurvive backend",
    );
    expect(screen.queryByTestId("calibration-disabled")).toBeNull(); // not a shared block
  });
});
