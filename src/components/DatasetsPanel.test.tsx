import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeDataset, makeDatasetLayout } from "../../tests/mocks/fixtures";
import {
  DatasetsPanel,
  datasetNamespace,
  datasetsForKind,
  exportState,
  formatDuration,
  groupDatasets,
} from "./DatasetsPanel";

const noop = () => Promise.resolve();

describe("DatasetsPanel helpers", () => {
  it("exportState: the live job wins over the manifest; failed carries the detail", () => {
    const ds = makeDataset({ export: { state: "fresh", path: "exports/lerobot_v3", episodes: 2 } });
    expect(exportState(ds, null)).toEqual({ state: "fresh", detail: "" });
    const running = {
      repo_id: ds.repo_id,
      format: "lerobot_v3",
      phase: "data" as const,
      done: 1,
      total: 3,
      detail: "file-000.parquet",
    };
    expect(exportState(ds, running)).toEqual({ state: "running", detail: "file-000.parquet" });
    expect(exportState(ds, { ...running, repo_id: "apollo/other" }).state).toBe("fresh");
    expect(exportState(ds, { ...running, phase: "failed", detail: "boom" })).toEqual({
      state: "failed",
      detail: "boom",
    });
    expect(exportState(ds, { ...running, phase: "done" }).state).toBe("fresh");
    expect(exportState(makeDataset({ export: null }), null).state).toBe("none");
    expect(
      exportState(makeDataset({ export: { state: "failed", detail: "disk full" } }), null),
    ).toEqual({
      state: "failed",
      detail: "disk full",
    });
  });

  it("formatDuration / datasetsForKind", () => {
    expect(formatDuration(0)).toBe("0 s");
    expect(formatDuration(4.2)).toBe("4.2 s");
    expect(formatDuration(45)).toBe("45 s");
    expect(formatDuration(125)).toBe("2 min 05 s");
    const rows = [
      makeDataset({ repo_id: "a", kind: "sim" }),
      makeDataset({ repo_id: "b", kind: "hardware" }),
      makeDataset({ repo_id: "c", kind: null }),
    ];
    expect(datasetsForKind(rows, "sim").map((d) => d.repo_id)).toEqual(["a", "c"]);
    expect(datasetsForKind(rows, "hardware").map((d) => d.repo_id)).toEqual(["b", "c"]);
  });

  it("renders the empty state, the meta line and the in-use lock", () => {
    const { rerender } = render(
      <DatasetsPanel
        kind="sim"
        datasets={[]}
        exportProgress={null}
        inUseRepoId={null}
        onDeleteEpisode={noop}
        onDeleteDataset={noop}
        onExport={noop}
      />,
    );
    expect(screen.getByTestId("datasets-empty")).toBeInTheDocument();
    rerender(
      <DatasetsPanel
        kind="sim"
        datasets={[makeDataset()]}
        exportProgress={null}
        inUseRepoId="apollo/pick_cube"
        onDeleteEpisode={noop}
        onDeleteDataset={noop}
        onExport={vi.fn(noop)}
      />,
    );
    expect(screen.getByTestId("dataset-meta-apollo/pick_cube").textContent).toContain("2 episodes");
    expect(screen.getByTestId("dataset-meta-apollo/pick_cube").textContent).toContain("250 frames");
    expect(screen.getByTestId("dataset-meta-apollo/pick_cube").textContent).toContain("10 s");
    expect(screen.getByTestId("dataset-inuse-apollo/pick_cube")).toBeInTheDocument();
    expect(screen.getByTestId("dataset-export-apollo/pick_cube")).toBeDisabled();
    expect(screen.getByTestId("dataset-delete-apollo/pick_cube")).toBeDisabled();
  });

  it("groups by namespace (Demonstrations · Online DAgger rollouts · Other) and shows the folder in the row (phase-14)", () => {
    const rows = [
      makeDataset({ repo_id: "apollo/pick_cube" }),
      makeDataset({
        repo_id: "online_dagger/run1",
        namespace: "online_dagger",
        path: "/home/x/data/online_dagger/run1/rollouts",
      }),
      makeDataset({
        repo_id: "bc_demo/demo_a",
        namespace: "bc_demo",
        path: "/home/x/data/bc_demo/demo_a",
      }),
      makeDataset({ repo_id: "bc_demo/demo_b" }), // namespace from the repo id when the field is absent
    ];
    expect(datasetNamespace(rows[3]!)).toBe("bc_demo");
    // Demonstrations = the layout's default namespace (bc_demo in the lab).
    expect(
      groupDatasets(rows, "bc_demo").map((g) => [g.key, g.label, g.rows.map((d) => d.repo_id)]),
    ).toEqual([
      ["demos", "Demonstrations", ["bc_demo/demo_a", "bc_demo/demo_b"]],
      ["online_dagger", "Online DAgger rollouts", ["online_dagger/run1"]],
      ["other", "Other", ["apollo/pick_cube"]],
    ]);
    // Without the layout (still loading / older runtime) the lab default stands in.
    expect(groupDatasets(rows)).toEqual(groupDatasets(rows, "bc_demo"));
    expect(groupDatasets([rows[0]!]).map((g) => g.key)).toEqual(["other"]); // empty groups omitted
    render(
      <DatasetsPanel
        kind="sim"
        datasets={rows}
        exportProgress={null}
        inUseRepoId={null}
        layout={makeDatasetLayout()}
        onDeleteEpisode={noop}
        onDeleteDataset={noop}
        onExport={noop}
      />,
    );
    const groups = Array.from(document.querySelectorAll("[data-testid^='dataset-group-']")).map(
      (el) => (el as HTMLElement).dataset["testid"],
    );
    expect(groups).toEqual([
      "dataset-group-demos",
      "dataset-group-online_dagger",
      "dataset-group-other",
    ]);
    expect(screen.getByTestId("dataset-group-demos").textContent).toContain("Demonstrations");
    expect(screen.getByTestId("dataset-group-demos").textContent).toContain("bc_demo");
    expect(screen.getByTestId("dataset-group-online_dagger").textContent).toContain(
      "Online DAgger rollouts",
    );
    expect(screen.getByTestId("dataset-group-online_dagger").textContent).toContain(
      "online_dagger",
    );
    expect(screen.getByTestId("dataset-path-online_dagger/run1").textContent).toBe(
      "/home/x/data/online_dagger/run1/rollouts",
    );
    // No `path` from an older runtime → the root.
    expect(screen.getByTestId("dataset-path-apollo/pick_cube").textContent).toBe(
      "/home/x/apollo/var/datasets/apollo/pick_cube",
    );
  });

  it("a remapped datasets.default_namespace moves Demonstrations with it (the layout, not a hard-coded bc_demo)", () => {
    const rows = [
      makeDataset({ repo_id: "demos/pick", namespace: "demos", path: "/srv/demos/pick" }),
      makeDataset({ repo_id: "bc_demo/old_demo", namespace: "bc_demo" }),
      makeDataset({ repo_id: "online_dagger/run1", namespace: "online_dagger" }),
    ];
    expect(
      groupDatasets(rows, "demos").map((g) => [g.key, g.namespace, g.rows.map((d) => d.repo_id)]),
    ).toEqual([
      ["demos", "demos", ["demos/pick"]],
      ["online_dagger", "online_dagger", ["online_dagger/run1"]],
      ["other", null, ["bc_demo/old_demo"]],
    ]);
    render(
      <DatasetsPanel
        kind="sim"
        datasets={rows}
        exportProgress={null}
        inUseRepoId={null}
        layout={makeDatasetLayout({
          default_namespace: "demos",
          namespaces: { demos: { root: "/srv/demos", subdir: null } },
        })}
        onDeleteEpisode={noop}
        onDeleteDataset={noop}
        onExport={noop}
      />,
    );
    const demos = screen.getByTestId("dataset-group-demos");
    expect(demos.textContent).toContain("Demonstrations");
    expect(demos.textContent).toContain("demos");
    expect(demos.querySelector("[data-testid='dataset-row-demos/pick']")).not.toBeNull();
    expect(
      screen
        .getByTestId("dataset-group-other")
        .querySelector("[data-testid='dataset-row-bc_demo/old_demo']"),
    ).not.toBeNull();
  });

  it("a default namespace remapped onto online_dagger claims each row ONCE (Demonstrations wins; no duplicate rows / keys)", () => {
    const rows = [
      makeDataset({ repo_id: "online_dagger/run1", namespace: "online_dagger" }),
      makeDataset({ repo_id: "apollo/pick_cube" }),
    ];
    expect(
      groupDatasets(rows, "online_dagger").map((g) => [g.key, g.rows.map((d) => d.repo_id)]),
    ).toEqual([
      ["demos", ["online_dagger/run1"]],
      ["other", ["apollo/pick_cube"]],
    ]);
    render(
      <DatasetsPanel
        kind="sim"
        datasets={rows}
        exportProgress={null}
        inUseRepoId={null}
        layout={makeDatasetLayout({ default_namespace: "online_dagger" })}
        onDeleteEpisode={noop}
        onDeleteDataset={noop}
        onExport={noop}
      />,
    );
    expect(screen.getAllByTestId("dataset-row-online_dagger/run1")).toHaveLength(1);
    expect(screen.queryByTestId("dataset-group-online_dagger")).toBeNull();
    expect(
      screen
        .getByTestId("dataset-group-demos")
        .querySelector("[data-testid='dataset-row-online_dagger/run1']"),
    ).not.toBeNull();
  });
});
