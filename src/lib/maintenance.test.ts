/** Pure maintenance helpers (phase-09b): fault labels, the arm-card view
 * (enable/disable matrix) and the exact toast copy; (phase-09c) the rail
 * read-back, Home rail enablement, session eligibility, the RailSweepVerdict
 * copy and the `home_rail` toast; (phase-09d) the PrePositionPlan copy, the
 * RailHomingJob phase vocabulary, the card's session-reason line and the
 * `accepted` / `refused` result statuses. */
import { describe, expect, it } from "vitest";
import {
  makeArmMonitor,
  makeArmStatus,
  makeMaintenanceResult,
  makePlannedSweepVerdict,
  makePrePositionPlan,
  makeRailSweepVerdict,
} from "../../tests/mocks/fixtures";
import {
  faultLabel,
  formatDeg,
  formatKg,
  formatM,
  formatMm,
  frozenHint,
  HOME_RAIL_NOTICE,
  isSensitivityLevel,
  isTerminalPhase,
  isWarningDetail,
  MAINTENANCE_PHASES,
  maintenanceErrorText,
  maintenanceToast,
  maintenanceView,
  monitorLive,
  pairText,
  parseFaultDetail,
  PHASE_LABELS,
  phaseState,
  PRE_POSITION_REFUSED_HINT,
  prePositionKind,
  prePositionSummary,
  railState,
  railText,
  REASON_CLEAR_FIRST,
  REASON_HOMING_IN_PROGRESS,
  REASON_USE_COCKPIT,
  SENSITIVITY_HINT,
  SENSITIVITY_LEVELS,
  sessionGate,
  sessionGateReason,
  sweepSummary,
  warningText,
} from "./maintenance";
import { ApiError } from "../api/rest";

describe("parseFaultDetail / faultLabel", () => {
  it("splits the runtime's 'controller error N: title' text", () => {
    expect(parseFaultDetail("controller error 24: Speed Exceeds Limit")).toEqual({
      code: 24,
      title: "Speed Exceeds Limit",
    });
    expect(parseFaultDetail("controller error 19")).toEqual({ code: 19, title: "" });
    expect(parseFaultDetail("")).toEqual({ code: null, title: "" });
    expect(parseFaultDetail("driver latched")).toEqual({ code: null, title: "driver latched" });
  });
  it("C<code> <title>; bare C<code> without a title; foreign text kept verbatim", () => {
    expect(faultLabel(24, "controller error 24: Speed Exceeds Limit")).toBe(
      "C24 Speed Exceeds Limit",
    );
    expect(faultLabel(19)).toBe("C19");
    expect(faultLabel(19, "controller error 19")).toBe("C19");
    expect(faultLabel(31, "collision")).toBe("C31 collision");
    // A detail naming another code is not silently re-labelled.
    expect(faultLabel(23, "controller error 24: Speed Exceeds Limit")).toBe(
      "C23 controller error 24: Speed Exceeds Limit",
    );
  });
  it("never emits C0: error_code 0 with a detail (the RECOVERING wire shape) uses the detail's code", () => {
    // The driver's recovery cleared the controller error while the loop keeps the text.
    expect(faultLabel(0, "controller error 24: Speed Exceeds Limit")).toBe(
      "C24 Speed Exceeds Limit",
    );
    expect(faultLabel(0, "controller error 19")).toBe("C19");
    // Code-less driver texts stay verbatim, no chip.
    expect(faultLabel(0, "recovery budget exhausted (3 in 30 s)")).toBe(
      "recovery budget exhausted (3 in 30 s)",
    );
    expect(faultLabel(0, "operator-requested recovery (re-seed from the measured position)")).toBe(
      "operator-requested recovery (re-seed from the measured position)",
    );
    expect(faultLabel(0, "warning: close UFACTORY Studio live control")).toBe(
      "warning: close UFACTORY Studio live control",
    );
    expect(faultLabel(0)).toBe("");
    expect(faultLabel(0, "")).toBe("");
  });
  it("isWarningDetail / warningText: the runtime's 'warning: …' StudioConflictWarning shape", () => {
    expect(isWarningDetail("warning: close UFACTORY Studio live control")).toBe(true);
    expect(isWarningDetail("Warning:close it")).toBe(true);
    expect(isWarningDetail("controller error 24: Speed Exceeds Limit")).toBe(false);
    expect(isWarningDetail("")).toBe(false);
    expect(isWarningDetail(null)).toBe(false);
    expect(isWarningDetail(undefined)).toBe(false);
    expect(warningText("warning: close UFACTORY Studio live control")).toBe(
      "close UFACTORY Studio live control",
    );
    expect(warningText("plain")).toBe("plain");
  });
  it("formatKg: two decimals", () => {
    expect(formatKg(0.95)).toBe("0.95 kg");
    expect(formatKg(0.5)).toBe("0.50 kg");
  });
});

