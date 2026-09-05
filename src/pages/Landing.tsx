/** Welcome page (05-ui §8.1, phase-11 §4): hero "APOLLO MAVIS V2", the
 * Hardware | Sim tabs (each with its observation grid, status caption and arm
 * cards), Start-from, the single read-only scene, and the four ModeLauncher
 * cards. Teleop launches directly; Data Collection / DAgger / Inference collect
 * task / policy in a LaunchSheet (held mounted for its 160 ms exit after
 * closing). The Hardware tab is always openable: while it
 * is visible `GET /api/workcell?kind=hardware` is polled every 2 s and the four
 * modes are gated on `hardware_ready`. Pure launch logic lives in ../lib/launch
 * (re-exported here for the tests). */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getTelemetry } from "../api/clients";
import {
  createSession,
  getCameras,
  getKeymap,
  getMicrophones,
  getPolicies,
  getProfiles,
  getScenes,
  getWorkcell,
} from "../api/rest";
import type {
  CameraInfo,
  MicrophoneInfo,
  PolicyInfo,
  ProfileInfo,
  SceneInfo,
  SessionInfo,
  WorkcellStatus,
} from "../gen";
import { buildBindings } from "../input/bindings";
import { buildSpec, launcherReason, type LandingSelection } from "../lib/launch";
import {
  APP_EYEBROW,
  APP_SUBTITLE,
  APP_TITLE,
  HARDWARE_CAMERA_SLOTS,
  MIC_ID,
  orderArms,
  pageTitle,
  SCENE_ID,
  SIM_CAMERA_SLOTS,
  TAB_LABELS,
} from "../lib/streams";
import type { FrameRef, Kind, Mode } from "../lib/types";
import { MODES } from "../lib/types";
import { useLingeringValue } from "../lib/useDelayedUnmount";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useRevealOnce } from "../lib/useRevealOnce";
import { useStore } from "../store";
import {
  ArmCards,
  HardwareCaption,
  ObservationGrid,
  SceneSummary,
  simCaption,
  StartFrom,
  type StartFromChoice,
} from "../components/landing";
import { LaunchSheet, type SheetMode } from "../components/LaunchSheet";
import { ModeLauncher } from "../components/ModeLauncher";
import { SegmentedControl, type SegmentedOrigin } from "../components/SegmentedControl";
import { SHEET_EXIT_MS } from "../components/Sheet";
import { Toasts } from "../components/Toasts";

export { buildSpec, launcherReason, REASON, validateLaunch } from "../lib/launch";
export type { LandingSelection } from "../lib/launch";

/** Hardware status poll period while the Hardware tab is visible. */
export const HARDWARE_POLL_MS = 2000;
/** Outgoing tab pane fades for this long (incoming enters over `--dur-fast`). */
export const PANE_LEAVE_MS = 120;

export interface LandingProps {
  /** Test hook — defaults to HARDWARE_POLL_MS. */
  hardwarePollMs?: number;
}

const TAB_OPTIONS = [
  {
    value: "hardware",
    label: TAB_LABELS.hardware,
    testId: "kind-hardware",
    panelId: "pane-hardware",
  },
  { value: "sim", label: TAB_LABELS.sim, testId: "kind-sim", panelId: "pane-sim" },
] as const satisfies readonly { value: Kind; label: string; testId: string; panelId: string }[];

