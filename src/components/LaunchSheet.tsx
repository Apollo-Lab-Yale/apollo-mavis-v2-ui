/** LaunchSheet (phase-11 §4): the in-page modal that collects what a mode
 * needs before `POST /api/session` — Task (Data Collection, validated on blur),
 * **Dataset** (Data Collection, 2026-09-07; 04-runtime §10.5): "New dataset"
 * (name slugged live to the core `DATASET_RE`; the preview under it is the REAL
 * folder from `GET /api/datasets/layout` — `~/data/bc_demo/<slug>` — and a
 * namespace-free `…/<slug>` until the layout loaded: the UI never hard-codes the
 * runtime's default namespace, 15-online-dagger §8) or
 * "Continue existing" (radio rows from `GET /api/datasets` filtered to the tab's
 * kind and `layout: episode_dirs`) plus the shared **Return to start after save /
 * discard** row (checked by default — operator decision; Start is disabled with
 * the reason while neither a start profile nor an initial condition exists) and
 * idle-frame filter fieldset (`recordingFields.tsx`), **Policy** (Inference: the
 * promoted checkpoints plus, since 2026-09-11, one **External policy (dora)** row for
 * the policy node attached over the dora bus — `policy_source: "external"`, no
 * `policy`; pre-selected when nothing is promoted, its help text is the attached
 * spec's id / version / rate / driven arms and the shared `ExternalPolicyStatus` card
 * sits under it) and, under "Advanced", the per-arm recording frame. The
 * primary button reads "Start <mode>"; when disabled its reason sits underneath. A
 * rejected POST (409 "a session already exists", "no promoted deploy checkpoint",
 * "tracker calibration in progress", …) shows its detail inside the sheet, which
 * stays open. Escape / × / Cancel / backdrop close it (the owner flips `open` and
 * unmounts after `SHEET_EXIT_MS`). The `dagger` mode is still accepted for the
 * legacy in-process path, but the Welcome page routes Online DAgger to
 * `OnlineDaggerSheet` instead (15-online-dagger D1). */
import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { ApiError, createSession } from "../api/rest";
import type {
  CameraInfo,
  DatasetInfo,
  DatasetLayoutInfo,
  ExternalStatus,
  PolicyInfo,
  SessionInfo,
} from "../gen";
import {
  buildSpec,
  datasetFolderPreview,
  DEFAULT_ACTION_FILTER,
  namespaceRoot,
  slugDataset,
  validateLaunch,
  type ActionFilterInputs,
  type LandingSelection,
} from "../lib/launch";
import { armLabel, MODE_LABELS, SCENE_DISPLAY_NAME, TAB_LABELS } from "../lib/streams";
import type { FrameRef, Mode } from "../lib/types";
import {
  externalPolicyAttached,
  externalPolicySummary,
  ExternalPolicyStatus,
} from "./externalPolicy";
import { Icon } from "./icons";
import { FrameSelector } from "./landing";
import { ActionFilterFieldset, ReturnToStartRow } from "./recordingFields";
import { Sheet } from "./Sheet";

export type SheetMode = Exclude<Mode, "teleop">;

export interface LaunchSheetProps {
  mode: SheetMode;
  /** Page-level selection; task / policy / frames are collected here. */
  sel: LandingSelection;
  policies: PolicyInfo[];
  /** FrameSelector options (the current tab's cameras). */
  cameras: CameraInfo[];
  /** Name of the selected profile (subtitle), when `sel.startFrom === "profile"`. */
  profileName?: string | null;
  /** `GET /api/datasets` (Data Collection: the "Continue existing" rows; filtered
   * here to the tab's kind and the episode-directory layout). */
  datasets?: DatasetInfo[];
  /** A designated initial-condition profile exists for the tab's kind. */
  hasInitialCondition?: boolean;
  /** `GET /api/datasets/layout` (15-online-dagger §7): the real dataset folders for the
   * preview; null while loading / on an older runtime (falls back to `<ns>/<slug>`). */
  layout?: DatasetLayoutInfo | null;
  /** `telemetry.external` (Inference, 2026-09-11): the "External policy (dora)" row's
   * help text + status card, and the attachment `validateLaunch` judges for it. */
  external?: ExternalStatus | null;
  onLaunched(info: SessionInfo): void;
  onClose(): void;
  /** Default true; `false` runs the Sheet exit while the owner keeps it mounted. */
  open?: boolean;
}

/** The "External policy (dora)" row's help text: the attached spec's summary
 * (`act_pick_place v3 · 10 Hz · drives: Manipulation Arm`) or, without one, what
 * the row means. */