describe("maintenanceView (arm-card matrix)", () => {
  const arm = makeArmStatus({ arm_id: "grip", ip: "192.168.1.201", reachable: "open" });

  it("meta line from the read-back; amber mismatch flag", () => {
    expect(maintenanceView(makeArmMonitor(), arm, false)).toMatchObject({
      meta: "sensitivity 3 · payload 0.95 kg",
      mismatch: false,
      hasErrors: false,
      busy: false,
      sessionActive: false,
      clearEnabled: false,
      applyEnabled: false,
      reason: null,
    });
    expect(
      maintenanceView(
        makeArmMonitor({ collision_sensitivity: 1, backstops_match: false }),
        arm,
        false,
      ),
    ).toMatchObject({
      meta: "sensitivity 1 · payload 0.95 kg",
      mismatch: true,
      applyEnabled: true,
    });
    // Partial read-back: whichever value exists; none → no line.
    expect(maintenanceView(makeArmMonitor({ tcp_load_kg: null }), arm, false).meta).toBe(
      "sensitivity 3",
    );
    expect(maintenanceView(makeArmMonitor({ collision_sensitivity: null }), arm, false).meta).toBe(
      "payload 0.95 kg",
    );
    expect(
      maintenanceView(
        makeArmMonitor({ collision_sensitivity: null, tcp_load_kg: null }),
        arm,
        false,
      ).meta,
    ).toBeNull();
    expect(maintenanceView(null, arm, false).meta).toBeNull();
    // `backstops_match: null` = not compared → not a mismatch.
    expect(maintenanceView(makeArmMonitor({ backstops_match: null }), arm, false)).toMatchObject({
      mismatch: false,
      applyEnabled: false,
    });
  });

  it("Clear errors: error_code OR warn_code non-zero; falls back to ArmStatusInfo.error_code", () => {
    expect(maintenanceView(makeArmMonitor({ error_code: 19 }), arm, false)).toMatchObject({
      hasErrors: true,
      clearEnabled: true,
    });
    expect(maintenanceView(makeArmMonitor({ warn_code: 11 }), arm, false)).toMatchObject({
      hasErrors: true,
      clearEnabled: true,
    });
    expect(maintenanceView(null, { error_code: 19 }, false)).toMatchObject({
      hasErrors: true,
      clearEnabled: true,
      applyEnabled: false,
    });
    expect(maintenanceView(null, { error_code: 0 }, false).clearEnabled).toBe(false);
  });

  it("a hardware session disables both with the visible reason; busy disables both silently", () => {
    const m = makeArmMonitor({ error_code: 19, backstops_match: false });
    expect(maintenanceView(m, arm, true)).toMatchObject({
      sessionActive: true,
      clearEnabled: false,
      applyEnabled: false,
      reason: REASON_USE_COCKPIT,
    });
    expect(maintenanceView({ ...m, maintenance_busy: true }, arm, false)).toMatchObject({
      busy: true,
      clearEnabled: false,
      applyEnabled: false,
      reason: null,
    });
    // phase-09d: a rail homing on ANOTHER arm (the monitor is paused for the JOB, not a
    // session) locks the card with its own reason - never "Use the Cockpit"
    expect(maintenanceView(m, arm, false, true)).toMatchObject({
      sessionActive: false,
      homingInProgress: true,
      clearEnabled: false,
      applyEnabled: false,
      homeRailEnabled: false,
      homeRailReason: null,
      sessionReason: null,
      reason: REASON_HOMING_IN_PROGRESS,
    });
    // the homing arm itself: busy wins (the card shows the running indicator instead)
    expect(maintenanceView({ ...m, maintenance_busy: true }, arm, false, true)).toMatchObject({
      busy: true,
      homingInProgress: true,
      reason: null,
    });
    expect(maintenanceView(m, arm, false, false).homingInProgress).toBe(false);
  });
});

