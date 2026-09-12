/** Welcome page (phase-11 §4): pure launch matrix + the new IA — tab tile
 * sets and black tiles, single-scene auto-select, Hardware gating both ways,
 * LaunchSheet → exact POST bodies, Inference promoted-only, 409 inside the
 * sheet, Escape, titles, first-mount reveal, hardware polling; (phase-09c) the
 * Hardware tab's Speed control → `speed_scale`, the rail-homed / homing /
 * eligibility launcher reasons, "teleop only" on the other three launchers,
 * and the bring-up progress list; (phase-09d) `arms` = EVERY hardware arm (no
 * Include switch), the per-arm named reasons, the card's session-eligibility
 * line and the hero's **Debug** link. */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { WebSocket as MockWebSocket } from "mock-socket";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetClients } from "../api/clients";
import {
  HARDWARE_CAMERA_IDS,
  HARDWARE_OVERLAY_IDS,
  KEYMAP,
  makeArmMonitor,
  makeArmStatus,
  makeBringupRow,
  makeHardwareArms,
  makeHardwareCameras,
  makeHardwareMonitor,
  makeHardwareWorkcell,
  makeMicrophone,
  makeMicrophoneInfo,
  makeOverlayCameras,
  makePolicy,
  makeProfile,
  makeScene,
  makeSimCameras,
  makeCalibration,
  makeDataset,
  makeDatasetLayout,
  makeDoraInfo,
  makeEpisode,
  makeExternal,
  makeOnlineDaggerSession,
  makeTelemetry,
  makeTracker,
  makeTrainerExternal,
  makeWorkcell,
  SIM_CAMERA_IDS,
} from "../../tests/mocks/fixtures";
import { MockTelemetryServer, MockVideoServer } from "../../tests/mocks/mockWs";
import type {
  CameraInfo,
  DatasetInfo,
  DatasetLayoutInfo,
  EpisodeInfo,
  MicrophoneInfo,
  PolicyInfo,
  OnlineDaggerSessionInfo,
  ProfileInfo,
  SceneInfo,
  WorkcellStatus,
} from "../gen";
import { DEFAULT_SPEED_SCALE, DEFAULT_SPEED_VALUE, SPEED_OPTIONS } from "../lib/launch";
import { REVEAL_FLAG } from "../lib/useRevealOnce";
import { useStore } from "../store";
import {
  buildSpec,
  Landing,
  launcherReason,
  REASON,
  validateLaunch,
  type LandingSelection,
} from "./Landing";

interface MockApi {
  workcell?: WorkcellStatus;
  /** `GET /api/workcell?kind=hardware`; `null` → 404 (runtime without the param). */
  hardware?: WorkcellStatus | null;
  cameras?: CameraInfo[];
  /** `GET /api/microphones`; `404` → the route is missing (older runtime). */
  microphones?: MicrophoneInfo[] | 404;
  simScenes?: SceneInfo[];
  twinScenes?: SceneInfo[];
  policies?: PolicyInfo[];
  profiles?: ProfileInfo[];
  keymapFails?: boolean;
  /** POST /api/session answers 409 with this detail. */
  session409?: string;
  /** DELETE /api/profiles/{id} answers 409 with this detail (the runtime refuses
   * to delete the designated initial-condition profile). */
  profileDelete409?: string;
  /** `GET /api/datasets` (2026-09-07); default: none recorded. */
  datasets?: DatasetInfo[];
  /** `GET /api/datasets/{ns}/{name}/episodes` per repo id. */
  episodes?: Record<string, EpisodeInfo[]>;
  /** DELETE / POST export on a dataset answer 409 with this detail. */
  dataset409?: string;
  /** `GET /api/datasets/layout` (phase-14); `404` → an older runtime (no preview folder). */
  layout?: DatasetLayoutInfo | 404;
  /** `GET /api/online_dagger/sessions` (phase-14). */
  onlineDaggerSessions?: OnlineDaggerSessionInfo[];
}

const posts: unknown[] = [];
const deletes: string[] = [];
const exports: string[] = [];
let hardwarePolls = 0;
const base = `ws://${location.host}`;

function installFetch(api: MockApi = {}) {
  posts.length = 0;
  deletes.length = 0;
  exports.length = 0;
  hardwarePolls = 0;
  let datasets: DatasetInfo[] = api.datasets ?? [];
  const episodes: Record<string, EpisodeInfo[]> = { ...(api.episodes ?? {}) };
  // Server-side profile list: DELETE mutates it, so the page's re-read after a
  // delete sees what the runtime would actually serve.
  let profiles: ProfileInfo[] = api.profiles ?? [
    makeProfile({ profile_id: "p0", name: "start", is_initial_condition: true }),
    makeProfile({ profile_id: "p1", name: "alt", notes: "left of bin" }),
    makeProfile({ profile_id: "p2", name: "third-arm", arms: ["grip", "view", "aux"] }),
  ];
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/session") && init?.method === "POST") {
        const spec = JSON.parse(String(init.body)) as { mode: string; arms: string[] };
        posts.push(spec);
        if (api.session409) return json({ detail: api.session409 }, 409);
        return json({
          session_id: "s1",
          epoch: "e1",
          mode: spec.mode,
          arms: spec.arms,
          streams: [...SIM_CAMERA_IDS, "sim"],
          state: "running",
        });
      }
      if (url.includes("/api/workcell?kind=hardware")) {
        hardwarePolls += 1;
        if (api.hardware === null) return json({ detail: "Not Found" }, 404);
        return json(api.hardware ?? makeHardwareWorkcell());
      }
      if (url.includes("/api/workcell")) return json(api.workcell ?? makeWorkcell());
      if (url.includes("/api/cameras"))
        return json(api.cameras ?? [...makeSimCameras(), ...makeHardwareCameras()]);
      if (url.includes("/api/microphones"))
        return api.microphones === 404
          ? json({ detail: "Not Found" }, 404)
          : json(api.microphones ?? [makeMicrophoneInfo()]);
      if (url.includes("/api/scenes?kind=sim"))
        return json(
          api.simScenes ?? [
            makeScene({
              scene_id: "single_rail",
              label: "one railed arm",
              num_arms: 1,
              rail_flags: [true],
              cameras: ["cam_front"],
            }),
            makeScene(),
          ],
        );
      if (url.includes("/api/scenes?kind=twin"))
        return json(api.twinScenes ?? [makeScene({ kind: "twin" })]);
      if (url.includes("/api/profiles/") && init?.method === "DELETE") {
        const id = url.split("/api/profiles/")[1]!;
        deletes.push(id);
        if (api.profileDelete409) return json({ detail: api.profileDelete409 }, 409);
        profiles = profiles.filter((p) => p.profile_id !== id);
        return new Response(null, { status: 204 });
      }
      if (url.includes("/api/profiles")) return json(profiles);
      if (url.includes("/api/datasets/layout"))
        return api.layout === 404
          ? json({ detail: "Not Found" }, 404)
          : json(api.layout ?? makeDatasetLayout());
      if (url.includes("/api/dora")) return json(makeDoraInfo());
      if (url.includes("/api/online_dagger/skill"))
        return new Response("# mavis-online-dagger-trainer\n\nInstall mavis-policy-node…", {
          status: 200,
          headers: { "content-type": "text/markdown" },
        });
      if (url.includes("/api/online_dagger/sessions")) return json(api.onlineDaggerSessions ?? []);
      if (url.includes("/api/datasets")) {
        const rest = url.split("/api/datasets")[1] ?? "";
        const m = /^\/([^/]+)\/([^/]+)(\/.*)?$/.exec(rest);
        if (!m) return json(datasets);
        const repoId = `${m[1]}/${m[2]}`;
        const tail = m[3] ?? "";
        if (tail.startsWith("/episodes/") && init?.method === "DELETE") {
          const epId = decodeURIComponent(tail.slice("/episodes/".length));
          deletes.push(`${repoId}#${epId}`);
          if (api.dataset409) return json({ detail: api.dataset409 }, 409);
          episodes[repoId] = (episodes[repoId] ?? []).filter((e) => e.episode_id !== epId);
          datasets = datasets.map((d) =>
            d.repo_id === repoId
              ? { ...d, total_episodes: d.total_episodes - 1, export: { state: "stale" } }
              : d,
          );
          return new Response(null, { status: 204 });
        }
        if (tail === "/episodes") return json(episodes[repoId] ?? []);
        if (tail === "/export" && init?.method === "POST") {
          exports.push(repoId);
          if (api.dataset409) return json({ detail: api.dataset409 }, 409);
          return json({ repo_id: repoId, format: "lerobot_v3", started_at: "now" }, 202);
        }
        if (tail === "" && init?.method === "DELETE") {
          deletes.push(repoId);
          if (api.dataset409) return json({ detail: api.dataset409 }, 409);
          datasets = datasets.filter((d) => d.repo_id !== repoId);
          return new Response(null, { status: 204 });
        }
        const one = datasets.find((d) => d.repo_id === repoId);
        return one ? json(one) : json({ detail: "unknown dataset" }, 404);
      }
      if (url.includes("/api/policies")) return json(api.policies ?? []);
      if (url.includes("/api/keymap")) return api.keymapFails ? json("boom", 500) : json(KEYMAP);
      throw new Error(`unmocked fetch ${url}`);
    }),
  );
}

let videoServers: MockVideoServer[] = [];
let telemetryServer: MockTelemetryServer;

beforeEach(() => {
  sessionStorage.removeItem(REVEAL_FLAG);
  vi.stubGlobal("WebSocket", MockWebSocket); // StreamView / TelemetryClient use the default factory
  videoServers = [...SIM_CAMERA_IDS, ...HARDWARE_CAMERA_IDS, ...HARDWARE_OVERLAY_IDS].map(
    (id) => new MockVideoServer(`${base}/ws/video/${id}`),
  );
  telemetryServer = new MockTelemetryServer(`${base}/ws/telemetry`);
});

afterEach(() => {
  resetClients();
  for (const v of videoServers) v.stop();
  telemetryServer.stop();
  vi.unstubAllGlobals();
  useStore.getState().resetForEpochChange();
  useStore.getState().setWorkcell(null);
  useStore.getState().setKeymap(null, null);
  useStore.getState().setConn("telemetry", "closed");
  useStore.setState({ toasts: [] });
  sessionStorage.removeItem(REVEAL_FLAG);
});

async function mount(api: MockApi = {}) {
  installFetch(api);
  const utils = render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<Landing hardwarePollMs={50} />} />
        <Route path="/:mode" element={<div data-testid="mode-page" />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByTestId("arm-card-grip"); // sim workcell loaded
  return utils;
}

const enabled = (id: string) => screen.getByTestId(id).getAttribute("aria-disabled") === null;
const reasonOf = (mode: string) => screen.queryByTestId(`launch-reason-${mode}`)?.textContent ?? "";
const MODES = ["teleop", "collect", "dagger", "inference"] as const;

/** Wait for the keymap + scenes to land (teleop becomes launchable on the Sim tab). */
const ready = () => waitFor(() => expect(enabled("launch-teleop")).toBe(true));

/** A homed, enabled track at the origin (phase-09c: the arm can join a session). */
const homedGrip = (over: Partial<ReturnType<typeof makeArmMonitor>> = {}) =>
  makeArmMonitor({ rail_homed: true, rail_enabled: true, rail_pos_m: 0, ...over });
/** Both arms homed and error-free — every launcher gate on the Hardware tab passes. */
const eligibleMonitor = () =>
  makeHardwareMonitor({
    arms: [homedGrip(), homedGrip({ arm_id: "view", tcp_load_kg: 0.55 })],
  });
/** Push one telemetry frame once the Hardware tab has connected the socket. */
async function pushTelemetry(msg: ReturnType<typeof makeTelemetry>) {
  await waitFor(() => expect(useStore.getState().conn.telemetry).toBe("open"));
  act(() => telemetryServer.push(msg));
}

/** Pointer tab switch, settled: incoming pane present, outgoing pane gone (120 ms crossfade). */
async function switchTab(k: "hardware" | "sim" | "setting") {
  fireEvent.click(screen.getByTestId(`kind-${k}`));
  await waitFor(() => {
    expect(screen.getByTestId(`pane-${k}`)).toBeInTheDocument();
    expect(document.querySelector(".pane-leave")).toBeNull();
  });
}

