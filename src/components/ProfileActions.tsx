/** Teleop side-panel profile ops — ride the control WS as ActionMsg (05-ui §8.3). */
import { useId, useState } from "react";
import type { ProfileInfo } from "../gen";
import type { ActionName } from "../lib/types";
import { useDelayedUnmount } from "../lib/useDelayedUnmount";
import { ConfirmDialog } from "./ConfirmDialog";
import { Sheet, SHEET_EXIT_MS } from "./Sheet";

export interface ProfileActionsProps {
  profiles: ProfileInfo[]; // for the overwrite-confirm dialog text
  onAction(n: ActionName, args?: Record<string, unknown>): void;
}

export function ProfileActions({ profiles, onAction }: ProfileActionsProps) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmingInitial, setConfirmingInitial] = useState(false);
  // Both dialogs stay mounted for the 160 ms Sheet exit after closing.
  const savingMounted = useDelayedUnmount(saving, SHEET_EXIT_MS);
  const confirmMounted = useDelayedUnmount(confirmingInitial, SHEET_EXIT_MS);
  const formId = useId();
  const initial = profiles.find((p) => p.is_initial_condition) ?? null;
  const canSave = name.trim() !== "";

  const save = () => {
    if (!canSave) return;
    onAction("save_profile", { name: name.trim(), notes });
    setSaving(false);
    setName("");
    setNotes("");
  };

  return (
    <div className="panel" data-testid="profile-actions">
      <div className="dim">Profiles</div>
      <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
        <button onClick={() => setSaving(true)} data-testid="save-profile-open">
          Save profile…
        </button>
        <button onClick={() => setConfirmingInitial(true)} data-testid="set-initial-open">
          Set current state as initial condition
        </button>
      </div>

      {savingMounted && (
        <Sheet
          title="Save profile"
          open={saving}
          subtitle="Snapshot of every arm's current joint state"
          width={420}
          hostTestId="save-profile-dialog"
          onRequestClose={() => setSaving(false)}
          footerStart={
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setSaving(false)}
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
          </form>
        </Sheet>
      )}

      {confirmMounted && (
        <ConfirmDialog
          open={confirmingInitial}
          title="Overwrite initial condition"
          text={`Overwrite '${initial?.name ?? "initial condition"}' as the workcell initial condition?`}
          confirmLabel="Overwrite"
          onConfirm={() => {
            setConfirmingInitial(false);
            onAction("set_initial_condition"); // destructive — confirmed above
          }}
          onCancel={() => setConfirmingInitial(false)}
        />
      )}
    </div>
  );
}
