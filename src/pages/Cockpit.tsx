/** Shared mode-page layout (05-ui §8.2). Mode pages are thin wrappers.
 * Phase-09c (hardware sessions): the bring-up progress list above the stream
 * grid until the session is running, the `speed <n>%` badge beside the title
 * (`SessionInfo.speed_scale`) and the frozen-arm hint for every hardware arm
 * the session did NOT include (D1: posed once in the gate twin from its last
 * monitor sample, brakes on — the operator must not move it from Studio).
 * Phase-14 (15-online-dagger §8): a dagger session whose telemetry carries
 * `dagger.online_dagger` is an Online DAgger session — the title reads
 * "Online DAgger · <session_name>", `OnlineDaggerPanel` replaces `DaggerPanel`
 * (it owns the session's actor split), the trainer banner joins the main column
 * and `EpisodeControls` takes only the new-episode reason from the phase; a legacy
 * dagger session (no block) keeps the old panel.
 * Phase-15 (16-gello §11): a `gello` session is titled "GELLO Manipulation"; the
 * ArmIndicator rows are inert with the reason (GELLO drives the Manipulation Arm, the
 * Perception Arm follows the viewpoint node — no `switch_arm` is ever sent, the
 * page-wide Tab shortcut is off), `GelloPanel` (state chip, Pause / Resume, leader
 * rows, viewpoint row) joins the side column and `GelloBanner` the main column, the
 * `ProfileActions` panel stays (R / Go to profile are planned motions that end
 * paused) — no `JointPanel`, no `EpisodeControls`. §12.4: `EpisodeControls` renders
 * ABOVE the clearance readout in collect / dagger so the buttons never depend on it. */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import { getControl, getTelemetry, onAck } from "../api/clients";
import { ApiError, endSession, getKeymap, getProfiles, getWorkcell, returnHome } from "../api/rest";
import type { ProfileInfo } from "../gen";
import { buildBindings, codeForAction, keycapLabel } from "../input/bindings";
import { useGamepad } from "../input/useGamepad";
import { speedLabel } from "../lib/launch";
import { frozenHint } from "../lib/maintenance";
import { getModalHost } from "../lib/modalHost";
import {
  MODE_LABELS,
  orderStreams,
  pageTitle,
  sessionStreamIds,
  streamLabel,
} from "../lib/streams";
import type { Mode } from "../lib/types";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { selectActiveArm, selectFrozenArms, selectHardwareSession, useStore } from "../store";
import { ArmIndicator } from "../components/ArmIndicator";
import { BringupProgress } from "../components/BringupProgress";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ClearanceReadout, CollisionBanner } from "../components/CollisionBanner";
import { ConnectionBanner, Toasts } from "../components/ConnectionBanner";
import { DaggerPanel } from "../components/DaggerPanel";
import { EpisodeControls } from "../components/EpisodeControls";
import { FaultBanner, sessionFaultDetail } from "../components/FaultBanner";
import { GelloBanner, GelloPanel } from "../components/GelloPanel";
import { Icon } from "../components/icons";
import { InferencePanel } from "../components/InferencePanel";
import { JointPanel } from "../components/JointPanel";
import { KeymapOverlay } from "../components/KeymapOverlay";
import {
  newRolloutReason,
  OnlineDaggerBanner,
  OnlineDaggerPanel,
} from "../components/OnlineDaggerPanel";
import { ProfileActions } from "../components/ProfileActions";
import { ProximityFrame } from "../components/proximity";
import { SHEET_EXIT_MS } from "../components/Sheet";
import { StreamGrid } from "../components/StreamGrid";
import { TeleopSurface } from "../components/TeleopSurface";
import { useDelayedUnmount } from "../lib/useDelayedUnmount";

/** Second paragraph of the "arms did not return home" dialog. UFACTORY Studio's live
 * control must never be opened DURING a session (02-hardware §16), so the advice is
 * ordered: end the session first, then move the arms from Studio. */
const STUDIO_HINT =
  "End the session first, then move the arms by hand from UFACTORY Studio — never " +
  "open Studio's live control while a session is running.";

/** Why the ArmIndicator rows cannot switch arms in a GELLO session (16-gello D9). */
export const GELLO_ARM_REASON =
  "GELLO drives the Manipulation Arm; the Perception Arm follows the viewpoint node";

