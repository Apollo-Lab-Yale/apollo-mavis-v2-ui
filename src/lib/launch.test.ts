/** Online DAgger launch logic (phase-14; 15-online-dagger §5 / §8): the form defaults
 * against the vendored `OnlineDaggerConfig` schema, `onlineDaggerToSpec` (exact wire
 * body — a pure rename that throws on an over-long name), the session slug, the
 * folder previews from the dataset layout, the dagger branch of `validateLaunch`
 * (reason order; an erroring trainer is a caption, never a refusal) and `buildSpec`
 * for dagger —
 * which carries `policy_source: "external"` + `online_dagger` + `action_filter` +
 * `return_to_start` and never `dataset` / `policy` / a hyper-parameter. */
import { describe, expect, it } from "vitest";
import onlineDaggerSchema from "../../schemas/OnlineDaggerConfig.json";
import { makeDatasetLayout } from "../../tests/mocks/fixtures";
import {
  buildSpec,
  datasetFolderPreview,
  DEFAULT_ONLINE_DAGGER,
  launcherReason,
  namespaceRoot,
  ONLINE_DAGGER_NAMESPACE,
  onlineDaggerFolderPreview,
  onlineDaggerToSpec,
  REASON,
  SESSION_MAX_LENGTH,
  SESSION_PATTERN,
  sessionNameReason,
  slugSession,
  TRAINER_ERROR_WARNING,
  trainerErrorWarning,
  validateLaunch,
  DEFAULT_GELLO_VIEWPOINT,
  gelloPreviewReason,
  type GelloInputs,
  type LandingSelection,
  type OnlineDaggerInputs,
} from "./launch";

