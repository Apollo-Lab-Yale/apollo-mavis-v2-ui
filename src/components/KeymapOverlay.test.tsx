import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KEYMAP } from "../../tests/mocks/fixtures";
import type { Mode } from "../lib/types";
import { KeymapOverlay } from "./KeymapOverlay";

const mount = (mode: Mode, hasRail: boolean) =>
  render(
    <KeymapOverlay
      entries={KEYMAP}
      mode={mode}
      activeArmHasRail={hasRail}
      open
      onToggle={() => undefined}
    />,
  );

describe("KeymapOverlay", () => {
  // 2026-09-08: the keymap labels the KEY axes ("forward", "up"), so the live
  // translate frame has to be spelled out or the operator cannot tell what they mean.
  it("captions the live translate frame and says nothing without one", () => {
    mount("teleop", true);
    expect(screen.queryByTestId("translate-frame-caption")).toBeNull();
    expect(screen.getByTestId("keyrow-KeyW")).toHaveTextContent("forward");

    // `world` is the runtime default (operator decision 2026-09-08 evening) and the
    // only caption allowed to say so; the other two are config options.
    for (const [frame, phrase, isDefault] of [
      ["world", "OPERATOR frame", true],
      ["camera", "WRIST-CAMERA frame", false],
      ["base", "BASE axes", false],
    ] as const) {
      const { unmount } = render(
        <KeymapOverlay
          entries={KEYMAP}
          mode="teleop"
          activeArmHasRail
          open
          onToggle={() => undefined}
          translateFrame={frame}
        />,
      );
      const caption = screen.getByTestId("translate-frame-caption");
      expect(caption).toHaveTextContent(frame);
      expect(caption).toHaveTextContent(phrase);
      expect(caption.textContent?.includes("(the default)")).toBe(isDefault);
      expect(caption).toHaveTextContent("Rotations are always about the tool (TCP) axes");
      unmount();
    }
  });

  it("has the return-to-initial key in the session group", () => {
    mount("teleop", true);
    const row = screen.getByTestId("keyrow-KeyR");
    expect(row).toHaveTextContent("R");
    expect(row).toHaveTextContent("return to the initial condition");
    expect(row).toHaveTextContent("session");
  });

  it("hides rail rows when the active arm lacks a rail", () => {
    mount("teleop", false);
    expect(screen.queryByTestId("keyrow-ArrowLeft")).toBeNull();
    expect(screen.queryByTestId("keyrow-ArrowRight")).toBeNull();
  });

  it("shows rail rows when the active arm has a rail", () => {
    mount("teleop", true);
    expect(screen.getByTestId("keyrow-ArrowLeft")).toBeInTheDocument();
    expect(screen.getByTestId("keyrow-ArrowRight")).toBeInTheDocument();
  });

  it("hides episode rows in teleop mode", () => {
    mount("teleop", true);
    expect(screen.queryByTestId("keyrow-KeyN")).toBeNull();
    expect(screen.queryByTestId("keyrow-Enter")).toBeNull();
    expect(screen.queryByTestId("keyrow-Backspace")).toBeNull();
  });

  it("shows episode rows in collect mode", () => {
    mount("collect", true);
    expect(screen.getByTestId("keyrow-KeyN")).toBeInTheDocument();
  });

  it("renders the Space row on dagger with intervention semantics", () => {
    mount("dagger", true);
    const row = screen.getByTestId("keyrow-Space");
    expect(row.textContent).toContain("recorded as intervention");
  });

  it("renders the Space row on inference with safety-escape semantics", () => {
    mount("inference", true);
    const row = screen.getByTestId("keyrow-Space");
    expect(row.textContent).toContain("safety escape — never recorded");
  });

  it("hides the Space row in teleop and collect", () => {
    mount("teleop", true);
    expect(screen.queryByTestId("keyrow-Space")).toBeNull();
  });

  it("renders the tracker group (KeyC clutch) with its RT gamepad glyph", () => {
    mount("teleop", false);
    const row = screen.getByTestId("keyrow-KeyC");
    expect(row.textContent).toContain("tracker clutch");
    expect(row.textContent).toContain("tracker");
    expect(screen.getByTestId("keyrow-KeyC-pad").textContent).toBe("RT");
  });

  it("shows gamepad glyphs from KeymapEntry.gamepad and a dash for unmapped rows", () => {
    mount("teleop", true);
    expect(screen.getByTestId("keyrow-Tab-pad").textContent).toBe("RB");
    expect(screen.getByTestId("keyrow-KeyZ-pad").textContent).toBe("LB");
    expect(screen.getByTestId("keyrow-ArrowLeft-pad").textContent).toBe("◁");
    expect(screen.getByTestId("keyrow-KeyH-pad").textContent).toBe("Ⓐ");
    expect(screen.getByTestId("keyrow-KeyW-pad").textContent).toBe("—");
  });

  it("shows a controller glyph column (static table by action, 13-tracker §1.1)", () => {
    mount("teleop", true);
    expect(screen.getByTestId("keymap-head").textContent).toContain("controller");
    // Trigger click = clutch; trackpad click classified by position at the press
    // edge: up/down = gripper rate (held), left/right = rail (held); menu = switch_arm.
    expect(screen.getByTestId("keyrow-KeyC-ctrl").textContent).toBe("trigger");
    expect(screen.getByTestId("keyrow-KeyH-ctrl").textContent).toBe("pad ▲");
    expect(screen.getByTestId("keyrow-KeyF-ctrl").textContent).toBe("pad ▼");
    expect(screen.getByTestId("keyrow-ArrowLeft-ctrl").textContent).toBe("pad ◀");
    expect(screen.getByTestId("keyrow-ArrowRight-ctrl").textContent).toBe("pad ▶");
    expect(screen.getByTestId("keyrow-Tab-ctrl").textContent).toBe("menu");
    // switch_arm_prev is keyboard-only; translate keys have no controller input;
    // grip / system are never mapped.
    expect(screen.getByTestId("keyrow-KeyZ-ctrl").textContent).toBe("—");
    expect(screen.getByTestId("keyrow-KeyW-ctrl").textContent).toBe("—");
    expect(screen.getByTestId("keyrow-KeyI-ctrl").textContent).toBe("—");
  });

  it("controller glyphs are keyed by action, so the column follows a re-bound keymap", () => {
    const rebound = KEYMAP.map((e) => (e.action === "switch_arm" ? { ...e, code: "KeyM" } : e));
    render(
      <KeymapOverlay
        entries={rebound}
        mode="teleop"
        activeArmHasRail
        open
        onToggle={() => undefined}
      />,
    );
    expect(screen.queryByTestId("keyrow-Tab")).toBeNull();
    expect(screen.getByTestId("keyrow-KeyM-ctrl").textContent).toBe("menu");
  });
});
