/** GelloSheet (phase-15; 16-gello §11): the three-view modal behind the GELLO
 * Manipulation launcher card, built on `Sheet` (wide, 640 px) with a compact
 * `SegmentedControl` header ("Leader · Viewpoint · Start posture", `data-view` on the
 * panel). All three views stay mounted — only the active one is visible (`hidden`),
 * so switching animates nothing and the polling below never restarts on a switch.
 *
 * 1. **Leader** — `GET /api/gello` on open and every `infoPollMs` (1 s): the status
 *    chip (`LEADER connected` green / `starting` · `stale` amber / `error` red /
 *    `no_backend` grey), port · baud · rate · sample age · calibrated, and a seven-row
 *    raw-vs-mapped joint table (degrees) so the operator can move one GELLO joint at
 *    a time and check its sign (16-gello §16 item 1 — `joint_signs` are operator
 *    config). **Calibrate** (`match_arm`, with the one-line instruction "Pose GELLO
 *    like the Manipulation Arm, then click"), **Gripper open** / **Gripper closed**
 *    and **Clear** POST `/api/gello/calibrate {op, kind}`; each op's result (or its
 *    409) shows in place and the info is re-read at once.
 *    A stored calibration is never overwritten silently: **Calibrate (match arm)**
 *    with `info.calibrated` true asks first (`ConfirmDialog` — the op replaces the
 *    offsets with whatever posture GELLO and the arm happen to be in). Initial focus
 *    lands on **Cancel** (`data-autofocus`), never on a calibrate button — a held Enter
 *    on the card used to open the sheet AND fire `match_arm` (2026-09-09 review).
 * 2. **Viewpoint** — `auto` (default: a compatible viewpoint node drives the
 *    Perception Arm whenever its spec is fresh, else the arm holds) / `external` (a
 *    node must be attached at launch — the runtime 409s otherwise) / `hold` (the bus
 *    is ignored) → `SessionSpec.gello.viewpoint`; the external node's chip from
 *    `telemetry.external` (`externalPolicyChip`) and the hold posture from the info.
 * 3. **Start posture** — `POST /api/gello/preview {kind, scene, speed_scale?}` every
 *    `previewPollMs` (500 ms) while the sheet is open: the PNG of the virtual cell
 *    (colliding bodies tinted red by the runtime), a verdict line by `status`
 *    (`clear` green; `collision` red listing `a ↔ b at NN mm`; `joint_limit` /
 *    `no_leader` / `not_calibrated` amber with the runtime's detail; `no_workcell` /
 *    `scene_error` red) and the per-joint leader-vs-arm-goal table from `leader_q` /
 *    `q_goal`. The operator moves GELLO until the verdict is clear. Both polls carry
 *    a `GELLO_POLL_TIMEOUT_MS` deadline (a hung request no longer stops the chain —
 *    it fails like any other and the chain retries on its next tick) and every
 *    result is time-stamped: a verdict older than `GELLO_PREVIEW_STALE_FACTOR` poll
 *    periods (`previewStaleMs`) is STALE — grey `PREVIEW STALE` chip, Start disabled
 *    with `REASON.gelloPreviewStale` — so a frozen CLEAR can never keep Start armed
 *    while the operator moves GELLO (2026-09-09 review).
 *
 * Footer Cancel / **Start GELLO Manipulation**: enabled only while the LATEST
 * preview is `clear` and fresh and the leader is connected (`validateLaunch("gello")`
 * → `gelloPreviewReason`, the reason underneath otherwise — it names the actual
 * blocker: the calibration instruction for `not_calibrated`, the runtime's detail for
 * `no_workcell` / `scene_error`, "preview unavailable" for a poll that did not
 * answer, "move GELLO" only for a posture problem); Start posts `buildSpec("gello",
 * …)` — `{mode: gello, kind, arms, frames, sim_scene | digital_twin_scene: <scene
 * from GET /api/gello>, speed_scale on hardware, start_from: keep_current, gello:
 * {viewpoint}}`, never task / dataset / policy. A 409 (the runtime re-checks the
 * posture at launch: `GELLO posture collides: …`, `GELLO leader not available (…)`,
 * `no external viewpoint node attached (…)`) shows in the sheet and polling
 * continues, so the next preview tells the operator whether moving GELLO fixed it. */