// ---------------------------------------------------------------------------------
// Pure launch logic
// ---------------------------------------------------------------------------------
const simSel: LandingSelection = {
  tab: "sim",
  kind: "sim",
  arms: ["view", "grip"],
  frames: { view: "arm_base:view", grip: "arm_base:grip" },
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
  arms: ["grip", "view"],
  frames: { grip: "arm_base:grip", view: "arm_base:view" },
  simScene: null,
  twinScene: "mavis_v2",
  hardwareReady: true,
  hardwareConfigured: true,
};

describe("validateLaunch (matrix)", () => {
  it("passes teleop on Sim with arms + scene + keymap", () => {
    expect(validateLaunch("teleop", simSel)).toBeNull();
  });
  it("blocks with no arms", () => {
    expect(validateLaunch("teleop", { ...simSel, arms: [] })).toMatch(/arms/);
  });
  it("blocks sim without the scene, hardware without a twin scene", () => {
    expect(validateLaunch("teleop", { ...simSel, simScene: null })).toBe(REASON.noSimScene);
    expect(validateLaunch("teleop", { ...hwSel, twinScene: null })).toMatch(/digital-twin/);
  });
  it("Hardware gating both ways: needs the hardware block, then hardware_ready", () => {
    expect(validateLaunch("teleop", hwSel)).toBeNull();
    expect(validateLaunch("teleop", { ...hwSel, hardwareReady: false })).toBe(
      "Requires real arms — none detected",
    );
    expect(validateLaunch("teleop", { ...hwSel, hardwareConfigured: false })).toBe(
      "Hardware workcell not configured",
    );
    // The Sim tab ignores the hardware flags.
    expect(validateLaunch("teleop", { ...simSel, hardwareReady: false })).toBeNull();
  });
  it("blocks profile start without a profile", () => {
    expect(validateLaunch("teleop", { ...simSel, startFrom: "profile" })).toMatch(/profile/);
  });
  it("blocks collect/dagger with an empty task", () => {
    expect(validateLaunch("collect", simSel)).toBe("Task is required");
    expect(validateLaunch("dagger", simSel)).toBe("Task is required");
    expect(validateLaunch("collect", { ...simSel, task: "stack cubes" })).toBeNull();
  });
  it("dagger (Online DAgger) ignores the checkpoint registry; inference needs a promoted checkpoint", () => {
    // 15-online-dagger D1: the external policy node drives — `policies_available` gates
    // nothing here any more (the sheet gates on the trainer attachment instead).
    expect(validateLaunch("dagger", { ...simSel, task: "t" })).toBeNull();
    expect(validateLaunch("dagger", { ...simSel, task: "t", policiesAvailable: true })).toBeNull();
    expect(validateLaunch("inference", simSel)).toBe("No promoted checkpoint");
    expect(validateLaunch("inference", { ...simSel, policiesAvailable: true })).toBe(
      "No promoted checkpoint",
    );
    expect(
      validateLaunch("inference", { ...simSel, policiesAvailable: true, policyId: "ckpt-9" }),
    ).toBeNull();
  });
  it("blocks when the keymap failed to load (visible retry reason)", () => {
    expect(validateLaunch("teleop", { ...simSel, keymapOk: false })).toBe(
      "Keymap unavailable — retry",
    );
  });
  it("phase-09c Hardware gating: teleop + collect only, arm subset, rail homed, homing in flight, eligibility", () => {
    // DAgger / Inference are blocked on the Hardware tab before anything else;
    // Data Collection is admitted since 2026-09-07 (04-runtime §10.5).
    for (const m of ["dagger", "inference"] as const) {
      expect(validateLaunch(m, { ...hwSel, task: "t", policiesAvailable: true })).toBe(
        REASON.hardwareTeleopOnly,
      );
      expect(validateLaunch(m, { ...hwSel, hardwareReady: false })).toBe(REASON.hardwareTeleopOnly);
      // 2026-09-12: `WorkcellStatus.policy_modes` (the runtime's hardware_session.policy_modes)
      // lifts the refusal; the arm gates then apply exactly as for teleop.
      expect(validateLaunch(m, { ...hwSel, hardwareReady: false, policyModes: true })).toBe(
        REASON.noArmsDetected,
      );
    }
    expect(REASON.hardwareTeleopOnly).toBe(
      "Hardware sessions run teleop and data collection only (hardware_session.policy_modes is off)",
    );
    expect(validateLaunch("dagger", { ...hwSel, task: "t", policyModes: true })).toBeNull();
    expect(
      validateLaunch("inference", {
        ...hwSel,
        policyModes: true,
        policySource: "external",
        externalAttached: true,
      }),
    ).toBeNull();
    expect(
      validateLaunch("collect", {
        ...hwSel,
        task: "t",
        datasetMode: "new",
        datasetName: "pick",
        returnToStart: false,
      }),
    ).toBeNull();
    // Data Collection's own rules (2026-09-07), judged once the sheet filled the fields
    const collect = {
      ...simSel,
      task: "t",
      datasetMode: "new" as const,
      hasInitialCondition: true,
    };
    expect(validateLaunch("collect", { ...collect, datasetName: "" })).toBe(REASON.datasetName);
    expect(validateLaunch("collect", { ...collect, datasetName: "!!" })).toBe(REASON.datasetName);
    expect(validateLaunch("collect", { ...collect, datasetName: "Pick Cube" })).toBeNull();
    expect(
      validateLaunch("collect", { ...collect, datasetMode: "existing", datasetRepoId: null }),
    ).toBe(REASON.datasetPick);
    expect(
      validateLaunch("collect", { ...collect, datasetMode: "existing", datasetRepoId: "apollo/x" }),
    ).toBeNull();
    expect(
      validateLaunch("collect", { ...collect, datasetName: "x", hasInitialCondition: false }),
    ).toBe(REASON.returnNeedsProfile);
    expect(
      validateLaunch("collect", {
        ...collect,
        datasetName: "x",
        hasInitialCondition: false,
        returnToStart: false,
      }),
    ).toBeNull();
    expect(
      validateLaunch("collect", {
        ...collect,
        datasetName: "x",
        hasInitialCondition: false,
        startFrom: "profile",
        profileId: "p1",
      }),
    ).toBeNull();
    // buildSpec never emits an empty `dataset` (omitted = the task-derived name)
    const spec = buildSpec("collect", { ...collect, datasetName: "" });
    expect(spec).not.toHaveProperty("dataset");
    expect(spec.dataset_resume).toBe(false);
    expect(buildSpec("collect", { ...collect, datasetName: "Pick Cube" }).dataset).toBe(
      "pick_cube",
    );
    expect(buildSpec("dagger", { ...simSel, task: "t" })).toHaveProperty(
      "action_filter.enabled",
      true,
    );
    expect(buildSpec("teleop", simSel)).not.toHaveProperty("action_filter");
    expect(validateLaunch("collect", { ...hwSel, task: "t", hardwareReady: false })).toBe(
      REASON.noArmsDetected,
    );
    // A workcell without arms (phase-09d: there is no "nothing selected" any more —
    // every hardware arm joins the session).
    expect(validateLaunch("teleop", { ...hwSel, arms: [] })).toBe(REASON.noWorkcellArms);
    expect(REASON).not.toHaveProperty("noArmsSelected");
    // Homing in flight wins over an unhomed rail; an unhomed rail over an ineligible arm.
    expect(
      validateLaunch("teleop", {
        ...hwSel,
        homingInProgress: true,
        unhomedRailArms: ["grip"],
        armsNotReady: ["grip"],
      }),
    ).toBe(REASON.homingInProgress);
    // Phase-09d: the rail / not-ready reasons name the arm(s), Manipulation Arm first.
    expect(validateLaunch("teleop", { ...hwSel, unhomedRailArms: ["view"] })).toBe(
      "Perception Arm: rail not homed — use Home rail",
    );
    expect(validateLaunch("teleop", { ...hwSel, unhomedRailArms: ["view", "grip"] })).toBe(
      "Manipulation Arm, Perception Arm: rail not homed — use Home rail",
    );
    expect(validateLaunch("teleop", { ...hwSel, armsNotReady: ["view"] })).toBe(
      "Perception Arm: not ready — see the arm card",
    );
    expect(
      validateLaunch("teleop", { ...hwSel, unhomedRailArms: ["grip"], armsNotReady: ["view"] }),
    ).toBe("Manipulation Arm: rail not homed — use Home rail");
    // Empty lists / false pass; the Sim tab ignores every phase-09c field.
    expect(
      validateLaunch("teleop", {
        ...hwSel,
        unhomedRailArms: [],
        armsNotReady: [],
        homingInProgress: false,
      }),
    ).toBeNull();
    expect(
      validateLaunch("collect", {
        ...simSel,
        task: "t",
        unhomedRailArms: ["grip"],
        homingInProgress: true,
      }),
    ).toBeNull();
  });

  it("launcherReason assumes the sheet collects task/policy; inference needs a promoted checkpoint OR an attached external policy node", () => {
    expect(launcherReason("collect", simSel, [])).toBeNull();
    // No promoted checkpoint: the probe takes the sheet's default — the external
    // policy node — and judges its attachment (2026-09-11); unjudged = satisfiable.
    expect(launcherReason("inference", { ...simSel, policiesAvailable: true }, [])).toBeNull();
    expect(
      launcherReason(
        "inference",
        { ...simSel, policiesAvailable: true, externalAttached: false },
        [],
      ),
    ).toBe(REASON.noExternalPolicy);
    expect(launcherReason("inference", { ...simSel, externalAttached: true }, [])).toBeNull();
    // A promoted checkpoint keeps the card open whatever the bridge says.
    expect(
      launcherReason("inference", { ...simSel, policiesAvailable: true }, [makePolicy()]),
    ).toBeNull();
    expect(
      launcherReason("inference", { ...simSel, policiesAvailable: true, externalAttached: false }, [
        makePolicy(),
      ]),
    ).toBeNull();
    // The Hardware tab refuses Inference before either source is looked at while the
    // runtime's hardware_session.policy_modes is off (D7); on, the source is judged.
    expect(launcherReason("inference", { ...hwSel, externalAttached: true }, [])).toBe(
      REASON.hardwareTeleopOnly,
    );
    expect(
      launcherReason("inference", { ...hwSel, externalAttached: true, policyModes: true }, []),
    ).toBeNull();
    expect(launcherReason("teleop", { ...hwSel, hardwareReady: false }, [])).toBe(
      "Requires real arms — none detected",
    );
  });
});

describe("buildSpec", () => {
  it("serializes start_from, per-arm frames and the scene by kind", () => {
    const spec = buildSpec("teleop", {
      ...simSel,
      startFrom: "profile",
      profileId: "p0",
      frames: { view: "camera:view_wrist_cam", grip: "arm_base:grip" },
    });
    expect(spec).toEqual({
      mode: "teleop",
      kind: "sim",
      arms: ["view", "grip"],
      frames: { view: "camera:view_wrist_cam", grip: "arm_base:grip" },
      sim_scene: "mavis_v2",
      start_from: "profile:p0",
    });
    // Hardware: `speed_scale` always travels; an unset one falls back to the
    // pre-selected segment (100 % since 2026-09-08 — the operator found 50 %
    // too slow on the real cell). Sim specs never carry it.
    // Segments and the pre-selected one must not drift apart (2026-09-07).
    expect(SPEED_OPTIONS.map((o) => o.label)).toEqual(["10%", "50%", "100%"]);
    expect(SPEED_OPTIONS.find((o) => o.value === DEFAULT_SPEED_VALUE)?.scale).toBe(
      DEFAULT_SPEED_SCALE,
    );
    expect(DEFAULT_SPEED_SCALE).toBe(1);
    expect(buildSpec("teleop", hwSel)).toEqual({
      mode: "teleop",
      kind: "hardware",
      arms: ["grip", "view"],
      frames: { grip: "arm_base:grip", view: "arm_base:view" },
      digital_twin_scene: "mavis_v2",
      speed_scale: DEFAULT_SPEED_SCALE,
      start_from: "keep_current",
    });
    expect(buildSpec("teleop", { ...hwSel, arms: ["grip"], speedScale: 0.1 })).toMatchObject({
      arms: ["grip"],
      frames: { grip: "arm_base:grip" },
      speed_scale: 0.1,
    });
    expect(buildSpec("teleop", simSel)).not.toHaveProperty("speed_scale");
  });
  it("task only for collect/dagger; policy only for inference (dagger = external policy node)", () => {
    expect(buildSpec("collect", { ...simSel, task: " stack " }).task).toBe("stack");
    // Online DAgger never names a checkpoint — even a stale `policyId` is dropped.
    expect(buildSpec("dagger", { ...simSel, task: "t", policyId: "ckpt-8" })).not.toHaveProperty(
      "policy",
    );
    expect(buildSpec("dagger", { ...simSel, task: "t" })).toMatchObject({
      policy_source: "external",
      return_to_start: true,
    });
    expect(buildSpec("inference", { ...simSel, policyId: "ckpt-9" })).toMatchObject({
      policy: "ckpt-9",
    });
    expect(buildSpec("inference", { ...simSel, policyId: "ckpt-9" })).not.toHaveProperty("task");
  });
});

