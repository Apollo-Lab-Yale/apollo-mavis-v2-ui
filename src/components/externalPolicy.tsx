/** External-policy chip (05-ui §12, 14-dora §13 "ui"; phase-12).
 *
 * The Dora bridge publishes its state as `telemetry.external` (`ExternalStatus`)
 * and the DAgger / inference blocks carry `policy_stale`. This module reduces
 * those into ONE additive chip for the Cockpit side panels, rendered below the
 * existing mode chip:
 *
 *  - no chip unless the bridge is enabled AND a dataflow is attached
 *    (`external.enabled && external.state === "attached"`) — a disabled,
 *    unavailable, detached or closed bridge, or a runtime that does not emit the
 *    block at all (`external` null/undefined), adds nothing to the panel;
 *  - green "EXTERNAL POLICY attached" while a policy spec is attached
 *    (`policy_attached`) and the block is not flagged stale;
 *  - amber "EXTERNAL POLICY stale" otherwise — either `policy_stale` is set or
 *    `policy_attached` is false (the policy's spec heartbeat has stopped while
 *    the dataflow itself is still attached).
 *
 * The label is deliberately fixed to those two strings; the policy id and
 * version (when known) ride the `title` tooltip so the chip stays scannable.
 */
import type { ExternalStatus } from "../gen";

export type ExternalPolicyTone = "green" | "amber";

export interface ExternalPolicyChipModel {
  label: string;
  tone: ExternalPolicyTone;
}

export const EXTERNAL_POLICY_ATTACHED = "EXTERNAL POLICY attached";
export const EXTERNAL_POLICY_STALE = "EXTERNAL POLICY stale";

/** Pure classifier: `null` = render nothing. */
export function externalPolicyChip(
  external: ExternalStatus | null | undefined,
  policyStale: boolean | undefined,
): ExternalPolicyChipModel | null {
  if (!external || !external.enabled || external.state !== "attached") return null;
  if (external.policy_attached && !policyStale) {
    return { label: EXTERNAL_POLICY_ATTACHED, tone: "green" };
  }
  return { label: EXTERNAL_POLICY_STALE, tone: "amber" };
}

/** Tooltip text: `<policy_id>` plus ` v<version>` when the version is known. */
export function externalPolicyTitle(external: ExternalStatus): string | undefined {
  const id = external.policy_id;
  if (!id) return undefined;
  const version = external.policy_version;
  return typeof version === "number" ? `${id} v${version}` : id;
}

export interface ExternalPolicyChipProps {
  external: ExternalStatus | null | undefined;
  policyStale: boolean | undefined;
}

export function ExternalPolicyChip({ external, policyStale }: ExternalPolicyChipProps) {
  const chip = externalPolicyChip(external, policyStale);
  if (!chip || !external) return null;
  return (
    <span
      className={`chip chip-${chip.tone}`}
      data-testid="external-policy-chip"
      title={externalPolicyTitle(external)}
    >
      {chip.label}
    </span>
  );
}
