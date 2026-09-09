/** DatasetsPanel — the recorded datasets under the mode cards (05-ui §8.1 item 7;
 * 04-runtime §10.6; 10-frames §11). One row per `DatasetInfo` filtered to the tab's
 * kind (a dataset without a session sidecar shows on both tabs), grouped by
 * namespace (15-online-dagger §8: **Demonstrations** = the runtime's default
 * namespace from `GET /api/datasets/layout` (`bc_demo` in the lab; the config block
 * is the operator's) · **Online DAgger rollouts** `online_dagger` · **Other**, empty
 * groups omitted) with the folder
 * (`DatasetInfo.path`, else `root`) in the row's help text: repo id, episodes,
 * frames, duration, fps, cameras, `modified_at`, an export pill (`none | stale |
 * fresh | running | failed` from `DatasetInfo.export` + `telemetry.datasets.export`),
 * an `in use` lock while a session records into it and a `legacy` pill for
 * `layout: lerobot_v3` rows (every action disabled). A row expands to its episodes
 * (`GET /api/datasets/{ns}/{name}/episodes`) each with Delete (ConfirmDialog — one
 * directory, no undo; the open episode is disabled with "recording"). Row actions:
 * Export LeRobot v3 (202 + telemetry progress) and Delete dataset (double confirm:
 * the operator types the name). The parent owns the fetches; this component asks it
 * to act and re-fetches an expanded row's episodes when its dataset row changes. */
import { useEffect, useState } from "react";
import { getDatasetEpisodes } from "../api/rest";
import type { DatasetExportTelemetry, DatasetInfo, DatasetLayoutInfo, EpisodeInfo } from "../gen";
import { ONLINE_DAGGER_NAMESPACE } from "../lib/launch";
import { useDelayedUnmount } from "../lib/useDelayedUnmount";
import { ConfirmDialog } from "./ConfirmDialog";
import { Icon } from "./icons";
import { Sheet, SHEET_EXIT_MS } from "./Sheet";

export interface DatasetsPanelProps {
  kind: "hardware" | "sim"; // filter
  datasets: DatasetInfo[]; // GET /api/datasets
  exportProgress: DatasetExportTelemetry | null; // telemetry.datasets.export
  inUseRepoId: string | null; // the running session's dataset
  /** `GET /api/datasets/layout`: its `default_namespace` IS the Demonstrations
   * group (15-online-dagger §8). Null while loading / on an older runtime → the
   * lab default `bc_demo` stands in. */
  layout?: DatasetLayoutInfo | null;
  onDeleteEpisode(repoId: string, episodeId: string): Promise<void>;
  onDeleteDataset(repoId: string): Promise<void>;
  onExport(repoId: string): Promise<void>;
}

export type ExportState = "none" | "stale" | "fresh" | "running" | "failed";

/** The export pill: the live job wins over the manifest's last result. */
export function exportState(
  ds: DatasetInfo,
  progress: DatasetExportTelemetry | null,
): { state: ExportState; detail: string } {
  if (progress && progress.repo_id === ds.repo_id) {
    if (progress.phase !== "done" && progress.phase !== "failed")
      return { state: "running", detail: progress.detail ?? "" };
    if (progress.phase === "failed") return { state: "failed", detail: progress.detail ?? "" };
  }
  const ex = ds.export;
  if (!ex) return { state: "none", detail: "" };
  return { state: ex.state, detail: ex.detail ?? "" };
}

const EXPORT_PILL: Record<ExportState, string> = {
  none: "pill",
  stale: "pill pill-warn",
  fresh: "pill pill-ok",
  running: "pill pill-accent",
  failed: "pill pill-danger",
};

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0 s";
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds - m * 60);
  return `${m} min ${s.toString().padStart(2, "0")} s`;
}

/** Datasets shown on a tab: matching kind, or unknown kind (no session sidecar). */
export function datasetsForKind(datasets: DatasetInfo[], kind: "hardware" | "sim"): DatasetInfo[] {
  return datasets.filter((d) => d.kind == null || d.kind === kind);
}

/** The namespace of a row: the runtime's `namespace` field, else the repo id's prefix. */
export const datasetNamespace = (d: DatasetInfo): string =>
  d.namespace ?? d.repo_id.split("/")[0] ?? "";

export type DatasetGroupKey = "demos" | "online_dagger" | "other";
export interface DatasetGroup {
  key: DatasetGroupKey;
  label: string;
  /** Namespace shown beside the label (the default namespace, `online_dagger`;
   * none for Other). */
  namespace: string | null;
  rows: DatasetInfo[];
}
/** The Demonstrations namespace when the layout has not answered (the lab's
 * `datasets.default_namespace`; the runtime's real value replaces it). */
