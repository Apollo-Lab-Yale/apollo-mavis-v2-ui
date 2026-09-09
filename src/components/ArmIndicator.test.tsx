/** ArmIndicator (05-ui §8.2): the controller-error chip is the red `C<code>`
 * of the Welcome arm card (phase-09b), titled with the runtime's fault_detail;
 * every row is a button that switches the active arm (2026-09-07). */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeArm } from "../../tests/mocks/fixtures";
import { ArmIndicator } from "./ArmIndicator";

describe("ArmIndicator", () => {
  it("error_code != 0 → red C<code> chip titled with fault_detail (or 'controller error N')", () => {
    const { rerender } = render(
      <ArmIndicator
        arms={[
          makeArm({ arm_id: "view", gripper_open_frac: 1 }),
          makeArm({
            arm_id: "grip",
            error_code: 24,
            fault_detail: "controller error 24: Speed Exceeds Limit",
          }),
        ]}
        activeArm="grip"
      />,
    );
    const chip = screen.getByTestId("arm-error-grip");
    expect(chip.textContent).toBe("C24");
    expect(chip.className).toBe("chip chip-red");
    expect(chip.getAttribute("title")).toBe("controller error 24: Speed Exceeds Limit");
    expect(screen.queryByTestId("arm-error-view")).toBeNull();
    expect(screen.getByTestId("arm-indicator").textContent).not.toContain("err 24");
    // Manipulation Arm listed first regardless of the runtime order.
    const rows = screen.getAllByTestId(/^arm-chip-/).map((el) => el.dataset["testid"]);
    expect(rows).toEqual(["arm-chip-grip", "arm-chip-view"]);

    rerender(
      <ArmIndicator arms={[makeArm({ arm_id: "grip", error_code: 19 })]} activeArm="grip" />,
    );
    expect(screen.getByTestId("arm-error-grip").getAttribute("title")).toBe("controller error 19");
    expect(screen.getByTestId("arm-error-grip").textContent).toBe("C19");
  });

  it("rows are buttons that report the SERVER's active arm and select explicitly", () => {
    const onSelect = vi.fn();
    render(
      <ArmIndicator
        arms={[makeArm({ arm_id: "grip" }), makeArm({ arm_id: "view" })]}
        activeArm="grip"
        onSelect={onSelect}
        shortcut="Tab"
      />,
    );
    const grip = screen.getByTestId("arm-chip-grip");
    const view = screen.getByTestId("arm-chip-view");
    expect(grip.tagName).toBe("BUTTON");
    expect(grip.getAttribute("aria-pressed")).toBe("true");
    expect(view.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("arm-indicator").textContent).toContain("click a row or press Tab");

    fireEvent.click(view);
    expect(onSelect).toHaveBeenCalledWith("view");
    // No optimistic highlight — the runtime owns `active_arm`.
    expect(grip.getAttribute("aria-pressed")).toBe("true");
    // Clicking the active row still reports it (the runtime treats it as a no-op).
    fireEvent.click(grip);
    expect(onSelect).toHaveBeenLastCalledWith("grip");
  });

  it("no onSelect / disabled → inert rows that still show every arm", () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <ArmIndicator arms={[makeArm({ arm_id: "grip" })]} activeArm="grip" />,
    );
    expect(screen.getByTestId("arm-chip-grip")).toBeDisabled();
    expect(screen.getByTestId("arm-indicator").textContent).not.toContain("click a row");

    rerender(
      <ArmIndicator
        arms={[makeArm({ arm_id: "grip" })]}
        activeArm="grip"
        onSelect={onSelect}
        disabled
        shortcut="Tab"
      />,
    );
    const grip = screen.getByTestId("arm-chip-grip");
    expect(grip).toBeDisabled();
    fireEvent.click(grip);
    expect(onSelect).not.toHaveBeenCalled();
    expect(grip.textContent).toContain("active"); // telemetry still readable
  });

  it("no shortcut bound → the hint never advertises a dead key", () => {
    render(
      <ArmIndicator arms={[makeArm({ arm_id: "grip" })]} activeArm="grip" onSelect={vi.fn()} />,
    );
    const text = screen.getByTestId("arm-indicator").textContent!;
    expect(text).toContain("click a row");
    expect(text).not.toContain("press");
  });
});
