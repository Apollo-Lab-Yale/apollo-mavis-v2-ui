/** GelloSheet (phase-15; 16-gello §11): three views behind the segmented header (all
 * mounted, one visible), the Leader view from a polled `GET /api/gello` (chip, facts,
 * raw-vs-mapped joint table, the four calibrate ops with their result / 409; `match_arm`
 * over a stored calibration asks first), the Viewpoint radios (→ `gello.viewpoint`)
 * with the external-node chip and warning, the Start-posture view from a polled
 * `POST /api/gello/preview` (PNG, verdict, pairs, leader-vs-goal table; a slow runtime
 * greys the verdict as STALE, a failed poll reads "unavailable" and the chain goes on),
 * Start gated on leader connected + latest preview `clear` and fresh (the footer reason
 * names the actual blocker), the EXACT SessionSpec posted, a 409 shown in place while
 * polling continues, a runtime without the routes degrading honestly, and the initial
 * focus on Cancel (2026-09-09 review). */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeExternal,
  makeGelloInfo,
  makeGelloPreview,
  TINY_PNG_B64,
} from "../../tests/mocks/fixtures";
import type { GelloCalibrateRequest, GelloInfo, GelloPreviewResult, SessionSpec } from "../gen";
import { REASON, type LandingSelection } from "../lib/launch";
import {
  deg,
  GELLO_PREVIEW_POLL_MS,
  GELLO_PREVIEW_STALE_FACTOR,
  GelloSheet,
  leaderChip,
  MATCH_ARM_OVERWRITE_TEXT,
  previewVerdict,
} from "./GelloSheet";

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
const hwSel: LandingSelection = {
  ...sel,
  tab: "hardware",
  kind: "hardware",
  simScene: null,
  twinScene: "mavis_v2",
  hardwareReady: true,
  hardwareConfigured: true,
  speedScale: 0.5,
};

/** The mock runtime — mutable so a test can move the leader / flip the verdict mid-way. */
const api = {
  info: makeGelloInfo() as GelloInfo | 404,
  preview: makeGelloPreview() as GelloPreviewResult | 404,
  /** Awaited before every preview answer (a stalled runtime); null = answer at once. */
  previewDelay: null as Promise<void> | null,
  /** The preview fetch rejects like an `AbortSignal.timeout` would. */
  previewTimeout: false,
  calibrate409: null as string | null,
  session409: null as string | null,
};
const posts: SessionSpec[] = [];
const calibrates: GelloCalibrateRequest[] = [];
const previews: unknown[] = [];
let infoFetches = 0;

function installFetch() {
  api.info = makeGelloInfo();
  api.preview = makeGelloPreview();
  api.previewDelay = null;
  api.previewTimeout = false;
  api.calibrate409 = null;
  api.session409 = null;
  posts.length = 0;
  calibrates.length = 0;
  previews.length = 0;
  infoFetches = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status });
      if (url === "/api/gello") {
        infoFetches += 1;
        return api.info === 404 ? json({ detail: "Not Found" }, 404) : json(api.info);
      }
      if (url === "/api/gello/preview") {
        previews.push(JSON.parse(String(init?.body)));
        if (api.previewDelay) await api.previewDelay;
        if (api.previewTimeout) throw new DOMException("signal timed out", "TimeoutError");
        return api.preview === 404 ? json({ detail: "Not Found" }, 404) : json(api.preview);
      }
      if (url === "/api/gello/calibrate") {
        const body = JSON.parse(String(init?.body)) as GelloCalibrateRequest;
        calibrates.push(body);
        if (api.calibrate409) return json({ detail: api.calibrate409 }, 409);
        return json({
          ok: true,
          detail: `${body.op} stored`,
          joint_offsets_rad: [0, 0, 0, 0, 0, 0, 0],
        });
      }
      if (url === "/api/session" && init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)) as SessionSpec);
        if (api.session409) return json({ detail: api.session409 }, 409);
        return json({
          session_id: "s-gello",
          epoch: "e1",
          mode: "gello",
          arms: ["grip", "view"],
          streams: ["sim"],
          state: "running",
        });
      }
      throw new Error(`unmocked fetch ${url}`);
    }),
  );
}

