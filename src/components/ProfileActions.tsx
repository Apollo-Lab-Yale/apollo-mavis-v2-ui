/** Teleop side-panel profile ops — ride the control WS as ActionMsg (05-ui §8.3).
 *
 * ONE save button since 2026-09-07 (operator's request): "Save current state as
 * profile" opens a Sheet that asks for the name. There used to be a second
 * button, "Set current state as initial condition", and the difference between
 * the two was invisible from the panel — both snapshotted the same joint state,
 * one under a name you chose and one under the fixed name `initial` with the
 * workcell's initial-condition flag. That flag is a real feature (it is what a
 * recorded episode names in `initial_condition_profile_id` and what the Welcome
 * page pre-selects), so it survives as a SWITCH inside the Sheet, carried by
 * `save_profile`'s `set_initial` arg and applied by the runtime in the same op —
 * one snapshot, one name, no way for the two to drift apart.
 *
 * The Sheet is the freeze the operator asked for: `showModal()` blurs the
 * capture surface (which disarms keyboard capture and releases every held key)
 * and makes the rest of the page inert, `useGamepad` refuses to arm while a
 * modal host is registered, and the backdrop is frosted (`::backdrop` blur).
 * What it CANNOT freeze is the Vive controller: its clutch is physical and lives
 * in the runtime, so a squeezed trigger still drives the arm. Hence the
 * subtitle — the snapshot is taken when Save is pressed, not when the Sheet
 * opened.
 *
 * **Go to profile** (2026-09-08): a select of THIS workcell kind's profiles
 * (`profilesForKind`, the designated initial condition first) and a button that
 * sends `goto_profile {profile_id}` — the retry for a profile start the loop
 * refused (the Cockpit's fault banner shows the runtime's `start_from refused: …`
 * verbatim). No confirm dialog: the runtime plans the motion on the twin and
 * runs it through the same gated, cancellable path as the return-to-initial
 * key (any input cancels it), so it is the same class of motion as `R`. The
 * button is disabled WITH the reason shown (an episode is open, the control
 * link is down, observer role, a return in flight — `gotoReason` from the
 * Cockpit — or no profile of this kind exists). The ack is toasted either way:
 * `ok` → the runtime's detail (what it is doing), a nack → the reason it
 * refused; the generic nack toast is suppressed in favour of that one. */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { onAck } from "../api/clients";
import type { ProfileInfo } from "../gen";
import { initialConditionFirst, profilesForKind } from "../lib/profiles";
import { TAB_LABELS } from "../lib/streams";
import type { ActionName, Kind } from "../lib/types";
import { useDelayedUnmount } from "../lib/useDelayedUnmount";
import { useStore } from "../store";
import { Sheet, SHEET_EXIT_MS } from "./Sheet";

export interface ProfileActionsProps {
  /** Every saved profile: names the profile the initial-condition switch would
   * replace, and (filtered to `kind`) fills the Go-to select. */
  profiles: ProfileInfo[];
  /** The session's workcell kind — the Go-to select lists its profiles only (plus
   * rows without `workcell_kind`, an older runtime); null = unknown, every row. */
  kind: Kind | null;
  onAction(n: ActionName, args?: Record<string, unknown>): void;
  /** Why `goto_profile` cannot be sent right now (episode open, control link
   * down, observer, a return in flight); non-null disables Go and shows the text. */
  gotoReason?: string | null;
}

/** Text of the Go-to option for one profile. */
export const gotoOptionLabel = (p: ProfileInfo): string =>
  p.is_initial_condition ? `${p.name} · initial condition` : p.name;

/** Disabled reason when no profile of this kind exists. */
export const noProfilesReason = (kind: Kind | null): string =>
  `No saved ${kind ? `${TAB_LABELS[kind]} ` : ""}profiles — save one first`;

export const GOTO_HINT = "Twin-planned and gated — any input cancels the motion";