describe("phase-09c: rail read-back, Home rail, session eligibility", () => {
  const arm = makeArmStatus({ arm_id: "grip", ip: "192.168.1.201", reachable: "open" });
  const homed = makeArmMonitor({ rail_homed: true, rail_enabled: true, rail_pos_m: 0.65 });

  it("railState / railText: unknown without a row, unhomed unless homed AND enabled, position once homed", () => {
    expect(railState(null)).toBe("unknown");
    expect(railState(undefined)).toBe("unknown");
    expect(railState(makeArmMonitor())).toBe("unhomed"); // present, on_zero 0, disabled
    expect(railState(makeArmMonitor({ rail_homed: true }))).toBe("unhomed"); // not enabled
    expect(railState(makeArmMonitor({ rail_enabled: true }))).toBe("unhomed"); // not homed
    expect(railState(homed)).toBe("homed");
    expect(railState(makeArmMonitor({ rail_present: false }))).toBe("none");
    expect(railText(null, arm)).toBe("rail 0–0.65 m");
    expect(railText(null, { has_rail: false })).toBe("no rail");
    expect(railText(null, {})).toBe("no rail");
    expect(railText(makeArmMonitor(), arm)).toBe("rail not homed");
    expect(railText(homed, arm)).toBe("rail 0.650 m");
    expect(railText({ ...homed, rail_pos_m: null }, arm)).toBe("rail homed");
    expect(railText(makeArmMonitor({ rail_present: false }), arm)).toBe("no rail");
    expect(monitorLive(makeArmMonitor())).toBe(true);
    expect(monitorLive(makeArmMonitor({ status: "stale" }))).toBe(true);
    for (const status of ["off", "connecting", "paused", "error"] as const) {
      expect(monitorLive(makeArmMonitor({ status }))).toBe(false);
    }
    expect(monitorLive(null)).toBe(false);
  });

  it("maintenanceView: Home rail shown while unhomed; enabled iff no session, not busy, error_code 0", () => {
    expect(maintenanceView(makeArmMonitor(), arm, false)).toMatchObject({
      rail: "unhomed",
      railLabel: "rail not homed",
      homeRailShown: true,
      homeRailEnabled: true,
      homeRailReason: null,
      gate: "rail_unhomed",
      sessionReason: null, // the rail case has its pill + Home rail button
      errorCode: 0,
    });
    // warn_code alone does not block homing; error_code does, with its reason.
    expect(maintenanceView(makeArmMonitor({ warn_code: 11 }), arm, false)).toMatchObject({
      homeRailEnabled: true,
      homeRailReason: null,
    });
    expect(maintenanceView(makeArmMonitor({ error_code: 19 }), arm, false)).toMatchObject({
      homeRailShown: true,
      homeRailEnabled: false,
      homeRailReason: REASON_CLEAR_FIRST,
      errorCode: 19,
    });
    // Session / busy: disabled, no extra reason (the strip shows its own line).
    expect(maintenanceView(makeArmMonitor(), arm, true)).toMatchObject({
      homeRailEnabled: false,
      homeRailReason: null,
      reason: REASON_USE_COCKPIT,
    });
    expect(maintenanceView(makeArmMonitor({ maintenance_busy: true }), arm, false)).toMatchObject({
      homeRailEnabled: false,
      homeRailReason: null,
    });
    // Homed: not shown at all; no row: config fallback text, gate monitor_off.
    expect(maintenanceView(homed, arm, false)).toMatchObject({
      rail: "homed",
      railLabel: "rail 0.650 m",
      homeRailShown: false,
      homeRailEnabled: false,
      gate: "ok",
      sessionReason: null,
    });
    expect(maintenanceView(null, arm, false)).toMatchObject({
      rail: "unknown",
      railLabel: "rail 0–0.65 m",
      homeRailShown: false,
      gate: "monitor_off",
      sessionReason: "Monitor not connected — no sample to pose the twin",
    });
    expect(maintenanceView(null, { error_code: 19 }, false).railLabel).toBe("no rail");
    // Phase-09d: the card's eligibility line for the gates the strip does not
    // explain (monitor off / controller error), hidden while a session owns the boxes.
    expect(maintenanceView({ ...homed, error_code: 19 }, arm, false)).toMatchObject({
      gate: "error",
      sessionReason: "Controller error C19 — clear errors first",
    });
    expect(maintenanceView(makeArmMonitor({ status: "paused" }), arm, true)).toMatchObject({
      gate: "monitor_off",
      sessionReason: null,
      reason: REASON_USE_COCKPIT,
    });
  });

  it("sessionGate / sessionGateReason: monitor first, then the rail, then the controller error", () => {
    expect(sessionGate(null, arm)).toBe("monitor_off");
    expect(sessionGate(makeArmMonitor({ status: "off" }), arm)).toBe("monitor_off");
    expect(sessionGate(makeArmMonitor({ status: "paused" }), arm)).toBe("monitor_off");
    expect(sessionGate(makeArmMonitor(), arm)).toBe("rail_unhomed");
    expect(sessionGate(makeArmMonitor({ error_code: 19 }), arm)).toBe("rail_unhomed"); // rail first
    expect(sessionGate({ ...homed, error_code: 19 }, arm)).toBe("error");
    expect(sessionGate({ ...homed, status: "stale" }, arm)).toBe("ok"); // a stale sample still poses the twin
    expect(sessionGate(homed, arm)).toBe("ok");
    expect(sessionGate({ ...homed, rail_present: false }, arm)).toBe("ok"); // no track → nothing to home
    // The REST error_code is the fallback only when the row has none.
    expect(sessionGate({ ...homed, error_code: undefined }, { error_code: 24 })).toBe("error");
    expect(sessionGateReason("ok")).toBeNull();
    expect(sessionGateReason("monitor_off")).toBe(
      "Monitor not connected — no sample to pose the twin",
    );
    expect(sessionGateReason("rail_unhomed")).toBe("Rail not homed — use Home rail");
    expect(sessionGateReason("error", 19)).toBe("Controller error C19 — clear errors first");
    expect(sessionGateReason("error")).toBe("Controller error — clear errors first");
  });

  it("sweepSummary: headline, recipe, blocked / clearance lines, other arms, assumptions; format helpers", () => {
    expect(formatM(0.12)).toBe("0.120 m");
    expect(formatMm(0.0321)).toBe("32 mm");
    expect(formatMm(0.025)).toBe("25 mm");
    expect(pairText(["grip/link6", "table"])).toBe("grip/link6 ↔ table");
    expect(sweepSummary(makeRailSweepVerdict())).toEqual({
      headline: "Sweep clear — safe to home",
      recipe: "Full travel 0–0.650 m at the current posture · inflation 25 mm · step 5 mm",
      blocked: null,
      clearance: "min clearance 32 mm at 0.315 m (grip/link2 ↔ table)",
      others: ["Perception Arm posed at its last sample (rail 0.000 m)"],
      assumptions: ["view rail unknown - used fallback 0.00 m"],
    });
    expect(
      sweepSummary(
        makeRailSweepVerdict({
          clear: false,
          first_blocked_m: 0.12,
          first_blocked_pair: ["grip/link6", "table"],
          min_clearance_m: null,
          min_clearance_at_m: null,
          min_clearance_pair: [],
          other_arms: { view: [Math.PI, 0, 0, 0, 0, 0, 0] }, // 7 values: rail unknown
          assumptions: [],
        }),
      ),
    ).toEqual({
      headline: "Sweep blocked — homing refused",
      recipe: "Full travel 0–0.650 m at the current posture · inflation 25 mm · step 5 mm",
      blocked: "first blocked at 0.120 m: grip/link6 ↔ table",
      clearance: null,
      others: ["Perception Arm posed at its last sample"],
      assumptions: [],
    });
    // Blocked without a position (defensive): still a line; travel / other_arms defaults.
    expect(
      sweepSummary({ scene_id: "mavis_v2", inflation_m: 0.008, step_m: 0.01, clear: false }),
    ).toMatchObject({
      recipe: "Full travel 0–0.650 m at the current posture · inflation 8 mm · step 10 mm",
      blocked: "blocked — see the assumptions below",
      clearance: null,
      others: [],
      assumptions: [],
    });
    // Phase-09d headlines: a planned pre-positioning motion / a refused plan.
    expect(sweepSummary(makePlannedSweepVerdict())).toMatchObject({
      headline: "Current posture blocks the sweep — pre-positioning planned",
      blocked: "first blocked at 0.120 m: grip/link6 ↔ table",
    });
    expect(
      sweepSummary(makePlannedSweepVerdict({ pre_position: makePrePositionPlan({ clear: false }) }))
        .headline,
    ).toBe("Sweep blocked — no safe pre-positioning path");
    // `needed: false` (the fixture default) and a pre-09d verdict read as before.
    expect(sweepSummary(makeRailSweepVerdict({ clear: false })).headline).toBe(
      "Sweep blocked — homing refused",
    );
    expect(
      sweepSummary(makeRailSweepVerdict({ clear: false, pre_position: undefined })).headline,
    ).toBe("Sweep blocked — homing refused");
    expect(HOME_RAIL_NOTICE).toBe(
      "The carriage drives to the operator's LEFT (+X) end at the track's homing speed (positioning cap 75 mm/s) — the only maintenance action that moves hardware.",
    );
    expect(frozenHint("view")).toBe(
      "Perception Arm frozen at last sample — do not move it from Studio",
    );
  });

  it("maintenanceToast home_rail: 'rail homed (rail 0.000 m)', warnings amber, ok:false → error with detail", () => {
    expect(
      maintenanceToast(
        makeMaintenanceResult({
          arm_id: "grip",
          op: "home_rail",
          after: makeArmMonitor({ rail_homed: true, rail_enabled: true, rail_pos_m: 0 }),
          rail_sweep: makeRailSweepVerdict(),
        }),
      ),
    ).toEqual({ text: "Manipulation Arm · rail homed (rail 0.000 m)", tone: "success" });
    expect(
      maintenanceToast(
        makeMaintenanceResult({ arm_id: "grip", op: "home_rail", after: null, before: null }),
      ),
    ).toEqual({ text: "Manipulation Arm · rail homed", tone: "success" });
    expect(
      maintenanceToast(
        makeMaintenanceResult({
          arm_id: "grip",
          op: "home_rail",
          warnings: ["set_linear_track_speed -> 1"],
          after: makeArmMonitor({ rail_homed: true, rail_enabled: true, rail_pos_m: 0 }),
        }),
      ),
    ).toEqual({
      text: "Manipulation Arm · rail homed (rail 0.000 m) — set_linear_track_speed -> 1",
      tone: "warning",
    });
    expect(
      maintenanceToast(
        makeMaintenanceResult({
          arm_id: "grip",
          op: "home_rail",
          ok: false,
          detail: "posture moved since the sweep",
          rail_sweep: makeRailSweepVerdict(),
        }),
      ),
    ).toEqual({ text: "Manipulation Arm · posture moved since the sweep", tone: "error" });
  });
});

