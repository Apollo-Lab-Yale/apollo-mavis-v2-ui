/** SegmentedControl (phase-11 §4): tablist semantics, thumb transform,
 * pointer vs keyboard origin (keyboard → data-instant, no animation). */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SegmentedControl } from "./SegmentedControl";

type Tab = "hardware" | "sim";
const options = [
  { value: "hardware" as Tab, label: "Hardware", testId: "kind-hardware" },
  { value: "sim" as Tab, label: "Sim", testId: "kind-sim" },
];

describe("SegmentedControl", () => {
  it("renders a tablist with one selected tab and a thumb translated to it", () => {
    render(
      <SegmentedControl options={options} value="sim" onChange={vi.fn()} aria-label="Workcell" />,
    );
    const list = screen.getByRole("tablist");
    expect(list.getAttribute("aria-label")).toBe("Workcell");
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual(["false", "true"]);
    expect(tabs.map((t) => t.tabIndex)).toEqual([-1, 0]);
    expect(screen.getByTestId("seg-thumb").style.transform).toBe("translateX(100%)");
    expect(screen.getByTestId("seg-thumb").style.width).toContain("100% - 4px");
    expect(list.hasAttribute("data-instant")).toBe(false);
  });

  it("click → onChange(value, 'pointer') without data-instant; same tab is a no-op", () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={options} value="sim" onChange={onChange} />);
    fireEvent.click(screen.getByTestId("kind-hardware"));
    expect(onChange).toHaveBeenCalledWith("hardware", "pointer");
    expect(screen.getByRole("tablist").hasAttribute("data-instant")).toBe(false);
    fireEvent.click(screen.getByTestId("kind-sim"));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("arrow keys move with automatic activation and mark the change instant", () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={options} value="hardware" onChange={onChange} />);
    const list = screen.getByRole("tablist");
    fireEvent.keyDown(list, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("sim", "keyboard");
    expect(list.getAttribute("data-instant")).toBe("");
    expect(document.activeElement).toBe(screen.getByTestId("kind-sim"));
    fireEvent.keyDown(list, { key: "ArrowLeft" }); // wraps (still on hardware in props) → sim
    expect(onChange).toHaveBeenLastCalledWith("sim", "keyboard");
    fireEvent.keyDown(list, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("sim", "keyboard");
    fireEvent.keyDown(list, { key: "Home" });
    expect(onChange).toHaveBeenCalledTimes(3); // Home → hardware, already selected → no call
    // A later pointer change clears the instant flag.
    fireEvent.click(screen.getByTestId("kind-sim"));
    expect(list.hasAttribute("data-instant")).toBe(false);
  });

  it("disabled segments carry their reason and are skipped by the keyboard", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        options={[
          { ...options[0]!, disabled: true, disabledReason: "Hardware workcell not configured" },
          options[1]!,
        ]}
        value="sim"
        onChange={onChange}
      />,
    );
    const hw = screen.getByTestId("kind-hardware");
    expect(hw).toBeDisabled();
    expect(hw.getAttribute("title")).toBe("Hardware workcell not configured");
    fireEvent.click(hw);
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowLeft" });
    expect(onChange).not.toHaveBeenCalled();
  });
});
