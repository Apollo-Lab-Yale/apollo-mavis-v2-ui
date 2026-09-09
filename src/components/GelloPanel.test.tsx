/** GelloPanel (phase-15; 16-gello §11 Cockpit): the pure `gelloPanelModel` reducer
 * (state chips, Pause / Resume gates, lag bars, viewpoint row, banner), the rendered
 * panel (buttons → `gello_pause` / `gello_resume`, leader rows, key hints from the
 * served keymap) and `GelloBanner`. */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  KEYMAP,
  makeExternal,
  makeGelloTelemetry,
  makeGelloViewpoint,
} from "../../tests/mocks/fixtures";
import { buildBindings } from "../input/bindings";
import {
  GelloBanner,
  GelloPanel,
  gelloPanelModel,
  LAG_BAR_FULL_RAD,
  LATCHED_CAPTION,
  REASON_ALREADY_PAUSED,
  REASON_ALREADY_TRACKING,
  REASON_NO_SESSION_HALF,
  REASON_NOT_PAUSED,
  REASON_OUT_OF_SYNC_AUTO,
  REASON_PAUSE_LATCHED,
  REASON_RESUME_AFTER_MOTION,
  STATE_CHIP,
  VIEWPOINT_PAUSED_TEXT,
  viewpointText,
} from "./GelloPanel";
import { REASON_LINK_DOWN, REASON_OBSERVER } from "./OnlineDaggerPanel";

const bindings = buildBindings(KEYMAP);

