/** Teleop side-panel profile ops — ride the control WS as ActionMsg (05-ui §8.3). */
import { useState } from "react";
import type { ProfileInfo } from "../gen";
import type { ActionName } from "../lib/types";
import { ConfirmDialog } from "./ConfirmDialog";

export interface ProfileActionsProps {
  profiles: ProfileInfo[]; // for the overwrite-confirm dialog text
  onAction(n: ActionName, args?: Record<string, unknown>): void;
}

export function ProfileActions({ profiles, onAction }: ProfileActionsProps) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmingInitial, setConfirmingInitial] = useState(false);
  const initial = profiles.find((p) => p.is_initial_condition) ?? null;

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

      {saving && (
        <div className="modal-backdrop" data-testid="save-profile-dialog">
          <div className="modal" role="dialog" aria-modal="true">
            <label>
              Name{" "}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="profile-name"
              />
            </label>
            <label>
              Notes{" "}
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                data-testid="profile-notes"
              />
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setSaving(false)}>Cancel</button>
              <button
                className="btn-primary"
                disabled={name.trim() === ""}
                data-testid="save-profile-confirm"
                onClick={() => {
                  onAction("save_profile", { name: name.trim(), notes });
                  setSaving(false);
                  setName("");
                  setNotes("");
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmingInitial && (
        <ConfirmDialog
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