export const EXTERNAL_POLICY_HELP_NONE =
  "Policy node attached over the dora bus — none attached yet";
export const externalPolicyHelp = (external: ExternalStatus | null | undefined): string =>
  externalPolicySummary(external) || EXTERNAL_POLICY_HELP_NONE;

/** "Sim · APOLLO MAVIS V2 Digital Twin · Keep current state" */
export function launchContext(sel: LandingSelection, profileName?: string | null): string {
  const start =
    sel.startFrom === "profile"
      ? `Profile: ${profileName ?? sel.profileId ?? "—"}`
      : "Keep current state";
  return `${TAB_LABELS[sel.tab]} · ${SCENE_DISPLAY_NAME} · ${start}`;
}

interface PolicyRowProps {
  label: string;
  help: string;
  checked: boolean;
  promoted?: boolean;
  testId: string;
  onSelect(): void;
}

function PolicyRow({ label, help, checked, promoted, testId, onSelect }: PolicyRowProps) {
  return (
    <label className="radio-row" data-selected={checked ? "true" : "false"}>
      <input
        type="radio"
        name="policy"
        className="visually-hidden"
        checked={checked}
        onChange={onSelect}
        data-testid={testId}
      />
      <span className="option-radio" aria-hidden="true" />
      <span className="radio-row-text">
        <span className="text-body-strong">{label}</span>
        <span className="text-caption fg-3">{help}</span>
      </span>
      {promoted && (
        <span className="pill pill-ok">
          <Icon name="check" size={12} />
          Promoted
        </span>
      )}
    </label>
  );
}

