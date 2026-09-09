/** Protocol fixtures built from the vendored schemas' shapes — MAVIS v2 ids
 * throughout (phase-11 §4): arms `view` (Perception Arm: wrist camera + mic,
 * no gripper) + `grip` (Manipulation Arm: xArm Gripper G2 + wrist camera), the
 * four sim preview cameras, the single `mavis_v2` scene in
 * both the sim and twin listings, a hardware workcell with `grip_wrist`/`view_wrist`
 * and `hardware_ready`, the RØDE microphone, and (phase-09a) the twin-overlay
 * camera rows plus the read-only `hardware_monitor` telemetry block. */
import keymapJson from "../../schemas/keymap.json";
import type {
  DatasetInfo,
  DatasetLayoutInfo,
  DoraInfo,
  EpisodeInfo,
  GelloInfo,
  GelloPreviewResult,
  GelloTelemetry,
  GelloViewpointTelemetry,
  OnlineDaggerSessionInfo,
  OnlineDaggerStatus,
  TrainerStatusAnnounce,
  ArmBringupTelemetry,
  ArmMaintenanceResult,
  ArmMonitorTelemetry,
  ArmStatusInfo,
  ArmTelemetry,
  CameraInfo,
  ExternalStatus,
  HardwareMonitorTelemetry,
  KeymapEntry,
  MaintenanceProgress,
  MicrophoneInfo,
  MicrophoneTelemetry,
  PolicyInfo,
  PrePositionPlan,
  ProfileInfo,
  RailSweepVerdict,
  SceneInfo,
  SessionInfo,
  TelemetryMsg,
  TrackerCalibrationStatus,
  TrackerTelemetry,
  TwinOverlayTelemetry,
  WorkcellStatus,
} from "../../src/gen";

export const KEYMAP: KeymapEntry[] = keymapJson as KeymapEntry[];

/** Runtime order of the mavis_v2 preview cameras (`GET /api/cameras`). */
export const SIM_CAMERA_IDS = ["cam_front", "cam_top", "view_wrist_cam", "grip_wrist_cam"] as const;
export const HARDWARE_CAMERA_IDS = ["grip_wrist", "view_wrist"] as const;
/** Twin-overlay stream ids (phase-09a): `<camera_id>_align`, kind `twin`. */
export const HARDWARE_OVERLAY_IDS = ["grip_wrist_align", "view_wrist_align"] as const;
const OVERLAY_LABELS: Record<(typeof HARDWARE_OVERLAY_IDS)[number], string> = {
  grip_wrist_align: "Manipulation · twin overlay",
  view_wrist_align: "Perception · twin overlay",
};

export const JOINT_LIMITS: [number, number][] = [
  [-6.28319, 6.28319],
  [-2.059, 2.0944],
  [-6.28319, 6.28319],
  [-0.19198, 3.927],
  [-6.28319, 6.28319],
  [-1.69297, 3.14159],
  [-6.28319, 6.28319],
  [0, 0.65],
];

export function makeArm(over: Partial<ArmTelemetry> = {}): ArmTelemetry {
  return {
    arm_id: "grip",
    connected: true,
    q: [0, -0.5, 0, 0.7, 0, 1.2, 0],
    rail_pos_m: 0.2,
    ee_pose: { position: [0.3, 0, 0.4], orientation: [1, 0, 0, 0] },
    gripper_open_frac: 0.8,
    error_code: 0,
    warn_code: 0,
    fault_detail: "",
    recovering: false,
    goto: null,
    ...over,
  };
}

export function makeTelemetry(over: Partial<TelemetryMsg> = {}): TelemetryMsg {
  return {
    t: "telemetry",
    seq: 1,
    ts: 100.0,
    epoch: "epoch-1",
    active_arm: "grip",
    controller_connected: true,
    arms: [makeArm(), makeArm({ arm_id: "view", gripper_open_frac: 1, rail_pos_m: 0.6 })],
    collision: { blocked: false, severity: "ok", pairs: [], min_clearance_m: 1.0 },
    clearances: [],
    episode: null,
    dagger: null,
    inference: null,
    ...over,
  };
}

