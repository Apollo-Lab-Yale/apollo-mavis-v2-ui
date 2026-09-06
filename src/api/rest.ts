/** Typed fetch client — relative URLs, JSON, ApiError on non-2xx (05-ui §4). */
import type {
  ArmMaintenanceRequest,
  ArmMaintenanceResult,
  CameraInfo,
  KeymapEntry,
  MicrophoneInfo,
  PolicyInfo,
  ProfileInfo,
  SceneInfo,
  SessionInfo,
  SessionSpec,
  TrackerCalibrationCommand,
  TrackerCalibrationStatus,
  WorkcellStatus,
} from "../gen";

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(`API ${status}: ${detail}`);
    this.name = "ApiError";
  }
}

/** Client-side deadline for a long synchronous POST (`home_rail`: the runtime
 * waits up to 45 s for the carriage, the client gives it 60 s). */
export const HOME_RAIL_TIMEOUT_MS = 60_000;

async function request<T>(path: string, init?: RequestInit, timeoutMs?: number): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      headers: { "content-type": "application/json" },
      ...(timeoutMs != null ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
      ...init,
    });
  } catch (e) {
    // The signal's DOMException may come from another realm (jsdom) — match by name.
    const name = typeof e === "object" && e !== null && "name" in e ? String(e.name) : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new ApiError(
        0,
        `no answer after ${Math.round((timeoutMs ?? 0) / 1000)} s — check the arm card's rail read-back`,
      );
    }
    throw e;
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** `GET /api/workcell[?kind=hardware|sim]` (phase-11): `kind` selects the
 * workcell described (the Welcome tabs); omitted = the runtime's legacy pick. */
export const getWorkcell = (kind?: "hardware" | "sim"): Promise<WorkcellStatus> =>
  request(kind ? `/api/workcell?kind=${kind}` : "/api/workcell");
/** Sim preview cameras + hardware cameras (`live: false` = configured, not opened). */
export const getCameras = (): Promise<CameraInfo[]> => request("/api/cameras");
/** Configured microphones (phase-11). A runtime without the route (404) means
 * "no microphone" rather than an error. */
export async function getMicrophones(): Promise<MicrophoneInfo[]> {
  try {
    return await request<MicrophoneInfo[]>("/api/microphones");
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return [];
    throw e;
  }
}
export const getScenes = (kind: "sim" | "twin"): Promise<SceneInfo[]> =>
  request(`/api/scenes?kind=${kind}`);
export const getProfiles = (): Promise<ProfileInfo[]> => request("/api/profiles");
export const getPolicies = (): Promise<PolicyInfo[]> => request("/api/policies");
export const getKeymap = (): Promise<KeymapEntry[]> => request("/api/keymap");

export async function getSession(): Promise<SessionInfo | null> {
  try {
    return await request<SessionInfo>("/api/session");
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export const createSession = (spec: SessionSpec): Promise<SessionInfo> =>
  request("/api/session", { method: "POST", body: JSON.stringify(spec) });
export const endSession = (): Promise<void> => request("/api/session", { method: "DELETE" });

// Tracker calibration (phase-10, 13-tracker §3/§4): a session-less device
// management flow, hence REST rather than a control-WS action; progress rides
// telemetry as `TrackerTelemetry.calibration`. Illegal transitions are 409s
// whose `detail` surfaces through ApiError.
export const getTrackerCalibration = (): Promise<TrackerCalibrationStatus> =>
  request("/api/tracker/calibration");
export const postTrackerCalibration = (
  cmd: TrackerCalibrationCommand,
): Promise<TrackerCalibrationStatus> =>
  request("/api/tracker/calibration", { method: "POST", body: JSON.stringify(cmd) });

// Arm maintenance (phase-09b/09c/09d, 04-runtime §13.1): session-less
// controller hygiene from the Welcome Hardware tab (`clear_errors`,
// `apply_backstops` — neither produces motion), the in-session recovery from
// the Cockpit fault banner (`recover`), and — phase-09c — `home_rail`, the ONE
// maintenance op that moves hardware: operator-triggered, twin-gated (the
// runtime sweeps the full rail travel at the arm's current posture first),
// session-less. With `dryRun: true` the runtime only runs the sweep (and,
// phase-09d, plans the pre-positioning motion when the posture is not
// sweep-clear — `rail_sweep.pre_position`) and answers with the verdict (zero
// writes). The real op has three shapes (phase-09d, `ArmMaintenanceResult.
// status`): `done` — 200, the carriage homed synchronously with the joints
// untouched (runtime timeout 45 s → `timeoutMs` 60 s here); `accepted` — 202
// with a `job_id`, an asynchronous `RailHomingJob` first moves the arm along
// the planned path, then homes; its progress rides
// `telemetry.hardware_monitor.arms[].maintenance` and its final result is
// fetched from `getArmMaintenanceLast`; `refused` — no plan exists, `ok`
// false, suggestion in `detail`. The runtime picks the path (read-only monitor
// vs the session's driver); 404 = unknown arm, 409 = wrong path for the
// current state (session owns the boxes while an `apply_backstops` /
// `home_rail` arrives, monitor off / paused, `recover` without a session, rail
// homing in progress, …) — the `detail` surfaces through ApiError for the toast.
export interface MaintenanceOptions {
  /** `home_rail` only: sweep verdict without motion. Sent as `dry_run` when given. */
  dryRun?: boolean;
  /** Client deadline; a timeout surfaces as `ApiError{status: 0}`. */
  timeoutMs?: number;
}

export const postArmMaintenance = (
  armId: string,
  op: ArmMaintenanceRequest["op"],
  { dryRun, timeoutMs }: MaintenanceOptions = {},
): Promise<ArmMaintenanceResult> =>
  request(
    `/api/hardware/arms/${encodeURIComponent(armId)}/maintenance`,
    {
      method: "POST",
      body: JSON.stringify({
        op,
        ...(dryRun != null ? { dry_run: dryRun } : {}),
      } satisfies ArmMaintenanceRequest),
    },
    timeoutMs,
  );

/** `GET /api/hardware/arms/{arm_id}/maintenance/last` (phase-09d): the last
 * `ArmMaintenanceResult` the runtime stored for this arm — for a `home_rail`
 * that was `accepted` (202) it is the asynchronous job's FINAL result, an
 * `ArmMaintenanceResult` with `status: "done"` (or `ok: false` on failure) and
 * the same `job_id`, once the job ended; until then the stored value is still
 * the `accepted` one. 404 (no result yet / unknown arm) → null. */
export async function getArmMaintenanceLast(armId: string): Promise<ArmMaintenanceResult | null> {
  try {
    return await request<ArmMaintenanceResult>(
      `/api/hardware/arms/${encodeURIComponent(armId)}/maintenance/last`,
    );
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}
