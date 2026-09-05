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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...init,
  });
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

// Arm maintenance (phase-09b, 04-runtime §13.1): session-less controller
// hygiene from the Welcome Hardware tab (`clear_errors`, `apply_backstops` —
// neither produces motion) and the in-session recovery from the Cockpit fault
// banner (`recover`). The runtime picks the path (read-only monitor vs the
// session's driver) and answers 200 with `ok` either way; 404 = unknown arm,
// 409 = wrong path for the current state (session owns the boxes while an
// `apply_backstops` arrives, monitor off / paused, `recover` without a
// session, …) — the `detail` surfaces through ApiError for the toast.
export const postArmMaintenance = (
  armId: string,
  op: ArmMaintenanceRequest["op"],
): Promise<ArmMaintenanceResult> =>
  request(`/api/hardware/arms/${encodeURIComponent(armId)}/maintenance`, {
    method: "POST",
    body: JSON.stringify({ op } satisfies ArmMaintenanceRequest),
  });
