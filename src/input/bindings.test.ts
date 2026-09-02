import { describe, expect, it } from "vitest";
import { KEYMAP } from "../../tests/mocks/fixtures";
import type { KeymapEntry } from "../gen";
import {
  CONTROLLER_GLYPHS,
  actionFor,
  buildBindings,
  controllerGlyph,
  keycapLabel,
} from "./bindings";

describe("buildBindings", () => {
  const b = buildBindings(KEYMAP);

  it("partitions bound/held/discrete from the keymap", () => {
    expect(b.bound.has("KeyW")).toBe(true);
    expect(b.bound.has("Tab")).toBe(true);
    expect(b.bound.has("ArrowLeft")).toBe(true); // rail keys always bound
    expect(b.held.has("KeyW")).toBe(true);
    expect(b.held.has("Tab")).toBe(false);
    expect(b.discrete.get("Tab")).toBe("switch_arm");
    expect(b.discrete.get("Space")).toBe("takeover_toggle");
    expect(b.discrete.has("KeyW")).toBe(false);
  });

  it("groups entries for the overlay", () => {
    expect(b.byGroup.get("translate")?.length).toBe(6);
    expect(b.byGroup.get("rail")?.every((e) => e.requires_rail)).toBe(true);
  });

  it("tolerates unknown groups", () => {
    const weird = [
      {
        code: "KeyZ",
        action: "mystery",
        kind: "held",
        label: "?",
        group: "future",
        requires_rail: false,
      },
    ] as unknown as KeymapEntry[];
    const bb = buildBindings(weird);
    expect(bb.bound.has("KeyZ")).toBe(true);
    expect(bb.byGroup.get("future" as KeymapEntry["group"])?.length).toBe(1);
  });

  it("actionFor resolves discrete codes only", () => {
    expect(actionFor(b, "Tab")).toBe("switch_arm");
    expect(actionFor(b, "KeyW")).toBeNull();
    expect(actionFor(b, "KeyZ")).toBe("switch_arm_prev");
    expect(actionFor(b, "KeyP")).toBeNull();
  });

  it("keycapLabel formats codes for the overlay", () => {
    expect(keycapLabel("KeyW")).toBe("W");
    expect(keycapLabel("ArrowLeft")).toBe("←");
    expect(keycapLabel("Space")).toBe("Space");
  });
});

describe("controllerGlyph (13-tracker §1.1 static table, keyed by action)", () => {
  it("maps exactly the six controller-driven actions (§1.1 mapping table)", () => {
    expect(Object.keys(CONTROLLER_GLYPHS).sort()).toEqual([
      "gripper_close",
      "gripper_open",
      "rail_neg",
      "rail_pos",
      "switch_arm",
      "tracker_clutch",
    ]);
    expect(controllerGlyph("tracker_clutch")).toBe("trigger");
    expect(controllerGlyph("gripper_open")).toBe("pad ▲");
    expect(controllerGlyph("gripper_close")).toBe("pad ▼");
    expect(controllerGlyph("rail_neg")).toBe("pad ◀");
    expect(controllerGlyph("rail_pos")).toBe("pad ▶");
    expect(controllerGlyph("switch_arm")).toBe("menu");
  });

  it("returns null for every other action and for missing input", () => {
    // switch_arm_prev is keyboard-only; grip / system are never mapped.
    expect(controllerGlyph("switch_arm_prev")).toBeNull();
    expect(controllerGlyph("translate_x_pos")).toBeNull();
    expect(controllerGlyph("takeover_toggle")).toBeNull();
    expect(controllerGlyph(null)).toBeNull();
    expect(controllerGlyph(undefined)).toBeNull();
  });

  it("every action in the table exists in the served keymap", () => {
    const actions = new Set(KEYMAP.map((e) => e.action));
    for (const a of Object.keys(CONTROLLER_GLYPHS)) expect(actions.has(a)).toBe(true);
  });
});
