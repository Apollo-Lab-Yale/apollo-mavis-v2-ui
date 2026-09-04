/** Tracker calibration wizard (phase-10): every step is derived from the
 * telemetry `calibration` block written straight into the store; commands are
 * asserted on a fetch stub (`POST /api/tracker/calibration`); a runtime 409
 * `detail` becomes an error toast. */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PoseMsg, TrackerCalibrationStatus, TrackerTelemetry } from "../gen";
import { useStore } from "../store";
import { makeCalibration, makeTelemetry, makeTracker } from "../../tests/mocks/fixtures";
import {
  activePhaseLabel,
  isCalibrationActive,
  minScenesFrom,
  TrackerCalibrationWizard,
  viewFor,
} from "./TrackerCalibrationWizard";

const pose = (x: number, y: number, z: number): PoseMsg => ({
  position: [x, y, z],
  orientation: [1, 0, 0, 0],
});

describe("TrackerCalibrationWizard", () => {
  let posts: unknown[];
  let reject: string | null; // 409 detail for subsequent POSTs

  beforeEach(() => {
    posts = [];
    reject = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/tracker/calibration") && init?.method === "POST") {
          const body = JSON.parse(String(init.body)) as { kind: "base_station" | "yaw" };
          posts.push(body);
          if (reject) return new Response(JSON.stringify({ detail: reject }), { status: 409 });
          return new Response(
            JSON.stringify(makeCalibration({ kind: body.kind, phase: "starting" })),
            { status: 200 },
          );
        }
        return new Response("{}", { status: 200 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useStore.getState().resetForEpochChange();
    useStore.setState({ toasts: [] });
  });

  /** Write a tracker block with the given calibration snapshot into the store. */
  const setCal = (
    over: Partial<TrackerCalibrationStatus>,
    trackerOver: Partial<TrackerTelemetry> = {},
  ) =>
    act(() =>
      useStore.getState().setTelemetry(
        makeTelemetry({
          tracker: makeTracker({ ...trackerOver, calibration: makeCalibration(over) }),
        }),
      ),
    );

  /** Click a wizard button, assert the POST body, wait for the in-flight
   * request to settle (buttons are disabled while busy). */
  const click = async (testId: string, body: unknown) => {
    const before = posts.length;
    fireEvent.click(screen.getByTestId(testId));
    await waitFor(() => expect(posts.length).toBe(before + 1));
    expect(posts[before]).toEqual(body);
    await waitFor(() => expect(screen.getByTestId(testId)).not.toBeDisabled());
  };

  it("base_station: intro → capture → validate → done from telemetry; buttons POST the ops", async () => {
    setCal({});
    const onClose = vi.fn();
    const onSwitchKind = vi.fn();
    render(
      <TrackerCalibrationWizard
        kind="base_station"
        onClose={onClose}
        onSwitchKind={onSwitchKind}
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const labelledBy = dialog.getAttribute("aria-labelledby") ?? "";
    expect(document.getElementById(labelledBy)?.textContent).toBe("Base-station calibration");
    expect(dialog.dataset["view"]).toBe("intro");
    expect(screen.getByTestId("wizard-step-0").className).toContain("is-active");
    expect(screen.getByTestId("wizard-step-1").className).not.toContain("is-active");
    expect(screen.getByTestId("wizard-req-tracking").textContent).toBe("fake · tracking");
    expect(document.activeElement).toBe(screen.getByTestId("wizard-start"));
    await click("wizard-start", { kind: "base_station", op: "start" });

    // Capturing: scenes 3/6 (min parsed from detail), stations table, still chip.
    setCal({
      kind: "base_station",
      phase: "capturing",
      scenes: 3,
      stations_visible: 3,
      controller_still: true,
      detail: "scenes 3/6 — park the controller still ≥ 3 s at another spot",
      lighthouses: [
        { index: 0, channel: 1, serial: "LHB-AAA", scenes: 3, reference: true },
        { index: 1, channel: 3, serial: "LHB-BBB", scenes: 2 },
        { index: 2, channel: 7, serial: null, scenes: 1 },
      ],
    });
    expect(dialog.dataset["view"]).toBe("capture");
    expect(screen.getByTestId("wizard-step-1").className).toContain("is-active");
    expect(screen.getByTestId("wizard-scenes").textContent).toBe("scenes 3 / 6");
    expect(screen.getByTestId("wizard-scenes-fill").style.width).toBe("50%");
    expect(screen.getByTestId("wizard-still").textContent).toBe("controller still");
    expect(screen.getByTestId("wizard-stations-visible").textContent).toBe("3 stations visible");
    expect(screen.getByTestId("wizard-station-0").textContent).toContain("reference");
    expect(screen.getByTestId("wizard-station-0").textContent).toContain("LHB-AAA");
    expect(screen.getByTestId("wizard-station-1").textContent).not.toContain("reference");
    expect(screen.getByTestId("wizard-station-2").textContent).toContain("—"); // serial unknown
    expect(screen.getByTestId("wizard-detail").textContent).toContain("scenes 3/6");
    expect(screen.getByTestId("wizard-validate")).toBeDisabled();

    // A runtime configured for 8 scenes: the threshold follows its detail line.
    setCal({
      kind: "base_station",
      phase: "capturing",
      scenes: 8,
      controller_still: false,
      detail: "scenes 8/8 — ready to validate",
    });
    expect(screen.getByTestId("wizard-scenes").textContent).toBe("scenes 8 / 8");
    expect(screen.getByTestId("wizard-still").textContent).toBe("controller moving");
    expect(screen.getByTestId("wizard-stations").textContent).toContain("no base stations");
    expect(screen.getByTestId("wizard-validate")).not.toBeDisabled();
    await click("wizard-validate", { kind: "base_station", op: "validate" });

    // Validating: progress, no result yet, Install disabled.
    setCal({ kind: "base_station", phase: "validating", detail: "hold still" });
    expect(dialog.dataset["view"]).toBe("validate");
    expect(screen.getByTestId("wizard-step-2").className).toContain("is-active");
    expect(screen.getByTestId("wizard-validating")).toBeInTheDocument();
    expect(screen.queryByTestId("wizard-validation")).toBeNull();
    expect(screen.getByTestId("wizard-install")).toBeDisabled();

    // Failed validation (2026-09-03 single-spot numbers): FAIL, Install blocked, Capture more.
    setCal({
      kind: "base_station",
      phase: "done",
      detail: "validation failed — capture more spots",
      validation: {
        samples: 900,
        std_mm: [61.2, 62.0, 53.4],
        max_step_mm: 248.1,
        threshold_std_mm: 5,
        threshold_step_mm: 20,
        passed: false,
      },
    });
    expect(dialog.dataset["view"]).toBe("validate");
    expect(screen.getByTestId("wizard-validation-result").textContent).toBe("FAIL");
    expect(screen.getByTestId("wizard-validation-result").className).toContain("chip-red");
    const std = screen.getByTestId("wizard-validation-std").textContent ?? "";
    expect(std).toContain("61.2 / 62.0 / 53.4 mm");
    expect(std).toContain("< 5 mm");
    const step = screen.getByTestId("wizard-validation-step").textContent ?? "";
    expect(step).toContain("248.1 mm");
    expect(step).toContain("< 20 mm");
    expect(screen.getByTestId("wizard-install")).toBeDisabled();
    await click("wizard-capture-more", { kind: "base_station", op: "capture" });

    // Passed → Install.
    setCal({
      kind: "base_station",
      phase: "done",
      detail: "validation passed — install",
      validation: {
        samples: 1200,
        std_mm: [0.1, 0.1, 0.08],
        max_step_mm: 0.1,
        threshold_std_mm: 5,
        threshold_step_mm: 20,
        passed: true,
      },
    });
    expect(screen.getByTestId("wizard-validation-result").textContent).toBe("PASS");
    expect(screen.getByTestId("wizard-install")).not.toBeDisabled();
    await click("wizard-install", { kind: "base_station", op: "install" });

    setCal({ kind: "base_station", phase: "installing", detail: "installing" });
    expect(screen.getByTestId("wizard-installing")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-install")).toBeDisabled();
    expect(screen.getByTestId("wizard-capture-more")).toBeDisabled();

    // done + installed_path → Done step: paths, amber "yaw required", kind switch.
    setCal({
      kind: "base_station",
      phase: "done",
      detail: "installed — run Yaw alignment",
      installed_path: "/home/op/.config/libsurvive/config.json",
      backup_path: "/home/op/.config/libsurvive/config.json.bak-20260903-101500",
      yaw_valid: false,
    });
    expect(dialog.dataset["view"]).toBe("done");
    expect(screen.getByTestId("wizard-step-3").className).toContain("is-active");
    expect(screen.getByTestId("wizard-yaw-required")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-installed-path").textContent).toBe(
      "/home/op/.config/libsurvive/config.json",
    );
    expect(screen.getByTestId("wizard-backup-path").textContent).toContain(".bak-20260903-101500");
    fireEvent.click(screen.getByTestId("wizard-start-yaw"));
    expect(onSwitchKind).toHaveBeenCalledWith("yaw");
    fireEvent.click(screen.getByTestId("wizard-close-btn"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("yaw: points → fit → done; Capture posts without a point; failed checks block Apply", async () => {
    setCal({});
    render(<TrackerCalibrationWizard kind="yaw" onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.dataset["view"]).toBe("intro");
    expect(screen.getByTestId("wizard-yaw-legend").textContent).toContain("left = +X");
    expect(screen.getByTestId("wizard-yaw-legend").textContent).toContain("forward = −Y");
    await click("wizard-start", { kind: "yaw", op: "start" });

    setCal({
      kind: "yaw",
      phase: "capturing",
      next_point: "left",
      yaw_points: [{ label: "start", pose: pose(0.1, 0.2, 1.1) }],
    });
    expect(dialog.dataset["view"]).toBe("points");
    expect(screen.getByTestId("wizard-step-1").textContent).toContain("Points");
    expect(screen.getByTestId("wizard-next-point").textContent).toBe("LEFT");
    expect(screen.getByTestId("wizard-instruction").textContent).toContain(
      "Move LEFT 20–30 cm (+X",
    );
    expect(screen.getByTestId("wizard-instruction").textContent).toContain(
      "pull the trigger or click Capture",
    );
    expect(screen.getByTestId("wizard-points-count").textContent).toBe("1 / 7");
    expect(screen.getByTestId("wizard-point-start").textContent).toBe(
      "start: [0.100, 0.200, 1.100]",
    );
    await click("wizard-capture", { kind: "yaw", op: "capture" });
    await click("wizard-restart", { kind: "yaw", op: "start" });

    setCal({ kind: "yaw", phase: "fitting", next_point: null });
    expect(dialog.dataset["view"]).toBe("fit");
    expect(screen.getByTestId("wizard-fitting")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-apply")).toBeDisabled();

    setCal({
      kind: "yaw",
      phase: "done",
      fitted_yaw_deg: 102.13,
      fit_residual_deg: 3.21,
      fit_checks: ["leg left too short (0.05 m < 0.10 m)", "up leg does not point up"],
    });
    expect(screen.getByTestId("wizard-fitted-yaw").textContent).toBe("yaw 102.1°");
    expect(screen.getByTestId("wizard-fit-residual").textContent).toBe("residual 3.21°");
    expect(screen.getByTestId("wizard-fit-checks").textContent).toContain("leg left too short");
    expect(screen.getByTestId("wizard-fit-checks").textContent).toContain(
      "up leg does not point up",
    );
    expect(screen.queryByTestId("wizard-fit-ok")).toBeNull();
    expect(screen.getByTestId("wizard-apply")).toBeDisabled();
    await click("wizard-redo", { kind: "yaw", op: "start" });
    await click("wizard-cancel", { kind: "yaw", op: "abort" });

    setCal({ kind: "yaw", phase: "done", fitted_yaw_deg: 102.13, fit_residual_deg: 0.8 });
    expect(screen.getByTestId("wizard-fit-ok")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-apply")).not.toBeDisabled();
    await click("wizard-apply", { kind: "yaw", op: "apply" });

    setCal({
      kind: "yaw",
      phase: "done",
      fitted_yaw_deg: 102.13,
      applied_yaw_deg: 102.13,
      yaw_valid: true,
      yaw_calibrated_at: 1756900000,
    });
    expect(dialog.dataset["view"]).toBe("done");
    expect(screen.getByTestId("wizard-step-3").className).toContain("is-active");
    expect(screen.getByTestId("wizard-applied-yaw").textContent).toBe("yaw 102.1°");
    await click("wizard-redo", { kind: "yaw", op: "start" });
  });

  it("Escape / backdrop / ✕ close when idle; while a run is active Close asks before aborting", async () => {
    setCal({});
    const onClose = vi.fn();
    render(<TrackerCalibrationWizard kind="base_station" onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("calibration-wizard")); // backdrop
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByTestId("wizard-close"));
    expect(onClose).toHaveBeenCalledTimes(3);
    fireEvent.click(screen.getByRole("dialog")); // inside the modal → nothing
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(posts).toEqual([]);

    // Active run: every close path shows the inline prompt instead.
    setCal({ kind: "base_station", phase: "capturing", scenes: 2 });
    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId("wizard-abort-confirm").textContent).toContain("Abort calibration?");
    fireEvent.click(screen.getByTestId("wizard-abort-cancel"));
    expect(screen.queryByTestId("wizard-abort-confirm")).toBeNull();
    fireEvent.click(screen.getByTestId("wizard-close"));
    expect(screen.getByTestId("wizard-abort-confirm")).toBeInTheDocument();
    // Escape while the prompt is up dismisses the prompt, not the wizard.
    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    expect(screen.queryByTestId("wizard-abort-confirm")).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(3);
    fireEvent.click(screen.getByTestId("calibration-wizard"));
    expect(screen.getByTestId("wizard-abort-confirm")).toBeInTheDocument();
    expect(posts).toEqual([]);
    fireEvent.click(screen.getByTestId("wizard-abort-ok"));
    await waitFor(() => expect(posts).toEqual([{ kind: "base_station", op: "abort" }]));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(4));

    // The explicit Abort button aborts without the prompt.
    fireEvent.click(screen.getByTestId("wizard-abort-cancel"));
    await click("wizard-abort", { kind: "base_station", op: "abort" });
    expect(screen.queryByTestId("wizard-abort-confirm")).toBeNull();

    // The run ending on its own clears a pending prompt.
    fireEvent.click(screen.getByTestId("wizard-close"));
    expect(screen.getByTestId("wizard-abort-confirm")).toBeInTheDocument();
    setCal({ kind: "base_station", phase: "aborted", detail: "aborted by operator" });
    expect(screen.queryByTestId("wizard-abort-confirm")).toBeNull();
  });

  it("Close on validate-done / fit-done prompts before aborting: the runtime keeps those runs active", async () => {
    // Base station: validate finished (here FAIL), nothing installed — the
    // reader is still on the temporary config, sessions are refused with 409.
    setCal({
      kind: "base_station",
      phase: "done",
      detail: "validation failed — capture more spots",
      validation: {
        samples: 480,
        std_mm: [12.1, 8.4, 9.9],
        max_step_mm: 61.2,
        threshold_std_mm: 5,
        threshold_step_mm: 20,
        passed: false,
      },
    });
    const onClose = vi.fn();
    const first = render(<TrackerCalibrationWizard kind="base_station" onClose={onClose} />);
    expect(screen.getByRole("dialog").dataset["view"]).toBe("validate");
    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("wizard-abort-confirm")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("wizard-abort-cancel"));
    fireEvent.click(screen.getByTestId("calibration-wizard")); // backdrop
    expect(screen.getByTestId("wizard-abort-confirm")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("wizard-abort-ok"));
    await waitFor(() => expect(posts).toEqual([{ kind: "base_station", op: "abort" }]));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    // Installed → the run is over → plain close.
    setCal({ kind: "base_station", phase: "done", installed_path: "/x/config.json" });
    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("wizard-abort-confirm")).toBeNull();
    first.unmount();

    // Yaw: all 7 points fitted (checks failed), not applied → still active.
    posts.length = 0;
    setCal({
      kind: "yaw",
      phase: "done",
      fitted_yaw_deg: 102.1,
      fit_residual_deg: 21.3,
      fit_checks: ["residual 21.3° > 15.0°"],
    });
    const onClose2 = vi.fn();
    render(<TrackerCalibrationWizard kind="yaw" onClose={onClose2} />);
    expect(screen.getByRole("dialog").dataset["view"]).toBe("fit");
    fireEvent.click(screen.getByTestId("wizard-close"));
    expect(onClose2).not.toHaveBeenCalled();
    expect(screen.getByTestId("wizard-abort-confirm")).toBeInTheDocument();
    // Applied (by this or another tab) → run over → pending prompt cleared, Escape closes.
    setCal({ kind: "yaw", phase: "done", fitted_yaw_deg: 102.1, applied_yaw_deg: 102.1 });
    expect(screen.queryByTestId("wizard-abort-confirm")).toBeNull();
    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    expect(onClose2).toHaveBeenCalledTimes(1);
    expect(posts).toEqual([]);
  });

  it("failed / aborted runs show the detail with Retry (= start) and Close", async () => {
    setCal({ kind: "yaw", phase: "failed", detail: "controller lost tracking" });
    const onClose = vi.fn();
    render(<TrackerCalibrationWizard kind="yaw" onClose={onClose} />);
    expect(screen.getByRole("dialog").dataset["view"]).toBe("failed");
    expect(screen.getByTestId("wizard-failure").textContent).toBe("Calibration failed");
    expect(screen.getByTestId("wizard-failure").className).toContain("banner-red");
    expect(screen.getByTestId("wizard-detail").textContent).toBe("controller lost tracking");
    expect(document.activeElement).toBe(screen.getByTestId("wizard-retry"));
    await click("wizard-retry", { kind: "yaw", op: "start" });

    setCal({ kind: "yaw", phase: "aborted", detail: "aborted by operator" });
    expect(screen.getByTestId("wizard-failure").textContent).toBe("Calibration aborted");
    expect(screen.getByTestId("wizard-failure").className).toContain("banner-amber");
    // Nothing is running → Escape closes straight away.
    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("wizard-close-btn"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("a 409 from the runtime surfaces its detail as an error toast", async () => {
    setCal({});
    render(<TrackerCalibrationWizard kind="base_station" onClose={vi.fn()} />);
    reject = "backend is not libsurvive";
    fireEvent.click(screen.getByTestId("wizard-start"));
    await waitFor(() => expect(useStore.getState().toasts.length).toBe(1));
    expect(useStore.getState().toasts[0]).toMatchObject({
      text: "calibration: backend is not libsurvive",
      tone: "error",
    });
    expect(posts).toEqual([{ kind: "base_station", op: "start" }]);
    // Still on the intro (telemetry unchanged), button usable again.
    expect(screen.getByRole("dialog").dataset["view"]).toBe("intro");
    await waitFor(() => expect(screen.getByTestId("wizard-start")).not.toBeDisabled());
  });

  it("a live run of the other kind blocks Start on the intro instead of driving the steps", () => {
    setCal({ kind: "base_station", phase: "capturing", scenes: 2 });
    render(<TrackerCalibrationWizard kind="yaw" onClose={vi.fn()} />);
    expect(screen.getByRole("dialog").dataset["view"]).toBe("intro");
    expect(screen.getByTestId("wizard-other-active").textContent).toContain(
      "base_station calibration is in progress (capturing)",
    );
    expect(screen.getByTestId("wizard-start")).toBeDisabled();
    // Validated but not installed: the runtime still holds the run (and would
    // 409 our start), so it still blocks — with a label that says why.
    setCal({ kind: "base_station", phase: "done", detail: "validation passed — install" });
    expect(screen.getByTestId("wizard-other-active").textContent).toContain(
      "base_station calibration is in progress (done, not installed)",
    );
    expect(screen.getByTestId("wizard-start")).toBeDisabled();
    // A finished run of the other kind is no blocker.
    setCal({ kind: "base_station", phase: "done", installed_path: "/x/config.json" });
    expect(screen.queryByTestId("wizard-other-active")).toBeNull();
    expect(screen.getByTestId("wizard-start")).not.toBeDisabled();
  });

  it("isCalibrationActive mirrors the runtime's `active`: `done` counts until install / apply", () => {
    expect(isCalibrationActive(null)).toBe(false);
    expect(isCalibrationActive(undefined)).toBe(false);
    expect(isCalibrationActive(makeCalibration())).toBe(false);
    for (const phase of ["starting", "capturing", "validating", "fitting", "installing"] as const) {
      expect(isCalibrationActive(makeCalibration({ kind: "base_station", phase }))).toBe(true);
      expect(isCalibrationActive(makeCalibration({ kind: "yaw", phase }))).toBe(true);
    }
    const bsDone = makeCalibration({ kind: "base_station", phase: "done" });
    expect(isCalibrationActive(bsDone)).toBe(true);
    expect(activePhaseLabel(bsDone)).toBe("done, not installed");
    expect(isCalibrationActive({ ...bsDone, installed_path: "/x/config.json" })).toBe(false);
    const yawDone = makeCalibration({ kind: "yaw", phase: "done", fitted_yaw_deg: 102.1 });
    expect(isCalibrationActive(yawDone)).toBe(true);
    expect(activePhaseLabel(yawDone)).toBe("done, not applied");
    expect(isCalibrationActive({ ...yawDone, applied_yaw_deg: 102.1 })).toBe(false);
    expect(activePhaseLabel(makeCalibration({ kind: "yaw", phase: "capturing" }))).toBe(
      "capturing",
    );
    for (const phase of ["idle", "failed", "aborted"] as const) {
      expect(isCalibrationActive(makeCalibration({ kind: "base_station", phase }))).toBe(false);
      expect(isCalibrationActive(makeCalibration({ kind: "yaw", phase }))).toBe(false);
    }
    // `done` with kind none never happens, but must not read as active.
    expect(isCalibrationActive(makeCalibration({ kind: "none", phase: "done" }))).toBe(false);
  });

  it("viewFor disambiguates the overloaded `done`; minScenesFrom reads the runtime detail", () => {
    expect(viewFor("base_station", null)).toEqual({ view: "intro", step: 0 });
    expect(
      viewFor("base_station", makeCalibration({ kind: "base_station", phase: "starting" })),
    ).toEqual({ view: "capture", step: 1 });
    expect(
      viewFor("base_station", makeCalibration({ kind: "base_station", phase: "done" })),
    ).toEqual({
      view: "validate",
      step: 2,
    });
    expect(
      viewFor(
        "base_station",
        makeCalibration({ kind: "base_station", phase: "done", installed_path: "/x" }),
      ),
    ).toEqual({ view: "done", step: 3 });
    expect(
      viewFor("yaw", makeCalibration({ kind: "yaw", phase: "done", fitted_yaw_deg: 1 })),
    ).toEqual({ view: "fit", step: 2 });
    expect(
      viewFor("yaw", makeCalibration({ kind: "yaw", phase: "done", applied_yaw_deg: 1 })),
    ).toEqual({ view: "done", step: 3 });
    expect(viewFor("yaw", makeCalibration({ kind: "yaw", phase: "failed" }))).toEqual({
      view: "failed",
      step: 0,
    });
    expect(minScenesFrom("scenes 3/6 — park the controller still")).toBe(6);
    expect(minScenesFrom("scenes 10/12")).toBe(12);
    expect(minScenesFrom("Force calibrate flag set")).toBe(6);
    expect(minScenesFrom(undefined)).toBe(6);
  });
});