/** `telemetry.external` (phase-12, 14-dora §13): the Dora bridge enabled and
 * attached, with a PLAIN external policy spec attached at 10 Hz — no `online_dagger`
 * capability and no trainer heartbeat (phase-14 session-less fields, which the
 * runtime always fills: `capabilities: []`, `trainer_status: null`). A trainer-
 * capable node is `makeTrainerExternal()`. */
export function makeExternal(over: Partial<ExternalStatus> = {}): ExternalStatus {
  return {
    enabled: true,
    state: "attached",
    detail: "",
    node_id: "mavis_runtime",
    dataflow_id: "df-0001",
    dataflow_restarts: 0,
    reattach_count: 0,
    idle_reader: "off",
    publish_hz: { obs: 25 },
    dropped_inputs: 0,
    policy_attached: true,
    policy_id: "act_pick_place",
    policy_version: 3,
    policy_rate_hz: 10,
    spec_age_s: 0.2,
    action_age_s: 0.05,
    actions_late: 0,
    version_changes_mid_episode: 0,
    capabilities: [],
    trainer_status: null,
    ...over,
  };
}

/** `telemetry.external` with a trainer-capable node attached BEFORE any session
 * (15-online-dagger §6 / §8): the fresh spec lists `online_dagger` and the node's
 * heartbeat is idle (no session picked up yet, so `session_id` is null). */
export function makeTrainerExternal(
  over: Partial<ExternalStatus> = {},
  trainer: Partial<TrainerStatusAnnounce> = {},
): ExternalStatus {
  return makeExternal({
    capabilities: ["online_dagger"],
    trainer_status: makeTrainerStatus({
      state: "idle",
      session_id: null,
      policy_version: 3,
      progress: 0,
      metrics: {},
      ...trainer,
    }),
    ...over,
  });
}

/** Tracker block (13-tracker §3.5): a tracking `fake` backend, clutch released. */
export function makeTracker(over: Partial<TrackerTelemetry> = {}): TrackerTelemetry {
  return {
    backend: "fake",
    status: "tracking",
    detail: "scripted circle",
    object_name: "WM0",
    seq: 42,
    rate_hz: 120.0,
    age_s: 0.004,
    pose_raw: { position: [0.1, 0.2, 1.1], orientation: [1, 0, 0, 0] },
    pose_world: { position: [0.12, 0.21, 1.1], orientation: [1, 0, 0, 0] },
    clutch: false,
    engaged_arm: null,
    anchor_tcp: null,
    target_tcp: null,
    settings: { yaw_deg: 0.0, pos_scale: 1.0, follow_rotation: true },
    ...over,
  };
}

/** Calibration block (13-tracker §3/§4): the idle snapshot, yaw valid. Every
 * field has a server default, so callers override only what a phase needs. */
export function makeCalibration(
  over: Partial<TrackerCalibrationStatus> = {},
): TrackerCalibrationStatus {
  return {
    kind: "none",
    phase: "idle",
    detail: "",
    started_at: null,
    elapsed_s: null,
    scenes: 0,
    lighthouses: [],
    stations_visible: 0,
    controller_still: null,
    validation: null,
    installed_path: null,
    backup_path: null,
    yaw_points: [],
    next_point: null,
    fitted_yaw_deg: null,
    fit_residual_deg: null,
    fit_checks: [],
    applied_yaw_deg: null,
    yaw_valid: true,
    yaw_calibrated_at: null,
    base_station_installed_at: null,
    ...over,
  };
}

/** Microphone telemetry block (phase-11): a live 48 kHz frame with a ±40 %
 * envelope; callers override `seq` per frame. */