export function Landing({ hardwarePollMs = HARDWARE_POLL_MS }: LandingProps = {}) {
  useDocumentTitle(pageTitle());
  const navigate = useNavigate();
  const workcell = useStore((s) => s.workcell);
  const setWorkcell = useStore((s) => s.setWorkcell);
  const setKeymap = useStore((s) => s.setKeymap);
  const setSession = useStore((s) => s.setSession);
  const addToast = useStore((s) => s.addToast);
  const reveal = useRevealOnce();

  const [tab, setTab] = useState<Kind>("sim");
  const [tabOrigin, setTabOrigin] = useState<SegmentedOrigin>("pointer");
  const [leaving, setLeaving] = useState<Kind | null>(null);
  const [simStatus, setSimStatus] = useState<WorkcellStatus | null>(null);
  const [hardware, setHardware] = useState<WorkcellStatus | null>(null);
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [microphones, setMicrophones] = useState<MicrophoneInfo[]>([]);
  const [simScenes, setSimScenes] = useState<SceneInfo[]>([]);
  const [twinScenes, setTwinScenes] = useState<SceneInfo[]>([]);
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [policies, setPolicies] = useState<PolicyInfo[]>([]);
  const [startFrom, setStartFrom] = useState<StartFromChoice>("keep_current");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [keymapOk, setKeymapOk] = useState(false);
  const [launching, setLaunching] = useState<Mode | null>(null);
  const [sheet, setSheet] = useState<SheetMode | null>(null);
  // The sheet's mode lingers for the exit transition once `sheet` is cleared.
  const sheetShown = useLingeringValue(sheet, SHEET_EXIT_MS);

  const loadKeymap = useCallback(() => {
    getKeymap()
      .then((entries) => {
        setKeymap(entries, buildBindings(entries));
        setKeymapOk(true);
      })
      .catch(() => setKeymapOk(false));
  }, [setKeymap]);

  // Discovery on mount. The legacy GET /api/workcell feeds the store (the
  // Cockpit reads joint limits from it) and picks the default tab.
  useEffect(() => {
    getWorkcell()
      .then((w) => {
        setWorkcell(w);
        setTab(w.kind);
        if (w.kind === "sim") setSimStatus(w);
        else if (w.available_kinds.includes("sim")) {
          getWorkcell("sim")
            .then(setSimStatus)
            .catch(() => setSimStatus(null));
        }
      })
      .catch((e) => addToast(`workcell: ${e instanceof Error ? e.message : String(e)}`, "error"));
    getCameras()
      .then(setCameras)
      .catch(() => setCameras([]));
    getMicrophones()
      .then(setMicrophones)
      .catch(() => setMicrophones([]));
    getScenes("sim")
      .then(setSimScenes)
      .catch(() => setSimScenes([]));
    getScenes("twin")
      .then(setTwinScenes)
      .catch(() => setTwinScenes([]));
    getProfiles()
      .then(setProfiles)
      .catch(() => setProfiles([]));
    getPolicies()
      .then(setPolicies)
      .catch(() => setPolicies([]));
    loadKeymap();
  }, [setWorkcell, addToast, loadKeymap]);

  // Hardware tab: poll the probe-backed status (and camera liveness) every 2 s
  // while the tab is visible; paused while the document is hidden.
  useEffect(() => {
    if (tab !== "hardware") return;
    let alive = true;
    const tick = () => {
      if (document.hidden) return;
      getWorkcell("hardware")
        .then((w) => {
          if (alive) setHardware(w.kind === "hardware" ? w : null);
        })
        .catch(() => {
          if (alive) setHardware(null);
        });
      getCameras()
        .then((c) => {
          if (alive) setCameras(c);
        })
        .catch(() => undefined);
    };
    tick();
    const id = window.setInterval(tick, hardwarePollMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      alive = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [tab, hardwarePollMs]);

  // The microphone's live levels and the read-only hardware monitor (twin
  // overlay notes, the caption's twin segment) ride /ws/telemetry — connect
  // while the Hardware tab is shown.
  const mic = useMemo(
    () => microphones.find((m) => m.mic_id === MIC_ID) ?? microphones[0] ?? null,
    [microphones],
  );
  useEffect(() => {
    if (tab === "hardware") getTelemetry();
  }, [tab]);

  // Preselect the designated initial-condition profile when switching to "profile".
  useEffect(() => {
    if (startFrom === "profile" && profileId === null) {
      const initial = profiles.find((p) => p.is_initial_condition);
      if (initial) setProfileId(initial.profile_id);
    }
  }, [startFrom, profiles, profileId]);

  // Tab switch: pointer → 120 ms crossfade (outgoing pane kept briefly);
  // keyboard → instant, no leaving pane.
  const changeTab = useCallback(
    (next: Kind, origin: SegmentedOrigin) => {
      if (next === tab) return;
      setTabOrigin(origin);
      setLeaving(origin === "pointer" ? tab : null);
      setTab(next);
    },
    [tab],
  );
  useEffect(() => {
    if (leaving === null) return;
    const id = window.setTimeout(() => setLeaving(null), PANE_LEAVE_MS);
    return () => window.clearTimeout(id);
  }, [leaving]);

  // -- Derived selection ------------------------------------------------------------
  const availableKinds = hardware?.available_kinds ?? workcell?.available_kinds ?? [];
  const hardwareConfigured = availableKinds.includes("hardware");
  const hardwareReady = hardware?.hardware_ready ?? workcell?.hardware_ready ?? false;
  const simArms = useMemo(() => simStatus?.arms ?? [], [simStatus]);
  const hardwareArms = useMemo(() => hardware?.arms ?? [], [hardware]);
  const tabArms = tab === "sim" ? simArms : hardwareArms;
  // `SessionSpec.arms` is ordered Manipulation Arm (`grip`) first on both tabs:
  // the runtime activates arms[0], so teleop always starts on the Manipulation Arm.
  const armIds = useMemo(
    () =>
      orderArms(
        tabArms.map((a) => a.arm_id),
        (a) => a,
      ),
    [tabArms],
  );
  const frames = useMemo<Record<string, FrameRef>>(
    () => Object.fromEntries(armIds.map((a) => [a, `arm_base:${a}`])),
    [armIds],
  );
  const simScene = simScenes.find((s) => s.scene_id === SCENE_ID) ?? null;
  const twinScene = twinScenes.find((s) => s.scene_id === SCENE_ID) ?? null;
  const tabSlots: readonly string[] = tab === "sim" ? SIM_CAMERA_SLOTS : HARDWARE_CAMERA_SLOTS;
  const tabCameras = cameras.filter((c) => tabSlots.includes(c.camera_id));
  const promoted = useMemo(() => policies.filter((p) => p.promoted), [policies]);

  const sel: LandingSelection = {
    tab,
    kind: tab,
    arms: armIds,
    frames,
    simScene: tab === "sim" && simScene ? SCENE_ID : null,
    twinScene: tab === "hardware" ? SCENE_ID : null, // the digital twin is implicitly mavis_v2
    startFrom,
    profileId,
    task: "",
    policyId: null,
    keymapOk,
    policiesAvailable: workcell?.policies_available ?? hardware?.policies_available ?? false,
    hardwareReady,
    hardwareConfigured,
  };
  const reasons = Object.fromEntries(
    MODES.map((m) => [m, launcherReason(m, sel, promoted)]),
  ) as Record<Mode, string | null>;

  const onLaunched = (info: SessionInfo) => {
    setSession(info);
    setSheet(null);
    navigate(`/${info.mode}`);
  };
  const launchTeleop = async () => {
    setLaunching("teleop");
    try {
      onLaunched(await createSession(buildSpec("teleop", sel)));
    } catch (e) {
      addToast(`session: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setLaunching(null);
    }
  };
  const onLaunch = (mode: Mode) => {
    if (mode === "teleop") void launchTeleop();
    else setSheet(mode);
  };

  const stagger = (i: number): CSSProperties | undefined =>
    reveal ? ({ "--i": i } as CSSProperties) : undefined;

  const pane = (k: Kind, state: "enter" | "leave") => (
    <section
      key={k}
      id={`pane-${k}`}
      role="tabpanel"
      className={`tab-pane ${state === "leave" ? "pane-leave" : "pane-enter"}`}
      data-tab={k}
      data-instant={state === "enter" && tabOrigin === "keyboard" ? "" : undefined}
      aria-hidden={state === "leave" ? "true" : undefined}
      data-testid={`pane-${k}`}
    >
      <ObservationGrid tab={k} cameras={cameras} microphone={k === "hardware" ? mic : null} />
      <div className="status-caption" data-testid={`status-${k}`} aria-live="polite">
        {k === "sim" ? (
          simCaption(simScene)
        ) : (
          <HardwareCaption
            status={hardware}
            cameras={cameras}
            mic={mic}
            configured={hardwareConfigured}
          />
        )}
      </div>
      <ArmCards
        kind={k}
        arms={k === "sim" ? simArms : hardwareArms}
        configured={k === "sim" ? true : hardwareConfigured}
      />
    </section>
  );

  const profileName = profiles.find((p) => p.profile_id === profileId)?.name ?? null;

  return (
    <div className="landing welcome" data-testid="landing">
      <header className="hero">
        <div className={`hero-text${reveal ? " enter-hero" : ""}`} style={stagger(0)}>
          <div className="text-label fg-3 hero-eyebrow">{APP_EYEBROW}</div>
          <h1 className="text-display hero-title" data-testid="hero-title">
            {APP_TITLE}
          </h1>
          <p className="hero-subtitle" data-testid="hero-subtitle">
            {APP_SUBTITLE}
          </p>
        </div>
        <div className={`hero-actions${reveal ? " enter-fade" : ""}`} style={stagger(1)}>
          <SegmentedControl
            options={TAB_OPTIONS}
            value={tab}
            onChange={changeTab}
            aria-label="Workcell"
            testId="kind-toggle"
          />
          <Link to="/devices" className="btn-ghost btn-sm" data-testid="nav-devices">
            Devices
          </Link>
        </div>
      </header>

      <div className="pane-stack">
        {leaving !== null && leaving !== tab && pane(leaving, "leave")}
        {pane(tab, "enter")}
      </div>

      <section className="section" aria-labelledby="start-from-title">
        <h2 id="start-from-title" className="text-label fg-3 section-title">
          Start from
        </h2>
        <StartFrom
          profiles={profiles}
          arms={armIds}
          startFrom={startFrom}
          onStartFromChange={setStartFrom}
          profileId={profileId}
          onProfileChange={setProfileId}
        />
      </section>

      <section className="section" aria-label="Scene">
        <SceneSummary
          kind={tab === "hardware" ? "twin" : "sim"}
          scene={tab === "hardware" ? (twinScene ?? simScene) : simScene}
        />
      </section>

      <section className="section" aria-labelledby="modes-title">
        <h2 id="modes-title" className="text-label fg-3 section-title">
          Modes
        </h2>
        <ModeLauncher
          reasons={reasons}
          launching={launching}
          launchingLabel={startFrom === "profile" ? "Planning safe path…" : "Starting…"}
          onLaunch={onLaunch}
          onRetryKeymap={loadKeymap}
          reveal={reveal}
        />
      </section>

      {sheetShown !== null && (
        <LaunchSheet
          key={sheetShown}
          mode={sheetShown}
          open={sheet !== null}
          sel={sel}
          policies={policies}
          cameras={tabCameras}
          profileName={profileName}
          onLaunched={onLaunched}
          onClose={() => setSheet(null)}
        />
      )}
      <Toasts />
    </div>
  );
}
