/** OnlineDaggerSheet (phase-14; 15-online-dagger §8 / §11 "ui"): two views behind a
 * segmented step header (both mounted, one visible, tab ↔ panel labelled both
 * ways), the trainer status card read from the SESSION-LESS `telemetry.external`
 * fields (`capabilities`, `trainer_status`) and connection facts with copy buttons,
 * the skill one-liner + SKILL.md disclosure, the form's gating reasons (name,
 * return target, trainer attached / capable — an erroring trainer is a caption, not
 * a refusal), the resume pill (+ the explicit Resume checkbox when the listing cannot
 * be trusted), the task prefill following the picked session, the two Advanced
 * gates, a 409 shown in place and the sessions re-read after it (resume pill →
 * `resume: true`) — and NO dataset picker / hyper-parameter anywhere. */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeDatasetLayout,
  makeDoraInfo,
  makeExternal,
  makeOnlineDagger,
  makeOnlineDaggerSession,
  makeTrainerExternal,
  makeTrainerStatus,
} from "../../tests/mocks/fixtures";
import type { OnlineDaggerSessionInfo, SessionSpec } from "../gen";
import { REASON, type LandingSelection } from "../lib/launch";
import { COPIED_MS } from "./CopyButton";
import {
  OnlineDaggerSheet,
  skillInstallCommand,
  TRAINER_CAPABILITY,
  trainerAttached,
  trainerCapability,
  trainerErrorDetail,
  trainerPill,
  trainerStatusOf,
} from "./OnlineDaggerSheet";

const sel: LandingSelection = {
  tab: "sim",
  kind: "sim",
  arms: ["grip", "view"],
  frames: { grip: "arm_base:grip", view: "arm_base:view" },
  simScene: "mavis_v2",
  twinScene: null,
  startFrom: "keep_current",
  profileId: null,
  task: "",
  policyId: null,
  keymapOk: true,
  policiesAvailable: false,
  hardwareReady: false,
  hardwareConfigured: false,
};
const runtime = { origin: "http://192.168.0.88:8765", note: null };

interface MockApi {
  dora?: ReturnType<typeof makeDoraInfo> | 404;
  skill?: string | 404;
  sessions?: OnlineDaggerSessionInfo[];
  /** GET /api/online_dagger/sessions answers 500 (the listing cannot be trusted). */
  sessionsFail?: boolean;
  /** POST /api/session answers 409 with this detail (once when `session409Once`). */
  session409?: string;
  session409Once?: boolean;
  /** What GET /api/online_dagger/sessions returns AFTER a 409 was served (another
   * client / an earlier bring-up created the session meanwhile). */
  sessionsAfter409?: OnlineDaggerSessionInfo[];
}
const posts: SessionSpec[] = [];
let sessionsFetches = 0;
function installFetch(api: MockApi = {}) {
  posts.length = 0;
  sessionsFetches = 0;
  let conflicted = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status });
      if (url === "/api/dora")
        return api.dora === 404
          ? json({ detail: "Not Found" }, 404)
          : json(api.dora ?? makeDoraInfo());
      if (url === "/api/online_dagger/skill")
        return api.skill === 404
          ? json({ detail: "Not Found" }, 404)
          : new Response(api.skill ?? "# mavis-online-dagger-trainer\nInstall…", { status: 200 });
      if (url === "/api/online_dagger/sessions") {
        sessionsFetches += 1;
        if (api.sessionsFail) return json({ detail: "sessions root unreadable" }, 500);
        return json(
          conflicted && api.sessionsAfter409 ? api.sessionsAfter409 : (api.sessions ?? []),
        );
      }
      if (url === "/api/session" && init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)) as SessionSpec);
        if (api.session409 && !(api.session409Once && conflicted)) {
          conflicted = true;
          return json({ detail: api.session409 }, 409);
        }
        return json({
          session_id: "s-od",
          epoch: "e1",
          mode: "dagger",
          arms: ["grip", "view"],
          streams: ["sim"],
          state: "running",
        });
      }
      throw new Error(`unmocked fetch ${url}`);
    }),
  );
}