export const FALLBACK_DEMOS_NAMESPACE = "bc_demo";
/** Group order and labels (15-online-dagger §8): Demonstrations = the runtime's
 * `default_namespace` (where a bare `dataset: "<name>"` lands — the operator may
 * remap it); `online_dagger` holds the rollouts of Online DAgger sessions;
 * everything else (the generic `var/datasets/<ns>/…` data) is Other. */
export function datasetGroups(
  defaultNamespace: string | null | undefined,
): readonly { key: DatasetGroupKey; label: string; namespace: string | null }[] {
  return [
    {
      key: "demos",
      label: "Demonstrations",
      namespace: defaultNamespace || FALLBACK_DEMOS_NAMESPACE,
    },
    { key: "online_dagger", label: "Online DAgger rollouts", namespace: ONLINE_DAGGER_NAMESPACE },
    { key: "other", label: "Other", namespace: null },
  ];
}
/** Rows → the non-empty groups, in `datasetGroups` order (row order preserved).
 * Every row lands in EXACTLY one group — the first whose namespace matches, Other
 * taking whatever is left — so a `datasets.default_namespace` remapped onto
 * `online_dagger` shows the rollouts once, under Demonstrations (never twice, which
 * would duplicate row test ids and React keys). */
export function groupDatasets(
  rows: readonly DatasetInfo[],
  defaultNamespace: string | null | undefined = null,
): DatasetGroup[] {
  const claimed = new Set<DatasetInfo>();
  return datasetGroups(defaultNamespace)
    .map((g) => {
      const mine = rows.filter(
        (d) => !claimed.has(d) && (g.namespace === null || datasetNamespace(d) === g.namespace),
      );
      for (const d of mine) claimed.add(d);
      return { ...g, rows: mine };
    })
    .filter((g) => g.rows.length > 0);
}

function shortTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface RowProps {
  ds: DatasetInfo;
  progress: DatasetExportTelemetry | null;
  inUse: boolean;
  busy: string | null;
  onDeleteEpisode(repoId: string, episodeId: string): Promise<void>;
  onDeleteDataset(repoId: string): Promise<void>;
  onExport(repoId: string): Promise<void>;
}

