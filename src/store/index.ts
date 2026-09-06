/** Single zustand store (05-ui §7). WS handlers write via store.setState —
 * imperative, outside React. Video pixels and the held-key set are
 * deliberately NOT stored here.
 */
import { create } from "zustand";
import type {
  ArmMonitorTelemetry,
  ArmTelemetry,
  CollisionReport,
  KeymapEntry,
  MaintenanceProgress,
  SessionInfo,
  TelemetryMsg,
  TrackerSettingsArgs,
  WorkcellStatus,
} from "../gen";
import type { Bindings } from "../input/bindings";
import type { WsStatus } from "../lib/types";

/** Four feedback kinds (phase-11 §6): info/success auto-dismiss 6 s, warning
 * 10 s, error persists until dismissed (see components/Toasts.tsx). */
export type ToastTone = "info" | "success" | "warning" | "error";

export interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
}

export interface VideoTileStats {
  stale: boolean;
  fps: number;
  latencyMs: number | null;
  status: WsStatus;
  /** False until the first frame was drawn (StreamView shows "connecting", not STALE). */
  hasFrame?: boolean;
}

/** Browser-side gamepad snapshot (13-tracker §5) — written by the adapter,
 * read by the Devices page and the armed chip. Raw arrays are the browser's
 * own button/axis order; `active` holds the mapped labels currently pressed. */
export interface GamepadState {
  connected: boolean;
  index: number | null;
  id: string | null;
  mapping: string | null;
  buttons: readonly number[]; // raw button values (0..1)
  pressed: readonly boolean[]; // raw button pressed flags
  axes: readonly number[]; // raw axes (-1..1)
  active: readonly string[]; // mapped labels ("A", "RT", …) currently active
  armed: boolean; // gamepad auto-armed capture (heartbeat running)
  /** Release-all latch (blur/hidden/link-down): press edges ignored until every
   * mapped control is released or focus + visibility return (13-tracker §5). */
  latched: boolean;
}

export const GAMEPAD_IDLE: GamepadState = {
  connected: false,
  index: null,
  id: null,
  mapping: null,
  buttons: [],
  pressed: [],
  axes: [],
  active: [],
  armed: false,
  latched: false,
};

/** Devices-page state that is not part of telemetry. */
export interface DevicesState {
  /** Last `tracker_settings` args sent, until telemetry echoes them. */
  pendingTrackerSettings: TrackerSettingsArgs | null;
  /** Scene id of a session started from the Devices page (SessionInfo has none). */
  startedScene: string | null;
}

export const DEVICES_IDLE: DevicesState = { pendingTrackerSettings: null, startedScene: null };

export interface AppState {
  // devices
  gamepad: GamepadState;
  devices: DevicesState;
  // session
  session: SessionInfo | null;
  workcell: WorkcellStatus | null;
  keymap: KeymapEntry[] | null;
  bindings: Bindings | null;
  // live
  telemetry: TelemetryMsg | null;
  telemetryAt: number;
  telemetryStale: boolean;
  conn: { control: WsStatus; telemetry: WsStatus; role: "controller" | "observer" | null };
  captureArmed: boolean;
  video: Record<string, VideoTileStats>;
  toasts: Toast[];
  // actions
  setSession(s: SessionInfo | null): void;
  setWorkcell(w: WorkcellStatus | null): void;
  setKeymap(k: KeymapEntry[] | null, b: Bindings | null): void;
  setTelemetry(msg: TelemetryMsg): void;
  setTelemetryStale(stale: boolean): void;
  setConn(k: "control" | "telemetry", s: WsStatus): void;
  setRole(role: "controller" | "observer" | null): void;
  setCaptureArmed(armed: boolean): void;
  setVideoStats(id: string, s: VideoTileStats): void;
  addToast(text: string, tone?: Toast["tone"]): void;
  dismissToast(id: number): void;
  setGamepad(g: Partial<GamepadState>): void;
  setDevices(d: Partial<DevicesState>): void;
  resetForEpochChange(): void;
}

let toastSeq = 0;

export const useStore = create<AppState>()((set) => ({
  gamepad: GAMEPAD_IDLE,
  devices: DEVICES_IDLE,
  session: null,
  workcell: null,
  keymap: null,
  bindings: null,
  telemetry: null,
  telemetryAt: -Infinity,
  telemetryStale: false,
  conn: { control: "closed", telemetry: "closed", role: null },
  captureArmed: false,
  video: {},
  toasts: [],

  setSession: (session) => set({ session }),
  setWorkcell: (workcell) => set({ workcell }),
  setKeymap: (keymap, bindings) => set({ keymap, bindings }),
  setTelemetry: (msg) =>
    set({ telemetry: msg, telemetryAt: performance.now(), telemetryStale: false }),
  setTelemetryStale: (telemetryStale) => set({ telemetryStale }),
  setConn: (k, s) => set((st) => ({ conn: { ...st.conn, [k]: s } })),
  setRole: (role) => set((st) => ({ conn: { ...st.conn, role } })),
  setCaptureArmed: (captureArmed) => set({ captureArmed }),
  setVideoStats: (id, stats) => set((st) => ({ video: { ...st.video, [id]: stats } })),
  addToast: (text, tone = "info") =>
    set((st) => ({ toasts: [...st.toasts, { id: ++toastSeq, text, tone }] })),
  dismissToast: (id) => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })),
  setGamepad: (g) => set((st) => ({ gamepad: { ...st.gamepad, ...g } })),
  setDevices: (d) => set((st) => ({ devices: { ...st.devices, ...d } })),
  resetForEpochChange: () =>
    set({
      session: null,
      telemetry: null,
      telemetryAt: -Infinity,
      telemetryStale: false,
      captureArmed: false,
      video: {},
      gamepad: GAMEPAD_IDLE,
      devices: DEVICES_IDLE,
    }),
}));

