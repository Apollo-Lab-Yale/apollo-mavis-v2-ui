/** External-policy chip + status card (05-ui §8.1 item 6 / §8.2 / §12, 14-dora §13
 * "ui"; phase-12, extended 2026-09-11).
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
 * version (when known) and the arms the policy drives (`policy_arms`, 2026-09-11:
 * "drives: Manipulation Arm") ride the `title` tooltip so the chip stays scannable.
 *
 * `externalPolicyAttached` is the launch-time predicate both launcher sheets share
 * (Online DAgger's trainer, Inference's "External policy (dora)" row), and
 * `ExternalPolicyStatus` the status card they both render: the chip or the grey
 * "EXTERNAL POLICY none", the honest detail caption when nothing is attached, and
 * the driven arms when something is.
 */
import type { ReactNode } from "react";
import type { ExternalStatus } from "../gen";
import { armLabel, orderArms } from "../lib/streams";

export type ExternalPolicyTone = "green" | "amber";

export interface ExternalPolicyChipModel {
  label: string;
  tone: ExternalPolicyTone;
}

export const EXTERNAL_POLICY_ATTACHED = "EXTERNAL POLICY attached";
export const EXTERNAL_POLICY_STALE = "EXTERNAL POLICY stale";
export const EXTERNAL_POLICY_NONE = "EXTERNAL POLICY none";

/** An external policy node is attached and its spec heartbeat is fresh
 * (`enabled && state === "attached" && policy_attached`) — the launch-time
 * predicate behind `LandingSelection.externalAttached` / `trainerAttached`. */
export const externalPolicyAttached = (external: ExternalStatus | null | undefined): boolean =>
  !!external &&
  external.enabled === true &&
  external.state === "attached" &&
  external.policy_attached === true;

/** The arms the attached policy drives (`ExternalStatus.policy_arms`, the fresh
 * spec's `PolicySpecAnnounce.arms`), Manipulation Arm first, user-facing names,
 * comma-separated: `"Manipulation Arm"` / `"Manipulation Arm, Perception Arm"`; `""`
 * when the list is empty or absent (no fresh spec, or a runtime predating the field). */
export function drivenArmsLabel(external: ExternalStatus | null | undefined): string {
  const arms = external?.policy_arms ?? [];
  return orderArms(arms, (a) => a)
    .map(armLabel)
    .join(", ");
}

/** One-line summary of the attached spec for a launcher row: `act_pick_place v3 ·
 * 10 Hz · drives: Manipulation Arm` (each part only when known); `""` while no policy
 * is attached (`externalPolicyAttached` false). */
export function externalPolicySummary(external: ExternalStatus | null | undefined): string {
  if (!external || !externalPolicyAttached(external)) return "";
  const version = external.policy_version;
  const parts = [
    typeof version === "number"
      ? `${external.policy_id ?? "policy"} v${version}`
      : (external.policy_id ?? "policy"),
  ];
  const rate = external.policy_rate_hz;
  if (typeof rate === "number" && rate > 0) parts.push(`${rate} Hz`);
  const driven = drivenArmsLabel(external);
  if (driven) parts.push(`drives: ${driven}`);
  return parts.join(" · ");
}

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

/** Tooltip text: `<policy_id>` plus ` v<version>` when the version is known, plus
 * ` · drives: <arms>` when the spec names the arms it drives. */
export function externalPolicyTitle(external: ExternalStatus): string | undefined {
  const id = external.policy_id;
  if (!id) return undefined;
  const version = external.policy_version;
  const head = typeof version === "number" ? `${id} v${version}` : id;
  const driven = drivenArmsLabel(external);
  return driven ? `${head} · drives: ${driven}` : head;
}

/** The status card's caption while no policy is attached: says which link is missing
 * (no bridge block / bridge disabled / dataflow not attached / no spec heartbeat). */
export function externalPolicyDetail(external: ExternalStatus | null | undefined): string {
  if (!external) return "The runtime reports no Dora bridge (telemetry.external absent).";
  if (external.enabled !== true)
    return "Dora bridge disabled in this runtime config (dora.enabled: false) — the lab render turns it on.";
  if (external.state !== "attached")
    return `Dataflow ${external.state ?? "unknown"}${external.detail ? ` — ${external.detail}` : ""}.`;
  return "Dataflow attached, but no policy spec heartbeat yet — start the policy node.";
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

export interface ExternalPolicyStatusProps {
  external: ExternalStatus | null | undefined;
  /** Rendered in the chip row after the chip (the Online DAgger sheet's trainer pill). */
  children?: ReactNode;
  /** Card testid (the Online DAgger sheet keeps its `od-status`). */
  testId?: string;
  /** Detail-caption testid (the Online DAgger sheet keeps its `od-external-detail`). */
  detailTestId?: string;
}

/** The launcher sheets' status card (Online DAgger "Connect a trainer", Inference
 * "External policy (dora)"): the external-policy chip while the dataflow is attached
 * (green with a fresh spec, amber without one), else the grey `EXTERNAL POLICY none`;
 * `externalPolicyDetail` underneath whenever no policy is attached (the amber case
 * included — "start the policy node" is the hint that matters there); with a fresh
 * spec that names its arms, a `drives: …` caption (testid `external-policy-drives`). */
export function ExternalPolicyStatus({
  external,
  children,
  testId = "external-policy-status",
  detailTestId = "external-policy-detail",
}: ExternalPolicyStatusProps) {
  const chip = externalPolicyChip(external, false);
  const attached = externalPolicyAttached(external);
  const driven = attached ? drivenArmsLabel(external) : "";
  return (
    <div className="card od-status" data-testid={testId}>
      <div className="od-status-row">
        {chip ? (
          <ExternalPolicyChip external={external} policyStale={false} />
        ) : (
          <span className="chip chip-grey" data-testid="external-policy-chip-none">
            {EXTERNAL_POLICY_NONE}
          </span>
        )}
        {children}
      </div>
      {!attached && (
        <span className="text-caption fg-3" data-testid={detailTestId}>
          {externalPolicyDetail(external)}
        </span>
      )}
      {driven !== "" && (
        <span className="text-caption fg-3" data-testid="external-policy-drives">
          drives: {driven}
        </span>
      )}
    </div>
  );
}
