/** FaultBanner (05-ui §8.2, phase-09b): raised by `fault_detail` /
 * `recovering` on any arm or by the session state; one row per arm with the
 * `C<code> <title>` label; the recover button only in hardware sessions,
 * busy while recovering / in flight; POST body and toast copy asserted on a
 * fetch stub. */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeArm, makeMaintenanceResult } from "../../tests/mocks/fixtures";
import { useStore } from "../store";
import {
  FaultBanner,
  faultedArms,
  isWarningRow,
  RECOVER_LABEL,
  sessionFaulted,
} from "./FaultBanner";

const SPEED = "controller error 24: Speed Exceeds Limit";
const STUDIO = "warning: close UFACTORY Studio live control";

describe("FaultBanner", () => {
  let posts: { url: string; body: unknown }[];
  let answer: () => Response;
  let release: (() => void) | null;

  beforeEach(() => {
    posts = [];
    release = null;
    answer = () =>
      new Response(
        JSON.stringify(
          makeMaintenanceResult({
            arm_id: "grip",
            op: "recover",
            path: "session",
            before: null,
            after: null,
          }),
        ),
        { status: 200 },
      );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "POST") {
          posts.push({ url, body: JSON.parse(String(init.body)) });
          if (release === null) return answer();
          await new Promise<void>((r) => {
            release = r;
          });
          return answer();
        }
        return new Response("{}", { status: 200 });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    useStore.setState({ toasts: [] });
  });

  it("helpers: faultedArms (Manipulation Arm first) and sessionFaulted", () => {
    expect(
      faultedArms([
        makeArm({ arm_id: "view", fault_detail: SPEED, error_code: 24 }),
        makeArm({ arm_id: "grip", recovering: true }),
        makeArm({ arm_id: "x" }),
      ]).map((a) => a.arm_id),
    ).toEqual(["grip", "view"]);
    expect(sessionFaulted("fault")).toBe(true);
    expect(sessionFaulted("recovering")).toBe(true);
    expect(sessionFaulted("running")).toBe(false);
    expect(sessionFaulted(null)).toBe(false);
    expect(sessionFaulted(undefined)).toBe(false);
  });

  it("renders nothing while no arm faults and the session runs", () => {
    render(
      <FaultBanner
        arms={[makeArm(), makeArm({ arm_id: "view" })]}
        sessionState="running"
        hardware={true}
      />,
    );
    expect(screen.queryByTestId("fault-banner")).toBeNull();
  });

  it("hardware fault: red banner, arm row with C<code> <title>, recover button per faulted arm", () => {
    render(
      <FaultBanner
        arms={[
          makeArm({ arm_id: "view", error_code: 24, fault_detail: SPEED }),
          makeArm({ arm_id: "grip" }),
        ]}
        sessionState="fault"
        hardware={true}
      />,
    );
    const banner = screen.getByTestId("fault-banner");
    expect(banner.className).toBe("banner banner-fault banner-red");
    expect(banner.dataset["state"]).toBe("fault");
    expect(banner.getAttribute("role")).toBe("alert");
    const row = screen.getByTestId("fault-row-view");
    expect(row.textContent).toContain("CONTROLLER FAULT — Perception Arm C24 Speed Exceeds Limit");
    expect(row.textContent).not.toContain("re-grip");
    expect(within(row).getByTestId("fault-recover-view").textContent).toBe(RECOVER_LABEL);
    expect(within(row).getByTestId("fault-recover-view")).not.toBeDisabled();
    expect(screen.queryByTestId("fault-row-grip")).toBeNull();
    expect(screen.queryByTestId("fault-row-session")).toBeNull();
  });

  it("sim session: the fault is shown, no button", () => {
    render(
      <FaultBanner
        arms={[
          makeArm({
            arm_id: "grip",
            error_code: 31,
            fault_detail: "controller error 31: Collision",
          }),
        ]}
        sessionState="fault"
        hardware={false}
      />,
    );
    expect(screen.getByTestId("fault-row-grip").textContent).toContain(
      "Manipulation Arm C31 Collision",
    );
    expect(screen.queryByTestId("fault-recover-grip")).toBeNull();
  });

  it("recovering: amber banner, busy button, re-grip hint; stale suffix", () => {
    render(
      <FaultBanner
        arms={[makeArm({ arm_id: "grip", error_code: 24, fault_detail: SPEED, recovering: true })]}
        sessionState="recovering"
        hardware={true}
        stale
      />,
    );
    const banner = screen.getByTestId("fault-banner");
    expect(banner.className).toBe("banner banner-fault banner-amber");
    expect(banner.dataset["state"]).toBe("recovering");
    const row = screen.getByTestId("fault-row-grip");
    expect(row.textContent).toContain(
      "RECOVERING — Manipulation Arm C24 Speed Exceeds Limit · re-grip the clutch to continue (stale)",
    );
    const btn = screen.getByTestId("fault-recover-grip");
    expect(btn).toBeDisabled();
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn.querySelector(".spinner")).not.toBeNull();
  });

  it("recovering on the REAL wire (error_code already 0, fault_detail kept): no 'C0'", () => {
    // The driver's recovery clears the controller error before the loop leaves
    // RECOVERING (runtime test_fault_recovery_loop pins error_code 0 + the text).
    render(
      <FaultBanner
        arms={[makeArm({ arm_id: "grip", error_code: 0, fault_detail: SPEED, recovering: true })]}
        sessionState="recovering"
        hardware={true}
      />,
    );
    const row = screen.getByTestId("fault-row-grip");
    expect(row.textContent).toBe(
      "RECOVERING — Manipulation Arm C24 Speed Exceeds Limit · re-grip the clutch to continueClear errors & resume",
    );
    expect(row.textContent).not.toContain("C0");
    expect(screen.getByTestId("fault-banner").className).toContain("banner-amber");
  });

  it("code-less driver faults (latch texts) with error_code 0: no chip, button present", () => {
    render(
      <FaultBanner
        arms={[
          makeArm({
            arm_id: "grip",
            error_code: 0,
            fault_detail: "recovery budget exhausted (3 in 30 s)",
          }),
        ]}
        sessionState="fault"
        hardware={true}
      />,
    );
    const row = screen.getByTestId("fault-row-grip");
    expect(row.textContent).toContain(
      "CONTROLLER FAULT — Manipulation Arm recovery budget exhausted (3 in 30 s)",
    );
    expect(row.textContent).not.toContain("C0");
    expect(screen.getByTestId("fault-recover-grip")).not.toBeDisabled();
  });

  it("a lingering StudioConflictWarning is an amber display-only WARNING row (no C0, no button)", () => {
    // Runtime shape: fault_detail "warning: …" for 5 s, error_code 0, recovering false,
    // session still running — the arm was NOT stopped, so no recover button (a click
    // would run the driver's user recovery and needlessly halt a healthy arm).
    const warn = makeArm({ arm_id: "grip", error_code: 0, fault_detail: STUDIO });
    expect(isWarningRow(warn)).toBe(true);
    expect(isWarningRow(makeArm({ arm_id: "grip", error_code: 24, fault_detail: SPEED }))).toBe(
      false,
    );
    expect(isWarningRow(makeArm({ ...warn, recovering: true }))).toBe(false);
    expect(isWarningRow(makeArm({ ...warn, error_code: 24 }))).toBe(false);
    render(
      <FaultBanner
        arms={[warn, makeArm({ arm_id: "view" })]}
        sessionState="running"
        hardware={true}
      />,
    );
    const banner = screen.getByTestId("fault-banner");
    expect(banner.className).toBe("banner banner-fault banner-amber");
    expect(banner.dataset["state"]).toBe("warning");
    const row = screen.getByTestId("fault-row-grip");
    expect(row.dataset["kind"]).toBe("warning");
    expect(row.textContent).toBe("WARNING — Manipulation Arm close UFACTORY Studio live control");
    expect(row.textContent).not.toContain("C0");
    expect(row.textContent).not.toContain("CONTROLLER FAULT");
    expect(screen.queryByTestId("fault-recover-grip")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByTestId("fault-row-session")).toBeNull();
  });

  it("warning on one arm + fault on the other → red; only the faulted row has a button", () => {
    render(
      <FaultBanner
        arms={[
          makeArm({ arm_id: "grip", error_code: 0, fault_detail: STUDIO }),
          makeArm({ arm_id: "view", error_code: 19, fault_detail: "controller error 19" }),
        ]}
        sessionState="fault"
        hardware={true}
        stale
      />,
    );
    const banner = screen.getByTestId("fault-banner");
    expect(banner.className).toContain("banner-red");
    expect(banner.dataset["state"]).toBe("fault");
    expect(screen.getByTestId("fault-row-grip").textContent).toBe(
      "WARNING — Manipulation Arm close UFACTORY Studio live control (stale)",
    );
    expect(screen.queryByTestId("fault-recover-grip")).toBeNull();
    expect(screen.getByTestId("fault-row-view").textContent).toContain("Perception Arm C19");
    expect(screen.getByTestId("fault-recover-view")).not.toBeDisabled();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("one arm recovering, the other still faulted → red (a fault stands)", () => {
    render(
      <FaultBanner
        arms={[
          makeArm({ arm_id: "grip", error_code: 24, fault_detail: SPEED, recovering: true }),
          makeArm({ arm_id: "view", error_code: 19, fault_detail: "controller error 19" }),
        ]}
        sessionState="fault"
        hardware={true}
      />,
    );
    expect(screen.getByTestId("fault-banner").className).toContain("banner-red");
    expect(screen.getByTestId("fault-row-view").textContent).toContain("Perception Arm C19");
    expect(screen.getByTestId("fault-recover-view")).not.toBeDisabled();
    expect(screen.getByTestId("fault-recover-grip")).toBeDisabled();
  });

  it("session state alone raises the banner (no arm row → no button)", () => {
    const { rerender } = render(
      <FaultBanner arms={[makeArm()]} sessionState="fault" hardware={true} />,
    );
    expect(screen.getByTestId("fault-banner").className).toContain("banner-red");
    expect(screen.getByTestId("fault-row-session").textContent).toBe(
      "CONTROLLER FAULT — session halted",
    );
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<FaultBanner arms={[makeArm()]} sessionState="recovering" hardware={true} />);
    expect(screen.getByTestId("fault-banner").className).toContain("banner-amber");
    expect(screen.getByTestId("fault-row-session").textContent).toBe(
      "RECOVERING — re-grip the clutch to continue",
    );
  });

  it("click → POST {op: recover} for that arm, busy in flight, success toast with the re-grip hint", async () => {
    release = () => undefined; // hold the request until released
    render(
      <FaultBanner
        arms={[makeArm({ arm_id: "grip", error_code: 24, fault_detail: SPEED })]}
        sessionState="fault"
        hardware={true}
      />,
    );
    const btn = screen.getByTestId("fault-recover-grip");
    fireEvent.click(btn);
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({
      url: "/api/hardware/arms/grip/maintenance",
      body: { op: "recover" },
    });
    expect(btn).toBeDisabled();
    expect(btn.getAttribute("aria-busy")).toBe("true");
    // A second click while in flight sends nothing.
    fireEvent.click(btn);
    expect(posts).toHaveLength(1);
    act(() => release?.());
    await waitFor(() => expect(useStore.getState().toasts).toHaveLength(1));
    expect(useStore.getState().toasts[0]).toMatchObject({
      text: "Manipulation Arm · re-grip the clutch to continue",
      tone: "success",
    });
    await waitFor(() => expect(btn).not.toBeDisabled());
    expect(btn.getAttribute("aria-busy")).toBeNull();
  });

  it("ok: false → error toast with detail; 409 → error toast with the server detail", async () => {
    answer = () =>
      new Response(
        JSON.stringify(
          makeMaintenanceResult({
            arm_id: "grip",
            op: "recover",
            path: "session",
            ok: false,
            detail: "recovery latched: 3 attempts in 30 s",
            before: null,
            after: null,
          }),
        ),
        { status: 200 },
      );
    render(
      <FaultBanner
        arms={[makeArm({ arm_id: "grip", error_code: 24, fault_detail: SPEED })]}
        sessionState="fault"
        hardware={true}
      />,
    );
    fireEvent.click(screen.getByTestId("fault-recover-grip"));
    await waitFor(() => expect(useStore.getState().toasts).toHaveLength(1));
    expect(useStore.getState().toasts[0]).toMatchObject({
      text: "Manipulation Arm · recovery latched: 3 attempts in 30 s",
      tone: "error",
    });
    answer = () =>
      new Response(JSON.stringify({ detail: "no hardware session — use clear_errors" }), {
        status: 409,
      });
    await waitFor(() => expect(screen.getByTestId("fault-recover-grip")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("fault-recover-grip"));
    await waitFor(() => expect(useStore.getState().toasts).toHaveLength(2));
    expect(useStore.getState().toasts[1]).toMatchObject({
      text: "Manipulation Arm · no hardware session — use clear_errors",
      tone: "error",
    });
    expect(posts.map((p) => p.body)).toEqual([{ op: "recover" }, { op: "recover" }]);
  });
});