describe("phase-09d: PrePositionPlan copy, RailHomingJob phases, result statuses", () => {
  it("formatDeg: one decimal, never -0.0", () => {
    expect(formatDeg(Math.PI)).toBe("180.0°");
    expect(formatDeg(0)).toBe("0.0°");
    expect(formatDeg(-0.0001)).toBe("0.0°");
    expect(formatDeg(-Math.PI / 2)).toBe("-90.0°");
    expect(formatDeg(0.5)).toBe("28.6°");
  });

  it("prePositionKind: none (absent / not needed), planned (needed + clear), refused (needed + not clear)", () => {
    expect(prePositionKind(null)).toBe("none");
    expect(prePositionKind(undefined)).toBe("none");
    expect(prePositionKind({ needed: false })).toBe("none");
    expect(prePositionKind({ needed: false, clear: false })).toBe("none"); // clear is moot when not needed
    expect(prePositionKind(makePrePositionPlan())).toBe("planned");
    expect(prePositionKind({ needed: true })).toBe("planned"); // `clear` defaults to true on the wire
    expect(prePositionKind(makePrePositionPlan({ clear: false }))).toBe("refused");
  });

  it("prePositionSummary: the contract sentence (waypoints, ~duration at 10 %), target in degrees, validation line", () => {
    expect(prePositionSummary(makePrePositionPlan())).toEqual({
      explanation:
        "The arm will first move along a planned path (12 waypoints, ~19 s at 10 %) to a folded posture that clears the whole rail travel, then the rail homes, then the arm holds that posture.",
      target: "Target posture · joints 1–7: 180.0°, 0.0°, 0.0°, 0.0°, 0.0°, 0.0°, 0.0°",
      validation: "path checked at 131 rail positions · posture from the scene keyframe",
    });
    // Singular / rounding / source wording / no target.
    expect(
      prePositionSummary(
        makePrePositionPlan({
          waypoints: 1,
          duration_s: 0.2,
          source: "home",
          target_q: [],
          checked_rail_positions: 1,
        }),
      ),
    ).toEqual({
      explanation:
        "The arm will first move along a planned path (1 waypoint, ~1 s at 10 %) to a folded posture that clears the whole rail travel, then the rail homes, then the arm holds that posture.",
      target: null,
      validation: "path checked at 1 rail position · posture from the arm's home keyframe",
    });
    expect(prePositionSummary({ needed: true }).validation).toBe(
      "path checked at 0 rail positions · posture from the current posture",
    );
    expect(prePositionSummary(makePrePositionPlan({ source: "search" })).validation).toContain(
      "a sampled posture",
    );
    expect(PRE_POSITION_REFUSED_HINT).toContain("factory-zero posture");
  });

  it("MAINTENANCE_PHASES / PHASE_LABELS / phaseState / isTerminalPhase", () => {
    expect(MAINTENANCE_PHASES).toEqual([
      "queued",
      "sweeping",
      "planning",
      "connecting",
      "positioning",
      "homing",
      "verifying",
    ]);
    for (const p of MAINTENANCE_PHASES) expect(PHASE_LABELS[p]).toBeTruthy();
    expect(PHASE_LABELS.done).toContain("holds the folded posture");
    expect(PHASE_LABELS.failed).toBe("failed");
    // Running in `positioning`: earlier rows done, that one active, later pending.
    expect(phaseState("queued", "positioning")).toBe("done");
    expect(phaseState("connecting", "positioning")).toBe("done");
    expect(phaseState("positioning", "positioning")).toBe("active");
    expect(phaseState("homing", "positioning")).toBe("pending");
    expect(phaseState("verifying", "positioning")).toBe("pending");
    // Terminal done: everything done.
    for (const p of MAINTENANCE_PHASES) expect(phaseState(p, "done")).toBe("done");
    // Terminal failed: the phase it failed in (last active seen) is marked, the
    // rows before done, the rest pending; unknown → the last row.
    expect(phaseState("connecting", "failed", "positioning")).toBe("done");
    expect(phaseState("positioning", "failed", "positioning")).toBe("failed");
    expect(phaseState("homing", "failed", "positioning")).toBe("pending");
    expect(phaseState("verifying", "failed")).toBe("failed");
    expect(phaseState("homing", "failed")).toBe("done");
    expect(isTerminalPhase("done")).toBe(true);
    expect(isTerminalPhase("failed")).toBe(true);
    expect(isTerminalPhase("homing")).toBe(false);
    expect(isTerminalPhase(null)).toBe(false);
    expect(isTerminalPhase(undefined)).toBe(false);
  });

  it("maintenanceToast: `accepted` (202) is an info note, `refused` is ok:false → error with the suggestion", () => {
    expect(
      maintenanceToast(
        makeMaintenanceResult({
          arm_id: "grip",
          op: "home_rail",
          status: "accepted",
          job_id: "job-1",
          sdk_codes: {},
          before: makeArmMonitor(),
          after: null,
          rail_sweep: makePlannedSweepVerdict(),
        }),
      ),
    ).toEqual({
      text: "Manipulation Arm · rail homing started — pre-positioning first",
      tone: "info",
    });
    expect(
      maintenanceToast(
        makeMaintenanceResult({
          arm_id: "grip",
          op: "home_rail",
          ok: false,
          status: "refused",
          detail: "fold the arm toward the factory zero posture in Studio and retry",
          sdk_codes: {},
          after: null,
        }),
      ),
    ).toEqual({
      text: "Manipulation Arm · fold the arm toward the factory zero posture in Studio and retry",
      tone: "error",
    });
    // The job's FINAL result (status done, same job_id) toasts like a 09c homing.
    expect(
      maintenanceToast(
        makeMaintenanceResult({
          arm_id: "grip",
          op: "home_rail",
          status: "done",
          job_id: "job-1",
          after: makeArmMonitor({ rail_homed: true, rail_enabled: true, rail_pos_m: 0 }),
        }),
      ),
    ).toEqual({ text: "Manipulation Arm · rail homed (rail 0.000 m)", tone: "success" });
  });
});

