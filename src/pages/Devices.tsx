/** #/devices — gamepad + Vive-tracker debug page (13-tracker §5). No session
 * loader: device panels work pre-session; streams appear once one exists. */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getControl, getTelemetry } from "../api/clients";
import { createSession, endSession, getKeymap, getSession } from "../api/rest";
import type { SessionSpec, TrackerSettingsArgs } from "../gen";
import { buildBindings } from "../input/bindings";
import { useGamepad } from "../input/useGamepad";
import { selectTracker, useStore } from "../store";
import { ConnectionBanner, Toasts } from "../components/ConnectionBanner";
import {
  GamepadPanel,
  SessionControls,
  TrackerPanel,
  TrackerSettingsForm,
} from "../components/devices";
import { StreamGrid } from "../components/StreamGrid";

/** Fixed debug session (13-tracker §5): teleop / sim / mavis_v2, arms view+grip. */
export const DEVICES_SESSION_SPEC: SessionSpec = {
  mode: "teleop",
  kind: "sim",
  arms: ["view", "grip"],
  frames: { view: "arm_base:view", grip: "arm_base:grip" },
  sim_scene: "mavis_v2",
};

export function Devices() {
  const session = useStore((s) => s.session);
  const setSession = useStore((s) => s.setSession);
  const keymap = useStore((s) => s.keymap);
  const bindings = useStore((s) => s.bindings);
  const setKeymap = useStore((s) => s.setKeymap);
  const pad = useStore((s) => s.gamepad);
  const tracker = useStore(selectTracker);
  const devices = useStore((s) => s.devices);
  const setDevices = useStore((s) => s.setDevices);
  const addToast = useStore((s) => s.addToast);
  const role = useStore((s) => s.conn.role);
  const controlDown = useStore((s) => s.conn.control !== "open");
  const [busy, setBusy] = useState(false);

  const control = getControl();
  useGamepad();

  useEffect(() => {
    getTelemetry(); // connect once
  }, []);

  // Deep link: the landing page may not have fetched the keymap / session yet.
  useEffect(() => {
    if (!keymap) {
      getKeymap()
        .then((k) => setKeymap(k, buildBindings(k)))
        .catch(() => undefined);
    }
  }, [keymap, setKeymap]);
  useEffect(() => {
    if (!session) {
      getSession()
        .then((s) => {
          if (s) setSession(s);
        })
        .catch(() => undefined);
    }
    // Only on mount: later session changes come from this page's own buttons.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(async () => {
    setBusy(true);
    try {
      const info = await createSession(DEVICES_SESSION_SPEC);
      setSession(info);
      setDevices({ startedScene: DEVICES_SESSION_SPEC.sim_scene ?? null });
    } catch (e) {
      addToast(`session: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setBusy(false);
    }
  }, [setSession, setDevices, addToast]);

  const stop = useCallback(async () => {
    setBusy(true);
    try {
      await endSession();
    } catch (e) {
      addToast(`session: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setSession(null);
      setDevices({ startedScene: null });
      setBusy(false);
    }
  }, [setSession, setDevices, addToast]);

  const onSettings = useCallback(
    (args: TrackerSettingsArgs) => {
      setDevices({ pendingTrackerSettings: args });
      control.sendAction("tracker_settings", args as Record<string, unknown>);
    },
    [control, setDevices],
  );

  const streams = session?.streams ?? [];
  const labels = Object.fromEntries(streams.map((s) => [s, s]));

  return (
    <div className="devices" data-testid="devices-page">
      <div className="devices-main">
        <div className="kv">
          <strong>Devices — gamepad &amp; tracker</strong>
          <Link to="/" data-testid="nav-home" className="nav-link">
            ◂ Landing
          </Link>
        </div>
        <ConnectionBanner />
        {pad.armed && (
          <span className="chip chip-blue" data-testid="gamepad-armed-chip">
            GAMEPAD ARMED — heartbeat running
          </span>
        )}
        {streams.length > 0 ? (
          <StreamGrid streamIds={streams} labels={labels} />
        ) : (
          <div className="tile-empty panel" data-testid="no-streams">
            No session streams
          </div>
        )}
        <TrackerPanel tracker={tracker} bindings={bindings} />
      </div>
      <div className="side-panel">
        <SessionControls
          session={session}
          scene={devices.startedScene}
          busy={busy}
          onStart={() => void start()}
          onStop={() => void stop()}
        />
        <GamepadPanel pad={pad} bindings={bindings} />
        <TrackerSettingsForm
          settings={tracker?.settings ?? null}
          disabled={controlDown || role === "observer"}
          onChange={onSettings}
        />
      </div>
      <Toasts />
    </div>
  );
}