// ---------------------------------------------------------------------------------
// Welcome page
// ---------------------------------------------------------------------------------
describe("Welcome page", () => {
  it("hero, titles, Sim tab by default with the 2×2 slot set; unlisted camera → black absent tile", async () => {
    const cams = makeSimCameras().filter((c) => c.camera_id !== "cam_top");
    await mount({ cameras: [...cams, ...makeHardwareCameras()] });
    expect(document.title).toBe("APOLLO MAVIS V2");
    expect(screen.getByTestId("hero-title").textContent).toBe("APOLLO MAVIS V2");
    expect(screen.getByTestId("hero-subtitle").textContent).toBe(
      "Manipulation and Viewpoint Selection",
    );
    expect(screen.getByTestId("kind-sim").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("kind-hardware")).toBeEnabled(); // openable without a runtime hardware block
    // Phase-09d: the quiet hero link is called Debug; the route stays #/devices.
    expect(screen.getByTestId("nav-devices").textContent).toBe("Debug");
    expect(screen.getByTestId("nav-devices").getAttribute("href")).toBe("/devices");
    expect(screen.queryByText("Devices")).toBeNull();

    const grid = screen.getByTestId("camera-preview-grid");
    expect(grid.dataset["tab"]).toBe("sim");
    const ids = Array.from(grid.querySelectorAll("[data-stream-id]")).map(
      (el) => (el as HTMLElement).dataset["streamId"],
    );
    expect(ids).toEqual(["grip_wrist_cam", "view_wrist_cam", "cam_front", "cam_top"]);
    expect(
      within(grid)
        .getAllByTestId("stream-title")
        .map((t) => t.textContent),
    ).toEqual([
      "Manipulation · wrist cam",
      "Perception · wrist cam",
      "Environment · front",
      "Environment · top",
    ]);
    expect(screen.queryByTestId("mic-tile")).toBeNull();
    // Live cameras dial their stream; cam_top is not listed → black, no socket.
    expect(screen.getByTestId("stream-grip_wrist_cam").dataset["state"]).not.toBe("absent");
    const top = screen.getByTestId("stream-cam_top");
    expect(top.dataset["state"]).toBe("absent");
    expect(top.querySelector("canvas")).toBeNull();
    expect(within(top).getByTestId("stream-absent").textContent).toContain(
      "Environment · top · no signal",
    );
    expect(screen.getByTestId("status-sim").textContent).toBe(
      "APOLLO MAVIS V2 Digital Twin · 2 arms on rails",
    );
    // Arm cards: both sim arms, "Simulated"; the runtime lists `view` first but
    // the Manipulation Arm renders first, named, with the id in a chip.
    expect(screen.getByTestId("arm-state-view").textContent).toContain("Simulated");
    expect(screen.getByTestId("arm-state-grip").textContent).toContain("Simulated");
    expect(
      within(screen.getByTestId("arm-cards"))
        .getAllByTestId(/^arm-card-/)
        .map((el) => el.dataset["testid"]),
    ).toEqual(["arm-card-grip", "arm-card-view"]);
    expect(screen.getByTestId("arm-card-grip").textContent).toContain("Manipulation Arm");
    expect(screen.getByTestId("arm-id-grip").textContent).toBe("grip");
    expect(screen.getByTestId("arm-card-view").textContent).toContain("Perception Arm");
    expect(screen.getByTestId("arm-card-view").textContent).not.toContain("View ·");
  });

  it("Hardware tab: five cells — black cameras + overlays and the MicTile, 'No arms detected' caption, placeholder, four modes disabled with the reason", async () => {
    await mount();
    await ready();
    await switchTab("hardware");
    const grid = screen.getByTestId("camera-preview-grid");
    expect(grid.dataset["tab"]).toBe("hardware");
    expect(grid.className).toBe("obs-grid obs-grid-5");
    expect(
      Array.from(grid.querySelectorAll("[data-stream-id]")).map(
        (el) => (el as HTMLElement).dataset["streamId"],
      ),
    ).toEqual(["grip_wrist", "grip_wrist_align", "view_wrist", "view_wrist_align"]);
    expect(
      within(grid)
        .getAllByTestId("stream-title")
        .map((t) => t.textContent),
    ).toEqual([
      "Manipulation · wrist cam",
      "Manipulation · twin overlay",
      "Perception · wrist cam",
      "Perception · twin overlay",
    ]);
    expect(grid.children).toHaveLength(5);
    expect(grid.lastElementChild).toBe(screen.getByTestId("mic-tile"));
    // No overlay rows in /api/cameras → absent, no canvas, no socket, no note.
    for (const id of ["grip_wrist", "view_wrist", "grip_wrist_align", "view_wrist_align"]) {
      const tile = screen.getByTestId(`stream-${id}`);
      expect(tile.dataset["state"]).toBe("absent");
      expect(tile.querySelector("canvas")).toBeNull();
    }
    expect(screen.queryByTestId("stream-note")).toBeNull();
    const mic = screen.getByTestId("mic-tile");
    expect(mic).toBeInTheDocument();
    expect(screen.getByText("RØDE NT-USB Mini · 48 kHz mono")).toBeInTheDocument();
    expect(mic.dataset["state"]).toBe("starting"); // listed live, no telemetry frame yet
    await waitFor(() =>
      expect(screen.getByTestId("status-hardware").textContent).toBe(
        "No arms detected · grip_wrist, view_wrist · mic: RØDE NT-USB Mini (live)",
      ),
    );
    expect(screen.getByTestId("arm-card-placeholder").textContent).toContain("Searching for arms…");
    expect(screen.getByTestId("arm-card-placeholder").textContent).toContain("192.168.1.201");
    for (const m of MODES) {
      expect(screen.getByTestId(`launch-${m}`).getAttribute("aria-disabled")).toBe("true");
      // Teleop and Data Collection report the arms; DAgger / Inference stay hardware-refused
      // (the fixture's `policy_modes: false` = the repo config's hardware_session.policy_modes).
      expect(reasonOf(m)).toContain(
        m === "teleop" || m === "collect"
          ? "Requires real arms — none detected"
          : "Hardware sessions run teleop and data collection only (hardware_session.policy_modes is off)",
      );
    }
    // Disabled cards stay reachable by keyboard and ignore activation.
    fireEvent.keyDown(screen.getByTestId("launch-teleop"), { key: "Enter" });
    fireEvent.click(screen.getByTestId("launch-collect"));
    expect(posts).toHaveLength(0);
    expect(screen.queryByTestId("launch-sheet")).toBeNull();

    // Live levels ride /ws/telemetry, connected for the mic tile.
    await waitFor(() => expect(useStore.getState().conn.telemetry).toBe("open"));
    act(() => telemetryServer.push(makeTelemetry({ microphone: makeMicrophone({ seq: 3 }) })));
    await waitFor(() => expect(mic.dataset["state"]).toBe("live"));

    // Back to Sim: mic gone, teleop launchable again.
    await switchTab("sim");
    expect(screen.queryByTestId("mic-tile")).toBeNull();
    expect(screen.getByTestId("camera-preview-grid").dataset["tab"]).toBe("sim");
    await ready();
  });

  it("hardware_ready → arm cards Reachable; Teleop waits for the monitor, then posts BOTH arms at 10 % (phase-09d)", async () => {
    await mount({
      hardware: makeHardwareWorkcell({ hardware_ready: true, arms: makeHardwareArms("open") }),
      cameras: [...makeSimCameras(), ...makeHardwareCameras(true)],
    });
    await ready();
    await switchTab("hardware");
    await waitFor(() =>
      expect(screen.getByTestId("arm-state-grip").textContent).toContain("Reachable"),
    );
    expect(screen.getByTestId("arm-card-grip").textContent).toContain("192.168.1.201");
    expect(screen.getByTestId("status-hardware").textContent).toBe(
      "Manipulation Arm reachable, Perception Arm reachable · grip_wrist (live), view_wrist (live) · mic: RØDE NT-USB Mini (live)",
    );
    expect(screen.getByTestId("stream-grip_wrist").dataset["state"]).not.toBe("absent");
    expect(screen.getByTestId("scene-picker-twin").textContent).toContain(
      "Scene·APOLLO MAVIS V2 Digital Twin·2 arms · rails · 4 cameras",
    );
    // Phase-09d: no Include switch — every hardware arm joins the session.
    // Speed segments are 10 / 50 / 100 % with 100 % pre-selected (2026-09-08).
    expect(screen.queryByTestId("arm-include-grip")).toBeNull();
    expect(screen.queryByTestId("arm-include-view")).toBeNull();
    expect(screen.queryByText("Include in session")).toBeNull();
    expect(screen.getByTestId("speed-100").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("speed-50").getAttribute("aria-selected")).toBe("false");
    expect(screen.queryByTestId("speed-30")).toBeNull();
    expect(screen.getByTestId("speed-10")).toBeInTheDocument();
    // No monitor sample yet → the twin cannot be posed → teleop waits (the runtime
    // would 409 too), naming both arms; each card explains why it is not ready;
    // the other three launchers are teleop-only on hardware.
    expect(enabled("launch-teleop")).toBe(false);
    expect(reasonOf("teleop")).toBe(
      "Manipulation Arm, Perception Arm: not ready — see the arm card",
    );
    expect(screen.getByTestId("arm-session-reason-grip").textContent).toBe(
      "Not ready for a session — Monitor not connected — no sample to pose the twin",
    );
    expect(screen.getByTestId("arm-session-reason-grip").dataset["gate"]).toBe("monitor_off");
    expect(screen.getByTestId("arm-session-reason-view")).toBeInTheDocument();
    for (const m of ["dagger", "inference"]) {
      expect(enabled(`launch-${m}`)).toBe(false);
      expect(reasonOf(m)).toBe("Hardware sessions run teleop and data collection only (hardware_session.policy_modes is off)");
    }
    expect(enabled("launch-collect")).toBe(false); // the same arm gates as teleop
    // The monitor reports both arms homed and clean → launchable, reason lines gone.
    await pushTelemetry(makeTelemetry({ hardware_monitor: eligibleMonitor() }));
    await waitFor(() => expect(enabled("launch-teleop")).toBe(true));
    expect(screen.queryByTestId("arm-session-reason-grip")).toBeNull();
    expect(screen.queryByTestId("arm-session-reason-view")).toBeNull();
    expect(screen.getByTestId("arm-rail-grip").textContent).toBe("rail 0.000 m");
    expect(screen.queryByTestId("arm-home-rail-grip")).toBeNull();
    fireEvent.click(screen.getByTestId("launch-teleop"));
    await screen.findByTestId("mode-page");
    expect(posts[0]).toEqual({
      mode: "teleop",
      kind: "hardware",
      arms: ["grip", "view"],
      frames: { grip: "arm_base:grip", view: "arm_base:view" },
      digital_twin_scene: "mavis_v2",
      speed_scale: 1,
      start_from: "keep_current",
    });
  });

  it("policy_modes: true on the hardware workcell opens DAgger / Inference behind the arm gates (2026-09-12)", async () => {
    await mount({
      hardware: makeHardwareWorkcell({
        hardware_ready: true,
        arms: makeHardwareArms("open"),
        policy_modes: true, // the lab render's HARDWARE_POLICY_MODES=true
      }),
      cameras: [...makeSimCameras(), ...makeHardwareCameras(true)],
    });
    await ready();
    await switchTab("hardware");
    await waitFor(() =>
      expect(screen.getByTestId("arm-state-grip").textContent).toContain("Reachable"),
    );
    // No monitor sample yet: the two cards wait on the SAME arm gate as Teleop — the knob
    // no longer masks it.
    for (const m of ["dagger", "inference"]) {
      expect(enabled(`launch-${m}`)).toBe(false);
      expect(reasonOf(m)).toBe("Manipulation Arm, Perception Arm: not ready — see the arm card");
    }
    await pushTelemetry(makeTelemetry({ hardware_monitor: eligibleMonitor() }));
    await waitFor(() => expect(enabled("launch-teleop")).toBe(true));
    // Online DAgger: the sheet collects the form and judges the trainer → launchable.
    expect(enabled("launch-dagger")).toBe(true);
    expect(reasonOf("dagger")).toBe("");
    // Inference: nothing promoted and no external node attached → its own reason, not the knob.
    expect(enabled("launch-inference")).toBe(false);
    expect(reasonOf("inference")).toBe(REASON.noExternalPolicy);
    fireEvent.click(screen.getByTestId("launch-dagger"));
    expect(await screen.findByTestId("online-dagger-sheet")).toBeInTheDocument();
  });

  it("phase-09c speed: pick 10 % → speed_scale 0.1 with both arms (phase-09d)", async () => {
    await mount({
      hardware: makeHardwareWorkcell({ hardware_ready: true, arms: makeHardwareArms("open") }),
      cameras: [...makeSimCameras(), ...makeHardwareCameras(true)],
    });
    await ready();
    await switchTab("hardware");
    await screen.findByTestId("arm-card-view");
    await pushTelemetry(makeTelemetry({ hardware_monitor: eligibleMonitor() }));
    await waitFor(() => expect(enabled("launch-teleop")).toBe(true));
    fireEvent.click(screen.getByTestId("speed-10"));
    expect(screen.getByTestId("speed-10").getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByTestId("launch-teleop"));
    await screen.findByTestId("mode-page");
    // Manipulation Arm first; both frames; 10 % (a first run in a new posture).
    expect(posts[0]).toMatchObject({
      arms: ["grip", "view"],
      frames: { grip: "arm_base:grip", view: "arm_base:view" },
      speed_scale: 0.1,
    });
  });

  it("phase-09c/09d: unhomed rails → amber pills + Home rail + the named 'rail not homed' reason; homing in flight → its own reason; a C19 arm → named 'not ready' + card line", async () => {
    await mount({
      hardware: makeHardwareWorkcell({ hardware_ready: true, arms: makeHardwareArms("open") }),
      cameras: [...makeSimCameras(), ...makeHardwareCameras(true)],
    });
    await ready();
    await switchTab("hardware");
    await screen.findByTestId("arm-card-grip");
    // The real cell on 2026-09-04: both tracks present, neither homed (the Perception
    // Arm also reports C19 — the rail reason comes first).
    await pushTelemetry(makeTelemetry({ hardware_monitor: makeHardwareMonitor() }));
    await waitFor(() =>
      expect(screen.getByTestId("arm-rail-grip").textContent).toBe("rail not homed"),
    );
    expect(screen.getByTestId("arm-rail-grip").className).toBe("pill pill-warn arm-card-rail");
    expect(screen.getByTestId("arm-home-rail-grip")).toBeEnabled();
    expect(screen.getByTestId("arm-rail-view").textContent).toBe("rail not homed");
    expect(enabled("launch-teleop")).toBe(false);
    expect(reasonOf("teleop")).toBe(
      "Manipulation Arm, Perception Arm: rail not homed — use Home rail",
    );
    // The rail case is explained by the pill + button, not by a session-reason line.
    expect(screen.queryByTestId("arm-session-reason-grip")).toBeNull();
    expect(screen.queryByTestId("arm-session-reason-view")).toBeNull();
    // A homing in flight (maintenance_busy) blocks the launcher with its own reason.
    await pushTelemetry(
      makeTelemetry({
        seq: 2,
        hardware_monitor: makeHardwareMonitor({
          arms: [makeArmMonitor({ maintenance_busy: true }), makeArmMonitor({ arm_id: "view" })],
        }),
      }),
    );
    await waitFor(() =>
      expect(reasonOf("teleop")).toBe("Rail homing in progress — wait for it to finish"),
    );
    // Both homed but the Perception Arm still C19 → it alone blocks, named; its card says why.
    await pushTelemetry(
      makeTelemetry({
        seq: 3,
        hardware_monitor: makeHardwareMonitor({
          arms: [homedGrip(), homedGrip({ arm_id: "view", tcp_load_kg: 0.55, error_code: 19 })],
        }),
      }),
    );
    await waitFor(() =>
      expect(reasonOf("teleop")).toBe("Perception Arm: not ready — see the arm card"),
    );
    expect(screen.getByTestId("arm-session-reason-view").textContent).toBe(
      "Not ready for a session — Controller error C19 — clear errors first",
    );
    expect(screen.getByTestId("arm-session-reason-view").dataset["gate"]).toBe("error");
    expect(screen.queryByTestId("arm-session-reason-grip")).toBeNull();
    // Homed + clean → the pill becomes the position, Home rail disappears, teleop opens up.
    await pushTelemetry(makeTelemetry({ seq: 4, hardware_monitor: eligibleMonitor() }));
    await waitFor(() => expect(enabled("launch-teleop")).toBe(true));
    expect(screen.getByTestId("arm-rail-grip").textContent).toBe("rail 0.000 m");
    expect(screen.getByTestId("arm-rail-grip").dataset["rail"]).toBe("homed");
    expect(screen.queryByTestId("arm-home-rail-grip")).toBeNull();
    expect(screen.queryByTestId("arm-session-reason-view")).toBeNull();
    expect(posts).toHaveLength(0);
  });

  it("phase-09c: the bring-up progress list shows under the launchers while telemetry says bringup", async () => {
    await mount({
      hardware: makeHardwareWorkcell({ hardware_ready: true, arms: makeHardwareArms("open") }),
    });
    await ready();
    await switchTab("hardware");
    expect(screen.queryByTestId("bringup-progress")).toBeNull();
    await pushTelemetry(
      makeTelemetry({
        session: {
          state: "bringup",
          bringup: [
            makeBringupRow({
              arm_id: "view",
              step: "frozen",
              status: "warning",
              detail: "Perception Arm frozen at last sample",
            }),
            makeBringupRow(),
            makeBringupRow({ step: "rail", status: "pending" }),
          ],
        },
      }),
    );
    const list = await screen.findByTestId("bringup-progress");
    expect(list.textContent).toContain("Bringing up the hardware session…");
    // Manipulation Arm rows first; status + detail per row.
    const rows = within(list).getAllByTestId(/^bringup-row-/);
    expect(rows.map((r) => r.dataset["testid"])).toEqual([
      "bringup-row-grip-connect",
      "bringup-row-grip-rail",
      "bringup-row-view-frozen",
    ]);
    expect(rows[1]!.dataset["status"]).toBe("pending");
    expect(rows[1]!.querySelector(".spinner")).not.toBeNull();
    expect(rows[2]!.textContent).toContain("Perception Arm frozen at last sample");
    // Running → gone.
    await pushTelemetry(makeTelemetry({ seq: 2, session: { state: "running" } }));
    await waitFor(() => expect(screen.queryByTestId("bringup-progress")).toBeNull());
  });

  it("twin overlays (phase-09a): live cameras with absent overlays, then live overlays with the monitor's note, caption twin segment and the C19 chip", async () => {
    // Cameras live, overlay rows listed but not live (monitor not running yet).
    await mount({
      hardware: makeHardwareWorkcell({
        hardware_ready: true,
        arms: [
          makeArmStatus({ arm_id: "grip", ip: "192.168.1.201", reachable: "open" }),
          makeArmStatus({
            arm_id: "view",
            ip: "192.168.2.219",
            gripper: "none",
            reachable: "open",
            error_code: 19,
          }),
        ],
      }),
      cameras: [...makeSimCameras(), ...makeHardwareCameras(true), ...makeOverlayCameras(false)],
    });
    await ready();
    await switchTab("hardware");
    await waitFor(() =>
      expect(screen.getByTestId("arm-state-grip").textContent).toContain("Reachable"),
    );
    const grid = screen.getByTestId("camera-preview-grid");
    expect(grid.className).toBe("obs-grid obs-grid-5");
    for (const id of HARDWARE_CAMERA_IDS)
      expect(screen.getByTestId(`stream-${id}`).dataset["state"]).not.toBe("absent");
    for (const id of HARDWARE_OVERLAY_IDS) {
      const tile = screen.getByTestId(`stream-${id}`);
      expect(tile.dataset["state"]).toBe("absent");
      expect(tile.querySelector("canvas")).toBeNull();
      expect(within(tile).getByTestId("stream-absent").textContent).toBe(
        `${id === "grip_wrist_align" ? "Manipulation" : "Perception"} · twin overlay · no signal`,
      );
    }
    // An absent overlay never dials `/ws/video/<id>_align` (the runtime would close 1008),
    // while the live camera tiles next to them do connect.
    const serverFor = (id: string) => videoServers.find((v) => v.url.endsWith(`/ws/video/${id}`))!;
    await waitFor(() => {
      for (const id of HARDWARE_CAMERA_IDS) expect(serverFor(id).connections).toBeGreaterThan(0);
    });
    for (const id of HARDWARE_OVERLAY_IDS) expect(serverFor(id).connections).toBe(0);
    // The arm card shows the controller error as a red chip (runtime fills error_code).
    expect(screen.getByTestId("arm-error-view").textContent).toBe("C19");
    expect(screen.getByTestId("arm-error-view").className).toContain("chip-red");
    expect(screen.queryByTestId("arm-error-grip")).toBeNull();
    // No telemetry yet → no twin segment in the caption.
    expect(screen.getByTestId("status-hardware").textContent).toBe(
      "Manipulation Arm reachable, Perception Arm reachable · grip_wrist (live), view_wrist (live) · mic: RØDE NT-USB Mini (live)",
    );

    // Telemetry connects on the Hardware tab; the monitor block feeds the caption
    // and the overlay notes (wire " - " rendered as a middle dot).
    await waitFor(() => expect(useStore.getState().conn.telemetry).toBe("open"));
    act(() => telemetryServer.push(makeTelemetry({ hardware_monitor: makeHardwareMonitor() })));
    await waitFor(() =>
      expect(screen.getByTestId("status-hardware").textContent).toBe(
        "Manipulation Arm reachable, Perception Arm reachable · grip_wrist (live), view_wrist (live) · twin: Manipulation Arm running, Perception Arm error C19 · mic: RØDE NT-USB Mini (live)",
      ),
    );
    const gripOverlay = screen.getByTestId("stream-grip_wrist_align");
    expect(within(gripOverlay).getByTestId("stream-note").textContent).toBe(
      "rail not homed · twin assumes 0.65 m",
    );
    expect(
      within(screen.getByTestId("stream-view_wrist_align")).queryByTestId("stream-note"),
    ).toBeNull();

    // The next 2 s poll lists the overlays live → the tiles dial their streams.
    installFetch({
      hardware: makeHardwareWorkcell({ hardware_ready: true, arms: makeHardwareArms("open") }),
      cameras: [...makeSimCameras(), ...makeHardwareCameras(true), ...makeOverlayCameras(true)],
    });
    await waitFor(() =>
      expect(screen.getByTestId("stream-grip_wrist_align").dataset["state"]).not.toBe("absent"),
    );
    expect(screen.getByTestId("stream-grip_wrist_align").querySelector("canvas")).not.toBeNull();
    // ...and now each overlay tile holds exactly one WebSocket.
    await waitFor(() => {
      for (const id of HARDWARE_OVERLAY_IDS) expect(serverFor(id).connections).toBe(1);
    });
    // The note stays while the stream is live; a monitor stale detail replaces it.
    act(() =>
      telemetryServer.push(
        makeTelemetry({
          seq: 2,
          hardware_monitor: makeHardwareMonitor({
            overlays: makeHardwareMonitor().overlays?.map((o) =>
              o.stream_id === "view_wrist_align"
                ? { ...o, status: "stale", detail: "monitor stale" }
                : o,
            ),
          }),
        }),
      ),
    );
    await waitFor(() =>
      expect(
        within(screen.getByTestId("stream-view_wrist_align")).getByTestId("stream-note")
          .textContent,
      ).toBe("monitor stale"),
    );
    expect(within(gripOverlay).getByTestId("stream-note").textContent).toBe(
      "rail not homed · twin assumes 0.65 m",
    );
  });

  it("no hardware block in the runtime config → 'Hardware workcell not configured'", async () => {
    await mount({
      hardware: makeHardwareWorkcell({ available_kinds: ["sim"], arms: [], cameras: [] }),
      microphones: 404,
    });
    await ready();
    await switchTab("hardware");
    await waitFor(() => expect(reasonOf("teleop")).toContain("Hardware workcell not configured"));
    expect(screen.getByTestId("arm-card-placeholder").textContent).toContain(
      "Hardware workcell not configured",
    );
    // No /api/microphones route → no mic tile; the four camera/overlay cells fall
    // back to the 2-col grid (camera | overlay per row); caption says so.
    expect(screen.queryByTestId("mic-tile")).toBeNull();
    expect(screen.getByTestId("camera-preview-grid").className).toBe("obs-grid obs-grid-4");
    expect(screen.getByTestId("status-hardware").textContent).toBe(
      "Hardware workcell not configured · grip_wrist, view_wrist · mic: none",
    );
  });

  it("single scene: mavis_v2 is auto-selected and the only one shown; Teleop launches without a click", async () => {
    await mount();
    await ready();
    const row = screen.getByTestId("scene-picker-sim");
    expect(row.dataset["sceneId"]).toBe("mavis_v2");
    expect(row.textContent).toContain("APOLLO MAVIS V2 Digital Twin");
    expect(row.textContent).toContain("2 arms · rails · 4 cameras");
    expect(screen.queryByText(/one railed arm/)).toBeNull();
    expect(row.querySelector("input")).toBeNull(); // read-only summary, no radio
    fireEvent.click(screen.getByTestId("launch-teleop"));
    await screen.findByTestId("mode-page");
    // The sim runtime lists `view` first; the spec is re-ordered Manipulation Arm first.
    expect(posts[0]).toEqual({
      mode: "teleop",
      kind: "sim",
      arms: ["grip", "view"],
      frames: { view: "arm_base:view", grip: "arm_base:grip" },
      sim_scene: "mavis_v2",
      start_from: "keep_current",
    });
  });

  it("scene missing from the registry → read-only row says unavailable and Teleop is blocked", async () => {
    await mount({ simScenes: [] });
    await waitFor(() => expect(screen.getByTestId("scene-unavailable")).toBeInTheDocument());
    await waitFor(() => expect(reasonOf("teleop")).toContain("Scene unavailable"));
  });

  it("Data Collection sheet collects the task (blur validation) and posts the exact SessionSpec", async () => {
    await mount();
    await ready();
    fireEvent.click(screen.getByTestId("launch-collect"));
    const panel = await screen.findByTestId("launch-sheet-panel");
    expect(panel.getAttribute("role")).toBe("dialog");
    expect(within(panel).getByRole("heading").textContent).toBe("Data Collection");
    expect(panel.textContent).toContain("Sim · APOLLO MAVIS V2 Digital Twin · Keep current state");
    const input = screen.getByTestId("task-input") as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    const confirm = screen.getByTestId("launch-confirm");
    expect(confirm.textContent).toBe("Start Data Collection");
    expect(confirm).toBeDisabled();
    expect(screen.getByTestId("launch-reason").textContent).toBe("Task is required");
    expect(screen.queryByTestId("task-error")).toBeNull();
    fireEvent.blur(input);
    expect(screen.getByTestId("task-error").textContent).toBe("Task is required");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(input, { target: { value: "stack the cube" } });
    expect(screen.queryByTestId("task-error")).toBeNull();
    expect(screen.queryByTestId("policy-select")).toBeNull(); // no policy field for collect
    // Dataset (2026-09-07): a new name is required, slugged live to DATASET_RE
    expect(confirm).toBeDisabled();
    expect(screen.getByTestId("launch-reason").textContent).toBe("Dataset name is required");
    const name = screen.getByTestId("dataset-name") as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Stack the Cube!" } });
    // 15-online-dagger §8: the preview is the REAL folder from GET /api/datasets/layout.
    await waitFor(() =>
      expect(screen.getByTestId("dataset-preview").textContent).toBe(
        "/home/x/data/bc_demo/stack_the_cube",
      ),
    );
    // Return to start is ON by default and needs a profile: the fixture designates an
    // initial condition (p0), so Start is allowed; untick -> still allowed.
    const rts = screen.getByTestId("return-to-start") as HTMLInputElement;
    expect(rts.checked).toBe(true);
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await screen.findByTestId("mode-page");
    expect(posts[0]).toEqual({
      mode: "collect",
      kind: "sim",
      arms: ["grip", "view"],
      frames: { view: "arm_base:view", grip: "arm_base:grip" },
      sim_scene: "mavis_v2",
      start_from: "keep_current",
      task: "stack the cube",
      dataset: "stack_the_cube",
      dataset_resume: false,
      return_to_start: true,
      action_filter: {
        enabled: true,
        pos_eps_m: 0.001,
        rot_eps_rad: 0.001,
        gripper_eps_frac: 0.01,
        rail_eps_m: 0.001,
        gripper_context_s: 1.6,
      },
    });
  });

  it("Data Collection: the idle-frame filter is checked by default; unticking disables the inputs; edited values reach action_filter in SI", async () => {
    await mount();
    await ready();
    fireEvent.click(screen.getByTestId("launch-collect"));
    await screen.findByTestId("launch-sheet-panel");
    fireEvent.change(screen.getByTestId("task-input"), { target: { value: "sort" } });
    fireEvent.change(screen.getByTestId("dataset-name"), { target: { value: "sort" } });
    const box = screen.getByTestId("action-filter") as HTMLInputElement;
    expect(box.checked).toBe(true);
    const pos = screen.getByTestId("action-filter-posMm") as HTMLInputElement;
    expect(pos.value).toBe("1");
    expect((screen.getByTestId("action-filter-gripperContextS") as HTMLInputElement).value).toBe(
      "1.6",
    );
    fireEvent.change(pos, { target: { value: "2.5" } });
    fireEvent.change(screen.getByTestId("action-filter-gripperPct"), { target: { value: "3" } });
    fireEvent.click(box); // untick → inputs disabled, enabled: false travels
    expect(pos).toBeDisabled();
    fireEvent.click(screen.getByTestId("launch-confirm"));
    await screen.findByTestId("mode-page");
    expect((posts[0] as { action_filter: unknown }).action_filter).toEqual({
      enabled: false,
      pos_eps_m: 0.0025,
      rot_eps_rad: 0.001,
      gripper_eps_frac: 0.03,
      rail_eps_m: 0.001,
      gripper_context_s: 1.6,
    });
  });

  it("Data Collection: the return-to-start gate uses the initial condition of the SELECTED kind", async () => {
    // only a HARDWARE initial condition exists: on the Sim tab Start must wait for an untick
    await mount({
      profiles: [
        makeProfile({
          profile_id: "h0",
          name: "hw-start",
          is_initial_condition: true,
          workcell_kind: "hardware",
        }),
      ],
    });
    await ready();
    fireEvent.click(screen.getByTestId("launch-collect"));
    await screen.findByTestId("launch-sheet-panel");
    fireEvent.change(screen.getByTestId("task-input"), { target: { value: "sort" } });
    fireEvent.change(screen.getByTestId("dataset-name"), { target: { value: "sort" } });
    expect(screen.getByTestId("launch-confirm")).toBeDisabled();
    expect(screen.getByTestId("return-to-start-reason")).toBeInTheDocument();
  });

  it("Data Collection: no start profile and no initial condition → Start disabled until untick", async () => {
    await mount({ profiles: [makeProfile({ profile_id: "p1", name: "alt" })] });
    await ready();
    fireEvent.click(screen.getByTestId("launch-collect"));
    await screen.findByTestId("launch-sheet-panel");
    fireEvent.change(screen.getByTestId("task-input"), { target: { value: "sort" } });
    fireEvent.change(screen.getByTestId("dataset-name"), { target: { value: "sort" } });
    const confirm = screen.getByTestId("launch-confirm");
    expect(confirm).toBeDisabled();
    expect(screen.getByTestId("launch-reason").textContent).toBe(
      "Return to start needs a start profile or an initial condition — pick one or untick",
    );
    expect(screen.getByTestId("return-to-start-reason")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("return-to-start"));
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await screen.findByTestId("mode-page");
    expect(posts[0]).toMatchObject({
      dataset: "sort",
      dataset_resume: false,
      return_to_start: false,
    });
  });

  it("Data Collection: 'Continue existing' lists this tab's episode-directory datasets and posts dataset_resume", async () => {
    await mount({
      datasets: [
        makeDataset(),
        makeDataset({ repo_id: "apollo/hw_only", kind: "hardware" }),
        makeDataset({ repo_id: "apollo/old", layout: "lerobot_v3" }),
      ],
    });
    await ready();
    fireEvent.click(screen.getByTestId("launch-collect"));
    await screen.findByTestId("launch-sheet-panel");
    fireEvent.change(screen.getByTestId("task-input"), { target: { value: "pick" } });
    fireEvent.click(screen.getByTestId("dataset-mode-existing"));
    const pick = screen.getByTestId("dataset-pick");
    expect(within(pick).getByTestId("dataset-pick-apollo/pick_cube")).toBeInTheDocument();
    expect(within(pick).queryByTestId("dataset-pick-apollo/hw_only")).toBeNull(); // other kind
    expect(within(pick).queryByTestId("dataset-pick-apollo/old")).toBeNull(); // legacy: read-only
    const confirm = screen.getByTestId("launch-confirm");
    expect(confirm).toBeDisabled();
    expect(screen.getByTestId("launch-reason").textContent).toContain("Pick a dataset");
    fireEvent.click(within(pick).getByTestId("dataset-pick-apollo/pick_cube"));
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await screen.findByTestId("mode-page");
    expect(posts[0]).toMatchObject({
      dataset: "apollo/pick_cube",
      dataset_resume: true,
      return_to_start: true,
    });
  });

  it("Data Collection (2026-09-09): picking an existing dataset carries its task into Task — resume is one click; typed text wins; New dataset clears it", async () => {
    await mount({
      datasets: [makeDataset(), makeDataset({ repo_id: "apollo/no_task", task: null })],
    });
    await ready();
    fireEvent.click(screen.getByTestId("launch-collect"));
    await screen.findByTestId("launch-sheet-panel");
    const taskInput = screen.getByTestId("task-input") as HTMLInputElement;
    expect(taskInput.value).toBe("");
    fireEvent.click(screen.getByTestId("dataset-mode-existing"));
    expect(screen.getByTestId("launch-confirm")).toBeDisabled();
    fireEvent.click(
      within(screen.getByTestId("dataset-pick")).getByTestId("dataset-pick-apollo/pick_cube"),
    );
    expect(taskInput.value).toBe("pick the cube"); // DatasetInfo.task, no typing needed
    expect(screen.getByTestId("task-prefilled").textContent).toContain("apollo/pick_cube");
    expect(screen.getByTestId("launch-confirm")).toBeEnabled();
    // a dataset that never recorded a task leaves the field empty (and Start disabled)
    fireEvent.click(
      within(screen.getByTestId("dataset-pick")).getByTestId("dataset-pick-apollo/no_task"),
    );
    expect(taskInput.value).toBe("");
    expect(screen.queryByTestId("task-prefilled")).toBeNull();
    expect(screen.getByTestId("launch-confirm")).toBeDisabled();
    fireEvent.click(
      within(screen.getByTestId("dataset-pick")).getByTestId("dataset-pick-apollo/pick_cube"),
    );
    expect(taskInput.value).toBe("pick the cube");
    // typed by hand: stays, whatever is picked afterwards
    fireEvent.change(taskInput, { target: { value: "pick it fast" } });
    fireEvent.click(
      within(screen.getByTestId("dataset-pick")).getByTestId("dataset-pick-apollo/no_task"),
    );
    fireEvent.click(
      within(screen.getByTestId("dataset-pick")).getByTestId("dataset-pick-apollo/pick_cube"),
    );
    expect(taskInput.value).toBe("pick it fast");
    expect(screen.queryByTestId("task-prefilled")).toBeNull();
    // cleared by hand: the picked dataset's task comes back
    fireEvent.change(taskInput, { target: { value: "" } });
    expect(taskInput.value).toBe("pick the cube");
    // New dataset: a carried-over task must not stick to a new dataset
    fireEvent.click(screen.getByTestId("dataset-mode-new"));
    expect(taskInput.value).toBe("");
    expect(screen.queryByTestId("task-prefilled")).toBeNull();
    fireEvent.click(screen.getByTestId("dataset-mode-existing")); // the pick is remembered
    expect(taskInput.value).toBe("pick the cube");
    fireEvent.click(screen.getByTestId("launch-confirm"));
    await screen.findByTestId("mode-page");
    expect(posts[0]).toMatchObject({
      task: "pick the cube",
      dataset: "apollo/pick_cube",
      dataset_resume: true,
    });
  });

  it("DatasetsPanel (2026-09-07): rows per tab kind, expand → episodes, delete episode (confirm), export (202), delete dataset (typed name)", async () => {
    const ep0 = makeEpisode();
    const ep1 = makeEpisode({ episode_id: "20260907T141419.008Z-a71e02", index: 1, open: true });
    await mount({
      datasets: [
        makeDataset(),
        makeDataset({ repo_id: "apollo/hw_only", kind: "hardware" }),
        makeDataset({ repo_id: "apollo/old", layout: "lerobot_v3", kind: "sim" }),
      ],
      episodes: { "apollo/pick_cube": [ep0, ep1] },
    });
    await ready();
    const panel = await screen.findByTestId("datasets-panel");
    expect(panel.dataset["kind"]).toBe("sim");
    expect(within(panel).getByTestId("dataset-row-apollo/pick_cube")).toBeInTheDocument();
    expect(within(panel).queryByTestId("dataset-row-apollo/hw_only")).toBeNull(); // hardware tab only
    const legacy = within(panel).getByTestId("dataset-row-apollo/old");
    expect(within(legacy).getByTestId("dataset-legacy-apollo/old")).toBeInTheDocument();
    expect(within(legacy).getByTestId("dataset-export-apollo/old")).toBeDisabled();
    expect(within(legacy).getByTestId("dataset-delete-apollo/old")).toBeDisabled();
    expect(
      within(panel).getByTestId("dataset-export-state-apollo/pick_cube").dataset["state"],
    ).toBe("none");
    // expand → episodes; the open episode cannot be deleted
    fireEvent.click(within(panel).getByTestId("dataset-expand-apollo/pick_cube"));
    await screen.findByTestId(`episode-row-${ep0.episode_id}`);
    expect(screen.getByTestId(`episode-open-${ep1.episode_id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`episode-delete-${ep1.episode_id}`)).toBeDisabled();
    fireEvent.click(screen.getByTestId(`episode-delete-${ep0.episode_id}`));
    const dialog = await screen.findByTestId("confirm-dialog");
    expect(dialog.textContent).toContain("no undo");
    fireEvent.click(screen.getByTestId("confirm-ok"));
    await waitFor(() => expect(deletes).toContain(`apollo/pick_cube#${ep0.episode_id}`));
    await waitFor(() => expect(screen.queryByTestId(`episode-row-${ep0.episode_id}`)).toBeNull());
    await waitFor(() =>
      expect(
        within(panel).getByTestId("dataset-export-state-apollo/pick_cube").dataset["state"],
      ).toBe("stale"),
    );
    // export → 202 + a toast; the live progress rides telemetry
    fireEvent.click(within(panel).getByTestId("dataset-export-apollo/pick_cube"));
    await waitFor(() => expect(exports).toEqual(["apollo/pick_cube"]));
    await pushTelemetry(
      makeTelemetry({
        datasets: {
          export: {
            repo_id: "apollo/pick_cube",
            format: "lerobot_v3",
            phase: "videos",
            done: 1,
            total: 2,
            detail: "file-000.mp4",
          },
        },
      }),
    );
    await screen.findByTestId("dataset-export-progress-apollo/pick_cube");
    expect(
      within(panel).getByTestId("dataset-export-state-apollo/pick_cube").dataset["state"],
    ).toBe("running");
    expect(within(panel).getByTestId("dataset-delete-apollo/pick_cube")).toBeDisabled(); // while running
    await pushTelemetry(
      makeTelemetry({
        seq: 2, // the telemetry client drops a repeated seq as stale
        datasets: {
          export: {
            repo_id: "apollo/pick_cube",
            format: "lerobot_v3",
            phase: "done",
            done: 1,
            total: 1,
            detail: "1 episodes",
          },
        },
      }),
    );
    await waitFor(() => {
      const btn = within(panel).getByTestId("dataset-delete-apollo/pick_cube");
      expect([btn.dataset["busy"], btn.dataset["running"], btn.dataset["inuse"]]).toEqual([
        undefined,
        undefined,
        undefined,
      ]);
      expect(btn).toBeEnabled();
    });
    // delete dataset: typed name required
    fireEvent.click(within(panel).getByTestId("dataset-delete-apollo/pick_cube"));
    await screen.findByTestId("dataset-delete-panel");
    const confirmBtn = screen.getByTestId("dataset-delete-confirm");
    expect(confirmBtn).toBeDisabled();
    fireEvent.change(screen.getByTestId("dataset-delete-name"), { target: { value: "pick_cube" } });
    expect(confirmBtn).toBeEnabled();
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(deletes).toContain("apollo/pick_cube"));
    await waitFor(() =>
      expect(within(panel).queryByTestId("dataset-row-apollo/pick_cube")).toBeNull(),
    );
  });

  it("DatasetsPanel: in-use lock disables export / delete; a 409 surfaces as a toast", async () => {
    await mount({ datasets: [makeDataset({ in_use: true })], dataset409: "dataset is in use" });
    await ready();
    const panel = await screen.findByTestId("datasets-panel");
    expect(within(panel).getByTestId("dataset-inuse-apollo/pick_cube")).toBeInTheDocument();
    expect(within(panel).getByTestId("dataset-export-apollo/pick_cube")).toBeDisabled();
    expect(within(panel).getByTestId("dataset-delete-apollo/pick_cube")).toBeDisabled();
  });

  it("Inference sheet lists promoted checkpoints only (default = last promoted) and posts the policy", async () => {
    await mount({
      workcell: makeWorkcell({ policies_available: true }),
      policies: [
        makePolicy({ policy_id: "ckpt-8", policy_version: 8, promoted: false }),
        makePolicy({ policy_id: "ckpt-9" }),
      ],
    });
    await ready();
    await waitFor(() => expect(enabled("launch-inference")).toBe(true));
    fireEvent.click(screen.getByTestId("launch-inference"));
    const group = await screen.findByTestId("policy-select");
    expect(group.getAttribute("role")).toBe("radiogroup");
    expect(within(group).queryByTestId("policy-ckpt-8")).toBeNull();
    expect(within(group).queryByTestId("policy-latest")).toBeNull();
    const promoted = within(group).getByTestId("policy-ckpt-9") as HTMLInputElement;
    expect(promoted.checked).toBe(true);
    expect(group.textContent).toContain("Promoted");
    expect(screen.queryByTestId("task-input")).toBeNull();
    const confirm = screen.getByTestId("launch-confirm");
    expect(confirm.textContent).toBe("Start Inference");
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await screen.findByTestId("mode-page");
    expect(posts[0]).toEqual({
      mode: "inference",
      kind: "sim",
      arms: ["grip", "view"],
      frames: { view: "arm_base:view", grip: "arm_base:grip" },
      sim_scene: "mavis_v2",
      start_from: "keep_current",
      policy: "ckpt-9",
    });
  });

  it("Inference stays disabled when nothing is promoted and no external policy node is attached (the reason names the node)", async () => {
    await mount({
      workcell: makeWorkcell({ policies_available: true }),
      policies: [makePolicy({ policy_id: "ckpt-8", promoted: false })],
    });
    await ready();
    expect(enabled("launch-dagger")).toBe(true);
    expect(enabled("launch-inference")).toBe(false);
    expect(reasonOf("inference")).toBe(REASON.noExternalPolicy);
    expect(reasonOf("inference")).toContain("Attach an external policy node first");
  });

  it("Inference from the attached external policy node (2026-09-11): no promoted checkpoint + telemetry.external attached → the card opens, the sheet pre-selects 'External policy (dora)' and Start posts policy_source external with no policy", async () => {
    await mount({ policies: [makePolicy({ policy_id: "ckpt-8", promoted: false })] });
    await ready();
    expect(enabled("launch-inference")).toBe(false);
    expect(screen.getByTestId("launch-inference").textContent).toContain(
      "Run a promoted checkpoint or an attached policy node",
    );
    await pushTelemetry(makeTelemetry({ external: makeExternal({ policy_arms: ["grip"] }) }));
    await waitFor(() => expect(enabled("launch-inference")).toBe(true));
    expect(reasonOf("inference")).toBe("");
    fireEvent.click(screen.getByTestId("launch-inference"));
    const group = await screen.findByTestId("policy-select");
    expect(within(group).queryByTestId("policy-ckpt-8")).toBeNull(); // not promoted
    expect(within(group).queryByTestId("policy-empty")).toBeNull(); // external is selected
    const external = within(group).getByTestId("policy-external") as HTMLInputElement;
    expect(external.checked).toBe(true);
    expect(group.textContent).toContain("External policy (dora)");
    expect(group.textContent).toContain("act_pick_place v3 · 10 Hz · drives: Manipulation Arm");
    // The shared status card under the row: green chip + the driven arms.
    const status = within(group).getByTestId("external-policy-status");
    expect(within(status).getByTestId("external-policy-chip").textContent).toBe(
      "EXTERNAL POLICY attached",
    );
    expect(within(status).getByTestId("external-policy-drives").textContent).toBe(
      "drives: Manipulation Arm",
    );
    const confirm = screen.getByTestId("launch-confirm");
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await screen.findByTestId("mode-page");
    expect(posts[0]).toEqual({
      mode: "inference",
      kind: "sim",
      arms: ["grip", "view"],
      frames: { view: "arm_base:view", grip: "arm_base:grip" },
      sim_scene: "mavis_v2",
      start_from: "keep_current",
      policy_source: "external",
    });
    expect(posts[0]).not.toHaveProperty("policy");
  });

  it("Inference sheet with a promoted checkpoint defaults to it; picking 'External policy (dora)' without a node disables Start with the node reason", async () => {
    await mount({
      workcell: makeWorkcell({ policies_available: true }),
      policies: [makePolicy({ policy_id: "ckpt-9" })],
    });
    await ready();
    await waitFor(() => expect(enabled("launch-inference")).toBe(true));
    fireEvent.click(screen.getByTestId("launch-inference"));
    const group = await screen.findByTestId("policy-select");
    expect((within(group).getByTestId("policy-ckpt-9") as HTMLInputElement).checked).toBe(true);
    const external = within(group).getByTestId("policy-external") as HTMLInputElement;
    expect(external.checked).toBe(false);
    expect(within(group).queryByTestId("external-policy-status")).toBeNull();
    fireEvent.click(external);
    expect(external.checked).toBe(true);
    expect((within(group).getByTestId("policy-ckpt-9") as HTMLInputElement).checked).toBe(false);
    expect(group.textContent).toContain(
      "Policy node attached over the dora bus — none attached yet",
    );
    expect(within(group).getByTestId("external-policy-chip-none").textContent).toBe(
      "EXTERNAL POLICY none",
    );
    expect(within(group).getByTestId("external-policy-detail").textContent).toContain(
      "telemetry.external absent",
    );
    expect(screen.getByTestId("launch-confirm")).toBeDisabled();
    expect(screen.getByTestId("launch-reason").textContent).toBe(REASON.noExternalPolicy);
    // Back to the checkpoint: Start is possible again and the body names it.
    fireEvent.click(within(group).getByTestId("policy-ckpt-9"));
    expect(external.checked).toBe(false);
    expect(screen.getByTestId("launch-confirm")).toBeEnabled();
    fireEvent.click(screen.getByTestId("launch-confirm"));
    await screen.findByTestId("mode-page");
    expect(posts[0]).toMatchObject({ mode: "inference", policy: "ckpt-9" });
    expect(posts[0]).not.toHaveProperty("policy_source");
  });

  it("Online DAgger sheet (phase-14): Connect view → Configure; the exact SessionSpec with policy_source external + online_dagger, no dataset / policy / hyper-parameter", async () => {
    await mount({
      datasets: [
        makeDataset({ repo_id: "bc_demo/pick_cube", namespace: "bc_demo", task: "pick the cube" }),
      ],
    });
    await ready();
    // Enabled on the Sim tab without any checkpoint in the registry (D1).
    expect(enabled("launch-dagger")).toBe(true);
    expect(screen.getByTestId("launch-dagger").textContent).toContain("Online DAgger");
    expect(screen.getByTestId("launch-dagger").textContent).toContain(
      "Novice drives, you correct — your trainer learns between rollouts",
    );
    // The trainer is attached (telemetry.external) so Start will be possible.
    await pushTelemetry(makeTelemetry({ external: makeTrainerExternal() }));
    fireEvent.click(screen.getByTestId("launch-dagger"));
    const panel = await screen.findByTestId("online-dagger-panel");
    expect(panel.dataset["view"]).toBe("connect");
    expect(screen.getByTestId("online-dagger-step-1").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("skill-oneliner").textContent).toContain(
      "/api/online_dagger/skill.tgz | tar xz -C ~/.claude/skills/",
    );
    expect((await screen.findByTestId("od-fact-bind_host")).textContent).toContain("192.168.0.88");
    expect(screen.getByTestId("od-start-caption").dataset["attached"]).toBe("true");
    fireEvent.click(screen.getByTestId("od-continue"));
    expect(panel.dataset["view"]).toBe("configure");
    // Form: name + task; the recorded demonstrations are NOT offered (the trainer
    // configures its own anchor — operator decision 2026-09-08).
    fireEvent.change(screen.getByTestId("od-session-name"), { target: { value: "Pick Cube v1" } });
    expect(screen.getByTestId("od-path-preview").textContent).toBe(
      "/home/x/data/online_dagger/Pick_Cube_v1",
    );
    expect(panel.querySelector("input[type=radio]")).toBeNull();
    expect(panel.textContent).not.toContain("bc_demo/pick_cube");
    fireEvent.change(screen.getByTestId("od-task"), { target: { value: "pick the cube" } });
    const confirm = screen.getByTestId("launch-confirm");
    expect(confirm.textContent).toBe("Start Online DAgger");
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);
    await screen.findByTestId("mode-page");
    expect(posts[0]).toEqual({
      mode: "dagger",
      kind: "sim",
      arms: ["grip", "view"],
      frames: { grip: "arm_base:grip", view: "arm_base:view" },
      sim_scene: "mavis_v2",
      start_from: "keep_current",
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
        session_name: "Pick_Cube_v1",
        resume: false,
        pause_while_training: true,
        wait_for_trainer_ready: true,
      },
      return_to_start: true,
    });
    expect(posts[0]).not.toHaveProperty("dataset");
    expect(posts[0]).not.toHaveProperty("policy");
  });

  it("Online DAgger sheet: Start is disabled with the trainer reason until a policy node attaches; resume pill from /api/online_dagger/sessions", async () => {
    await mount({ onlineDaggerSessions: [makeOnlineDaggerSession()] });
    await ready();
    fireEvent.click(screen.getByTestId("launch-dagger"));
    await screen.findByTestId("online-dagger-panel");
    expect(screen.getByTestId("od-start-caption").dataset["attached"]).toBe("false");
    fireEvent.click(screen.getByTestId("online-dagger-step-2"));
    fireEvent.change(screen.getByTestId("od-session-name"), { target: { value: "pick_cube_v1" } });
    // The name matches a recorded session → resume pill, its task carried over.
    const pill = await screen.findByTestId("od-resume");
    expect(pill.textContent).toBe("Resume (6 rollouts saved)");
    await waitFor(() =>
      expect((screen.getByTestId("od-task") as HTMLInputElement).value).toBe("pick the cube"),
    );
    expect(screen.getByTestId("launch-confirm")).toBeDisabled();
    expect(screen.getByTestId("launch-reason").textContent).toBe(REASON.noTrainer);
    expect(posts).toHaveLength(0);
  });

  it("dagger stays enabled without checkpoints (external trainer); inference still needs a promoted one or an attached node", async () => {
    await mount();
    await ready();
    expect(enabled("launch-dagger")).toBe(true);
    expect(reasonOf("dagger")).toBe("");
    expect(enabled("launch-inference")).toBe(false);
    expect(reasonOf("inference")).toBe(REASON.noExternalPolicy);
  });

  it("a 409 from POST /api/session shows its detail inside the sheet, which stays open", async () => {
    await mount({ session409: "a session already exists" });
    await ready();
    fireEvent.click(screen.getByTestId("launch-collect"));
    fireEvent.change(await screen.findByTestId("task-input"), {
      target: { value: "stack the cube" },
    });
    fireEvent.change(screen.getByTestId("dataset-name"), { target: { value: "stack" } });
    fireEvent.click(screen.getByTestId("launch-confirm"));
    const err = await screen.findByTestId("launch-error");
    expect(err.textContent).toContain("a session already exists");
    expect(err.getAttribute("role")).toBe("alert");
    expect(screen.getByTestId("launch-sheet")).toBeInTheDocument();
    expect(screen.queryByTestId("mode-page")).toBeNull();
    expect(screen.getByTestId("launch-confirm")).toBeEnabled(); // retry possible
    expect(useStore.getState().toasts).toHaveLength(0); // no duplicate toast
  });

  it("Escape and Cancel close the sheet without posting", async () => {
    await mount();
    await ready();
    fireEvent.click(screen.getByTestId("launch-collect"));
    const host = (await screen.findByTestId("launch-sheet")) as HTMLDialogElement;
    fireEvent.keyDown(host, { key: "Escape" });
    expect(host.open).toBe(false);
    expect(host.dataset["instant"]).toBe(""); // keyboard: no exit animation
    await waitFor(() => expect(screen.queryByTestId("launch-sheet")).toBeNull());
    fireEvent.click(screen.getByTestId("launch-collect"));
    const host2 = (await screen.findByTestId("launch-sheet")) as HTMLDialogElement;
    fireEvent.click(screen.getByTestId("launch-cancel"));
    // Pointer close: the dialog closes now but stays mounted for the 160 ms exit.
    expect(host2.open).toBe(false);
    expect(host2.dataset["instant"]).toBeUndefined();
    expect(screen.getByTestId("launch-sheet")).toBe(host2);
    await waitFor(() => expect(screen.queryByTestId("launch-sheet")).toBeNull());
    expect(posts).toHaveLength(0);
  });

  it('"Load a profile" preselects the initial condition, disables profiles covering other arms, posts profile:<id>', async () => {
    await mount();
    await ready();
    expect(screen.queryByTestId("profile-list")).toBeNull();
    fireEvent.click(screen.getByTestId("start-profile"));
    expect(screen.getByTestId("initial-badge-p0")).toBeInTheDocument();
    expect(screen.queryByTestId("initial-badge-p1")).toBeNull();
    await waitFor(() =>
      expect((screen.getByTestId("profile-p0") as HTMLInputElement).checked).toBe(true),
    );
    expect(screen.getByTestId("profile-row-p1").textContent).toContain("left of bin");
    const third = screen.getByTestId("profile-p2") as HTMLInputElement;
    expect(third.disabled).toBe(true);
    expect(screen.getByTestId("profile-row-p2").textContent).toContain(
      "covers aux — not in this workcell",
    );
    // The sheet shows the chosen profile in its context line.
    fireEvent.click(screen.getByTestId("launch-collect"));
    const panel = await screen.findByTestId("launch-sheet-panel");
    expect(panel.textContent).toContain("Sim · APOLLO MAVIS V2 Digital Twin · Profile: start");
    fireEvent.click(screen.getByTestId("launch-cancel"));
    await waitFor(() => expect(screen.queryByTestId("launch-sheet")).toBeNull());
    fireEvent.click(screen.getByTestId("launch-teleop"));
    await screen.findByTestId("mode-page");
    expect((posts[0] as { start_from: string }).start_from).toBe("profile:p0");
  });

  it("profile delete (2026-09-07): confirm dialog first, then DELETE + re-read; the click never selects the row", async () => {
    await mount();
    await ready();
    fireEvent.click(screen.getByTestId("start-profile"));
    await waitFor(() =>
      expect((screen.getByTestId("profile-p0") as HTMLInputElement).checked).toBe(true),
    );
    // Clicking delete inside the row's <label> must not move the radio.
    fireEvent.click(screen.getByTestId("profile-delete-p1"));
    expect((screen.getByTestId("profile-p1") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId("profile-p0") as HTMLInputElement).checked).toBe(true);
    expect(deletes).toHaveLength(0); // dialog open, nothing sent yet
    expect(screen.getByTestId("confirm-dialog").textContent).toContain("alt");
    // Cancel sends nothing.
    fireEvent.click(screen.getByTestId("confirm-cancel"));
    await waitFor(() => expect(screen.queryByTestId("confirm-dialog")).toBeNull());
    expect(deletes).toHaveLength(0);
    expect(screen.getByTestId("profile-row-p1")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("profile-delete-p1"));
    fireEvent.click(screen.getByTestId("confirm-ok"));
    await waitFor(() => expect(screen.queryByTestId("profile-row-p1")).toBeNull());
    expect(deletes).toEqual(["p1"]);
    expect(screen.getByTestId("profile-row-p0")).toBeInTheDocument();
    expect(screen.getByTestId("toasts").textContent).toContain("Deleted profile 'alt'");
  });

  it("deleting the SELECTED profile clears the selection; a 409 keeps the row and says why in the operator's words", async () => {
    // The runtime's own text names an id the operator never sees.
    await mount({
      profileDelete409:
        "refusing to delete initial-condition profile 'p0'; designate another profile first",
    });
    await ready();
    fireEvent.click(screen.getByTestId("start-profile"));
    await waitFor(() =>
      expect((screen.getByTestId("profile-p0") as HTMLInputElement).checked).toBe(true),
    );
    // The initial-condition row warns about what it is before deleting it.
    fireEvent.click(screen.getByTestId("profile-delete-p0"));
    expect(screen.getByTestId("confirm-dialog").textContent).toContain("initial condition");
    fireEvent.click(screen.getByTestId("confirm-ok"));
    await waitFor(() =>
      expect(screen.getByTestId("toasts").textContent).toContain(
        "'start' is the initial condition of the Sim workcell — designate another profile as the initial condition first",
      ),
    );
    expect(screen.getByTestId("toasts").textContent).not.toContain("refusing to delete");
    expect(screen.getByTestId("profile-row-p0")).toBeInTheDocument(); // refused → still there
    expect(enabled("launch-teleop")).toBe(true); // still selected, still launchable
  });

  it("the profile list shows the TAB's profiles only (2026-09-08): one initial condition per kind, kind-less rows on both, the selection follows the tab", async () => {
    await mount({
      profiles: [
        makeProfile({
          profile_id: "s0",
          name: "default posture (2026-09-08)",
          is_initial_condition: true,
          workcell_kind: "sim",
        }),
        makeProfile({
          profile_id: "h0",
          name: "default posture (2026-09-08)",
          is_initial_condition: true,
          workcell_kind: "hardware",
        }),
        makeProfile({ profile_id: "l0", name: "legacy", workcell_kind: undefined }),
      ],
    });
    await ready();
    fireEvent.click(screen.getByTestId("start-profile"));
    const list = screen.getByTestId("profile-list");
    expect(list.dataset["kind"]).toBe("sim");
    expect(list.dataset["count"]).toBe("2");
    expect(screen.getByTestId("profile-row-s0")).toBeInTheDocument();
    expect(screen.queryByTestId("profile-row-h0")).toBeNull();
    expect(screen.getByTestId("profile-row-l0")).toBeInTheDocument();
    expect(screen.getByTestId("initial-badge-s0")).toBeInTheDocument();
    // The SIM initial condition is preselected — never the hidden hardware one.
    await waitFor(() =>
      expect((screen.getByTestId("profile-s0") as HTMLInputElement).checked).toBe(true),
    );

    await switchTab("hardware");
    const hwList = screen.getByTestId("profile-list");
    expect(hwList.dataset["kind"]).toBe("hardware");
    expect(hwList.dataset["count"]).toBe("2");
    expect(screen.getByTestId("profile-row-h0")).toBeInTheDocument();
    expect(screen.queryByTestId("profile-row-s0")).toBeNull();
    expect(screen.getByTestId("profile-row-l0")).toBeInTheDocument();
    expect(screen.getByTestId("initial-badge-h0")).toBeInTheDocument();
    // The Sim selection is dropped (its row is not on this tab) and the Hardware
    // initial condition takes its place.
    await waitFor(() =>
      expect((screen.getByTestId("profile-h0") as HTMLInputElement).checked).toBe(true),
    );
  });

  it("empty profile list shows the Teleop hint and blocks a profile start", async () => {
    await mount({ profiles: [] });
    await ready();
    fireEvent.click(screen.getByTestId("start-profile"));
    expect(screen.getByTestId("profile-empty").textContent).toBe(
      "No saved profiles — save one from Teleop",
    );
    expect(enabled("launch-teleop")).toBe(false);
    expect(reasonOf("teleop")).toContain("Select a profile to load");
    fireEvent.click(screen.getByTestId("start-keep-current"));
    expect(screen.queryByTestId("profile-list")).toBeNull();
    expect(enabled("launch-teleop")).toBe(true);
  });

  it("keymap failure → visible reason with an inline Retry that re-fetches", async () => {
    await mount({ keymapFails: true });
    await waitFor(() => expect(reasonOf("teleop")).toContain("Keymap unavailable — retry"));
    expect(enabled("launch-teleop")).toBe(false);
    const retry = screen.getByTestId("keymap-retry");
    // Fix the runtime, retry → enabled.
    installFetch();
    fireEvent.click(retry);
    await ready();
    expect(screen.queryByTestId("keymap-retry")).toBeNull();
  });

  it("Advanced disclosure: per-arm FrameSelector serializes camera:<id>", async () => {
    await mount();
    await ready();
    fireEvent.click(screen.getByTestId("launch-collect"));
    await screen.findByTestId("launch-sheet");
    fireEvent.change(screen.getByTestId("task-input"), { target: { value: "stack" } });
    fireEvent.change(screen.getByTestId("dataset-name"), { target: { value: "stack" } });
    fireEvent.change(screen.getByTestId("frame-selector-grip"), {
      target: { value: "camera:grip_wrist_cam" },
    });
    fireEvent.click(screen.getByTestId("launch-confirm"));
    await screen.findByTestId("mode-page");
    expect((posts[0] as { frames: Record<string, string> }).frames).toEqual({
      view: "arm_base:view",
      grip: "camera:grip_wrist_cam",
    });
  });

  it("first-mount reveal runs once per session (sessionStorage flag)", async () => {
    const first = await mount();
    const hero = screen.getByTestId("hero-title").parentElement as HTMLElement;
    expect(hero.className).toContain("enter-hero");
    expect(screen.getByTestId("launch-teleop").className).toContain("enter-fade");
    expect(sessionStorage.getItem(REVEAL_FLAG)).not.toBeNull();
    first.unmount();
    await mount();
    const hero2 = screen.getByTestId("hero-title").parentElement as HTMLElement;
    expect(hero2.className).not.toContain("enter-hero");
    expect(screen.getByTestId("launch-teleop").className).not.toContain("enter-fade");
  });

  it("keyboard tab switching is instant: no leaving pane, data-instant on the incoming pane", async () => {
    await mount();
    await ready();
    fireEvent.keyDown(screen.getByTestId("kind-toggle"), { key: "ArrowLeft" });
    expect(screen.getByTestId("pane-hardware").hasAttribute("data-instant")).toBe(true);
    expect(document.querySelector(".pane-leave")).toBeNull();
    // Pointer switch back: the outgoing pane fades (kept ~120 ms), then unmounts.
    fireEvent.click(screen.getByTestId("kind-sim"));
    expect(screen.getByTestId("pane-sim").hasAttribute("data-instant")).toBe(false);
    expect(document.querySelector(".pane-leave")?.getAttribute("data-tab")).toBe("hardware");
    await waitFor(() => expect(document.querySelector(".pane-leave")).toBeNull());
  });

  it("polls GET /api/workcell?kind=hardware only while the Hardware tab is visible", async () => {
    await mount();
    await ready();
    expect(hardwarePolls).toBe(0);
    await switchTab("hardware");
    await waitFor(() => expect(hardwarePolls).toBeGreaterThanOrEqual(3));
    await switchTab("sim");
    const settled = hardwarePolls;
    await new Promise((r) => setTimeout(r, 200));
    expect(hardwarePolls).toBeLessThanOrEqual(settled + 1); // at most one in-flight tick
  });

  it("a runtime without ?kind support degrades to 'Searching for arms…' with modes disabled", async () => {
    await mount({
      hardware: null,
      workcell: makeWorkcell({ available_kinds: ["hardware", "sim"] }),
    });
    await ready();
    await switchTab("hardware");
    await waitFor(() => expect(hardwarePolls).toBeGreaterThan(0));
    expect(screen.getByTestId("arm-card-placeholder").textContent).toContain("Searching for arms…");
    expect(reasonOf("teleop")).toContain("Requires real arms — none detected");
  });

  it("Hardware tab re-polls /api/microphones, so a mic tile missing at mount (runtime restarting) comes back", async () => {
    const api: MockApi = { microphones: 404 };
    await mount(api);
    await switchTab("hardware");
    expect(screen.queryByTestId("mic-tile")).toBeNull();
    api.microphones = [makeMicrophoneInfo()];
    await screen.findByTestId("mic-tile", {}, { timeout: 2000 });
  });

  it("remembers the chosen tab across reloads (localStorage)", async () => {
    localStorage.setItem("mavis.welcome.tab", "hardware");
    installFetch();
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<Landing hardwarePollMs={50} />} />
        </Routes>
      </MemoryRouter>,
    );
    const hw = await screen.findByTestId("kind-hardware");
    await waitFor(() => expect(hw.getAttribute("aria-selected")).toBe("true"));
    await screen.findByTestId("camera-preview-grid");
    await switchTab("sim");
    expect(localStorage.getItem("mavis.welcome.tab")).toBe("sim");
  });
});

