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
  grip_wrist: "Manipulation · wrist cam",
  view_wrist: "Perception · wrist cam",
  grip_wrist_align: "Manipulation · twin overlay",
  view_wrist_align: "Perception · twin overlay",
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
/** Hardware tab real cameras: the two wrist cameras (RealSense D435i colour
 * over UVC). Ids differ from the digital twin's
 * `grip_wrist_cam` / `view_wrist_cam` because both sets coexist in the runtime's
 * VideoHub (Welcome page previews; twin renders during a hardware session). */
export const HARDWARE_CAMERA_SLOTS = ["grip_wrist", "view_wrist"] as const;
/** Twin-overlay streams (phase-09a): the real wrist-camera frame with the
 * digital twin, posed from the read-only arm monitor, tinted pale yellow on
 * top. Ids are `<camera_id>_align` (reserved suffix, 04-runtime §13.4); they are
 * `kind: "twin"` rows of `/api/cameras` and are never recording frames. */
export const HARDWARE_OVERLAY_SLOTS = ["grip_wrist_align", "view_wrist_align"] as const;
/** Hardware tab observation grid, in DOM order: each real camera followed by
 * its overlay (the MicTile is the fifth cell). `HARDWARE_CAMERA_SLOTS` keeps
 * the two real cameras for everything else (captions, recording frames). */
export const HARDWARE_GRID_SLOTS = [
  "grip_wrist",
  "grip_wrist_align",
  "view_wrist",
  "view_wrist_align",
] as const;
export const OVERLAY_SUFFIX = "_align";
/** `grip_wrist_align` → `grip_wrist`; null for any other id. */
export const overlayBase = (id: string): string | null =>
  id.endsWith(OVERLAY_SUFFIX) ? id.slice(0, -OVERLAY_SUFFIX.length) : null;
export const isOverlayStream = (id: string): boolean => overlayBase(id) !== null;

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
 * Twin) → "twin". Stable within a rank (runtime order preserved); a twin
 * overlay (`<cam>_align`) sits right after its camera whenever that camera is
 * listed, otherwise it is ordered like any other stream. */
export function orderStreams(ids: readonly string[]): string[] {
  return ids
    .map((id, i) => {
      const base = overlayBase(id);
      const anchor = base === null ? -1 : ids.indexOf(base);
      if (base === null || anchor === -1) return { id, r: streamRank(id), i, sub: 0 };
      return { id, r: streamRank(base), i: anchor, sub: 1 };
    })
    .sort((a, b) => a.r - b.r || a.i - b.i || a.sub - b.sub)
    .map((x) => x.id);
}