describe("gelloPanelModel (pure)", () => {
  it("state chips: colour always with a word; the five states of 16-gello §6.1", () => {
    expect(STATE_CHIP).toEqual({
      tracking: { tone: "green", label: "TRACKING" },
      out_of_sync: { tone: "amber", label: "OUT OF SYNC" },
      paused: { tone: "grey", label: "PAUSED" },
      no_leader: { tone: "red", label: "NO LEADER" },
      motion: { tone: "blue", label: "MOTION" },
    });
    const m = gelloPanelModel(makeGelloTelemetry());
    expect(m.state).toBe("tracking");
    expect(m.chip).toEqual({ tone: "green", label: "TRACKING" });
    expect(m.lag).toEqual([]); // Δ bars only while OUT OF SYNC
    expect(m.leader).toEqual({
      status: "connected",
      backend: "fake",
      ageMs: 8,
      rateHz: 100,
      gripperPct: 100,
      maxLagRad: 0.01,
      detail: "",
    });
    expect(m.banner).toBeNull();
    // Without the session half (no gello session yet) everything is inert with the reason.
    const none = gelloPanelModel(makeGelloTelemetry({ state: null, lag_rad: null }));
    expect(none.chip).toEqual({ tone: "grey", label: "—" });
    expect(none.pause).toEqual({ disabled: true, reason: REASON_NO_SESSION_HALF });
    expect(none.resume).toEqual({ disabled: true, reason: REASON_NO_SESSION_HALF });
  });

  it("Pause / Resume gates per state; observer and a down link win with THEIR reason", () => {
    const g = (state: NonNullable<ReturnType<typeof makeGelloTelemetry>["state"]>) =>
      gelloPanelModel(makeGelloTelemetry({ state }));
    expect(g("tracking").pause).toEqual({ disabled: false, reason: null });
    expect(g("tracking").resume).toEqual({ disabled: true, reason: REASON_ALREADY_TRACKING });
    expect(g("out_of_sync").pause.disabled).toBe(false);
    expect(g("out_of_sync").resume).toEqual({ disabled: true, reason: REASON_OUT_OF_SYNC_AUTO });
    expect(g("paused").pause).toEqual({ disabled: true, reason: REASON_ALREADY_PAUSED });
    expect(g("paused").resume).toEqual({ disabled: false, reason: null });
    // The engage machine ranks motion > paused > no_leader: a latched pause always READS
    // `paused`, so in `no_leader` the follower is NOT paused — Pause is live (it latches
    // so the arm does not re-engage when the leader returns), Resume names its no-op.
    expect(g("no_leader").pause).toEqual({ disabled: false, reason: null });
    expect(g("no_leader").resume).toEqual({ disabled: true, reason: REASON_NOT_PAUSED });
    // `motion` (2026-09-09 review): Pause stays LIVE — the runtime latches it and the
    // launch motion does NOT end paused unless the operator asks; Resume is nacked there.
    expect(g("motion").pause).toEqual({ disabled: false, reason: null });
    expect(g("motion").resume).toEqual({ disabled: true, reason: REASON_RESUME_AFTER_MOTION });
    expect(g("motion").latched).toBe(false);
    const ro = gelloPanelModel(makeGelloTelemetry(), { readOnly: true });
    expect(ro.pause.reason).toBe(REASON_OBSERVER);
    expect(ro.resume.reason).toBe(REASON_OBSERVER);
    const down = gelloPanelModel(makeGelloTelemetry({ state: "paused" }), { controlDown: true });
    expect(down.pause.reason).toBe(REASON_LINK_DOWN);
    expect(down.resume.reason).toBe(REASON_LINK_DOWN);
  });

  it("a pause latched during a motion window (`paused_latched`): caption, Pause 'already paused (latched)', Resume still refused", () => {
    const m = gelloPanelModel(makeGelloTelemetry({ state: "motion", paused_latched: true }));
    expect(m.chip).toEqual({ tone: "blue", label: "MOTION" }); // the state IS still motion
    expect(m.latched).toBe(true);
    expect(m.pause).toEqual({ disabled: true, reason: REASON_PAUSE_LATCHED });
    expect(m.resume).toEqual({ disabled: true, reason: REASON_RESUME_AFTER_MOTION });
    expect(REASON_PAUSE_LATCHED).toBe("already paused (latched)");
    expect(REASON_RESUME_AFTER_MOTION).toBe("Resume after the motion ends");
    expect(LATCHED_CAPTION).toBe("pause latched — takes effect when the motion ends");
    // The latch only matters while the state reads motion.
    expect(gelloPanelModel(makeGelloTelemetry({ paused_latched: true })).pause.disabled).toBe(
      false,
    );
    // An older runtime without the field: null = not latched.
    expect(
      gelloPanelModel(makeGelloTelemetry({ state: "motion", paused_latched: null })).latched,
    ).toBe(false);
  });

  it("a NaN-paused viewpoint (`viewpoint.paused`) keeps Resume live whatever the follower state — except inside a motion window", () => {
    const vp = makeGelloViewpoint({
      attached: true,
      policy_id: "viewpoint_v2",
      paused: true,
      detail: "paused after 3 NaN actions - press Resume",
    });
    for (const state of ["tracking", "out_of_sync", "no_leader", "paused"] as const) {
      const m = gelloPanelModel(makeGelloTelemetry({ state, viewpoint: vp }));
      expect(m.viewpointPaused).toBe(true);
      expect(m.resume).toEqual({ disabled: false, reason: null });
    }
    // The runtime nacks gello_resume during a motion window whatever else is pending.
    expect(gelloPanelModel(makeGelloTelemetry({ state: "motion", viewpoint: vp })).resume).toEqual({
      disabled: true,
      reason: REASON_RESUME_AFTER_MOTION,
    });
    // Observer / link down still win.
    expect(
      gelloPanelModel(makeGelloTelemetry({ viewpoint: vp }), { readOnly: true }).resume.reason,
    ).toBe(REASON_OBSERVER);
    // The row says the Perception Arm is holding (the node is still attached).
    expect(viewpointText(vp)).toBe(`${VIEWPOINT_PAUSED_TEXT} (node viewpoint_v2)`);
    expect(viewpointText(makeGelloViewpoint({ paused: true }))).toBe(VIEWPOINT_PAUSED_TEXT);
    expect(gelloPanelModel(makeGelloTelemetry()).viewpointPaused).toBe(false);
  });

  it("OUT OF SYNC: one Δ bar per joint from lag_rad, saturating at LAG_BAR_FULL_RAD", () => {
    const m = gelloPanelModel(
      makeGelloTelemetry({
        state: "out_of_sync",
        state_detail: "leader 0.25 rad from the arm (tolerance 0.10)",
        lag_rad: [0.25, -0.05, 0, 0, 0, 0, 1.2],
        max_lag_rad: 1.2,
      }),
    );
    expect(LAG_BAR_FULL_RAD).toBe(0.5);
    expect(m.lag).toHaveLength(7);
    expect(m.lag[0]).toEqual({ joint: "J1", rad: 0.25, frac: 0.5 });
    expect(m.lag[1]).toEqual({ joint: "J2", rad: -0.05, frac: 0.1 });
    expect(m.lag[6]).toEqual({ joint: "J7", rad: 1.2, frac: 1 });
    expect(m.detail).toBe("leader 0.25 rad from the arm (tolerance 0.10)");
  });

  it("the viewpoint row (16-gello §7 / §11)", () => {
    expect(viewpointText(makeGelloViewpoint())).toBe("holding the GELLO posture");
    expect(viewpointText(makeGelloViewpoint({ mode: "external" }))).toBe(
      "waiting for a viewpoint node",
    );
    expect(viewpointText(makeGelloViewpoint({ attached: true, policy_id: "viewpoint_v2" }))).toBe(
      "external node viewpoint_v2 attached",
    );
    expect(viewpointText(makeGelloViewpoint({ mode: "hold" }))).toBe("viewpoint disabled (hold)");
    expect(viewpointText(null)).toBe("—");
  });

  it("the banner names the lost leader with the runtime's detail; keyed on the DEVICE status or the no_leader state, so it survives a pause", () => {
    expect(gelloPanelModel(makeGelloTelemetry({ state: "paused" })).banner).toBeNull();
    expect(
      gelloPanelModel(
        makeGelloTelemetry({
          state: "no_leader",
          status: "stale",
          state_detail: "sample 0.41 s old",
        }),
      ).banner,
    ).toBe("GELLO LEADER LOST — the Manipulation Arm holds its last command (sample 0.41 s old)");
    expect(
      gelloPanelModel(makeGelloTelemetry({ state: "no_leader", status: "error", state_detail: "" }))
        .banner,
    ).toBe("GELLO LEADER LOST — the Manipulation Arm holds its last command (leader error)");
    // A connected device whose samples the engage rule rejects (a jump) still reads no_leader.
    expect(
      gelloPanelModel(
        makeGelloTelemetry({
          state: "no_leader",
          status: "connected",
          state_detail: "jump rejected",
        }),
      ).banner,
    ).toContain("(jump rejected)");
    // Paused while the leader is lost: the chip reads PAUSED (paused outranks no_leader in
    // the engage machine) — the banner must NOT vanish; the device detail names the loss.
    expect(
      gelloPanelModel(
        makeGelloTelemetry({
          state: "paused",
          status: "stale",
          state_detail: "paused by operator",
          detail: "no sample for 0.4 s",
        }),
      ).banner,
    ).toBe("GELLO LEADER LOST — the Manipulation Arm holds its last command (no sample for 0.4 s)");
    // A motion window with the leader lost: the motion goes on, the arm will not follow after.
    expect(
      gelloPanelModel(makeGelloTelemetry({ state: "motion", status: "error", detail: "" })).banner,
    ).toBe(
      "GELLO LEADER LOST — a planned motion owns the Manipulation Arm; it will not follow when the motion ends (leader error)",
    );
    // No session half yet (bring-up): no banner, whatever the device says.
    expect(gelloPanelModel(makeGelloTelemetry({ state: null, status: "stale" })).banner).toBeNull();
  });
});