/** Default mount: a trainer-capable node attached and idle. */
const mount = (over: Partial<React.ComponentProps<typeof OnlineDaggerSheet>> = {}) => {
  const onLaunched = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <OnlineDaggerSheet
      sel={sel}
      cameras={[]}
      layout={makeDatasetLayout()}
      external={makeTrainerExternal()}
      hasInitialCondition
      runtime={runtime}
      onLaunched={onLaunched}
      onClose={onClose}
      {...over}
    />,
  );
  return { ...utils, onLaunched, onClose };
};

/** Fill the form so only the trainer state decides. */
function fillForm(name = "pick_cube_v1", task = "pick the cube") {
  fireEvent.click(screen.getByTestId("od-continue"));
  fireEvent.change(screen.getByTestId("od-session-name"), { target: { value: name } });
  fireEvent.change(screen.getByTestId("od-task"), { target: { value: task } });
}

beforeEach(() => installFetch());
afterEach(() => vi.unstubAllGlobals());

describe("pure helpers", () => {
  it("skillInstallCommand / trainerAttached / trainerCapability (typed, session-less)", () => {
    expect(TRAINER_CAPABILITY).toBe("online_dagger");
    expect(skillInstallCommand("http://h:8765")).toBe(
      "curl -s http://h:8765/api/online_dagger/skill.tgz | tar xz -C ~/.claude/skills/",
    );
    expect(trainerAttached(makeExternal())).toBe(true);
    expect(trainerAttached(makeExternal({ policy_attached: false }))).toBe(false);
    expect(trainerAttached(makeExternal({ state: "detached" }))).toBe(false);
    expect(trainerAttached(null)).toBe(false);
    // `telemetry.external.capabilities` is the fresh spec's list (phase-14): a plain
    // policy node reports [] → false; a trainer node lists online_dagger → true.
    expect(trainerCapability(makeExternal(), null)).toBe(false);
    expect(trainerCapability(makeExternal({ capabilities: ["online_dagger"] }), null)).toBe(true);
    expect(trainerCapability(makeTrainerExternal(), null)).toBe(true);
    // Only a runtime that predates the field leaves it unknown.
    expect(trainerCapability(makeExternal({ capabilities: undefined }), null)).toBeNull();
    expect(trainerCapability(null, null)).toBeNull();
    // A RUNNING Online DAgger session's trainer block is proof enough.
    expect(trainerCapability(makeExternal(), makeOnlineDagger())).toBe(true);
  });
  it("trainerStatusOf / trainerErrorDetail: the session-less heartbeat first, then a running session's copy", () => {
    const ext = makeTrainerExternal();
    expect(trainerStatusOf(ext, null)).toBe(ext.trainer_status);
    expect(trainerStatusOf(makeExternal(), makeOnlineDagger())?.state).toBe("ready");
    expect(trainerStatusOf(ext, makeOnlineDagger())).toBe(ext.trainer_status); // external wins
    expect(trainerStatusOf(null, null)).toBeNull();
    expect(trainerErrorDetail(null)).toBeNull();
    expect(trainerErrorDetail(makeTrainerStatus())).toBeNull();
    expect(trainerErrorDetail(makeTrainerStatus({ state: "training", detail: "epoch 2" }))).toBe(
      null,
    );
    expect(trainerErrorDetail(makeTrainerStatus({ state: "error", detail: "cuda OOM" }))).toBe(
      "cuda OOM",
    );
    expect(trainerErrorDetail(makeTrainerStatus({ state: "error" }))).toBe("");
  });
  it("trainerPill: heartbeat (id · capability · state, error detail), capability-only, none, unknown", () => {
    // Session-less heartbeat from telemetry.external (the runtime always fills it).
    expect(trainerPill(makeTrainerExternal(), null)).toEqual({
      tone: "ok",
      label: "Trainer act_pick_place/trainer · online_dagger · idle",
    });
    expect(trainerPill(makeTrainerExternal({}, { state: "preparing" }), null).label).toBe(
      "Trainer act_pick_place/trainer · online_dagger · preparing",
    );
    expect(
      trainerPill(makeTrainerExternal({}, { state: "error", detail: "cuda OOM" }), null),
    ).toEqual({
      tone: "warn",
      label: "Trainer act_pick_place/trainer · online_dagger · error — cuda OOM",
    });
    // A heartbeat from a node whose spec does NOT list the capability says so.
    expect(trainerPill(makeTrainerExternal({ capabilities: [] }), null).label).toBe(
      "Trainer act_pick_place/trainer · no online_dagger capability · idle",
    );
    // A running session's verbatim copy when the external block carries none.
    expect(trainerPill(makeExternal(), makeOnlineDagger()).label).toBe(
      "Trainer act_pick_place/trainer · online_dagger · ready",
    );
    // No heartbeat yet: the capability alone.
    expect(trainerPill(makeExternal({ capabilities: ["online_dagger"] }), null)).toEqual({
      tone: "ok",
      label: "Trainer · online_dagger capability",
    });
    expect(trainerPill(makeExternal(), null)).toEqual({
      tone: "warn",
      label: "Trainer · no online_dagger capability",
    });
    expect(trainerPill(null, null)).toEqual({ tone: "warn", label: "Trainer · none attached" });
    expect(trainerPill(makeExternal({ policy_attached: false }), null).label).toBe(
      "Trainer · none attached",
    );
    // Only a pre-phase-14 runtime (no `capabilities` field at all) is "unknown".
    expect(trainerPill(makeExternal({ capabilities: undefined }), null)).toEqual({
      tone: "plain",
      label: "Trainer · capability unknown (this runtime predates telemetry.external.capabilities)",
    });
  });
});

