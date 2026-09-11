/** OnlineDaggerSheet (phase-14; 15-online-dagger §8): the two-view modal behind the
 * Online DAgger launcher card, built on `Sheet` (wide) with a compact
 * `SegmentedControl` step header ("1 Connect · 2 Configure", `data-view` on the
 * panel). Both views stay mounted — only the active one is visible (`hidden`), so
 * switching animates nothing and never touches layout height.
 *
 * The runtime is the algorithm-agnostic SHELL (operator decision 2026-09-08): it
 * performs rollouts, exposes take-over / hand-back, labels every step novice /
 * expert and reports what the trainer says. Which DAgger variant runs — and every
 * hyper-parameter, reference pool or offline anchor it needs — is the trainer
 * node's own business, so this sheet configures NONE of it: no dataset picker, no
 * hyper-parameters, no replay-buffer row.
 *
 * 1. **Connect a trainer** — the status card (external-policy chip: attached /
 *    stale / none; trainer pill from the SESSION-LESS `telemetry.external` fields
 *    the runtime fills while the node's spec is fresh — `capabilities` and the
 *    latest `trainer_status` heartbeat: trainer id, `online_dagger` capability,
 *    state, the error detail; "capability unknown" only for a runtime that
 *    predates the field), the connection facts from `GET /api/dora` (bind host,
 *    daemon port, zenoh connect; copy buttons), the skill-install one-liner
 *    (`curl … /api/online_dagger/skill.tgz | tar xz -C ~/.claude/skills/`, copy
 *    button; the runtime's real address, see `lib/runtimeOrigin.ts`), a disclosure
 *    with the fetched SKILL.md and a three-line "how it works" that says where the
 *    algorithm lives. Primary **Continue**, never gated; a quiet caption says
 *    whether Start will be possible — an erroring trainer heartbeat is a WARNING
 *    there (`trainerErrorWarning`), never a Start refusal: the runtime does not 409
 *    on it and a new session is the recovery path.
 * 2. **Configure** — Session (name → `~/data/online_dagger/<slug>` preview, resume
 *    pill + picker from `GET /api/online_dagger/sessions`; an explicit "Resume the
 *    existing session" checkbox appears when the runtime 409ed "already exists" for
 *    this name or the listing itself failed, so `resume: true` is always reachable),
 *    Task (prefilled from a resumed session — the prefill follows the picked session
 *    and clears again when the name moves to a NEW one, until the operator types),
 *    Recording (the shared idle-frame filter + Return-to-start row), Advanced (pause
 *    while training, wait for trainer ready, per-arm frames). Footer Cancel / **Start
 *    Online DAgger** with the blocking reason underneath; a 409 shows in place and
 *    re-reads `GET /api/online_dagger/sessions` (an "already exists" answer makes the
 *    resume pill appear so the next Start resumes). `buildSpec("dagger", …)` emits
 *    `policy_source: "external"` + `online_dagger`, never `dataset` / `policy`. */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ApiError,
  createSession,
  getDora,
  getOnlineDaggerSessions,
  getOnlineDaggerSkill,
  ONLINE_DAGGER_SKILL_TGZ_PATH,
} from "../api/rest";
import type {
  CameraInfo,
  DatasetLayoutInfo,
  DoraInfo,
  ExternalStatus,
  OnlineDaggerSessionInfo,
  OnlineDaggerStatus,
  SessionInfo,
  TrainerStatusAnnounce,
} from "../gen";
import {
  buildSpec,
  DEFAULT_ACTION_FILTER,
  DEFAULT_ONLINE_DAGGER,
  onlineDaggerFolderPreview,
  REASON,
  slugSession,
  trainerErrorWarning,
  validateLaunch,
  type ActionFilterInputs,
  type LandingSelection,
  type OnlineDaggerInputs,
} from "../lib/launch";
import { currentRuntimeOrigin, type RuntimeOrigin } from "../lib/runtimeOrigin";
import { armLabel, MODE_LABELS } from "../lib/streams";
import type { FrameRef } from "../lib/types";
import { CopyButton } from "./CopyButton";
import { externalPolicyAttached, ExternalPolicyStatus } from "./externalPolicy";
import { Icon } from "./icons";
import { FrameSelector } from "./landing";
import { launchContext } from "./LaunchSheet";
import { ActionFilterFieldset, ReturnToStartRow } from "./recordingFields";
import { SegmentedControl } from "./SegmentedControl";
import { Sheet } from "./Sheet";