/** 20 ms polls; the staleness bound is widened (the default 3 x 20 ms would trip under a
 * loaded test box) except where a test exercises it. */
const mount = (over: Partial<React.ComponentProps<typeof GelloSheet>> = {}) => {
  const onLaunched = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <GelloSheet
      sel={sel}
      external={null}
      onLaunched={onLaunched}
      onClose={onClose}
      infoPollMs={20}
      previewPollMs={20}
      previewStaleMs={10_000}
      {...over}
    />,
  );
  return { ...utils, onLaunched, onClose };
};

const verdictStatus = () => screen.getByTestId("gello-verdict").dataset["status"];

beforeEach(() => installFetch());
afterEach(() => vi.unstubAllGlobals());

describe("pure helpers", () => {
  it("previewVerdict / leaderChip / deg", () => {
    expect(previewVerdict(null)).toMatchObject({ tone: "grey", label: "—" });
    expect(previewVerdict(makeGelloPreview())).toMatchObject({
      tone: "green",
      label: "CLEAR",
      pairs: [],
    });
    expect(
      previewVerdict(
        makeGelloPreview({
          status: "collision",
          detail: "GELLO posture collides",
          pairs: [
            { a: "fridge_body", b: "grip_link6", dist_m: 0.0031 },
            { a: "fridge_door_handle", b: "grip_link7", dist_m: 0.0119 },
          ],
        }),
      ),
    ).toEqual({
      tone: "red",
      label: "COLLISION",
      text: "GELLO posture collides",
      pairs: ["fridge_body ↔ grip_link6 at 3 mm", "fridge_door_handle ↔ grip_link7 at 12 mm"],
    });
    expect(
      previewVerdict(
        makeGelloPreview({ status: "joint_limit", detail: "joint 1 = 6.40 rad, limit ±6.28" }),
      ),
    ).toMatchObject({
      tone: "amber",
      label: "JOINT LIMIT",
      text: "joint 1 = 6.40 rad, limit ±6.28",
    });
    expect(previewVerdict(makeGelloPreview({ status: "no_leader" })).tone).toBe("amber");
    expect(previewVerdict(makeGelloPreview({ status: "not_calibrated" })).tone).toBe("amber");
    expect(previewVerdict(makeGelloPreview({ status: "no_workcell" })).tone).toBe("red");
    expect(previewVerdict(makeGelloPreview({ status: "scene_error" })).tone).toBe("red");
    // Stale outranks whatever the old result said (2026-09-09 review).
    expect(previewVerdict(makeGelloPreview(), true)).toMatchObject({
      tone: "grey",
      label: "PREVIEW STALE",
      pairs: [],
    });
    expect(previewVerdict(null, true).label).toBe("—"); // nothing in hand: not "stale"
    expect(GELLO_PREVIEW_STALE_FACTOR).toBe(3);
    expect(GELLO_PREVIEW_STALE_FACTOR * GELLO_PREVIEW_POLL_MS).toBe(1500);
    expect(leaderChip(null)).toEqual({ tone: "grey", label: "LEADER —" });
    expect(leaderChip(makeGelloInfo())).toEqual({ tone: "green", label: "LEADER connected" });
    expect(leaderChip(makeGelloInfo({ status: "stale" })).tone).toBe("amber");
    expect(leaderChip(makeGelloInfo({ status: "starting" })).tone).toBe("amber");
    expect(leaderChip(makeGelloInfo({ status: "error" })).tone).toBe("red");
    expect(leaderChip(makeGelloInfo({ status: "no_backend" })).tone).toBe("grey");
    expect(deg(Math.PI)).toBe("180.0");
    expect(deg(null)).toBe("—");
    expect(deg(undefined)).toBe("—");
  });
});