describe("<GelloPanel>", () => {
  it("renders the chip, the rows, the hints from the served keymap; Pause / Resume send the actions", () => {
    const onAction = vi.fn();
    const { rerender } = render(
      <GelloPanel
        gello={makeGelloTelemetry()}
        external={makeExternal()}
        bindings={bindings}
        onAction={onAction}
      />,
    );
    const panel = screen.getByTestId("gello-panel");
    expect(panel.dataset["state"]).toBe("tracking");
    expect(screen.getByTestId("gello-state-chip").textContent).toBe("TRACKING");
    expect(screen.getByTestId("gello-state-chip").className).toBe("chip chip-green");
    expect(screen.getByTestId("gello-leader-status").textContent).toBe("connected · fake");
    expect(screen.getByTestId("gello-leader-age").textContent).toBe("8 ms");
    expect(screen.getByTestId("gello-leader-rate").textContent).toBe("100 Hz");
    expect(screen.getByTestId("gello-gripper").textContent).toBe("100%");
    expect(screen.getByTestId("gello-max-lag").textContent).toBe("0.010 rad");
    expect(screen.getByTestId("gello-viewpoint").textContent).toBe("holding the GELLO posture");
    expect(screen.getByTestId("external-policy-chip").textContent).toBe("EXTERNAL POLICY attached");
    expect(screen.queryByTestId("gello-lag")).toBeNull();
    const hints = screen.getByTestId("gello-hints");
    expect(hints.textContent).toContain("←→ Manipulation Arm rail");
    expect(hints.textContent).toContain("R return to the initial condition (ends paused)");
    // Pause is live while tracking; Resume names its no-op.
    fireEvent.click(screen.getByTestId("gello-pause"));
    expect(onAction).toHaveBeenCalledWith("gello_pause");
    expect(screen.getByTestId("gello-resume")).toBeDisabled();
    expect(screen.getByTestId("gello-resume-reason").textContent).toBe(
      `Resume: ${REASON_ALREADY_TRACKING}`,
    );
    expect(screen.queryByTestId("gello-pause-reason")).toBeNull();
    // Paused: the pair flips.
    rerender(
      <GelloPanel
        gello={makeGelloTelemetry({ state: "paused", engaged_arm: null })}
        bindings={bindings}
        onAction={onAction}
      />,
    );
    expect(screen.getByTestId("gello-state-chip").textContent).toBe("PAUSED");
    expect(screen.getByTestId("gello-pause")).toBeDisabled();
    fireEvent.click(screen.getByTestId("gello-resume"));
    expect(onAction).toHaveBeenLastCalledWith("gello_resume");
    expect(screen.getByTestId("gello-pause-reason").textContent).toBe(
      `Pause: ${REASON_ALREADY_PAUSED}`,
    );
  });

  it("OUT OF SYNC draws the Δ bars; observer / link down disable both buttons with the reason", () => {
    const onAction = vi.fn();
    render(
      <GelloPanel
        gello={makeGelloTelemetry({ state: "out_of_sync", lag_rad: [0.25, 0, 0, 0, 0, 0, -0.6] })}
        bindings={bindings}
        onAction={onAction}
        readOnly
      />,
    );
    expect(screen.getByTestId("gello-state-chip").textContent).toBe("OUT OF SYNC");
    expect(screen.getByTestId("gello-lag").children).toHaveLength(7);
    expect(screen.getByTestId("gello-lag-fill-J1").style.width).toBe("50%");
    expect(screen.getByTestId("gello-lag-fill-J7").style.width).toBe("100%");
    expect(screen.getByTestId("gello-lag-J7").textContent).toContain("−0.600 rad");
    expect(screen.getByTestId("gello-pause")).toBeDisabled();
    expect(screen.getByTestId("gello-resume")).toBeDisabled();
    expect(screen.getByTestId("gello-pause-reason").textContent).toBe(`Pause: ${REASON_OBSERVER}`);
    fireEvent.click(screen.getByTestId("gello-pause"));
    expect(onAction).not.toHaveBeenCalled();
  });

  it("no bindings → no key hints; a hold viewpoint with a detail", () => {
    render(
      <GelloPanel
        gello={makeGelloTelemetry({
          viewpoint: makeGelloViewpoint({ mode: "hold", detail: "bus ignored" }),
        })}
        bindings={null}
        onAction={() => undefined}
      />,
    );
    expect(screen.getByTestId("gello-hints").textContent).toBe("");
    expect(screen.getByTestId("gello-viewpoint").textContent).toBe(
      "viewpoint disabled (hold) — bus ignored",
    );
    expect(screen.getByTestId("gello-viewpoint").dataset["paused"]).toBeUndefined();
    expect(screen.queryByTestId("gello-latched")).toBeNull();
  });

  it("NaN-paused viewpoint while TRACKING: amber row with the runtime's detail, Resume live → gello_resume", () => {
    const onAction = vi.fn();
    render(
      <GelloPanel
        gello={makeGelloTelemetry({
          viewpoint: makeGelloViewpoint({
            attached: true,
            policy_id: "viewpoint_v2",
            paused: true,
            detail: "paused after 3 NaN actions - press Resume",
          }),
        })}
        bindings={bindings}
        onAction={onAction}
      />,
    );
    expect(screen.getByTestId("gello-state-chip").textContent).toBe("TRACKING");
    const row = screen.getByTestId("gello-viewpoint");
    expect(row.dataset["paused"]).toBe("true");
    expect(row.className).toBe("gello-viewpoint-paused");
    expect(row.textContent).toBe(
      "viewpoint paused — the Perception Arm holds (node viewpoint_v2) — paused after 3 NaN actions - press Resume",
    );
    expect(screen.getByTestId("gello-resume")).toBeEnabled();
    expect(screen.queryByTestId("gello-resume-reason")).toBeNull();
    fireEvent.click(screen.getByTestId("gello-resume"));
    expect(onAction).toHaveBeenLastCalledWith("gello_resume");
  });

  it("MOTION: Pause live (latches) → gello_pause; once latched the caption shows and Pause names it; Resume refused", () => {
    const onAction = vi.fn();
    const { rerender } = render(
      <GelloPanel
        gello={makeGelloTelemetry({ state: "motion", state_detail: "planned motion" })}
        bindings={bindings}
        onAction={onAction}
      />,
    );
    expect(screen.getByTestId("gello-state-chip").textContent).toBe("MOTION");
    expect(screen.queryByTestId("gello-latched")).toBeNull();
    expect(screen.getByTestId("gello-pause")).toBeEnabled();
    fireEvent.click(screen.getByTestId("gello-pause"));
    expect(onAction).toHaveBeenCalledWith("gello_pause");
    expect(screen.getByTestId("gello-resume")).toBeDisabled();
    expect(screen.getByTestId("gello-resume-reason").textContent).toBe(
      `Resume: ${REASON_RESUME_AFTER_MOTION}`,
    );
    rerender(
      <GelloPanel
        gello={makeGelloTelemetry({
          state: "motion",
          state_detail: "planned motion",
          paused_latched: true,
        })}
        bindings={bindings}
        onAction={onAction}
      />,
    );
    expect(screen.getByTestId("gello-state-chip").textContent).toBe("MOTION");
    expect(screen.getByTestId("gello-latched").textContent).toBe(LATCHED_CAPTION);
    expect(screen.getByTestId("gello-pause")).toBeDisabled();
    expect(screen.getByTestId("gello-pause-reason").textContent).toBe(
      `Pause: ${REASON_PAUSE_LATCHED}`,
    );
  });
});

describe("<GelloBanner>", () => {
  it("renders while the leader is lost — and stays through a pause (device status, not the state)", () => {
    const { rerender } = render(<GelloBanner gello={makeGelloTelemetry()} />);
    expect(screen.queryByTestId("gello-banner")).toBeNull();
    rerender(<GelloBanner gello={makeGelloTelemetry({ state: "no_leader", status: "stale" })} />);
    const banner = screen.getByTestId("gello-banner");
    expect(banner.className).toBe("banner banner-red");
    expect(banner.getAttribute("role")).toBe("alert");
    expect(banner.textContent).toContain("GELLO LEADER LOST");
    // The operator pauses while the leader is lost: the chip flips to PAUSED, the banner stays.
    rerender(<GelloBanner gello={makeGelloTelemetry({ state: "paused", status: "stale" })} />);
    expect(screen.getByTestId("gello-banner").textContent).toContain("GELLO LEADER LOST");
    // The leader comes back: gone.
    rerender(<GelloBanner gello={makeGelloTelemetry({ state: "paused", status: "connected" })} />);
    expect(screen.queryByTestId("gello-banner")).toBeNull();
  });
});