import { useEffect, useId, useRef, useState } from "react";
import {
  ApiError,
  createSession,
  getGello,
  postGelloCalibrate,
  postGelloPreview,
} from "../api/rest";
import { ConfirmDialog } from "./ConfirmDialog";
import type {
  ExternalStatus,
  GelloCalibrateRequest,
  GelloCalibrateResult,
  GelloInfo,
  GelloPreviewRequest,
  GelloPreviewResult,
  SessionInfo,
} from "../gen";
import {
  buildSpec,
  DEFAULT_GELLO_VIEWPOINT,
  DEFAULT_SPEED_SCALE,
  validateLaunch,
  type GelloInputs,
  type LandingSelection,
} from "../lib/launch";
import { armLabel, MODE_LABELS, TAB_LABELS } from "../lib/streams";
import { useDelayedUnmount } from "../lib/useDelayedUnmount";
import { externalPolicyChip, ExternalPolicyChip } from "./externalPolicy";
import { Icon } from "./icons";
import { SegmentedControl } from "./SegmentedControl";
import { Sheet, SHEET_EXIT_MS } from "./Sheet";

export type GelloView = "leader" | "viewpoint" | "posture";
export type GelloViewpoint = GelloInputs["viewpoint"];
export type GelloCalibrateOp = GelloCalibrateRequest["op"];

/** `Sheet` width (wide, like the Online DAgger sheet). */
export const GELLO_SHEET_WIDTH = 640;
/** `GET /api/gello` period while the sheet is open. */
export const GELLO_INFO_POLL_MS = 1000;
/** `POST /api/gello/preview` period while the sheet is open (16-gello §5.4: 2 Hz). */
export const GELLO_PREVIEW_POLL_MS = 500;
/** A preview result older than this many poll periods is STALE (2026-09-09 review):
 * the verdict chip greys out and Start is disabled with `REASON.gelloPreviewStale`
 * until the next result lands. 3 periods = 1.5 s at the default 2 Hz — a hung request
 * shows up here well before the 3 s `GELLO_POLL_TIMEOUT_MS` ends it. */
export const GELLO_PREVIEW_STALE_FACTOR = 3;
/** The one-line calibration instruction (16-gello §11). */
export const CALIBRATE_INSTRUCTION = "Pose GELLO like the Manipulation Arm, then click Calibrate.";
/** `ConfirmDialog` text before `match_arm` replaces a stored calibration. */
export const MATCH_ARM_OVERWRITE_TEXT =
  "GELLO is already calibrated. Calibrate (match arm) overwrites the stored calibration with offsets taken from the CURRENT GELLO and Manipulation Arm postures — pose GELLO like the arm first.";

const VIEW_OPTIONS = [
  {
    value: "leader",
    label: "Leader",
    testId: "gello-step-leader",
    panelId: "gello-view-leader",
    tabId: "gello-tab-leader",
  },
  {
    value: "viewpoint",
    label: "Viewpoint",
    testId: "gello-step-viewpoint",
    panelId: "gello-view-viewpoint",
    tabId: "gello-tab-viewpoint",
  },
  {
    value: "posture",
    label: "Start posture",
    testId: "gello-step-posture",
    panelId: "gello-view-posture",
    tabId: "gello-tab-posture",
  },
] as const satisfies readonly {
  value: GelloView;
  label: string;
  testId: string;
  panelId: string;
  tabId: string;
}[];

export const VIEWPOINT_OPTIONS: readonly { value: GelloViewpoint; label: string; help: string }[] =
  [
    {
      value: "auto",
      label: "Auto",
      help: "a compatible viewpoint node drives the Perception Arm whenever its spec is fresh; without one the arm holds its GELLO posture",
    },
    {
      value: "external",
      label: "External node required",
      help: "a viewpoint node must be attached when you press Start — the runtime refuses the launch otherwise",
    },
    {
      value: "hold",
      label: "Hold",
      help: "the Perception Arm holds its GELLO posture; the bus is ignored",
    },
  ];

