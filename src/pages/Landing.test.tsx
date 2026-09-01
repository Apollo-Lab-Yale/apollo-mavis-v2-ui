import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  KEYMAP,
  makeCamera,
  makeProfile,
  makeScene,
  makeWorkcell,
} from "../../tests/mocks/fixtures";
import type { PolicyInfo, SceneInfo, WorkcellStatus } from "../gen";
import { useStore } from "../store";
import { buildSpec, Landing, validateLaunch, type LandingSelection } from "./Landing";

interface MockApi {
  workcell?: WorkcellStatus;
  simScenes?: SceneInfo[];
  twinScenes?: SceneInfo[];
  policies?: PolicyInfo[];
  keymapFails?: boolean;
}

const posts: unknown[] = [];

function installFetch(api: MockApi = {}) {
  posts.length = 0;
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/session") && init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)));
        return json({
          session_id: "s1",
          epoch: "e1",
          mode: (JSON.parse(String(init.body)) as { mode: string }).mode,
          arms: ["arm0"],
          streams: ["sim"],
          state: "running",
        });
      }
      if (url.includes("/api/workcell")) return json(api.workcell ?? makeWorkcell());
      if (url.includes("/api/cameras")) return json([makeCamera({ live: false })]);
      if (url.includes("/api/scenes?kind=sim")) return json(api.simScenes ?? [makeScene()]);
      if (url.includes("/api/scenes?kind=twin"))
        return json(api.twinScenes ?? [makeScene({ scene_id: "twin1", kind: "twin" })]);
      if (url.includes("/api/profiles"))
        return json([
          makeProfile({ profile_id: "p0", name: "start", is_initial_condition: true }),
          makeProfile({ profile_id: "p1", name: "alt" }),
        ]);
      if (url.includes("/api/policies")) return json(api.policies ?? []);
      if (url.includes("/api/keymap")) return api.keymapFails ? json("boom", 500) : json(KEYMAP);
      throw new Error(`unmocked fetch ${url}`);
    }),
  );
}

async function mount(api: MockApi = {}) {
  installFetch(api);
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/:mode" element={<div data-testid="mode-page" />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByTestId("arm-card-arm0");
}

afterEach(() => {
  vi.unstubAllGlobals();
  useStore.getState().resetForEpochChange();
  useStore.getState().setWorkcell(null);
});

const baseSel: LandingSelection = {
  kind: "sim",
  arms: ["arm0"],
  frames: { arm0: "arm_base:arm0" },
  simScene: "tabletop",
  twinScene: null,
  startFrom: "keep_current",
  profileId: null,
  task: "",
  policyId: null,
  keymapOk: true,
  policiesAvailable: false,
};

describe("validateLaunch (matrix)", () => {
  it("passes teleop with arms + scene + keymap", () => {
    expect(validateLaunch("teleop", baseSel)).toBeNull();
  });
  it("blocks with no arms", () => {
    expect(validateLaunch("teleop", { ...baseSel, arms: [] })).toMatch(/arm/);
  });
  it("blocks sim without a sim scene", () => {
    expect(validateLaunch("teleop", { ...baseSel, simScene: null })).toMatch(/sim scene/);
  });
  it("blocks hardware without a twin scene", () => {
    expect(validateLaunch("teleop", { ...baseSel, kind: "hardware", simScene: null })).toMatch(
      /digital-twin/,
    );
  });
  it("blocks profile start without a profile", () => {
    expect(validateLaunch("teleop", { ...baseSel, startFrom: "profile" })).toMatch(/profile/);
  });
  it("blocks collect/dagger with an empty task", () => {
    expect(validateLaunch("collect", baseSel)).toMatch(/Task/);
    expect(validateLaunch("dagger", { ...baseSel, policiesAvailable: true })).toMatch(/Task/);
    expect(validateLaunch("collect", { ...baseSel, task: "stack cubes" })).toBeNull();
  });
  it("blocks dagger/inference without policies", () => {
    expect(validateLaunch("dagger", { ...baseSel, task: "t" })).toMatch(/polic/i);
    expect(validateLaunch("inference", baseSel)).toMatch(/polic/i);
  });
  it("blocks when the keymap failed to load", () => {
    expect(validateLaunch("teleop", { ...baseSel, keymapOk: false })).toMatch(/Keymap/);
  });
});

describe("buildSpec", () => {
  it("serializes start_from and per-arm frames", () => {
    const spec = buildSpec("teleop", {
      ...baseSel,
      startFrom: "profile",
      profileId: "p0",
      frames: { arm0: "camera:cam0" },
    });
    expect(spec.start_from).toBe("profile:p0");
    expect(spec.frames).toEqual({ arm0: "camera:cam0" });
    expect(spec.sim_scene).toBe("tabletop");
    expect(spec.task).toBeUndefined(); // teleop has no task
  });
});