export function makeMicrophone(over: Partial<MicrophoneTelemetry> = {}): MicrophoneTelemetry {
  const env = Array.from({ length: 64 }, (_, i) =>
    Math.round(50 * Math.sin((i / 64) * Math.PI * 4)),
  );
  return {
    mic_id: "mic_view",
    status: "live",
    detail: "",
    seq: 1,
    age_s: 0.01,
    rate_hz: 25,
    sample_rate: 48000,
    rms_dbfs: -24.0,
    peak_dbfs: -12.0,
    clipping: false,
    env_min: env.map((v) => -Math.abs(v)),
    env_max: env.map((v) => Math.abs(v)),
    overruns: 0,
    ...over,
  };
}

/** `GET /api/microphones` row (phase-11): the RØDE on the Perception Arm (`view`), live. */
export function makeMicrophoneInfo(over: Partial<MicrophoneInfo> = {}): MicrophoneInfo {
  return {
    mic_id: "mic_view",
    label: "RØDE NT-USB Mini",
    kind: "pulse",
    source: "alsa_input.usb-R__DE_Microphones_R__DE_NT-USB_Mini_750BFEE8-00.mono-fallback",
    sample_rate: 48000,
    channels: 1,
    live: true,
    status: "live",
    detail: "",
    ...over,
  };
}

/** One `WorkcellStatus.arms` row — the sim Manipulation Arm (`grip`, xArm
 * Gripper G2) by default (pre-session: `connected: false`, `ip: null`, probe
 * `unknown`). */
export function makeArmStatus(over: Partial<ArmStatusInfo> = {}): ArmStatusInfo {
  return {
    arm_id: "grip",
    ip: null,
    connected: false,
    reachable: "unknown",
    has_rail: true,
    gripper: "xarm_g2",
    gripper_force_capable: false,
    error_code: 0,
    joint_limits: JOINT_LIMITS,
    ...over,
  };
}

/** Sim workcell arms in the runtime's order (view first, then grip). */
export function makeSimArms(): ArmStatusInfo[] {
  return [makeArmStatus({ arm_id: "view", gripper: "none" }), makeArmStatus({ arm_id: "grip" })];
}

/** Hardware workcell arms from `configs/mavis_v2.yaml` (placeholder IPs →
 * the probe reports `unreachable`). `reachable` overrides both arms. */
export function makeHardwareArms(
  reachable: NonNullable<ArmStatusInfo["reachable"]> = "unreachable",
): ArmStatusInfo[] {
  return [
    makeArmStatus({ arm_id: "grip", ip: "192.168.1.201", reachable }),
    makeArmStatus({ arm_id: "view", ip: "192.168.2.219", gripper: "none", reachable }),
  ];
}

export function makeCamera(over: Partial<CameraInfo> = {}): CameraInfo {
  return {
    camera_id: "grip_wrist_cam",
    kind: "sim",
    label: "grip_wrist_cam",
    resolution: [640, 480],
    fps: 15,
    live: true,
    ...over,
  };
}

/** The four live sim preview cameras (`GET /api/cameras` on the sim runtime). */
export function makeSimCameras(): CameraInfo[] {
  return SIM_CAMERA_IDS.map((id) => makeCamera({ camera_id: id, label: id }));
}

/** grip_wrist / view_wrist as the hardware config lists them (v4l2, not opened). */
export function makeHardwareCameras(live = false): CameraInfo[] {
  return HARDWARE_CAMERA_IDS.map((id) =>
    makeCamera({ camera_id: id, label: id, kind: "v4l2", fps: 30, live }),
  );
}

/** The two twin-overlay rows of `GET /api/cameras` (phase-09a): kind `twin`,
 * 640×480 at the overlay's 12 fps; `live` = the real wrist camera is live AND
 * the overlay renders (status live / stale). */
export function makeOverlayCameras(live = false): CameraInfo[] {
  return HARDWARE_OVERLAY_IDS.map((id) =>
    makeCamera({ camera_id: id, label: OVERLAY_LABELS[id], kind: "twin", fps: 12, live }),
  );
}

