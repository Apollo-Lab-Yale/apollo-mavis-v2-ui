/** Typed fetch client — relative URLs, JSON, ApiError on non-2xx (05-ui §4). */
import type {
  CameraInfo,
  KeymapEntry,
  PolicyInfo,
  ProfileInfo,
  SceneInfo,
  SessionInfo,
  SessionSpec,
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
