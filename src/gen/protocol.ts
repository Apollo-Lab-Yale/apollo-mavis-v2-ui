/* AUTO-GENERATED from apollo-xarm7-core schemas — do not edit. */
/* core_version: 0.1.0 */

export type Detail = string;
export type Name =
  | "switch_arm"
  | "switch_arm_prev"
  | "takeover_toggle"
  | "episode_new"
  | "episode_save"
  | "episode_discard"
  | "save_profile"
  | "set_initial_condition"
  | "joint_target"
  | "tracker_settings";
export type Ok = boolean;
export type T = "ack";
export type Name1 =
  | "switch_arm"
  | "switch_arm_prev"
  | "takeover_toggle"
  | "episode_new"
  | "episode_save"
  | "episode_discard"
  | "save_profile"
  | "set_initial_condition"
  | "joint_target"
  | "tracker_settings";
export type T1 = "action";
export type ArmId = string;
export type Connected = boolean;
export type ErrorCode = number;
export type Gripper = "xarm" | "xarm_g2" | "none";
export type GripperForceCapable = boolean;
export type HasRail = boolean;
export type Ip = string | null;
export type JointLimits = [number, number][];
export type CameraId = string;
export type Fps = number;
export type Kind = "v4l2" | "realsense" | "sim";
export type Label = string;
export type Live = boolean;
/**
 * @minItems 2
 * @maxItems 2
 */
export type Resolution = [number, number];
export type ArmIds = string[];
export type DistsM = number[];
export type Kind1 = "blocked" | "cleared" | "warn" | "penetration" | "stale_twin";
export type MinClearanceM = number;
export type Pairs = [string, string][];
/**
 * Origin of the command stream a safety event refers to.
 */
export type CommandSource = "teleop" | "joint_jog" | "policy" | "takeover" | "planner";
export type T2 = "collision_event";
export type Ts = number;
export type Epoch = string;
export type Role = "controller" | "observer";
export type SessionId = string | null;
export type T3 = "hello";
export type ArmId1 = string;
export type Mode = "jog" | "goto";
export type Positions = number[];
export type Action = string;
export type Code = string;
export type Gamepad = string | null;
export type Group = "translate" | "rotate" | "gripper" | "rail" | "session" | "episode" | "tracker";
export type Kind2 = "held" | "discrete";
export type Label1 = string;
export type RequiresRail = boolean;
export type Held = string[];
export type Seq = number;
export type T4 = "keys";
export type Ts1 = number;
export type ActionFrame = string;
export type ActionSpace = "delta_ee" | "abs_ee" | "joint";
export type Path = string;
export type PolicyId = string;
export type PolicyVersion = number;
export type Promoted = boolean;
export type Arms = string[];
export type CreatedAt = string;
export type IsInitialCondition = boolean;
export type Name2 = string;
export type Notes = string;
export type ProfileId = string;
export type Name3 = string;
export type Notes1 = string;
export type Cameras = string[];
export type Kind3 = "sim" | "twin";
export type Label2 = string;
export type NumArms = number;
export type RailFlags = boolean[];
export type SceneId = string;
export type Arms1 = string[];
export type Epoch1 = string;
export type Mode1 = "teleop" | "collect" | "dagger" | "inference";
export type SessionId1 = string;
export type State = string;
export type Streams = string[];
export type Arms2 = string[];
export type DigitalTwinScene = string | null;
export type Kind4 = "hardware" | "sim";
export type Mode2 = "teleop" | "collect" | "dagger" | "inference";
export type Policy = string | null;
export type SimScene = string | null;
export type StartFrom = string;
export type Task = string | null;
export type ProfileId1 = string | null;
export type GripperOpenFrac = number;
/**
 * @minItems 7
 * @maxItems 7
 */
export type Q = [number, number, number, number, number, number, number];
export type RailPosM = number | null;
export type CreatedAt1 = string;
export type IsInitialCondition1 = boolean;
export type Name4 = string;
export type Notes2 = string;
export type ProfileId2 = string;
export type SchemaVersion = number;
export type WorkcellKind = "hardware" | "sim";
export type ActiveArm = string | null;
export type ArmId2 = string;
export type Connected1 = boolean;
/**
 * @minItems 4
 * @maxItems 4
 */
export type Orientation = [number, number, number, number];
/**
 * @minItems 3
 * @maxItems 3
 */
export type Position = [number, number, number];
export type ErrorCode1 = number;
export type Goto = ("planning" | "executing" | "failed") | null;
export type GripperOpenFrac1 = number;
export type Q1 = number[];
export type RailPosM1 = number | null;
export type Stale = boolean;
export type WarnCode = number;
export type Arms4 = ArmTelemetry[];
export type DistM = number;
/**
 * @minItems 2
 * @maxItems 2
 */