describe("maintenanceToast", () => {
  it("clear_errors / apply_backstops / recover success copy", () => {
    expect(maintenanceToast(makeMaintenanceResult())).toEqual({
      text: "Perception Arm · errors cleared",
      tone: "success",
    });
    expect(
      maintenanceToast(
        makeMaintenanceResult({
          arm_id: "grip",
          op: "apply_backstops",
          sdk_codes: {
            set_tcp_load: 0,
            set_gravity_direction: 0,
            set_collision_sensitivity: 0,
            set_self_collision_detection: 0,
            set_collision_tool_model: 0,
            set_collision_rebound: 0,
          },
          before: makeArmMonitor({
            collision_sensitivity: 3,
            tcp_load_kg: 0,
            backstops_match: false,
          }),
          after: makeArmMonitor(),
        }),
      ),
    ).toEqual({
      text: "Manipulation Arm · safety settings applied (sensitivity 3, payload 0.95 kg)",
      tone: "success",
    });
    // No read-back (session path) → no parenthesis.
    expect(
      maintenanceToast(
        makeMaintenanceResult({ arm_id: "grip", op: "apply_backstops", before: null, after: null }),
      ).text,
    ).toBe("Manipulation Arm · safety settings applied");
    // Non-fatal SDK warnings: amber, appended.
    expect(
      maintenanceToast(
        makeMaintenanceResult({
          arm_id: "view",
          op: "apply_backstops",
          warnings: ["set_collision_tool_model -> 1"],
          after: makeArmMonitor({ arm_id: "view", tcp_load_kg: 0.55 }),
        }),
      ),
    ).toEqual({
      text: "Perception Arm · safety settings applied (sensitivity 3, payload 0.55 kg) — set_collision_tool_model -> 1",
      tone: "warning",
    });
    expect(
      maintenanceToast(
        makeMaintenanceResult({
          arm_id: "grip",
          op: "recover",
          path: "session",
          before: null,
          after: null,
        }),
      ),
    ).toEqual({ text: "Manipulation Arm · re-grip the clutch to continue", tone: "success" });
  });

  it("apply_backstops: the toast names the values WRITTEN; a lagging read-back turns it amber", () => {
    const applied = "safety settings applied: sensitivity 3, payload 0.95 kg at (0, 0, 60) mm";
    // Read-back caught up (backstops_match true): green, values from the detail.
    expect(
      maintenanceToast(
        makeMaintenanceResult({
          arm_id: "grip",
          op: "apply_backstops",
          detail: applied,
          after: makeArmMonitor({ tcp_load_kg: 0.97 }), // within tolerance; the toast says 0.95
        }),
      ),
    ).toEqual({
      text: "Manipulation Arm · safety settings applied (sensitivity 3, payload 0.95 kg)",
      tone: "success",
    });
    // The rich report frame lagged the 0.5 s settle window: the runtime still answers
    // ok=true, but `after` reads the OLD values and backstops_match is false.
    expect(
      maintenanceToast(
        makeMaintenanceResult({
          arm_id: "grip",
          op: "apply_backstops",
          detail: `${applied} (read-back not yet reflected: sensitivity 1, payload 0.0)`,
          after: makeArmMonitor({
            collision_sensitivity: 1,
            tcp_load_kg: 0,
            backstops_match: false,
          }),
        }),
      ),
    ).toEqual({
      text: "Manipulation Arm · safety settings applied (sensitivity 3, payload 0.95 kg) — read-back not yet reflected: sensitivity 1, payload 0.0",
      tone: "warning",
    });
    // Mismatch without the runtime note (older detail text): a generic note, still amber.
    expect(
      maintenanceToast(
        makeMaintenanceResult({
          arm_id: "view",
          op: "apply_backstops",
          detail: "",
          after: makeArmMonitor({
            arm_id: "view",
            collision_sensitivity: 1,
            tcp_load_kg: 0,
            backstops_match: false,
          }),
        }),
      ),
    ).toEqual({
      text: "Perception Arm · safety settings applied (sensitivity 1, payload 0.00 kg) — read-back still differs from config",
      tone: "warning",
    });
    // Lag AND a non-fatal SDK warning: both appended.
    expect(
      maintenanceToast(
        makeMaintenanceResult({
          arm_id: "view",
          op: "apply_backstops",
          detail: `${applied} (read-back not yet reflected: sensitivity 1, payload 0.0)`,
          warnings: ["set_collision_tool_model returned 1"],
          after: makeArmMonitor({
            arm_id: "view",
            collision_sensitivity: 1,
            backstops_match: false,
          }),
        }),
      ).text,
    ).toBe(
      "Perception Arm · safety settings applied (sensitivity 3, payload 0.95 kg) — read-back not yet reflected: sensitivity 1, payload 0.0; set_collision_tool_model returned 1",
    );
  });

  it("ok: false → error tone with the runtime detail", () => {
    expect(
      maintenanceToast(
        makeMaintenanceResult({ op: "recover", ok: false, detail: "recover needs a session" }),
      ),
    ).toEqual({ text: "Perception Arm · recover needs a session", tone: "error" });
    expect(maintenanceToast(makeMaintenanceResult({ ok: false, detail: "" })).text).toBe(
      "Perception Arm · clear_errors failed",
    );
  });

  it("maintenanceErrorText: ApiError detail, Error message, anything else", () => {
    expect(maintenanceErrorText("grip", new ApiError(409, "monitor paused"))).toBe(
      "Manipulation Arm · monitor paused",
    );
    expect(maintenanceErrorText("view", new Error("Failed to fetch"))).toBe(
      "Perception Arm · Failed to fetch",
    );
    expect(maintenanceErrorText("x", "boom")).toBe("x · boom");
  });
});

