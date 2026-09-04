/** Display names and slot orders shared by Landing, Cockpit and Devices
 * (phase-11 §4). Stream ids stay the runtime's canonical ids; only the
 * displayed titles live here. */
import type { MicrophoneInfo } from "../gen";
import type { Kind, Mode } from "./types";

export const APP_TITLE = "APOLLO MAVIS V2";
export const APP_SUBTITLE = "Manipulation and Viewpoint Selection";
export const APP_EYEBROW = "Apollo Lab · Yale";

/** The single scene offered by the UI (registry id + display title). */
export const SCENE_ID = "mavis_v2";
export const SCENE_DISPLAY_NAME = "APOLLO MAVIS V2 Digital Twin";

/** User-facing arm names (05-ui §8.1). Arm ids stay the runtime's `grip` /
 * `view`; only the displayed names live here. `grip` = **Manipulation Arm**
 * (xArm Gripper G2 + wrist camera), `view` = **Perception Arm** (wrist
 * RealSense D435 + RØDE NT-USB Mini microphone). */
export const ARM_LABELS: Readonly<Record<string, string>> = {
  grip: "Manipulation Arm",
  view: "Perception Arm",
};

/** Display name for an arm id (falls back to the id itself). */
export const armLabel = (id: string): string => ARM_LABELS[id] ?? id;

/** Display name with the id for single-line copy (captions, banners, chips):
 * "Manipulation Arm (grip)"; unknown ids render bare. */
export const armTitle = (id: string): string => (ARM_LABELS[id] ? `${ARM_LABELS[id]} (${id})` : id);

/** Arm order wherever arms are listed and in `SessionSpec.arms`: the
 * Manipulation Arm first so it is the active (teleop) arm by default, on the
 * Hardware and Sim tabs alike. Unknown ids follow in the runtime's order. */
export const ARM_ORDER: readonly string[] = ["grip", "view"];

const armRank = (id: string): number => {
  const i = ARM_ORDER.indexOf(id);
  return i === -1 ? ARM_ORDER.length : i;
};

/** Stable sort by `ARM_ORDER`; `id` extracts the arm id from an element. */
export function orderArms<T>(arms: readonly T[], id: (a: T) => string): T[] {
  return arms
    .map((a, i) => ({ a, i, r: armRank(id(a)) }))
    .sort((x, y) => x.r - y.r || x.i - y.i)
    .map((x) => x.a);
}

/** Configured microphone (RuntimeConfig.microphone.mic_id default) — the RØDE
 * on the Perception Arm. */
export const MIC_ID = "mic_view";
export const MIC_LABEL = "Perception · microphone";
/** MicTile caption, e.g. "RØDE NT-USB Mini · 48 kHz mono". */
export const micSubtitle = (m: MicrophoneInfo): string =>
  `${m.label} · ${m.sample_rate / 1000} kHz ${(m.channels ?? 1) === 1 ? "mono" : `${m.channels} ch`}`;

/** Welcome tabs (SegmentedControl labels + LaunchSheet context). */
export const TAB_LABELS: Readonly<Record<Kind, string>> = { hardware: "Hardware", sim: "Sim" };

export const STREAM_LABELS: Readonly<Record<string, string>> = {
  grip_wrist_cam: "Manipulation · wrist cam",
  view_wrist_cam: "Perception · wrist cam",
  cam_front: "Environment · front",
  cam_top: "Environment · top",
  camera1: "Camera 1",
  camera2: "Camera 2",
  sim: "Digital Twin",
  twin: "Safety twin",
};

/** Display title for a stream id (falls back to the id itself). */
export const streamLabel = (id: string): string => STREAM_LABELS[id] ?? id;

/** Sim tab observation grid (2×2, in this order). */
export const SIM_CAMERA_SLOTS = [
  "grip_wrist_cam",
  "view_wrist_cam",
  "cam_front",
  "cam_top",
] as const;
/** Hardware tab camera slots (+ the MicTile as the third cell). */
export const HARDWARE_CAMERA_SLOTS = ["camera1", "camera2"] as const;

export const MODE_LABELS: Readonly<Record<Mode, string>> = {
  teleop: "Teleop",
  collect: "Data Collection",
  dagger: "DAgger",
  inference: "Inference",
};
export const MODE_DESCRIPTIONS: Readonly<Record<Mode, string>> = {
  teleop: "Drive both arms live",
  collect: "Record episodes for a task",
  dagger: "Policy drives, you correct",
  inference: "Run a promoted checkpoint",
};

/** `document.title` for a page: "APOLLO MAVIS V2" or "APOLLO MAVIS V2 · Teleop". */
export const pageTitle = (section?: string | null): string =>
  section ? `${APP_TITLE} · ${section}` : APP_TITLE;

const streamRank = (id: string): number => {
  if (id === "twin") return 3;
  if (id === "sim") return 2;
  if (id.endsWith("_wrist_cam") || /^camera\d+$/.test(id)) return 0;
  return 1; // environment / other cameras
};

/** Cockpit grid order: wrist cameras → environment cameras → "sim" (Digital
 * Twin) → "twin". Stable within a rank (runtime order preserved). */
export function orderStreams(ids: readonly string[]): string[] {
  return ids
    .map((id, i) => ({ id, i, r: streamRank(id) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.id);
}
