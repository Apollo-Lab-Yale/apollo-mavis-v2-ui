/** External-policy chip (05-ui §12, 14-dora §13; phase-12): the pure classifier
 * shows nothing unless the bridge is enabled AND attached, green while the
 * policy spec is attached and fresh, amber when `policy_stale` is set or the
 * spec heartbeat is gone; DaggerPanel / InferencePanel render it beside their
 * existing mode chip with the policy id in the tooltip. 2026-09-11: the shared
 * launch predicate `externalPolicyAttached`, the driven arms (`policy_arms` →
 * `drivenArmsLabel`, in the tooltip, the InferencePanel and the status card), the
 * `ExternalPolicyStatus` card both launcher sheets render and its fallbacks. */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeExternal } from "../../tests/mocks/fixtures";
import type { DaggerStatus, InferenceStatus } from "../gen";
import { DaggerPanel } from "./DaggerPanel";
import {
  drivenArmsLabel,
  EXTERNAL_POLICY_ATTACHED,
  EXTERNAL_POLICY_NONE,
  EXTERNAL_POLICY_STALE,
  externalPolicyAttached,
  ExternalPolicyChip,
  externalPolicyChip,
  externalPolicyDetail,
  ExternalPolicyStatus,
  externalPolicySummary,
  externalPolicyTitle,
} from "./externalPolicy";
import { InferencePanel } from "./InferencePanel";

const dagger = (over: Partial<DaggerStatus> = {}): DaggerStatus => ({
  control_mode: "policy",
  engaged_arm: null,
  policy_version: "v000003",
  policy_stale: false,
  ...over,
});

const inference = (over: Partial<InferenceStatus> = {}): InferenceStatus => ({
  control_mode: "policy",
  engaged_arm: null,
  policy_version: "v000003",
  policy_stale: false,
  ...over,
});

describe("externalPolicyChip()", () => {
  it("attached: enabled + attached + policy_attached and not stale -> green", () => {
    expect(externalPolicyChip(makeExternal(), false)).toEqual({
      label: EXTERNAL_POLICY_ATTACHED,
      tone: "green",
    });
    expect(EXTERNAL_POLICY_ATTACHED).toBe("EXTERNAL POLICY attached");
    // An undefined policy_stale (older producer) reads as "not stale".
    expect(externalPolicyChip(makeExternal(), undefined)?.tone).toBe("green");
  });

  it("stale: policy_stale true -> amber", () => {
    expect(externalPolicyChip(makeExternal(), true)).toEqual({
      label: EXTERNAL_POLICY_STALE,
      tone: "amber",
    });
    expect(EXTERNAL_POLICY_STALE).toBe("EXTERNAL POLICY stale");
  });

  it("stale: policy_attached false (spec heartbeat gone) -> amber even when not flagged", () => {
    expect(externalPolicyChip(makeExternal({ policy_attached: false }), false)).toEqual({
      label: EXTERNAL_POLICY_STALE,
      tone: "amber",
    });
  });

  it("disabled: null / undefined / enabled false / not attached -> no chip", () => {
    expect(externalPolicyChip(null, false)).toBeNull();
    expect(externalPolicyChip(undefined, true)).toBeNull();
    expect(externalPolicyChip(makeExternal({ enabled: false }), false)).toBeNull();
    expect(externalPolicyChip(makeExternal({ state: "detached" }), true)).toBeNull();
    expect(
      externalPolicyChip(makeExternal({ state: "disabled", enabled: false }), false),
    ).toBeNull();
    expect(externalPolicyChip(makeExternal({ state: "unavailable" }), false)).toBeNull();
    expect(externalPolicyChip(makeExternal({ state: "closed" }), false)).toBeNull();
  });

  it("title: policy id plus version when known, none without an id; the driven arms when the spec names them", () => {
    expect(externalPolicyTitle(makeExternal())).toBe("act_pick_place v3");
    expect(externalPolicyTitle(makeExternal({ policy_version: null }))).toBe("act_pick_place");
    expect(externalPolicyTitle(makeExternal({ policy_id: null }))).toBeUndefined();
    expect(externalPolicyTitle(makeExternal({ policy_arms: ["grip"] }))).toBe(
      "act_pick_place v3 · drives: Manipulation Arm",
    );
    expect(
      externalPolicyTitle(makeExternal({ policy_id: null, policy_arms: ["grip"] })),
    ).toBeUndefined();
  });
});

describe("externalPolicyAttached() — the shared launch predicate", () => {
  it("true only for enabled + attached + policy_attached", () => {
    expect(externalPolicyAttached(makeExternal())).toBe(true);
    expect(externalPolicyAttached(makeExternal({ policy_attached: false }))).toBe(false);
    expect(externalPolicyAttached(makeExternal({ state: "detached" }))).toBe(false);
    expect(externalPolicyAttached(makeExternal({ enabled: false }))).toBe(false);
    expect(externalPolicyAttached(null)).toBe(false);
    expect(externalPolicyAttached(undefined)).toBe(false);
  });
});