export type OnlineDaggerView = "connect" | "configure";

/** `Sheet` width for the two-view sheet ("wide", 15-online-dagger §8). */
export const ONLINE_DAGGER_SHEET_WIDTH = 640;

/** The capability a trainer-capable policy node lists in `PolicySpecAnnounce.
 * capabilities` (15-online-dagger §6). */
export const TRAINER_CAPABILITY = "online_dagger";

export interface OnlineDaggerSheetProps {
  /** Page-level selection (tab, arms, start-from …); the form is collected here. */
  sel: LandingSelection;
  /** FrameSelector options (the current tab's cameras). */
  cameras: CameraInfo[];
  /** Name of the selected profile (subtitle), when `sel.startFrom === "profile"`. */
  profileName?: string | null;
  /** A designated initial-condition profile exists for the tab's kind. */
  hasInitialCondition?: boolean;
  /** `GET /api/datasets/layout` (the folder preview); null while loading. */
  layout?: DatasetLayoutInfo | null;
  /** `telemetry.external` — the Dora bridge / policy-node attachment. */
  external: ExternalStatus | null | undefined;
  /** `telemetry.dagger.online_dagger` of a RUNNING session (rare on the Welcome
   * page; carries the trainer's own status when present). */
  onlineDaggerStatus?: OnlineDaggerStatus | null;
  onLaunched(info: SessionInfo): void;
  onClose(): void;
  /** Default true; `false` runs the Sheet exit while the owner keeps it mounted. */
  open?: boolean;
  /** Test hook: the runtime origin for the one-liner (default: derived from the page). */
  runtime?: RuntimeOrigin;
}

/** The step tabs; each tab's `id` labels its `tabpanel` back (`aria-labelledby`). */
const VIEW_OPTIONS = [
  {
    value: "connect",
    label: "1 Connect",
    testId: "online-dagger-step-1",
    panelId: "od-view-connect",
    tabId: "od-tab-connect",
  },
  {
    value: "configure",
    label: "2 Configure",
    testId: "online-dagger-step-2",
    panelId: "od-view-configure",
    tabId: "od-tab-configure",
  },
] as const satisfies readonly {
  value: OnlineDaggerView;
  label: string;
  testId: string;
  panelId: string;
  tabId: string;
}[];

/** The skill-install one-liner for a runtime origin (15-online-dagger §8). */
export const skillInstallCommand = (origin: string): string =>
  `curl -s ${origin}${ONLINE_DAGGER_SKILL_TGZ_PATH} | tar xz -C ~/.claude/skills/`;

/** An external policy node is attached and its spec heartbeat is fresh — the shared
 * `externalPolicyAttached` (`components/externalPolicy.tsx`, since 2026-09-11 the
 * Inference sheet judges the same thing), kept under its trainer name here. */
export const trainerAttached = externalPolicyAttached;

/** The attached node's `online_dagger` capability: `true` while an Online DAgger
 * session's trainer status is flowing, else from `telemetry.external.capabilities`
 * (the FRESH spec's `PolicySpecAnnounce.capabilities`, session-less since
 * phase-14 — the runtime always fills it, `[]` for a plain policy node); `null`
 * only when the runtime predates the field. */
export function trainerCapability(
  external: ExternalStatus | null | undefined,
  status: OnlineDaggerStatus | null | undefined,
): boolean | null {
  if (status?.trainer) return true;
  const caps = external?.capabilities;
  if (caps === undefined) return null;
  return caps.includes(TRAINER_CAPABILITY);
}

/** The trainer heartbeat to judge: the session-less one the runtime forwards while
 * the node's spec is fresh (`telemetry.external.trainer_status`, null once the node
 * detaches or falls silent), else a RUNNING session's verbatim copy. */