export type Pair = [string, string];
export type Clearances = ClearanceItem[];
export type Blocked = boolean;
export type MinClearanceM1 = number;
export type Pairs1 = [string, string][];
export type Severity = "ok" | "warn" | "blocked";
export type Ts2 = number;
export type Violations = CollisionEvent[];
export type ControllerConnected = boolean;
export type ControlMode = "policy" | "human" | "takeover_transition";
export type EngagedArm = string | null;
export type EpisodesLabeled = number;
export type FrozenArms = string[];
export type NewLabelFrames = number;
export type PolicyVersion1 = string | null;
export type StagedVersion = string | null;
export type TakeoverRateEp = number;
export type TakeoverRateRun = number;
export type LastBurstLoss = number | null;
export type LastCheckpointTs = number | null;
export type LastCheckpointVersion = number | null;
export type NewLabelFrames1 = number;
export type State1 = "starting" | "idle" | "training" | "dead";
export type StepsTotal = number;
export type DurationS = number;
export type Frames1 = number;
export type Index = number | null;
export type State2 = "idle" | "recording" | "saving";
export type Epoch2 = string;
export type EngagedArm1 = string | null;
export type PolicyVersion2 = string | null;
export type Seq1 = number;
export type PlanStatus = string | null;
export type StartFromProgress = number | null;
export type State3 = string;
export type TrainerAlive = boolean | null;
export type T5 = "telemetry";
export type AgeS = number | null;
export type Backend = "libsurvive" | "fake" | "none";
export type Clutch = boolean;
export type Grip = boolean;
export type Menu = boolean;
export type System = boolean;
export type TrackpadClick = boolean;
export type TrackpadTouch = boolean;
export type TrackpadX = number;
export type TrackpadY = number;
export type Trigger = number;
export type TriggerPressed = boolean;
export type Detail1 = string;
export type DeviceHeld = string[];
export type EngagedArm2 = string | null;
export type ObjectName = string;
export type RateHz = number;
export type Seq2 = number;
export type FollowRotation = boolean;
export type PosScale = number;
export type YawDeg = number;
export type Status = "no_backend" | "starting" | "searching" | "tracking" | "stale" | "error";
export type Ts3 = number;
export type FollowRotation1 = boolean | null;
export type PosScale1 = number | null;
export type YawDeg1 = number | null;
export type Arms5 = ArmStatusInfo[];
export type AvailableKinds = ("hardware" | "sim")[];
export type Cameras1 = CameraInfo[];
export type Kind5 = "hardware" | "sim";
export type PoliciesAvailable = boolean;

export interface ApolloProtocol {
  AckMsg?: AckMsg;
  ActionMsg?: ActionMsg;
  ArmStatusInfo?: ArmStatusInfo;
  CameraInfo?: CameraInfo;
  CollisionEvent?: CollisionEvent;
  HelloMsg?: HelloMsg;
  JointTargetArgs?: JointTargetArgs;
  KeymapEntry?: KeymapEntry;
  KeysMsg?: KeysMsg;
  PolicyInfo?: PolicyInfo;
  ProfileInfo?: ProfileInfo;
  SaveProfileArgs?: SaveProfileArgs;
  SceneInfo?: SceneInfo;
  SessionInfo?: SessionInfo;
  SessionSpec?: SessionSpec;
  SetInitialConditionArgs?: SetInitialConditionArgs;
  StateProfile?: StateProfile;
  TelemetryMsg?: TelemetryMsg;
  TrackerSettingsArgs?: TrackerSettingsArgs;
  WorkcellStatus?: WorkcellStatus;
}
/**
 * Server -> client, one per ActionMsg.
 */
export interface AckMsg {
  detail?: Detail;
  name: Name;
  ok: Ok;
  t?: T;
}
/**
 * Client -> server, once per press/click.
 */
export interface ActionMsg {
  args?: Args;
  name: Name1;
  t?: T1;
}
export interface Args {
  [k: string]: unknown;
}
/**
 * Landing-page arm card.
 */
export interface ArmStatusInfo {
  arm_id: ArmId;
  connected: Connected;
  error_code: ErrorCode;
  gripper: Gripper;
  gripper_force_capable: GripperForceCapable;
  has_rail: HasRail;
  ip: Ip;
  joint_limits: JointLimits;
}
/**
 * Landing-page camera card.
 */
export interface CameraInfo {
  camera_id: CameraId;
  fps: Fps;
  kind: Kind;
  label: Label;
  live: Live;
  resolution: Resolution;
}
/**
 * Rich per-transition collision-gate event (additive detail).
 */