const simSel: LandingSelection = {
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
const hwSel: LandingSelection = {
  ...simSel,
  tab: "hardware",
  kind: "hardware",
  simScene: null,
  twinScene: "mavis_v2",
  hardwareReady: true,
  hardwareConfigured: true,
};
const form: OnlineDaggerInputs = { ...DEFAULT_ONLINE_DAGGER, sessionName: "pick cube v1" };
/** A complete, launchable Online DAgger selection. */
const odSel: LandingSelection = {
  ...simSel,
  task: "pick the cube",
  onlineDagger: form,
  hasInitialCondition: true,
  trainerAttached: true,
  trainerCapability: null,
};

describe("Online DAgger defaults and serialisation", () => {
  it("DEFAULT_ONLINE_DAGGER matches every default of the vendored OnlineDaggerConfig schema", () => {
    const props: Record<string, object> = onlineDaggerSchema.properties;
    const spec = onlineDaggerToSpec({ ...DEFAULT_ONLINE_DAGGER, sessionName: "x" });
    for (const [key, prop] of Object.entries(props)) {
      if (!("default" in prop)) continue;
      expect(spec[key as keyof typeof spec], key).toEqual(prop.default);
    }
    expect(DEFAULT_ONLINE_DAGGER).toEqual({
      sessionName: "",
      resume: false,
      pauseWhileTraining: true,
      waitForTrainerReady: true,
    });
  });

  it("onlineDaggerToSpec emits EXACTLY the schema's properties — core forbids extras (additionalProperties: false → 422); no hyper-parameter travels", () => {
    const schema: { additionalProperties?: boolean; properties: Record<string, unknown> } =
      onlineDaggerSchema;
    expect(schema.additionalProperties).toBe(false);
    expect(Object.keys(schema.properties).sort()).toEqual([
      "pause_while_training",
      "resume",
      "session_name",
      "wait_for_trainer_ready",
    ]);
    const spec = onlineDaggerToSpec(form);
    expect(Object.keys(spec).sort()).toEqual(Object.keys(schema.properties).sort());
    // no key is dropped as undefined either (JSON.stringify would silently omit it)
    expect(Object.keys(JSON.parse(JSON.stringify(spec)) as object).sort()).toEqual(
      Object.keys(schema.properties).sort(),
    );
  });

  it("slugSession follows the schema's SLUG_RE: separators → _, no leading separator, case kept", () => {
    expect(SESSION_PATTERN).toBe("^[A-Za-z0-9][A-Za-z0-9_\\-]*$");
    expect(slugSession("pick cube v1")).toBe("pick_cube_v1");
    expect(slugSession("Pick-Cube")).toBe("Pick-Cube");
    expect(slugSession("  __x")).toBe("x");
    expect(slugSession("!!!")).toBe("");
    expect(slugSession("")).toBe("");
  });

  it("the session name's length cap is READ from the schema (maxLength 64): the slug is never truncated, sessionNameReason refuses past it", () => {
    expect(SESSION_MAX_LENGTH).toBe(64);
    const ok = "a".repeat(64);
    const long = "a".repeat(65);
    expect(slugSession(ok)).toBe(ok);
    expect(slugSession(long)).toBe(long); // the operator sees what would be posted
    expect(slugSession(`${ok} `)).toBe(ok); // trimming first: 64 kept
    expect(sessionNameReason(ok)).toBeNull();
    expect(sessionNameReason(long)).toBe(REASON.sessionNameTooLong);
    expect(REASON.sessionNameTooLong).toBe("Session name must be at most 64 characters");
    expect(sessionNameReason("")).toBe(REASON.sessionName);
    expect(sessionNameReason("!!!")).toBe(REASON.sessionName);
    expect(sessionNameReason("pick cube v1")).toBeNull();
    // 65 characters of junk that slug down to 64 are fine — the SLUG is judged
    expect(sessionNameReason(`${ok}!`)).toBeNull();
  });

  it("onlineDaggerToSpec: exact body, a pure rename", () => {
    expect(onlineDaggerToSpec(form)).toEqual({
      session_name: "pick_cube_v1",
      resume: false,
      pause_while_training: true,
      wait_for_trainer_ready: true,
    });
    expect(
      onlineDaggerToSpec({
        sessionName: "Run-2",
        resume: true,
        pauseWhileTraining: false,
        waitForTrainerReady: false,
      }),
    ).toEqual({
      session_name: "Run-2",
      resume: true,
      pause_while_training: false,
      wait_for_trainer_ready: false,
    });
  });

  it("onlineDaggerToSpec THROWS on an over-long name instead of posting a truncated one", () => {
    expect(() => onlineDaggerToSpec({ ...form, sessionName: "a".repeat(65) })).toThrow(
      "Session name must be at most 64 characters",
    );
    expect(onlineDaggerToSpec({ ...form, sessionName: "a".repeat(64) }).session_name).toBe(
      "a".repeat(64),
    );
  });

  it("folder previews come from GET /api/datasets/layout, never a hard-coded namespace", () => {
    const layout = makeDatasetLayout();
    expect(namespaceRoot(layout, "bc_demo")).toBe("/home/x/data/bc_demo");
    expect(namespaceRoot(layout, "apollo")).toBe("/home/x/apollo/var/datasets/apollo");
    expect(datasetFolderPreview(layout, "pick_cube")).toBe("/home/x/data/bc_demo/pick_cube");
    expect(datasetFolderPreview(layout, "")).toBe("/home/x/data/bc_demo/…");
    // Before the layout answered (or on a runtime without the route): the folder is
    // unknown — a namespace-free pending preview, never `apollo/` or `bc_demo/`.
    expect(datasetFolderPreview(null, "pick_cube")).toBe("…/pick_cube");
    expect(datasetFolderPreview(null, "")).toBe("…/…");
    // A remapped default namespace follows the layout.
    expect(
      datasetFolderPreview(
        makeDatasetLayout({
          default_namespace: "demos",
          namespaces: { demos: { root: "/srv/demos", subdir: null } },
        }),
        "x",
      ),
    ).toBe("/srv/demos/x");
    expect(ONLINE_DAGGER_NAMESPACE).toBe("online_dagger");
    expect(onlineDaggerFolderPreview(layout, "s1")).toBe("/home/x/data/online_dagger/s1");
    expect(onlineDaggerFolderPreview(layout, "")).toBe("/home/x/data/online_dagger/…");
    expect(onlineDaggerFolderPreview(null, "s1")).toBe("…/online_dagger/s1");
    // A layout without the mapped namespace: the generic root.
    expect(onlineDaggerFolderPreview(makeDatasetLayout({ namespaces: {} }), "s1")).toBe(
      "/home/x/apollo/var/datasets/online_dagger/s1",
    );
  });
});

describe("validateLaunch — dagger (Online DAgger)", () => {
  it("a complete selection with an attached trainer launches", () => {
    expect(validateLaunch("dagger", odSel)).toBeNull();
  });
  it("hardware stays refused first (D7)", () => {
    expect(validateLaunch("dagger", { ...odSel, ...hwSel, task: "t" })).toBe(
      REASON.hardwareTeleopOnly,
    );
  });
  it("task, then session name (required, then the schema's maxLength)", () => {
    expect(validateLaunch("dagger", { ...odSel, task: " " })).toBe(REASON.noTask);
    expect(
      validateLaunch("dagger", { ...odSel, onlineDagger: { ...form, sessionName: "!!" } }),
    ).toBe(REASON.sessionName);
    expect(REASON.sessionName).toBe("Session name is required");
    // the schema's maxLength (64) is honoured: 65 is refused with its own reason, 64 passes
    expect(
      validateLaunch("dagger", {
        ...odSel,
        onlineDagger: { ...form, sessionName: "a".repeat(65) },
      }),
    ).toBe("Session name must be at most 64 characters");
    expect(
      validateLaunch("dagger", {
        ...odSel,
        onlineDagger: { ...form, sessionName: "a".repeat(64) },
      }),
    ).toBeNull();
    // the name is judged before the return target and before the trainer
    expect(
      validateLaunch("dagger", {
        ...odSel,
        onlineDagger: { ...form, sessionName: "" },
        hasInitialCondition: false,
        trainerAttached: false,
      }),
    ).toBe(REASON.sessionName);
  });
  it("return-to-start (D6) needs a start profile or an initial condition, unless unticked", () => {
    expect(validateLaunch("dagger", { ...odSel, hasInitialCondition: false })).toBe(
      REASON.returnNeedsProfile,
    );
    expect(
      validateLaunch("dagger", { ...odSel, hasInitialCondition: false, returnToStart: false }),
    ).toBeNull();
    expect(
      validateLaunch("dagger", {
        ...odSel,
        hasInitialCondition: false,
        startFrom: "profile",
        profileId: "p0",
      }),
    ).toBeNull();
    // before the trainer
    expect(
      validateLaunch("dagger", { ...odSel, hasInitialCondition: false, trainerAttached: false }),
    ).toBe(REASON.returnNeedsProfile);
  });
  it("trainer: none attached, then no capability; unknown capability is not judged; an erroring trainer is a warning, not a refusal", () => {
    expect(validateLaunch("dagger", { ...odSel, trainerAttached: false })).toBe(REASON.noTrainer);
    expect(REASON.noTrainer).toBe(
      "Attach an Online DAgger trainer first (policy node with the online_dagger capability)",
    );
    expect(validateLaunch("dagger", { ...odSel, trainerCapability: false })).toBe(
      REASON.trainerNoCapability,
    );
    expect(REASON.trainerNoCapability).toContain("online_dagger capability");
    expect(
      validateLaunch("dagger", { ...odSel, trainerAttached: false, trainerCapability: false }),
    ).toBe(REASON.noTrainer);
    expect(validateLaunch("dagger", { ...odSel, trainerCapability: true })).toBeNull();
    expect(validateLaunch("dagger", { ...odSel, trainerAttached: undefined })).toBeNull();
    // The session-less heartbeat saying `error` is NOT a launch reason: the runtime
    // does not 409 on it and a new session is the recovery path. `REASON` carries no
    // such entry; the sheet shows `trainerErrorWarning` as a caption instead.
    expect(Object.values(REASON).some((r) => r.includes("Trainer reports an error"))).toBe(false);
    expect(trainerErrorWarning("cuda OOM")).toBe(
      "Trainer reports an error — you can start, but check the policy node: cuda OOM",
    );
    expect(trainerErrorWarning("  ")).toBe(TRAINER_ERROR_WARNING);
  });
  it("a card-level probe (no form) is judged on the rest; policies_available is irrelevant", () => {
    expect(validateLaunch("dagger", { ...simSel, task: "t" })).toBeNull();
    expect(launcherReason("dagger", simSel, [])).toBeNull();
    expect(launcherReason("dagger", { ...simSel, trainerAttached: false }, [])).toBeNull();
    expect(launcherReason("dagger", hwSel, [])).toBe(REASON.hardwareTeleopOnly);
  });
});

describe("buildSpec — dagger (Online DAgger)", () => {
  it("emits policy_source external + online_dagger + action_filter + return_to_start; never dataset / policy", () => {
    const spec = buildSpec("dagger", {
      ...odSel,
      policyId: "ckpt-9",
      datasetMode: "new",
      datasetName: "ignored",
      returnToStart: false,
      startFrom: "profile",
      profileId: "p0",
    });
    expect(spec).toEqual({
      mode: "dagger",
      kind: "sim",
      arms: ["grip", "view"],
      frames: { grip: "arm_base:grip", view: "arm_base:view" },
      sim_scene: "mavis_v2",
      start_from: "profile:p0",
      task: "pick the cube",
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
        session_name: "pick_cube_v1",
        resume: false,
        pause_while_training: true,
        wait_for_trainer_ready: true,
      },
      return_to_start: false,
    });
    expect(spec).not.toHaveProperty("dataset");
    expect(spec).not.toHaveProperty("dataset_resume");
    expect(spec).not.toHaveProperty("policy");
  });
  it("resume and the two gates travel from the form; return_to_start defaults ON (D6)", () => {
    const spec = buildSpec("dagger", {
      ...odSel,
      onlineDagger: {
        ...form,
        resume: true,
        pauseWhileTraining: false,
        waitForTrainerReady: false,
      },
    });
    expect(spec.online_dagger).toEqual({
      session_name: "pick_cube_v1",
      resume: true,
      pause_while_training: false,
      wait_for_trainer_ready: false,
    });
    expect(spec.return_to_start).toBe(true);
  });
  it("collect and inference are untouched by the dagger branch", () => {
    expect(
      buildSpec("collect", { ...simSel, task: "t", datasetMode: "new", datasetName: "x" }),
    ).not.toHaveProperty("policy_source");
    expect(buildSpec("inference", { ...simSel, policyId: "ckpt-9" })).not.toHaveProperty(
      "online_dagger",
    );
    expect(buildSpec("teleop", simSel)).not.toHaveProperty("return_to_start");
  });
});

