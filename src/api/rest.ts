/** Typed fetch client — relative URLs, JSON, ApiError on non-2xx (05-ui §4). */
import type {
  CameraInfo,
  KeymapEntry,
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

export const getWorkcell = (): Promise<WorkcellStatus> => request("/api/workcell");
export const getCameras = (): Promise<CameraInfo[]> => request("/api/cameras");
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