export interface CollisionEvent {
  arm_ids?: ArmIds;
  dists_m: DistsM;
  kind: Kind1;
  min_clearance_m: MinClearanceM;
  pairs: Pairs;
  source?: CommandSource | null;
  t?: T2;
  ts: Ts;
}
/**
 * Server -> client, immediately after WS accept.
 */
export interface HelloMsg {
  epoch: Epoch;
  role: Role;
  session_id: SessionId;
  t?: T3;
}
/**
 * Args for ``name == "joint_target"``.
 */
export interface JointTargetArgs {
  arm_id: ArmId1;
  mode: Mode;
  positions: Positions;
}
/**
 * One keyboard binding row (optionally mirrored on the gamepad).
 */
export interface KeymapEntry {
  action: Action;
  code: Code;
  gamepad?: Gamepad;
  group: Group;
  kind: Kind2;
  label: Label1;
  requires_rail?: RequiresRail;
}
/**
 * Controller -> server: immediate on every key transition + 25 Hz heartbeat.
 */
export interface KeysMsg {
  held: Held;
  seq: Seq;
  t?: T4;
  ts: Ts1;
}
/**
 * GET /api/policies row (04-runtime §13.1).
 */
export interface PolicyInfo {
  action_frame: ActionFrame;
  action_space: ActionSpace;
  path: Path;
  policy_id: PolicyId;
  policy_version: PolicyVersion;
  promoted?: Promoted;
}
/**
 * GET /api/profiles row (full posture via GET /api/profiles/{id}).
 */
export interface ProfileInfo {
  arms: Arms;
  created_at: CreatedAt;
  is_initial_condition: IsInitialCondition;
  name: Name2;
  notes: Notes;
  profile_id: ProfileId;
}
/**
 * Args for ``name == "save_profile"``.
 */
export interface SaveProfileArgs {
  name: Name3;
  notes?: Notes1;
}
/**
 * GET /api/scenes?kind=sim|twin row.
 */
export interface SceneInfo {
  cameras: Cameras;
  kind: Kind3;
  label: Label2;
  num_arms: NumArms;
  rail_flags: RailFlags;
  scene_id: SceneId;
}
/**
 * POST/GET /api/session response.
 */
export interface SessionInfo {
  arms: Arms1;
  epoch: Epoch1;
  mode: Mode1;
  session_id: SessionId1;
  state: State;
  streams: Streams;
}
/**
 * POST /api/session body.
 */
export interface SessionSpec {
  arms: Arms2;
  digital_twin_scene?: DigitalTwinScene;
  frames: Frames;
  kind: Kind4;
  mode: Mode2;
  policy?: Policy;
  sim_scene?: SimScene;
  start_from?: StartFrom;
  task?: Task;
}
export interface Frames {
  [k: string]: string;
}
/**
 * Args for ``name == "set_initial_condition"``.
 */
export interface SetInitialConditionArgs {
  profile_id?: ProfileId1;
}
/**
 * Named workcell posture snapshot; at most one initial condition per kind.
 */
export interface StateProfile {
  arms: Arms3;
  created_at?: CreatedAt1;
  is_initial_condition?: IsInitialCondition1;
  name: Name4;
  notes?: Notes2;
  profile_id?: ProfileId2;
  schema_version?: SchemaVersion;
  workcell_kind: WorkcellKind;
}
export interface Arms3 {
  [k: string]: ArmPosture;
}
/**
 * One arm's stored posture; ``q`` NEVER includes the rail slot.
 */
export interface ArmPosture {
  gripper_open_frac?: GripperOpenFrac;
  q: Q;
  rail_pos_m?: RailPosM;
}
/**
 * One 25 Hz telemetry frame.
 */
export interface TelemetryMsg {
  active_arm: ActiveArm;
  arms: Arms4;
  clearances: Clearances;
  collision: CollisionReport;
  controller_connected: ControllerConnected;
  dagger: DaggerStatus | null;
  episode: EpisodeStatus | null;
  epoch: Epoch2;
  inference: InferenceStatus | null;
  seq: Seq1;
  session?: SessionTelemetry | null;
  t?: T5;
  tracker?: TrackerTelemetry | null;
  ts: Ts3;
}
/**
 * Per-arm telemetry block.
 */
export interface ArmTelemetry {
  arm_id: ArmId2;
  connected: Connected1;
  ee_pose: PoseMsg;
  error_code: ErrorCode1;
  goto?: Goto;
  gripper_open_frac: GripperOpenFrac1;
  q: Q1;
  rail_pos_m: RailPosM1;
  stale?: Stale;
  warn_code?: WarnCode;
}
/**
 * Wire pose: position in m, orientation as wxyz unit quaternion.
 */
export interface PoseMsg {
  orientation: Orientation;
  position: Position;
}
/**
 * One monitored geometry pair at the measured config.
 */
