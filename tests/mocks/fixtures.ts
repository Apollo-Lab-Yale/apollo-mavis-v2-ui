/** Protocol fixtures built from the vendored schemas' shapes. */
import keymapJson from "../../schemas/keymap.json";
import type {
  ArmStatusInfo,
  ArmTelemetry,
  CameraInfo,
  KeymapEntry,
  ProfileInfo,
  SceneInfo,
  TelemetryMsg,
  TrackerTelemetry,
  WorkcellStatus,
} from "../../src/gen";

export const KEYMAP: KeymapEntry[] = keymapJson as KeymapEntry[];

export function makeArm(over: Partial<ArmTelemetry> = {}): ArmTelemetry {
  return {
    arm_id: "arm0",
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
    active_arm: "arm0",
    controller_connected: true,
    arms: [makeArm()],
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

export function makeArmStatus(over: Partial<ArmStatusInfo> = {}): ArmStatusInfo {
  return {
    arm_id: "arm0",
    ip: "192.168.1.201",
    connected: true,
    has_rail: true,
    gripper: "xarm",
    gripper_force_capable: false,
    error_code: 0,
    joint_limits: [
      [-6.28, 6.28],
      [-2.06, 2.09],
      [-6.28, 6.28],
      [-0.19, 3.93],
      [-6.28, 6.28],
      [-1.69, 3.14],
      [-6.28, 6.28],
      [0, 0.65],
    ],
    ...over,
  };
}

export function makeCamera(over: Partial<CameraInfo> = {}): CameraInfo {
  return {
    camera_id: "cam0",
    kind: "sim",
    label: "cam0",
    resolution: [640, 480],
    fps: 30,
    live: true,
    ...over,
  };
}

export function makeScene(over: Partial<SceneInfo> = {}): SceneInfo {
  return {
    scene_id: "tabletop",
    label: "Tabletop",
    num_arms: 1,
    rail_flags: [true],
    cameras: ["cam0"],
    kind: "sim",
    ...over,
  };
}

export function makeProfile(over: Partial<ProfileInfo> = {}): ProfileInfo {
  return {
    profile_id: "p1",
    name: "home",
    arms: ["arm0"],
    notes: "",
    created_at: "2026-01-01T00:00:00Z",
    is_initial_condition: false,
    ...over,
  };
}

export function makeWorkcell(over: Partial<WorkcellStatus> = {}): WorkcellStatus {
  return {
    kind: "sim",
    available_kinds: ["sim"],
    arms: [makeArmStatus()],
    cameras: [makeCamera()],
    policies_available: false,
    ...over,
  };
}