describe("<GelloSheet>", () => {
  it("opens on Leader: chip, facts, seven raw-vs-mapped joint rows; the header switches views, all mounted", async () => {
    mount();
    const panel = screen.getByTestId("gello-panel");
    expect(panel.dataset["view"]).toBe("leader");
    expect(screen.getByTestId("gello-view-leader").hidden).toBe(false);
    expect(screen.getByTestId("gello-view-viewpoint").hidden).toBe(true);
    expect(screen.getByTestId("gello-view-posture").hidden).toBe(true);
    await waitFor(() =>
      expect(screen.getByTestId("gello-leader-chip").textContent).toBe("LEADER connected"),
    );
    expect(screen.getByTestId("gello-rate").textContent).toBe("100 Hz");
    expect(screen.getByTestId("gello-age").textContent).toBe("8 ms");
    expect(screen.getByTestId("gello-calibrated").textContent).toBe("yes");
    expect(screen.getByTestId("gello-port").textContent).toBe("—");
    const rows = screen.getByTestId("gello-joint-table").querySelectorAll("tbody tr");
    expect(rows).toHaveLength(7);
    expect(rows[0]!.textContent).toBe("J1180.0180.010.0"); // raw ° · mapped ° · sign · offset °
    expect(screen.getByTestId("gello-calibrate-instruction").textContent).toBe(
      "Pose GELLO like the Manipulation Arm, then click Calibrate.",
    );
    fireEvent.click(screen.getByTestId("gello-step-viewpoint"));
    expect(panel.dataset["view"]).toBe("viewpoint");
    expect(screen.getByTestId("gello-view-viewpoint").hidden).toBe(false);
    fireEvent.click(screen.getByTestId("gello-step-posture"));
    expect(panel.dataset["view"]).toBe("posture");
    // The info keeps polling.
    const n = infoFetches;
    await waitFor(() => expect(infoFetches).toBeGreaterThan(n + 1));
  });

  it("initial focus lands on Cancel, never on a calibrate button (a held Enter used to fire match_arm)", async () => {
    mount();
    expect(document.activeElement).toBe(screen.getByTestId("launch-cancel"));
    expect(screen.getByTestId("launch-cancel").hasAttribute("data-autofocus")).toBe(true);
    // An Enter repeat on the focused control asks the owner to close — nothing is calibrated.
    fireEvent.click(document.activeElement!);
    await waitFor(() =>
      expect(screen.getByTestId("gello-leader-chip").textContent).toBe("LEADER connected"),
    );
    expect(calibrates).toEqual([]);
  });

  it("preview clear + leader connected enables Start; Start posts the EXACT spec with the scene from GET /api/gello", async () => {
    const { onLaunched } = mount();
    await waitFor(() => expect(verdictStatus()).toBe("clear"));
    expect(screen.getByTestId("gello-preview-img").getAttribute("src")).toBe(
      `data:image/png;base64,${TINY_PNG_B64}`,
    );
    expect(screen.getByTestId("gello-verdict-chip").textContent).toBe("CLEAR");
    // Leader vs arm goal, plus the rail row from q_goal.grip[7].
    const goal = screen.getByTestId("gello-goal-table");
    expect(goal.querySelectorAll("tbody tr")).toHaveLength(8);
    expect(screen.getByTestId("gello-goal-J1").textContent).toBe("J1180.0180.0");
    expect(screen.getByTestId("gello-goal-rail").textContent).toBe("rail—0.200 m");
    // The preview body carries the kind and the scene once the info answered.
    await waitFor(() =>
      expect(previews[previews.length - 1]).toEqual({ kind: "sim", scene: "mavis_v2_kitchen" }),
    );
    const confirm = screen.getByTestId("launch-confirm");
    expect(confirm.textContent).toBe("Start GELLO Manipulation");
    await waitFor(() => expect(confirm).toBeEnabled());
    expect(screen.queryByTestId("launch-reason")).toBeNull();
    fireEvent.click(confirm);
    await waitFor(() => expect(onLaunched).toHaveBeenCalledTimes(1));
    expect(posts).toEqual([
      {
        mode: "gello",
        kind: "sim",
        arms: ["grip", "view"],
        frames: { grip: "arm_base:grip", view: "arm_base:view" },
        sim_scene: "mavis_v2_kitchen",
        start_from: "keep_current",
        gello: { viewpoint: "auto" },
      },
    ]);
    expect(onLaunched.mock.calls[0]![0]).toMatchObject({ session_id: "s-gello", mode: "gello" });
  });

  it("hardware: speed_scale travels in the preview body and the spec; a refused runtime warns", async () => {
    api.info = makeGelloInfo({ hardware_admitted: false });
    mount({ sel: hwSel });
    await waitFor(() =>
      expect(previews[previews.length - 1]).toEqual({
        kind: "hardware",
        scene: "mavis_v2_kitchen",
        speed_scale: 0.5,
      }),
    );
    await waitFor(() => expect(screen.getByTestId("launch-confirm")).toBeEnabled());
    expect(screen.getByTestId("gello-hardware-warning").textContent).toContain(
      "does not admit GELLO on hardware",
    );
    fireEvent.click(screen.getByTestId("launch-confirm"));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      kind: "hardware",
      digital_twin_scene: "mavis_v2_kitchen",
      speed_scale: 0.5,
      start_from: "keep_current",
    });
    expect(posts[0]).not.toHaveProperty("sim_scene");
  });

  it("a colliding preview disables Start with the reason and lists the pairs; the next clear preview re-enables it", async () => {
    api.preview = makeGelloPreview({
      status: "collision",
      detail: "GELLO posture collides",
      pairs: [
        { a: "fridge_body", b: "grip_link6", dist_m: 0.003 },
        { a: "fridge_door_handle", b: "grip_link7", dist_m: 0.012 },
      ],
      image_png_b64: TINY_PNG_B64,
    });
    mount();
    await waitFor(() => expect(verdictStatus()).toBe("collision"));
    expect(screen.getByTestId("gello-verdict-chip").textContent).toBe("COLLISION");
    expect(screen.getByTestId("gello-verdict-chip").className).toBe("chip chip-red");
    expect(
      Array.from(screen.getByTestId("gello-pairs").querySelectorAll("li")).map(
        (li) => li.textContent,
      ),
    ).toEqual(["fridge_body ↔ grip_link6 at 3 mm", "fridge_door_handle ↔ grip_link7 at 12 mm"]);
    expect(screen.getByTestId("gello-preview-img")).toBeInTheDocument(); // the red-tinted render
    expect(screen.getByTestId("launch-confirm")).toBeDisabled();
    expect(screen.getByTestId("launch-reason").textContent).toBe(REASON.gelloNotClear);
    // The operator moves GELLO: the next poll says clear.
    api.preview = makeGelloPreview();
    await waitFor(() => expect(verdictStatus()).toBe("clear"));
    await waitFor(() => expect(screen.getByTestId("launch-confirm")).toBeEnabled());
    expect(screen.queryByTestId("gello-pairs")).toBeNull();
    expect(posts).toHaveLength(0);
  });

  it("joint limit / no leader / not calibrated are amber with the runtime's detail; the leader reason wins over the preview", async () => {
    api.info = makeGelloInfo({ status: "stale", detail: "no sample for 0.4 s" });
    api.preview = makeGelloPreview({
      status: "joint_limit",
      detail: "joint 1 = 6.40 rad, limit ±6.28",
      image_png_b64: null,
    });
    mount();
    await waitFor(() => expect(verdictStatus()).toBe("joint_limit"));
    expect(screen.getByTestId("gello-verdict-chip").className).toBe("chip chip-amber");
    expect(screen.getByTestId("gello-verdict").textContent).toContain(
      "joint 1 = 6.40 rad, limit ±6.28",
    );
    expect(screen.getByTestId("gello-preview-empty").textContent).toBe("no preview image");
    await waitFor(() =>
      expect(screen.getByTestId("gello-leader-chip").textContent).toBe("LEADER stale"),
    );
    expect(screen.getByTestId("gello-leader-chip").className).toBe("chip chip-amber");
    expect(screen.getByTestId("gello-leader-detail").textContent).toBe("no sample for 0.4 s");
    expect(screen.getByTestId("launch-reason").textContent).toBe(REASON.gelloNoLeader);
    api.preview = makeGelloPreview({ status: "not_calibrated", detail: "run match_arm first" });
    await waitFor(() => expect(verdictStatus()).toBe("not_calibrated"));
    expect(screen.getByTestId("gello-verdict-chip").textContent).toBe("NOT CALIBRATED");
    api.preview = makeGelloPreview({ status: "no_leader" });
    await waitFor(() => expect(verdictStatus()).toBe("no_leader"));
    expect(screen.getByTestId("gello-verdict-chip").textContent).toBe("NO LEADER");
  });

  it("the footer reason names the actual blocker (2026-09-09 review): calibration, the runtime's detail, 'move GELLO' only for a posture problem", async () => {
    api.info = makeGelloInfo({ calibrated: false });
    api.preview = makeGelloPreview({
      status: "not_calibrated",
      detail: "not calibrated - POST /api/gello/calibrate {op: match_arm} first",
    });
    mount();
    await waitFor(() => expect(verdictStatus()).toBe("not_calibrated"));
    await waitFor(() =>
      expect(screen.getByTestId("launch-reason").textContent).toBe(REASON.gelloNotCalibrated),
    );
    expect(screen.getByTestId("launch-confirm")).toBeDisabled();
    api.preview = makeGelloPreview({
      status: "no_workcell",
      detail: "no hardware workcell posture (monitor has no sample)",
    });
    await waitFor(() => expect(verdictStatus()).toBe("no_workcell"));
    expect(screen.getByTestId("launch-reason").textContent).toBe(
      "no hardware workcell posture (monitor has no sample)",
    );
    api.preview = makeGelloPreview({
      status: "scene_error",
      detail: "twin scene 'mavis_v2_kitchen' unavailable: fridge.stl missing",
    });
    await waitFor(() => expect(verdictStatus()).toBe("scene_error"));
    expect(screen.getByTestId("launch-reason").textContent).toBe(
      "twin scene 'mavis_v2_kitchen' unavailable: fridge.stl missing",
    );
    api.preview = makeGelloPreview({ status: "joint_limit", detail: "joint 1 = 6.40 rad" });
    await waitFor(() => expect(verdictStatus()).toBe("joint_limit"));
    expect(screen.getByTestId("launch-reason").textContent).toBe(REASON.gelloNotClear);
  });

  it("a stalled runtime: the verdict goes STALE (grey chip, Start disabled with the reason) and the next answer refreshes it", async () => {
    mount({ previewStaleMs: 40 });
    await waitFor(() => expect(verdictStatus()).toBe("clear"));
    await waitFor(() => expect(screen.getByTestId("launch-confirm")).toBeEnabled());
    expect(screen.getByTestId("gello-verdict").dataset["stale"]).toBeUndefined();
    // The in-flight preview stops answering; the last CLEAR must not keep Start armed.
    let release!: () => void;
    api.previewDelay = new Promise<void>((r) => (release = r));
    await waitFor(() => expect(screen.getByTestId("gello-verdict").dataset["stale"]).toBe("true"));
    expect(screen.getByTestId("gello-verdict-chip").textContent).toBe("PREVIEW STALE");
    expect(screen.getByTestId("gello-verdict-chip").className).toBe("chip chip-grey");
    expect(verdictStatus()).toBe("clear"); // the old result is still what it was
    expect(screen.getByTestId("launch-confirm")).toBeDisabled();
    expect(screen.getByTestId("launch-reason").textContent).toBe(REASON.gelloPreviewStale);
    // The runtime answers again: fresh, Start re-enabled.
    api.previewDelay = null;
    release();
    await waitFor(() =>
      expect(screen.getByTestId("gello-verdict").dataset["stale"]).toBeUndefined(),
    );
    await waitFor(() => expect(screen.getByTestId("launch-confirm")).toBeEnabled());
    expect(posts).toHaveLength(0);
  });

  it("a timed-out preview poll is 'unavailable' (Start disabled with that reason) and does NOT stop the chain", async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId("launch-confirm")).toBeEnabled());
    api.previewTimeout = true;
    await screen.findByTestId("gello-preview-error");
    expect(screen.getByTestId("gello-preview-error").textContent).toContain("no answer after 3 s");
    expect(screen.getByTestId("gello-preview-empty").textContent).toContain("preview unavailable");
    expect(screen.getByTestId("launch-confirm")).toBeDisabled();
    expect(screen.getByTestId("launch-reason").textContent).toBe(REASON.gelloPreviewUnavailable);
    const n = previews.length;
    await waitFor(() => expect(previews.length).toBeGreaterThan(n + 1)); // still polling
    api.previewTimeout = false;
    await waitFor(() => expect(verdictStatus()).toBe("clear"));
    await waitFor(() => expect(screen.getByTestId("launch-confirm")).toBeEnabled());
    expect(screen.queryByTestId("gello-preview-error")).toBeNull();
  });

  it("calibrate ops POST {op, kind}, show the result and re-read the info; a 409 shows its detail; match_arm over a stored calibration asks first", async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId("gello-calibrated").textContent).toBe("yes"));
    const before = infoFetches;
    // Calibrated already: the ConfirmDialog, nothing posted until confirmed; Cancel posts nothing.
    fireEvent.click(screen.getByTestId("gello-cal-match_arm"));
    const dialog = await screen.findByTestId("confirm-dialog");
    expect(dialog.textContent).toContain(MATCH_ARM_OVERWRITE_TEXT);
    expect(dialog.textContent).toContain("/home/x/apollo/var/gello_calibration.json");
    expect(screen.getByTestId("confirm-ok").textContent).toBe("Calibrate (match arm)");
    expect(calibrates).toEqual([]);
    fireEvent.click(screen.getByTestId("confirm-cancel"));
    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
    expect(calibrates).toEqual([]);
    fireEvent.click(screen.getByTestId("gello-cal-match_arm"));
    fireEvent.click(await screen.findByTestId("confirm-ok"));
    await waitFor(() => expect(calibrates).toEqual([{ op: "match_arm", kind: "sim" }]));
    const result = await screen.findByTestId("gello-calibrate-result");
    expect(result.dataset["op"]).toBe("match_arm");
    expect(result.dataset["ok"]).toBe("true");
    expect(result.textContent).toBe("match_arm: match_arm stored");
    await waitFor(() => expect(infoFetches).toBeGreaterThan(before)); // re-read at once
    fireEvent.click(screen.getByTestId("gello-cal-gripper_open"));
    await waitFor(() => expect(calibrates[1]).toEqual({ op: "gripper_open", kind: "sim" }));
    fireEvent.click(screen.getByTestId("gello-cal-gripper_closed"));
    await waitFor(() => expect(calibrates[2]).toEqual({ op: "gripper_closed", kind: "sim" }));
    api.calibrate409 = "GELLO leader not available (stale)";
    fireEvent.click(screen.getByTestId("gello-cal-clear"));
    await waitFor(() => expect(calibrates[3]).toEqual({ op: "clear", kind: "sim" }));
    await waitFor(() =>
      expect(screen.getByTestId("gello-calibrate-result").dataset["ok"]).toBe("false"),
    );
    expect(screen.getByTestId("gello-calibrate-result").textContent).toBe(
      "clear: GELLO leader not available (stale)",
    );
    expect(screen.getByTestId("gello-calibration-path").textContent).toBe(
      "/home/x/apollo/var/gello_calibration.json",
    );
  });

  it("match_arm on an UNcalibrated leader posts at once — no dialog", async () => {
    api.info = makeGelloInfo({ calibrated: false });
    mount();
    await waitFor(() => expect(screen.getByTestId("gello-calibrated").textContent).toBe("no"));
    fireEvent.click(screen.getByTestId("gello-cal-match_arm"));
    await waitFor(() => expect(calibrates).toEqual([{ op: "match_arm", kind: "sim" }]));
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
  });

  it("viewpoint radios travel to the spec; external without a node warns (the runtime would 409), with one it shows the chip + id", async () => {
    const { rerender, onLaunched, onClose } = mount();
    fireEvent.click(screen.getByTestId("gello-step-viewpoint"));
    expect((screen.getByTestId("gello-viewpoint-auto") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId("external-policy-chip-none")).toBeInTheDocument();
    expect(screen.getByTestId("gello-external-detail").textContent).toContain("no Dora bridge");
    expect(screen.queryByTestId("gello-viewpoint-warning")).toBeNull();
    fireEvent.click(screen.getByTestId("gello-viewpoint-external"));
    expect(screen.getByTestId("gello-viewpoint-warning").textContent).toContain(
      "No viewpoint node attached",
    );
    await waitFor(() =>
      expect(screen.getByTestId("gello-hold-posture").textContent).toContain("151.6 / -91.6 / 1.0"),
    );
    // A node attaches (telemetry.external): chip + id, warning gone.
    rerender(
      <GelloSheet
        sel={sel}
        external={makeExternal({ policy_id: "viewpoint_v2" })}
        onLaunched={onLaunched}
        onClose={onClose}
        infoPollMs={20}
        previewPollMs={20}
      />,
    );
    expect(screen.getByTestId("external-policy-chip").textContent).toBe("EXTERNAL POLICY attached");
    expect(screen.getByTestId("gello-external-id").textContent).toBe("viewpoint_v2");
    expect(screen.queryByTestId("gello-viewpoint-warning")).toBeNull();
    await waitFor(() => expect(screen.getByTestId("launch-confirm")).toBeEnabled());
    fireEvent.click(screen.getByTestId("launch-confirm"));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]!.gello).toEqual({ viewpoint: "external" });
    // hold too
    fireEvent.click(screen.getByTestId("gello-viewpoint-hold"));
    expect((screen.getByTestId("gello-viewpoint-hold") as HTMLInputElement).checked).toBe(true);
  });

  it("a 409 from POST /api/session shows in the sheet, which stays open and keeps polling", async () => {
    api.session409 =
      "GELLO posture collides: fridge_body / grip_link6 at 3 mm - move GELLO and retry";
    const { onLaunched } = mount();
    await waitFor(() => expect(screen.getByTestId("launch-confirm")).toBeEnabled());
    fireEvent.click(screen.getByTestId("launch-confirm"));
    const err = await screen.findByTestId("launch-error");
    expect(err.getAttribute("role")).toBe("alert");
    expect(err.textContent).toContain("GELLO posture collides: fridge_body / grip_link6 at 3 mm");
    expect(onLaunched).not.toHaveBeenCalled();
    expect(screen.getByTestId("gello-panel")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("launch-confirm")).toBeEnabled()); // retry possible
    const n = previews.length;
    await waitFor(() => expect(previews.length).toBeGreaterThan(n + 1)); // polling continues
  });

  it("a runtime without the GELLO routes degrades honestly: info error, preview unavailable, Start disabled with the scene reason", async () => {
    api.info = 404;
    api.preview = 404;
    mount();
    await screen.findByTestId("gello-info-error");
    expect(screen.getByTestId("gello-info-error").textContent).toContain("no GELLO support (404)");
    expect(screen.getByTestId("gello-leader-chip").textContent).toBe("LEADER —");
    await screen.findByTestId("gello-preview-error");
    expect(screen.getByTestId("gello-preview-empty").textContent).toContain("preview unavailable");
    expect(screen.getByTestId("launch-confirm")).toBeDisabled();
    expect(screen.getByTestId("launch-reason").textContent).toBe(REASON.gelloNoScene);
  });

  it("Cancel / × / Escape ask the owner to close; closing stops the polling", async () => {
    const { onClose, rerender } = mount();
    fireEvent.click(screen.getByTestId("launch-cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("gello-close"));
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(screen.getByTestId("gello-sheet"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
    rerender(
      <GelloSheet
        sel={sel}
        external={null}
        onLaunched={() => undefined}
        onClose={onClose}
        open={false}
        infoPollMs={20}
        previewPollMs={20}
      />,
    );
    const n = infoFetches;
    await new Promise((r) => setTimeout(r, 90));
    expect(infoFetches).toBe(n);
  });
});