// ---------------------------------------------------------------------------------
// GELLO Manipulation (phase-15; 16-gello §11 / D1 / D8)
// ---------------------------------------------------------------------------------
const gelloOk: GelloInputs = {
  viewpoint: "auto",
  sceneId: "mavis_v2_kitchen",
  leaderReady: true,
  previewStatus: "clear",
  previewDetail: "",
  previewStale: false,
};
/** The sheet's block with a non-clear latest preview. */
const gelloWith = (over: Partial<GelloInputs>): GelloInputs => ({ ...gelloOk, ...over });
const colliding = gelloWith({
  previewStatus: "collision",
  previewDetail: "GELLO posture collides",
});

describe("validateLaunch — gello (GELLO Manipulation)", () => {
  it("a card-level probe (no gello block) is judged on the workcell alone — Sim and Hardware alike (D8)", () => {
    expect(validateLaunch("gello", simSel)).toBeNull();
    expect(validateLaunch("gello", hwSel)).toBeNull();
    expect(launcherReason("gello", { ...simSel, gello: colliding }, [])).toBeNull();
    // The Hardware tab keeps refusing dagger / inference before anything else.
    for (const m of ["dagger", "inference"] as const)
      expect(validateLaunch(m, hwSel)).toBe(REASON.hardwareTeleopOnly);
    // …and gello follows teleop's readiness rules there.
    expect(validateLaunch("gello", { ...hwSel, hardwareReady: false })).toBe(REASON.noArmsDetected);
    expect(validateLaunch("gello", { ...hwSel, unhomedRailArms: ["view"] })).toBe(
      "Perception Arm: rail not homed — use Home rail",
    );
    expect(validateLaunch("gello", { ...simSel, arms: [] })).toBe(REASON.noWorkcellArms);
    expect(validateLaunch("gello", { ...simSel, keymapOk: false })).toBe(REASON.keymap);
  });

  it("the page's Start-from choice does not gate gello: the launch motion IS the GELLO posture", () => {
    expect(
      validateLaunch("gello", { ...simSel, startFrom: "profile", profileId: null }),
    ).toBeNull();
    expect(validateLaunch("teleop", { ...simSel, startFrom: "profile", profileId: null })).toBe(
      REASON.noProfile,
    );
  });

  it("with the sheet's block: scene, then leader, then the latest preview", () => {
    const sel = { ...simSel, gello: gelloOk };
    expect(validateLaunch("gello", sel)).toBeNull();
    expect(validateLaunch("gello", { ...sel, gello: gelloWith({ sceneId: null }) })).toBe(
      REASON.gelloNoScene,
    );
    expect(
      validateLaunch("gello", {
        ...sel,
        gello: gelloWith({ sceneId: null, leaderReady: false, previewStatus: "collision" }),
      }),
    ).toBe(REASON.gelloNoScene);
    expect(validateLaunch("gello", { ...sel, gello: gelloWith({ leaderReady: false }) })).toBe(
      REASON.gelloNoLeader,
    );
    expect(validateLaunch("gello", { ...sel, gello: colliding })).toBe(REASON.gelloNotClear);
    expect(REASON.gelloNoLeader).toBe("GELLO leader not connected");
    expect(REASON.gelloNotClear).toBe(
      "GELLO posture is not clear — move GELLO and wait for the preview",
    );
  });

  it("the footer reason names the actual blocker (2026-09-09 review): 'move GELLO' only for a posture problem", () => {
    // Posture problems the operator fixes by moving GELLO.
    for (const previewStatus of ["collision", "joint_limit", "no_leader"] as const)
      expect(gelloPreviewReason(gelloWith({ previewStatus }))).toBe(REASON.gelloNotClear);
    // Not a posture problem: the calibration instruction.
    expect(gelloPreviewReason(gelloWith({ previewStatus: "not_calibrated" }))).toBe(
      REASON.gelloNotCalibrated,
    );
    expect(REASON.gelloNotCalibrated).toBe(
      "GELLO not calibrated — run Calibrate (match arm) in the Leader view",
    );
    // The runtime's own detail for a missing workcell / a broken scene, a fallback without one.
    expect(
      gelloPreviewReason(
        gelloWith({ previewStatus: "no_workcell", previewDetail: "no hardware workcell posture" }),
      ),
    ).toBe("no hardware workcell posture");
    expect(
      gelloPreviewReason(
        gelloWith({
          previewStatus: "scene_error",
          previewDetail: "twin scene 'mavis_v2_kitchen' unavailable: fridge.stl missing",
        }),
      ),
    ).toBe("twin scene 'mavis_v2_kitchen' unavailable: fridge.stl missing");
    expect(
      gelloPreviewReason(gelloWith({ previewStatus: "scene_error", previewDetail: " " })),
    ).toBe(REASON.gelloPreviewFailed);
    // No result in hand (none yet / transport error / the 3 s timeout).
    expect(gelloPreviewReason(gelloWith({ previewStatus: null }))).toBe(
      REASON.gelloPreviewUnavailable,
    );
    expect(REASON.gelloPreviewUnavailable).toBe("preview unavailable — waiting for the runtime");
    // Stale outranks whatever the old result said — even clear.
    expect(gelloPreviewReason(gelloWith({ previewStale: true }))).toBe(REASON.gelloPreviewStale);
    expect(
      gelloPreviewReason(gelloWith({ previewStatus: "not_calibrated", previewStale: true })),
    ).toBe(REASON.gelloPreviewStale);
    expect(REASON.gelloPreviewStale).toBe("preview stale — waiting for the runtime");
    // …but a missing result is reported first, and the leader still wins over the preview.
    expect(gelloPreviewReason(gelloWith({ previewStatus: null, previewStale: true }))).toBe(
      REASON.gelloPreviewUnavailable,
    );
    expect(
      validateLaunch("gello", {
        ...simSel,
        gello: gelloWith({ leaderReady: false, previewStatus: "not_calibrated" }),
      }),
    ).toBe(REASON.gelloNoLeader);
    expect(
      validateLaunch("gello", { ...simSel, gello: gelloWith({ previewStatus: "not_calibrated" }) }),
    ).toBe(REASON.gelloNotCalibrated);
  });

  it("a gello block on another mode's selection is ignored; on hardware the arm gates still come first", () => {
    expect(validateLaunch("teleop", { ...simSel, gello: colliding })).toBeNull();
    expect(validateLaunch("gello", { ...hwSel, gello: gelloOk, homingInProgress: true })).toBe(
      REASON.homingInProgress,
    );
  });
});

