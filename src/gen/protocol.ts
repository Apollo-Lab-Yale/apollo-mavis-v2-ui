/* AUTO-GENERATED from apollo-mavis-v2-core schemas — do not edit. */
/* core_version: 0.1.0 */

export type Detail = string;
export type Name =
  | "switch_arm"
  | "switch_arm_prev"
  | "takeover_toggle"
  | "episode_new"
  | "episode_save"
  | "episode_discard"
  | "reset_to_initial"
  | "save_profile"
  | "set_initial_condition"
  | "joint_target"
  | "tracker_settings"
  | "takeover"
  | "handback"
  | "train_now"
  | "goto_profile";
export type Ok = boolean;
export type T = "ack";
export type Name1 =
  | "switch_arm"
  | "switch_arm_prev"
  | "takeover_toggle"
  | "episode_new"
  | "episode_save"
  | "episode_discard"
  | "reset_to_initial"
  | "save_profile"
  | "set_initial_condition"
  | "joint_target"
  | "tracker_settings"
  | "takeover"
  | "handback"
  | "train_now"
  | "goto_profile";
export type T1 = "action";
export type CollisionSensitivity = number | null;
export type DryRun = boolean;
export type Op =
  "clear_errors" | "apply_backstops" | "recover" | "home_rail" | "set_collision_sensitivity";
export type AgeS = number | null;
export type ArmId = string;
export type BackstopsMatch = boolean | null;
export type CollisionSensitivity1 = number | null;
export type Detail1 = string;
export type ErrorCode = number;
export type GripperOpenFrac = number | null;
export type GripperRaw = number | null;
export type Detail2 = string;
export type JobId = string;
export type Op1 =
  "clear_errors" | "apply_backstops" | "recover" | "home_rail" | "set_collision_sensitivity";
export type Phase =
  | "queued"
  | "sweeping"
  | "planning"
  | "connecting"
  | "positioning"
  | "homing"
  | "verifying"
  | "done"
  | "failed";
export type Progress = number;
export type StartedAt = number | null;
export type MaintenanceBusy = boolean;
export type Mode = number | null;
export type Q = number[];
export type RailEnabled = boolean | null;
export type RailHomed = boolean | null;
export type RailPosM = number | null;
export type RailPresent = boolean | null;
export type RailRawMm = number | null;
export type Seq = number;
export type State = number | null;
export type Status = "off" | "connecting" | "running" | "stale" | "paused" | "error";
export type TcpLoadCogMm = number[];
export type TcpLoadKg = number | null;
export type TcpPose = number[];
export type WarnCode = number;
export type ArmId1 = string;
export type CollisionSensitivity2 = number | null;
export type Detail3 = string;
export type JobId1 = string | null;
export type Ok1 = boolean;
export type Op2 =
  "clear_errors" | "apply_backstops" | "recover" | "home_rail" | "set_collision_sensitivity";
export type Path = "monitor" | "session";
export type Assumptions = string[];
export type Clear = boolean;
export type FirstBlockedM = number | null;
export type FirstBlockedPair = string[];
export type InflationM = number;
export type MinClearanceAtM = number | null;
export type MinClearanceM = number | null;
export type MinClearancePair = string[];
export type CheckedRailPositions = number;
export type Clear1 = boolean;
export type Detail4 = string;
export type DurationS = number;
export type Needed = boolean;
export type Source = "current" | "keyframe" | "home" | "search";
export type TargetQ = number[];
export type Waypoints = number;
export type QChecked = number[];
export type SampleSeq = number;
export type SceneId = string;
export type StepM = number;
export type TravelM = number;
export type Status1 = "done" | "accepted" | "refused";
export type Warnings = string[];
export type ArmId2 = string;
export type Connected = boolean;
export type ErrorCode1 = number;
export type Gripper = "xarm" | "xarm_g2" | "none";
export type GripperForceCapable = boolean;
export type HasRail = boolean;
export type Ip = string | null;
export type JointLimits = [number, number][];
export type Reachable = "open" | "refused" | "unreachable" | "unknown";
export type CameraId = string;
export type Fps = number;
export type Kind = "v4l2" | "realsense" | "sim" | "twin";
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
export type MinClearanceM1 = number;
export type Pairs = [string, string][];
/**
 * Origin of the command stream a safety event refers to.
 */
export type CommandSource = "teleop" | "joint_jog" | "policy" | "takeover" | "planner";
export type T2 = "collision_event";
export type Ts = number;
export type At = string | null;
export type Detail5 = string;
export type Episodes = number;
export type Format = string;
export type Path1 = string | null;
export type State1 = "none" | "stale" | "fresh" | "running" | "failed";
export type Format1 = "lerobot_v3";
export type Out = string | null;
export type Arms = string[];
export type Cameras = string[];
export type Fps1 = number;
export type InUse = boolean;
export type Kind2 = ("hardware" | "sim") | null;
export type Layout = "episode_dirs" | "lerobot_v3";
export type ModifiedAt = string;
export type Namespace = string;
export type Path2 = string;
export type RepoId = string;
export type RobotType = string | null;
export type Root = string;
export type Task = string | null;
export type TotalEpisodes = number;
export type TotalFrames = number;
export type DefaultNamespace = string;
export type GenericRoot = string;
export type Root1 = string;
export type Subdir = string | null;
export type Auth = boolean;
export type BindHost = string;
export type CoordinatorAddr = string;
export type CoordinatorPort = number;
export type DaemonPort = number;
export type DataflowId = string | null;
export type DataflowName = string;
export type DataflowRestarts = number;
export type DataflowYaml = string | null;
export type Detail6 = string;
export type Enabled = boolean;
export type MachineId = string;
export type Detail7 = string;
export type Id = string;
export type Joined = boolean;
export type Placeholders = string[];
export type Registered = boolean;
export type Machines = DoraMachineInfo[];
export type MavisSchema = number;
export type NodeId = string;
export type Placeholders1 = string[];
export type ReattachCount = number;
export type State2 = "disabled" | "unavailable" | "attached" | "detached" | "closed";
export type ZenohConnect = string;
export type ZenohPort = number;
export type Audio = boolean;
export type DurationS1 = number;
export type EpisodeId = string;
export type ExportNote = string | null;
export type ExportOk = boolean;
export type Frames = number;
export type FramesDropped = number;
export type Index = number;
export type Open = boolean;
export type RecordedAt = string | null;
export type SessionId = string | null;
export type Task1 = string | null;
export type ActionSpace = string | null;
export type ArmId3 = string;
export type GripperOpenFrac1 = number | null;
export type Q1 = number[];
export type RailPosM1 = number | null;
export type Arms1 = EpisodePlaybackArm[];
export type DurationS2 = number;
export type EpisodeId1 = string;
export type Fps2 = number;
export type Frames1 = number;
export type Playable = boolean;
export type Reason = string;
export type RepoId1 = string;
export type Sources = string[];
export type Action = "goto_initial" | "play" | "stop";
export type EpisodeId2 = string;
export type RepoId2 = string;
export type Source1 = "state" | "delta_ee" | "abs_ee";
export type ProfileId = string;
export type Epoch = string;
export type Role = "controller" | "observer";
export type SessionId1 = string | null;
export type T3 = "hello";
export type ArmId4 = string;
export type Mode1 = "jog" | "goto";
export type Positions = number[];
export type Action1 = string;
export type Code = string;
export type Gamepad = string | null;
export type Group = "translate" | "rotate" | "gripper" | "rail" | "session" | "episode" | "tracker";
export type Kind3 = "held" | "discrete";
export type Label1 = string;
export type RequiresRail = boolean;
export type Held = string[];
export type Seq1 = number;
export type T4 = "keys";
export type Ts1 = number;
export type Channels = number;
export type Detail8 = string;
export type Kind4 = "pulse" | "fake" | "none";
export type Label2 = string;
export type Live1 = boolean;
export type MicId = string;
export type SampleRate = number;
export type Source2 = string | null;
export type Status2 = "no_backend" | "starting" | "absent" | "live" | "stalled" | "error";
export type RolloutsDir = string;
export type SessionDir = string;
export type SessionName = string;
export type PauseWhileTraining = boolean;
export type Resume = boolean;
export type SessionName1 = string;
export type WaitForTrainerReady = boolean;
export type CreatedAt = string;
export type LastUsedAt = string | null;
export type Path3 = string;
export type Rollouts = number;
export type SessionName2 = string;
export type Task2 = string | null;
export type ActionFrame = string;
export type ActionSpace1 = "delta_ee" | "abs_ee" | "joint";
export type Path4 = string;
export type PolicyId = string;
export type PolicyVersion = number;
export type Promoted = boolean;
export type ActsTotal = number;
export type Capabilities = string[];
export type ChunkDtS = number | null;
export type ChunkLen = number;
export type Detail9 = string;
export type Device = string;
export type ExtrinsicsSha = string | null;
export type Health = "ok" | "degraded" | "error";
export type LastComputeMs = number | null;
export type Loader = string;
export type MavisSchema1 = number;
export type NodeVersion = string;
export type PolicyId1 = string;
export type PolicyVersion1 = number;
export type RateHz = number;
export type ActionFrame1 = string;
export type ActionNames = string[];
export type ActionSpace2 = "delta_ee" | "abs_ee" | "joint";
export type Arms2 = string[];
export type CameraKeys = string[];
export type StateNames = string[];
export type Version = number;
export type SupportsReload = boolean;
export type UptimeS = number;
export type Arms3 = string[];
export type CreatedAt1 = string;
export type IsInitialCondition = boolean;
export type Name2 = string;
export type Notes = string;
export type ProfileId1 = string;
export type WorkcellKind = ("hardware" | "sim") | null;
export type Arms4 = string[];
export type Detail10 = string;
export type Ok2 = boolean;
export type ProfileId2 = string | null;
export type Status3 = "done" | "skipped" | "failed" | "cancelled" | "timeout" | "refused";
export type Name3 = string;
export type Notes1 = string;
export type SetInitial = boolean;
export type Cameras1 = string[];
export type Kind5 = "sim" | "twin";
export type Label3 = string;
export type NumArms = number;
export type RailFlags = boolean[];
export type SceneId1 = string;
export type ActionNames1 = string[];
export type ActionSpace3 = string | null;
export type ArmIds1 = string[];
export type CameraIds = string[];
export type TEC = number[] | null;
export type TWC = number[] | null;
export type Depth = boolean;
export type Distortion = number[];
export type Fps3 = number;
export type FrameRef = string;
export type Intrinsics = number[] | null;
export type Mount = string;
/**
 * @minItems 2
 * @maxItems 2
 */
