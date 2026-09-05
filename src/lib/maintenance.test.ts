/** Pure maintenance helpers (phase-09b): fault labels, the arm-card view
 * (enable/disable matrix) and the exact toast copy. */
import { describe, expect, it } from "vitest";
import { makeArmMonitor, makeArmStatus, makeMaintenanceResult } from "../../tests/mocks/fixtures";
import {
  faultLabel,
  formatKg,
  isWarningDetail,
  maintenanceErrorText,
  maintenanceToast,
  maintenanceView,
  parseFaultDetail,
  REASON_USE_COCKPIT,
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
