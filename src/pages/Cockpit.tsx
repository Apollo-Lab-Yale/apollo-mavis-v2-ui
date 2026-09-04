/** Shared mode-page layout (05-ui §8.2). Mode pages are thin wrappers. */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getControl, getTelemetry } from "../api/clients";
import { endSession, getKeymap, getProfiles, getWorkcell } from "../api/rest";
import type { ProfileInfo } from "../gen";
import { buildBindings } from "../input/bindings";
import { useGamepad } from "../input/useGamepad";
import { MODE_LABELS, orderStreams, pageTitle, streamLabel } from "../lib/streams";
import type { Mode } from "../lib/types";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { selectActiveArm, useStore } from "../store";
import { ArmIndicator } from "../components/ArmIndicator";
import { ClearanceReadout, CollisionBanner } from "../components/CollisionBanner";
import { ConnectionBanner, Toasts } from "../components/ConnectionBanner";
import { DaggerPanel } from "../components/DaggerPanel";
import { EpisodeControls } from "../components/EpisodeControls";
import { InferencePanel } from "../components/InferencePanel";
import { JointPanel } from "../components/JointPanel";
import { KeymapOverlay } from "../components/KeymapOverlay";
import { ProfileActions } from "../components/ProfileActions";
import { StreamGrid } from "../components/StreamGrid";
import { TeleopSurface } from "../components/TeleopSurface";

export function Cockpit({ mode }: { mode: Mode }) {
  useDocumentTitle(pageTitle(MODE_LABELS[mode]));
  const navigate = useNavigate();
  const session = useStore((s) => s.session);
  const workcell = useStore((s) => s.workcell);
  const bindings = useStore((s) => s.bindings);
  const keymap = useStore((s) => s.keymap);
  const setKeymap = useStore((s) => s.setKeymap);
  const setWorkcell = useStore((s) => s.setWorkcell);
  const setSession = useStore((s) => s.setSession);
  const telemetry = useStore((s) => s.telemetry);
  const telemetryStale = useStore((s) => s.telemetryStale);
  const role = useStore((s) => s.conn.role);
  const controlDown = useStore((s) => s.conn.control !== "open");
  const activeArm = useStore(selectActiveArm);
  const [overlayOpen, setOverlayOpen] = useState(true);
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);

  const control = getControl();
  useGamepad(); // gamepad rows ride the same control channel (13-tracker §5)

  useEffect(() => {
    getTelemetry(); // connect once
  }, []);

  // Deep-link support: fetch keymap/workcell/profiles if the landing page didn't.
  useEffect(() => {
    if (!keymap) {
      getKeymap()
        .then((k) => setKeymap(k, buildBindings(k)))
        .catch(() => undefined);
    }
  }, [keymap, setKeymap]);
  useEffect(() => {
    if (!workcell) {
      getWorkcell()
        .then(setWorkcell)
        .catch(() => undefined);
    }
  }, [workcell, setWorkcell]);
  useEffect(() => {
    if (mode === "teleop") {
      getProfiles()
        .then(setProfiles)
        .catch(() => setProfiles([]));
    }
  }, [mode]);

  // Slash toggles the keymap overlay (client-local, not part of the keymap).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.code === "Slash") {
        e.preventDefault();
        setOverlayOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Grid order: wrist cameras → environment cameras → "Digital Twin" (sim) → twin
  // (phase-11 §4); ids stay canonical, only the displayed titles change.
  const streams = orderStreams(session?.streams ?? []);
  const labels = Object.fromEntries(streams.map((s) => [s, streamLabel(s)]));
  const episode = telemetry?.episode ?? null;
  const recording = episode?.state === "recording";
  const armInfo = workcell?.arms.find((a) => a.arm_id === activeArm?.arm_id) ?? null;

  return (
    <div className="cockpit" data-testid={`cockpit-${mode}`}>
      <div className="cockpit-main">
        <ConnectionBanner />
        {telemetry && <CollisionBanner report={telemetry.collision} stale={telemetryStale} />}
        <TeleopSurface
          enabled={role !== "observer"}
          mode={mode}
          bindings={bindings}
          control={control}
        >
          <StreamGrid streamIds={streams} labels={labels} />
        </TeleopSurface>
        {keymap && (
          <KeymapOverlay
            entries={keymap}
            mode={mode}
            activeArmHasRail={activeArm?.rail_pos_m != null}
            open={overlayOpen}
            onToggle={() => setOverlayOpen((v) => !v)}
          />
        )}
      </div>
      <div className={`side-panel${telemetryStale ? " dim" : ""}`}>
        <div className="panel kv">
          <strong data-testid="cockpit-title">{MODE_LABELS[mode]}</strong>
          <button
            onClick={() => {
              void endSession().finally(() => {
                setSession(null);
                navigate("/");
              });
            }}
            data-testid="end-session"
          >
            End session
          </button>
        </div>
        {telemetry && <ArmIndicator arms={telemetry.arms} activeArm={telemetry.active_arm} />}
        {telemetry && <ClearanceReadout clearances={telemetry.clearances} />}
        {(mode === "collect" || mode === "dagger") && episode && (
          <EpisodeControls
            episode={episode}
            disabled={controlDown}
            onAction={(n) => control.sendAction(n)}
          />
        )}
        {mode === "dagger" && telemetry?.dagger && (
          <DaggerPanel dagger={telemetry.dagger} onAction={(n) => control.sendAction(n)} />
        )}
        {mode === "inference" && telemetry?.inference && (
          <InferencePanel
            inference={telemetry.inference}
            onTerminate={() => {
              void endSession().finally(() => {
                setSession(null);
                navigate("/");
              });
            }}
          />
        )}
        {mode === "teleop" && activeArm && (
          <JointPanel
            arm={activeArm}
            limits={(armInfo?.joint_limits ?? []) as [number, number][]}
            disabled={recording || controlDown}
            onJog={(positions) =>
              control.sendAction("joint_target", {
                arm_id: activeArm.arm_id,
                positions,
                mode: "jog",
              })
            }
            onGoto={(positions) =>
              control.sendAction("joint_target", {
                arm_id: activeArm.arm_id,
                positions,
                mode: "goto",
              })
            }
          />
        )}
        {mode === "teleop" && (
          <ProfileActions profiles={profiles} onAction={(n, args) => control.sendAction(n, args)} />
        )}
      </div>
      <Toasts />
    </div>
  );
}