function DatasetRow({
  ds,
  progress,
  inUse,
  busy,
  onDeleteEpisode,
  onDeleteDataset,
  onExport,
}: RowProps) {
  const [open, setOpen] = useState(false);
  const [episodes, setEpisodes] = useState<EpisodeInfo[] | null>(null);
  const [episodesError, setEpisodesError] = useState<string | null>(null);
  const [confirmEpisode, setConfirmEpisode] = useState<EpisodeInfo | null>(null);
  const confirmEpisodeShown = useDelayedUnmount(confirmEpisode !== null, SHEET_EXIT_MS);
  const [confirmDataset, setConfirmDataset] = useState(false);
  const confirmDatasetShown = useDelayedUnmount(confirmDataset, SHEET_EXIT_MS);
  const [typed, setTyped] = useState("");
  const legacy = ds.layout === "lerobot_v3";
  const { state: exState, detail: exDetail } = exportState(ds, progress);
  const running = exState === "running";
  const id = ds.repo_id;
  const stamp = `${ds.total_episodes}:${ds.total_frames}:${ds.modified_at}`;

  // Re-read the episode list whenever the dataset row itself changed (a save, a
  // delete, a resumed session) while it is expanded.
  useEffect(() => {
    if (!open || legacy) return;
    let alive = true;
    getDatasetEpisodes(id)
      .then((rows) => {
        if (alive) {
          setEpisodes(rows);
          setEpisodesError(null);
        }
      })
      .catch((e) => {
        if (alive) setEpisodesError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [open, legacy, id, stamp]);

  const totalSeconds = ds.fps > 0 ? ds.total_frames / ds.fps : 0;
  const nameOnly = id.split("/").pop() ?? id;
  return (
    <li className="dataset-row" data-testid={`dataset-row-${id}`} data-layout={ds.layout}>
      <div className="dataset-head">
        <button
          type="button"
          className="btn-ghost btn-sm btn-icon dataset-expand"
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} ${id}`}
          disabled={legacy}
          onClick={() => setOpen((v) => !v)}
          data-testid={`dataset-expand-${id}`}
        >
          <Icon name="chevron" size={14} className={open ? "is-open" : undefined} />
        </button>
        <span className="dataset-name text-mono" title={ds.path ?? ds.root}>
          {id}
        </span>
        <span className="dataset-meta text-caption fg-3" data-testid={`dataset-meta-${id}`}>
          {ds.total_episodes} {ds.total_episodes === 1 ? "episode" : "episodes"} · {ds.total_frames}{" "}
          frames · {formatDuration(totalSeconds)} · {ds.fps} fps
          {ds.cameras && ds.cameras.length > 0 ? ` · ${ds.cameras.join(", ")}` : ""} ·{" "}
          {shortTime(ds.modified_at)}
        </span>
        <span
          className="dataset-path text-caption text-mono fg-3"
          data-testid={`dataset-path-${id}`}
        >
          {ds.path ?? ds.root}
        </span>
        <span className="dataset-pills">
          {legacy && (
            <span
              className="pill"
              data-testid={`dataset-legacy-${id}`}
              title="phase-07 LeRobot v3 tree (read-only)"
            >
              legacy
            </span>
          )}
          {inUse && (
            <span className="pill pill-accent" data-testid={`dataset-inuse-${id}`}>
              <Icon name="lock" size={12} />
              in use
            </span>
          )}
          <span
            className={EXPORT_PILL[exState]}
            data-testid={`dataset-export-state-${id}`}
            data-state={exState}
            title={exDetail || undefined}
          >
            export {exState}
          </span>
        </span>
        <span className="dataset-actions">
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={legacy || inUse || running || busy !== null}
            onClick={() => void onExport(id)}
            data-testid={`dataset-export-${id}`}
            title={
              inUse ? "End the session first" : legacy ? "Already a LeRobot v3 dataset" : undefined
            }
          >
            {running ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Exporting…
              </>
            ) : (
              "Export LeRobot v3"
            )}
          </button>
          <button
            type="button"
            className="btn-destructive btn-sm"
            disabled={legacy || inUse || running || busy !== null}
            onClick={() => {
              setTyped("");
              setConfirmDataset(true);
            }}
            data-testid={`dataset-delete-${id}`}
            data-busy={busy ?? undefined}
            data-running={running ? "true" : undefined}
            data-inuse={inUse ? "true" : undefined}
          >
            Delete dataset
          </button>
        </span>
      </div>
      {running && progress && (
        <div className="dataset-progress" data-testid={`dataset-export-progress-${id}`}>
          <div
            className="home-rail-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total ?? 0}
            aria-valuenow={progress.done ?? 0}
          >
            <div
              className="home-rail-progress-fill"
              style={{
                width: `${progress.total ? Math.round(((progress.done ?? 0) / progress.total) * 100) : 0}%`,
              }}
            />
          </div>
          <span className="text-caption fg-3">
            {progress.phase} · {progress.done ?? 0}/{progress.total ?? 0}
            {progress.detail ? ` · ${progress.detail}` : ""}
          </span>
        </div>
      )}
      {exState === "failed" && exDetail && (
        <div
          className="text-caption fg-3 dataset-export-error"
          data-testid={`dataset-export-error-${id}`}
        >
          <Icon name="warning" size={12} /> last export failed: {exDetail}
        </div>
      )}
      {open && !legacy && (
        <ul className="episode-list" data-testid={`episode-list-${id}`}>
          {episodesError && (
            <li className="text-caption fg-3" data-testid={`episode-list-error-${id}`}>
              {episodesError}
            </li>
          )}
          {episodes !== null && episodes.length === 0 && (
            <li className="text-caption fg-3" data-testid={`episode-list-empty-${id}`}>
              No episodes yet
            </li>
          )}
          {episodes?.map((ep) => (
            <li
              key={ep.episode_id}
              className="episode-row"
              data-testid={`episode-row-${ep.episode_id}`}
              data-open={ep.open ? "true" : undefined}
            >
              <span className="episode-index text-mono fg-3">#{ep.index}</span>
              <span className="episode-id text-mono" title={ep.episode_id}>
                {ep.episode_id}
              </span>
              <span className="text-caption fg-3">
                {shortTime(ep.recorded_at)} · {ep.frames} frames · {formatDuration(ep.duration_s)}
                {ep.task ? ` · ${ep.task}` : ""}
              </span>
              <span className="dataset-pills">
                {ep.audio && (
                  <span
                    className="pill"
                    title="audio.wav recorded"
                    data-testid={`episode-audio-${ep.episode_id}`}
                  >
                    <Icon name="mic" size={12} />
                  </span>
                )}
                {ep.open && (
                  <span className="pill pill-accent" data-testid={`episode-open-${ep.episode_id}`}>
                    recording
                  </span>
                )}
                {ep.export_ok === false && (
                  <span
                    className="pill pill-warn"
                    title={ep.export_note ?? "excluded from exports"}
                    data-testid={`episode-warn-${ep.episode_id}`}
                  >
                    <Icon name="warning" size={12} />
                    not exportable
                  </span>
                )}
              </span>
              <button
                type="button"
                className="btn-ghost btn-sm"
                disabled={!!ep.open || busy !== null}
                title={ep.open ? "recording" : undefined}
                onClick={() => setConfirmEpisode(ep)}
                data-testid={`episode-delete-${ep.episode_id}`}
              >
                <Icon name="trash" size={14} />
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      {confirmEpisodeShown && confirmEpisode !== null && (
        <ConfirmDialog
          open={confirmEpisode !== null}
          title="Delete episode"
          text={`Delete episode #${confirmEpisode.index} (${confirmEpisode.episode_id}) of ${id}? This removes the episode directory — no undo.`}
          confirmLabel={busy === confirmEpisode.episode_id ? "Deleting…" : "Delete"}
          onConfirm={() => {
            const ep = confirmEpisode;
            void onDeleteEpisode(id, ep.episode_id).finally(() => setConfirmEpisode(null));
          }}
          onCancel={() => setConfirmEpisode(null)}
        />
      )}
      {confirmDatasetShown && (
        <Sheet
          title="Delete dataset"
          open={confirmDataset}
          width={420}
          hostTestId="dataset-delete-dialog"
          testId="dataset-delete-panel"
          onRequestClose={() => setConfirmDataset(false)}
          footerStart={
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setConfirmDataset(false)}
              data-testid="dataset-delete-cancel"
              data-autofocus
            >
              Cancel
            </button>
          }
          footer={
            <button
              type="button"
              className="btn-destructive"
              disabled={typed.trim() !== nameOnly || busy !== null}
              onClick={() => {
                void onDeleteDataset(id).finally(() => setConfirmDataset(false));
              }}
              data-testid="dataset-delete-confirm"
            >
              {busy === id ? "Deleting…" : "Delete everything"}
            </button>
          }
        >
          <p className="text-body" style={{ margin: 0 }}>
            This removes <span className="text-mono">{id}</span> — every episode directory, its
            sidecars and its export. There is no trash and no undo. Type the dataset name{" "}
            <span className="text-mono">{nameOnly}</span> to confirm.
          </p>
          <label className="field" style={{ marginTop: 12 }}>
            <span className="field-label">Dataset name</span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={nameOnly}
              autoComplete="off"
              data-testid="dataset-delete-name"
            />
          </label>
        </Sheet>
      )}
    </li>
  );
}

