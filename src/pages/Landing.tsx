/** Welcome page (05-ui §8.1, phase-11 §4): hero "APOLLO MAVIS V2", the
 * Hardware | Sim tabs (each with its observation grid, status caption and arm
 * cards), Start-from, the single read-only scene, and the four ModeLauncher
 * cards. Teleop launches directly; Data Collection / Inference collect task /
 * policy in a LaunchSheet, Online DAgger opens the two-view `OnlineDaggerSheet`
 * (phase-14; 15-online-dagger §8) — both held mounted for their 160 ms exit after
 * closing. `GET /api/datasets/layout` is read once so the sheets preview the REAL
 * dataset folders. The Hardware tab is always openable: while it
 * is visible `GET /api/workcell?kind=hardware` is polled every 2 s and the four
 * modes are gated on `hardware_ready`. Phase-09c: the Hardware tab owns the
 * **Speed** 10 % / 50 % / 100 % control (default 100 % since 2026-09-08) →
 * `SessionSpec.speed_scale`; the launchers add the rail-homed /
 * homing-in-progress / arm-eligibility reasons from the read-only monitor
 * (phase-09d: for ANY arm, named — `SessionSpec.arms` is every arm of the
 * hardware workcell, the "Include in session" switch is gone), Online DAgger and
 * Inference read "teleop and data collection only for now" (collect is admitted
 * on hardware since 2026-09-07), and the bring-up progress list appears under
 * the launchers while the POST is pending. Below the mode cards the
 * **DatasetsPanel** (2026-09-07; 05-ui §8.1 item 7) lists the recorded datasets
 * of the tab's kind with per-episode deletion, the LeRobot v3 export and the
 * dataset delete; it re-reads after every action and whenever
 * `telemetry.episode.total_episodes` changes. The hero's quiet **Debug** link
 * opens `#/devices` (gamepad + tracker). Pure launch logic lives in
 * ../lib/launch (re-exported here for the tests). */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import { getControl, getTelemetry } from "../api/clients";
import {
  createSession,
  deleteDataset,
  deleteEpisode,
  deleteProfile,
  exportDataset,
  getCameras,
  getDatasetLayout,
  getDatasets,
  getKeymap,
  getMicrophones,
  getPolicies,
  getProfiles,
  getScenes,
  getWorkcell,
} from "../api/rest";
import type {
  CameraInfo,
  DatasetInfo,
  DatasetLayoutInfo,
  MicrophoneInfo,
  PolicyInfo,
  ProfileInfo,
  SceneInfo,
  SessionInfo,
  TrackerSettingsArgs,
  WorkcellStatus,
} from "../gen";
import { buildBindings } from "../input/bindings";
import {
  buildSpec,
  DEFAULT_SPEED_SCALE,
  DEFAULT_SPEED_VALUE,
  launcherReason,
  SPEED_OPTIONS,
  type LandingSelection,
  type SpeedValue,
} from "../lib/launch";
import { sessionGate, type SessionGate } from "../lib/maintenance";
import {
  hasInitialCondition as hasInitialConditionFor,
  profileDeleteErrorText,
  profilesForKind,
} from "../lib/profiles";
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
import {
  SETTING_TAB,
  tabKind,
  type FrameRef,
  type Kind,
  type Mode,
  type TabKey,
} from "../lib/types";
import { MODES } from "../lib/types";
import { useLingeringValue } from "../lib/useDelayedUnmount";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useRevealOnce } from "../lib/useRevealOnce";
import {
  selectMaintenanceBusy,
  selectMonitorArm,
  selectTracker,
  useStore,
  type AppState,
} from "../store";
import { BringupProgress } from "../components/BringupProgress";
import { ControllerPill, useControllerLink } from "../components/controller";
import {
  ArmCards,
  HardwareCaption,
  ObservationGrid,
  SceneSummary,
  simCaption,
  StartFrom,
  type StartFromChoice,
} from "../components/landing";
import { externalPolicyAttached } from "../components/externalPolicy";
import { LaunchSheet, type SheetMode } from "../components/LaunchSheet";
import { OnlineDaggerSheet } from "../components/OnlineDaggerSheet";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DatasetsPanel } from "../components/DatasetsPanel";
import { ModeLauncher } from "../components/ModeLauncher";
import { SegmentedControl, type SegmentedOrigin } from "../components/SegmentedControl";
import { SettingPane } from "../components/setting";
import { SHEET_EXIT_MS } from "../components/Sheet";
import { Toasts } from "../components/Toasts";
import {
  isCalibrationActive,
  TrackerCalibrationWizard,
  type WizardKind,
} from "../components/TrackerCalibrationWizard";

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

