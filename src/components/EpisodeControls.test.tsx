import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EpisodeStatus } from "../gen";
import { EpisodeControls } from "./EpisodeControls";

const ep = (state: EpisodeStatus["state"], over: Partial<EpisodeStatus> = {}): EpisodeStatus => ({
  state,
  index: 3,
  frames: 120,
  duration_s: 4.0,
  ...over,
});

describe("EpisodeControls", () => {
  it("idle: only New enabled", () => {
    render(<EpisodeControls episode={ep("idle")} onAction={vi.fn()} />);
    expect(screen.getByTestId("episode-new")).toBeEnabled();
    expect(screen.getByTestId("episode-save")).toBeDisabled();
    expect(screen.getByTestId("episode-discard")).toBeDisabled();
  });

  it("recording: Save + Discard enabled, REC indicator shown", () => {
    render(<EpisodeControls episode={ep("recording")} onAction={vi.fn()} />);
    expect(screen.getByTestId("episode-new")).toBeDisabled();
    expect(screen.getByTestId("episode-save")).toBeEnabled();
    expect(screen.getByTestId("episode-discard")).toBeEnabled();
    expect(screen.getByTestId("rec-indicator").textContent).toContain("120 frames");
  });

  it("saving: everything disabled", () => {
    render(<EpisodeControls episode={ep("saving")} onAction={vi.fn()} />);
    for (const id of ["episode-new", "episode-save", "episode-discard"])
      expect(screen.getByTestId(id)).toBeDisabled();
  });

  it("clicks emit the matching ActionMsg name; UI state only follows telemetry", () => {
    const onAction = vi.fn();
    const { rerender } = render(<EpisodeControls episode={ep("idle")} onAction={onAction} />);
    fireEvent.click(screen.getByTestId("episode-new"));
    expect(onAction).toHaveBeenCalledWith("episode_new");
    // No optimistic flip: still idle until a telemetry fixture confirms.
    expect(screen.getByTestId("episode-new")).toBeEnabled();
    rerender(<EpisodeControls episode={ep("recording")} onAction={onAction} />);
    expect(screen.getByTestId("episode-new")).toBeDisabled();
    fireEvent.click(screen.getByTestId("episode-save"));
    expect(onAction).toHaveBeenCalledWith("episode_save");
  });

  it("control link down disables everything", () => {
    render(<EpisodeControls episode={ep("idle")} onAction={vi.fn()} disabled />);
    expect(screen.getByTestId("episode-new")).toBeDisabled();
  });
});
