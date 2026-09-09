/** OnlineDaggerPanel (phase-14; 15-online-dagger §8 Cockpit): the pure
 * `onlineDaggerModel` reducer (phase pills, the Take over / Hand back / Train now
 * gates, banner), the rendered panel (header, chips, trainer row, generic metrics,
 * actor split, hints from the served keymap), the three actions, the "swapped"
 * note, the loss sparkline (the `useLossHistory` ring fed by store telemetry; no
 * canvas without a `loss` metric), and the banner. */
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  KEYMAP,
  makeExternal,
  makeOnlineDagger,
  makeTelemetry,
  makeTrainerStatus,
} from "../../tests/mocks/fixtures";
import type { DaggerStatus, EpisodeStatus, OnlineDaggerStatus } from "../gen";
import { buildBindings } from "../input/bindings";
import { useStore } from "../store";
import {
  fmtMetric,
  LossSparkline,
  newRolloutReason,
  OnlineDaggerBanner,
  OnlineDaggerPanel,
  onlineDaggerModel,
  PHASE_BLOCK_REASON,
  REASON_ALREADY_HUMAN,
  REASON_ALREADY_POLICY,
  REASON_EPISODE_OPEN,
  REASON_LINK_DOWN,
  REASON_NO_TRAINER,
  REASON_OBSERVER,
  REASON_RETURNING,
  SPARKLINE_POINTS,
  SWAPPED_NOTE_MS,
  useLossHistory,
  type PanelSession,
} from "./OnlineDaggerPanel";

const dagger = (od: Partial<OnlineDaggerStatus> | null = {}, over: Partial<DaggerStatus> = {}) =>
  ({
    control_mode: "policy",
    engaged_arm: null,
    policy_version: "v4",
    policy_stale: false,
    online_dagger: od === null ? null : makeOnlineDagger(od),
    ...over,
  }) satisfies DaggerStatus;
const ep = (state: EpisodeStatus["state"]): EpisodeStatus => ({
  state,
  index: 0,
  frames: 0,
  duration_s: 0,
});
const bindings = buildBindings(KEYMAP);
const noEp: PanelSession = { episode: null };
const recording: PanelSession = { episode: ep("recording") };

afterEach(() => {
  act(() => useStore.getState().resetForEpochChange());
  useStore.setState({ toasts: [] });
});