// ---------------------------------------------------------------------------------
// Controller line + Setting tab (2026-09-07)
// ---------------------------------------------------------------------------------
describe("Welcome page — controller", () => {
  const live = makeTracker({
    backend: "libsurvive",
    status: "tracking",
    dongle_present: true,
    objects: ["WM0"],
    controller_age_s: 1.0,
    calibration: makeCalibration(),
  });

  it("shows the controller link on the Sim tab AND the Hardware tab", async () => {
    await mount();
    await ready();
    // Telemetry is connected on every tab now, not only on Hardware.
    await pushTelemetry(makeTelemetry({ tracker: live }));
    await waitFor(() =>
      expect(screen.getByTestId("controller-link-sim").getAttribute("data-state")).toBe(
        "connected",
      ),
    );
    await switchTab("hardware");
    expect(screen.getByTestId("controller-link-hardware").getAttribute("data-state")).toBe(
      "connected",
    );
    // The workcell caption is untouched by the controller line (separate node).
    expect(screen.getByTestId("status-hardware").textContent).not.toMatch(/Controller/);
  });

  it("reports an unpaired controller instead of claiming it is connected", async () => {
    await mount();
    await ready();
    await pushTelemetry(
      makeTelemetry({
        tracker: makeTracker({
          backend: "libsurvive",
          status: "searching",
          dongle_present: true,
          objects: [],
        }),
      }),
    );
    await waitFor(() => {
      const pill = screen.getByTestId("controller-link-sim");
      expect(pill.getAttribute("data-state")).toBe("unpaired");
      expect(pill.textContent).toBe("Controller not detected");
    });
  });

  it("opens the Setting tab from the pill and shows the four device panels", async () => {
    await mount();
    await ready();
    await pushTelemetry(makeTelemetry({ tracker: live }));
    fireEvent.click(screen.getByTestId("controller-setup-sim"));
    // The outgoing pane lingers for the 120 ms crossfade: wait for it to go.
    await waitFor(() => {
      expect(screen.getByTestId("pane-setting")).toBeInTheDocument();
      expect(document.querySelector(".pane-leave")).toBeNull();
    });
    expect(screen.getByTestId("kind-setting").getAttribute("aria-selected")).toBe("true");
    for (const id of ["controller-panel", "pairing-panel", "calibration-panel", "angle-panel"]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
    // Device set-up only: nothing that launches a session is on this tab.
    expect(screen.queryByTestId("launch-teleop")).toBeNull();
    expect(screen.queryByTestId("start-from")).toBeNull();
    expect(screen.queryByTestId("camera-preview-grid")).toBeNull();
    expect(localStorage.getItem("mavis.welcome.tab")).toBe("setting");
  });

  it("offers both calibrations and explains why the live fields are disabled", async () => {
    await mount();
    await ready();
    await pushTelemetry(makeTelemetry({ tracker: live }));
    await switchTab("setting");
    // Session-less: both wizards are reachable (they are REST flows) …
    expect(screen.getByTestId("calibration-open-base_station")).toBeEnabled();
    expect(screen.getByTestId("calibration-open-yaw")).toBeEnabled();
    // … while the live tracker_settings fields need a running control loop.
    expect(screen.getByTestId("tracker-settings")).toBeDisabled();
    expect(screen.getByTestId("tracker-settings-disabled").textContent).toMatch(
      /Start a session to tune/,
    );
    expect(screen.getByTestId("angle-live").textContent).toBe("yaw 0°");
  });

  it("blocks every launcher while a tracker calibration run is live", async () => {
    // The runtime 409s POST /api/session then (rest.py post_session), and both
    // wizards are reachable from this page now — the launcher must say it.
    await mount();
    await ready();
    await pushTelemetry(
      makeTelemetry({
        tracker: makeTracker({
          ...live,
          calibration: makeCalibration({ kind: "yaw", phase: "capturing" }),
        }),
      }),
    );
    await waitFor(() => expect(enabled("launch-teleop")).toBe(false));
    expect(reasonOf("teleop")).toContain("Tracker calibration in progress");
    // Finished and applied → the gate lifts again.
    await pushTelemetry(
      makeTelemetry({ seq: 2, tracker: makeTracker({ ...live, calibration: makeCalibration() }) }),
    );
    await waitFor(() => expect(enabled("launch-teleop")).toBe(true));
  });

  it("degrades honestly on the shipped config (tracker.backend: fake)", async () => {
    await mount();
    await ready();
    // The repo default: a scripted circle, no real controller.
    await pushTelemetry(
      makeTelemetry({
        tracker: makeTracker({
          backend: "fake",
          status: "tracking",
          calibration: makeCalibration(),
        }),
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("controller-link-sim").getAttribute("data-state")).toBe("fake"),
    );
    expect(screen.getByTestId("controller-link-sim").textContent).toBe("Controller simulated");
    await switchTab("setting");
    // The yaw gesture works on the fake backend; a base-station run would 409.
    expect(screen.getByTestId("calibration-open-yaw")).toBeEnabled();
    expect(screen.getByTestId("calibration-open-base_station")).toBeDisabled();
    expect(screen.getByTestId("calibration-kind-note").textContent).toContain("libsurvive");
  });

  it("opens the yaw wizard from the Setting tab", async () => {
    await mount();
    await ready();
    await pushTelemetry(makeTelemetry({ tracker: live }));
    await switchTab("setting");
    fireEvent.click(screen.getByTestId("calibration-open-yaw"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByTestId("wizard-start")).toBeInTheDocument();
  });
});