export type Resolution1 = [number, number];
export type DatasetRoot = string | null;
export type DeprecatedKeys = string[];
export type Epoch1 = string;
export type Kind6 = ("hardware" | "sim") | null;
export type MavisSchema2 = number;
export type PolicySource = ("checkpoint" | "external") | null;
export type RunId = string | null;
export type SessionId2 = string | null;
export type Enabled1 = boolean;
export type GripperContextS = number;
export type GripperEpsFrac = number;
export type PosEpsM = number;
export type RailEpsM = number;
export type RotEpsRad = number;
export type Arms5 = string[];
export type Dataset = string | null;
export type DatasetResume = boolean;
export type DigitalTwinScene = string | null;
export type Kind7 = "hardware" | "sim";
export type Mode2 = "teleop" | "collect" | "dagger" | "inference";
export type Policy = string | null;
export type PolicySource1 = "checkpoint" | "external";
export type ReturnToStart = boolean;
export type SimScene = string | null;
export type SpeedScale = number;
export type StartFrom = string;
export type Task3 = string | null;
export type State3 = string;
export type StateNames1 = string[];
export type Arms6 = string[];
export type Epoch2 = string;
export type FaultDetail = string;
export type Kind8 = "hardware" | "sim";
export type Mode3 = "teleop" | "collect" | "dagger" | "inference";
export type PolicySource2 = "checkpoint" | "external";
export type SessionId3 = string;
export type SpeedScale1 = number;
export type State4 = string;
export type Streams = string[];
export type ProfileId3 = string | null;
export type GripperOpenFrac2 = number;
/**
 * @minItems 7
 * @maxItems 7
 */
export type Q2 = [number, number, number, number, number, number, number];
export type RailPosM2 = number | null;
export type CreatedAt2 = string;
export type IsInitialCondition1 = boolean;
export type Name4 = string;
export type Notes2 = string;
export type ProfileId4 = string;
export type SchemaVersion = number;
export type WorkcellKind1 = "hardware" | "sim";
export type ArmId5 = string | null;
export type ActiveArm = string | null;
export type ArmId6 = string;
export type CollisionSensitivity3 = number | null;
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
export type ErrorCode2 = number;
export type FaultDetail1 = string;
export type Goto = ("planning" | "executing" | "failed") | null;
export type GripperOpenFrac3 = number;
export type Q3 = number[];
export type RailPosM3 = number | null;
export type Recovering = boolean;
export type Stale = boolean;
export type WarnCode1 = number;
export type Arms8 = ArmTelemetry[];
export type DistM = number;
/**
 * @minItems 2
 * @maxItems 2
 */
export type Pair = [string, string];
export type Clearances = ClearanceItem[];
export type Blocked = boolean;
export type MinClearanceM2 = number;
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
export type Detail11 = string;
export type ExpertFramesSession = number;
export type NoviceFramesSession = number;
export type Phase1 = "waiting_trainer" | "rollout" | "training" | "error";
export type PolicyVersionActing = number | null;
export type RolloutsSaved = number;
export type SessionDir1 = string;
export type SessionName3 = string;
export type Detail12 = string;
export type MavisSchema3 = number;
export type NodeVersion1 = string;
export type PolicyVersion2 = number;
export type Progress1 = number;
export type SessionId4 = string | null;
export type State5 = "idle" | "preparing" | "training" | "ready" | "error";
export type TrainerId = string;
export type UptimeS1 = number;
export type TrainerAgeS = number | null;
export type TrainerAlive = boolean;
export type PolicyStale = boolean;
export type PolicyVersion3 = string | null;
export type StagedVersion = string | null;
export type TakeoverRateEp = number;
export type TakeoverRateRun = number;
export type LastBurstLoss = number | null;
export type LastCheckpointTs = number | null;
export type LastCheckpointVersion = number | null;
export type NewLabelFrames1 = number;
export type State6 = "starting" | "idle" | "training" | "dead";
export type StepsTotal = number;
export type Detail13 = string;
export type Done = number;
export type Format2 = string;
export type Phase2 = "scanning" | "videos" | "data" | "meta" | "validating" | "done" | "failed";
export type RepoId3 = string;
export type Total = number;
export type Detail14 = string;
export type DurationS3 = number;
export type Frames4 = number;
export type FramesSkipped = number;
export type Index1 = number | null;
export type RepoId4 = string | null;
export type State7 = "idle" | "recording" | "saving" | "returning";
export type TotalEpisodes1 = number;
export type TotalFrames1 = number;
export type Epoch3 = string;
export type ActionAgeS = number | null;
export type ActionsLate = number;
export type Capabilities1 = string[];
export type DataflowId1 = string | null;
export type DataflowRestarts1 = number;
export type Detail15 = string;
export type DroppedInputs = number;
export type Enabled2 = boolean;
export type IdleReader = "off" | "running" | "paused" | "stale";
export type NodeId1 = string;
export type PolicyArms = string[];
export type PolicyAttached = boolean;
export type PolicyId2 = string | null;
export type PolicyRateHz = number | null;
export type PolicyVersion4 = number | null;
export type ReattachCount1 = number;
export type SpecAgeS = number | null;
export type State8 = "disabled" | "unavailable" | "attached" | "detached" | "closed";
export type VersionChangesMidEpisode = number;
export type Arms9 = ArmMonitorTelemetry[];
export type Enabled3 = boolean;
export type ArmId7 = string;
export type CameraId1 = string;
export type Detail16 = string;
export type Fps4 = number;
export type Joint1OffsetRad = number;
export type MaskFraction = number;
export type RailFallbackM = number | null;
export type Status4 = "off" | "waiting" | "live" | "stale" | "error";
export type StreamId = string;
export type Overlays = TwinOverlayTelemetry[];
export type Paused = boolean;
export type EngagedArm1 = string | null;
export type PolicyStale1 = boolean;
export type PolicyVersion5 = string | null;
export type AgeS1 = number | null;
export type Clipping = boolean;
export type Detail17 = string;
export type EnvMax = number[];
export type EnvMin = number[];
export type MicId1 = string;
export type Overruns = number;
export type PeakDbfs = number | null;
export type RateHz1 = number;
export type RmsDbfs = number | null;
export type SampleRate1 = number;
export type Seq2 = number;
export type Status5 = "no_backend" | "starting" | "absent" | "live" | "stalled" | "error";
export type Seq3 = number;
export type EndedAt = string;
export type Kind9 = string;
export type Mode4 = string;
export type Reason1 = string;
export type SessionId5 = string;
export type Bringup = ArmBringupTelemetry[] | null;
export type ArmId8 = string;
export type Detail18 = string;
export type Status6 = "pending" | "ok" | "warning" | "error";
export type Step = string;
export type FaultDetail2 = string;
export type Kind10 = string | null;
export type Mode5 = string | null;
export type PlanStatus = string | null;
export type SessionId6 = string | null;
export type StartFromProgress = number | null;
export type State9 = string;
export type TrainerAlive1 = boolean | null;
export type TranslateFrame = ("camera" | "world" | "base") | null;
export type T5 = "telemetry";
export type AgeS2 = number | null;
export type Backend = "libsurvive" | "fake" | "none";
export type AppliedYawDeg = number | null;
export type BackupPath = string | null;
export type BaseStationInstalledAt = number | null;
export type ControllerStill = boolean | null;
export type Detail19 = string;
export type ElapsedS = number | null;
export type FitChecks = string[];
export type FitResidualDeg = number | null;
export type FittedYawDeg = number | null;
export type InstalledPath = string | null;
export type Kind11 = "none" | "base_station" | "yaw";
export type Channel = number | null;
export type Index2 = number;
export type Reference = boolean;
export type Scenes = number;
export type Serial = string | null;
export type Lighthouses = LighthouseStatus[];
export type NextPoint = ("start" | "left" | "forward" | "right" | "back" | "up" | "down") | null;
export type Phase3 =
  | "idle"
  | "starting"
  | "capturing"
  | "validating"
  | "fitting"
  | "installing"
  | "done"
  | "failed"
  | "aborted";
export type Scenes1 = number;
export type StartedAt1 = number | null;
export type StationsVisible = number;
export type MaxStepMm = number;
export type Passed = boolean;
export type Samples = number;
/**
 * @minItems 3
 * @maxItems 3
 */
