/** Pure helpers over `ProfileInfo` rows, shared by the Welcome Start-from list and
 * the Cockpit's Profiles panel (2026-09-08).
 *
 * `seed_initial` creates ONE initial-condition profile PER workcell kind, so the
 * store legitimately holds two rows named alike ("default posture (2026-09-08)"
 * for the real cell and for the twin), and the store refuses to delete either
 * while it is designated. A list that ignores `workcell_kind` shows both and the
 * operator cannot tell which is which — every profile list is therefore filtered
 * to the workcell kind it is shown for. A row WITHOUT the field comes from an
 * older runtime, cannot be placed, and is shown for both kinds. */
import { ApiError } from "../api/rest";
import type { ProfileInfo } from "../gen";
import { TAB_LABELS } from "./streams";
import type { Kind } from "./types";

/** The profiles of one workcell kind, plus the rows without `workcell_kind`
 * (older runtime). `kind: null` (unknown) keeps every row. Order preserved. */
export function profilesForKind(
  profiles: readonly ProfileInfo[],
  kind: Kind | null,
): ProfileInfo[] {
  if (kind === null) return [...profiles];
  return profiles.filter((p) => p.workcell_kind == null || p.workcell_kind === kind);
}

/** Whether the launch sheets may rely on an initial condition for `kind`: a row
 * designated for that kind, or a kind-less designated row (older runtime) — the
 * same rows `profilesForKind` lists with their badge, so the list and the
 * "return to start needs an initial condition" gate never disagree. */
export function hasInitialCondition(profiles: readonly ProfileInfo[], kind: Kind | null): boolean {
  return profilesForKind(profiles, kind).some((p) => p.is_initial_condition);
}

/** The designated initial condition first, everything else in the given order. */
export function initialConditionFirst(profiles: readonly ProfileInfo[]): ProfileInfo[] {
  return [
    ...profiles.filter((p) => p.is_initial_condition),
    ...profiles.filter((p) => !p.is_initial_condition),
  ];
}

/** "the Sim workcell" / "the Hardware workcell"; "the workcell" when the row
 * has no `workcell_kind` (older runtime). */
export const workcellPhrase = (kind: Kind | null | undefined): string =>
  kind ? `the ${TAB_LABELS[kind]} workcell` : "the workcell";

/** Why the runtime refused to delete `p` (409 on a designated initial
 * condition), in the operator's words — the store's own text ("refusing to
 * delete initial-condition profile '<uuid>'; designate another profile first")
 * names an id the operator never sees. */
export const initialConditionDeleteText = (p: ProfileInfo): string =>
  `'${p.name}' is the initial condition of ${workcellPhrase(p.workcell_kind)} — ` +
  "designate another profile as the initial condition first";

/** Toast text for a failed `DELETE /api/profiles/{id}`: a 409 on the initial
 * condition (the row says so, or the runtime's `detail` does) gets the operator
 * wording above; anything else keeps the runtime's text as the fallback. */
export function profileDeleteErrorText(p: ProfileInfo, e: unknown): string {
  if (
    e instanceof ApiError &&
    e.status === 409 &&
    (p.is_initial_condition || /initial[- ]condition/i.test(e.detail))
  ) {
    return initialConditionDeleteText(p);
  }
  return `delete '${p.name}': ${e instanceof Error ? e.message : String(e)}`;
}