export const trainerStatusOf = (
  external: ExternalStatus | null | undefined,
  status: OnlineDaggerStatus | null | undefined,
): TrainerStatusAnnounce | null => external?.trainer_status ?? status?.trainer ?? null;

/** The trainer's error detail when its heartbeat reports `state: "error"` — shown
 * in the pill (warn tone) and the Connect caption (`trainerErrorWarning`); NOT a
 * Start refusal (the runtime does not 409 on it and the node clears the error on the
 * next SessionAnnounce). `""` when erroring without a detail; null when not erroring
 * / no heartbeat. */
export function trainerErrorDetail(ts: TrainerStatusAnnounce | null): string | null {
  if (!ts) return null;
  return ts.state === "error" ? (ts.detail ?? "") : null;
}

export interface TrainerPillModel {
  tone: "ok" | "warn" | "plain";
  label: string;
}

/** The trainer pill. With a heartbeat: `Trainer <id> · online_dagger | no
 * online_dagger capability · <state>` (+ ` — <detail>` and tone `warn` while
 * erroring). Without one: attached-and-capable / attached-without-capability /
 * none attached; "capability unknown" only for a runtime that predates the field. */
export function trainerPill(
  external: ExternalStatus | null | undefined,
  status: OnlineDaggerStatus | null | undefined,
): TrainerPillModel {
  const ts = trainerStatusOf(external, status);
  if (ts) {
    const cap = trainerCapability(external, status);
    const error = trainerErrorDetail(ts);
    return {
      tone: error !== null ? "warn" : "ok",
      label: `Trainer ${ts.trainer_id} · ${
        cap === false ? `no ${TRAINER_CAPABILITY} capability` : TRAINER_CAPABILITY
      } · ${ts.state ?? "idle"}${error ? ` — ${error}` : ""}`,
    };
  }
  if (!trainerAttached(external)) return { tone: "warn", label: "Trainer · none attached" };
  const cap = trainerCapability(external, status);
  if (cap === true) return { tone: "ok", label: `Trainer · ${TRAINER_CAPABILITY} capability` };
  if (cap === false)
    return { tone: "warn", label: `Trainer · no ${TRAINER_CAPABILITY} capability` };
  return {
    tone: "plain",
    label: "Trainer · capability unknown (this runtime predates telemetry.external.capabilities)",
  };
}

const PILL_CLASS: Record<TrainerPillModel["tone"], string> = {
  ok: "pill pill-ok",
  warn: "pill pill-warn",
  plain: "pill",
};

interface CheckRowProps {
  label: string;
  help?: string;
  checked: boolean;
  onChange(v: boolean): void;
  testId: string;
}

