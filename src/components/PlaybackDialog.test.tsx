/** Episode playback dialog (2026-09-10; operator request, 05-ui §8.1 item 7).
 *
 * The rule under test is the operator's: **Playback stays disabled until the arms have
 * been returned to the episode's initial state.** Everything else here exists to make
 * sure that rule cannot be bypassed — by a refused return, by a transport failure, by
 * closing and re-opening the dialog, or by an episode the runtime says is not playable.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/rest";
import type { EpisodeInfo, EpisodePlaybackInfo, ReturnHomeResult } from "../gen";
import {
  NEEDS_INITIAL,
  PLAY_NOT_READY,
  PlaybackDialog,
  UNVERIFIED_NOTICE,
  playedSentence,
  playingSentence,
} from "./PlaybackDialog";

const EPISODE: EpisodeInfo = {
  episode_id: "20260909T091000.433Z-d66aaf",
  index: 0,
  frames: 932,
  duration_s: 37.28,
};

const INFO: EpisodePlaybackInfo = {
  repo_id: "bc_demo/drawer_assembling",
  episode_id: EPISODE.episode_id,
  frames: 932,
  fps: 25,
  duration_s: 37.28,
  arms: [
    { arm_id: "grip", q: [0, 0, 0, 0, 0, 0, 0], rail_pos_m: 0.636, gripper_open_frac: 1 },
    { arm_id: "view", q: [0, 0, 0, 0, 0, 0, 0], rail_pos_m: 0, gripper_open_frac: 1 },
  ],
  playable: true,
  reason: "",
  sources: ["state", "delta_ee", "abs_ee"],
  action_space: "delta_ee",
};

const ARRIVED: ReturnHomeResult = { ok: true, status: "done", detail: "" };

const SPEC = {
  mode: "teleop",
  kind: "hardware",
  arms: ["grip", "view"],
  frames: { grip: "arm_base:grip", view: "arm_base:view" },
  start_from: "keep_current",
} as unknown as Parameters<typeof PlaybackDialog>[0]["spec"];

function setup(
  overrides: {
    /** Replaces INFO wholesale (a plain merge cannot DELETE `sources`). */
    infoExact?: EpisodePlaybackInfo;
    info?: Partial<EpisodePlaybackInfo> | Error;
    action?: (body: { action: string }) => Promise<ReturnHomeResult>;
    sessionActive?: boolean;
    spec?: Parameters<typeof PlaybackDialog>[0]["spec"];
    specReason?: string | null;
    start?: () => Promise<unknown>;
    stop?: () => Promise<void>;
  } = {},
) {
  const fetchInfo = vi.fn(() =>
    overrides.info instanceof Error
      ? Promise.reject(overrides.info)
      : Promise.resolve(overrides.infoExact ?? { ...INFO, ...(overrides.info ?? {}) }),
  );
  const runAction = vi.fn(overrides.action ?? (() => Promise.resolve(ARRIVED)));
  const onRequestClose = vi.fn();
  const onSessionEnded = vi.fn();
  const startSession = vi.fn(overrides.start ?? (() => Promise.resolve({}) as never));
  const stopSession = vi.fn(overrides.stop ?? (() => Promise.resolve()));
  const tree = (open: boolean) => (
    <PlaybackDialog
      repoId="bc_demo/drawer_assembling"
      episode={EPISODE}
      open={open}
      sessionActive={overrides.sessionActive ?? true}
      spec={overrides.spec === undefined ? SPEC : overrides.spec}
      specReason={overrides.specReason ?? null}
      onRequestClose={onRequestClose}
      onSessionEnded={onSessionEnded}
      fetchInfo={fetchInfo as never}
      runAction={runAction as never}
      startSession={startSession as never}
      stopSession={stopSession as never}
    />
  );
  const { rerender } = render(tree(true));
  return {
    fetchInfo,
    runAction,
    onRequestClose,
    startSession,
    stopSession,
    onSessionEnded,
    /** Toggle the `open` prop without unmounting, as the owner does through the Sheet. */
    setOpen: (open: boolean) => rerender(tree(open)),
  };
}

const goto = () => screen.getByTestId("playback-goto-initial");
const play = () => screen.getByTestId("playback-play");
const sourceSelect = () => screen.getByTestId("playback-source") as HTMLSelectElement;
const option = (value: string) =>
  screen.getByRole("option", { name: SOURCE_LABELS[value] }) as HTMLOptionElement;