export type VerdictTone = "green" | "amber" | "red" | "grey";

export interface VerdictModel {
  tone: VerdictTone;
  label: string;
  text: string;
  /** `a ↔ b at NN mm` per colliding pair (tightest first, as the runtime lists them). */
  pairs: string[];
}

/** The verdict line for a preview result (null = no result in hand). `stale` = the
 * result is older than the staleness bound: whatever it said is unknown now — a grey
 * `PREVIEW STALE` chip, no pairs (the runtime has not answered). */
export function previewVerdict(p: GelloPreviewResult | null, stale = false): VerdictModel {
  if (!p) return { tone: "grey", label: "—", text: "waiting for the first preview…", pairs: [] };
  if (stale)
    return {
      tone: "grey",
      label: "PREVIEW STALE",
      text: "the runtime has not answered the preview poll — waiting; Start is disabled",
      pairs: [],
    };
  const detail = p.detail?.trim() ?? "";
  switch (p.status) {
    case "clear":
      return {
        tone: "green",
        label: "CLEAR",
        text: "GELLO posture is clear — Start moves the arms there, one at a time",
        pairs: [],
      };
    case "collision":
      return {
        tone: "red",
        label: "COLLISION",
        text: detail || "the GELLO posture collides — move GELLO and wait for the preview",
        pairs: (p.pairs ?? []).map((q) => `${q.a} ↔ ${q.b} at ${Math.round(q.dist_m * 1000)} mm`),
      };
    case "joint_limit":
      return {
        tone: "amber",
        label: "JOINT LIMIT",
        text: detail || "a leader joint is beyond the Manipulation Arm's limits",
        pairs: [],
      };
    case "no_leader":
      return {
        tone: "amber",
        label: "NO LEADER",
        text: detail || "no fresh leader sample — check the Leader view",
        pairs: [],
      };
    case "not_calibrated":
      return {
        tone: "amber",
        label: "NOT CALIBRATED",
        text: detail || "run Calibrate (match arm) in the Leader view first",
        pairs: [],
      };
    case "no_workcell":
      return {
        tone: "red",
        label: "NO WORKCELL",
        text: detail || "no workcell of this kind",
        pairs: [],
      };
    case "scene_error":
      return {
        tone: "red",
        label: "SCENE ERROR",
        text: detail || "the kitchen twin failed to build",
        pairs: [],
      };
  }
}

/** The leader status chip (`LEADER <status>`). */
export function leaderChip(info: GelloInfo | null): { tone: VerdictTone; label: string } {
  if (!info) return { tone: "grey", label: "LEADER —" };
  const tone: VerdictTone =
    info.status === "connected"
      ? "green"
      : info.status === "error"
        ? "red"
        : info.status === "no_backend"
          ? "grey"
          : "amber";
  return { tone, label: `LEADER ${info.status}` };
}

/** Radians → degrees, one decimal ("—" for a missing value). */
export const deg = (rad: number | null | undefined): string =>
  rad == null || !Number.isFinite(rad) ? "—" : ((rad * 180) / Math.PI).toFixed(1);

const errText = (e: unknown): string =>
  e instanceof ApiError
    ? e.status === 404
      ? "this runtime has no GELLO support (404)"
      : e.detail
    : e instanceof Error
      ? e.message
      : String(e);

export interface GelloSheetProps {
  /** Page-level selection (tab, arms, speed …); the GELLO fields are collected here. */
  sel: LandingSelection;
  /** `telemetry.external` — the Dora bridge / viewpoint-node attachment. */
  external: ExternalStatus | null | undefined;
  onLaunched(info: SessionInfo): void;
  onClose(): void;
  /** Default true; `false` runs the Sheet exit while the owner keeps it mounted. */
  open?: boolean;
  /** Test hooks: the two poll periods. */
  infoPollMs?: number;
  previewPollMs?: number;
  /** Age at which the latest preview counts as stale; default
   * `GELLO_PREVIEW_STALE_FACTOR x previewPollMs`. */
  previewStaleMs?: number;
}

