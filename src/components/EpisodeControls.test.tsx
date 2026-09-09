import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KEYMAP } from "../../tests/mocks/fixtures";
import type { EpisodeStatus } from "../gen";
import { buildBindings } from "../input/bindings";
import { EpisodeControls } from "./EpisodeControls";

const ep = (state: EpisodeStatus["state"], over: Partial<EpisodeStatus> = {}): EpisodeStatus => ({
  state,
  index: 3,
  frames: 120,
  duration_s: 4.0,
  ...over,
});
const bindings = buildBindings(KEYMAP);

describe("EpisodeControls", () => {
  it("idle: only New enabled", () => {
    render(<EpisodeControls episode={ep("idle")} bindings={bindings} onAction={vi.fn()} />);
    expect(screen.getByTestId("episode-new")).toBeEnabled();
    expect(screen.getByTestId("episode-save")).toBeDisabled();
    expect(screen.getByTestId("episode-discard")).toBeDisabled();
  });

  it("recording: Save + Discard enabled, REC indicator shown (+ skipped N with the filter)", () => {
    const { rerender } = render(
      <EpisodeControls episode={ep("recording")} bindings={bindings} onAction={vi.fn()} />,
    );
    expect(screen.getByTestId("episode-new")).toBeDisabled();
    expect(screen.getByTestId("episode-save")).toBeEnabled();
    expect(screen.getByTestId("episode-discard")).toBeEnabled();
    expect(screen.getByTestId("rec-indicator").textContent).toContain("120 frames");
    expect(screen.queryByTestId("rec-skipped")).toBeNull();
    rerender(
      <EpisodeControls
        episode={ep("recording", { frames_skipped: 42 })}
        bindings={bindings}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByTestId("rec-skipped").textContent).toContain("skipped 42");
  });

  it("detail shows whenever the runtime sent one (any state)", () => {
    render(
      <EpisodeControls
        episode={ep("recording", { detail: "recorder degraded (save failed twice)" })}
        bindings={bindings}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByTestId("episode-detail").textContent).toBe(
      "recorder degraded (save failed twice)",
    );
  });

  it("saving: everything disabled", () => {
    render(<EpisodeControls episode={ep("saving")} bindings={bindings} onAction={vi.fn()} />);
    for (const id of ["episode-new", "episode-save", "episode-discard"])
      expect(screen.getByTestId(id)).toBeDisabled();
  });

  it("returning (2026-09-07): everything disabled, amber chip + the runtime detail", () => {
    render(
      <EpisodeControls
        episode={ep("returning", { detail: "returning to profile 'ready'" })}
        bindings={bindings}
        onAction={vi.fn()}
      />,
    );
    for (const id of ["episode-new", "episode-save", "episode-discard"])
      expect(screen.getByTestId(id)).toBeDisabled();
    expect(screen.getByTestId("episode-returning").textContent).toBe("returning to start");
    expect(screen.getByTestId("episode-detail").textContent).toBe("returning to profile 'ready'");
  });

  it("idle keeps the last return note (a cancelled return says so)", () => {
    render(
      <EpisodeControls
        episode={ep("idle", { detail: "return cancelled: movement key" })}
        bindings={bindings}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByTestId("episode-detail").textContent).toBe("return cancelled: movement key");
    expect(screen.getByTestId("episode-new")).toBeEnabled();
  });

  it("key hints come from the SERVED keymap: canonical N / Enter / Backspace", () => {
    render(<EpisodeControls episode={ep("idle")} bindings={bindings} onAction={vi.fn()} />);
    expect(screen.getByTestId("episode-new").textContent).toBe("New episode (N)");
    expect(screen.getByTestId("episode-save").textContent).toBe("Save (Enter)");
    expect(screen.getByTestId("episode-discard").textContent).toBe("Discard (Backspace)");
  });

  it("a rebound keymap moves the hints; no bindings → no hint", () => {
    const rebound = buildBindings(
      KEYMAP.map((e) =>
        e.action === "episode_save"
          ? { ...e, code: "KeyP" }
          : e.action === "episode_discard"
            ? { ...e, code: "Delete" }
            : e,
      ),
    );
    const { rerender } = render(
      <EpisodeControls episode={ep("idle")} bindings={rebound} onAction={vi.fn()} />,
    );
    expect(screen.getByTestId("episode-save").textContent).toBe("Save (P)");
    expect(screen.getByTestId("episode-discard").textContent).toBe("Discard (Delete)");
    rerender(<EpisodeControls episode={ep("idle")} bindings={null} onAction={vi.fn()} />);
    expect(screen.getByTestId("episode-save").textContent).toBe("Save");
    expect(screen.getByTestId("episode-new").textContent).toBe("New episode");
  });

  it("header shows the dataset and the saved count from telemetry", () => {
    render(
      <EpisodeControls
        episode={ep("idle", { repo_id: "apollo/pick_cube", total_episodes: 7 })}
        bindings={bindings}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByTestId("episode-repo").textContent).toContain("apollo/pick_cube");
    expect(screen.getByTestId("episode-total").textContent).toContain("7 episodes saved");
  });

  it("clicks emit the matching ActionMsg name; UI state only follows telemetry", () => {
    const onAction = vi.fn();
    const { rerender } = render(
      <EpisodeControls episode={ep("idle")} bindings={bindings} onAction={onAction} />,
    );
    fireEvent.click(screen.getByTestId("episode-new"));
    expect(onAction).toHaveBeenCalledWith("episode_new");
    // No optimistic flip: still idle until a telemetry fixture confirms.
    expect(screen.getByTestId("episode-new")).toBeEnabled();
    rerender(<EpisodeControls episode={ep("recording")} bindings={bindings} onAction={onAction} />);
    expect(screen.getByTestId("episode-new")).toBeDisabled();
    fireEvent.click(screen.getByTestId("episode-save"));
    expect(onAction).toHaveBeenCalledWith("episode_save");
  });

  it("control link down disables everything", () => {
    render(
      <EpisodeControls episode={ep("idle")} bindings={bindings} onAction={vi.fn()} disabled />,
    );
    expect(screen.getByTestId("episode-new")).toBeDisabled();
  });

  it("Online DAgger phase gate (15-online-dagger §3): a reason disables New episode and is shown under the row", () => {
    const onAction = vi.fn();
    const { rerender } = render(
      <EpisodeControls
        episode={ep("idle")}
        bindings={bindings}
        onAction={onAction}
        newEpisodeReason="waiting for the trainer to report ready (loading the offline pool)"
      />,
    );
    const btn = screen.getByTestId("episode-new");
    expect(btn).toBeDisabled();
    const reason = screen.getByTestId("episode-new-reason");
    expect(reason.textContent).toBe(
      "waiting for the trainer to report ready (loading the offline pool)",
    );
    expect(reason.className).toBe("btn-reason");
    expect(btn.getAttribute("aria-describedby")).toBe(reason.id);
    fireEvent.click(btn);
    expect(onAction).not.toHaveBeenCalled();
    // Save / Discard follow the episode state as before.
    expect(screen.getByTestId("episode-save")).toBeDisabled();
    rerender(
      <EpisodeControls
        episode={ep("recording")}
        bindings={bindings}
        onAction={onAction}
        newEpisodeReason="training in progress (epoch 3/8)"
      />,
    );
    // While recording New is disabled anyway — the phase reason is not repeated.
    expect(screen.getByTestId("episode-new")).toBeDisabled();
    expect(screen.queryByTestId("episode-new-reason")).toBeNull();
    expect(screen.getByTestId("episode-save")).toBeEnabled();
    // Link down: the generic disabling wins, no phase reason either.
    rerender(
      <EpisodeControls
        episode={ep("idle")}
        bindings={bindings}
        onAction={onAction}
        disabled
        newEpisodeReason="training in progress"
      />,
    );
    expect(screen.queryByTestId("episode-new-reason")).toBeNull();
    // Back in `rollout` (null): New is enabled again.
    rerender(
      <EpisodeControls
        episode={ep("idle")}
        bindings={bindings}
        onAction={onAction}
        newEpisodeReason={null}
      />,
    );
    expect(screen.getByTestId("episode-new")).toBeEnabled();
    expect(screen.queryByTestId("episode-new-reason")).toBeNull();
  });
});
