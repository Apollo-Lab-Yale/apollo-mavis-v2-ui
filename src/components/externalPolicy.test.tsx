/** External-policy chip (05-ui §12, 14-dora §13; phase-12): the pure classifier
 * shows nothing unless the bridge is enabled AND attached, green while the
 * policy spec is attached and fresh, amber when `policy_stale` is set or the
 * spec heartbeat is gone; DaggerPanel / InferencePanel render it beside their
 * existing mode chip with the policy id in the tooltip. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeExternal } from "../../tests/mocks/fixtures";
import type { DaggerStatus, InferenceStatus } from "../gen";
import { DaggerPanel } from "./DaggerPanel";
import {
  EXTERNAL_POLICY_ATTACHED,
  EXTERNAL_POLICY_STALE,
  ExternalPolicyChip,
  externalPolicyChip,
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

  it("title: policy id plus version when known, none without an id", () => {
    expect(externalPolicyTitle(makeExternal())).toBe("act_pick_place v3");
    expect(externalPolicyTitle(makeExternal({ policy_version: null }))).toBe("act_pick_place");
    expect(externalPolicyTitle(makeExternal({ policy_id: null }))).toBeUndefined();
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