/** One `hardware_monitor.arms` row (phase-09a): the Manipulation Arm at the
 * factory-zero posture (joint 1 at π), controller state 4 / mode 0, linear
 * track present but neither homed nor enabled (raw 0 mm → `rail_pos_m` null),
 * no controller error. Phase-09b read-back: sensitivity 3, the provisional
 * 0.95 kg payload at (0, 0, 60) mm, matching the config, no op running. */
export function makeArmMonitor(over: Partial<ArmMonitorTelemetry> = {}): ArmMonitorTelemetry {
  return {
    arm_id: "grip",
    status: "running",
    detail: "",
    seq: 120,
    age_s: 0.05,
    q: [Math.PI, 0, 0, 0, 0, 0, 0],
    tcp_pose: [0.207, 0, 0.112, Math.PI, 0, 0],
    rail_present: true,
    rail_homed: false,
    rail_enabled: false,
    rail_pos_m: null,
    rail_raw_mm: 0,
    gripper_open_frac: 1,
    gripper_raw: 840,
    error_code: 0,
    warn_code: 0,
    state: 4,
    mode: 0,
    collision_sensitivity: 3,
    tcp_load_kg: 0.95,
    tcp_load_cog_mm: [0, 0, 60],
    backstops_match: true,
    maintenance_busy: false,
    ...over,
  };
}

/** `POST /api/hardware/arms/{arm_id}/maintenance` answer (phase-09b): a
 * successful monitor-path `clear_errors` on the Perception Arm — the SDK
 * write set is exactly `clean_error` + `clean_warn` — with the C19 sample
 * before and a clean one after. */
export function makeMaintenanceResult(
  over: Partial<ArmMaintenanceResult> = {},
): ArmMaintenanceResult {
  return {
    arm_id: "view",
    op: "clear_errors",
    path: "monitor",
    ok: true,
    detail: "",
    sdk_codes: { clean_error: 0, clean_warn: 0 },
    warnings: [],
    before: makeArmMonitor({ arm_id: "view", error_code: 19, tcp_load_kg: 0.55 }),
    after: makeArmMonitor({ arm_id: "view", tcp_load_kg: 0.55 }),
    ...over,
  };
}

/** `ArmMaintenanceResult.rail_sweep` (phase-09c): a CLEAR full-travel sweep of
 * the Manipulation Arm at the factory-zero posture (inflation 25 mm, 5 mm
 * steps), tightest pair link2 ↔ table at 0.315 m; the Perception Arm posed at
 * its last sample with the rail fallback (its track is not homed either).
 * Phase-09d: `pre_position` says no pre-positioning is needed (the current
 * posture is sweep-clear); a pre-09d producer omits the block. */
export function makeRailSweepVerdict(over: Partial<RailSweepVerdict> = {}): RailSweepVerdict {
  return {
    scene_id: "mavis_v2",
    inflation_m: 0.025,
    step_m: 0.005,
    travel_m: 0.65,
    clear: true,
    first_blocked_m: null,
    first_blocked_pair: [],
    min_clearance_m: 0.0321,
    min_clearance_at_m: 0.315,
    min_clearance_pair: ["grip/link2", "table"],
    q_checked: [Math.PI, 0, 0, 0, 0, 0, 0],
    other_arms: { view: [Math.PI, 0, 0, 0, 0, 0, 0, 0] },
    assumptions: ["view rail unknown - used fallback 0.00 m"],
    sample_seq: 120,
    pre_position: { needed: false },
    ...over,
  };
}

/** `RailSweepVerdict.pre_position` (phase-09d): a PLANNED pre-positioning
 * motion — the current posture blocks the sweep, the scene keyframe's folded
 * posture (joint 1 at π) clears it, RRT-Connect found a 12-waypoint path whose
 * every waypoint is collision-free at all 131 rail positions, ~19 s at 10 %. */
