import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeArm, makeArmStatus } from "../../tests/mocks/fixtures";
import type { ArmTelemetry } from "../gen";
import { JOG_THROTTLE_MS, JointPanel } from "./JointPanel";

const limits = makeArmStatus().joint_limits as [number, number][];

function mount(arm: ArmTelemetry, over: Partial<Parameters<typeof JointPanel>[0]> = {}) {
  const onJog = vi.fn();
  const onGoto = vi.fn();
  const utils = render(
    <JointPanel
      arm={arm}
      limits={limits}
      disabled={false}
      onJog={onJog}
      onGoto={onGoto}
      {...over}
    />,
  );
  return { onJog, onGoto, utils };
}

const slider = (i: number) =>
  screen.getByTestId(`joint-row-${i}`).querySelector("input[type=range]") as HTMLInputElement;

describe("JointPanel", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] }));
  afterEach(() => vi.useRealTimers());

  it("throttles continuous slider drags to ≤ ~20 Hz jog sends", () => {
    const { onJog } = mount(makeArm());
    const s = slider(0);
    // 40 change events over ~200 ms of fake time.
    for (let i = 0; i < 40; i++) {
      fireEvent.change(s, { target: { value: String(0.01 * i) } });
      vi.advanceTimersByTime(5);
    }
    vi.advanceTimersByTime(JOG_THROTTLE_MS); // flush trailing send
    // 200 ms / 50 ms ≈ 4 sends (+1 leading, +1 trailing tolerance)
    expect(onJog.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(onJog.mock.calls.length).toBeLessThanOrEqual(6);
    // Full positions vector: 7 joints + rail appended.
    const last = onJog.mock.calls.at(-1)![0] as number[];
    expect(last.length).toBe(8);
    expect(last[0]).toBeCloseTo(0.39);
  });

  it('"Go to" emits exactly one goto with the full vector', () => {
    const { onGoto } = mount(makeArm());
    fireEvent.click(screen.getByTestId("goto-button"));
    expect(onGoto).toHaveBeenCalledTimes(1);
    const positions = onGoto.mock.calls[0]![0] as number[];
    expect(positions.length).toBe(8);
  });

  it("renders no rail row when rail_pos_m === null", () => {
    mount(makeArm({ rail_pos_m: null }));
    expect(screen.queryByTestId("joint-row-rail")).toBeNull();
    expect(screen.getAllByRole("slider").length).toBe(7);
  });

  it("renders the rail row for rail arms", () => {
    mount(makeArm({ rail_pos_m: 0.3 }));
    expect(screen.getByTestId("joint-row-rail")).toBeInTheDocument();
    expect(screen.getAllByRole("slider").length).toBe(8);
  });

  it("disables every input while an episode is recording", () => {
    const { utils } = mount(makeArm(), { disabled: true });
    const inputs = utils.container.querySelectorAll("input, button");
    expect(inputs.length).toBeGreaterThan(0);
    for (const el of inputs) expect(el).toBeDisabled();
  });

  it("turns a row amber within 2% of its limits", () => {
    // J2 limits [-2.06, 2.09]; q near the upper limit.
    const q = [0, 2.085, 0, 0.7, 0, 1.2, 0];
    mount(makeArm({ q }));
    expect(screen.getByTestId("joint-row-1").className).toContain("row-amber");
    expect(screen.getByTestId("joint-row-0").className).not.toContain("row-amber");
  });

  it('shows error UI on goto:"failed"', () => {
    mount(makeArm({ goto: "failed" }));
    expect(screen.getByTestId("goto-failed")).toBeInTheDocument();
  });

  it("shows lifecycle states on the goto button", () => {
    mount(makeArm({ goto: "planning" }));
    expect(screen.getByTestId("goto-button")).toHaveTextContent("Planning…");
    expect(screen.getByTestId("goto-button")).toBeDisabled();
  });

  it("idle values track telemetry; a dragged row is user-owned", () => {
    const { utils } = mount(makeArm({ q: [0, -0.5, 0, 0.7, 0, 1.2, 0] }));
    const s0 = slider(0);
    const s1 = () =>
      screen.getByTestId("joint-row-1").querySelector("input[type=range]") as HTMLInputElement;
    expect(Number(s1().value)).toBeCloseTo(-0.5);

    // Start dragging row 0.
    fireEvent.pointerDown(s0);
    fireEvent.change(s0, { target: { value: "1.5" } });

    // New telemetry arrives.
    utils.rerender(
      <JointPanel
        arm={makeArm({ q: [0.9, -0.4, 0, 0.7, 0, 1.2, 0] })}
        limits={limits}
        disabled={false}
        onJog={vi.fn()}
        onGoto={vi.fn()}
      />,
    );
    expect(Number(slider(0).value)).toBeCloseTo(1.5); // owned — does not follow
    expect(Number(s1().value)).toBeCloseTo(-0.4); // idle — follows telemetry

    // Release: row re-syncs on the next telemetry.
    fireEvent.pointerUp(slider(0));
    utils.rerender(
      <JointPanel
        arm={makeArm({ q: [0.8, -0.4, 0, 0.7, 0, 1.2, 0] })}
        limits={limits}
        disabled={false}
        onJog={vi.fn()}
        onGoto={vi.fn()}
      />,
    );
    expect(Number(slider(0).value)).toBeCloseTo(0.8);
  });
});