export function DatasetsPanel({
  kind,
  datasets,
  exportProgress,
  inUseRepoId,
  layout = null,
  onDeleteEpisode,
  onDeleteDataset,
  onExport,
}: DatasetsPanelProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const rows = datasetsForKind(datasets, kind);
  const wrap = <T,>(key: string, p: Promise<T>): Promise<T> => {
    setBusy(key);
    return p.finally(() => setBusy(null));
  };
  return (
    <div className="datasets-panel" data-testid="datasets-panel" data-kind={kind}>
      {rows.length === 0 ? (
        <div className="text-callout fg-3" data-testid="datasets-empty">
          No datasets yet — start Data Collection to record one.
        </div>
      ) : (
        groupDatasets(rows, layout?.default_namespace).map((g) => (
          <section
            key={g.key}
            className="dataset-group"
            aria-labelledby={`dataset-group-${g.key}-title`}
            data-testid={`dataset-group-${g.key}`}
          >
            <h3 id={`dataset-group-${g.key}-title`} className="text-label fg-3 dataset-group-title">
              {g.label}
              {g.namespace && <span className="chip chip-id">{g.namespace}</span>}
            </h3>
            <ul className="dataset-list">
              {g.rows.map((ds) => (
                <DatasetRow
                  key={ds.repo_id}
                  ds={ds}
                  progress={exportProgress}
                  inUse={ds.in_use === true || inUseRepoId === ds.repo_id}
                  busy={busy}
                  onDeleteEpisode={(r, e) => wrap(e, onDeleteEpisode(r, e))}
                  onDeleteDataset={(r) => wrap(r, onDeleteDataset(r))}
                  onExport={(r) => wrap(`export:${r}`, onExport(r))}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