export function LaunchSheet({
  mode,
  sel,
  policies,
  cameras,
  profileName,
  datasets = [],
  hasInitialCondition = false,
  layout = null,
  external = null,
  onLaunched,
  onClose,
  open = true,
}: LaunchSheetProps) {
  const formId = useId();
  const reasonId = useId();
  const promoted = useMemo(() => policies.filter((p) => p.promoted), [policies]);
  const options = mode === "inference" ? promoted : policies;
  const needsTask = mode === "collect" || mode === "dagger";
  const needsPolicy = mode === "dagger" || mode === "inference";

  const [task, setTask] = useState(sel.task);
  const [taskTouched, setTaskTouched] = useState(false);
  // Continue existing: the picked dataset's task (`DatasetInfo.task`, its last
  // session's) is carried into Task until the operator types one — resuming
  // "Drawer Assembling" must not mean retyping it (operator request 2026-09-09).
  // `prefilledFrom` is the repo_id the value came from, so the prefill follows the
  // picked row and clears again on New dataset instead of sticking to another
  // dataset's task. Same rules as the Online DAgger sheet's resume prefill.
  const [taskAuto, setTaskAuto] = useState(true);
  const [prefilledFrom, setPrefilledFrom] = useState<string | null>(null);
  // DAgger defaults to "Latest" (null → no `policy` in the spec); Inference to
  // the most recently promoted checkpoint — or, with none promoted, to the external
  // policy node (2026-09-11; the checkpoint rows re-select "checkpoint").
  const [policyId, setPolicyId] = useState<string | null>(() =>
    mode === "inference" ? (promoted[promoted.length - 1]?.policy_id ?? null) : null,
  );
  const [policySource, setPolicySource] = useState<"checkpoint" | "external">(() =>
    mode === "inference" && promoted.length === 0 ? "external" : "checkpoint",
  );
  const externalSelected = mode === "inference" && policySource === "external";
  const [frames, setFrames] = useState<Record<string, FrameRef>>(sel.frames);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Data Collection: dataset naming + the return-to-start flag (04-runtime §10.5).
  const existing = useMemo(
    () =>
      datasets.filter((d) => d.layout !== "lerobot_v3" && (d.kind == null || d.kind === sel.kind)),
    [datasets, sel.kind],
  );
  const [datasetMode, setDatasetMode] = useState<"new" | "existing">("new");
  const [datasetName, setDatasetName] = useState(sel.datasetName ?? "");
  const [datasetRepoId, setDatasetRepoId] = useState<string | null>(null);
  const [returnToStart, setReturnToStart] = useState(true); // DEFAULT ON (operator 2026-09-07)
  const slug = slugDataset(datasetName);
  const picked = useMemo(
    () =>
      mode === "collect" && datasetMode === "existing"
        ? (existing.find((d) => d.repo_id === datasetRepoId) ?? null)
        : null,
    [mode, datasetMode, existing, datasetRepoId],
  );
  useEffect(() => {
    if (!taskAuto) return;
    const source = picked?.repo_id ?? null;
    if (source === prefilledFrom) return;
    setTask(picked?.task || sel.task);
    setPrefilledFrom(source);
  }, [picked, taskAuto, prefilledFrom, sel.task]);
  // Idle-frame filter (2026-09-07 addendum): checked by default, operator units.
  const [filter, setFilter] = useState<ActionFilterInputs>(DEFAULT_ACTION_FILTER);
  // Where a new dataset lands: the REAL folder of the runtime's default namespace
  // once `GET /api/datasets/layout` answered; never a hard-coded namespace before.
  const newDatasetFolder = layout ? namespaceRoot(layout, layout.default_namespace) : null;

  const full: LandingSelection = {
    ...sel,
    task,
    policyId,
    frames,
    ...(mode === "inference"
      ? { policySource, externalAttached: externalPolicyAttached(external) }
      : {}),
    ...(mode === "collect"
      ? { datasetMode, datasetName, datasetRepoId, returnToStart, hasInitialCondition }
      : {}),
    ...(mode === "collect" || mode === "dagger" ? { actionFilter: filter } : {}),
  };
  const reason = validateLaunch(mode, full);
  const taskMissing = needsTask && task.trim() === "";
  const planning = sel.startFrom === "profile";

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setTaskTouched(true);
    if (reason !== null || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const info = await createSession(buildSpec(mode, full));
      onLaunched(info);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail : err instanceof Error ? err.message : String(err),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet
      title={MODE_LABELS[mode]}
      subtitle={launchContext(sel, profileName)}
      width={480}
      open={open}
      hostTestId="launch-sheet"
      testId="launch-sheet-panel"
      closeButtonTestId="launch-sheet-close"
      onRequestClose={onClose}
      panelProps={{ "data-mode": mode }}
      footerStart={
        <button
          type="button"
          className="btn-secondary"
          onClick={onClose}
          data-testid="launch-cancel"
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
                {planning ? "Planning safe path…" : "Starting…"}
              </>
            ) : (
              `Start ${MODE_LABELS[mode]}`
            )}
          </button>
          {reason !== null && !submitting && (
            <span className="btn-reason" id={reasonId} data-testid="launch-reason">
              {reason}
            </span>
          )}
        </div>
      }
    >
      <form
        id={formId}
        className="launch-form"
        onSubmit={(e) => void submit(e)}
        noValidate
        aria-busy={submitting || undefined}
      >
        {needsTask && (
          <label className="field">
            <span className="field-label">Task</span>
            <input
              value={task}
              onChange={(e) => {
                setTask(e.target.value);
                // Typed by hand: keeps over the picked dataset's task; cleared by
                // hand: the prefill may fill it again from the picked dataset.
                setTaskAuto(e.target.value === "");
                if (e.target.value === "") setPrefilledFrom(null);
              }}
              onBlur={(e) => {
                // Validate when the operator leaves the field — not when focus is
                // dropped because the dialog itself closed (dev StrictMode re-open).
                if (e.currentTarget.closest("dialog")?.open !== false) setTaskTouched(true);
              }}
              placeholder="e.g. stack the red cube"
              aria-invalid={taskTouched && taskMissing ? "true" : undefined}
              aria-required="true"
              data-testid="task-input"
              data-autofocus
              autoComplete="off"
            />
            {taskAuto && prefilledFrom !== null && task.trim() !== "" && (
              <span className="text-caption fg-3" data-testid="task-prefilled">
                Carried over from the last session of {prefilledFrom} — edit to change
              </span>
            )}
            {taskTouched && taskMissing && (
              <span className="field-error" data-testid="task-error">
                Task is required
              </span>
            )}
          </label>
        )}
        {mode === "collect" && (
          <fieldset className="field radio-rows" aria-label="Dataset" data-testid="dataset-select">
            <legend className="field-label">Dataset</legend>
            <div role="radiogroup" aria-label="Dataset mode" className="radio-rows">
              <label className="radio-row" data-selected={datasetMode === "new" ? "true" : "false"}>
                <input
                  type="radio"
                  name="dataset-mode"
                  className="visually-hidden"
                  checked={datasetMode === "new"}
                  onChange={() => setDatasetMode("new")}
                  data-testid="dataset-mode-new"
                />
                <span className="option-radio" aria-hidden="true" />
                <span className="radio-row-text">
                  <span className="text-body-strong">New dataset</span>
                  <span className="text-caption fg-3" data-testid="dataset-new-help">
                    {newDatasetFolder
                      ? `One directory per episode under ${newDatasetFolder}/<name>`
                      : "One directory per episode under the runtime's default dataset folder"}
                  </span>
                </span>
              </label>
              <label
                className="radio-row"
                data-selected={datasetMode === "existing" ? "true" : "false"}
                aria-disabled={existing.length === 0 ? "true" : undefined}
              >
                <input
                  type="radio"
                  name="dataset-mode"
                  className="visually-hidden"
                  checked={datasetMode === "existing"}
                  disabled={existing.length === 0}
                  onChange={() => setDatasetMode("existing")}
                  data-testid="dataset-mode-existing"
                />
                <span className="option-radio" aria-hidden="true" />
                <span className="radio-row-text">
                  <span className="text-body-strong">Continue existing</span>
                  <span className="text-caption fg-3">
                    {existing.length === 0
                      ? "No dataset recorded on this workcell yet"
                      : "Append episodes to a dataset with the same schema"}
                  </span>
                </span>
              </label>
            </div>
            {datasetMode === "new" ? (
              <label className="field">
                <span className="field-label">Name</span>
                <input
                  value={datasetName}
                  onChange={(e) => setDatasetName(e.target.value)}
                  placeholder="e.g. pick red cube"
                  aria-required="true"
                  autoComplete="off"
                  data-testid="dataset-name"
                />
                <span
                  className="text-caption fg-3 text-mono"
                  data-testid="dataset-preview"
                  data-layout={layout ? "loaded" : "pending"}
                >
                  {datasetFolderPreview(layout, slug)}
                </span>
              </label>
            ) : (
              <div
                className="radio-rows"
                role="radiogroup"
                aria-label="Existing dataset"
                data-testid="dataset-pick"
              >
                {existing.map((d) => (
                  <label
                    key={d.repo_id}
                    className="radio-row"
                    data-selected={datasetRepoId === d.repo_id ? "true" : "false"}
                  >
                    <input
                      type="radio"
                      name="dataset-existing"
                      className="visually-hidden"
                      checked={datasetRepoId === d.repo_id}
                      onChange={() => setDatasetRepoId(d.repo_id)}
                      data-testid={`dataset-pick-${d.repo_id}`}
                    />
                    <span className="option-radio" aria-hidden="true" />
                    <span className="radio-row-text">
                      <span className="text-body-strong text-mono">{d.repo_id}</span>
                      <span className="text-caption fg-3">
                        {d.total_episodes} episodes · {d.fps} fps
                        {d.task ? ` · ${d.task}` : ""}
                        {d.in_use ? " · in use" : ""}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            <ReturnToStartRow checked={returnToStart} onChange={setReturnToStart} reason={reason} />
          </fieldset>
        )}
        {needsTask && <ActionFilterFieldset filter={filter} onChange={setFilter} />}
        {needsPolicy && (
          <fieldset
            className="field radio-rows"
            role="radiogroup"
            aria-label="Policy"
            data-testid="policy-select"
          >
            <legend className="field-label">Policy</legend>
            {mode === "dagger" && (
              <PolicyRow
                label="Latest"
                help="Most recent checkpoint (runtime default)"
                checked={policyId === null}
                testId="policy-latest"
                onSelect={() => setPolicyId(null)}
              />
            )}
            {options.map((p) => (
              <PolicyRow
                key={p.policy_id}
                label={p.policy_id}
                help={`v${p.policy_version} · ${p.action_space} · ${p.action_frame}`}
                checked={!externalSelected && policyId === p.policy_id}
                promoted={p.promoted}
                testId={`policy-${p.policy_id}`}
                onSelect={() => {
                  setPolicyId(p.policy_id);
                  setPolicySource("checkpoint");
                }}
              />
            ))}
            {options.length === 0 && !externalSelected && (
              <span className="text-callout fg-3" data-testid="policy-empty">
                {mode === "inference" ? "No promoted checkpoint" : "No checkpoints yet"}
              </span>
            )}
            {mode === "inference" && (
              <>
                <PolicyRow
                  label="External policy (dora)"
                  help={externalPolicyHelp(external)}
                  checked={externalSelected}
                  testId="policy-external"
                  onSelect={() => setPolicySource("external")}
                />
                {externalSelected && <ExternalPolicyStatus external={external} />}
              </>
            )}
          </fieldset>
        )}
        <details className="disclosure" data-testid="advanced">
          <summary>
            <Icon name="chevron" size={14} className="disclosure-chevron" />
            Advanced
          </summary>
          <div className="disclosure-body">
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
            {sel.arms.length === 0 && (
              <span className="text-caption fg-3">No arms in this workcell.</span>
            )}
          </div>
        </details>
        {error !== null && (
          <div className="sheet-error" role="alert" data-testid="launch-error">
            <Icon name="error" size={16} />
            <span>{error}</span>
          </div>
        )}
      </form>
    </Sheet>
  );
}
