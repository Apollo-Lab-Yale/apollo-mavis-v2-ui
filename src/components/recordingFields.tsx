/** Recording fields shared by the Data Collection LaunchSheet and the Online DAgger
 * sheet (15-online-dagger §8 "Recording"): the idle-frame filter fieldset
 * (2026-09-07 addendum; 04-runtime §10.5, 10-frames §11.4 — checked by default,
 * operator units, converted to SI by `actionFilterToSpec`) and the **Return to
 * start after save / discard** check row (default ON — operator decision
 * 2026-09-07; a dagger field too since 15-online-dagger D6). Test ids are the
 * LaunchSheet's original ones (`action-filter*`, `return-to-start*`) so both
 * sheets share one set of assertions. */
import { REASON, type ActionFilterInputs } from "../lib/launch";

export interface ActionFilterFieldsetProps {
  filter: ActionFilterInputs;
  onChange(next: ActionFilterInputs): void;
}

const FILTER_FIELDS = [
  ["posMm", "pos (mm)", 0.1],
  ["rotMrad", "rot (mrad)", 0.1],
  ["gripperPct", "gripper (%)", 0.1],
  ["railMm", "rail (mm)", 0.1],
  ["gripperContextS", "gripper context (s)", 0.1],
] as const;

export function ActionFilterFieldset({ filter, onChange }: ActionFilterFieldsetProps) {
  const set = (key: keyof ActionFilterInputs, value: number | boolean) =>
    onChange({ ...filter, [key]: value });
  return (
    <fieldset
      className="field radio-rows"
      aria-label="Idle-frame filter"
      data-testid="action-filter-group"
    >
      <label className="check-row" data-testid="action-filter-row">
        <input
          type="checkbox"
          checked={filter.enabled}
          onChange={(e) => set("enabled", e.target.checked)}
          data-testid="action-filter"
        />
        <span className="radio-row-text">
          <span className="text-body-strong">Filter idle / small-motion frames</span>
          <span className="text-caption fg-3">
            A frame that moved less than these thresholds since the last kept frame is not recorded,
            unless the gripper changes within the context window
          </span>
        </span>
      </label>
      <div className="filter-grid" data-testid="action-filter-inputs">
        {FILTER_FIELDS.map(([key, label, step]) => (
          <label key={key} className="field filter-field">
            <span className="field-label">{label}</span>
            <input
              type="number"
              min={0}
              step={step}
              value={filter[key]}
              disabled={!filter.enabled}
              onChange={(e) => set(key, Number(e.target.value))}
              data-testid={`action-filter-${key}`}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export interface ReturnToStartRowProps {
  checked: boolean;
  onChange(checked: boolean): void;
  /** The current blocking reason; the row repeats it when it is its own. */
  reason: string | null;
  /** Extra help after the fixed sentence (Online DAgger: "between rollouts"). */
  help?: string;
}

export function ReturnToStartRow({ checked, onChange, reason, help }: ReturnToStartRowProps) {
  return (
    <>
      <label className="check-row" data-testid="return-to-start-row">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          data-testid="return-to-start"
        />
        <span className="radio-row-text">
          <span className="text-body-strong">Return to start after save / discard</span>
          <span className="text-caption fg-3">
            Twin-planned, gated, cancelled by any input; back to the start profile, else the initial
            condition{help ? ` — ${help}` : ""}
          </span>
        </span>
      </label>
      {reason === REASON.returnNeedsProfile && (
        <span className="field-error" data-testid="return-to-start-reason">
          {REASON.returnNeedsProfile}
        </span>
      )}
    </>
  );
}