// The two workcell tabs plus the device **Setting** tab (2026-09-07). Setting is
// LAST so the existing keyboard order (ArrowLeft from Sim = Hardware) is intact,
// and it is not a `Kind`: it launches nothing.
const TAB_OPTIONS = [
  {
    value: "hardware",
    label: TAB_LABELS.hardware,
    testId: "kind-hardware",
    panelId: "pane-hardware",
  },
  { value: "sim", label: TAB_LABELS.sim, testId: "kind-sim", panelId: "pane-sim" },
  {
    value: SETTING_TAB,
    label: TAB_LABELS.setting,
    testId: "kind-setting",
    panelId: "pane-setting",
  },
] as const satisfies readonly { value: TabKey; label: string; testId: string; panelId: string }[];

/** Hardware-tab Speed segments (phase-09c D2), testids `speed-10` / `speed-50` / `speed-100`. */
const SPEED_TAB_OPTIONS = SPEED_OPTIONS.map((o) => ({
  value: o.value,
  label: o.label,
  testId: `speed-${o.label.replace("%", "")}`,
}));

const TAB_STORAGE_KEY = "mavis.welcome.tab";
const readStoredTab = (): TabKey | null => {
  try {
    const v = localStorage.getItem(TAB_STORAGE_KEY);
    return v === "hardware" || v === "sim" || v === SETTING_TAB ? v : null;
  } catch {
    return null;
  }
};
const storeTab = (tab: TabKey): void => {
  try {
    localStorage.setItem(TAB_STORAGE_KEY, tab);
  } catch {
    /* storage unavailable: the tab simply is not remembered */
  }
};