// Derived selectors
export const selectActiveArm = (s: AppState): ArmTelemetry | null => {
  const t = s.telemetry;
  if (!t || t.active_arm == null) return null;
  return t.arms.find((a) => a.arm_id === t.active_arm) ?? null;
};
export const selectArm =
  (armId: string) =>
  (s: AppState): ArmTelemetry | null =>
    s.telemetry?.arms.find((a) => a.arm_id === armId) ?? null;
export const selectCollision = (s: AppState): CollisionReport | null =>
  s.telemetry?.collision ?? null;
export const selectEpisode = (s: AppState) => s.telemetry?.episode ?? null;
export const selectDagger = (s: AppState) => s.telemetry?.dagger ?? null;
export const selectInference = (s: AppState) => s.telemetry?.inference ?? null;
export const selectControlLinkDown = (s: AppState): boolean => s.conn.control !== "open";
export const selectTracker = (s: AppState) => s.telemetry?.tracker ?? null;
/** Phase-09a read-only hardware monitor block (null on a runtime without it). */
export const selectHardwareMonitor = (s: AppState) => s.telemetry?.hardware_monitor ?? null;
/** A hardware session owns the control boxes (phase-09b): the monitor's
 * `paused` flag IS the runtime's `_hardware_session_active` predicate (the
 * runtime reports it even with the monitor switched off / the hardware
 * package missing, and from the first moment of a hardware bring-up), and
 * until phase-09c it was the only wire signal that tells a hardware session
 * from a sim one (both kinds may stream `"twin"`). Since phase-09c
 * `SessionInfo.kind` says so too — either signal counts, so the Cockpit keeps
 * its recovery button on an older runtime and during bring-up alike. */
export const selectHardwareSession = (s: AppState): boolean =>
  s.telemetry?.hardware_monitor?.paused === true || s.session?.kind === "hardware";
/** Phase-09c: some hardware arm has a maintenance op running — in practice a
 * `home_rail` (the other ops finish within a second; a phase-09d
 * `RailHomingJob` keeps it true for the job's whole life); the runtime answers
 * `POST /api/session` 409 "rail homing in progress" meanwhile. */
export const selectMaintenanceBusy = (s: AppState): boolean =>
  s.telemetry?.hardware_monitor?.arms?.some((a) => a.maintenance_busy === true) ?? false;
/** Phase-09d: the live progress of an asynchronous maintenance job on one arm
 * (`ArmMonitorTelemetry.maintenance`, a `RailHomingJob` that first moves the
 * arm along a planned path); null while no job exists / the block is absent.
 * Subscribe with `useShallow` — the object is fresh on every telemetry tick. */
export const selectMaintenanceProgress =
  (armId: string) =>
  (s: AppState): MaintenanceProgress | null =>
    s.telemetry?.hardware_monitor?.arms?.find((a) => a.arm_id === armId)?.maintenance ?? null;
/** Phase-09c D1: hardware arms the current hardware session did NOT include —
 * every arm the monitor block lists (it lists all configured hardware arms,
 * paused or not) minus `session.arms`; `[]` outside a hardware session. The
 * Cockpit warns that they are frozen in the gate twin at their last sample.
 * Since phase-09d a hardware session includes EVERY configured arm (the
 * runtime 409s otherwise), so this is normally empty — D1 survives only for
 * the maintenance motion of a `RailHomingJob`, which has no session; the hint
 * stays as a defensive path for an older runtime. */
export const selectFrozenArms = (s: AppState): string[] => {
  const session = s.session;
  if (!session || !selectHardwareSession(s)) return [];
  return (s.telemetry?.hardware_monitor?.arms ?? [])
    .map((a) => a.arm_id)
    .filter((id) => !session.arms.includes(id));
};
/** The read-only monitor's row for one arm (null while the block or the arm is absent). */
export const selectMonitorArm =
  (armId: string) =>
  (s: AppState): ArmMonitorTelemetry | null =>
    s.telemetry?.hardware_monitor?.arms?.find((a) => a.arm_id === armId) ?? null;
