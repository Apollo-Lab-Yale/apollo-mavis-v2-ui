/** Single zustand store (05-ui §7). WS handlers write via store.setState —
 * imperative, outside React. Video pixels and the held-key set are
 * deliberately NOT stored here.
 */
import { create } from "zustand";
import type {
  ArmTelemetry,
  CollisionReport,
  KeymapEntry,
  SessionInfo,
  TelemetryMsg,
  WorkcellStatus,
} from "../gen";
import type { Bindings } from "../input/bindings";
import type { WsStatus } from "../lib/types";

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "error";
}

export interface VideoTileStats {
  stale: boolean;
  fps: number;
  latencyMs: number | null;
  status: WsStatus;
}

export interface AppState {
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
  resetForEpochChange(): void;
}

let toastSeq = 0;

export const useStore = create<AppState>()((set) => ({
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
  resetForEpochChange: () =>
    set({
      session: null,
      telemetry: null,
      telemetryAt: -Infinity,
      telemetryStale: false,
      captureArmed: false,
      video: {},
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