export function Landing({ hardwarePollMs = HARDWARE_POLL_MS }: LandingProps = {}) {
  useDocumentTitle(pageTitle());
  const navigate = useNavigate();
  const workcell = useStore((s) => s.workcell);
  const setWorkcell = useStore((s) => s.setWorkcell);
  const setKeymap = useStore((s) => s.setKeymap);
  const setSession = useStore((s) => s.setSession);
  const addToast = useStore((s) => s.addToast);
  const reveal = useRevealOnce();
  // Setting tab (2026-09-07): the tracker block, the served keymap (so the button
  // self-test can name the injected codes) and the control-link role, which
  // decides whether the live tracker fields can be sent.
  const tracker = useStore(selectTracker);
  const bindings = useStore((s) => s.bindings);
  const session = useStore((s) => s.session);
  const controlOpen = useStore((s) => s.conn.control === "open");
  const role = useStore((s) => s.conn.role);
  const controllerLinkNow = useControllerLink();

  // The chosen tab survives reloads (Chrome discards idle tabs and reloads them
  // on focus; a runtime restart sends the page back to "#/"): localStorage.
  const [tab, setTab] = useState<TabKey>(() => readStoredTab() ?? "sim");
  const [tabOrigin, setTabOrigin] = useState<SegmentedOrigin>("pointer");
  const [leaving, setLeaving] = useState<TabKey | null>(null);
  const [simStatus, setSimStatus] = useState<WorkcellStatus | null>(null);
  const [hardware, setHardware] = useState<WorkcellStatus | null>(null);
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [microphones, setMicrophones] = useState<MicrophoneInfo[]>([]);
  const [simScenes, setSimScenes] = useState<SceneInfo[]>([]);
  const [twinScenes, setTwinScenes] = useState<SceneInfo[]>([]);
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [policies, setPolicies] = useState<PolicyInfo[]>([]);
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  // Where the namespaces live (15-online-dagger §7): null until answered / on an older runtime.
  const [layout, setLayout] = useState<DatasetLayoutInfo | null>(null);
  const [startFrom, setStartFrom] = useState<StartFromChoice>("keep_current");
  const [profileId, setProfileId] = useState<string | null>(null);
  // Profile deletion (2026-09-07): the row clicked, held while its confirm Sheet
  // runs the 160 ms exit, plus the id whose DELETE is in flight.
  const [deleting, setDeleting] = useState<ProfileInfo | null>(null);
  const deletingShown = useLingeringValue(deleting, SHEET_EXIT_MS);
  const [deleteBusy, setDeleteBusy] = useState<string | null>(null);
  const [keymapOk, setKeymapOk] = useState(false);
  // Phase-09c Hardware-tab session shape: the Speed segment (phase-09d: the
  // arm set is not a choice any more — every hardware arm joins the session).
  const [speed, setSpeed] = useState<SpeedValue>(DEFAULT_SPEED_VALUE);
  const [launching, setLaunching] = useState<Mode | null>(null);
  const [sheet, setSheet] = useState<SheetMode | null>(null);
  // The sheet's mode lingers for the exit transition once `sheet` is cleared.
  const sheetShown = useLingeringValue(sheet, SHEET_EXIT_MS);
  // Calibration wizard (phase-10) hosted here too, so the Setting tab reaches the
  // same flows as the Debug page; the flow state itself lives in telemetry.
  const [wizard, setWizard] = useState<WizardKind | null>(null);
  const wizardShown = useLingeringValue(wizard, SHEET_EXIT_MS);

  /** The profile list is server state: re-read it after a delete instead of
   * splicing locally, so a failed DELETE cannot leave a phantom row. */
  const loadProfiles = useCallback(() => {
    getProfiles()
      .then(setProfiles)
      .catch(() => setProfiles([]));
  }, []);

  /** The dataset list is server state too (04-runtime §10.6): re-read after every
   * dataset action and whenever the running session saved / discarded an episode. */
  const loadDatasets = useCallback(() => {
    getDatasets()
      .then(setDatasets)
      .catch(() => setDatasets([]));
  }, []);
  useEffect(() => {
    getDatasetLayout()
      // Shape-checked: a runtime without the route may answer the list instead.
      .then((l) => setLayout(l && typeof l === "object" && "namespaces" in l ? l : null))
      .catch(() => setLayout(null));
  }, []);
  // Online DAgger sheet (phase-14): the Dora bridge / policy-node attachment and, for
  // the rare "an Online DAgger session is running" case, its trainer status.
  const external = useStore((s) => s.telemetry?.external ?? null);
  const onlineDaggerStatus = useStore((s) => s.telemetry?.dagger?.online_dagger ?? null);
  const totalEpisodes = useStore((s) => s.telemetry?.episode?.total_episodes ?? null);
  const exportProgress = useStore((s) => s.telemetry?.datasets?.export ?? null);
  const exportPhase = exportProgress?.phase ?? null;
  const inUseRepoId = useStore((s) => s.telemetry?.episode?.repo_id ?? null);
  // 2026-09-09 (04-runtime §13.3): the live session's id straight off telemetry. This
  // page never opens /ws/control and its store `session` is empty on a fresh load, so
  // this is how it knows a session is running — the Playback dialog needs it to decide
  // whether to bring one up itself or use the one that is there.
  const liveSessionId = useStore((s) => s.telemetry?.session?.session_id ?? null);
  useEffect(() => {
    loadDatasets();
  }, [loadDatasets, totalEpisodes, exportPhase]);

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
        if (readStoredTab() === null) setTab(w.kind);
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
    loadProfiles();
    getPolicies()
      .then(setPolicies)
      .catch(() => setPolicies([]));
    loadKeymap();
  }, [setWorkcell, addToast, loadKeymap, loadProfiles]);

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
      getMicrophones() // the mic tile must come back after a runtime restart, not only on mount
        .then((m) => {
          if (alive) setMicrophones(m);
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
  // Every tab shows the controller link, and the Setting tab reads the whole
  // tracker block, so the telemetry socket is opened unconditionally (the client
  // is an idempotent singleton shared with the Cockpit).
  useEffect(() => {
    getTelemetry();
  }, []);

  // Tab switch: pointer → 120 ms crossfade (outgoing pane kept briefly);
  // keyboard → instant, no leaving pane.
  const changeTab = useCallback(
    (next: TabKey, origin: SegmentedOrigin) => {
      if (next === tab) return;
      setTabOrigin(origin);
      setLeaving(origin === "pointer" ? tab : null);
      setTab(next);
      storeTab(next);
    },
    [tab],
  );

  // Device lists are re-read whenever the page becomes visible again (both
  // tabs): a runtime restart or an outage while the tab was in the background
  // must not leave stale "no signal" tiles or a missing microphone tile behind.
  useEffect(() => {
    const refresh = () => {
      if (document.hidden) return;
      getCameras()
        .then(setCameras)
        .catch(() => undefined);
      getMicrophones()
        .then(setMicrophones)
        .catch(() => undefined);
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);
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
  const kind = tabKind(tab); // null on the Setting tab (no workcell, no launch)
  const settingTab = kind === null;
  // useMemo: the Setting tab's empty list would otherwise be a fresh array every
  // render and re-run every downstream memo (react-hooks/exhaustive-deps).
  const tabArms = useMemo(
    () => (kind === "sim" ? simArms : kind === "hardware" ? hardwareArms : []),
    [kind, simArms, hardwareArms],
  );
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
  // Hardware tab (phase-09c/09d): every hardware arm's eligibility gate from
  // the read-only monitor (a flat id → gate record, so a 25 Hz telemetry tick
  // re-renders the page only when a gate flips), and the homing-in-flight flag.
  const hardwareArmIds = useMemo(
    () =>
      orderArms(
        hardwareArms.map((a) => a.arm_id),
        (a) => a,
      ),
    [hardwareArms],
  );
  const gates = useStore(
    useShallow((s: AppState): Record<string, SessionGate> =>
      Object.fromEntries(
        hardwareArms.map((a) => [a.arm_id, sessionGate(selectMonitorArm(a.arm_id)(s), a)]),
      ),
    ),
  );
  const homingInProgress = useStore(selectMaintenanceBusy);
  const speedScale = SPEED_OPTIONS.find((o) => o.value === speed)?.scale ?? DEFAULT_SPEED_SCALE;
  const simScene = simScenes.find((s) => s.scene_id === SCENE_ID) ?? null;
  const twinScene = twinScenes.find((s) => s.scene_id === SCENE_ID) ?? null;
  const tabSlots: readonly string[] = kind === "sim" ? SIM_CAMERA_SLOTS : HARDWARE_CAMERA_SLOTS;
  const tabCameras = cameras.filter((c) => tabSlots.includes(c.camera_id));
  const promoted = useMemo(() => policies.filter((p) => p.promoted), [policies]);

  const hardwareTab = kind === "hardware";
  // On the Setting tab nothing launches (the Start-from / Scene / Modes sections
  // are not rendered), so the selection falls back to the Sim shape: it is only
  // read by the launchers.
  const selKind: Kind = kind ?? "sim";
  // The Start-from list shows the tab's profiles only (`StartFrom` filters with the
  // same helper), so the selection must be one of them: a selected row that the
  // current tab hides (the other kind's initial condition, say) is dropped, and the
  // designated initial condition OF THIS TAB'S KIND is preselected when "Load a
  // profile" is chosen (or the selection was just cleared).
  const visibleProfiles = useMemo(() => profilesForKind(profiles, selKind), [profiles, selKind]);
  useEffect(() => {
    if (profileId !== null && !visibleProfiles.some((p) => p.profile_id === profileId)) {
      setProfileId(null);
    }
  }, [profileId, visibleProfiles]);
  useEffect(() => {
    if (startFrom === "profile" && profileId === null) {
      const initial = visibleProfiles.find((p) => p.is_initial_condition);
      if (initial) setProfileId(initial.profile_id);
    }
  }, [startFrom, visibleProfiles, profileId]);
  const sel: LandingSelection = {
    tab: selKind,
    kind: selKind,
    arms: armIds,
    frames,
    simScene: kind === "sim" && simScene ? SCENE_ID : null,
    twinScene: hardwareTab ? SCENE_ID : null, // the digital twin is implicitly mavis_v2
    startFrom,
    profileId,
    task: "",
    policyId: null,
    keymapOk,
    policiesAvailable: workcell?.policies_available ?? hardware?.policies_available ?? false,
    hardwareReady,
    hardwareConfigured,
    // 2026-09-12: the HARDWARE workcell's `policy_modes` (never the default / sim
    // response, which is always true) opens DAgger / Inference on the Hardware tab.
    policyModes: hardware?.policy_modes ?? false,
    // Both wizards are reachable from the Setting tab now, and the runtime 409s
    // any session while one is live — say so on the launcher instead.
    calibrationActive: isCalibrationActive(tracker?.calibration),
    // 2026-09-11: an attached external policy node makes Inference launchable with
    // no promoted checkpoint (`launcherReason` probes the source the sheet defaults
    // to); the Online DAgger sheet judges the same telemetry as `trainerAttached`.
    externalAttached: externalPolicyAttached(external),
    ...(hardwareTab
      ? {
          speedScale,
          unhomedRailArms: hardwareArmIds.filter((a) => gates[a] === "rail_unhomed"),
          armsNotReady: hardwareArmIds.filter(
            (a) => gates[a] === "monitor_off" || gates[a] === "error",
          ),
          homingInProgress,
        }
      : {}),
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

  // The Welcome page NEVER OPENS /ws/control. The runtime hands the writer role
  // to the FIRST connection and demotes every later one to observer, so claiming
  // it here could silently take teleop away from the Cockpit tab the operator
  // drives with. The live tracker fields are therefore enabled only when a
  // control socket is ALREADY open in this tab (the operator came from the
  // Cockpit); otherwise they display the echoed values read-only and say where
  // to tune. `getControl()` below is reached only in that state, so it returns
  // the existing client and never dials.
  const settingsDisabled = !session || !controlOpen || role === "observer";
  const settingsReason = !session
    ? "Start a session to tune the live values — tracker_settings needs a running control loop. Yaw alignment above works without one."
    : !controlOpen
      ? "Live tuning needs the control link — tune from the Cockpit or the Debug page."
      : role === "observer"
        ? "Observer role: read-only."
        : undefined;
  const onSettings = useCallback(
    (args: TrackerSettingsArgs) => {
      if (!controlOpen) return; // never dial /ws/control from the Welcome page
      getControl().sendAction("tracker_settings", args as Record<string, unknown>);
    },
    [controlOpen],
  );

  const stagger = (i: number): CSSProperties | undefined =>
    reveal ? ({ "--i": i } as CSSProperties) : undefined;

  const paneShell = (k: TabKey, state: "enter" | "leave", children: ReactNode) => (
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
      {children}
    </section>
  );

  const workcellPane = (k: Kind) => (
    <>
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
      {/* Controller link, on BOTH workcell tabs: teleop needs it whatever the
          workcell is. Deliberately a sibling of the status caption, never inside
          it — that caption's text is the workcell's own summary. */}
      <ControllerPill
        link={controllerLinkNow}
        tab={k}
        onOpenSetting={() => changeTab(SETTING_TAB, "pointer")}
      />
      <ArmCards
        kind={k}
        arms={k === "sim" ? simArms : hardwareArms}
        configured={k === "sim" ? true : hardwareConfigured}
      />
      {k === "hardware" && (
        <div className="session-controls" data-testid="session-controls">
          <span className="text-label fg-3" id="speed-label">
            Speed
          </span>
          <SegmentedControl
            options={SPEED_TAB_OPTIONS}
            value={speed}
            onChange={(v) => setSpeed(v)}
            aria-labelledby="speed-label"
            className="segmented-compact"
            testId="speed-control"
          />
          <span className="text-caption fg-3 session-controls-help">
            Scales every velocity cap of the session · 10% for a first run in a new posture
          </span>
        </div>
      )}
    </>
  );

  // Setting tab (2026-09-07): device set-up only — no observation grid, no arm
  // cards, and the launch sections below the panes are hidden while it is open.
  const settingPane = () => (
    <SettingPane
      tracker={tracker}
      session={session}
      bindings={bindings}
      onOpenWizard={setWizard}
      settingsDisabled={settingsDisabled}
      settingsReason={settingsReason}
      onSettings={onSettings}
    />
  );

  const pane = (k: TabKey, state: "enter" | "leave") =>
    paneShell(k, state, k === SETTING_TAB ? settingPane() : workcellPane(k));

  /** Confirmed delete: DELETE, then re-read the list and clear the selection if
   * the deleted profile was the one selected. The runtime refuses (409) to delete
   * the designated initial-condition profile — the toast says so in the operator's
   * words (`profileDeleteErrorText`; the runtime's text is the fallback). */
  const confirmDelete = useCallback(
    (p: ProfileInfo) => {
      setDeleteBusy(p.profile_id);
      deleteProfile(p.profile_id)
        .then(() => {
          setDeleting(null);
          setProfileId((cur) => (cur === p.profile_id ? null : cur));
          addToast(`Deleted profile '${p.name}'`, "info");
          loadProfiles();
        })
        .catch((e) => addToast(profileDeleteErrorText(p, e), "error"))
        .finally(() => setDeleteBusy(null));
    },
    [addToast, loadProfiles],
  );

  const profileName = profiles.find((p) => p.profile_id === profileId)?.name ?? null;
  // The return target falls back to the initial condition OF THE SELECTED KIND
  // (ProfileInfo.workcell_kind, 2026-09-07). A kind-less designated row (older
  // runtime) counts like the list badges it: `profilesForKind` shows it on both tabs.
  const hasInitialCondition = useMemo(
    () => hasInitialConditionFor(profiles, selKind),
    [profiles, selKind],
  );

  const onDeleteEpisode = useCallback(
    async (repoId: string, episodeId: string) => {
      try {
        await deleteEpisode(repoId, episodeId);
        addToast(`Deleted episode ${episodeId} of ${repoId}`, "info");
      } catch (e) {
        addToast(`delete episode: ${e instanceof Error ? e.message : String(e)}`, "error");
      } finally {
        loadDatasets();
      }
    },
    [addToast, loadDatasets],
  );
  const onDeleteDataset = useCallback(
    async (repoId: string) => {
      try {
        await deleteDataset(repoId);
        addToast(`Deleted dataset ${repoId}`, "info");
      } catch (e) {
        addToast(`delete dataset: ${e instanceof Error ? e.message : String(e)}`, "error");
      } finally {
        loadDatasets();
      }
    },
    [addToast, loadDatasets],
  );
  const onExport = useCallback(
    async (repoId: string) => {
      try {
        await exportDataset(repoId);
        addToast(`Export of ${repoId} started — progress in the datasets list`, "info");
      } catch (e) {
        addToast(`export: ${e instanceof Error ? e.message : String(e)}`, "error");
      } finally {
        loadDatasets();
      }
    },
    [addToast, loadDatasets],
  );

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
            // "Workcell" until 2026-09-07; the third tab is device set-up, not a workcell.
            aria-label="Workcell and device settings"
            testId="kind-toggle"
          />
          <Link to="/devices" className="btn-ghost btn-sm" data-testid="nav-devices">
            Debug
          </Link>
        </div>
      </header>

      <div className="pane-stack">
        {leaving !== null && leaving !== tab && pane(leaving, "leave")}
        {pane(tab, "enter")}
      </div>

      {!settingTab && (
        <>
          <section className="section" aria-labelledby="start-from-title">
            <h2 id="start-from-title" className="text-label fg-3 section-title">
              Start from
            </h2>
            <StartFrom
              profiles={profiles}
              kind={selKind}
              arms={armIds}
              startFrom={startFrom}
              onStartFromChange={setStartFrom}
              profileId={profileId}
              onProfileChange={setProfileId}
              onDelete={setDeleting}
              deletingId={deleteBusy}
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
            {hardwareTab && <BringupProgress />}
          </section>

          <section className="section" aria-labelledby="datasets-title">
            <h2 id="datasets-title" className="text-label fg-3 section-title">
              Datasets
            </h2>
            <DatasetsPanel
              kind={selKind}
              datasets={datasets}
              exportProgress={exportProgress}
              inUseRepoId={inUseRepoId}
              layout={layout}
              onDeleteEpisode={onDeleteEpisode}
              onDeleteDataset={onDeleteDataset}
              onExport={onExport}
              // Episode playback (2026-09-10): the dialog owns a session when none is
              // running. `start_from: keep_current` always — a playback must never
              // plan a motion at bring-up; the operator's two buttons are the motion.
              sessionActive={liveSessionId !== null}
              playbackSpec={{ ...buildSpec("teleop", sel), start_from: "keep_current" }}
              playbackReason={reasons.teleop}
              onSessionEnded={loadDatasets}
            />
          </section>
        </>
      )}

      {sheetShown === "dagger" && (
        <OnlineDaggerSheet
          key="dagger"
          open={sheet !== null}
          sel={sel}
          cameras={tabCameras}
          profileName={profileName}
          hasInitialCondition={hasInitialCondition}
          layout={layout}
          external={external}
          onlineDaggerStatus={onlineDaggerStatus}
          onLaunched={onLaunched}
          onClose={() => setSheet(null)}
        />
      )}
      {sheetShown !== null && sheetShown !== "dagger" && (
        <LaunchSheet
          key={sheetShown}
          mode={sheetShown}
          open={sheet !== null}
          sel={sel}
          policies={policies}
          cameras={tabCameras}
          profileName={profileName}
          datasets={datasets}
          hasInitialCondition={hasInitialCondition}
          layout={layout}
          external={external}
          onLaunched={onLaunched}
          onClose={() => setSheet(null)}
        />
      )}
      {wizardShown !== null && (
        <TrackerCalibrationWizard
          kind={wizardShown}
          open={wizard !== null}
          onClose={() => setWizard(null)}
          onSwitchKind={setWizard}
        />
      )}
      {deletingShown !== null && (
        <ConfirmDialog
          open={deleting !== null}
          title="Delete profile"
          text={
            deletingShown.is_initial_condition
              ? `'${deletingShown.name}' is the workcell initial condition. Deleting it is permanent — recorded episodes that name it keep the name, not the pose.`
              : `Delete '${deletingShown.name}'? This is permanent — the saved joint state is gone.`
          }
          confirmLabel={deleteBusy !== null ? "Deleting…" : "Delete"}
          onConfirm={() => {
            if (deleteBusy === null) confirmDelete(deletingShown);
          }}
          onCancel={() => {
            if (deleteBusy === null) setDeleting(null);
          }}
        />
      )}
      <Toasts />
    </div>
  );
}