export function makePrePositionPlan(over: Partial<PrePositionPlan> = {}): PrePositionPlan {
  return {
    needed: true,
    source: "keyframe",
    target_q: [Math.PI, 0, 0, 0, 0, 0, 0],
    waypoints: 12,
    duration_s: 18.6,
    checked_rail_positions: 131,
    clear: true,
    detail: "",
    ...over,
  };
}

/** A BLOCKED sweep whose runtime found a pre-positioning plan (phase-09d):
 * link6 ↔ table at 0.120 m at the current posture, plan from the keyframe. */
export function makePlannedSweepVerdict(over: Partial<RailSweepVerdict> = {}): RailSweepVerdict {
  return makeRailSweepVerdict({
    clear: false,
    first_blocked_m: 0.12,
    first_blocked_pair: ["grip/link6", "table"],
    min_clearance_m: -0.004,
    min_clearance_at_m: 0.2,
    min_clearance_pair: ["grip/link6", "table"],
    pre_position: makePrePositionPlan(),
    ...over,
  });
}

/** `ArmMonitorTelemetry.maintenance` (phase-09d): a `RailHomingJob` on the
 * Manipulation Arm in its `planning` phase. */
export function makeMaintenanceProgress(
  over: Partial<MaintenanceProgress> = {},
): MaintenanceProgress {
  return {
    op: "home_rail",
    job_id: "job-1",
    phase: "planning",
    detail: "",
    progress: 0.2,
    started_at: 100.0,
    ...over,
  };
}

/** One `telemetry.session.bringup` row (phase-09c): the Manipulation Arm's
 * `connect` step done. */
export function makeBringupRow(over: Partial<ArmBringupTelemetry> = {}): ArmBringupTelemetry {
  return { arm_id: "grip", step: "connect", status: "ok", detail: "", ...over };
}

/** `POST /api/session` answer for a phase-09c/09d hardware teleop session:
 * both arms (phase-09d: a hardware session includes every configured arm) at
 * 10 % speed. `streams` is `[]` — the real wire shape (runtime
 * `SessionManager.info()`, pinned by its tests and 04-runtime §5 step 12): the
 * two wrist cameras are ADOPTED on the hub under unchanged ids, not re-added,
 * so the Cockpit derives its tiles from `HARDWARE_GRID_SLOTS`. */
export function makeHardwareSession(over: Partial<SessionInfo> = {}): SessionInfo {
  return {
    session_id: "s-hw",
    epoch: "epoch-1",
    mode: "teleop",
    arms: ["grip", "view"],
    streams: [],
    state: "running",
    kind: "hardware",
    speed_scale: 0.1,
    ...over,
  };
}

/** One `hardware_monitor.overlays` row (phase-09a): `grip_wrist_align` live at
 * 12 fps with the rail fallback in use (the track is not homed) — the wire
 * `detail` uses an ASCII hyphen; the tile renders it with a middle dot. */
export function makeTwinOverlay(over: Partial<TwinOverlayTelemetry> = {}): TwinOverlayTelemetry {
  return {
    stream_id: "grip_wrist_align",
    camera_id: "grip_wrist",
    arm_id: "grip",
    status: "live",
    detail: "rail not homed - twin assumes 0.65 m",
    fps: 12,
    rail_fallback_m: 0.65,
    joint1_offset_rad: 0,
    mask_fraction: 0.18,
    ...over,
  };
}

/** `telemetry.hardware_monitor` (phase-09a): both arms `running` — the
 * Perception Arm reporting controller error C19 as the real cell does (the
 * `detail` carries the SDK's title "End Effector Communication Error"; xArm
 * Studio calls the same code "End Module Communication Error") — and both
 * overlays live, the Manipulation Arm's with the rail-fallback detail, the
 * Perception Arm's with none. */