// -- 2026-09-11: the operator's collision-sensitivity control -------------------------------
describe("collision sensitivity (2026-09-11)", () => {
  const arm = makeArmStatus({ arm_id: "grip", ip: "192.168.1.201", reachable: "open" });

  it("levels: exactly 1 / 2 / 3 (0 = off, 4 / 5 false-trigger under payload)", () => {
    expect(SENSITIVITY_LEVELS).toEqual([1, 2, 3]);
    for (const ok of [1, 2, 3]) expect(isSensitivityLevel(ok)).toBe(true);
    for (const bad of [0, 4, 5, -1, 2.5, null, undefined, "2", NaN]) {
      expect(isSensitivityLevel(bad)).toBe(false);
    }
    expect(SENSITIVITY_HINT).toBe(
      "as written to the controller; the config value 3 returns at the next connect",
    );
  });

  it("view: sensitivity is the raw read-back; enabled iff selectable + monitor live + not locked + not busy", () => {
    // The default row: read-back 3, running, no session -> the dropdown is live.
    expect(maintenanceView(makeArmMonitor(), arm, false)).toMatchObject({
      sensitivity: 3,
      sensitivityEnabled: true,
    });
    // The read-back is shown whatever it is; only 1..3 is selectable.
    expect(maintenanceView(makeArmMonitor({ collision_sensitivity: 5 }), arm, false)).toMatchObject(
      { sensitivity: 5, sensitivityEnabled: false },
    );
    expect(maintenanceView(makeArmMonitor({ collision_sensitivity: 0 }), arm, false)).toMatchObject(
      { sensitivity: 0, sensitivityEnabled: false },
    );
    expect(
      maintenanceView(makeArmMonitor({ collision_sensitivity: null }), arm, false),
    ).toMatchObject({ sensitivity: null, sensitivityEnabled: false });
    expect(maintenanceView(null, arm, false)).toMatchObject({
      sensitivity: null,
      sensitivityEnabled: false,
    });
    // Monitor not live (paused / off / connecting / error): read-back kept, control off.
    for (const status of ["paused", "off", "connecting", "error"] as const) {
      expect(maintenanceView(makeArmMonitor({ status }), arm, false)).toMatchObject({
        sensitivity: 3,
        sensitivityEnabled: false,
      });
    }
    expect(
      maintenanceView(makeArmMonitor({ status: "stale" }), arm, false).sensitivityEnabled,
    ).toBe(true);
    // Same lock matrix as the buttons: a session, a homing elsewhere, an op on this arm.
    expect(maintenanceView(makeArmMonitor(), arm, true)).toMatchObject({
      sensitivityEnabled: false,
      reason: REASON_USE_COCKPIT,
    });
    expect(maintenanceView(makeArmMonitor(), arm, false, true)).toMatchObject({
      sensitivityEnabled: false,
      reason: REASON_HOMING_IN_PROGRESS,
    });
    expect(maintenanceView(makeArmMonitor({ maintenance_busy: true }), arm, false)).toMatchObject({
      sensitivityEnabled: false,
      busy: true,
    });
    // Unlike Apply, a matching read-back does not disable it (the operator overrides
    // the config on purpose); a mismatch does not enable it either.
    expect(
      maintenanceView(makeArmMonitor({ backstops_match: true }), arm, false).sensitivityEnabled,
    ).toBe(true);
    expect(
      maintenanceView(
        makeArmMonitor({ collision_sensitivity: 2, backstops_match: false }),
        arm,
        false,
      ),
    ).toMatchObject({ sensitivity: 2, sensitivityEnabled: true, applyEnabled: true });
  });

  it("toast: 'collision sensitivity set to N' from the result level, else the after read-back, else the detail; refusals use the detail", () => {
    // Session path: no samples, the result carries the level written.
    expect(
      maintenanceToast(
        makeMaintenanceResult({
          arm_id: "grip",
          op: "set_collision_sensitivity",
          path: "session",
          detail: "collision sensitivity set to 2",
          sdk_codes: { set_collision_sensitivity: 0 },
          before: null,
          after: null,
          collision_sensitivity: 2,
        }),
      ),
    ).toEqual({ text: "Manipulation Arm · collision sensitivity set to 2", tone: "success" });
    // Monitor path: the field wins over the after read-back and the detail.
    expect(
      maintenanceToast(
        makeMaintenanceResult({
          arm_id: "view",
          op: "set_collision_sensitivity",
          detail:
            "collision sensitivity set to 1 (was 3; the config value 3 is re-applied at the next connect)",
          sdk_codes: { set_collision_sensitivity: 0 },
          after: makeArmMonitor({ arm_id: "view", collision_sensitivity: 1 }),
          collision_sensitivity: 1,
        }),
      ),
    ).toEqual({ text: "Perception Arm · collision sensitivity set to 1", tone: "success" });
    // An older result without the field: the after read-back, then the detail.
    expect(
      maintenanceToast(
        makeMaintenanceResult({
          arm_id: "grip",
          op: "set_collision_sensitivity",
          detail: "",
          after: makeArmMonitor({ collision_sensitivity: 2 }),
        }),
      ).text,
    ).toBe("Manipulation Arm · collision sensitivity set to 2");
    expect(
      maintenanceToast(
        makeMaintenanceResult({
          arm_id: "grip",
          op: "set_collision_sensitivity",
          detail:
            "collision sensitivity set to 3 (was 2; the config value 3 is re-applied at the next connect)",
          before: null,
          after: null,
        }),
      ).text,
    ).toBe("Manipulation Arm · collision sensitivity set to 3");
    expect(
      maintenanceToast(
        makeMaintenanceResult({
          arm_id: "grip",
          op: "set_collision_sensitivity",
          detail: "",
          before: null,
          after: null,
        }),
      ).text,
    ).toBe("Manipulation Arm · collision sensitivity set");
    // A status echo the driver reported as a warning: amber, appended.
    expect(
      maintenanceToast(
        makeMaintenanceResult({
          arm_id: "grip",
          op: "set_collision_sensitivity",
          path: "session",
          before: null,
          after: null,
          collision_sensitivity: 2,
          warnings: ["set_collision_sensitivity returned 1 (status echo)"],
        }),
      ),
    ).toEqual({
      text: "Manipulation Arm · collision sensitivity set to 2 — set_collision_sensitivity returned 1 (status echo)",
      tone: "warning",
    });
    // Refusals: the runtime's detail, error tone (the generic ok:false path).
    expect(
      maintenanceToast(
        makeMaintenanceResult({
          arm_id: "grip",
          op: "set_collision_sensitivity",
          ok: false,
          detail: "collision sensitivity still reads 3 after writing 2",
          before: null,
          after: null,
        }),
      ),
    ).toEqual({
      text: "Manipulation Arm · collision sensitivity still reads 3 after writing 2",
      tone: "error",
    });
  });
});