export function ProfileActions({
  profiles,
  kind,
  onAction,
  gotoReason = null,
}: ProfileActionsProps) {
  const addToast = useStore((s) => s.addToast);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [setInitial, setSetInitial] = useState(false);
  // The Sheet stays mounted for its 160 ms exit after closing.
  const savingMounted = useDelayedUnmount(saving, SHEET_EXIT_MS);
  const formId = useId();
  const gotoReasonId = useId();
  const canSave = name.trim() !== "";
  // This kind's profiles, the designated initial condition first — the one the
  // save sheet's switch would replace (each kind has its own; the other kind's
  // designation is not this session's business).
  const rows = useMemo(
    () => initialConditionFirst(profilesForKind(profiles, kind)),
    [profiles, kind],
  );
  const initial = rows.find((p) => p.is_initial_condition) ?? null;

  // -- Go to profile ----------------------------------------------------------------
  const [gotoId, setGotoId] = useState<string | null>(null);
  // A stale choice (the profile was deleted, the kind changed) falls back to the
  // first row — the initial condition when there is one.
  const target = rows.find((p) => p.profile_id === gotoId) ?? rows[0] ?? null;
  const gotoBlocked = gotoReason ?? (target === null ? noProfilesReason(kind) : null);
  // The ack does not echo the profile, so remember what was asked for.
  const pendingGoto = useRef<string | null>(null);
  useEffect(
    () =>
      onAck((a) => {
        if (a.name !== "goto_profile") return;
        const asked = pendingGoto.current;
        pendingGoto.current = null;
        addToast(
          a.ok
            ? a.detail || (asked ? `Going to '${asked}'` : "Going to the profile")
            : `Go to profile refused: ${a.detail || "no detail"}`,
          a.ok ? "info" : "warning",
        );
        return true;
      }),
    [addToast],
  );
  const go = () => {
    if (target === null || gotoBlocked !== null) return;
    pendingGoto.current = target.name;
    onAction("goto_profile", { profile_id: target.profile_id });
  };

  const close = () => {
    setSaving(false);
    setName("");
    setNotes("");
    setSetInitial(false);
  };

  const save = () => {
    if (!canSave) return;
    onAction("save_profile", { name: name.trim(), notes, set_initial: setInitial });
    close();
  };

  return (
    <div className="panel" data-testid="profile-actions">
      <div className="dim">Profiles</div>
      <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
        <button onClick={() => setSaving(true)} data-testid="save-profile-open">
          Save current state as profile…
        </button>
      </div>

      <div className="goto-profile" data-testid="goto-profile-row">
        <label className="field goto-profile-field">
          <span className="field-label">Go to profile</span>
          <select
            value={target?.profile_id ?? ""}
            onChange={(e) => setGotoId(e.target.value)}
            disabled={target === null}
            aria-label="Profile to go to"
            data-testid="goto-profile-select"
          >
            {rows.map((p) => (
              <option key={p.profile_id} value={p.profile_id}>
                {gotoOptionLabel(p)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={gotoBlocked !== null}
          aria-describedby={gotoBlocked !== null ? gotoReasonId : undefined}
          onClick={go}
          data-testid="goto-profile"
        >
          Go to profile
        </button>
      </div>
      {gotoBlocked !== null ? (
        <div className="btn-reason" id={gotoReasonId} data-testid="goto-profile-reason">
          {gotoBlocked}
        </div>
      ) : (
        <div className="btn-reason" data-testid="goto-profile-hint">
          {GOTO_HINT}
        </div>
      )}

      {savingMounted && (
        <Sheet
          title="Save current state as profile"
          open={saving}
          subtitle="Snapshots every arm's joint state when you press Save"
          width={440}
          hostTestId="save-profile-dialog"
          onRequestClose={close}
          footerStart={
            <button
              type="button"
              className="btn-secondary"
              onClick={close}
              data-testid="save-profile-cancel"
            >
              Cancel
            </button>
          }
          footer={
            <button
              type="submit"
              form={formId}
              className="btn-primary"
              disabled={!canSave}
              data-testid="save-profile-confirm"
            >
              Save
            </button>
          }
        >
          <form
            id={formId}
            className="field"
            style={{ gap: 12 }}
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <label className="field">
              <span className="field-label">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. grasp-ready"
                data-testid="profile-name"
                data-autofocus
              />
            </label>
            <label className="field">
              <span className="field-label">Notes</span>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="optional"
                data-testid="profile-notes"
              />
            </label>
            <label className="kv">
              <span>Use as the workcell initial condition</span>
              <input
                type="checkbox"
                checked={setInitial}
                onChange={(e) => setSetInitial(e.target.checked)}
                data-testid="profile-set-initial"
              />
            </label>
            <div className="dim" style={{ fontSize: 11 }}>
              {setInitial
                ? initial
                  ? `Takes the designation away from '${initial.name}'. Recorded episodes name the designated profile, and it is pre-selected on the Welcome page.`
                  : "Recorded episodes name the designated profile, and it is pre-selected on the Welcome page."
                : initial
                  ? `'${initial.name}' stays the initial condition.`
                  : "No profile is designated as the initial condition yet."}
            </div>
          </form>
        </Sheet>
      )}
    </div>
  );
}