export type StdMm = [number, number, number];
export type ThresholdStdMm = number;
export type ThresholdStepMm = number;
export type YawCalibratedAt = number | null;
export type Label4 = "start" | "left" | "forward" | "right" | "back" | "up" | "down";
export type YawPoints = YawGesturePoint[];
export type YawValid = boolean;
export type Charging = boolean | null;
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
export type ControllerAgeS = number | null;
export type Detail20 = string;
export type DeviceAction = string | null;
export type DeviceHeld = string[];
export type DonglePresent = boolean | null;
export type EngagedArm2 = string | null;
export type ObjectName = string;
export type Objects = string[];
export type RateHz2 = number;
export type Seq4 = number;
export type FilterBeta = number;
export type FilterEnabled = boolean;
export type FilterMinCutoffHz = number;
export type FollowRotation = boolean;
export type PosScale = number;
export type YawDeg = number;
export type Status7 = "no_backend" | "starting" | "searching" | "tracking" | "stale" | "error";
export type Ts3 = number;
export type Kind12 = "base_station" | "yaw";
export type Op3 = "start" | "capture" | "validate" | "install" | "apply" | "abort";
export type Point = ("start" | "left" | "forward" | "right" | "back" | "up" | "down") | null;
export type FilterBeta1 = number | null;
export type FilterEnabled1 = boolean | null;
export type FilterMinCutoffHz1 = number | null;
export type FollowRotation1 = boolean | null;
export type PosScale1 = number | null;
export type YawDeg1 = number | null;
export type Arms10 = ArmStatusInfo[];
export type AvailableKinds = ("hardware" | "sim")[];
export type Cameras3 = CameraInfo[];
export type HardwareReady = boolean;
export type Kind13 = "hardware" | "sim";
export type PoliciesAvailable = boolean;

