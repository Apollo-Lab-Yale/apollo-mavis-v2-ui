/** Typed fetch client — relative URLs, JSON, ApiError on non-2xx (05-ui §4). */
import type {
  ArmMaintenanceRequest,
  ArmMaintenanceResult,
  CameraInfo,
  DatasetExportRequest,
  DatasetInfo,
  DatasetLayoutInfo,
  DoraInfo,
  EpisodeInfo,
  KeymapEntry,
  MicrophoneInfo,
  OnlineDaggerSessionInfo,
  PolicyInfo,
  ProfileInfo,
  ReturnHomeResult,
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
/** Deadline for `POST /api/session/return_home` (2026-09-08; widened 2026-09-09).
 * The runtime plans and then WALKS the arms back, ONE ARM AT A TIME in the planner's
 * order, in up to two gated phases (joints, then carriages), each arm-phase budgeted
 * at `max(30 s, 3x its executor time + 10 s)` plus a measured-arrival wait — so this
 * is a last-resort guard against a hung runtime and MUST outlast the server's own
 * worst case rather than cut a motion off mid-way (the handler keeps walking the arms
 * after the browser gives up). Worst case = 2 arms x 2 phases at the Hardware tab's
 * slowest pick, 10 %: a pi joint-1 sweep was 52 s of executor time (0.6 rad/s x 0.1)
 * -> 167 s budget per arm; a full 0.65 m carriage run at 5 mm/s 130 s -> 400 s per
 * arm; 2 x (167 + 400) ~= 1134 s plus planning. The 2026-09-09 caps (0.9 rad/s,
 * 75 mm/s) shorten all of that by 1.5x; the deadline keeps the older, longer bound. At
 * the 100 % default the same motion fits in ~110 s. */
export const RETURN_HOME_TIMEOUT_MS = 1_200_000;
/** What the operator reads when that deadline passes: the runtime may STILL be
 * moving the arms — the dialog must not suggest the cell is at rest. */
export const RETURN_HOME_TIMEOUT_HINT =
  "the runtime may still be moving the arms; wait until they stop before ending the session";
const DEFAULT_TIMEOUT_HINT = "check the arm card's rail read-back";

async function request<T>(
  path: string,
  init?: RequestInit,
  timeoutMs?: number,
  timeoutHint: string = DEFAULT_TIMEOUT_HINT,
): Promise<T> {
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
        `no answer after ${Math.round((timeoutMs ?? 0) / 1000)} s — ${timeoutHint}`,
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

/** Same error mapping as `request`, for a text/markdown answer (the Online DAgger SKILL.md). */
async function requestText(path: string): Promise<string> {
  const res = await fetch(path, { headers: { accept: "text/markdown, text/plain" } });
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
  return await res.text();
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
/** `DELETE /api/profiles/{id}` (Welcome page, 2026-09-07). 409 = the runtime
 * refuses to delete the designated initial-condition profile; the caller shows
 * `ApiError.detail` as-is. */
export const deleteProfile = (profileId: string): Promise<void> =>
  request(`/api/profiles/${encodeURIComponent(profileId)}`, { method: "DELETE" });
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
/** `POST /api/session/return_home` (2026-09-08): walk the workcell back to its
 * designated initial-condition profile and report where the arms ended up. The
 * Cockpit runs this BEFORE `endSession()` and only navigates away once it
 * answers; `ok: false` means the arms are NOT home and the operator must be told
 * (`status` says why, `detail` is the sentence to show). An operational refusal
 * is a 200 with `ok: false`, never an ApiError — so a thrown error here really is
 * a transport / runtime failure. */
export const returnHome = (): Promise<ReturnHomeResult> =>
  request(
    "/api/session/return_home",
    { method: "POST" },
    RETURN_HOME_TIMEOUT_MS,
    RETURN_HOME_TIMEOUT_HINT,
  );

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

// Datasets (2026-09-07; 04-runtime §10.6 / §13.1, 10-frames §11): the episode-directory
// store. Every read is manifest.json / episode.json only (no lerobot on the runtime's
// REST path); deletion removes ONE episode directory (204; 404 unknown; 409 for the
// episode being recorded or a legacy read-only tree); the export is a batch job
// (202) whose progress rides `telemetry.datasets.export`. Episode ids carry `.` and
// `Z` and travel verbatim (`encodeURIComponent` keeps both).
function repoPath(repoId: string): string {
  const [ns, name] = repoId.split("/", 2);
  return `${encodeURIComponent(ns ?? "")}/${encodeURIComponent(name ?? "")}`;
}

export const getDatasets = (): Promise<DatasetInfo[]> => request("/api/datasets");
export const getDatasetEpisodes = (repoId: string): Promise<EpisodeInfo[]> =>
  request(`/api/datasets/${repoPath(repoId)}/episodes`);
export const deleteEpisode = (repoId: string, episodeId: string): Promise<void> =>
  request(`/api/datasets/${repoPath(repoId)}/episodes/${encodeURIComponent(episodeId)}`, {
    method: "DELETE",
  });
export const deleteDataset = (repoId: string): Promise<void> =>
  request(`/api/datasets/${repoPath(repoId)}`, { method: "DELETE" });

export interface DatasetExportStarted {
  repo_id: string;
  format: string;
  started_at: string;
}
export const exportDataset = (
  repoId: string,
  body: DatasetExportRequest = { format: "lerobot_v3" },
): Promise<DatasetExportStarted> =>
  request(`/api/datasets/${repoPath(repoId)}/export`, {
    method: "POST",
    body: JSON.stringify(body),
  });

/** `GET /api/datasets/layout` (15-online-dagger §7 / D5): where each dataset
 * namespace lives — `default_namespace` (a bare `SessionSpec.dataset` resolves
 * there), the generic `<root>/<ns>/<name>` root and the mapped namespaces (`bc_demo`
 * → `~/data/bc_demo/<name>`, `online_dagger` → `~/data/online_dagger/<s>/rollouts`).
 * The sheets show the REAL folder from this instead of a hard-coded namespace. */
export const getDatasetLayout = (): Promise<DatasetLayoutInfo> => request("/api/datasets/layout");

// Dora external interface (phase-12, 14-dora §2.6) + Online DAgger (phase-14,
// 15-online-dagger §7): all session-less.
/** `GET /api/dora`: the private control plane's connection facts for foreign
 * clients — bind host, ports, zenoh connect string, state — never the token. */
export const getDora = (): Promise<DoraInfo> => request("/api/dora");
/** `GET /api/online_dagger/skill` → the SKILL.md text the policy repo's coding
 * harness installs (the tarball lives at `/api/online_dagger/skill.tgz`). */
export const getOnlineDaggerSkill = (): Promise<string> => requestText("/api/online_dagger/skill");
/** Path of the skill tarball; the sheet's one-liner pipes it into `tar xz`. */
export const ONLINE_DAGGER_SKILL_TGZ_PATH = "/api/online_dagger/skill.tgz";
/** `GET /api/online_dagger/sessions`: every `session.json` under the
 * `online_dagger` root (the sheet's resume picker), newest `last_used_at` first. */
export const getOnlineDaggerSessions = (): Promise<OnlineDaggerSessionInfo[]> =>
  request("/api/online_dagger/sessions");