/** True when a keystroke belongs to the element rather than to the page: a text
 * or number box, a textarea, a select, or a contenteditable region. The Cockpit's
 * page-wide shortcuts (keymap overlay, arm switch) all defer to it — a slider is
 * deliberately NOT text entry, so Tab still switches arms from the Joint panel's
 * sliders while it keeps meaning "next field" inside its number boxes. */
function isTextEntry(el: HTMLElement): boolean {
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  return (el as HTMLInputElement).type !== "range";
}

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
  // The capture surface owns the keymap while armed; the page-wide arm-switch
  // shortcut below only runs when it is NOT (see that effect).
  const captureArmed = useStore((s) => s.captureArmed);
  const activeArm = useStore(selectActiveArm);
  // Hardware sessions get the "Clear errors & resume" button; sim faults (if
  // any) are display-only (phase-09b).
  const hardwareSession = useStore(selectHardwareSession);
  // Hardware arms outside `session.arms` (phase-09c D1): frozen in the gate twin.
  const frozenArms = useStore(useShallow(selectFrozenArms));
  const [overlayOpen, setOverlayOpen] = useState(true);
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  // Leaving the cockpit (2026-09-08 operator request): the arms go back to the
  // designated initial condition BEFORE the session is torn down. `leaving` is the
  // in-flight return; `homeFailure` is the sentence to show when they did not get
  // there, which also holds the page until the operator acknowledges it.
  const [leaving, setLeaving] = useState(false);
  const [homeFailure, setHomeFailure] = useState<string | null>(null);
  const failureMounted = useDelayedUnmount(homeFailure !== null, SHEET_EXIT_MS);

  const control = getControl();
  useGamepad(); // gamepad rows ride the same control channel (13-tracker §5)

  /** Tear the session down and go back to the landing page, unconditionally. */
  const teardownAndLeave = useCallback(() => {
    void endSession().finally(() => {
      setSession(null);
      navigate("/");
    });
  }, [navigate, setSession]);

  /** The "End session" / "Terminate session" path: return the arms to the initial
   * condition first (twin-planned, gated, two phases — joints then carriages), and
   * only tear down once they are there. If they are not, STAY on the page and show
   * why: the operator has to know the cell was left mid-air before they walk to it.
   * A missing initial condition is a success (`status: "skipped"`) and leaves
   * straight away, so the flow is unchanged for a workcell that has none. */
  const endSessionWithReturn = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    void returnHome()
      .then((res) => {
        if (res.ok) {
          teardownAndLeave();
          return;
        }
        setHomeFailure(res.detail || "the arms did not reach the initial condition.");
        setLeaving(false);
      })
      .catch((e: unknown) => {
        // Transport / runtime failure (an operational refusal is a 200 with ok:false).
        // A client-side deadline (ApiError status 0) does NOT mean the motion stopped:
        // the runtime's synchronous handler keeps walking the arms, so the detail
        // (RETURN_HOME_TIMEOUT_HINT) tells the operator to wait for them to stop.
        const detail = e instanceof ApiError ? e.detail : String(e);
        setHomeFailure(`the return could not be run: ${detail}`);
        setLeaving(false);
      });
  }, [leaving, teardownAndLeave]);

  // `reset_to_initial` (R) is fire-and-forget server-side: the ack only says the
  // motion started, so surface it. A nack already toasts through the generic handler.
  // A saved / re-designated profile (ok ack) re-reads the list so the Profiles
  // panel's Go-to select and its initial-condition line see it at once.
  useEffect(
    () =>
      onAck((a) => {
        if (
          a.ok &&
          (mode === "teleop" || mode === "gello") &&
          (a.name === "save_profile" || a.name === "set_initial_condition")
        ) {
          getProfiles()
            .then(setProfiles)
            .catch(() => undefined);
        }
        if (a.name !== "reset_to_initial" || !a.ok) return;
        useStore.getState().addToast(a.detail || "returning to the initial condition", "info");
        return true;
      }),
    [mode],
  );

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
    if (mode === "teleop" || mode === "gello") {
      getProfiles()
        .then(setProfiles)
        .catch(() => setProfiles([]));
    }
  }, [mode]);

  // Slash toggles the keymap overlay (client-local, not part of the keymap).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Not an element when the key is dispatched at the window itself.
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target && isTextEntry(target)) return;
      if (e.code === "Slash") {
        e.preventDefault();
        setOverlayOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** Page-wide arm switch on whatever the keymap binds to `switch_arm` (Tab by
   * default), 2026-09-07 at the operator's request. The capture surface already
   * handles that key while armed — but clicking the Joint-control panel disarms
   * it, which is exactly when the operator wants to switch arms without reaching
   * for the Vive controller. So this listener covers the disarmed page and bails
   * out whenever the key legitimately means something else: while capture is
   * armed (`useKeyCapture` would fire it too — one press must not switch twice),
   * inside a text-entry field or a `<dialog>`'s focus trap (Tab = next field /
   * next control there), with a modifier held (Alt-Tab, Ctrl-Tab), and for an
   * observer or a down control link.
   *
   * The switch itself stays server-authoritative: this only sends the action. */
  const switchCode = bindings ? codeForAction(bindings, "switch_arm") : null;
  // GELLO (16-gello D9): the active arm is pinned to the Manipulation Arm and the
  // runtime nacks `switch_arm` — the page never sends it.
  const gello = mode === "gello";
  const canSwitchArm = !captureArmed && !controlDown && role !== "observer" && !gello;
  useEffect(() => {
    if (!switchCode || !canSwitchArm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== switchCode || e.repeat) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (getModalHost() !== null) return;
      // Not an element when the key is dispatched at the window itself.
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target && (isTextEntry(target) || target.closest("dialog") !== null)) return;
      e.preventDefault();
      control.sendAction("switch_arm");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [switchCode, canSwitchArm, control]);

  // Grid order: wrist cameras → environment cameras → "Digital Twin" (sim) → twin
  // (phase-11 §4); ids stay canonical, only the displayed titles change. A hardware
  // session lists no streams on the wire (the previews are adopted, not re-added):
  // tile the wrist cameras + their `_align` overlays (`sessionStreamIds`).
  const streams = orderStreams(sessionStreamIds(session));
  const labels = Object.fromEntries(streams.map((s) => [s, streamLabel(s)]));
  const episode = telemetry?.episode ?? null;
  const recording = episode?.state === "recording";
  const armInfo = workcell?.arms.find((a) => a.arm_id === activeArm?.arm_id) ?? null;
  // Online DAgger (phase-14): present iff the dagger session runs the external trainer shell.
  const onlineDagger = mode === "dagger" ? (telemetry?.dagger?.online_dagger ?? null) : null;
  const title = onlineDagger
    ? `${MODE_LABELS.dagger} · ${onlineDagger.session_name}`
    : MODE_LABELS[mode];
  // Profiles panel (teleop): the Go-to select lists the session's kind; the button
  // is disabled WITH the reason while the runtime would refuse `goto_profile` (or
  // the click could not reach it) — an open episode, a return already in flight,
  // no control link, observer role.
  const profileKind = session?.kind ?? workcell?.kind ?? null;
  const gotoReason =
    role === "observer"
      ? "Observer — read-only"
      : controlDown
        ? "Control link down"
        : leaving
          ? "Returning to the initial condition…"
          : episode?.state === "recording"
            ? "Save or discard the episode first"
            : episode?.state === "saving"
              ? "Wait for the episode to finish saving"
              : episode?.state === "returning"
                ? "Wait for the return to start to finish"
                : gello && telemetry?.gello?.state === "motion"
                  ? "Wait for the current planned motion to finish"
                  : null;

  return (
    <div className="cockpit" data-testid={`cockpit-${mode}`}>
      <div className="cockpit-main">
        <ConnectionBanner />
        {telemetry && <CollisionBanner report={telemetry.collision} stale={telemetryStale} />}
        {telemetry && (
          <FaultBanner
            arms={telemetry.arms}
            sessionState={telemetry.session?.state ?? session?.state ?? null}
            hardware={hardwareSession}
            stale={telemetryStale}
            sessionDetail={sessionFaultDetail(telemetry.session)}
          />
        )}
        {onlineDagger && telemetry?.dagger && <OnlineDaggerBanner dagger={telemetry.dagger} />}
        {gello && telemetry?.gello && <GelloBanner gello={telemetry.gello} />}
        <BringupProgress />
        <TeleopSurface
          enabled={role !== "observer"}
          mode={mode}
          bindings={bindings}
          control={control}
        >
          {/* Twin-proximity ring + chip over the whole grid (05-ui §8.2, 2026-09-07). */}
          <ProximityFrame />
          <StreamGrid streamIds={streams} labels={labels} />
        </TeleopSurface>
        {keymap && (
          <KeymapOverlay
            entries={keymap}
            mode={mode}
            activeArmHasRail={activeArm?.rail_pos_m != null}
            open={overlayOpen}
            onToggle={() => setOverlayOpen((v) => !v)}
            translateFrame={telemetry?.session?.translate_frame ?? null}
          />
        )}
      </div>
      <div className={`side-panel${telemetryStale ? " dim" : ""}`}>
        <div className="panel kv">
          <span className="cockpit-heading">
            <strong data-testid="cockpit-title">{title}</strong>
            {session?.kind === "hardware" && session.speed_scale != null && (
              <span
                className="chip chip-grey speed-badge"
                data-testid="speed-badge"
                data-scale={session.speed_scale}
              >
                speed {speedLabel(session.speed_scale)}
              </span>
            )}
          </span>
          <button onClick={endSessionWithReturn} disabled={leaving} data-testid="end-session">
            {leaving ? "Returning to start…" : "End session"}
          </button>
        </div>
        {telemetry && (
          <ArmIndicator
            arms={telemetry.arms}
            activeArm={telemetry.active_arm}
            disabled={controlDown || role === "observer"}
            shortcut={switchCode && !gello ? keycapLabel(switchCode) : null}
            // GELLO: the rows are inert with the reason — nothing is ever sent.
            disabledReason={gello ? GELLO_ARM_REASON : null}
            // Explicit `arm_id`, not a cycle: a click must land on the arm that
            // was clicked whatever the session's arm order is. Re-selecting the
            // active arm is a no-op server-side (it must not drop a live clutch).
            onSelect={gello ? undefined : (arm_id) => control.sendAction("switch_arm", { arm_id })}
          />
        )}
        {frozenArms.length > 0 && (
          <div className="panel frozen-arms" role="note" data-testid="frozen-arms">
            {frozenArms.map((id) => (
              <div key={id} className="frozen-arm" data-testid={`frozen-hint-${id}`}>
                <Icon name="lock" size={14} />
                <span>{frozenHint(id)}</span>
              </div>
            ))}
          </div>
        )}
        {/* 16-gello §12.4: the episode buttons sit ABOVE the clearance readout so
            the (bounded, scrolling) readout can never push them out of view. */}
        {(mode === "collect" || mode === "dagger") && episode && (
          <EpisodeControls
            episode={episode}
            bindings={bindings}
            disabled={controlDown}
            onAction={(n) => control.sendAction(n)}
            // 15-online-dagger §3: without a live trainer or outside `rollout` the
            // runtime refuses episode_new — say so on the button instead of letting
            // the nack toast explain. The actor split lives in the panel below.
            newEpisodeReason={newRolloutReason(onlineDagger)}
          />
        )}
        {telemetry && <ClearanceReadout clearances={telemetry.clearances} />}
        {gello && telemetry?.gello && (
          <GelloPanel
            gello={telemetry.gello}
            external={telemetry.external}
            bindings={bindings}
            disabled={controlDown}
            readOnly={role === "observer"}
            onAction={(n) => control.sendAction(n)}
          />
        )}
        {mode === "dagger" && telemetry?.dagger && onlineDagger && (
          <OnlineDaggerPanel
            dagger={telemetry.dagger}
            external={telemetry.external}
            episode={episode}
            bindings={bindings}
            disabled={controlDown}
            readOnly={role === "observer"}
            onAction={(n) => control.sendAction(n)}
          />
        )}
        {mode === "dagger" && telemetry?.dagger && !onlineDagger && (
          <DaggerPanel
            dagger={telemetry.dagger}
            external={telemetry.external}
            onAction={(n) => control.sendAction(n)}
          />
        )}
        {mode === "inference" && telemetry?.inference && (
          <InferencePanel
            inference={telemetry.inference}
            external={telemetry.external}
            onTerminate={endSessionWithReturn}
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
          />
        )}
        {(mode === "teleop" || gello) && (
          <ProfileActions
            profiles={profiles}
            kind={profileKind}
            gotoReason={gotoReason}
            onAction={(n, args) => control.sendAction(n, args)}
          />
        )}
      </div>
      {failureMounted && (
        <ConfirmDialog
          open={homeFailure !== null}
          title="Arms did not return home"
          text={`${homeFailure ?? ""} ${STUDIO_HINT}`}
          confirmLabel="End session anyway"
          cancelLabel="Stay in session"
          onConfirm={() => {
            setHomeFailure(null);
            teardownAndLeave();
          }}
          onCancel={() => setHomeFailure(null)}
        />
      )}
      <Toasts />
    </div>
  );
}