function CheckRow({ label, help, checked, onChange, testId }: CheckRowProps) {
  return (
    <label className="check-row" data-testid={`${testId}-row`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        data-testid={testId}
      />
      <span className="radio-row-text">
        <span className="text-body-strong">{label}</span>
        {help && <span className="text-caption fg-3">{help}</span>}
      </span>
    </label>
  );
}

const plural = (n: number, word: string): string => `${n} ${n === 1 ? word : `${word}s`}`;

export function OnlineDaggerSheet({
  sel,
  cameras,
  profileName,
  hasInitialCondition = false,
  layout = null,
  external,
  onlineDaggerStatus = null,
  onLaunched,
  onClose,
  open = true,
  runtime,
}: OnlineDaggerSheetProps) {
  const formId = useId();
  const reasonId = useId();
  const [view, setView] = useState<OnlineDaggerView>("connect");
  const nameRef = useRef<HTMLInputElement>(null);

  // -- session-less facts (fetched once per open) ------------------------------------
  const [dora, setDora] = useState<DoraInfo | null | "error">(null);
  const [doraError, setDoraError] = useState<string | null>(null);
  const [skill, setSkill] = useState<string | null>(null);
  const [skillError, setSkillError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<OnlineDaggerSessionInfo[]>([]);
  // The listing failed (or 409ed): the resume pill cannot be trusted, so an explicit
  // Resume checkbox stands in (below).
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getDora()
      .then((d) => alive && setDora(d))
      .catch((e: unknown) => {
        if (!alive) return;
        setDora("error");
        setDoraError(e instanceof ApiError ? `${e.status} ${e.detail}` : String(e));
      });
    getOnlineDaggerSkill()
      .then((t) => alive && setSkill(t))
      .catch((e: unknown) => {
        if (!alive) return;
        setSkillError(
          e instanceof ApiError && e.status === 404
            ? "This runtime does not serve the skill yet (GET /api/online_dagger/skill → 404)."
            : e instanceof Error
              ? e.message
              : String(e),
        );
      });
    return () => {
      alive = false;
    };
  }, []);
  // The existing sessions are re-read whenever the form comes into view and after a
  // 409: another client (or an earlier failed bring-up) may have created the name
  // since the sheet opened, and the runtime's "already exists - resume it or pick
  // another name" answer only helps if the resume pill actually appears.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const loadSessions = useCallback(
    () =>
      getOnlineDaggerSessions()
        .then((rows) => {
          if (!mounted.current) return;
          setSessions(rows);
          setSessionsError(null);
        })
        .catch((e: unknown) => {
          if (!mounted.current) return;
          setSessions([]);
          setSessionsError(e instanceof ApiError ? `${e.status} ${e.detail}` : String(e));
        }),
    [],
  );
  useEffect(() => {
    void loadSessions();
  }, [loadSessions, view]);

  // -- the form -----------------------------------------------------------------------
  const [od, setOd] = useState<OnlineDaggerInputs>(DEFAULT_ONLINE_DAGGER);
  const setField = <K extends keyof OnlineDaggerInputs>(key: K, value: OnlineDaggerInputs[K]) =>
    setOd((p) => ({ ...p, [key]: value }));
  const [task, setTask] = useState(sel.task);
  const [taskAuto, setTaskAuto] = useState(true); // prefilled from a resumed session until typed
  // Which existing session the task was prefilled FROM (null: the operator's own /
  // the page's task) — so the prefill follows the picked session and clears again
  // when the name moves to a new one instead of sticking to another session's task.
  const [prefilledFrom, setPrefilledFrom] = useState<string | null>(null);
  // The slug the runtime 409ed "already exists" for: the listing disagreed with the
  // disk, so the explicit Resume checkbox is offered for THAT name.
  const [conflictName, setConflictName] = useState<string | null>(null);
  const [frames, setFrames] = useState<Record<string, FrameRef>>(sel.frames);
  const [returnToStart, setReturnToStart] = useState(true); // D6: default ON
  const [filter, setFilter] = useState<ActionFilterInputs>(DEFAULT_ACTION_FILTER);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slug = slugSession(od.sessionName);
  const existing = useMemo(
    () => (slug ? (sessions.find((s) => s.session_name === slug) ?? null) : null),
    [sessions, slug],
  );
  // Resuming a session: its task carries over until the operator types one; picking
  // another session refills, and leaving for a new name reverts to the page's task.
  useEffect(() => {
    if (!taskAuto) return;
    const source = existing?.session_name ?? null;
    if (source === prefilledFrom) return;
    setTask(existing?.task || sel.task);
    setPrefilledFrom(source);
  }, [existing, taskAuto, prefilledFrom, sel.task]);
  // Resume: the listing's word when it has the name; else the operator's explicit
  // tick, offered only when the listing cannot be trusted for THIS name (the runtime
  // 409ed "already exists" for it, or the listing itself failed) — never for a name
  // the runtime knows is new (`resume: true` on a missing name is its own 409).
  const resumeOffered =
    existing === null && slug !== "" && (conflictName === slug || sessionsError !== null);
  const resume = existing !== null || (resumeOffered && od.resume);
  // Focus the name field when the form comes into view (the Sheet's own initial
  // focus landed on Continue: the field is hidden while view 1 shows).
  useEffect(() => {
    if (view === "configure") nameRef.current?.focus();
  }, [view]);

  const attached = trainerAttached(external);
  const capability = trainerCapability(external, onlineDaggerStatus);
  const trainerError = trainerErrorDetail(trainerStatusOf(external, onlineDaggerStatus));
  const full: LandingSelection = {
    ...sel,
    task,
    frames,
    onlineDagger: { ...od, resume },
    returnToStart,
    hasInitialCondition,
    actionFilter: filter,
    trainerAttached: attached,
    trainerCapability: capability,
  };
  const reason = validateLaunch("dagger", full);
  const planning = sel.startFrom === "profile";

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (reason !== null || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      onLaunched(await createSession(buildSpec("dagger", full)));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail : err instanceof Error ? err.message : String(err),
      );
      // A 409 is the runtime's view of the sessions on disk disagreeing with ours
      // ("already exists", "session.json is unreadable"): re-read them so the resume
      // pill tells the truth before the operator retries — and remember an "already
      // exists" for this name, so the explicit Resume checkbox is offered even when
      // the listing keeps failing (the runtime's own advice must stay reachable).
      if (err instanceof ApiError && err.status === 409) {
        if (/already exists/i.test(err.detail)) setConflictName(slug);
        void loadSessions();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const origin = runtime ?? currentRuntimeOrigin();
  const oneLiner = skillInstallCommand(origin.origin);
  const pill = trainerPill(external, onlineDaggerStatus);
  const doraInfo = dora !== null && dora !== "error" ? dora : null;
  const facts: { key: string; label: string; value: string | null }[] = [
    { key: "bind_host", label: "Bind host", value: doraInfo?.bind_host ?? null },
    {
      key: "daemon_port",
      label: "Daemon port",
      value: doraInfo?.daemon_port != null ? String(doraInfo.daemon_port) : null,
    },
    { key: "zenoh_connect", label: "Zenoh connect", value: doraInfo?.zenoh_connect ?? null },
  ];
  const startLabel = `Start ${MODE_LABELS.dagger}`;
  const startCaption = attached
    ? capability === false
      ? REASON.trainerNoCapability
      : trainerError !== null
        ? trainerErrorWarning(trainerError)
        : `A policy node is attached — ${startLabel} becomes possible once the form is complete.`
    : `No policy node attached yet — you can configure meanwhile; ${startLabel} stays disabled until one attaches.`;

  return (
    <Sheet
      title={MODE_LABELS.dagger}
      subtitle={launchContext(sel, profileName)}
      width={ONLINE_DAGGER_SHEET_WIDTH}
      open={open}
      hostTestId="online-dagger-sheet"
      testId="online-dagger-panel"
      closeButtonTestId="online-dagger-close"
      onRequestClose={onClose}
      className="od-sheet"
      panelProps={{ "data-view": view }}
      headerExtra={
        <SegmentedControl
          options={VIEW_OPTIONS}
          value={view}
          onChange={(v) => setView(v)}
          aria-label="Online DAgger setup steps"
          className="segmented-compact od-steps-control"
          testId="online-dagger-steps"
        />
      }
      footerStart={
        <>
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            data-testid="launch-cancel"
          >
            Cancel
          </button>
          {view === "configure" && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setView("connect")}
              data-testid="od-back"
            >
              Back
            </button>
          )}
        </>
      }
      footer={
        view === "connect" ? (
          <div className="sheet-primary">
            <button
              type="button"
              className="btn-primary"
              onClick={() => setView("configure")}
              data-testid="od-continue"
              data-autofocus
            >
              Continue
              <Icon name="chevron" size={16} />
            </button>
            <span
              className="btn-reason od-start-caption"
              data-testid="od-start-caption"
              data-attached={attached ? "true" : "false"}
            >
              {startCaption}
            </span>
          </div>
        ) : (
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
                  {planning ? "Planning safe path…" : "Starting…"}
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
          </div>
        )
      }
    >
      {/* -- 1 · Connect a trainer ---------------------------------------------------- */}
      <section
        id="od-view-connect"
        role="tabpanel"
        aria-labelledby={VIEW_OPTIONS[0].tabId}
        className="od-view"
        hidden={view !== "connect"}
        data-testid="od-view-connect"
      >
        <ExternalPolicyStatus
          external={external}
          testId="od-status"
          detailTestId="od-external-detail"
        >
          <span
            className={PILL_CLASS[pill.tone]}
            data-testid="od-trainer-pill"
            data-tone={pill.tone}
          >
            {pill.tone === "ok" ? (
              <Icon name="check" size={12} />
            ) : pill.tone === "warn" ? (
              <Icon name="warning" size={12} />
            ) : (
              <Icon name="info" size={12} />
            )}
            {pill.label}
          </span>
        </ExternalPolicyStatus>

        <div className="od-facts" data-testid="od-facts">
          <span className="text-label fg-3">Connection facts</span>
          {doraInfo ? (
            <>
              {facts.map((f) => (
                <div key={f.key} className="od-fact" data-testid={`od-fact-${f.key}`}>
                  <span className="text-caption fg-2 od-fact-label">{f.label}</span>
                  <span className="text-mono od-fact-value">{f.value ?? "—"}</span>
                  {f.value != null && (
                    <CopyButton text={f.value} label={f.label} testId={`copy-${f.key}`} />
                  )}
                </div>
              ))}
              {doraInfo.enabled !== true && (
                <span className="text-caption fg-3" data-testid="od-dora-disabled">
                  Dora bridge disabled (dora.enabled: false) — nothing listens on these until the
                  lab render enables it.
                </span>
              )}
            </>
          ) : dora === "error" ? (
            <span className="text-caption fg-3" data-testid="od-facts-error">
              GET /api/dora failed: {doraError}
            </span>
          ) : (
            <span className="text-caption fg-3" data-testid="od-facts-loading">
              <span className="spinner" aria-hidden="true" /> Reading /api/dora…
            </span>
          )}
        </div>

        <div className="od-install" data-testid="od-install">
          <span className="text-label fg-3">Install the skill in the policy repo</span>
          <div className="od-oneliner-row">
            <pre className="code-block od-oneliner" data-testid="skill-oneliner">
              {oneLiner}
            </pre>
            <CopyButton text={oneLiner} label="Install command" testId="skill-copy" />
          </div>
          {origin.note && (
            <span className="text-caption fg-3" data-testid="od-origin-note">
              {origin.note}
            </span>
          )}
          <details className="disclosure" data-testid="skill-disclosure">
            <summary>
              <Icon name="chevron" size={14} className="disclosure-chevron" />
              What the skill tells your coding harness
            </summary>
            <div className="disclosure-body">
              <pre className="code-block od-skill-preview" data-testid="skill-preview">
                {skill ?? skillError ?? "Loading SKILL.md…"}
              </pre>
            </div>
          </details>
        </div>

        <ol className="od-steps" data-testid="od-how">
          <li>
            Your policy node attaches over dora and reports the <code>{TRAINER_CAPABILITY}</code>{" "}
            capability. The runtime is only the shell — which DAgger variant runs, and how it
            trains, lives in your trainer.
          </li>
          <li>
            Each rollout the novice policy drives; <kbd>Space</kbd> (or Take over in the Cockpit)
            hands control to you and your corrections are saved as expert frames — every step is
            labelled novice or expert.
          </li>
          <li>
            The trainer watches the saved rollouts, decides when to train, swaps its weights and
            reports its state; while it trains, new rollouts wait (see Advanced).
          </li>
        </ol>
      </section>

      {/* -- 2 · Configure ------------------------------------------------------------- */}
      <section
        id="od-view-configure"
        role="tabpanel"
        aria-labelledby={VIEW_OPTIONS[1].tabId}
        className="od-view"
        hidden={view !== "configure"}
        data-testid="od-view-configure"
      >
        <form
          id={formId}
          className="launch-form od-form"
          onSubmit={(e) => void submit(e)}
          noValidate
          aria-busy={submitting || undefined}
        >
          <fieldset className="field radio-rows" data-testid="od-session">
            <legend className="field-label">Session</legend>
            <label className="field">
              <span className="field-label">Name</span>
              <input
                ref={nameRef}
                value={od.sessionName}
                onChange={(e) => setField("sessionName", e.target.value)}
                placeholder="e.g. pick_cube_v1"
                aria-required="true"
                autoComplete="off"
                data-testid="od-session-name"
              />
              <span className="od-path-row">
                <span
                  className="text-caption fg-3 text-mono"
                  data-testid="od-path-preview"
                  data-layout={layout ? "loaded" : "pending"}
                >
                  {onlineDaggerFolderPreview(layout, slug)}
                </span>
                {existing && (
                  <span className="pill pill-accent" data-testid="od-resume">
                    Resume ({plural(existing.rollouts, "rollout")} saved)
                  </span>
                )}
              </span>
            </label>
            <span className="text-caption fg-3">
              The rollouts are saved under it as an episode-directory dataset; the trainer keeps its
              own artefacts wherever it likes.
            </span>
            {resumeOffered && (
              <CheckRow
                label="Resume the existing session of this name"
                help={
                  conflictName === slug
                    ? "the runtime says this name already exists — continue its rollouts and counters instead of picking another name"
                    : "the session list could not be read — tick if this name already exists on disk (the runtime refuses a resume of a missing one)"
                }
                checked={od.resume}
                onChange={(v) => setField("resume", v)}
                testId="od-resume-existing"
              />
            )}
            {sessionsError !== null && (
              <span className="text-caption fg-3" data-testid="od-sessions-error">
                Existing sessions could not be listed (GET /api/online_dagger/sessions:{" "}
                {sessionsError}).
              </span>
            )}
            {sessions.length > 0 && (
              <div className="od-sessions" data-testid="od-sessions">
                <span className="text-caption fg-3">Existing sessions</span>
                <div className="od-session-chips">
                  {sessions.map((s) => (
                    <button
                      key={s.session_name}
                      type="button"
                      className="btn-ghost btn-sm od-session-chip"
                      aria-pressed={existing?.session_name === s.session_name}
                      onClick={() => setField("sessionName", s.session_name)}
                      title={s.task ? `${s.path} · ${s.task}` : s.path}
                      data-testid={`od-session-${s.session_name}`}
                    >
                      <span className="text-mono">{s.session_name}</span>
                      <span className="fg-3 tabular">· {plural(s.rollouts, "rollout")}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </fieldset>

          <label className="field">
            <span className="field-label">Task</span>
            <input
              value={task}
              onChange={(e) => {
                setTask(e.target.value);
                // Cleared by hand: the prefill may fill it again from the picked session.
                setTaskAuto(e.target.value === "");
                if (e.target.value === "") setPrefilledFrom(null);
              }}
              placeholder="what the novice is learning to do"
              aria-required="true"
              autoComplete="off"
              data-testid="od-task"
            />
          </label>

          <fieldset className="field radio-rows" data-testid="od-recording">
            <legend className="field-label">Recording</legend>
            <ActionFilterFieldset filter={filter} onChange={setFilter} />
            <ReturnToStartRow
              checked={returnToStart}
              onChange={setReturnToStart}
              reason={reason}
              help="between rollouts, the arms park while the trainer runs"
            />
          </fieldset>

          <details className="disclosure" data-testid="od-advanced">
            <summary>
              <Icon name="chevron" size={14} className="disclosure-chevron" />
              Advanced
            </summary>
            <div className="disclosure-body">
              <CheckRow
                label="Pause rollouts while the trainer trains"
                help="a new rollout is refused while the trainer reports training; the arms stay parked"
                checked={od.pauseWhileTraining}
                onChange={(v) => setField("pauseWhileTraining", v)}
                testId="od-pause-training"
              />
              <CheckRow
                label="Wait for the trainer to report ready before the first rollout"
                help="a new rollout is refused until the trainer has reported ready for this session"
                checked={od.waitForTrainerReady}
                onChange={(v) => setField("waitForTrainerReady", v)}
                testId="od-wait-ready"
              />
              {sel.arms.map((a) => (
                <label key={a} className="frame-row">
                  <span className="field-label">
                    Recording frame · {armLabel(a)} <span className="chip chip-id">{a}</span>
                  </span>
                  <FrameSelector
                    armId={a}
                    value={frames[a] ?? `arm_base:${a}`}
                    cameras={cameras}
                    onChange={(f) => setFrames((m) => ({ ...m, [a]: f }))}
                  />
                </label>
              ))}
            </div>
          </details>

          {error !== null && (
            <div className="sheet-error" role="alert" data-testid="launch-error">
              <Icon name="error" size={16} />
              <span>{error}</span>
            </div>
          )}
        </form>
      </section>
    </Sheet>
  );
}