export interface ClearanceItem {
  dist_m: DistM;
  pair: Pair;
}
/**
 * Gate verdict for one check; the UI shape (05-ui §2).
 */
export interface CollisionReport {
  blocked: Blocked;
  min_clearance_m?: MinClearanceM1;
  pairs?: Pairs1;
  severity: Severity;
  ts?: Ts2;
  violations?: Violations;
}
/**
 * DAgger session block; full shape per 12-dagger §11 (canonical).
 */
export interface DaggerStatus {
  control_mode: ControlMode;
  engaged_arm: EngagedArm;
  episodes_labeled?: EpisodesLabeled;
  frozen_arms?: FrozenArms;
  new_label_frames?: NewLabelFrames;
  policy_version: PolicyVersion1;
  staged_version?: StagedVersion;
  takeover_rate_ep?: TakeoverRateEp;
  takeover_rate_run?: TakeoverRateRun;
  trainer?: TrainerStatus | null;
}
/**
 * Trainer health; pydantic — rides telemetry (§11).
 */
export interface TrainerStatus {
  last_burst_loss?: LastBurstLoss;
  last_checkpoint_ts?: LastCheckpointTs;
  last_checkpoint_version?: LastCheckpointVersion;
  new_label_frames?: NewLabelFrames1;
  state: State1;
  steps_total?: StepsTotal;
}
/**
 * Episode recorder status (collect/DAgger).
 */
export interface EpisodeStatus {
  duration_s: DurationS;
  frames: Frames1;
  index: Index;
  state: State2;
}
/**
 * Inference block; same gate machinery, takeover = SAFETY ESCAPE.
 */
export interface InferenceStatus {
  control_mode: ControlMode;
  engaged_arm?: EngagedArm1;
  policy_version: PolicyVersion2;
}
/**
 * Additive session-lifecycle block (04-runtime §13.3).
 */
export interface SessionTelemetry {
  plan_status?: PlanStatus;
  start_from_progress?: StartFromProgress;
  state: State3;
  trainer_alive?: TrainerAlive;
}
/**
 * Vive-tracker block (13-tracker §3.5), additive.
 *
 * Device fields are populated even without a session; session fields
 * (``engaged_arm``, ``anchor_tcp``, ``target_tcp``) are ``None`` otherwise.
 * ``controller`` echoes the raw controller inputs (``None`` when the backend
 * reports no controller) and ``device_held`` the key codes the runtime
 * injects from them (13-tracker §1.1); a stale sample yields an empty list.
 */
export interface TrackerTelemetry {
  age_s?: AgeS;
  anchor_tcp?: PoseMsg | null;
  backend: Backend;
  clutch?: Clutch;
  controller?: ControllerTelemetry | null;
  detail?: Detail1;
  device_held?: DeviceHeld;
  engaged_arm?: EngagedArm2;
  object_name?: ObjectName;
  pose_raw?: PoseMsg | null;
  pose_world?: PoseMsg | null;
  rate_hz?: RateHz;
  seq?: Seq2;
  settings: TrackerSettingsMsg;
  status: Status;
  target_tcp?: PoseMsg | null;
}
/**
 * Raw Vive-controller input state (13-tracker §1.1), additive.
 *
 * Mirrors the libsurvive button/axis events for the tracked object. Axis
 * conventions: ``trigger`` 0..1; ``trackpad_x``/``trackpad_y`` -1..1 with
 * +y = top. ``trackpad_touch`` is finger contact, ``trackpad_click`` the
 * physical press. ``menu`` + ``system`` is the pairing combo (never mapped).
 */
export interface ControllerTelemetry {
  grip?: Grip;
  menu?: Menu;
  system?: System;
  trackpad_click?: TrackpadClick;
  trackpad_touch?: TrackpadTouch;
  trackpad_x?: TrackpadX;
  trackpad_y?: TrackpadY;
  trigger?: Trigger;
  trigger_pressed?: TriggerPressed;
}
/**
 * Live tracker teleop settings echoed in telemetry (13-tracker §3.5).
 */
export interface TrackerSettingsMsg {
  follow_rotation: FollowRotation;
  pos_scale: PosScale;
  yaw_deg: YawDeg;
}
/**
 * Args for ``name == "tracker_settings"`` (13-tracker §3.4).
 *
 * Every field is optional; omitted (``None``) fields leave the live runtime
 * setting unchanged.
 */
export interface TrackerSettingsArgs {
  follow_rotation?: FollowRotation1;
  pos_scale?: PosScale1;
  yaw_deg?: YawDeg1;
}
/**
 * GET /api/workcell response.
 */
export interface WorkcellStatus {
  arms: Arms5;
  available_kinds: AvailableKinds;
  cameras: Cameras1;
  kind: Kind5;
  policies_available?: PoliciesAvailable;
}