export function makeHardwareMonitor(
  over: Partial<HardwareMonitorTelemetry> = {},
): HardwareMonitorTelemetry {
  return {
    enabled: true,
    paused: false,
    arms: [
      makeArmMonitor(),
      makeArmMonitor({
        arm_id: "view",
        gripper_open_frac: null,
        gripper_raw: null,
        error_code: 19,
        detail: "controller error 19: End Effector Communication Error",
        tcp_load_kg: 0.55,
        tcp_load_cog_mm: [0, 0, 90],
      }),
    ],
    overlays: [
      makeTwinOverlay(),
      makeTwinOverlay({
        stream_id: "view_wrist_align",
        camera_id: "view_wrist",
        arm_id: "view",
        detail: "",
        rail_fallback_m: null,
        mask_fraction: 0.31,
      }),
    ],
    ...over,
  };
}

/** `mavis_v2` as `GET /api/scenes` lists it (same row under kind sim and twin). */
export function makeScene(over: Partial<SceneInfo> = {}): SceneInfo {
  return {
    scene_id: "mavis_v2",
    label: "APOLLO MAVIS V2 Digital Twin",
    num_arms: 2,
    rail_flags: [true, true],
    cameras: [...SIM_CAMERA_IDS],
    kind: "sim",
    ...over,
  };
}

export function makeProfile(over: Partial<ProfileInfo> = {}): ProfileInfo {
  return {
    profile_id: "p1",
    name: "home",
    arms: ["grip", "view"],
    notes: "",
    created_at: "2026-01-01T00:00:00Z",
    is_initial_condition: false,
    workcell_kind: "sim",
    ...over,
  };
}

export function makePolicy(over: Partial<PolicyInfo> = {}): PolicyInfo {
  return {
    policy_id: "ckpt-9",
    path: "/ckpts/9",
    action_space: "delta_ee",
    action_frame: "arm_base:grip",
    policy_version: 9,
    promoted: true,
    ...over,
  };
}

/** `GET /api/workcell` on the sim-only runtime (no hardware block configured). */
export function makeWorkcell(over: Partial<WorkcellStatus> = {}): WorkcellStatus {
  return {
    kind: "sim",
    available_kinds: ["sim"],
    arms: makeSimArms(),
    cameras: makeSimCameras(),
    policies_available: false,
    hardware_ready: false,
    ...over,
  };
}

/** `GET /api/workcell?kind=hardware` with the hardware block configured but no
 * arm reachable: probe `unreachable`, cameras not opened, `hardware_ready: false`. */
export function makeHardwareWorkcell(over: Partial<WorkcellStatus> = {}): WorkcellStatus {
  return {
    kind: "hardware",
    available_kinds: ["hardware", "sim"],
    arms: makeHardwareArms(),
    cameras: makeHardwareCameras(),
    policies_available: false,
    hardware_ready: false,
    ...over,
  };
}

/** `GET /api/datasets` row (2026-09-07): an episode-directory dataset recorded on the sim. */
export function makeDataset(over: Partial<DatasetInfo> = {}): DatasetInfo {
  return {
    repo_id: "apollo/pick_cube",
    root: "/home/x/apollo/var/datasets/apollo/pick_cube",
    layout: "episode_dirs",
    total_episodes: 2,
    total_frames: 250,
    fps: 25,
    robot_type: "xarm7_2arm_rail_mujoco",
    kind: "sim",
    task: "pick the cube",
    cameras: ["cam_front", "grip_wrist_cam"],
    arms: ["grip", "view"],
    modified_at: "2026-09-07T14:12:03.512Z",
    in_use: false,
    export: { state: "none", format: "lerobot_v3", path: null, at: null, episodes: 0, detail: "" },
    ...over,
  };
}

/** `GET /api/datasets/{ns}/{name}/episodes` row. */
export function makeEpisode(over: Partial<EpisodeInfo> = {}): EpisodeInfo {
  return {
    episode_id: "20260907T141203.512Z-3f9a1c",
    index: 0,
    frames: 125,
    duration_s: 5.0,
    task: "pick the cube",
    session_id: "s1",
    recorded_at: "2026-09-07T14:12:03.512Z",
    frames_dropped: 0,
    audio: false,
    export_ok: true,
    export_note: null,
    open: false,
    ...over,
  };
}

