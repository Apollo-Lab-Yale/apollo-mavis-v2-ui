/** Protocol fixtures built from the vendored schemas' shapes — MAVIS v2 ids
 * throughout (phase-11 §4): arms `view` (Perception Arm: wrist camera + mic,
 * no gripper) + `grip` (Manipulation Arm: xArm Gripper G2 + wrist camera), the
 * four sim preview cameras, the single `mavis_v2` scene in
 * both the sim and twin listings, a hardware workcell with `grip_wrist`/`view_wrist`
 * and `hardware_ready`, the RØDE microphone, and (phase-09a) the twin-overlay
 * camera rows plus the read-only `hardware_monitor` telemetry block. */
import keymapJson from "../../schemas/keymap.json";
import type {
  ArmMonitorTelemetry,
  ArmStatusInfo,
  ArmTelemetry,
  CameraInfo,
  HardwareMonitorTelemetry,
  KeymapEntry,
  MicrophoneInfo,
  MicrophoneTelemetry,
  PolicyInfo,
  ProfileInfo,
  SceneInfo,
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
 * no controller error. */
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