describe("drivenArmsLabel() / externalPolicySummary()", () => {
  it("user-facing names, Manipulation Arm first, comma-separated; empty when absent", () => {
    expect(drivenArmsLabel(makeExternal({ policy_arms: ["grip"] }))).toBe("Manipulation Arm");
    expect(drivenArmsLabel(makeExternal({ policy_arms: ["view", "grip"] }))).toBe(
      "Manipulation Arm, Perception Arm",
    );
    expect(drivenArmsLabel(makeExternal({ policy_arms: ["aux"] }))).toBe("aux");
    expect(drivenArmsLabel(makeExternal())).toBe(""); // fixture default: []
    expect(drivenArmsLabel(makeExternal({ policy_arms: undefined }))).toBe(""); // older runtime
    expect(drivenArmsLabel(null)).toBe("");
  });
  it("summary: id / version / rate / drives, each only when known; empty while nothing is attached", () => {
    expect(externalPolicySummary(makeExternal({ policy_arms: ["grip"] }))).toBe(
      "act_pick_place v3 · 10 Hz · drives: Manipulation Arm",
    );
    expect(externalPolicySummary(makeExternal())).toBe("act_pick_place v3 · 10 Hz");
    expect(
      externalPolicySummary(makeExternal({ policy_version: null, policy_rate_hz: null })),
    ).toBe("act_pick_place");
    expect(externalPolicySummary(makeExternal({ policy_id: null, policy_version: null }))).toBe(
      "policy · 10 Hz",
    );
    expect(externalPolicySummary(makeExternal({ policy_attached: false }))).toBe("");
    expect(externalPolicySummary(makeExternal({ state: "detached" }))).toBe("");
    expect(externalPolicySummary(null)).toBe("");
  });
});

describe("<ExternalPolicyStatus>", () => {
  it("attached: the green chip, no detail, the driven arms when named", () => {
    const { rerender } = render(
      <ExternalPolicyStatus external={makeExternal({ policy_arms: ["grip", "view"] })} />,
    );
    const card = screen.getByTestId("external-policy-status");
    expect(within(card).getByTestId("external-policy-chip").textContent).toBe(
      EXTERNAL_POLICY_ATTACHED,
    );
    expect(within(card).queryByTestId("external-policy-chip-none")).toBeNull();
    expect(within(card).queryByTestId("external-policy-detail")).toBeNull();
    expect(within(card).getByTestId("external-policy-drives").textContent).toBe(
      "drives: Manipulation Arm, Perception Arm",
    );
    rerender(<ExternalPolicyStatus external={makeExternal()} />);
    expect(screen.queryByTestId("external-policy-drives")).toBeNull();
  });
  it("attached dataflow without a spec heartbeat: amber chip + the 'start the policy node' detail, no drives", () => {
    render(
      <ExternalPolicyStatus
        external={makeExternal({ policy_attached: false, policy_arms: ["grip"] })}
      />,
    );
    expect(screen.getByTestId("external-policy-chip").textContent).toBe(EXTERNAL_POLICY_STALE);
    expect(screen.getByTestId("external-policy-detail").textContent).toContain(
      "no policy spec heartbeat yet — start the policy node",
    );
    expect(screen.queryByTestId("external-policy-drives")).toBeNull(); // not fresh: not claimed
  });
  it("fallbacks: no block / bridge disabled / dataflow detached → the grey none chip + the honest detail", () => {
    const { rerender } = render(<ExternalPolicyStatus external={null} />);
    expect(screen.getByTestId("external-policy-chip-none").textContent).toBe(EXTERNAL_POLICY_NONE);
    expect(EXTERNAL_POLICY_NONE).toBe("EXTERNAL POLICY none");
    expect(screen.getByTestId("external-policy-detail").textContent).toBe(
      "The runtime reports no Dora bridge (telemetry.external absent).",
    );
    rerender(<ExternalPolicyStatus external={makeExternal({ enabled: false })} />);
    expect(screen.getByTestId("external-policy-detail").textContent).toContain(
      "dora.enabled: false",
    );
    rerender(
      <ExternalPolicyStatus
        external={makeExternal({ state: "detached", detail: "daemon gone" })}
      />,
    );
    expect(screen.getByTestId("external-policy-detail").textContent).toBe(
      "Dataflow detached — daemon gone.",
    );
    expect(externalPolicyDetail(makeExternal({ state: "unavailable", detail: "" }))).toBe(
      "Dataflow unavailable.",
    );
  });
  it("keeps the caller's testids and renders children in the chip row (the Online DAgger trainer pill)", () => {
    render(
      <ExternalPolicyStatus external={null} testId="od-status" detailTestId="od-external-detail">
        <span data-testid="pill">Trainer · none attached</span>
      </ExternalPolicyStatus>,
    );
    const card = screen.getByTestId("od-status");
    expect(within(card).getByTestId("od-external-detail")).toBeInTheDocument();
    expect(within(card).getByTestId("pill")).toBeInTheDocument();
    expect(screen.queryByTestId("external-policy-status")).toBeNull();
  });
});