export interface ApolloProtocol {
  AckMsg?: AckMsg;
  ActionMsg?: ActionMsg;
  ArmMaintenanceRequest?: ArmMaintenanceRequest;
  ArmMaintenanceResult?: ArmMaintenanceResult;
  ArmStatusInfo?: ArmStatusInfo;
  CameraInfo?: CameraInfo;
  CollisionEvent?: CollisionEvent;
  DatasetExportInfo?: DatasetExportInfo;
  DatasetExportRequest?: DatasetExportRequest;
  DatasetInfo?: DatasetInfo;
  DatasetLayoutInfo?: DatasetLayoutInfo;
  DatasetNamespaceInfo?: DatasetNamespaceInfo;
  DoraInfo?: DoraInfo;
  EpisodeInfo?: EpisodeInfo;
  EpisodePlaybackInfo?: EpisodePlaybackInfo;
  EpisodePlaybackRequest?: EpisodePlaybackRequest;
  GotoProfileArgs?: GotoProfileArgs;
  HelloMsg?: HelloMsg;
  JointTargetArgs?: JointTargetArgs;
  KeymapEntry?: KeymapEntry;
  KeysMsg?: KeysMsg;
  MicrophoneInfo?: MicrophoneInfo;
  OnlineDaggerAnnounce?: OnlineDaggerAnnounce;
  OnlineDaggerConfig?: OnlineDaggerConfig;
  OnlineDaggerSessionInfo?: OnlineDaggerSessionInfo;
  PolicyInfo?: PolicyInfo;
  PolicySpecAnnounce?: PolicySpecAnnounce;
  ProfileInfo?: ProfileInfo;
  ReturnHomeResult?: ReturnHomeResult;
  SaveProfileArgs?: SaveProfileArgs;
  SceneInfo?: SceneInfo;
  SessionAnnounce?: SessionAnnounce;
  SessionInfo?: SessionInfo;
  SessionSpec?: SessionSpec;
  SetInitialConditionArgs?: SetInitialConditionArgs;
  StateProfile?: StateProfile;
  SwitchArmArgs?: SwitchArmArgs;
  TelemetryMsg?: TelemetryMsg;
  TrackerCalibrationCommand?: TrackerCalibrationCommand;
  TrackerCalibrationStatus?: TrackerCalibrationStatus;
  TrackerSettingsArgs?: TrackerSettingsArgs;
  TrainerStatusAnnounce?: TrainerStatusAnnounce;
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
 * ``POST /api/hardware/arms/{arm_id}/maintenance`` body.
 *
 * ``collision_sensitivity`` (additive, 2026-09-11) is the level the
 * ``set_collision_sensitivity`` op writes - REQUIRED for that op and 1, 2 or 3
 * only (the operator's admissible range; 0 = off, 4 and 5 false-trigger under
 * payload, so they are refused at the wire: 422). Every other op ignores it.
 */
export interface ArmMaintenanceRequest {
  collision_sensitivity?: CollisionSensitivity;
  dry_run?: DryRun;
  op: Op;
}
/**
 * Outcome of one maintenance op (REST response; 200 whether or not ``ok``).
 *
 * ``sdk_codes`` maps every SDK call the op made to its return code, in call
 * order (``{"clean_error": 0, "clean_warn": 0}``); ``warnings`` lists the
 * non-fatal ``apply_backstops`` codes (e.g. a self-collision tool model the
 * firmware rejected). ``before``/``after`` are ``None`` when the executing
 * path had no monitor sample (session path, or the monitor never connected).
 * ``rail_sweep`` is the twin verdict for ``home_rail`` (dry-run or real;
 * ``None`` for the other ops) — a refused sweep is ``ok=False`` with the
 * verdict and an empty ``sdk_codes`` (zero writes).
 *
 * phase-09d (additive): ``status`` says how the op ran — ``"done"`` (the
 * default; synchronous, 200), ``"accepted"`` (an asynchronous ``RailHomingJob``
 * started because the posture needs a planned pre-positioning motion; 202,
 * ``job_id`` set, ``ok`` True, ``sdk_codes`` empty so far — progress rides
 * ``ArmMonitorTelemetry.maintenance`` and the job's final result, again an
 * ``ArmMaintenanceResult`` with ``status: done`` and the same ``job_id``,
 * replaces it at ``GET .../maintenance/last``) or ``"refused"`` (nothing ran,
 * ``ok`` False, suggestion in ``detail``).
 *
 * 2026-09-11 (additive): ``collision_sensitivity`` is the level the
 * ``set_collision_sensitivity`` op WROTE (1..3; ``None`` for every other op
 * and for a refusal) - the session path has no monitor sample to carry the
 * read-back, so the UI toasts this value; ``ok`` there means the SDK
 * accepted the write, on the monitor path that the rich-frame read-back
 * equals it.
 */
export interface ArmMaintenanceResult {
  after?: ArmMonitorTelemetry | null;
  arm_id: ArmId1;
  before?: ArmMonitorTelemetry | null;
  collision_sensitivity?: CollisionSensitivity2;
  detail?: Detail3;
  job_id?: JobId1;
  ok: Ok1;
  op: Op2;
  path: Path;
  rail_sweep?: RailSweepVerdict | null;
  sdk_codes?: SdkCodes;
  status?: Status1;
  warnings?: Warnings;
}
/**
 * One arm as seen by the read-only state monitor.
 *
 * Every field but ``arm_id`` defaults so an arm the monitor never reached
 * still validates. ``q`` is the controller's 7 joint angles in radians,
 * controller order - an IDENTITY mapping onto the twin's ``<arm>_joint1..7``
 * (verified 2026-09-04: no pi offset). ``tcp_pose`` is the controller FLANGE
 * pose (``tcp_offset`` zero) in the arm base frame, ``[x, y, z]`` m followed
 * by ``[roll, pitch, yaw]`` rad (mm/deg converted by the hardware package); the
 * RPY is the xArm extrinsic-XYZ convention (``Rz(yaw) . Ry(pitch) . Rx(roll)``).
 * The twin's ``link_tcp`` = flange (+) (Rz(pi), +0.172 m along tool z) on a
 * gripper arm - that is ``ArmState.ee_pose``, NOT this field.
 * ``rail_pos_m`` is filled only while the track reports homed (``on_zero ==
 * 1``) AND enabled - the raw register is meaningless otherwise - whereas
 * ``rail_raw_mm`` is always reported when the registers are readable.
 * ``gripper_open_frac`` is 0 closed .. 1 open (``None`` for gripper
 * ``"none"``); ``gripper_raw`` is the SDK reading for diagnosis.
 * ``error_code``/``warn_code`` are the controller's codes (e.g. 19 = End
 * Module Communication Error); ``state`` 4 = stopped / not enabled.
 *
 * phase-09b read-back (slow poll, additive): ``collision_sensitivity`` /
 * ``tcp_load_kg`` / ``tcp_load_cog_mm`` are the controller's CURRENT
 * safety parameters; ``backstops_match`` is the runtime's comparison against
 * the arm's ``ArmConfig`` (sensitivity equal, load within 0.05 kg, centre of
 * gravity within 10 mm; ``None`` = not compared) and ``maintenance_busy`` is
 * true while a maintenance op executes on this arm. Since 2026-09-11 the
 * sensitivity term of ``backstops_match`` compares against the level the
 * operator last REQUESTED through the ``set_collision_sensitivity``
 * maintenance op when one is set (the runtime remembers it per arm until the
 * next driver connect re-applies the config value), so an intentional
 * override does not read as a mismatch; ``collision_sensitivity`` itself
 * stays the raw controller read-back - the UI's sensitivity control shows
 * exactly this value, never an optimistic one.
 *
 * phase-09d (additive): ``maintenance`` is the live :class:`MaintenanceProgress`
 * of an asynchronous job (rail homing that first needs a planned
 * pre-positioning motion) on this arm, ``None`` when no job exists;
 * ``maintenance_busy`` stays true for the job's whole life.
 */
export interface ArmMonitorTelemetry {
  age_s?: AgeS;
  arm_id: ArmId;
  backstops_match?: BackstopsMatch;
  collision_sensitivity?: CollisionSensitivity1;
  detail?: Detail1;
  error_code?: ErrorCode;
  gripper_open_frac?: GripperOpenFrac;
  gripper_raw?: GripperRaw;
  maintenance?: MaintenanceProgress | null;
  maintenance_busy?: MaintenanceBusy;
  mode?: Mode;
  q?: Q;
  rail_enabled?: RailEnabled;
  rail_homed?: RailHomed;
  rail_pos_m?: RailPosM;
  rail_present?: RailPresent;
  rail_raw_mm?: RailRawMm;
  seq?: Seq;
  state?: State;
  status?: Status;
  tcp_load_cog_mm?: TcpLoadCogMm;
  tcp_load_kg?: TcpLoadKg;
  tcp_pose?: TcpPose;
  warn_code?: WarnCode;
}
/**
 * Live progress of an asynchronous maintenance job on one arm (phase-09d).
 *
 * Rides :attr:`ArmMonitorTelemetry.maintenance` while a ``RailHomingJob`` runs
 * (``None`` when no job exists) so the UI's Home-rail sheet can list the
 * phases as they happen. ``job_id`` matches the ``202`` response's
 * ``ArmMaintenanceResult.job_id``; ``progress`` is a coarse 0..1 estimate
 * (phase index, plus the waypoint fraction while ``positioning``);
 * ``started_at`` is unix seconds. How long a terminal ``done`` / ``failed``
 * stays visible is runtime territory (04-runtime §13.3); the final
 * ``ArmMaintenanceResult`` is fetched from ``GET .../maintenance/last``.
 */
export interface MaintenanceProgress {
  detail?: Detail2;
  job_id: JobId;
  op: Op1;
  phase: Phase;
  progress?: Progress;
  started_at?: StartedAt;
}
/**
 * Digital-twin rail sweep that gates ``home_rail`` (phase-09c).
 *
 * The carriage position is UNKNOWN while the track is unhomed, so the runtime
 * sweeps the full travel: it poses the twin at the arm's current 7 joints
 * (``q_checked``), the other arm(s) at their last monitor sample
 * (``other_arms``: q7 + rail position, ``rail_fallback_m`` when the rail is
 * unknown — recorded in ``assumptions``), and steps the target arm's rail
 * slot from 0 to ``travel_m`` in ``step_m`` increments, checking every
 * monitored geometry pair at ``inflation_m``. ``clear`` iff no step violates;
 * otherwise ``first_blocked_m`` / ``first_blocked_pair`` name the first
 * blocking position and pair. ``min_clearance_*`` report the tightest pair
 * over the whole sweep (``None`` when no pair was measured). ``sample_seq``
 * is the monitor sample the posture came from; the executing monitor
 * re-samples and refuses if the joints moved since. ``pre_position``
 * (phase-09d, additive) carries the planned pre-positioning motion when the
 * posture is not clear (``needed`` True) or says none is needed; ``None`` =
 * a pre-09d producer / planning not evaluated.
 */
export interface RailSweepVerdict {
  assumptions?: Assumptions;
  clear: Clear;
  first_blocked_m?: FirstBlockedM;
  first_blocked_pair?: FirstBlockedPair;
  inflation_m: InflationM;
  min_clearance_at_m?: MinClearanceAtM;
  min_clearance_m?: MinClearanceM;
  min_clearance_pair?: MinClearancePair;
  other_arms?: OtherArms;
  pre_position?: PrePositionPlan | null;
  q_checked?: QChecked;
  sample_seq?: SampleSeq;
  scene_id: SceneId;
  step_m: StepM;
  travel_m?: TravelM;
}
export interface OtherArms {
  [k: string]: number[];
}
/**
 * Twin-planned pre-positioning motion that makes ``home_rail`` possible (phase-09d).
 *
 * Rides :attr:`RailSweepVerdict.pre_position`. ``needed`` is ``False`` when
 * the arm's CURRENT posture is already sweep-clear (the rail homes with the
 * joints untouched, 09c path). Otherwise the runtime tries candidate postures
 * in order (``source``: the scene keyframe's 7 joints for this arm, then the
 * ``<arm>_home`` keyframe; ``"search"`` is reserved for a sampled posture
 * around a candidate and is not produced in phase-09d) and keeps the first
 * that is sweep-clear over the full travel AND reachable by a twin RRT-Connect
 * plan from the current posture whose EVERY waypoint is collision-free for
 * EVERY rail position (``checked_rail_positions`` = 131 at 5 mm steps - the
 * carriage is unknown, so the path must be position-agnostic; this check is
 * the ONLY safety basis of the motion). ``clear`` is that verdict;
 * ``needed and not clear`` means no plan was found and the op is refused
 * (``detail`` tells the operator what to do, e.g. fold the arm toward the
 * factory-zero posture in Studio and retry). ``duration_s`` is the estimated
 * execution time at ``speed_scale`` 0.1 so the UI can say "~X s".
 */
export interface PrePositionPlan {
  checked_rail_positions?: CheckedRailPositions;
  clear?: Clear1;
  detail?: Detail4;
  duration_s?: DurationS;
  needed: Needed;
  source?: Source;
  target_q?: TargetQ;
  waypoints?: Waypoints;
}
export interface SdkCodes {
  [k: string]: number;
}
/**
 * Landing-page arm card.
 */
export interface ArmStatusInfo {
  arm_id: ArmId2;
  connected: Connected;
  error_code: ErrorCode1;
  gripper: Gripper;
  gripper_force_capable: GripperForceCapable;
  has_rail: HasRail;
  ip: Ip;
  joint_limits: JointLimits;
  reachable?: Reachable;
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
  min_clearance_m: MinClearanceM1;
  pairs: Pairs;
  source?: CommandSource | null;
  t?: T2;
  ts: Ts;
}
/**
 * ``manifest.last_export`` as the REST sees it (10-frames §11.5; 04-runtime §10.6).
 *
 * ``state``: ``none`` = never exported, ``fresh`` = the export matches the episode
 * set, ``stale`` = an episode was added / deleted since, ``running`` = the export
 * job is on it right now (process-local), ``failed`` = the last job failed
 * (``detail`` carries the reason, until the next success).
 */
export interface DatasetExportInfo {
  at?: At;
  detail?: Detail5;
  episodes?: Episodes;
  format?: Format;
  path?: Path1;
  state: State1;
}
/**
 * ``POST /api/datasets/{ns}/{name}/export`` body (04-runtime §13.1).
 */
export interface DatasetExportRequest {
  format?: Format1;
  out?: Out;
}
/**
 * ``GET /api/datasets`` row (2026-09-07; 04-runtime §10.6, 10-frames §11): one
 * dataset under ``datasets_root``, read from ``manifest.json`` + the per-episode
 * ``episode.json`` sidecars — no lerobot import, so the list is cheap. ``layout``
 * ``episode_dirs`` is the primary per-episode store; ``lerobot_v3`` is a legacy
 * phase-07 tree (``meta/info.json``), listed read-only. ``kind`` / ``task`` come
 * from the most recent ``sessions/session_*.json`` sidecar (None without one).
 * ``in_use`` = the active session records into it (deleting the OPEN episode is
 * then 409; every other episode can go).
 *
 * ``namespace`` / ``path`` (additive, 2026-09-08; 15-online-dagger D5): dataset roots
 * are per-namespace now (``bc_demo/<name>`` -> ``~/data/bc_demo/<name>``,
 * ``online_dagger/<s>`` -> ``~/data/online_dagger/<s>/rollouts``, everything else under
 * ``datasets_root/<ns>/<name>``), so the row spells its namespace and the REAL
 * folder for the UI to show; both default to "" so an older runtime still
 * validates (``root`` keeps meaning the absolute dataset directory).
 */
export interface DatasetInfo {
  arms?: Arms;
  cameras?: Cameras;
  export?: DatasetExportInfo | null;
  fps: Fps1;
  in_use?: InUse;
  kind?: Kind2;
  layout?: Layout;
  modified_at: ModifiedAt;
  namespace?: Namespace;
  path?: Path2;
  repo_id: RepoId;
  robot_type?: RobotType;
  root: Root;
  task?: Task;
  total_episodes: TotalEpisodes;
  total_frames: TotalFrames;
}
/**
 * ``GET /api/datasets/layout`` (15-online-dagger §7; 2026-09-08): where datasets live,
 * so the UI shows the REAL folder in its previews and never hard-codes a
 * namespace. A bare ``dataset: "<name>"`` resolves into ``default_namespace``;
 * a namespace absent from ``namespaces`` lives at ``<generic_root>/<ns>/<name>``.
 */
export interface DatasetLayoutInfo {
  default_namespace: DefaultNamespace;
  generic_root: GenericRoot;
  namespaces: Namespaces;
}
export interface Namespaces {
  [k: string]: DatasetNamespaceInfo;
}
/**
 * One mapped dataset namespace (``DatasetLayoutInfo.namespaces[ns]``; 15-online-dagger
 * §7 / D5): its datasets live at ``<root>/<name>`` or, with ``subdir``, at
 * ``<root>/<name>/<subdir>`` (``online_dagger`` -> ``~/data/online_dagger/<s>/rollouts``).
 */
export interface DatasetNamespaceInfo {
  root: Root1;
  subdir?: Subdir;
}
/**
 * ``GET /api/dora`` (14-dora §2.6): connection facts for foreign clients. The
 * auth token is deliberately NOT part of this model (§9).
 */
export interface DoraInfo {
  auth?: Auth;
  bind_host?: BindHost;
  coordinator_addr?: CoordinatorAddr;
  coordinator_port?: CoordinatorPort;
  daemon_port?: DaemonPort;
  dataflow_id?: DataflowId;
  dataflow_name?: DataflowName;
  dataflow_restarts?: DataflowRestarts;
  dataflow_yaml?: DataflowYaml;
  detail?: Detail6;
  enabled?: Enabled;
  machine_id?: MachineId;
  machines?: Machines;
  mavis_schema?: MavisSchema;
  node_id?: NodeId;
  placeholders?: Placeholders1;
  reattach_count?: ReattachCount;
  state?: State2;
  zenoh_connect?: ZenohConnect;
  zenoh_port?: ZenohPort;
}
/**
 * One configured remote consumer machine (``dora.machines``; 14-dora §2.6/§9, §16.1).
 *
 * ``registered`` = its daemon is registered at the coordinator (rescan); ``joined`` = its
 * placeholders are rendered in the running dataflow (after ``POST /api/dora/machines/
 * {id}/join`` and the remote consumer's attach cleared dora's multi-machine start barrier);
 * ``detail`` explains a refused / expired join.
 */
export interface DoraMachineInfo {
  detail?: Detail7;
  id: Id;
  joined?: Joined;
  placeholders?: Placeholders;
  registered?: Registered;
}
/**
 * ``GET /api/datasets/{ns}/{name}/episodes`` row: one saved episode directory
 * (10-frames §11.3 / §11.4), read from its ``episode.json`` only.
 */
export interface EpisodeInfo {
  audio?: Audio;
  duration_s: DurationS1;
  episode_id: EpisodeId;
  export_note?: ExportNote;
  export_ok?: ExportOk;
  frames: Frames;
  frames_dropped?: FramesDropped;
  index: Index;
  open?: Open;
  recorded_at?: RecordedAt;
  session_id?: SessionId;
  task?: Task1;
}
/**
 * ``GET /api/datasets/{ns}/{name}/episodes/{id}/playback`` (2026-09-10; operator
 * request: a **Playback** button on every episode row of the Welcome page's Datasets
 * panel, 05-ui §8.1 item 7).
 *
 * What a playback of this episode WOULD do, read from the episode directory only — no
 * session needed, so the dialog can open and explain itself before anything moves. The
 * two motion buttons ride ``POST /api/session/playback`` and do need one.
 *
 * ``playable`` false + ``reason`` covers every case the runtime would refuse: no
 * session, a session whose arms or workcell kind do not match the recording, a legacy
 * tree, an episode whose parquet is missing or unreadable. The UI shows ``reason``
 * verbatim instead of letting the operator meet a 409.
 */
export interface EpisodePlaybackInfo {
  action_space?: ActionSpace;
  arms: Arms1;
  duration_s: DurationS2;
  episode_id: EpisodeId1;
  fps: Fps2;
  frames: Frames1;
  playable: Playable;
  reason?: Reason;
  repo_id: RepoId1;
  sources?: Sources;
}
/**
 * One arm's state at an episode's FIRST recorded frame (2026-09-10).
 *
 * Read out of ``frames.parquet``'s ``observation.state`` row 0 by the per-dim names
 * the dataset's own manifest carries (10-frames §6.1 / §7), so an episode recorded
 * with a different arm set or without a track still reads correctly.
 */
export interface EpisodePlaybackArm {
  arm_id: ArmId3;
  gripper_open_frac?: GripperOpenFrac1;
  q: Q1;
  rail_pos_m?: RailPosM1;
}
/**
 * ``POST /api/session/playback`` body (2026-09-10).
 *
 * ``goto_initial`` walks the arms to the episode's first frame and is SYNCHRONOUS,
 * like ``return_home``: the dialog awaits it and only then enables **Playback**, which
 * is the operator's rule — you cannot replay a trajectory from the wrong place.
 * ``play`` streams the recorded trajectory through the same twin-planned, gated
 * executor; ``stop`` cancels whatever is in flight.
 *
 * ``source`` (2026-09-11) picks WHAT is replayed on ``play``: ``state`` (the default) is
 * the joint replay of ``observation.state``; ``delta_ee`` / ``abs_ee`` replay the
 * recorded ``action`` / ``action.abs_ee`` column through the executor path the policy
 * uses (``dagger/step.py``) inside the current session's control loop - refused with
 * ``ok: false`` on hardware sessions until the operator admits it, and when the
 * column is absent from the episode.
 */
export interface EpisodePlaybackRequest {
  action: Action;
  episode_id: EpisodeId2;
  repo_id: RepoId2;
  source?: Source1;
}
/**
 * Args for ``name == "goto_profile"`` (2026-09-08).
 *
 * Move the session's arms to the SAVED profile ``profile_id`` — operator-
 * requested motion only: the runtime plans it on the twin and executes it
 * through the same gated, cancellable path as return-to-initial (04-runtime
 * §10.5). Unlike ``set_initial_condition`` there is no "current state"
 * default, so ``profile_id`` is REQUIRED. Its pattern is the ProfileStore id
 * charset (uuid4 hex; also the ``profile:<id>`` half of ``START_FROM_RE``),
 * so a malformed id is refused at the wire (``ack.ok == false``) instead of
 * surfacing as a store error later.
 *
 * ``extra="forbid"``: anything but ``profile_id`` is a client bug and is
 * rejected rather than silently ignored (pydantic's default).
 */
export interface GotoProfileArgs {
  profile_id: ProfileId;
}
/**
 * Server -> client, immediately after WS accept.
 */
export interface HelloMsg {
  epoch: Epoch;
  role: Role;
  session_id: SessionId1;
  t?: T3;
}
/**
 * Args for ``name == "joint_target"``.
 */
export interface JointTargetArgs {
  arm_id: ArmId4;
  mode: Mode1;
  positions: Positions;
}
/**
 * One keyboard binding row (optionally mirrored on the gamepad).
 */
export interface KeymapEntry {
  action: Action1;
  code: Code;
  gamepad?: Gamepad;
  group: Group;
  kind: Kind3;
  label: Label1;
  requires_rail?: RequiresRail;
}
/**
 * Controller -> server: immediate on every key transition + 25 Hz heartbeat.
 */
export interface KeysMsg {
  held: Held;
  seq: Seq1;
  t?: T4;
  ts: Ts1;
}
/**
 * GET /api/microphones row (RØDE NT-USB Mini on the view arm, 05-ui §8.1).
 */
export interface MicrophoneInfo {
  channels?: Channels;
  detail?: Detail8;
  kind: Kind4;
  label: Label2;
  live: Live1;
  mic_id: MicId;
  sample_rate: SampleRate;
  source: Source2;
  status: Status2;
}
/**
 * ``SessionAnnounce.online_dagger`` (15-online-dagger §6): the paths the trainer node
 * needs — the session directory and the rollouts dataset it reads (a MAVIS
 * episode-directory dataset with the ``actor`` column). The trainer keeps its own
 * artefacts wherever it likes (the skill suggests ``<session_dir>/trainer/``; the
 * runtime never reads them). Field order is the contract (both goldens pin it).
 */
export interface OnlineDaggerAnnounce {
  rollouts_dir: RolloutsDir;
  session_dir: SessionDir;
  session_name: SessionName;
}
/**
 * Online DAgger session parameters (15-online-dagger §5; phase-14, 2026-09-08).
 *
 * The runtime is the algorithm-agnostic SHELL (operator decision 2026-09-08): it
 * performs rollouts, exposes take-over / hand-back, labels every step novice /
 * expert, saves the kept rollouts and reports what the trainer says. Which DAgger
 * variant runs, its hyper-parameters and every training artefact belong to the
 * trainer node in the policy repo, so this block carries NO algorithm settings
 * — only what the shell itself needs: the session directory name, whether an
 * existing one is continued, and the two generic gates on ``episode_new``.
 *
 * ``extra="forbid"``: an unknown key is a 422 at POST, never silently dropped —
 * a hyper-parameter typed here by mistake would otherwise vanish while the
 * operator believes it travelled (the trainer configures itself; the runtime
 * never forwards hyper-parameters).
 */
export interface OnlineDaggerConfig {
  pause_while_training?: PauseWhileTraining;
  resume?: Resume;
  session_name: SessionName1;
  wait_for_trainer_ready?: WaitForTrainerReady;
}
/**
 * ``GET /api/online_dagger/sessions`` row (15-online-dagger §3/§5; 2026-09-08): one
 * ``session.json`` under the ``online_dagger`` root, for the launch sheet's resume
 * pill. ``rollouts`` is the session's kept-rollout count (``current.rollouts_saved``,
 * what a resume continues from); rows come newest ``last_used_at`` first. The runtime
 * reads nothing of the trainer's own artefacts.
 */
export interface OnlineDaggerSessionInfo {
  created_at: CreatedAt;
  last_used_at?: LastUsedAt;
  path: Path3;
  rollouts: Rollouts;
  session_name: SessionName2;
  task: Task2;
}
/**
 * GET /api/policies row (04-runtime §13.1).
 */
export interface PolicyInfo {
  action_frame: ActionFrame;
  action_space: ActionSpace1;
  path: Path4;
  policy_id: PolicyId;
  policy_version: PolicyVersion;
  promoted?: Promoted;
}
/**
 * The ``policy_spec`` input payload (14-dora §6.2), heartbeated at 1 Hz by the
 * policy node.
 */
export interface PolicySpecAnnounce {
  acts_total?: ActsTotal;
  capabilities?: Capabilities;
  chunk_dt_s?: ChunkDtS;
  chunk_len?: ChunkLen;
  detail?: Detail9;
  device?: Device;
  extrinsics_sha?: ExtrinsicsSha;
  health?: Health;
  last_compute_ms?: LastComputeMs;
  loader?: Loader;
  mavis_schema?: MavisSchema1;
  node_version: NodeVersion;
  policy_id: PolicyId1;
  policy_version: PolicyVersion1;
  rate_hz: RateHz;
  spec: PolicySpecModel;
  supports_reload?: SupportsReload;
  uptime_s?: UptimeS;
}
/**
 * Pydantic mirror of core ``interfaces.policy.PolicySpec`` (the dataclass is
 * not a wire model); the layout the policy node declares.
 */
export interface PolicySpecModel {
  action_frame: ActionFrame1;
  action_frames?: ActionFrames;
  action_names: ActionNames;
  action_space: ActionSpace2;
  arms?: Arms2;
  camera_keys?: CameraKeys;
  state_names: StateNames;
  version?: Version;
}
export interface ActionFrames {
  [k: string]: string;
}
/**
 * GET /api/profiles row (full posture via GET /api/profiles/{id}).
 */
export interface ProfileInfo {
  arms: Arms3;
  created_at: CreatedAt1;
  is_initial_condition: IsInitialCondition;
  name: Name2;
  notes: Notes;
  profile_id: ProfileId1;
  workcell_kind?: WorkcellKind;
}
/**
 * ``POST /api/session/return_home`` response (04-runtime §10.5; 2026-09-08).
 *
 * The synchronous "walk the workcell back to its designated initial condition"
 * op the Cockpit runs BEFORE it tears a session down, and the same motion the
 * ``reset_to_initial`` key fires. ``ok`` is what the UI branches on: false ⇒
 * the arms are NOT at the initial condition and the operator has to be told
 * (the Cockpit shows a dialog and offers to end the session anyway, after
 * which the arms may be moved from UFACTORY Studio — never during a session).
 *
 * ``status`` distinguishes *why*: ``done`` — arrived; ``skipped`` — nothing to
 * do (no initial-condition profile for this workcell kind, or already there),
 * which is a success; ``failed`` — the twin could not plan a collision-free
 * path (or an arm is faulted); ``cancelled`` — operator input interrupted the
 * motion; ``timeout`` — the gate held the motion past its budget, the arms
 * were stopped where they are; ``refused`` — a precondition said no (an
 * episode is still recording, no session).
 */
export interface ReturnHomeResult {
  arms?: Arms4;
  detail?: Detail10;
  ok: Ok2;
  profile_id?: ProfileId2;
  status: Status3;
}
/**
 * Args for ``name == "save_profile"``.
 *
 * ``set_initial`` designates the saved profile as the workcell's initial
 * condition in the same round trip (2026-09-07): the Cockpit has ONE profile
 * button now — "Save current state as profile" with a name field and an
 * optional "use as initial condition" switch — instead of the two buttons
 * ("Save profile…" / "Set current state as initial condition") whose
 * difference nobody could see. ``set_initial_condition`` stays on the wire
 * for designating an EXISTING profile by id.
 */
export interface SaveProfileArgs {
  name: Name3;
  notes?: Notes1;
  set_initial?: SetInitial;
}
/**
 * GET /api/scenes?kind=sim|twin row.
 */
export interface SceneInfo {
  cameras: Cameras1;
  kind: Kind5;
  label: Label3;
  num_arms: NumArms;
  rail_flags: RailFlags;
  scene_id: SceneId1;
}
/**
 * The ``session`` stream payload (14-dora §4.2): the contract message a late
 * joiner learns everything from (sent on every state change + 1 Hz).
 */
export interface SessionAnnounce {
  action_names?: ActionNames1;
  action_space?: ActionSpace3;
  arm_ids?: ArmIds1;
  camera_ids?: CameraIds;
  cameras?: Cameras2;
  dataset_root?: DatasetRoot;
  deprecated_keys?: DeprecatedKeys;
  epoch: Epoch1;
  frames?: Frames2;
  has_rail?: HasRail1;
  kind?: Kind6;
  mavis_schema?: MavisSchema2;
  online_dagger?: OnlineDaggerAnnounce | null;
  policy_source?: PolicySource;
  run_id?: RunId;
  session_id: SessionId2;
  spec?: SessionSpec | null;
  state: State3;
  state_names?: StateNames1;
}
export interface Cameras2 {
  [k: string]: CameraAnnounce;
}
/**
 * One camera of the session (``SessionAnnounce.cameras``).
 */
export interface CameraAnnounce {
  T_E_C?: TEC;
  T_W_C?: TWC;
  depth?: Depth;
  distortion?: Distortion;
  fps: Fps3;
  frame_ref: FrameRef;
  intrinsics?: Intrinsics;
  mount: Mount;
  resolution: Resolution1;
}
export interface Frames2 {
  [k: string]: string;
}
export interface HasRail1 {
  [k: string]: boolean;
}
/**
 * POST /api/session body.
 */
export interface SessionSpec {
  action_filter?: ActionFilterConfig;
  arms: Arms5;
  dataset?: Dataset;
  dataset_resume?: DatasetResume;
  digital_twin_scene?: DigitalTwinScene;
  frames: Frames3;
  kind: Kind7;
  mode: Mode2;
  online_dagger?: OnlineDaggerConfig | null;
  policy?: Policy;
  policy_source?: PolicySource1;
  return_to_start?: ReturnToStart;
  sim_scene?: SimScene;
  speed_scale?: SpeedScale;
  start_from?: StartFrom;
  task?: Task3;
}
/**
 * Idle-frame filter parameters (10-frames §11.4; 04-runtime §10.5; 2026-09-07,
 * operator): the pro-dagger hesitation heuristic ported to the frame stream. A
 * candidate frame whose commanded TCP (Chebyshev over xyz / geodesic angle),
 * gripper fraction and rail slot are all within the epsilons of the LAST KEPT
 * frame — and that has no gripper change within ±``gripper_context_s`` — is not
 * recorded. Defaults = pro-dagger's 1 mm / 1e-3 / 1 mm per step and its one
 * H=16 chunk at 10 Hz of gripper context; ``enabled: false`` records every
 * frame. DAgger filters human-controlled frames only.
 */
export interface ActionFilterConfig {
  enabled?: Enabled1;
  gripper_context_s?: GripperContextS;
  gripper_eps_frac?: GripperEpsFrac;
  pos_eps_m?: PosEpsM;
  rail_eps_m?: RailEpsM;
  rot_eps_rad?: RotEpsRad;
}
export interface Frames3 {
  [k: string]: string;
}
/**
 * POST/GET /api/session response.
 */
export interface SessionInfo {
  arms: Arms6;
  epoch: Epoch2;
  fault_detail?: FaultDetail;
  kind?: Kind8;
  mode: Mode3;
  online_dagger?: OnlineDaggerConfig | null;
  policy_source?: PolicySource2;
  session_id: SessionId3;
  speed_scale?: SpeedScale1;
  state: State4;
  streams: Streams;
}
/**
 * Args for ``name == "set_initial_condition"``.
 */
export interface SetInitialConditionArgs {
  profile_id?: ProfileId3;
}
/**
 * Named workcell posture snapshot; at most one initial condition per kind.
 */
export interface StateProfile {
  arms: Arms7;
  created_at?: CreatedAt2;
  is_initial_condition?: IsInitialCondition1;
  name: Name4;
  notes?: Notes2;
  profile_id?: ProfileId4;
  schema_version?: SchemaVersion;
  workcell_kind: WorkcellKind1;
}
export interface Arms7 {
  [k: string]: ArmPosture;
}
/**
 * One arm's stored posture; ``q`` NEVER includes the rail slot.
 */
export interface ArmPosture {
  gripper_open_frac?: GripperOpenFrac2;
  q: Q2;
  rail_pos_m?: RailPosM2;
}
/**
 * Args for ``name == "switch_arm"`` (optional; empty args = cycle).
 *
 * ``arm_id`` makes the switch EXPLICIT and idempotent, which is what a UI
 * control needs: the Cockpit's arm rows are clickable (2026-09-07) and a
 * click must land on the arm the operator clicked whatever the session's arm
 * order is. Keyboard Tab / gamepad RB keep sending no args and keep cycling.
 * An unknown id is refused (``ack.ok == false``) — the active arm never
 * changes silently. ``switch_arm_prev`` takes no args.
 *
 * ``extra="forbid"`` keeps the guarantee this action had before it grew an
 * args model: anything but ``arm_id`` is a client bug and is rejected rather
 * than silently ignored (pydantic's default).
 */
export interface SwitchArmArgs {
  arm_id?: ArmId5;
}
/**
 * One 25 Hz telemetry frame.
 */
export interface TelemetryMsg {
  active_arm: ActiveArm;
  arms: Arms8;
  clearances: Clearances;
  collision: CollisionReport;
  controller_connected: ControllerConnected;
  dagger: DaggerStatus | null;
  datasets?: DatasetsTelemetry | null;
  episode: EpisodeStatus | null;
  epoch: Epoch3;
  external?: ExternalStatus | null;
  hardware_monitor?: HardwareMonitorTelemetry | null;
  inference: InferenceStatus | null;
  microphone?: MicrophoneTelemetry | null;
  seq: Seq3;
  session?: SessionTelemetry | null;
  t?: T5;
  tracker?: TrackerTelemetry | null;
  ts: Ts3;
}
/**
 * Per-arm telemetry block.
 */
export interface ArmTelemetry {
  arm_id: ArmId6;
  collision_sensitivity?: CollisionSensitivity3;
  connected: Connected1;
  ee_pose: PoseMsg;
  error_code: ErrorCode2;
  fault_detail?: FaultDetail1;
  goto?: Goto;
  gripper_open_frac: GripperOpenFrac3;
  q: Q3;
  rail_pos_m: RailPosM3;
  recovering?: Recovering;
  stale?: Stale;
  warn_code?: WarnCode1;
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
  min_clearance_m?: MinClearanceM2;
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
  online_dagger?: OnlineDaggerStatus | null;
  policy_stale?: PolicyStale;
  policy_version: PolicyVersion3;
  staged_version?: StagedVersion;
  takeover_rate_ep?: TakeoverRateEp;
  takeover_rate_run?: TakeoverRateRun;
  trainer?: TrainerStatus | null;
}
/**
 * ``DaggerStatus.online_dagger`` (additive, phase-14; 15-online-dagger §3/§5): the
 * runtime's rollout-level shell state as the UI sees it. ``phase`` is
 * ``waiting_trainer`` (until the trainer reports ``ready`` for THIS session, when
 * ``wait_for_trainer_ready``) -> ``rollout`` -> ``training`` (the trainer reports
 * ``training``; ``episode_new`` refused while ``pause_while_training``) -> ``rollout``
 * ...; ``error`` mirrors a trainer error until a non-error status arrives. The shell
 * counts kept rollouts and the session's actor split — never iterations, which are
 * the trainer's business. ``detail`` is the operator-facing reason ``episode_new`` is
 * refused (or the trainer's detail); ``trainer`` is the last ``TrainerStatusAnnounce``
 * verbatim and ``trainer_alive`` / ``trainer_age_s`` its freshness (<=
 * ``dora.policy.spec_stale_s``); ``policy_version_acting`` follows the announced
 * spec / action version (a change shows as "swapped" in the panel).
 */
export interface OnlineDaggerStatus {
  detail?: Detail11;
  expert_frames_session?: ExpertFramesSession;
  novice_frames_session?: NoviceFramesSession;
  phase: Phase1;
  policy_version_acting?: PolicyVersionActing;
  rollouts_saved: RolloutsSaved;
  session_dir?: SessionDir1;
  session_name: SessionName3;
  trainer?: TrainerStatusAnnounce | null;
  trainer_age_s?: TrainerAgeS;
  trainer_alive?: TrainerAlive;
}
/**
 * The ``policy_trainer_status`` input payload (15-online-dagger §6): JSON on the
 * policy node's ``trainer_status`` output, heartbeated at 1 Hz (and on change) while
 * an Online DAgger session is announced. Generic by design — the runtime knows no
 * DAgger variant. ``state`` walks idle -> preparing -> ready (the shell lets rollouts
 * start) -> training (``episode_new`` refused while ``pause_while_training``) ->
 * ready (weights swapped, ``policy_version`` bumped); ``error`` carries ``detail``.
 * ``session_id`` MUST echo the served ``SessionAnnounce.session_id``: another
 * session's id is ignored outright, ``None`` counts as "trainer alive" only.
 * ``metrics`` is a free-form dict of finite scalars (``loss``, ``proj_rate``, ...)
 * the Cockpit lists verbatim (a ``loss`` key gets the sparkline). Metadata: the
 * common inbound keys (``client``, ``seq``, ``t_mono``, ``wallclock_ns``,
 * ``mavis_schema``), same ``seq`` counter as the node's other outputs. Field order
 * is the contract (both goldens pin it). Every float refuses inf / nan
 * (``allow_inf_nan=False``; a diverged loss is reported as ``state: "error"`` +
 * ``detail``, never as a non-finite number) — that rule leaves the JSON schema
 * alone.
 */
export interface TrainerStatusAnnounce {
  detail?: Detail12;
  mavis_schema?: MavisSchema3;
  metrics?: Metrics;
  node_version: NodeVersion1;
  policy_version?: PolicyVersion2;
  progress?: Progress1;
  session_id?: SessionId4;
  state?: State5;
  trainer_id: TrainerId;
  uptime_s?: UptimeS1;
}
export interface Metrics {
  [k: string]: number;
}
/**
 * Trainer health; pydantic — rides telemetry (§11).
 */
export interface TrainerStatus {
  last_burst_loss?: LastBurstLoss;
  last_checkpoint_ts?: LastCheckpointTs;
  last_checkpoint_version?: LastCheckpointVersion;
  new_label_frames?: NewLabelFrames1;
  state: State6;
  steps_total?: StepsTotal;
}
/**
 * ``TelemetryMsg.datasets`` (additive, 2026-09-07): session-less like the
 * microphone block; ``export`` is None until an export has run in this process.
 */
export interface DatasetsTelemetry {
  export?: DatasetExportTelemetry | null;
}
/**
 * ``TelemetryMsg.datasets.export`` (additive, 2026-09-07; 04-runtime §10.6):
 * the running / last LeRobot v3 export job. ``phase`` walks scanning -> videos
 * -> data -> meta -> validating -> done | failed; ``done`` / ``total`` count the
 * current phase's units (episodes for videos / data, 1 for meta / validating);
 * ``detail`` names the file being written or the failure.
 */
export interface DatasetExportTelemetry {
  detail?: Detail13;
  done?: Done;
  format: Format2;
  phase: Phase2;
  repo_id: RepoId3;
  total?: Total;
}
/**
 * Episode recorder status (collect/DAgger).
 *
 * ``returning`` (additive, 2026-09-07; 04-runtime §10.5): after a save or a
 * discard the arms are being driven back to the session's return profile (the
 * ``start_from`` profile, else the workcell's initial condition) on the twin
 * planner; ``episode_new`` is refused meanwhile. The dataset fields are
 * additive too: ``repo_id`` / ``total_episodes`` / ``total_frames`` mirror the
 * dataset manifest (saved episodes), ``detail`` is a short human-readable note
 * ("returning to profile 'ready'", "return cancelled: movement key",
 * "recorder degraded ..."). Deletion is immediate (one directory, 10-frames
 * §11.7), so there is no pending-deletion list.
 */
export interface EpisodeStatus {
  detail?: Detail14;
  duration_s: DurationS3;
  frames: Frames4;
  frames_skipped?: FramesSkipped;
  index: Index1;
  repo_id?: RepoId4;
  state: State7;
  total_episodes?: TotalEpisodes1;
  total_frames?: TotalFrames1;
}
/**
 * ``telemetry.external`` (14-dora §13): the bridge + external-policy state.
 */
export interface ExternalStatus {
  action_age_s?: ActionAgeS;
  actions_late?: ActionsLate;
  capabilities?: Capabilities1;
  dataflow_id?: DataflowId1;
  dataflow_restarts?: DataflowRestarts1;
  detail?: Detail15;
  dropped_inputs?: DroppedInputs;
  enabled?: Enabled2;
  idle_reader?: IdleReader;
  node_id?: NodeId1;
  policy_arms?: PolicyArms;
  policy_attached?: PolicyAttached;
  policy_id?: PolicyId2;
  policy_rate_hz?: PolicyRateHz;
  policy_version?: PolicyVersion4;
  publish_hz?: PublishHz;
  reattach_count?: ReattachCount1;
  spec_age_s?: SpecAgeS;
  state?: State8;
  trainer_status?: TrainerStatusAnnounce | null;
  version_changes_mid_episode?: VersionChangesMidEpisode;
}
export interface PublishHz {
  [k: string]: number;
}
/**
 * ``TelemetryMsg.hardware_monitor`` block (phase-09a; 04-runtime §13.3), additive.
 *
 * Every field defaults so a runtime without the hardware package still emits
 * a valid (``enabled: false``) block. ``paused`` is true while a hardware
 * session owns the control boxes: the monitor releases its connections
 * instead of sharing a box between two SDK clients.
 */
export interface HardwareMonitorTelemetry {
  arms?: Arms9;
  enabled?: Enabled3;
  overlays?: Overlays;
  paused?: Paused;
}
/**
 * One digital-twin overlay stream (``<camera_id>_align``; 04-runtime §13.4).
 *
 * ``rail_fallback_m`` is set while the track is not homed and the twin
 * assumes a configured rail position instead (``detail`` spells it out for
 * the tile caption); ``joint1_offset_rad`` echoes the diagnostic knob (0 =
 * the verified identity convention); ``mask_fraction`` is robot pixels /
 * image pixels of the last composited frame (0 = the twin sees no robot from
 * this camera).
 */
export interface TwinOverlayTelemetry {
  arm_id: ArmId7;
  camera_id: CameraId1;
  detail?: Detail16;
  fps?: Fps4;
  joint1_offset_rad?: Joint1OffsetRad;
  mask_fraction?: MaskFraction;
  rail_fallback_m?: RailFallbackM;
  status?: Status4;
  stream_id: StreamId;
}
/**
 * Inference block; same gate machinery, takeover = SAFETY ESCAPE.
 */
export interface InferenceStatus {
  control_mode: ControlMode;
  engaged_arm?: EngagedArm1;
  policy_stale?: PolicyStale1;
  policy_version: PolicyVersion5;
}
/**
 * Microphone block (phase-11; 04-runtime §13.3), additive.
 *
 * Every field defaults so a producer without a microphone still validates.
 * One frame per telemetry tick (frame length = ``sample_rate / telemetry_hz``,
 * 1920 samples at 48 kHz / 25 Hz); the UI de-duplicates on ``seq``.
 * ``env_min``/``env_max`` are the per-bin min/max envelope of the frame as 64
 * int8 values (-127..127, time-ordered) for the scrolling oscilloscope,
 * quantised RELATIVE TO THE FRAME PEAK (the loudest sample maps to +-127, so a
 * quiet room keeps its shape); absolute = ``env / 127 * 10 ** (peak_dbfs /
 * 20)``. ``rms_dbfs``/``peak_dbfs`` are full-scale levels (0 dBFS = |1.0|),
 * ``None`` when no frame has arrived. ``status`` shares ``MicStatus`` with
 * ``MicrophoneInfo`` (§12).
 */
export interface MicrophoneTelemetry {
  age_s?: AgeS1;
  clipping?: Clipping;
  detail?: Detail17;
  env_max?: EnvMax;
  env_min?: EnvMin;
  mic_id?: MicId1;
  overruns?: Overruns;
  peak_dbfs?: PeakDbfs;
  rate_hz?: RateHz1;
  rms_dbfs?: RmsDbfs;
  sample_rate?: SampleRate1;
  seq?: Seq2;
  status?: Status5;
}
/**
 * Additive session-lifecycle block (04-runtime §13.3).
 */
export interface SessionTelemetry {
  auto_ended?: SessionAutoEndNotice | null;
  bringup?: Bringup;
  fault_detail?: FaultDetail2;
  kind?: Kind10;
  mode?: Mode5;
  plan_status?: PlanStatus;
  session_id?: SessionId6;
  start_from_progress?: StartFromProgress;
  state: State9;
  trainer_alive?: TrainerAlive1;
  translate_frame?: TranslateFrame;
}
/**
 * Why the LAST session ended WITHOUT the operator's click (additive, 2026-09-09
 * evening; 04-runtime §13.2 "orphaned session", §13.3).
 *
 * Filled by the runtime when it ends a session on its own - today only the
 * orphaned-session watch: the last controller ``/ws/control`` connection was
 * gone for ``control.orphan_session_grace_s`` (the Cockpit tab was closed,
 * reloaded for good or navigated back to the Welcome page) - and cleared when
 * the next session starts. The end is the DELETE teardown: the arms stop and
 * brake where they are, no motion. ``None`` = the last session ended by DELETE /
 * never ran. The Welcome page shows it verbatim so the operator learns that the
 * arms were released while nobody was watching.
 */
export interface SessionAutoEndNotice {
  ended_at: EndedAt;
  kind: Kind9;
  mode: Mode4;
  reason: Reason1;
  session_id: SessionId5;
}
/**
 * One hardware bring-up step of one arm (phase-09c; 04-runtime §5).
 *
 * Fed from the workcell's ``status_cb`` while ``SessionTelemetry.state`` is
 * ``bringup``; the Cockpit lists the rows until the session is running.
 * ``step`` names the stage (``network`` / ``connect`` / ``rail`` / ``gripper``
 * / ``report`` / ``frozen`` ...), ``detail`` the human-readable outcome, e.g.
 * "Perception Arm frozen at last sample".
 */
export interface ArmBringupTelemetry {
  arm_id: ArmId8;
  detail?: Detail18;
  status: Status6;
  step: Step;
}
/**
 * Vive-tracker block (13-tracker §3.5), additive.
 *
 * Device fields are populated even without a session; session fields
 * (``engaged_arm``, ``anchor_tcp``, ``target_tcp``) are ``None`` otherwise.
 * ``controller`` echoes the raw controller inputs (``None`` when the backend
 * reports no controller) and ``device_held`` the key codes the runtime
 * injects from them (13-tracker §1.1); a stale sample yields an empty list.
 * ``device_action`` is the last device-sourced discrete action (e.g.
 * ``"switch_arm"``), cleared by the runtime ~1 s after it fired.
 * ``pose_filtered`` is the aligned pose after the One Euro filter (§4), i.e.
 * what the anchor/delta math actually consumes; ``None`` when no sample.
 * ``calibration`` mirrors ``GET /api/tracker/calibration`` (protocol.tracker)
 * so the Devices-page wizard follows progress without polling.
 *
 * Link fields (2026-09-07, 13-tracker §3.5 "controller link"): the pose path
 * and the button path are INDEPENDENT and can fail apart, which is exactly
 * what happened on 2026-09-06 (poses at 135 Hz while libsurvive delivered no
 * button event at all, so the clutch could never engage and the frozen
 * ``controller`` state looked plausible). Therefore:
 *
 * * ``controller_age_s`` is the age of the newest controller INPUT event
 *   (button / touch / axis), independent of ``age_s`` (the pose age).
 *   ``None`` when no input event has ever been seen. A pose-fresh sample with
 *   a stale ``controller_age_s`` means "moving works, buttons do not".
 * * ``objects`` lists the OBJECT-type devices libsurvive currently reports
 *   (e.g. ``["WM0"]``), so a panel can separate "not paired / dongle busy"
 *   (empty) from "paired, waiting for base stations".
 * * ``dongle_present`` is the USB presence of the Watchman receiver
 *   (``28de:2101``) read from sysfs, so "unplugged" is distinguishable from
 *   "unpaired". ``None`` when the check is unavailable (non-Linux, no sysfs).
 */
export interface TrackerTelemetry {
  age_s?: AgeS2;
  anchor_tcp?: PoseMsg | null;
  backend: Backend;
  calibration?: TrackerCalibrationStatus | null;
  charging?: Charging;
  clutch?: Clutch;
  controller?: ControllerTelemetry | null;
  controller_age_s?: ControllerAgeS;
  detail?: Detail20;
  device_action?: DeviceAction;
  device_held?: DeviceHeld;
  dongle_present?: DonglePresent;
  engaged_arm?: EngagedArm2;
  object_name?: ObjectName;
  objects?: Objects;
  pose_filtered?: PoseMsg | null;
  pose_raw?: PoseMsg | null;
  pose_world?: PoseMsg | null;
  rate_hz?: RateHz2;
  seq?: Seq4;
  settings: TrackerSettingsMsg;
  status: Status7;
  target_tcp?: PoseMsg | null;
}
/**
 * Calibration state machine snapshot (REST response + telemetry block).
 *
 * ``kind``/``phase`` describe the flow in progress; the base-station and yaw
 * field groups are only meaningful for their own kind. The persisted-state
 * group is always filled from ``calibration_dir/tracker_calibration.json``.
 */
export interface TrackerCalibrationStatus {
  applied_yaw_deg?: AppliedYawDeg;
  backup_path?: BackupPath;
  base_station_installed_at?: BaseStationInstalledAt;
  controller_still?: ControllerStill;
  detail?: Detail19;
  elapsed_s?: ElapsedS;
  fit_checks?: FitChecks;
  fit_residual_deg?: FitResidualDeg;
  fitted_yaw_deg?: FittedYawDeg;
  installed_path?: InstalledPath;
  kind?: Kind11;
  lighthouses?: Lighthouses;
  next_point?: NextPoint;
  phase?: Phase3;
  scenes?: Scenes1;
  started_at?: StartedAt1;
  stations_visible?: StationsVisible;
  validation?: CalibrationValidation | null;
  yaw_calibrated_at?: YawCalibratedAt;
  yaw_points?: YawPoints;
  yaw_valid?: YawValid;
}
/**
 * One Lighthouse base station as seen during base-station calibration.
 */
export interface LighthouseStatus {
  channel?: Channel;
  index: Index2;
  pose?: PoseMsg | null;
  reference?: Reference;
  scenes?: Scenes;
  serial?: Serial;
}
/**
 * Stationary-controller validation result (13-tracker §4).
 *
 * Acceptance (2026-09-03 measurements): every axis ``std_mm`` below
 * ``threshold_std_mm`` and ``max_step_mm`` below ``threshold_step_mm``.
 */
export interface CalibrationValidation {
  max_step_mm?: MaxStepMm;
  passed?: Passed;
  samples?: Samples;
  std_mm?: StdMm;
  threshold_std_mm?: ThresholdStdMm;
  threshold_step_mm?: ThresholdStepMm;
}
/**
 * One captured point of the yaw gesture.
 */
export interface YawGesturePoint {
  label: Label4;
  pose: PoseMsg;
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
 * Live tracker teleop settings echoed in telemetry (13-tracker §3.5, §4).
 *
 * The ``filter_*`` fields are the *effective* One Euro pose-filter settings
 * (config defaults, overridable live via ``tracker_settings``); they default
 * here so pre-filter producers still validate.
 */
export interface TrackerSettingsMsg {
  filter_beta?: FilterBeta;
  filter_enabled?: FilterEnabled;
  filter_min_cutoff_hz?: FilterMinCutoffHz;
  follow_rotation: FollowRotation;
  pos_scale: PosScale;
  yaw_deg: YawDeg;
}
/**
 * POST /api/tracker/calibration body (illegal transitions -> 409).
 */
export interface TrackerCalibrationCommand {
  kind: Kind12;
  op: Op3;
  point?: Point;
}
/**
 * Args for ``name == "tracker_settings"`` (13-tracker §3.4, §4 "Pose filter").
 *
 * Every field is optional; omitted (``None``) fields leave the live runtime
 * setting unchanged. The ``filter_*`` fields tune the runtime's One Euro pose
 * filter live (debug page); a change while the clutch is engaged re-anchors
 * instead of moving the arm (13-tracker §4 "Anchor and re-seed rules").
 */
export interface TrackerSettingsArgs {
  filter_beta?: FilterBeta1;
  filter_enabled?: FilterEnabled1;
  filter_min_cutoff_hz?: FilterMinCutoffHz1;
  follow_rotation?: FollowRotation1;
  pos_scale?: PosScale1;
  yaw_deg?: YawDeg1;
}
/**
 * GET /api/workcell response.
 */
export interface WorkcellStatus {
  arms: Arms10;
  available_kinds: AvailableKinds;
  cameras: Cameras3;
  hardware_ready?: HardwareReady;
  kind: Kind13;
  policies_available?: PoliciesAvailable;
}
