/** Online DAgger launch logic (phase-14; 15-online-dagger §5 / §8): the form defaults
 * against the vendored `OnlineDaggerConfig` schema, `onlineDaggerToSpec` (exact wire
 * body — a pure rename that throws on an over-long name), the session slug, the
 * folder previews from the dataset layout, the dagger branch of `validateLaunch`
 * (reason order; an erroring trainer is a caption, never a refusal) and `buildSpec`
 * for dagger —
 * which carries `policy_source: "external"` + `online_dagger` + `action_filter` +
 * `return_to_start` and never `dataset` / `policy` / a hyper-parameter. 2026-09-11:
 * the inference branch — a promoted checkpoint (`policy`) or the attached external
 * policy node (`policy_source: "external"`, no `policy`), never both. */
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
  it("hardware is refused first unless the runtime admits policy modes (D7 → hardware_session.policy_modes, 2026-09-12)", () => {
    expect(validateLaunch("dagger", { ...odSel, ...hwSel, task: "t" })).toBe(
      REASON.hardwareTeleopOnly,
    );
    expect(validateLaunch("dagger", { ...odSel, ...hwSel, task: "t", policyModes: false })).toBe(
      REASON.hardwareTeleopOnly,
    );
    // `WorkcellStatus.policy_modes: true` on the hardware workcell: judged like sim from here
    expect(
      validateLaunch("dagger", { ...odSel, ...hwSel, task: "t", policyModes: true }),
    ).toBeNull();
    expect(
      validateLaunch("dagger", {
        ...odSel,
        ...hwSel,
        task: "t",
        policyModes: true,
        trainerAttached: false,
      }),
    ).toBe(REASON.noTrainer);
    // the flag speaks on the Hardware tab only
    expect(validateLaunch("dagger", { ...odSel, policyModes: false })).toBeNull();
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
    expect(launcherReason("dagger", { ...hwSel, policyModes: true }, [])).toBeNull();
  });
});

describe("validateLaunch — inference (checkpoint or external policy node, 2026-09-11)", () => {
  it("checkpoint (the default source) keeps the promoted-checkpoint rule", () => {
    expect(validateLaunch("inference", simSel)).toBe(REASON.noPromoted);
    expect(validateLaunch("inference", { ...simSel, policySource: "checkpoint" })).toBe(
      REASON.noPromoted,
    );
    expect(
      validateLaunch("inference", { ...simSel, policiesAvailable: true, policyId: "ckpt-9" }),
    ).toBeNull();
    // the registry does not matter for the checkpoint rule when a node happens to be attached
    expect(validateLaunch("inference", { ...simSel, externalAttached: true })).toBe(
      REASON.noPromoted,
    );
  });
  it("external: judged on the attachment only — false refuses, true / unjudged pass; either flag counts", () => {
    const ext: LandingSelection = { ...simSel, policySource: "external" };
    expect(validateLaunch("inference", { ...ext, externalAttached: false })).toBe(
      REASON.noExternalPolicy,
    );
    expect(REASON.noExternalPolicy).toBe(
      "Attach an external policy node first (dora bridge attached with a fresh policy spec)",
    );
    expect(validateLaunch("inference", { ...ext, externalAttached: true })).toBeNull();
    expect(validateLaunch("inference", ext)).toBeNull();
    expect(validateLaunch("inference", { ...ext, trainerAttached: false })).toBe(
      REASON.noExternalPolicy,
    );
    expect(validateLaunch("inference", { ...ext, trainerAttached: true })).toBeNull();
    // the policy-neutral flag wins over the trainer one when both are set
    expect(
      validateLaunch("inference", { ...ext, externalAttached: true, trainerAttached: false }),
    ).toBeNull();
    // no checkpoint is needed, whatever the registry says
    expect(
      validateLaunch("inference", { ...ext, externalAttached: true, policiesAvailable: false }),
    ).toBeNull();
  });
  it("hardware refuses Inference first for both sources while policy modes are off (D7 → hardware_session.policy_modes)", () => {
    expect(
      validateLaunch("inference", { ...hwSel, policySource: "external", externalAttached: true }),
    ).toBe(REASON.hardwareTeleopOnly);
    expect(
      validateLaunch("inference", { ...hwSel, policiesAvailable: true, policyId: "ckpt-9" }),
    ).toBe(REASON.hardwareTeleopOnly);
    expect(launcherReason("inference", { ...hwSel, externalAttached: true }, [])).toBe(
      REASON.hardwareTeleopOnly,
    );
    expect(REASON.hardwareTeleopOnly).toBe(
      "Hardware sessions run teleop and data collection only (hardware_session.policy_modes is off)",
    );
    // 2026-09-12: `WorkcellStatus.policy_modes: true` opens both sources on the real arms …
    const hwOn: LandingSelection = { ...hwSel, policyModes: true };
    expect(
      validateLaunch("inference", { ...hwOn, policySource: "external", externalAttached: true }),
    ).toBeNull();
    expect(
      validateLaunch("inference", { ...hwOn, policiesAvailable: true, policyId: "ckpt-9" }),
    ).toBeNull();
    expect(launcherReason("inference", { ...hwOn, externalAttached: true }, [])).toBeNull();
    // … and the real gates speak instead of the knob: attachment, then the arms
    expect(launcherReason("inference", { ...hwOn, externalAttached: false }, [])).toBe(
      REASON.noExternalPolicy,
    );
    expect(
      validateLaunch("inference", {
        ...hwOn,
        hardwareReady: false,
        policySource: "external",
        externalAttached: true,
      }),
    ).toBe(REASON.noArmsDetected);
  });
  it("launcherReason probes the sheet's default source: external when nothing is promoted", () => {
    expect(launcherReason("inference", simSel, [])).toBeNull(); // unjudged attachment
    expect(launcherReason("inference", { ...simSel, externalAttached: false }, [])).toBe(
      REASON.noExternalPolicy,
    );
    expect(launcherReason("inference", { ...simSel, externalAttached: true }, [])).toBeNull();
  });
});

describe("buildSpec — inference (2026-09-11)", () => {
  it("external: the exact body carries policy_source external and NO policy", () => {
    const spec = buildSpec("inference", {
      ...simSel,
      policySource: "external",
      externalAttached: true,
      policyId: "ckpt-9", // a stale pick is dropped
    });
    expect(spec).toEqual({
      mode: "inference",
      kind: "sim",
      arms: ["grip", "view"],
      frames: { grip: "arm_base:grip", view: "arm_base:view" },
      sim_scene: "mavis_v2",
      start_from: "keep_current",
      policy_source: "external",
    });
    expect(spec).not.toHaveProperty("policy");
    expect(spec).not.toHaveProperty("online_dagger");
    expect(spec).not.toHaveProperty("task");
  });
  it("checkpoint: `policy` only, never `policy_source`", () => {
    const spec = buildSpec("inference", {
      ...simSel,
      policySource: "checkpoint",
      policyId: "ckpt-9",
    });
    expect(spec).toMatchObject({ policy: "ckpt-9" });
    expect(spec).not.toHaveProperty("policy_source");
    expect(buildSpec("inference", { ...simSel, policyId: "ckpt-9" })).not.toHaveProperty(
      "policy_source",
    );
    // no pick at all: neither key (the runtime picks its promoted checkpoint or 409s)
    const none = buildSpec("inference", simSel);
    expect(none).not.toHaveProperty("policy");
    expect(none).not.toHaveProperty("policy_source");
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