describe("<ExternalPolicyChip>", () => {
  it("renders the green chip with the exact label and the policy tooltip", () => {
    render(<ExternalPolicyChip external={makeExternal()} policyStale={false} />);
    const chip = screen.getByTestId("external-policy-chip");
    expect(chip).toHaveTextContent("EXTERNAL POLICY attached");
    expect(chip.textContent).toBe("EXTERNAL POLICY attached");
    expect(chip).toHaveClass("chip", "chip-green");
    expect(chip).toHaveAttribute("title", "act_pick_place v3");
  });

  it("renders the amber chip when stale", () => {
    render(<ExternalPolicyChip external={makeExternal()} policyStale={true} />);
    const chip = screen.getByTestId("external-policy-chip");
    expect(chip.textContent).toBe("EXTERNAL POLICY stale");
    expect(chip).toHaveClass("chip", "chip-amber");
  });

  it("renders nothing when the bridge is off or detached", () => {
    const { rerender } = render(<ExternalPolicyChip external={null} policyStale={false} />);
    expect(screen.queryByTestId("external-policy-chip")).toBeNull();
    rerender(
      <ExternalPolicyChip external={makeExternal({ enabled: false })} policyStale={false} />,
    );
    expect(screen.queryByTestId("external-policy-chip")).toBeNull();
    rerender(
      <ExternalPolicyChip external={makeExternal({ state: "detached" })} policyStale={false} />,
    );
    expect(screen.queryByTestId("external-policy-chip")).toBeNull();
  });
});

describe("panels", () => {
  it("DaggerPanel shows the external chip alongside its mode chip", () => {
    render(<DaggerPanel dagger={dagger()} external={makeExternal()} onAction={vi.fn()} />);
    expect(screen.getByTestId("dagger-mode-chip")).toHaveTextContent("POLICY DRIVING");
    const chip = screen.getByTestId("external-policy-chip");
    expect(chip.textContent).toBe("EXTERNAL POLICY attached");
    expect(chip).toHaveClass("chip-green");
  });

  it("DaggerPanel turns the chip amber from dagger.policy_stale", () => {
    render(
      <DaggerPanel
        dagger={dagger({ policy_stale: true })}
        external={makeExternal()}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByTestId("external-policy-chip")).toHaveClass("chip-amber");
  });

  it("DaggerPanel without external telemetry renders no chip (older runtime)", () => {
    render(<DaggerPanel dagger={dagger()} onAction={vi.fn()} />);
    expect(screen.getByTestId("dagger-mode-chip")).toBeInTheDocument();
    expect(screen.queryByTestId("external-policy-chip")).toBeNull();
  });

  it("InferencePanel shows the external chip alongside its mode chip", () => {
    render(
      <InferencePanel inference={inference()} external={makeExternal()} onTerminate={vi.fn()} />,
    );
    expect(screen.getByTestId("inference-mode-chip")).toHaveTextContent("POLICY DRIVING");
    const chip = screen.getByTestId("external-policy-chip");
    expect(chip.textContent).toBe("EXTERNAL POLICY attached");
    expect(chip).toHaveClass("chip-green");
    expect(screen.getByTestId("terminate-session")).toBeInTheDocument();
  });

  it("InferencePanel names the driven arms beside the chip only when the spec lists them (2026-09-11)", () => {
    const { rerender } = render(
      <InferencePanel
        inference={inference()}
        external={makeExternal({ policy_arms: ["grip"] })}
        onTerminate={vi.fn()}
      />,
    );
    expect(screen.getByTestId("inference-drives").textContent).toBe("drives: Manipulation Arm");
    expect(screen.getByTestId("external-policy-chip")).toHaveAttribute(
      "title",
      "act_pick_place v3 · drives: Manipulation Arm",
    );
    rerender(
      <InferencePanel inference={inference()} external={makeExternal()} onTerminate={vi.fn()} />,
    );
    expect(screen.queryByTestId("inference-drives")).toBeNull();
    rerender(<InferencePanel inference={inference()} onTerminate={vi.fn()} />);
    expect(screen.queryByTestId("inference-drives")).toBeNull();
  });

  it("InferencePanel turns the chip amber from inference.policy_stale", () => {
    render(
      <InferencePanel
        inference={inference({ policy_stale: true })}
        external={makeExternal()}
        onTerminate={vi.fn()}
      />,
    );
    expect(screen.getByTestId("external-policy-chip")).toHaveClass("chip-amber");
  });
});
