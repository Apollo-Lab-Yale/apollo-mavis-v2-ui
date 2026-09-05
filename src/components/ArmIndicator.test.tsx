/** ArmIndicator (05-ui §8.2): the controller-error chip is the red `C<code>`
 * of the Welcome arm card (phase-09b), titled with the runtime's fault_detail. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