describe("Landing page", () => {
  it("disables mode buttons until a scene is picked, then launches with the right payload", async () => {
    await mount();
    const teleop = screen.getByTestId("launch-teleop");
    expect(teleop).toBeDisabled(); // no scene yet
    fireEvent.click(screen.getByTestId("scene-tabletop"));
    expect(teleop).toBeEnabled();
    fireEvent.click(teleop);
    await screen.findByTestId("mode-page");
    expect(posts[0]).toEqual({
      mode: "teleop",
      kind: "sim",
      arms: ["arm0"],
      frames: { arm0: "arm_base:arm0" },
      sim_scene: "tabletop",
      start_from: "keep_current",
    });
  });

  it("deselecting every arm disables the mode buttons", async () => {
    await mount();
    fireEvent.click(screen.getByTestId("scene-tabletop"));
    fireEvent.click(screen.getByTestId("include-arm0"));
    expect(screen.getByTestId("launch-teleop")).toBeDisabled();
  });

  it("hardware kind with no twin scenes blocks submit", async () => {
    await mount({
      workcell: makeWorkcell({ kind: "hardware", available_kinds: ["hardware", "sim"] }),
      twinScenes: [],
    });
    await waitFor(() => expect(screen.getByTestId("scene-picker-twin")).toBeInTheDocument());
    const teleop = screen.getByTestId("launch-teleop");
    expect(teleop).toBeDisabled();
    expect(teleop.title).toMatch(/digital-twin/);
  });

  it('"Load selected profile" requires a selection; the initial profile is preselected', async () => {
    await mount();
    fireEvent.click(screen.getByTestId("scene-tabletop"));
    fireEvent.click(screen.getByTestId("start-profile"));
    // Designated initial condition is badge-flagged and preselected.
    expect(screen.getByTestId("initial-badge-p0")).toBeInTheDocument();
    expect(screen.queryByTestId("initial-badge-p1")).toBeNull();
    await waitFor(() =>
      expect((screen.getByTestId("profile-p0") as HTMLInputElement).checked).toBe(true),
    );
    expect(screen.getByTestId("launch-teleop")).toBeEnabled();
    fireEvent.click(screen.getByTestId("launch-teleop"));
    await screen.findByTestId("mode-page");
    expect((posts[0] as { start_from: string }).start_from).toBe("profile:p0");
  });

  it("collect requires a task; payload carries it", async () => {
    await mount();
    fireEvent.click(screen.getByTestId("scene-tabletop"));
    const collect = screen.getByTestId("launch-collect");
    expect(collect).toBeDisabled();
    fireEvent.change(screen.getByTestId("task-input"), { target: { value: "stack the cube" } });
    expect(collect).toBeEnabled();
    fireEvent.click(collect);
    await screen.findByTestId("mode-page");
    expect(posts[0]).toMatchObject({ mode: "collect", task: "stack the cube" });
  });

  it("dagger/inference disabled without policies; enabled + payload carries policy when available", async () => {
    const policies: PolicyInfo[] = [
      {
        policy_id: "ckpt-9",
        path: "/ckpts/9",
        action_space: "delta_ee",
        action_frame: "arm_base:arm0",
        policy_version: 9,
        promoted: true,
      },
    ];
    await mount({
      workcell: makeWorkcell({ policies_available: true }),
      policies,
    });
    fireEvent.click(screen.getByTestId("scene-tabletop"));
    fireEvent.change(screen.getByTestId("task-input"), { target: { value: "sort" } });
    await waitFor(() => expect(screen.getByTestId("launch-dagger")).toBeEnabled());
    expect(screen.getByTestId("launch-inference")).toBeEnabled();
    fireEvent.click(screen.getByTestId("launch-dagger"));
    await screen.findByTestId("mode-page");
    expect(posts[0]).toMatchObject({ mode: "dagger", task: "sort", policy: "ckpt-9" });
  });

  it("dagger/inference stay disabled when policies_available is false", async () => {
    await mount();
    fireEvent.click(screen.getByTestId("scene-tabletop"));
    fireEvent.change(screen.getByTestId("task-input"), { target: { value: "sort" } });
    expect(screen.getByTestId("launch-dagger")).toBeDisabled();
    expect(screen.getByTestId("launch-inference")).toBeDisabled();
  });

  it("FrameSelector serializes world / camera:<id>", async () => {
    await mount();
    fireEvent.click(screen.getByTestId("scene-tabletop"));
    fireEvent.change(screen.getByTestId("frame-selector-arm0"), {
      target: { value: "camera:cam0" },
    });
    fireEvent.click(screen.getByTestId("launch-teleop"));
    await screen.findByTestId("mode-page");
    expect((posts[0] as { frames: Record<string, string> }).frames).toEqual({
      arm0: "camera:cam0",
    });
  });

  it("keymap failure disables launches and offers retry", async () => {
    await mount({ keymapFails: true });
    await screen.findByTestId("keymap-failed");
    expect(screen.getByTestId("launch-teleop")).toBeDisabled();
    expect(screen.getByTestId("keymap-retry")).toBeInTheDocument();
  });
});