// -- Online DAgger (phase-14; 15-online-dagger §5-§7) ----------------------------------

/** `GET /api/datasets/layout`: the lab layout — `bc_demo` demonstrations and
 * `online_dagger` rollouts mapped under `~/data`, everything else under the generic
 * `var/datasets/<ns>/<name>` root. */
export function makeDatasetLayout(over: Partial<DatasetLayoutInfo> = {}): DatasetLayoutInfo {
  return {
    default_namespace: "bc_demo",
    generic_root: "/home/x/apollo/var/datasets",
    namespaces: {
      bc_demo: { root: "/home/x/data/bc_demo", subdir: null },
      online_dagger: { root: "/home/x/data/online_dagger", subdir: "rollouts" },
    },
    ...over,
  };
}

/** `GET /api/dora`: the private control plane bound to the lab Wi-Fi, attached. */
export function makeDoraInfo(over: Partial<DoraInfo> = {}): DoraInfo {
  return {
    mavis_schema: 1,
    enabled: true,
    state: "attached",
    detail: "",
    bind_host: "192.168.0.88",
    machine_id: "mavis",
    auth: true,
    coordinator_addr: "192.168.0.88",
    coordinator_port: 6113,
    daemon_port: 53391,
    zenoh_port: 7447,
    zenoh_connect: "tcp/192.168.0.88:7447",
    dataflow_name: "mavis_v2",
    dataflow_id: "df-0001",
    node_id: "mavis_runtime",
    placeholders: ["policy"],
    machines: [],
    dataflow_restarts: 0,
    reattach_count: 0,
    dataflow_yaml: "/home/x/apollo/var/dora/mavis_v2.dora.yml",
    ...over,
  };
}

/** The trainer's generic heartbeat (`policy/trainer_status`, 15-online-dagger §6):
 * ready between rollouts, echoing the served session id, acting on policy v4, with
 * the free-form metrics its algorithm chose to report (a `loss` key gets the
 * Cockpit's sparkline). */
export function makeTrainerStatus(
  over: Partial<TrainerStatusAnnounce> = {},
): TrainerStatusAnnounce {
  return {
    mavis_schema: 1,
    trainer_id: "act_pick_place/trainer",
    node_version: "0.4.0",
    state: "ready",
    session_id: "s-od",
    policy_version: 4,
    progress: 0,
    metrics: { loss: 0.0421, proj_rate: 0.115 },
    detail: "",
    uptime_s: 900,
    ...over,
  };
}

/** `telemetry.dagger.online_dagger`: in `rollout` with three rollouts kept, the
 * trainer alive and fresh. */
export function makeOnlineDagger(over: Partial<OnlineDaggerStatus> = {}): OnlineDaggerStatus {
  return {
    session_name: "pick_cube_v1",
    phase: "rollout",
    rollouts_saved: 3,
    detail: "",
    trainer_alive: true,
    trainer_age_s: 0.4,
    trainer: makeTrainerStatus(),
    policy_version_acting: 4,
    expert_frames_session: 120,
    novice_frames_session: 480,
    session_dir: "/home/x/data/online_dagger/pick_cube_v1",
    ...over,
  };
}

/** `GET /api/online_dagger/sessions` row: the same session, resumable. */
export function makeOnlineDaggerSession(
  over: Partial<OnlineDaggerSessionInfo> = {},
): OnlineDaggerSessionInfo {
  return {
    session_name: "pick_cube_v1",
    path: "/home/x/data/online_dagger/pick_cube_v1",
    created_at: "2026-09-08T10:00:00Z",
    task: "pick the cube",
    rollouts: 6,
    last_used_at: "2026-09-08T10:06:00Z",
    ...over,
  };
}

// ---------------------------------------------------------------------------------
// GELLO Manipulation (phase-15, 16-gello §8.3 / §8.4)
// ---------------------------------------------------------------------------------

