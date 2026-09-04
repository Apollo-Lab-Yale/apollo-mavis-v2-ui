/** #/devices — gamepad + Vive-tracker debug page (13-tracker §5). No session
 * loader: device panels work pre-session; streams appear once one exists.
 *
 * The video area sits inside the same click-to-arm `TeleopSurface` as the
 * cockpit, so keyboard teleop (incl. the `KeyC` clutch) works here too; the
 * gamepad adapter rides along via `useGamepad()`. */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getControl, getTelemetry, onAck } from "../api/clients";
import { createSession, endSession, getKeymap, getSession } from "../api/rest";
import type { SessionSpec, TrackerSettingsArgs } from "../gen";
import { buildBindings } from "../input/bindings";
import { useGamepad } from "../input/useGamepad";
import { selectTracker, useStore } from "../store";
import { ConnectionBanner, Toasts } from "../components/ConnectionBanner";
import {
  CalibrationPanel,
  GamepadPanel,
  SessionControls,
  TrackerPanel,
  TrackerSettingsForm,
} from "../components/devices";
import { StreamGrid } from "../components/StreamGrid";
import { TeleopSurface } from "../components/TeleopSurface";
import { TrackerCalibrationWizard, type WizardKind } from "../components/TrackerCalibrationWizard";

/** Fixed debug session (13-tracker §1.1/§5): teleop / sim / mavis_v2. The
 * gripper arm is listed first so it is the active arm by default. */
export const DEVICES_SESSION_SPEC: SessionSpec = {
  mode: "teleop",
  kind: "sim",
  arms: ["grip", "view"],
  frames: { grip: "arm_base:grip", view: "arm_base:view" },
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
  // Calibration wizard (phase-10): which kind is open; the flow state itself
  // lives in telemetry.tracker.calibration, never here.
  const [wizard, setWizard] = useState<WizardKind | null>(null);

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

  // tracker_settings acks: a nack surfaces as a toast (the runtime's detail
  // when present); either way the pending args are cleared.
  useEffect(
    () =>
      onAck((a) => {
        if (a.name !== "tracker_settings") return false;
        const st = useStore.getState();
        st.setDevices({ pendingTrackerSettings: null });
        if (!a.ok) {
          st.addToast(`tracker_settings rejected${a.detail ? `: ${a.detail}` : ""}`, "error");
        }
        return true;
      }),
    [],
  );

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
  const settingsDisabled = controlDown || role === "observer" || !session;
  const settingsReason = !session
    ? "Start a session to tune — tracker_settings needs a running control loop."
    : controlDown
      ? "Control link down."
      : role === "observer"
        ? "Observer role: read-only."
        : undefined;

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
        <TeleopSurface
          enabled={role !== "observer"}
          mode="teleop"
          bindings={bindings}
          control={control}
        >
          {streams.length > 0 ? (
            <StreamGrid streamIds={streams} labels={labels} />
          ) : (
            <div className="tile-empty panel" data-testid="no-streams">
              No session streams — click to arm keyboard capture (KeyC = clutch)
            </div>
          )}
        </TeleopSurface>
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
          disabled={settingsDisabled}
          disabledReason={settingsReason}
          onChange={onSettings}
        />
        <CalibrationPanel tracker={tracker} session={session} onOpen={setWizard} />
      </div>
      {wizard && (
        <TrackerCalibrationWizard
          kind={wizard}
          onClose={() => setWizard(null)}
          onSwitchKind={setWizard}
        />
      )}
      <Toasts />
    </div>
  );
}