describe("buildSpec — gello (GELLO Manipulation)", () => {
  it("sim: the exact body — kitchen scene from GET /api/gello, keep_current, gello.viewpoint; never task / dataset / policy", () => {
    const spec = buildSpec("gello", { ...simSel, gello: gelloOk });
    expect(spec).toEqual({
      mode: "gello",
      kind: "sim",
      arms: ["grip", "view"],
      frames: { grip: "arm_base:grip", view: "arm_base:view" },
      sim_scene: "mavis_v2_kitchen",
      start_from: "keep_current",
      gello: { viewpoint: "auto" },
    });
    for (const k of [
      "task",
      "dataset",
      "dataset_resume",
      "policy",
      "policy_source",
      "online_dagger",
      "return_to_start",
      "action_filter",
      "digital_twin_scene",
      "speed_scale",
    ])
      expect(spec).not.toHaveProperty(k);
  });

  it("hardware: digital_twin_scene + speed_scale; start_from stays keep_current whatever the page chose", () => {
    const spec = buildSpec("gello", {
      ...hwSel,
      speedScale: 0.5,
      startFrom: "profile",
      profileId: "p0",
      gello: { ...gelloOk, viewpoint: "external" },
    });
    expect(spec).toEqual({
      mode: "gello",
      kind: "hardware",
      arms: ["grip", "view"],
      frames: { grip: "arm_base:grip", view: "arm_base:view" },
      digital_twin_scene: "mavis_v2_kitchen",
      speed_scale: 0.5,
      start_from: "keep_current",
      gello: { viewpoint: "external" },
    });
    expect(spec).not.toHaveProperty("sim_scene");
  });

  it("the arms are Manipulation Arm first; without the sheet's block the tab's scene and the default viewpoint stand in", () => {
    const spec = buildSpec("gello", { ...simSel, arms: ["view", "grip"] });
    expect(spec.arms).toEqual(["grip", "view"]);
    expect(spec.sim_scene).toBe("mavis_v2");
    expect(spec.gello).toEqual({ viewpoint: DEFAULT_GELLO_VIEWPOINT });
    expect(DEFAULT_GELLO_VIEWPOINT).toBe("auto");
    expect(buildSpec("gello", hwSel).digital_twin_scene).toBe("mavis_v2");
    expect(buildSpec("gello", hwSel).speed_scale).toBe(1);
  });

  it("the other modes are untouched by the gello branch", () => {
    expect(buildSpec("teleop", { ...simSel, gello: gelloOk })).not.toHaveProperty("gello");
    expect(buildSpec("teleop", simSel).sim_scene).toBe("mavis_v2");
  });
});