/** The Manipulation Arm's `mavis_v2` keyframe — the fake leader's default posture
 * (16-gello §4), so a sim GELLO session launches already synced. */
export const GELLO_LEADER_Q: number[] = [Math.PI, 0, 0, 0, 0, 0, 0];
/** The Perception Arm's GELLO hold posture (16-gello §0 item 3). */
export const GELLO_VIEW_POSTURE: number[] = [2.646, -1.598, 0.018, 1.637, 0.25, 2.007, 0.029];

/** `GelloTelemetry.viewpoint`: `auto`, nothing attached yet (the arm holds). */
export function makeGelloViewpoint(
  over: Partial<GelloViewpointTelemetry> = {},
): GelloViewpointTelemetry {
  return { mode: "auto", attached: false, policy_id: null, detail: "", paused: false, ...over };
}

/** `telemetry.gello` during a sim GELLO session: the fake leader connected at 100 Hz,
 * calibrated (the fake needs no file), the follower `tracking` with a small lag. */
export function makeGelloTelemetry(over: Partial<GelloTelemetry> = {}): GelloTelemetry {
  return {
    backend: "fake",
    status: "connected",
    detail: "",
    port: "",
    baud: null,
    seq: 1200,
    rate_hz: 100,
    age_s: 0.008,
    q_raw: GELLO_LEADER_Q,
    q: GELLO_LEADER_Q,
    gripper_frac: 1,
    calibrated: true,
    joint_offsets_rad: [0, 0, 0, 0, 0, 0, 0],
    joint_signs: [1, 1, 1, 1, 1, 1, 1],
    state: "tracking",
    state_detail: "",
    lag_rad: [0.01, 0, 0.004, 0, 0, 0.002, 0],
    max_lag_rad: 0.01,
    engaged_arm: "grip",
    paused_latched: false,
    viewpoint: makeGelloViewpoint(),
    ...over,
  };
}

/** `GET /api/gello` before any session: the device half of `makeGelloTelemetry` plus
 * the launch facts (kitchen scene, hold posture, calibration file, hardware admitted). */
export function makeGelloInfo(over: Partial<GelloInfo> = {}): GelloInfo {
  return {
    backend: "fake",
    status: "connected",
    detail: "",
    port: "",
    baud: null,
    seq: 1200,
    rate_hz: 100,
    age_s: 0.008,
    q_raw: GELLO_LEADER_Q,
    q: GELLO_LEADER_Q,
    gripper_frac: 1,
    calibrated: true,
    joint_offsets_rad: [0, 0, 0, 0, 0, 0, 0],
    joint_signs: [1, 1, 1, 1, 1, 1, 1],
    scene_id: "mavis_v2_kitchen",
    scene_label: "APOLLO MAVIS V2 Kitchen (GELLO)",
    view_posture_rad: GELLO_VIEW_POSTURE,
    view_rail_m: 0,
    calibration_path: "/home/x/apollo/var/gello_calibration.json",
    hardware_admitted: true,
    gripper_open_rad: null,
    gripper_closed_rad: null,
    ...over,
  };
}

/** A 1×1 PNG (the preview's `image_png_b64` stand-in). */
export const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/** `POST /api/gello/preview` answer: the GELLO posture is `clear` — the Manipulation
 * Arm at the leader posture with the current rail, the Perception Arm at its hold
 * posture, a PNG of the kitchen twin from `cam_kitchen`. `ok` follows `status`. */
export function makeGelloPreview(over: Partial<GelloPreviewResult> = {}): GelloPreviewResult {
  const status = over.status ?? "clear";
  return {
    status,
    ok: status === "clear",
    detail: "",
    pairs: [],
    q_goal: { grip: [...GELLO_LEADER_Q, 0.2], view: [...GELLO_VIEW_POSTURE, 0] },
    leader_q: GELLO_LEADER_Q,
    image_png_b64: TINY_PNG_B64,
    camera: "cam_kitchen",
    ...over,
  };
}