interface CalibrateOutcome {
  op: GelloCalibrateOp;
  result: GelloCalibrateResult | null;
  error: string | null;
}

const JOINTS = [0, 1, 2, 3, 4, 5, 6] as const;

export function GelloSheet({
  sel,
  external,
  onLaunched,
  onClose,
  open = true,
  infoPollMs = GELLO_INFO_POLL_MS,
  previewPollMs = GELLO_PREVIEW_POLL_MS,
  previewStaleMs = GELLO_PREVIEW_STALE_FACTOR * previewPollMs,
}: GelloSheetProps) {
  const formId = useId();
  const reasonId = useId();
  const [view, setView] = useState<GelloView>("leader");
  const [viewpoint, setViewpoint] = useState<GelloViewpoint>(DEFAULT_GELLO_VIEWPOINT);

  // -- GET /api/gello: on open and every infoPollMs (a timeout chain: never two in flight) --
  const [info, setInfo] = useState<GelloInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [infoNonce, setInfoNonce] = useState(0); // bumped after a calibrate op: re-read now
  useEffect(() => {
    if (!open) return;
    let alive = true;
    let timer: number | undefined;
    const tick = async () => {
      try {
        const i = await getGello();
        if (!alive) return;
        setInfo(i);
        setInfoError(null);
      } catch (e) {
        if (!alive) return;
        setInfoError(errText(e));
      }
      if (alive) timer = window.setTimeout(() => void tick(), infoPollMs);
    };
    void tick();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [open, infoPollMs, infoNonce]);

  // -- POST /api/gello/preview every previewPollMs while open; the body follows the
  //    latest info / selection through a ref so the chain never restarts mid-flight.
  //    Every result is stamped (`previewAt`); a timer flips `previewStale` once it is
  //    older than `previewStaleMs` and the next result resets both. A failed poll
  //    (409 / 404 / network / the 3 s timeout) drops the result — the reason reads
  //    "preview unavailable" — and the chain goes on. --
  const [preview, setPreview] = useState<GelloPreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewAt, setPreviewAt] = useState<number | null>(null);
  const [previewStale, setPreviewStale] = useState(false);
  useEffect(() => {
    if (previewAt === null) return;
    const id = window.setTimeout(() => setPreviewStale(true), previewStaleMs);
    return () => window.clearTimeout(id);
  }, [previewAt, previewStaleMs]);
  const bodyRef = useRef<GelloPreviewRequest>({ kind: sel.kind });
  bodyRef.current = {
    kind: sel.kind,
    ...(info?.scene_id ? { scene: info.scene_id } : {}),
    ...(sel.kind === "hardware" ? { speed_scale: sel.speedScale ?? DEFAULT_SPEED_SCALE } : {}),
  };
  useEffect(() => {
    if (!open) return;
    let alive = true;
    let timer: number | undefined;
    const tick = async () => {
      try {
        const p = await postGelloPreview(bodyRef.current);
        if (!alive) return;
        setPreview(p);
        setPreviewAt(Date.now());
        setPreviewStale(false);
        setPreviewError(null);
      } catch (e) {
        if (!alive) return;
        setPreview(null);
        setPreviewAt(null);
        setPreviewStale(false);
        setPreviewError(errText(e));
      }
      if (alive) timer = window.setTimeout(() => void tick(), previewPollMs);
    };
    void tick();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [open, previewPollMs]);

  // -- calibration ops; `match_arm` over a stored calibration asks first ------------------
  const [calibrating, setCalibrating] = useState<GelloCalibrateOp | null>(null);
  const [calibrate, setCalibrate] = useState<CalibrateOutcome | null>(null);
  const [confirmMatch, setConfirmMatch] = useState(false);
  const confirmMatchMounted = useDelayedUnmount(confirmMatch, SHEET_EXIT_MS);
  const runCalibrate = async (op: GelloCalibrateOp) => {
    if (calibrating !== null) return;
    setCalibrating(op);
    try {
      const result = await postGelloCalibrate({ op, kind: sel.kind });
      setCalibrate({ op, result, error: null });
    } catch (e) {
      setCalibrate({ op, result: null, error: errText(e) });
    } finally {
      setCalibrating(null);
      setInfoNonce((n) => n + 1);
    }
  };
  const matchArm = () => {
    if (calibrating !== null) return;
    if (info?.calibrated) setConfirmMatch(true);
    else void runCalibrate("match_arm");
  };

  // -- launch --------------------------------------------------------------------------------
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full: LandingSelection = {
    ...sel,
    gello: {
      viewpoint,
      sceneId: info?.scene_id ?? null,
      leaderReady: info?.status === "connected",
      previewStatus: preview?.status ?? null,
      previewDetail: preview?.detail ?? "",
      previewStale,
    },
  };
  const reason = validateLaunch("gello", full);
  const submit = async () => {
    if (reason !== null || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      onLaunched(await createSession(buildSpec("gello", full)));
    } catch (e) {
      setError(errText(e));
    } finally {
      setSubmitting(false);
    }
  };

  const chip = leaderChip(info);
  const verdict = previewVerdict(preview, previewStale);
  const attached =
    !!external &&
    external.enabled === true &&
    external.state === "attached" &&
    external.policy_attached === true;
  const extChip = externalPolicyChip(external, false);
  const startLabel = `Start ${MODE_LABELS.gello}`;
  const gripGoal = preview?.q_goal?.["grip"] ?? null;
  const leaderQ = preview?.leader_q ?? null;
  const hardwareRefused = sel.kind === "hardware" && info !== null && !info.hardware_admitted;

  return (
    <>
      <Sheet
        title={MODE_LABELS.gello}
        subtitle={`${TAB_LABELS[sel.tab]} · ${info?.scene_label ?? "GELLO kitchen twin"} · Start posture = GELLO`}
        width={GELLO_SHEET_WIDTH}
        open={open}
        hostTestId="gello-sheet"
        testId="gello-panel"
        closeButtonTestId="gello-close"
        onRequestClose={onClose}
        className="gello-sheet"
        panelProps={{ "data-view": view }}
        headerExtra={
          <SegmentedControl
            options={VIEW_OPTIONS}
            value={view}
            onChange={(v) => setView(v)}
            aria-label="GELLO setup views"
            className="segmented-compact od-steps-control"
            testId="gello-steps"
          />
        }
        footerStart={
          // Initial focus (Sheet.pickInitialFocus): a harmless control — never a
          // calibrate button, which is what the first body button used to be.
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            data-testid="launch-cancel"
            data-autofocus
          >
            Cancel
          </button>
        }
        footer={
          <div className="sheet-primary">
            <button
              type="submit"
              form={formId}
              className="btn-primary"
              disabled={reason !== null || submitting}
              aria-describedby={reason !== null ? reasonId : undefined}
              data-testid="launch-confirm"
            >
              {submitting ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  Moving to the GELLO posture…
                </>
              ) : (
                startLabel
              )}
            </button>
            {reason !== null && !submitting && (
              <span className="btn-reason" id={reasonId} data-testid="launch-reason">
                {reason}
              </span>
            )}
            {reason === null && hardwareRefused && (
              <span className="btn-reason" data-testid="gello-hardware-warning">
                This runtime does not admit GELLO on hardware yet — Start will be refused.
              </span>
            )}
          </div>
        }
      >
        <form
          id={formId}
          className="launch-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          noValidate
          aria-busy={submitting || undefined}
        >
          {/* -- Leader ------------------------------------------------------------------ */}
          <section
            id="gello-view-leader"
            role="tabpanel"
            aria-labelledby={VIEW_OPTIONS[0].tabId}
            className="gello-view"
            hidden={view !== "leader"}
            data-testid="gello-view-leader"
          >
            <div className="card gello-status" data-testid="gello-leader-status-card">
              <div className="gello-status-row">
                <span
                  className={`chip chip-${chip.tone}`}
                  data-testid="gello-leader-chip"
                  data-status={info?.status ?? ""}
                >
                  {chip.label}
                </span>
                {info?.detail && (
                  <span className="text-caption fg-3" data-testid="gello-leader-detail">
                    {info.detail}
                  </span>
                )}
                {infoError !== null && (
                  <span className="text-caption fg-3" data-testid="gello-info-error">
                    GET /api/gello failed: {infoError}
                  </span>
                )}
              </div>
              <dl className="gello-facts" data-testid="gello-facts">
                <div className="gello-fact">
                  <dt className="text-caption fg-3">backend</dt>
                  <dd className="text-mono">{info?.backend ?? "—"}</dd>
                </div>
                <div className="gello-fact">
                  <dt className="text-caption fg-3">port</dt>
                  <dd className="text-mono" data-testid="gello-port">
                    {info?.port || "—"}
                  </dd>
                </div>
                <div className="gello-fact">
                  <dt className="text-caption fg-3">baud</dt>
                  <dd className="text-mono" data-testid="gello-baud">
                    {info?.baud ?? "—"}
                  </dd>
                </div>
                <div className="gello-fact">
                  <dt className="text-caption fg-3">rate</dt>
                  <dd className="text-mono" data-testid="gello-rate">
                    {info ? `${(info.rate_hz ?? 0).toFixed(0)} Hz` : "—"}
                  </dd>
                </div>
                <div className="gello-fact">
                  <dt className="text-caption fg-3">sample age</dt>
                  <dd className="text-mono" data-testid="gello-age">
                    {info?.age_s == null ? "—" : `${Math.round(info.age_s * 1000)} ms`}
                  </dd>
                </div>
                <div className="gello-fact">
                  <dt className="text-caption fg-3">calibrated</dt>
                  <dd className="text-mono" data-testid="gello-calibrated">
                    {info ? (info.calibrated ? "yes" : "no") : "—"}
                  </dd>
                </div>
                <div className="gello-fact">
                  <dt className="text-caption fg-3">gripper</dt>
                  <dd className="text-mono" data-testid="gello-gripper-frac">
                    {info?.gripper_frac == null ? "—" : `${Math.round(info.gripper_frac * 100)}%`}
                    {info?.gripper_open_rad != null && info?.gripper_closed_rad != null && (
                      <span className="fg-3">
                        {" "}
                        · open {info.gripper_open_rad.toFixed(2)} / closed{" "}
                        {info.gripper_closed_rad.toFixed(2)} rad
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>

            <table className="gello-joints" data-testid="gello-joint-table">
              <thead>
                <tr>
                  <th>joint</th>
                  <th>raw °</th>
                  <th>mapped °</th>
                  <th>sign</th>
                  <th>offset °</th>
                </tr>
              </thead>
              <tbody>
                {JOINTS.map((j) => (
                  <tr key={j} data-testid={`gello-joint-J${j + 1}`}>
                    <td>J{j + 1}</td>
                    <td>{deg(info?.q_raw?.[j])}</td>
                    <td>{deg(info?.q?.[j])}</td>
                    <td>{info?.joint_signs[j] ?? "—"}</td>
                    <td>{deg(info?.joint_offsets_rad?.[j])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <span className="text-caption fg-3">
              Move one GELLO joint at a time: its mapped value must follow the Manipulation Arm's
              joint of the same number in the same direction — else flip that entry of
              <code> gello.joint_signs</code> in the runtime config.
            </span>

            <div className="gello-calibrate" data-testid="gello-calibrate">
              <span className="text-label fg-3">Calibration</span>
              <span className="text-caption fg-2" data-testid="gello-calibrate-instruction">
                {CALIBRATE_INSTRUCTION}
              </span>
              <div className="od-buttons">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={calibrating !== null}
                  onClick={matchArm}
                  data-testid="gello-cal-match_arm"
                >
                  Calibrate (match arm)
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={calibrating !== null}
                  onClick={() => void runCalibrate("gripper_open")}
                  data-testid="gello-cal-gripper_open"
                >
                  Gripper open
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={calibrating !== null}
                  onClick={() => void runCalibrate("gripper_closed")}
                  data-testid="gello-cal-gripper_closed"
                >
                  Gripper closed
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={calibrating !== null}
                  onClick={() => void runCalibrate("clear")}
                  data-testid="gello-cal-clear"
                >
                  Clear
                </button>
              </div>
              {calibrate !== null && (
                <span
                  className={`pill ${calibrate.result?.ok ? "pill-ok" : "pill-warn"} gello-result`}
                  data-testid="gello-calibrate-result"
                  data-op={calibrate.op}
                  data-ok={calibrate.result?.ok ? "true" : "false"}
                >
                  <Icon name={calibrate.result?.ok ? "check" : "warning"} size={12} />
                  {calibrate.op}:{" "}
                  {calibrate.error ??
                    calibrate.result?.detail ??
                    (calibrate.result?.ok ? "done" : "refused")}
                </span>
              )}
              {info?.calibration_path && (
                <span className="text-caption fg-3 text-mono" data-testid="gello-calibration-path">
                  {info.calibration_path}
                </span>
              )}
            </div>
          </section>

          {/* -- Viewpoint --------------------------------------------------------------- */}
          <section
            id="gello-view-viewpoint"
            role="tabpanel"
            aria-labelledby={VIEW_OPTIONS[1].tabId}
            className="gello-view"
            hidden={view !== "viewpoint"}
            data-testid="gello-view-viewpoint"
          >
            <fieldset className="field radio-rows" data-testid="gello-viewpoint">
              <legend className="field-label">Perception Arm viewpoint</legend>
              {VIEWPOINT_OPTIONS.map((o) => (
                <label
                  key={o.value}
                  className="radio-row"
                  data-selected={viewpoint === o.value ? "true" : "false"}
                >
                  <input
                    type="radio"
                    name="gello-viewpoint"
                    className="visually-hidden"
                    checked={viewpoint === o.value}
                    onChange={() => setViewpoint(o.value)}
                    data-testid={`gello-viewpoint-${o.value}`}
                  />
                  <span className="option-radio" aria-hidden="true" />
                  <span className="radio-row-text">
                    <span className="text-body-strong">
                      {o.label}
                      {o.value === DEFAULT_GELLO_VIEWPOINT && (
                        <span className="fg-3 text-caption"> (default)</span>
                      )}
                    </span>
                    <span className="text-caption fg-3">{o.help}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <div className="card od-status" data-testid="gello-external">
              <div className="od-status-row">
                {extChip ? (
                  <ExternalPolicyChip external={external} policyStale={false} />
                ) : (
                  <span className="chip chip-grey" data-testid="external-policy-chip-none">
                    EXTERNAL POLICY none
                  </span>
                )}
                {attached && external?.policy_id && (
                  <span className="text-caption fg-2 text-mono" data-testid="gello-external-id">
                    {external.policy_id}
                  </span>
                )}
              </div>
              <span className="text-caption fg-3" data-testid="gello-external-detail">
                {attached
                  ? 'A policy node is attached — with auto or external it drives the Perception Arm when its spec fits the view-only layout (external_arms: ["view"]).'
                  : !external
                    ? "The runtime reports no Dora bridge (telemetry.external absent)."
                    : external.enabled !== true
                      ? "Dora bridge disabled in this runtime config (dora.enabled: false) — the lab render turns it on."
                      : external.state !== "attached"
                        ? `Dataflow ${external.state ?? "unknown"}${external.detail ? ` — ${external.detail}` : ""}.`
                        : "Dataflow attached, but no policy spec heartbeat yet — start the viewpoint node."}
              </span>
              {viewpoint === "external" && !attached && (
                <span className="text-caption fg-2" data-testid="gello-viewpoint-warning">
                  <Icon name="warning" size={12} /> No viewpoint node attached — the runtime refuses
                  Start with viewpoint "external"; attach one or pick Auto.
                </span>
              )}
            </div>

            <div className="gello-status" data-testid="gello-hold-posture">
              <span className="text-label fg-3">{armLabel("view")} hold posture</span>
              <span className="text-caption fg-2 text-mono">
                {info
                  ? `J1–J7 ${info.view_posture_rad.map((r) => deg(r)).join(" / ")} ° · rail ${info.view_rail_m.toFixed(2)} m`
                  : "—"}
              </span>
              <span className="text-caption fg-3">
                Where the Perception Arm goes at launch and holds whenever no node drives it.
              </span>
            </div>
          </section>

          {/* -- Start posture ----------------------------------------------------------- */}
          <section
            id="gello-view-posture"
            role="tabpanel"
            aria-labelledby={VIEW_OPTIONS[2].tabId}
            className="gello-view"
            hidden={view !== "posture"}
            data-testid="gello-view-posture"
          >
            <div className="gello-preview" data-testid="gello-preview">
              {preview?.image_png_b64 ? (
                <img
                  className="gello-preview-img"
                  src={`data:image/png;base64,${preview.image_png_b64}`}
                  alt={`kitchen twin from ${preview.camera ?? "cam_kitchen"} — colliding bodies tinted red`}
                  data-testid="gello-preview-img"
                />
              ) : (
                <div className="gello-preview-empty text-caption" data-testid="gello-preview-empty">
                  {previewError !== null
                    ? `preview unavailable: ${previewError}`
                    : preview
                      ? "no preview image"
                      : "waiting for the first preview…"}
                </div>
              )}
              <div
                className="gello-verdict"
                data-testid="gello-verdict"
                data-status={preview?.status ?? ""}
                data-stale={previewStale ? "true" : undefined}
              >
                <span className={`chip chip-${verdict.tone}`} data-testid="gello-verdict-chip">
                  {verdict.label}
                </span>
                <span className="text-caption fg-2">{verdict.text}</span>
              </div>
              {verdict.pairs.length > 0 && (
                <ul className="gello-pairs" data-testid="gello-pairs">
                  {verdict.pairs.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
              {previewError !== null && (
                <span className="text-caption fg-3" data-testid="gello-preview-error">
                  POST /api/gello/preview failed: {previewError}
                </span>
              )}
            </div>

            {gripGoal && leaderQ && (
              <table className="gello-joints" data-testid="gello-goal-table">
                <thead>
                  <tr>
                    <th>{armLabel("grip")}</th>
                    <th>leader °</th>
                    <th>arm goal °</th>
                  </tr>
                </thead>
                <tbody>
                  {JOINTS.map((j) => (
                    <tr key={j} data-testid={`gello-goal-J${j + 1}`}>
                      <td>J{j + 1}</td>
                      <td>{deg(leaderQ[j])}</td>
                      <td>{deg(gripGoal[j])}</td>
                    </tr>
                  ))}
                  {gripGoal.length > 7 && (
                    <tr data-testid="gello-goal-rail">
                      <td>rail</td>
                      <td>—</td>
                      <td>{gripGoal[7]!.toFixed(3)} m</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
            <span className="text-caption fg-3">
              Start plans both arms on the kitchen twin and moves them ONE AT A TIME to this posture
              (the Perception Arm to its hold posture), then the leader engages. Move GELLO until
              the verdict is clear.
            </span>
          </section>

          {error !== null && (
            <div className="sheet-error" role="alert" data-testid="launch-error">
              <Icon name="error" size={16} />
              <span>{error}</span>
            </div>
          )}
        </form>
      </Sheet>
      {confirmMatchMounted && (
        <ConfirmDialog
          open={confirmMatch}
          title="Overwrite the GELLO calibration?"
          text={`${MATCH_ARM_OVERWRITE_TEXT}${info?.calibration_path ? ` (${info.calibration_path})` : ""}`}
          confirmLabel="Calibrate (match arm)"
          onConfirm={() => {
            setConfirmMatch(false);
            void runCalibrate("match_arm");
          }}
          onCancel={() => setConfirmMatch(false)}
        />
      )}
    </>
  );
}