describe("onlineDaggerModel()", () => {
  it("null without the block (legacy dagger session)", () => {
    expect(onlineDaggerModel(dagger(null), noEp)).toBeNull();
  });
  it("title, rollouts, control chip, trainer row, generic metrics, actor split, version from telemetry", () => {
    const m = onlineDaggerModel(dagger(), noEp)!;
    expect(m.title).toBe("Online DAgger · pick_cube_v1");
    expect(m.rolloutsSaved).toBe(3);
    expect(m.controlChip).toEqual({ tone: "blue", label: "POLICY DRIVING" });
    expect(m.trainer).toEqual({
      id: "act_pick_place/trainer",
      state: "ready",
      detail: "",
      alive: true,
      ageS: 0.4,
    });
    // Metrics verbatim, in wire order — the panel names no algorithm.
    expect(m.metrics).toEqual([
      { key: "loss", value: 0.0421 },
      { key: "proj_rate", value: 0.115 },
    ]);
    expect(m.loss).toBe(0.0421);
    expect(m.actorSplit).toEqual({ expert: 120, novice: 480 });
    expect(m.policyVersion).toBe(4);
    expect(m.banner).toBeNull();
    expect(onlineDaggerModel(dagger({}, { control_mode: "human" }), noEp)!.controlChip).toEqual({
      tone: "green",
      label: "HUMAN TAKEOVER — recording intervention",
    });
    expect(
      onlineDaggerModel(dagger({}, { control_mode: "takeover_transition" }), noEp)!.controlChip
        .tone,
    ).toBe("amber");
    // No trainer status yet: an honest empty row, no loss.
    const bare = onlineDaggerModel(dagger({ trainer: null }), noEp)!;
    expect(bare.trainer).toEqual({ id: null, state: null, detail: "", alive: false, ageS: 0.4 });
    expect(bare.metrics).toEqual([]);
    expect(bare.loss).toBeNull();
    // A non-finite or non-numeric metric is dropped, never printed as NaN.
    const odd = onlineDaggerModel(
      dagger({
        trainer: makeTrainerStatus({
          metrics: { steps: 96, nan: NaN, loss: Infinity } as Record<string, number>,
        }),
      }),
      noEp,
    )!;
    expect(odd.metrics).toEqual([{ key: "steps", value: 96 }]);
    expect(odd.loss).toBeNull();
  });
  it("phase pills: waiting_trainer (amber), rollout (blue), training (accent, % + progress only when reported), error (danger + detail)", () => {
    expect(onlineDaggerModel(dagger({ phase: "waiting_trainer" }), noEp)!.phase).toEqual({
      kind: "waiting_trainer",
      tone: "amber",
      label: "WAITING FOR TRAINER",
      progress: null,
    });
    expect(onlineDaggerModel(dagger(), noEp)!.phase).toEqual({
      kind: "rollout",
      tone: "blue",
      label: "ROLLOUT",
      progress: null,
    });
    const training = onlineDaggerModel(
      dagger({
        phase: "training",
        trainer: makeTrainerStatus({ state: "training", progress: 0.375 }),
      }),
      noEp,
    )!.phase;
    expect(training).toEqual({
      kind: "training",
      tone: "accent",
      label: "TRAINING 38 %",
      progress: 0.375,
    });
    // A trainer that reports no progress (wire default 0): plain TRAINING, indeterminate bar.
    expect(
      onlineDaggerModel(
        dagger({ phase: "training", trainer: makeTrainerStatus({ state: "training" }) }),
        noEp,
      )!.phase,
    ).toEqual({ kind: "training", tone: "accent", label: "TRAINING", progress: null });
    expect(onlineDaggerModel(dagger({ phase: "training", trainer: null }), noEp)!.phase.label).toBe(
      "TRAINING",
    );
    // The runtime's `detail` in this phase is its refusal "trainer error: <detail>"
    // (`_refuse_locked`); the pill shows the trainer's sentence, as the banner does.
    const erroring = makeTrainerStatus({ state: "error", detail: "cuda OOM" });
    expect(
      onlineDaggerModel(
        dagger({ phase: "error", detail: "trainer error: cuda OOM", trainer: erroring }),
        noEp,
      )!.phase,
    ).toEqual({
      kind: "error",
      tone: "danger",
      label: "TRAINER ERROR — cuda OOM",
      progress: null,
    });
    // No trainer block (a stale status was dropped): the prefix is still stripped.
    expect(
      onlineDaggerModel(
        dagger({ phase: "error", detail: "trainer error: cuda OOM", trainer: null }),
        noEp,
      )!.phase.label,
    ).toBe("TRAINER ERROR — cuda OOM");
    // The trainer's own detail stands in when the runtime's is empty.
    expect(
      onlineDaggerModel(
        dagger({
          phase: "error",
          detail: "",
          trainer: makeTrainerStatus({ state: "error", detail: "diverged" }),
        }),
        noEp,
      )!.phase.label,
    ).toBe("TRAINER ERROR — diverged");
    expect(
      onlineDaggerModel(dagger({ phase: "error", detail: "", trainer: null }), noEp)!.phase.label,
    ).toBe("TRAINER ERROR");
  });
  it("Take over / Hand back follow the runtime: the control mode alone decides, in EVERY episode state; observer / link reasons shared", () => {
    const gates = (session: PanelSession, over: Partial<DaggerStatus> = {}) => {
      const m = onlineDaggerModel(dagger({}, over), session)!;
      return { takeover: m.takeover, handback: m.handback, line: m.gateReason };
    };
    // Policy driving: Take over live, Hand back is a no-op ack server-side.
    const policyDriving = {
      takeover: { disabled: false, reason: null },
      handback: { disabled: true, reason: REASON_ALREADY_POLICY },
      line: `Hand back: ${REASON_ALREADY_POLICY}`,
    };
    expect(gates(recording)).toEqual(policyDriving);
    // `_op_takeover` / `_op_handback` accept the actions between rollouts, while
    // saving and during the return to start (a take-over is the documented escape:
    // the return is cancelled by any input) — like the Space toggle beside them.
    expect(gates(noEp)).toEqual(policyDriving);
    expect(gates({ episode: ep("idle") })).toEqual(policyDriving);
    expect(gates({ episode: ep("saving") })).toEqual(policyDriving);
    expect(gates({ episode: ep("returning") })).toEqual(policyDriving);
    // Human has taken over: the other way round.
    expect(gates(recording, { control_mode: "human" })).toEqual({
      takeover: { disabled: true, reason: REASON_ALREADY_HUMAN },
      handback: { disabled: false, reason: null },
      line: `Take over: ${REASON_ALREADY_HUMAN}`,
    });
    expect(gates({ episode: ep("returning") }, { control_mode: "human" }).handback.disabled).toBe(
      false,
    );
    // The transition window counts as taken over (takeover is a no-op there; handback works).
    expect(gates(recording, { control_mode: "takeover_transition" })).toMatchObject({
      takeover: { disabled: true, reason: REASON_ALREADY_HUMAN },
      handback: { disabled: false },
    });
    // Role before link; both off with ONE shared line.
    expect(gates({ ...recording, controlDown: true })).toEqual({
      takeover: { disabled: true, reason: REASON_LINK_DOWN },
      handback: { disabled: true, reason: REASON_LINK_DOWN },
      line: REASON_LINK_DOWN,
    });
    expect(gates({ ...recording, readOnly: true }).line).toBe(REASON_OBSERVER);
    expect(gates({ ...recording, readOnly: true, controlDown: true }).line).toBe(REASON_OBSERVER);
  });
  it("Train now: enabled with a fresh trainer and no open episode; each refusal has its reason", () => {
    const tn = (od: Partial<OnlineDaggerStatus>, session: PanelSession = noEp) =>
      onlineDaggerModel(dagger(od), session)!.trainNow;
    expect(tn({})).toEqual({ disabled: false, reason: null });
    expect(tn({ phase: "waiting_trainer" }).disabled).toBe(false); // the trainer may ignore it
    expect(tn({ phase: "error" }).disabled).toBe(false);
    expect(tn({}, recording)).toEqual({ disabled: true, reason: REASON_EPISODE_OPEN });
    expect(tn({}, { episode: ep("saving") }).reason).toBe(REASON_EPISODE_OPEN);
    expect(tn({}, { episode: ep("returning") }).reason).toBe(REASON_RETURNING);
    expect(tn({}, { episode: ep("idle") }).disabled).toBe(false);
    expect(tn({ trainer_alive: false }).reason).toBe(REASON_NO_TRAINER);
    expect(tn({ trainer: null }).reason).toBe(REASON_NO_TRAINER);
    expect(tn({ phase: "training" }).reason).toBe("training in progress");
    expect(tn({}, { episode: null, controlDown: true }).reason).toBe(REASON_LINK_DOWN);
    // An observer is told about the ROLE, not a (possibly healthy) link.
    expect(tn({}, { episode: null, readOnly: true }).reason).toBe(REASON_OBSERVER);
    expect(tn({}, { episode: null, readOnly: true, controlDown: true }).reason).toBe(
      REASON_OBSERVER,
    );
  });
  it("newRolloutReason (15-online-dagger §3): the runtime's order — a dead trainer first, then null in rollout, else telemetry's detail or the phase wording", () => {
    expect(newRolloutReason(null)).toBeNull();
    expect(newRolloutReason(makeOnlineDagger())).toBeNull();
    expect(
      newRolloutReason(makeOnlineDagger({ phase: "rollout", detail: "trainer note" })),
    ).toBeNull();
    // `_refuse_locked` checks `trainer_alive` BEFORE the phase, and the phase is a
    // function of the LAST status — it stays `rollout` when the trainer dies. The
    // runtime ships the reason in `detail`; the constant is the fallback.
    expect(
      newRolloutReason(
        makeOnlineDagger({
          phase: "rollout",
          trainer_alive: false,
          detail: "no Online DAgger trainer attached",
        }),
      ),
    ).toBe(REASON_NO_TRAINER);
    expect(newRolloutReason(makeOnlineDagger({ trainer_alive: false, detail: "" }))).toBe(
      REASON_NO_TRAINER,
    );
    expect(newRolloutReason(makeOnlineDagger({ trainer: null, detail: "" }))).toBe(
      REASON_NO_TRAINER,
    );
    expect(
      newRolloutReason(makeOnlineDagger({ phase: "training", trainer_alive: false, detail: "" })),
    ).toBe(REASON_NO_TRAINER);
    expect(
      newRolloutReason(
        makeOnlineDagger({
          phase: "waiting_trainer",
          detail: "waiting for the trainer to report ready (loading the offline pool)",
        }),
      ),
    ).toBe("waiting for the trainer to report ready (loading the offline pool)");
    expect(newRolloutReason(makeOnlineDagger({ phase: "waiting_trainer", detail: "" }))).toBe(
      "waiting for the trainer to report ready",
    );
    expect(newRolloutReason(makeOnlineDagger({ phase: "training", detail: "" }))).toBe(
      "training in progress",
    );
    expect(newRolloutReason(makeOnlineDagger({ phase: "error", detail: "" }))).toBe(
      "trainer error — recover it or end the session",
    );
    expect(Object.keys(PHASE_BLOCK_REASON).sort()).toEqual([
      "error",
      "training",
      "waiting_trainer",
    ]);
  });
  it("banner: dead (missing / lost) or error; freshness is the runtime's call — no UI STALE", () => {
    const banner = (od: Partial<OnlineDaggerStatus>) => onlineDaggerModel(dagger(od), noEp)!.banner;
    expect(banner({})).toBeNull();
    expect(banner({ trainer_alive: false, trainer: null })).toBe(
      "ONLINE DAGGER TRAINER MISSING — no policy node has reported trainer status",
    );
    expect(banner({ trainer_alive: false, trainer_age_s: 12.3 })).toBe(
      "ONLINE DAGGER TRAINER LOST — no status from act_pick_place/trainer for 12 s",
    );
    expect(banner({ phase: "error", detail: "trainer error: session.json unwritable" })).toBe(
      "ONLINE DAGGER TRAINER ERROR — session.json unwritable",
    );
    expect(banner({ trainer: makeTrainerStatus({ state: "error", detail: "cuda OOM" }) })).toBe(
      "ONLINE DAGGER TRAINER ERROR — cuda OOM",
    );
    // `trainer_alive` already folds the runtime's `dora.policy.spec_stale_s` window
    // in (a larger lab window must not make the UI say STALE while the runtime says
    // alive); an old-but-alive status is not a banner.
    expect(banner({ trainer_age_s: 4.2 })).toBeNull();
    expect(banner({ trainer_age_s: 12 })).toBeNull();
  });
  it("fmtMetric: integers verbatim, large to one decimal, else three significant digits", () => {
    expect(fmtMetric(96)).toBe("96");
    expect(fmtMetric(0.0421)).toBe("0.0421");
    expect(fmtMetric(0.115)).toBe("0.115");
    expect(fmtMetric(1234.567)).toBe("1234.6");
    expect(fmtMetric(NaN)).toBe("—");
  });
});