describe("<OnlineDaggerSheet>", () => {
  it("opens on Connect: both views mounted, one visible; the step header switches data-view; Continue is never gated", async () => {
    mount({ external: null });
    const panel = screen.getByTestId("online-dagger-panel");
    expect(panel.dataset["view"]).toBe("connect");
    expect(document.getElementById("od-view-connect")).toBeVisible();
    expect(screen.getByTestId("od-view-configure")).not.toBeVisible(); // mounted, hidden
    expect(screen.getByTestId("od-session-name")).toBeInTheDocument();
    expect(screen.getByTestId("od-continue")).toBeEnabled();
    expect(document.activeElement).toBe(screen.getByTestId("od-continue"));
    expect(screen.getByTestId("od-start-caption").dataset["attached"]).toBe("false");
    // No bridge: the honest chip + detail, trainer pill warns.
    expect(screen.getByTestId("external-policy-chip-none").textContent).toBe(
      "EXTERNAL POLICY none",
    );
    expect(screen.getByTestId("od-external-detail").textContent).toContain(
      "telemetry.external absent",
    );
    expect(screen.getByTestId("od-trainer-pill").dataset["tone"]).toBe("warn");
    fireEvent.click(screen.getByTestId("online-dagger-step-2"));
    expect(panel.dataset["view"]).toBe("configure");
    expect(screen.getByTestId("od-view-connect")).not.toBeVisible();
    expect(document.activeElement).toBe(screen.getByTestId("od-session-name"));
    fireEvent.click(screen.getByTestId("od-back"));
    expect(panel.dataset["view"]).toBe("connect");
    // "Sheet width wide" (§8): the 640 px variable sits on the host <dialog>.
    expect(screen.getByTestId("online-dagger-sheet").style.getPropertyValue("--sheet-width")).toBe(
      "640px",
    );
    // Tab ↔ panel labelled both ways (aria-controls / aria-labelledby).
    const tab1 = screen.getByTestId("online-dagger-step-1");
    const tab2 = screen.getByTestId("online-dagger-step-2");
    expect(tab1.id).toBe("od-tab-connect");
    expect(tab1.getAttribute("aria-controls")).toBe("od-view-connect");
    expect(screen.getByTestId("od-view-connect").getAttribute("aria-labelledby")).toBe(tab1.id);
    expect(screen.getByTestId("od-view-configure").getAttribute("aria-labelledby")).toBe(tab2.id);
  });

  it("Connect: external chip, connection facts with copy buttons, one-liner, SKILL.md disclosure, three steps naming the trainer as the algorithm's home", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mount();
      expect(screen.getByTestId("external-policy-chip").textContent).toBe(
        "EXTERNAL POLICY attached",
      );
      // The session-less heartbeat: id, capability, state — before any session.
      expect(screen.getByTestId("od-trainer-pill").textContent).toBe(
        "Trainer act_pick_place/trainer · online_dagger · idle",
      );
      expect(screen.getByTestId("od-trainer-pill").dataset["tone"]).toBe("ok");
      expect(screen.getByTestId("od-facts-loading")).toBeInTheDocument();
      const bind = await screen.findByTestId("od-fact-bind_host");
      expect(bind.textContent).toContain("192.168.0.88");
      expect(screen.getByTestId("od-fact-daemon_port").textContent).toContain("53391");
      expect(screen.getByTestId("od-fact-zenoh_connect").textContent).toContain(
        "tcp/192.168.0.88:7447",
      );
      fireEvent.click(screen.getByTestId("copy-zenoh_connect"));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith("tcp/192.168.0.88:7447"));
      await waitFor(() =>
        expect(screen.getByTestId("copy-zenoh_connect").dataset["state"]).toBe("copied"),
      );
      expect(screen.getByTestId("copy-zenoh_connect").textContent).toContain("Copied");
      act(() => vi.advanceTimersByTime(COPIED_MS + 10));
      expect(screen.getByTestId("copy-zenoh_connect").dataset["state"]).toBe("idle");
      // One-liner from the RUNTIME origin (never a hard-coded port), copyable.
      expect(screen.getByTestId("skill-oneliner").textContent).toBe(
        "curl -s http://192.168.0.88:8765/api/online_dagger/skill.tgz | tar xz -C ~/.claude/skills/",
      );
      expect(screen.queryByTestId("od-origin-note")).toBeNull();
      fireEvent.click(screen.getByTestId("skill-copy"));
      await waitFor(() =>
        expect(writeText).toHaveBeenCalledWith(
          "curl -s http://192.168.0.88:8765/api/online_dagger/skill.tgz | tar xz -C ~/.claude/skills/",
        ),
      );
      // SKILL.md in the disclosure's scrollable pre.
      await waitFor(() =>
        expect(screen.getByTestId("skill-preview").textContent).toContain(
          "mavis-online-dagger-trainer",
        ),
      );
      expect(screen.getByTestId("skill-preview").tagName).toBe("PRE");
      expect(screen.getByTestId("skill-preview").className).toContain("code-block");
      const how = screen.getByTestId("od-how");
      expect(how.querySelectorAll("li")).toHaveLength(3);
      expect(how.textContent).toContain("lives in your trainer");
      expect(how.textContent).toContain("online_dagger");
    } finally {
      vi.useRealTimers();
      Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    }
  });

  it("Connect degrades honestly: /api/dora 404, skill 404, dev-proxy note, bridge disabled", async () => {
    installFetch({ dora: 404, skill: 404 });
    mount({
      runtime: { origin: "http://192.168.0.88:8765", note: "Dev server: /api is proxied…" },
      external: makeExternal({ enabled: false, state: "disabled" }),
    });
    expect((await screen.findByTestId("od-facts-error")).textContent).toContain("404");
    await waitFor(() =>
      expect(screen.getByTestId("skill-preview").textContent).toContain("does not serve the skill"),
    );
    expect(screen.getByTestId("skill-preview").textContent).toContain("/api/online_dagger/skill");
    expect(screen.getByTestId("od-origin-note").textContent).toContain("Dev server");
    expect(screen.getByTestId("od-external-detail").textContent).toContain("dora.enabled: false");
  });

  it("Configure: reasons in order (task → name), path preview, Start posts the EXACT spec — no dataset, no policy, no hyper-parameter", async () => {
    const { onLaunched } = mount();
    fireEvent.click(screen.getByTestId("od-continue"));
    const confirm = screen.getByTestId("launch-confirm");
    expect(confirm.textContent).toBe("Start Online DAgger");
    expect(confirm).toBeDisabled();
    expect(screen.getByTestId("launch-reason").textContent).toBe(REASON.noTask);
    fireEvent.change(screen.getByTestId("od-task"), { target: { value: "sort" } });
    expect(screen.getByTestId("launch-reason").textContent).toBe(REASON.sessionName);
    fireEvent.change(screen.getByTestId("od-session-name"), { target: { value: "run 1" } });
    expect(screen.getByTestId("od-path-preview").textContent).toBe(
      "/home/x/data/online_dagger/run_1",
    );
    expect(screen.getByTestId("od-path-preview").dataset["layout"]).toBe("loaded");
    // Nothing algorithm-shaped is offered (operator decision 2026-09-08).
    expect(document.querySelector("[data-testid^='od-offline']")).toBeNull();
    expect(document.querySelector("input[type=radio]")).toBeNull();
    expect(screen.queryByTestId("od-replay-buffer")).toBeNull();
    const form = screen.getByTestId("od-session").closest("form")!;
    const numberInputs = Array.from(form.querySelectorAll("input[type=number]")).map(
      (el) => (el as HTMLElement).dataset["testid"],
    );
    expect(numberInputs.every((id) => id?.startsWith("action-filter-"))).toBe(true); // filter only
    await waitFor(() => expect(confirm).toBeEnabled());
    expect(screen.queryByTestId("launch-reason")).toBeNull();
    fireEvent.click(confirm);
    await waitFor(() => expect(onLaunched).toHaveBeenCalledTimes(1));
    expect(posts[0]).toEqual({
      mode: "dagger",
      kind: "sim",
      arms: ["grip", "view"],
      frames: { grip: "arm_base:grip", view: "arm_base:view" },
      sim_scene: "mavis_v2",
      start_from: "keep_current",
      task: "sort",
      action_filter: {
        enabled: true,
        pos_eps_m: 0.001,
        rot_eps_rad: 0.001,
        gripper_eps_frac: 0.01,
        rail_eps_m: 0.001,
        gripper_context_s: 1.6,
      },
      policy_source: "external",
      online_dagger: {
        session_name: "run_1",
        resume: false,
        pause_while_training: true,
        wait_for_trainer_ready: true,
      },
      return_to_start: true,
    });
    expect(posts[0]).not.toHaveProperty("dataset");
    expect(posts[0]).not.toHaveProperty("policy");
  });

  it("Configure: the Advanced gates, the recording rows and the frames reach the spec", async () => {
    mount();
    fillForm();
    fireEvent.click(screen.getByTestId("od-pause-training"));
    fireEvent.click(screen.getByTestId("od-wait-ready"));
    fireEvent.click(screen.getByTestId("action-filter"));
    fireEvent.click(screen.getByTestId("return-to-start"));
    fireEvent.change(screen.getByTestId("frame-selector-grip"), { target: { value: "world" } });
    fireEvent.click(screen.getByTestId("launch-confirm"));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      frames: { grip: "world", view: "arm_base:view" },
      return_to_start: false,
      action_filter: { enabled: false },
      online_dagger: {
        session_name: "pick_cube_v1",
        resume: false,
        pause_while_training: false,
        wait_for_trainer_ready: false,
      },
    });
  });

  it("trainer gating: no trainer / no capability / return target; the sheet lists existing sessions and resumes (task carried over)", async () => {
    installFetch({
      sessions: [
        makeOnlineDaggerSession(),
        makeOnlineDaggerSession({ session_name: "other", rollouts: 1, task: "stack" }),
      ],
    });
    const { rerender } = mount({ external: makeExternal({ policy_attached: false }) });
    fillForm("fresh");
    await screen.findByTestId("od-sessions");
    expect(screen.getByTestId("launch-confirm")).toBeDisabled();
    expect(screen.getByTestId("launch-reason").textContent).toBe(REASON.noTrainer);
    // A plain policy node (capabilities: [] — the runtime always fills the list).
    rerender(
      <OnlineDaggerSheet
        sel={sel}
        cameras={[]}
        layout={makeDatasetLayout()}
        external={makeExternal()}
        hasInitialCondition
        runtime={runtime}
        onLaunched={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId("launch-reason").textContent).toBe(REASON.trainerNoCapability);
    expect(screen.getByTestId("od-trainer-pill").textContent).toContain(
      "no online_dagger capability",
    );
    expect(screen.getByTestId("od-trainer-pill").dataset["tone"]).toBe("warn");
    rerender(
      <OnlineDaggerSheet
        sel={sel}
        cameras={[]}
        layout={makeDatasetLayout()}
        external={makeTrainerExternal()}
        hasInitialCondition={false}
        runtime={runtime}
        onLaunched={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId("launch-reason").textContent).toBe(REASON.returnNeedsProfile);
    expect(screen.getByTestId("return-to-start-reason")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("return-to-start"));
    expect(screen.getByTestId("launch-confirm")).toBeEnabled();
    // Existing sessions: a chip fills the name; the resume pill follows; the typed
    // task stays (the operator typed first), so nothing is overwritten.
    fireEvent.click(screen.getByTestId("od-session-other"));
    expect((screen.getByTestId("od-session-name") as HTMLInputElement).value).toBe("other");
    expect(screen.getByTestId("od-resume").textContent).toBe("Resume (1 rollout saved)");
    expect(screen.getByTestId("od-session-other").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("od-session-other").getAttribute("title")).toBe(
      "/home/x/data/online_dagger/pick_cube_v1 · stack",
    );
    expect((screen.getByTestId("od-task") as HTMLInputElement).value).toBe("pick the cube");
    expect(screen.getByTestId("launch-confirm")).toBeEnabled();
    fireEvent.click(screen.getByTestId("launch-confirm"));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]?.online_dagger).toEqual({
      session_name: "other",
      resume: true,
      pause_while_training: true,
      wait_for_trainer_ready: true,
    });
  });

  it("a resumed session prefills the task until the operator types one; the prefill follows the name — another session refills, a NEW name clears it", async () => {
    installFetch({
      sessions: [
        makeOnlineDaggerSession({ task: "pick the cube" }),
        makeOnlineDaggerSession({ session_name: "stack_v2", rollouts: 2, task: "stack" }),
        makeOnlineDaggerSession({ session_name: "untitled", rollouts: 1, task: null }),
      ],
    });
    const { onLaunched } = mount();
    fireEvent.click(screen.getByTestId("od-continue"));
    await screen.findByTestId("od-sessions");
    const task = () => (screen.getByTestId("od-task") as HTMLInputElement).value;
    fireEvent.change(screen.getByTestId("od-session-name"), { target: { value: "pick_cube_v1" } });
    await waitFor(() => expect(task()).toBe("pick the cube"));
    expect(screen.getByTestId("od-resume").textContent).toBe("Resume (6 rollouts saved)");
    // Another existing session: ITS task replaces the prefill.
    fireEvent.change(screen.getByTestId("od-session-name"), { target: { value: "stack_v2" } });
    await waitFor(() => expect(task()).toBe("stack"));
    // One without a task: nothing borrowed from the previous session.
    fireEvent.change(screen.getByTestId("od-session-name"), { target: { value: "untitled" } });
    await waitFor(() => expect(task()).toBe(""));
    fireEvent.change(screen.getByTestId("od-session-name"), { target: { value: "pick_cube_v1" } });
    await waitFor(() => expect(task()).toBe("pick the cube"));
    // A NEW name: the resume pill goes AND the prefilled task goes with it — a new
    // session must never be created with another session's task silently.
    fireEvent.change(screen.getByTestId("od-session-name"), { target: { value: "brand_new" } });
    expect(screen.queryByTestId("od-resume")).toBeNull();
    await waitFor(() => expect(task()).toBe(""));
    expect(screen.getByTestId("launch-reason").textContent).toBe(REASON.noTask);
    // Typed by hand → kept whatever the name does; cleared by hand → prefilled again.
    fireEvent.change(screen.getByTestId("od-task"), { target: { value: "sort" } });
    fireEvent.change(screen.getByTestId("od-session-name"), { target: { value: "pick_cube_v1" } });
    expect(task()).toBe("sort");
    fireEvent.change(screen.getByTestId("od-task"), { target: { value: "" } });
    await waitFor(() => expect(task()).toBe("pick the cube"));
    fireEvent.click(screen.getByTestId("launch-confirm"));
    await waitFor(() => expect(onLaunched).toHaveBeenCalledTimes(1));
    expect(posts[0]).toMatchObject({
      task: "pick the cube",
      online_dagger: { session_name: "pick_cube_v1", resume: true },
    });
  });

  it("an erroring trainer: warn pill with the detail and a WARNING caption — Start stays possible (the runtime does not 409; a new session is the recovery path)", async () => {
    const { onLaunched } = mount({
      external: makeTrainerExternal({}, { state: "error", detail: "cuda OOM" }),
    });
    const pill = screen.getByTestId("od-trainer-pill");
    expect(pill.dataset["tone"]).toBe("warn");
    expect(pill.textContent).toBe(
      "Trainer act_pick_place/trainer · online_dagger · error — cuda OOM",
    );
    expect(screen.getByTestId("od-start-caption").textContent).toBe(
      "Trainer reports an error — you can start, but check the policy node: cuda OOM",
    );
    fillForm();
    await waitFor(() => expect(screen.getByTestId("launch-confirm")).toBeEnabled());
    expect(screen.queryByTestId("launch-reason")).toBeNull();
    fireEvent.click(screen.getByTestId("launch-confirm"));
    await waitFor(() => expect(onLaunched).toHaveBeenCalledTimes(1));
    expect(posts).toHaveLength(1);
  });

  it("an over-long name: Start disabled with the schema's reason, the slug shown untruncated, nothing posted", async () => {
    mount();
    fillForm("a".repeat(65));
    expect(screen.getByTestId("od-path-preview").textContent).toBe(
      `/home/x/data/online_dagger/${"a".repeat(65)}`,
    );
    expect(screen.getByTestId("launch-confirm")).toBeDisabled();
    expect(screen.getByTestId("launch-reason").textContent).toBe(
      "Session name must be at most 64 characters",
    );
    fireEvent.submit(screen.getByTestId("od-session").closest("form")!);
    expect(posts).toHaveLength(0);
  });

  it("a 409 shows its detail inside the sheet, which stays open and retryable", async () => {
    installFetch({
      session409:
        "Online DAgger session 'pick_cube_v1' already exists - resume it or pick another name",
    });
    const { onLaunched, onClose } = mount();
    fillForm();
    fireEvent.click(screen.getByTestId("launch-confirm"));
    const err = await screen.findByTestId("launch-error");
    expect(err.getAttribute("role")).toBe("alert");
    expect(err.className).toContain("sheet-error");
    expect(err.textContent).toContain("already exists");
    expect(onLaunched).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("launch-confirm")).toBeEnabled();
    expect(screen.getByTestId("online-dagger-panel").dataset["view"]).toBe("configure");
  });

  it("409 'already exists' → the sessions are re-read, the resume pill appears and the next Start resumes", async () => {
    installFetch({
      session409:
        "Online DAgger session 'pick_cube_v1' already exists - resume it or pick another name",
      session409Once: true,
      sessions: [],
      sessionsAfter409: [makeOnlineDaggerSession({ rollouts: 2 })],
    });
    const { onLaunched } = mount();
    // Read once on mount and again when the form comes into view.
    await waitFor(() => expect(sessionsFetches).toBe(1));
    fillForm();
    await waitFor(() => expect(sessionsFetches).toBe(2));
    expect(screen.queryByTestId("od-resume")).toBeNull();
    fireEvent.click(screen.getByTestId("launch-confirm"));
    await screen.findByTestId("launch-error");
    expect(posts[0]?.online_dagger?.resume).toBe(false);
    // The 409 triggers a re-read; the runtime's view of the disk now shows the session.
    await waitFor(() => expect(sessionsFetches).toBe(3));
    expect((await screen.findByTestId("od-resume")).textContent).toBe("Resume (2 rollouts saved)");
    expect(screen.getByTestId("launch-confirm")).toBeEnabled();
    fireEvent.click(screen.getByTestId("launch-confirm"));
    await waitFor(() => expect(onLaunched).toHaveBeenCalledTimes(1));
    expect(posts).toHaveLength(2);
    expect(posts[1]?.online_dagger).toMatchObject({ session_name: "pick_cube_v1", resume: true });
  });

  it("409 'already exists' while the listing FAILS → the explicit Resume checkbox carries resume: true; no checkbox for a name the runtime knows is new", async () => {
    installFetch({
      sessionsFail: true,
      session409:
        "Online DAgger session 'pick_cube_v1' already exists - resume it or pick another name",
      session409Once: true,
    });
    const { onLaunched } = mount();
    fillForm();
    // The listing failed: said so, and the checkbox is offered for any typed name.
    expect((await screen.findByTestId("od-sessions-error")).textContent).toContain(
      "500 sessions root unreadable",
    );
    expect(screen.queryByTestId("od-sessions")).toBeNull();
    expect(screen.queryByTestId("od-resume")).toBeNull();
    expect(screen.getByTestId("od-resume-existing")).not.toBeChecked();
    fireEvent.click(screen.getByTestId("launch-confirm"));
    const err = await screen.findByTestId("launch-error");
    expect(err.textContent).toContain("already exists");
    expect(posts[0]?.online_dagger?.resume).toBe(false);
    // The re-read fails again — the pill can never appear, but the checkbox can.
    await waitFor(() => expect(sessionsFetches).toBe(3));
    expect(screen.queryByTestId("od-resume")).toBeNull();
    fireEvent.click(screen.getByTestId("od-resume-existing"));
    expect(screen.getByTestId("od-resume-existing")).toBeChecked();
    fireEvent.click(screen.getByTestId("launch-confirm"));
    await waitFor(() => expect(onLaunched).toHaveBeenCalledTimes(1));
    expect(posts).toHaveLength(2);
    expect(posts[1]?.online_dagger).toMatchObject({ session_name: "pick_cube_v1", resume: true });
  });

  it("with a healthy listing the checkbox appears only for the name the runtime 409ed — never for one it knows is new (resume of a missing name is its own 409)", async () => {
    installFetch({
      session409:
        "Online DAgger session 'pick_cube_v1' already exists - resume it or pick another name",
      sessions: [],
    });
    mount();
    fillForm();
    await waitFor(() => expect(sessionsFetches).toBe(2));
    expect(screen.queryByTestId("od-resume-existing")).toBeNull();
    fireEvent.click(screen.getByTestId("launch-confirm"));
    await screen.findByTestId("launch-error");
    await waitFor(() => expect(sessionsFetches).toBe(3));
    // The listing still lacks the name (it lagged): the operator can insist.
    expect(screen.getByTestId("od-resume-existing")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("od-resume-existing"));
    // Another name: the runtime never complained about it → no checkbox, resume false.
    fireEvent.change(screen.getByTestId("od-session-name"), { target: { value: "other_name" } });
    expect(screen.queryByTestId("od-resume-existing")).toBeNull();
    fireEvent.click(screen.getByTestId("launch-confirm"));
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1]?.online_dagger).toMatchObject({ session_name: "other_name", resume: false });
  });

  it("Cancel / Escape / × ask the owner to close", () => {
    const { onClose } = mount();
    fireEvent.click(screen.getByTestId("launch-cancel"));
    fireEvent.click(screen.getByTestId("online-dagger-close"));
    fireEvent.keyDown(screen.getByTestId("online-dagger-sheet"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
