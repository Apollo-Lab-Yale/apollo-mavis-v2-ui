/** Cockpit collision-sensitivity panel (2026-09-11): one row per telemetry arm
 * (Manipulation Arm first), the value = the monitor row's read-back, else the
 * runtime's in-session `ArmTelemetry.collision_sensitivity`, else a disabled
 * "—"; a change POSTs the maintenance op with the level; never optimistic; the
 * hint repeats the volatility rule; disabled for observers / control down. */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArmMaintenanceResult, ArmTelemetry } from "../gen";
import {
  makeArm,
  makeArmMonitor,
  makeHardwareMonitor,
  makeMaintenanceResult,
} from "../../tests/mocks/fixtures";
import { useStore } from "../store";
import { SensitivityPanel, sessionSensitivity } from "./SensitivityPanel";

describe("SensitivityPanel (Cockpit, hardware sessions)", () => {
  let posts: { url: string; body: unknown }[];
  let answer: (armId: string, body: Record<string, unknown>) => Response;
  let release: (() => void) | null;
  const arms = [makeArm({ arm_id: "view" }), makeArm({ arm_id: "grip" })]; // wire order: view first
  const ok = (r: Partial<ArmMaintenanceResult>) =>
    new Response(JSON.stringify(makeMaintenanceResult(r)), { status: 200 });

  beforeEach(() => {
    posts = [];
    release = null;
    answer = (armId, body) =>
      ok({
        arm_id: armId,
        op: "set_collision_sensitivity",
        path: "session",
        detail: `collision sensitivity set to ${body["collision_sensitivity"]}`,
        sdk_codes: { set_collision_sensitivity: 0 },
        before: null,
        after: null,
        collision_sensitivity: body["collision_sensitivity"] as number,
      });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "POST") {
          const body = JSON.parse(String(init.body)) as Record<string, unknown>;
          posts.push({ url, body });
          const armId = /\/arms\/([^/]+)\//.exec(url)?.[1] ?? "";
          if (release !== null) {
            await new Promise<void>((r) => {
              release = r;
            });
          }
          return answer(armId, body);
        }
        return new Response("{}", { status: 200 });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    useStore.setState({ toasts: [] });
  });

  it("sessionSensitivity: monitor row first, then the in-session ArmTelemetry field, else null", () => {
    const monitor = makeHardwareMonitor({
      paused: true,
      arms: [makeArmMonitor({ collision_sensitivity: 2 }), makeArmMonitor({ arm_id: "view" })],
    });
    expect(sessionSensitivity(makeArm({ arm_id: "grip" }), monitor)).toBe(2);
    expect(sessionSensitivity(makeArm({ arm_id: "view" }), monitor)).toBe(3);
    // The runtime half's additive ArmTelemetry field (optional on the wire).
    const inSession: ArmTelemetry = makeArm({ arm_id: "grip", collision_sensitivity: 1 });
    expect(sessionSensitivity(inSession, null)).toBe(1);
    expect(sessionSensitivity(inSession, makeHardwareMonitor({ arms: [] }))).toBe(1);
    // The monitor row wins when both exist; a null row falls through to the field.
    expect(sessionSensitivity(inSession, monitor)).toBe(2);
    expect(
      sessionSensitivity(
        inSession,
        makeHardwareMonitor({ arms: [makeArmMonitor({ collision_sensitivity: null })] }),
      ),
    ).toBe(1);
    expect(sessionSensitivity(makeArm({ arm_id: "grip" }), null)).toBeNull();
    expect(
      sessionSensitivity(makeArm({ arm_id: "grip" }), makeHardwareMonitor({ arms: [] })),
    ).toBeNull();
  });

  it("one row per arm, Manipulation Arm first, value = read-back, hint text, '—' placeholder when unknown", () => {
    render(
      <SensitivityPanel
        arms={arms}
        monitor={makeHardwareMonitor({
          paused: true,
          arms: [makeArmMonitor({ collision_sensitivity: 2 })], // no row for view
        })}
        disabled={false}
      />,
    );
    const panel = screen.getByTestId("sensitivity-panel");
    expect(panel.getAttribute("role")).toBe("group");
    expect(panel.getAttribute("aria-label")).toBe("Collision sensitivity");
    const rows = panel.querySelectorAll(".sensitivity-row");
    expect(Array.from(rows).map((r) => r.getAttribute("data-testid"))).toEqual([
      "cockpit-sensitivity-row-grip",
      "cockpit-sensitivity-row-view",
    ]);
    expect(rows[0]!.textContent).toContain("Manipulation Arm");
    expect(rows[1]!.textContent).toContain("Perception Arm");
    const grip = screen.getByTestId("cockpit-sensitivity-grip") as HTMLSelectElement;
    const view = screen.getByTestId("cockpit-sensitivity-view") as HTMLSelectElement;
    expect(grip.value).toBe("2");
    expect(grip).not.toBeDisabled();
    expect(Array.from(grip.options).map((o) => o.textContent)).toEqual(["1", "2", "3"]);
    expect(grip.getAttribute("aria-label")).toBe("Collision sensitivity · Manipulation Arm");
    expect(view.value).toBe("");
    expect(view).toBeDisabled();
    expect(view.options[0]!.textContent).toBe("—");
    expect(view.options[0]!.disabled).toBe(true);
    expect(view.dataset["readback"]).toBe("none");
    expect(screen.getByTestId("sensitivity-hint").textContent).toBe(
      "as written to the controller; the config value 3 returns at the next connect",
    );
  });

  it("changing a level POSTs the op with the level to THAT arm; busy until the toast; never optimistic", async () => {
    release = () => undefined;
    const { rerender } = render(
      <SensitivityPanel
        arms={arms}
        monitor={makeHardwareMonitor({ paused: true })}
        disabled={false}
      />,
    );
    const grip = screen.getByTestId("cockpit-sensitivity-grip") as HTMLSelectElement;
    const view = screen.getByTestId("cockpit-sensitivity-view") as HTMLSelectElement;
    expect(grip.value).toBe("3");
    fireEvent.change(view, { target: { value: "1" } });
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({
      url: "/api/hardware/arms/view/maintenance",
      body: { op: "set_collision_sensitivity", collision_sensitivity: 1 },
    });
    // In flight: the changed select is busy, both are disabled, values unchanged.
    expect(view.getAttribute("aria-busy")).toBe("true");
    expect(view).toBeDisabled();
    expect(grip).toBeDisabled();
    expect(grip.getAttribute("aria-busy")).toBeNull();
    expect(view.value).toBe("3");
    act(() => release?.());
    await waitFor(() => expect(useStore.getState().toasts).toHaveLength(1));
    expect(useStore.getState().toasts[0]).toMatchObject({
      text: "Perception Arm · collision sensitivity set to 1",
      tone: "success",
    });
    await waitFor(() => expect(view.getAttribute("aria-busy")).toBeNull());
    expect(view.value).toBe("3"); // the read-back has not said 1 yet
    // The runtime reports the new level (monitor row while paused, or the in-session
    // ArmTelemetry field): the select follows.
    rerender(
      <SensitivityPanel
        arms={arms}
        monitor={makeHardwareMonitor({
          paused: true,
          arms: [makeArmMonitor(), makeArmMonitor({ arm_id: "view", collision_sensitivity: 1 })],
        })}
        disabled={false}
      />,
    );
    expect(view.value).toBe("1");
    // Same level again: no POST.
    fireEvent.change(view, { target: { value: "1" } });
    await new Promise((r) => setTimeout(r, 20));
    expect(posts).toHaveLength(1);
  });

  it("disabled (observer / control down) disables every select; failures toast the detail", async () => {
    const { rerender } = render(
      <SensitivityPanel arms={arms} monitor={makeHardwareMonitor({ paused: true })} disabled />,
    );
    expect(screen.getByTestId("cockpit-sensitivity-grip")).toBeDisabled();
    expect(screen.getByTestId("cockpit-sensitivity-view")).toBeDisabled();
    answer = () =>
      new Response(
        JSON.stringify({ detail: "hardware sessions: the session driver refused the write" }),
        { status: 409 },
      );
    rerender(
      <SensitivityPanel
        arms={arms}
        monitor={makeHardwareMonitor({ paused: true })}
        disabled={false}
      />,
    );
    const grip = screen.getByTestId("cockpit-sensitivity-grip") as HTMLSelectElement;
    expect(grip).not.toBeDisabled();
    fireEvent.change(grip, { target: { value: "2" } });
    await waitFor(() => expect(useStore.getState().toasts).toHaveLength(1));
    expect(useStore.getState().toasts[0]).toMatchObject({
      text: "Manipulation Arm · hardware sessions: the session driver refused the write",
      tone: "error",
    });
    expect(grip.value).toBe("3");
  });
});