const SOURCE_LABELS: Record<string, string> = {
  state: "Joint trajectory (observation.state)",
  delta_ee: "Delta EE actions (action)",
  abs_ee: "Absolute EE actions (action.abs_ee)",
};

/** Return, wait for the unlock: the precondition of every `play`. */
async function returned(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByTestId("playback-meta");
  await user.click(goto());
  await waitFor(() => expect(play()).toBeEnabled());
}

describe("PlaybackDialog", () => {
  it("shows the episode's facts and both actions, with Playback gated on the return", async () => {
    setup();
    await screen.findByTestId("playback-meta");
    expect(screen.getByTestId("playback-episode")).toHaveTextContent(
      "bc_demo/drawer_assembling · 20260909T091000.433Z-d66aaf",
    );
    expect(screen.getByTestId("playback-meta")).toHaveTextContent("932");
    expect(screen.getByTestId("playback-meta")).toHaveTextContent("37.3 s");
    // User-facing arm names, never the internal ids (CLAUDE.md conventions).
    expect(screen.getByTestId("playback-meta")).toHaveTextContent("Manipulation Arm");
    expect(screen.getByTestId("playback-meta")).toHaveTextContent("Perception Arm");
    expect(goto()).toBeEnabled();
    expect(play()).toBeDisabled();
    expect(screen.getByTestId("playback-play-reason")).toHaveTextContent(NEEDS_INITIAL);
  });

  it("says the twin cannot see the room, because both buttons move the real arms", async () => {
    setup();
    await screen.findByTestId("playback-notice");
    expect(screen.getByTestId("playback-notice")).toHaveTextContent(UNVERIFIED_NOTICE);
  });

  it("a successful return unlocks Playback and sends the right body", async () => {
    const user = userEvent.setup();
    const { runAction } = setup();
    await screen.findByTestId("playback-meta");
    await user.click(goto());
    await waitFor(() => expect(play()).toBeEnabled());
    expect(runAction).toHaveBeenCalledWith({
      repo_id: "bc_demo/drawer_assembling",
      episode_id: EPISODE.episode_id,
      action: "goto_initial",
    });
    expect(screen.queryByTestId("playback-play-reason")).toBeNull();
  });

  it("'already there' counts as arrived — a skipped motion IS being at the initial state", async () => {
    const user = userEvent.setup();
    setup({
      action: () =>
        Promise.resolve({ ok: true, status: "skipped", detail: "already at the initial state" }),
    });
    await screen.findByTestId("playback-meta");
    await user.click(goto());
    await waitFor(() => expect(play()).toBeEnabled());
    expect(screen.getByTestId("playback-outcome")).toHaveTextContent(
      "already at the initial state",
    );
  });

  it("a REFUSED return leaves Playback disabled and shows the runtime's reason", async () => {
    const user = userEvent.setup();
    setup({
      action: () =>
        Promise.resolve({
          ok: false,
          status: "refused",
          detail: "an episode is still recording - save or discard it first",
        }),
    });
    await screen.findByTestId("playback-meta");
    await user.click(goto());
    await screen.findByTestId("playback-outcome");
    expect(screen.getByTestId("playback-outcome")).toHaveTextContent("still recording");
    expect(play()).toBeDisabled();
    expect(screen.getByTestId("playback-play-reason")).toHaveTextContent(NEEDS_INITIAL);
  });

  it("a transport failure leaves Playback disabled too", async () => {
    const user = userEvent.setup();
    setup({ action: () => Promise.reject(new ApiError(0, "network down")) });
    await screen.findByTestId("playback-meta");
    await user.click(goto());
    await screen.findByTestId("playback-outcome");
    expect(screen.getByTestId("playback-outcome")).toHaveTextContent("network down");
    expect(play()).toBeDisabled();
  });

  it("an episode the runtime says is not playable disables BOTH buttons with its reason", async () => {
    setup({
      info: { playable: false, reason: "the episode was recorded with a third arm" },
    });
    await screen.findByTestId("playback-blocked");
    expect(screen.getByTestId("playback-blocked")).toHaveTextContent("recorded with a third arm");
    expect(goto()).toBeDisabled();
    expect(play()).toBeDisabled();
    // The unverified-twin notice is replaced by the blocking reason: nothing can move.
    expect(screen.queryByTestId("playback-notice")).toBeNull();
  });

  it("the runtime's 'start a session first' is NOT a blocker — the dialog starts one", async () => {
    const user = userEvent.setup();
    const { startSession } = setup({
      sessionActive: false,
      info: { playable: false, reason: "Start a session first - playback drives the arms" },
    });
    await screen.findByTestId("playback-meta");
    expect(screen.queryByTestId("playback-blocked")).toBeNull();
    expect(goto()).toBeEnabled();
    await user.click(goto());
    await waitFor(() => expect(play()).toBeEnabled());
    expect(startSession).toHaveBeenCalledWith(SPEC);
    expect(screen.getByTestId("playback-owns-session")).toBeInTheDocument();
  });

  it("a session that was already running is used as-is and never torn down", async () => {
    const user = userEvent.setup();
    const { startSession, stopSession } = setup({ sessionActive: true });
    await screen.findByTestId("playback-meta");
    await user.click(goto());
    await waitFor(() => expect(play()).toBeEnabled());
    expect(startSession).not.toHaveBeenCalled();
    expect(screen.queryByTestId("playback-owns-session")).toBeNull();
    await user.click(screen.getByTestId("playback-done"));
    expect(stopSession).not.toHaveBeenCalled();
  });

  it("closing ends the session the dialog started, and stops a replay first", async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    const { stopSession, onSessionEnded } = setup({
      sessionActive: false,
      action: (body) => {
        calls.push(body.action);
        if (body.action === "goto_initial") return Promise.resolve(ARRIVED);
        if (body.action === "stop")
          return Promise.resolve({ ok: true, status: "done", detail: "" });
        return new Promise<ReturnHomeResult>(() => undefined); // never resolves
      },
    });
    await screen.findByTestId("playback-meta");
    await user.click(goto());
    await waitFor(() => expect(play()).toBeEnabled());
    await user.click(play());
    await screen.findByTestId("playback-playing");
    await user.click(screen.getByTestId("playback-close"));
    await waitFor(() => expect(stopSession).toHaveBeenCalled());
    expect(calls).toEqual(["goto_initial", "play", "stop"]);
    await waitFor(() => expect(onSessionEnded).toHaveBeenCalled());
  });

  it("a session the runtime refuses to start is reported, and nothing moves", async () => {
    const user = userEvent.setup();
    const { runAction } = setup({
      sessionActive: false,
      start: () => Promise.reject(new ApiError(409, "Perception Arm: rail not homed")),
    });
    await screen.findByTestId("playback-meta");
    await user.click(goto());
    await screen.findByTestId("playback-outcome");
    expect(screen.getByTestId("playback-outcome")).toHaveTextContent("rail not homed");
    expect(runAction).not.toHaveBeenCalled();
    expect(play()).toBeDisabled();
  });

  it("a launcher-level refusal blocks both buttons before anything is attempted", async () => {
    setup({ sessionActive: false, spec: null, specReason: "Hardware workcell not configured" });
    await screen.findByTestId("playback-blocked");
    expect(screen.getByTestId("playback-blocked")).toHaveTextContent("not configured");
    expect(goto()).toBeDisabled();
    expect(play()).toBeDisabled();
  });

  it("a failed read shows the API detail and disables both buttons", async () => {
    setup({ info: new ApiError(409, "frames.parquet is unreadable") });
    await screen.findByTestId("playback-blocked");
    expect(screen.getByTestId("playback-blocked")).toHaveTextContent("unreadable");
    expect(goto()).toBeDisabled();
    expect(play()).toBeDisabled();
  });

  it("both buttons are disabled while the return is in flight", async () => {
    const user = userEvent.setup();
    let resolve: (r: ReturnHomeResult) => void = () => undefined;
    setup({ action: () => new Promise<ReturnHomeResult>((r) => (resolve = r)) });
    await screen.findByTestId("playback-meta");
    await user.click(goto());
    expect(goto()).toBeDisabled();
    expect(goto()).toHaveTextContent("Returning…");
    expect(play()).toBeDisabled();
    resolve(ARRIVED);
    await waitFor(() => expect(play()).toBeEnabled());
  });

  it("while replaying, Play becomes Stop — the operator's only cancel on this page", async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    let finish: (r: ReturnHomeResult) => void = () => undefined;
    const { runAction } = setup({
      action: (body) => {
        calls.push(body.action);
        if (body.action === "goto_initial") return Promise.resolve(ARRIVED);
        if (body.action === "stop")
          return Promise.resolve({ ok: true, status: "done", detail: "" });
        return new Promise<ReturnHomeResult>((r) => (finish = r));
      },
    });
    await screen.findByTestId("playback-meta");
    await user.click(goto());
    await waitFor(() => expect(play()).toBeEnabled());
    await user.click(play());
    await screen.findByTestId("playback-playing");
    expect(screen.queryByTestId("playback-play")).toBeNull();
    await user.click(screen.getByTestId("playback-stop"));
    expect(calls).toEqual(["goto_initial", "play", "stop"]);
    // The in-flight play request answers with the cancellation reason; that is the outcome.
    finish({ ok: false, status: "cancelled", detail: "playback stopped by the operator" });
    await waitFor(() =>
      expect(screen.getByTestId("playback-outcome")).toHaveTextContent("stopped by the operator"),
    );
    expect(runAction).toHaveBeenCalledTimes(3);
  });

  it("the runtime's 501 for the unfinished trajectory replay is explained, not shown raw", async () => {
    const user = userEvent.setup();
    setup({
      action: (body) =>
        body.action === "play"
          ? Promise.reject(new ApiError(501, "playback action 'play' is not implemented yet"))
          : Promise.resolve(ARRIVED),
    });
    await screen.findByTestId("playback-meta");
    await user.click(goto());
    await waitFor(() => expect(play()).toBeEnabled());
    await user.click(play());
    await waitFor(() =>
      expect(screen.getByTestId("playback-outcome")).toHaveTextContent(PLAY_NOT_READY),
    );
    // A missing feature is not a lost position: the arms are still at frame 0.
    expect(play()).toBeEnabled();
  });

  it("the × and the footer Close both ask the owner to close", async () => {
    const user = userEvent.setup();
    const { onRequestClose } = setup();
    await screen.findByTestId("playback-meta");
    await user.click(screen.getByTestId("playback-close"));
    expect(onRequestClose).toHaveBeenCalled();
    await user.click(screen.getByTestId("playback-done"));
    expect(onRequestClose).toHaveBeenCalledTimes(2);
  });

  it("renders inside a modal <dialog>, so the page behind it is inert", async () => {
    setup();
    await screen.findByTestId("playback-meta");
    const host = screen.getByTestId("playback-dialog-host");
    expect(host.tagName).toBe("DIALOG");
    expect(screen.getByTestId("playback-dialog")).toHaveAttribute("aria-modal", "true");
  });

  // -- Replay source (2026-09-11) ---------------------------------------------------

  it("the replay source defaults to the joint trajectory and `play` says so on the wire", async () => {
    const user = userEvent.setup();
    const { runAction } = setup();
    await returned(user);
    expect(sourceSelect()).toHaveValue("state");
    expect(option("state")).toBeEnabled();
    expect(option("delta_ee")).toBeEnabled();
    expect(option("abs_ee")).toBeEnabled();
    await user.click(play());
    expect(runAction).toHaveBeenLastCalledWith({
      repo_id: "bc_demo/drawer_assembling",
      episode_id: EPISODE.episode_id,
      action: "play",
      source: "state",
    });
    // The return never carries a source — the runtime defaults it.
    expect(runAction.mock.calls[0]?.[0]).toEqual({
      repo_id: "bc_demo/drawer_assembling",
      episode_id: EPISODE.episode_id,
      action: "goto_initial",
    });
    await waitFor(() =>
      expect(screen.getByTestId("playback-outcome")).toHaveTextContent(playedSentence("state", "")),
    );
    expect(screen.getByTestId("playback-outcome")).toHaveTextContent(
      "Finished replaying the recorded joint trajectory.",
    );
  });

  it("choosing the delta EE actions sends source 'delta_ee' and names it in the result", async () => {
    const user = userEvent.setup();
    const { runAction } = setup();
    await returned(user);
    await user.selectOptions(sourceSelect(), "delta_ee");
    expect(sourceSelect()).toHaveValue("delta_ee");
    await user.click(play());
    expect(runAction).toHaveBeenLastCalledWith({
      repo_id: "bc_demo/drawer_assembling",
      episode_id: EPISODE.episode_id,
      action: "play",
      source: "delta_ee",
    });
    await waitFor(() =>
      expect(screen.getByTestId("playback-outcome")).toHaveTextContent(
        "Finished replaying the delta EE actions through the executor.",
      ),
    );
  });

  it("choosing the absolute EE actions sends source 'abs_ee'", async () => {
    const user = userEvent.setup();
    const { runAction } = setup();
    await returned(user);
    await user.selectOptions(sourceSelect(), "abs_ee");
    await user.click(play());
    expect(runAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: "play", source: "abs_ee" }),
    );
  });

  it("a source the episode does not offer is a disabled option", async () => {
    setup({ info: { sources: ["state", "delta_ee"] } });
    await screen.findByTestId("playback-meta");
    expect(option("state")).toBeEnabled();
    expect(option("delta_ee")).toBeEnabled();
    expect(option("abs_ee")).toBeDisabled();
  });

  it("an older runtime (no `sources`) offers the joint trajectory only", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { sources: _dropped, ...legacy } = INFO;
    setup({ infoExact: legacy });
    await screen.findByTestId("playback-meta");
    expect(sourceSelect()).toHaveValue("state");
    expect(option("state")).toBeEnabled();
    expect(option("delta_ee")).toBeDisabled();
    expect(option("abs_ee")).toBeDisabled();
  });

  it("the source control is disabled while a motion is in flight and while replaying", async () => {
    const user = userEvent.setup();
    let resolveReturn: (r: ReturnHomeResult) => void = () => undefined;
    setup({
      action: (body) => {
        if (body.action === "goto_initial")
          return new Promise<ReturnHomeResult>((r) => (resolveReturn = r));
        return new Promise<ReturnHomeResult>(() => undefined); // play never resolves
      },
    });
    await screen.findByTestId("playback-meta");
    expect(sourceSelect()).toBeEnabled();
    await user.click(goto());
    expect(sourceSelect()).toBeDisabled();
    resolveReturn(ARRIVED);
    await waitFor(() => expect(play()).toBeEnabled());
    expect(sourceSelect()).toBeEnabled();
    await user.selectOptions(sourceSelect(), "abs_ee");
    await user.click(play());
    await screen.findByTestId("playback-playing");
    expect(sourceSelect()).toBeDisabled();
  });

  it("the playing sentence names the source in plain words", async () => {
    const user = userEvent.setup();
    setup({
      action: (body) =>
        body.action === "play"
          ? new Promise<ReturnHomeResult>(() => undefined)
          : Promise.resolve(ARRIVED),
    });
    await returned(user);
    await user.selectOptions(sourceSelect(), "delta_ee");
    await user.click(play());
    await screen.findByTestId("playback-playing");
    expect(screen.getByTestId("playback-playing")).toHaveTextContent(
      "Replaying the delta EE actions through the executor",
    );
    expect(screen.getByTestId("playback-playing")).toHaveTextContent(playingSentence("delta_ee"));
    expect(playingSentence("state")).toMatch(/^Replaying the recorded joint trajectory/);
    expect(playingSentence("abs_ee")).toMatch(
      /^Replaying the absolute EE actions through the executor/,
    );
  });

  it("a refused action replay shows the runtime's reason, unprefixed", async () => {
    const user = userEvent.setup();
    setup({
      action: (body) =>
        body.action === "play"
          ? Promise.resolve({
              ok: false,
              status: "refused",
              detail: "action replay is admitted in sim only",
            })
          : Promise.resolve(ARRIVED),
    });
    await returned(user);
    await user.selectOptions(sourceSelect(), "abs_ee");
    await user.click(play());
    await waitFor(() =>
      expect(screen.getByTestId("playback-outcome")).toHaveTextContent(
        "action replay is admitted in sim only",
      ),
    );
    expect(screen.getByTestId("playback-outcome")).not.toHaveTextContent("Finished");
  });

  it("the selection resets to the joint trajectory when the dialog reopens", async () => {
    const user = userEvent.setup();
    const { setOpen } = setup();
    await screen.findByTestId("playback-meta");
    await user.selectOptions(sourceSelect(), "abs_ee");
    expect(sourceSelect()).toHaveValue("abs_ee");
    setOpen(false);
    setOpen(true);
    await waitFor(() => expect(sourceSelect()).toHaveValue("state"));
  });
});