describe("<OnlineDaggerPanel>", () => {
  it("renders header, phase pill, chips, trainer row, generic metrics, actor split and served-keymap hints", () => {
    render(
      <OnlineDaggerPanel
        dagger={dagger({
          trainer: makeTrainerStatus({ metrics: { loss: 0.0421, proj_rate: 0.115, steps: 96 } }),
        })}
        external={makeExternal()}
        episode={null}
        bindings={bindings}
        onAction={vi.fn()}
      />,
    );
    const panel = screen.getByTestId("online-dagger-panel");
    expect(panel.dataset["phase"]).toBe("rollout");
    expect(screen.getByTestId("od-rollouts").textContent).toBe("3 rollouts saved");
    expect(screen.getByTestId("od-phase").textContent).toBe("ROLLOUT");
    expect(screen.getByTestId("od-phase").className).toContain("chip-blue");
    expect(screen.queryByTestId("od-training-progress")).toBeNull();
    expect(screen.getByTestId("dagger-mode-chip").textContent).toBe("POLICY DRIVING");
    expect(screen.getByTestId("external-policy-chip").textContent).toBe("EXTERNAL POLICY attached");
    expect(screen.getByTestId("od-trainer-state").textContent).toBe(
      "ready · act_pick_place/trainer",
    );
    expect(screen.queryByTestId("od-trainer-detail")).toBeNull();
    // Metrics: one row per key, tabular value, in wire order; nothing algorithm-specific.
    expect(screen.getByTestId("od-metrics").dataset["count"]).toBe("3");
    expect(
      Array.from(screen.getByTestId("od-metrics").querySelectorAll(".od-metric")).map(
        (el) => el.textContent,
      ),
    ).toEqual(["loss0.0421", "proj_rate0.115", "steps96"]);
    expect(screen.getByTestId("od-metric-loss").querySelector("dd")?.className).toContain(
      "tabular",
    );
    expect(screen.getByTestId("od-loss-sparkline").tagName).toBe("CANVAS");
    expect(screen.getByTestId("od-expert-frames").textContent).toBe("120 / 480 novice");
    expect(screen.getByTestId("od-policy-version").textContent).toBe("v4");
    // Hints come from the served keymap, never hard-coded.
    expect(screen.getByTestId("od-hints").textContent).toBe(
      "Space takeover toggleN new rolloutEnter keepBackspace discard",
    );
    expect(screen.getByTestId("od-train-now")).toBeEnabled();
    expect(screen.queryByTestId("od-train-now-reason")).toBeNull();
    // No episode open, policy driving: Take over is live (the runtime accepts it at
    // any time), Hand back names its no-op.
    expect(screen.getByTestId("od-takeover")).toBeEnabled();
    expect(screen.getByTestId("od-handback")).toBeDisabled();
    expect(screen.getByTestId("od-gate-reason").textContent).toBe(
      `Hand back: ${REASON_ALREADY_POLICY}`,
    );
    expect(screen.getByTestId("od-handback").getAttribute("aria-describedby")).toBe(
      "od-gate-reason",
    );
  });

  it("one rollout saved reads singular; no metrics reads honestly; the trainer's detail shows", () => {
    render(
      <OnlineDaggerPanel
        dagger={dagger({
          rollouts_saved: 1,
          trainer: makeTrainerStatus({
            state: "preparing",
            metrics: {},
            detail: "loading the offline pool",
          }),
        })}
        episode={null}
        bindings={null}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByTestId("od-rollouts").textContent).toBe("1 rollout saved");
    expect(screen.getByTestId("od-metrics-empty")).toBeInTheDocument();
    expect(screen.getByTestId("od-metrics").dataset["count"]).toBe("0");
    expect(screen.queryByTestId("od-loss-sparkline")).toBeNull(); // no `loss` → no sparkline
    expect(screen.getByTestId("od-trainer-state").dataset["state"]).toBe("preparing");
    expect(screen.getByTestId("od-trainer-detail").textContent).toBe("loading the offline pool");
    expect(screen.getByTestId("od-hints").textContent).toBe(""); // no bindings → no hints
  });

  it("training: accent pill with the thin progressbar from trainer.progress; Train now disabled with the visible reason", () => {
    const { rerender } = render(
      <OnlineDaggerPanel
        dagger={dagger({
          phase: "training",
          trainer: makeTrainerStatus({ state: "training", progress: 0.25, metrics: { loss: 0.2 } }),
        })}
        episode={null}
        bindings={null}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByTestId("od-phase").textContent).toBe("TRAINING 25 %");
    expect(screen.getByTestId("od-phase").className).toContain("chip-accent");
    const bar = screen.getByTestId("od-training-progress");
    expect(bar.getAttribute("role")).toBe("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("25");
    expect(screen.getByTestId("od-train-now")).toBeDisabled();
    expect(screen.getByTestId("od-train-now-reason").textContent).toBe("training in progress");
    // No progress reported: the bar is indeterminate (no aria-valuenow), the pill plain.
    rerender(
      <OnlineDaggerPanel
        dagger={dagger({ phase: "training", trainer: makeTrainerStatus({ state: "training" }) })}
        episode={null}
        bindings={null}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByTestId("od-phase").textContent).toBe("TRAINING");
    expect(screen.getByTestId("od-training-progress").getAttribute("aria-valuenow")).toBeNull();
  });

  it("the N hint greys out (with the reason as its title) while the runtime would refuse a new rollout", () => {
    const { rerender } = render(
      <OnlineDaggerPanel dagger={dagger()} episode={null} bindings={bindings} onAction={vi.fn()} />,
    );
    expect(screen.getByTestId("od-hint-new").className).toBe("");
    expect(screen.getByTestId("od-hint-new").getAttribute("aria-disabled")).toBeNull();
    rerender(
      <OnlineDaggerPanel
        dagger={dagger({ phase: "training", detail: "training in progress (epoch 3/8)" })}
        episode={null}
        bindings={bindings}
        onAction={vi.fn()}
      />,
    );
    const hint = screen.getByTestId("od-hint-new");
    expect(hint.className).toBe("od-hint-off");
    expect(hint.getAttribute("aria-disabled")).toBe("true");
    expect(hint.getAttribute("title")).toBe("training in progress (epoch 3/8)");
    expect(hint.textContent).toBe("N new rollout"); // still listed — the key exists
    expect(screen.getByTestId("od-detail").textContent).toBe("training in progress (epoch 3/8)");
    // A dead trainer in `rollout`: the same grey-out, with the runtime's reason.
    rerender(
      <OnlineDaggerPanel
        dagger={dagger({ trainer_alive: false, detail: "no Online DAgger trainer attached" })}
        episode={null}
        bindings={bindings}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByTestId("od-hint-new").className).toBe("od-hint-off");
    expect(screen.getByTestId("od-hint-new").getAttribute("title")).toBe(REASON_NO_TRAINER);
    expect(screen.getByTestId("od-train-now-reason").textContent).toBe(REASON_NO_TRAINER);
  });

  it("an observer sees every action disabled with the role reason, not 'control link down'", () => {
    render(
      <OnlineDaggerPanel
        dagger={dagger()}
        episode={ep("recording")}
        bindings={bindings}
        onAction={vi.fn()}
        readOnly
        disabled
      />,
    );
    expect(screen.getByTestId("od-takeover")).toBeDisabled();
    expect(screen.getByTestId("od-handback")).toBeDisabled();
    expect(screen.getByTestId("od-gate-reason").textContent).toBe(REASON_OBSERVER);
    expect(screen.getByTestId("od-train-now")).toBeDisabled();
    expect(screen.getByTestId("od-train-now-reason").textContent).toBe(REASON_OBSERVER);
  });

  it("Take over / Hand back send takeover / handback during an episode; the disabled one names its reason", () => {
    const onAction = vi.fn();
    const { rerender } = render(
      <OnlineDaggerPanel
        dagger={dagger()}
        episode={ep("recording")}
        bindings={bindings}
        onAction={onAction}
      />,
    );
    expect(screen.getByTestId("od-takeover")).toBeEnabled();
    expect(screen.getByTestId("od-handback")).toBeDisabled();
    expect(screen.getByTestId("od-gate-reason").textContent).toBe(
      `Hand back: ${REASON_ALREADY_POLICY}`,
    );
    expect(screen.getByTestId("od-takeover").getAttribute("aria-describedby")).toBeNull();
    expect(screen.getByTestId("od-handback").getAttribute("aria-describedby")).toBe(
      "od-gate-reason",
    );
    fireEvent.click(screen.getByTestId("od-takeover"));
    expect(onAction).toHaveBeenCalledWith("takeover");
    // Telemetry flips the chip (no optimistic UI): now Hand back is the live one.
    rerender(
      <OnlineDaggerPanel
        dagger={dagger({}, { control_mode: "human" })}
        episode={ep("recording")}
        bindings={bindings}
        onAction={onAction}
      />,
    );
    expect(screen.getByTestId("dagger-mode-chip").className).toContain("chip-green");
    expect(screen.getByTestId("od-takeover")).toBeDisabled();
    expect(screen.getByTestId("od-handback")).toBeEnabled();
    expect(screen.getByTestId("od-gate-reason").textContent).toBe(
      `Take over: ${REASON_ALREADY_HUMAN}`,
    );
    fireEvent.click(screen.getByTestId("od-handback"));
    expect(onAction).toHaveBeenLastCalledWith("handback");
    // Train now is off while the episode is open — with its reason.
    expect(screen.getByTestId("od-train-now")).toBeDisabled();
    expect(screen.getByTestId("od-train-now-reason").textContent).toBe(REASON_EPISODE_OPEN);
  });

  it("Train now sends train_now; the version note appears on a swap for 1.2 s", () => {
    vi.useFakeTimers();
    try {
      const onAction = vi.fn();
      const { rerender } = render(
        <OnlineDaggerPanel
          dagger={dagger()}
          episode={null}
          bindings={bindings}
          onAction={onAction}
        />,
      );
      fireEvent.click(screen.getByTestId("od-train-now"));
      expect(onAction).toHaveBeenCalledWith("train_now");
      expect(screen.queryByTestId("od-swapped")).toBeNull();
      rerender(
        <OnlineDaggerPanel
          dagger={dagger({ policy_version_acting: 5, rollouts_saved: 4 })}
          episode={null}
          bindings={bindings}
          onAction={onAction}
        />,
      );
      expect(screen.getByTestId("od-swapped").textContent).toBe("swapped");
      expect(screen.getByTestId("od-policy-version").dataset["swapped"]).toBe("true");
      act(() => vi.advanceTimersByTime(SWAPPED_NOTE_MS + 10));
      expect(screen.queryByTestId("od-swapped")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  const pushLoss = (progress: number, loss: number, seq = Math.round(progress * 1000)) =>
    act(() =>
      useStore.getState().setTelemetry(
        makeTelemetry({
          seq,
          dagger: dagger({
            phase: "training",
            trainer: makeTrainerStatus({ state: "training", progress, metrics: { loss } }),
          }),
        }),
      ),
    );

  it("useLossHistory appends one point per new (version, progress, loss) from store telemetry, capped at 60, bumping version only then", () => {
    const hook = renderHook(() => useLossHistory());
    expect(hook.result.current.ring.count).toBe(0);
    expect(hook.result.current.version).toBe(0);
    pushLoss(0.01, 0.5);
    pushLoss(0.02, 0.4);
    pushLoss(0.02, 0.4, 3); // same triple → no new point, no re-render
    expect(hook.result.current.ring.count).toBe(2);
    expect(hook.result.current.version).toBe(2);
    expect(hook.result.current.ring.at(0)).toBe(0.5);
    expect(hook.result.current.ring.at(1)).toBe(0.4);
    for (let i = 3; i < 80; i += 1) pushLoss(i / 100, 1 / i);
    expect(hook.result.current.ring.count).toBe(SPARKLINE_POINTS);
    expect(hook.result.current.ring.at(SPARKLINE_POINTS - 1)).toBe(1 / 79); // newest last
    // A telemetry frame without a loss metric adds nothing.
    act(() =>
      useStore.getState().setTelemetry(
        makeTelemetry({
          seq: 999,
          dagger: dagger({ trainer: makeTrainerStatus({ metrics: { proj_rate: 0.1 } }) }),
        }),
      ),
    );
    expect(hook.result.current.ring.count).toBe(SPARKLINE_POINTS);
    expect(hook.result.current.version).toBe(79); // 2 + 77 appended points, none for the frame above
  });

  it("the sparkline canvas exists only once a loss is known (15-online-dagger §8: a loss metric GETS one); its label says when it is still empty", () => {
    const { rerender } = render(<LossSparkline loss={null} />);
    expect(screen.queryByTestId("od-loss-sparkline")).toBeNull();
    // The trainer reports a loss but no sample has been collected yet: honest label.
    rerender(<LossSparkline loss={0.5} />);
    const canvas = screen.getByTestId("od-loss-sparkline") as HTMLCanvasElement;
    expect(canvas.tagName).toBe("CANVAS");
    expect(canvas.getAttribute("aria-label")).toBe("training loss — no loss reported yet");
    expect(canvas.dataset["count"]).toBe("0");
    pushLoss(0.01, 0.5);
    pushLoss(0.02, 0.4);
    expect(canvas.dataset["count"]).toBe("2");
    expect(canvas.getAttribute("aria-label")).toBe(
      `training loss, last ${SPARKLINE_POINTS} samples`,
    );
    // Once points exist the canvas stays even if the latest status dropped the metric.
    rerender(<LossSparkline loss={null} />);
    expect(screen.getByTestId("od-loss-sparkline").dataset["count"]).toBe("2");
  });
});

describe("<OnlineDaggerBanner>", () => {
  it("renders the red banner only for a dead / stale / erroring trainer", () => {
    const { rerender } = render(<OnlineDaggerBanner dagger={dagger()} />);
    expect(screen.queryByTestId("online-dagger-banner")).toBeNull();
    rerender(<OnlineDaggerBanner dagger={dagger({ trainer_alive: false, trainer_age_s: 8 })} />);
    const banner = screen.getByTestId("online-dagger-banner");
    expect(banner.className).toBe("banner banner-red");
    expect(banner.textContent).toContain("TRAINER LOST");
    expect(banner.getAttribute("role")).toBe("alert");
    rerender(<OnlineDaggerBanner dagger={dagger(null)} />);
    expect(screen.queryByTestId("online-dagger-banner")).toBeNull();
  });
});
