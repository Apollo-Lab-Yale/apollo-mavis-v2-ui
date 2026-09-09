/** ModeLauncher (phase-11 §4): five whole-card buttons — Teleop, Data
 * Collection, Online DAgger, Inference and (phase-15, 16-gello §11) GELLO
 * Manipulation. A disabled card stays in the tab order
 * (`aria-disabled`, never `disabled`) and shows its reason as visible text;
 * the keymap reason carries an inline Retry. Launching → 12 px spinner +
 * "Starting…" / "Planning safe path…". Cards stagger in on first mount only
 * (`reveal`), never on tab switches. */
import { useId, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import { REASON } from "../lib/launch";
import { MODE_DESCRIPTIONS, MODE_LABELS } from "../lib/streams";
import type { Mode } from "../lib/types";
import { MODES } from "../lib/types";
import { Icon, type IconName } from "./icons";

export const MODE_ICONS: Readonly<Record<Mode, IconName>> = {
  teleop: "joystick",
  collect: "record",
  dagger: "project", // a vector and its projection onto a reference line (15-online-dagger §8)
  inference: "play",
  gello: "leader-arm", // the passive leader arm in outline (16-gello §11)
};

export interface ModeLauncherProps {
  /** Blocking reason per mode (null = enabled). */
  reasons: Readonly<Record<Mode, string | null>>;
  /** Mode whose POST /api/session is in flight; every card goes busy. */
  launching: Mode | null;
  launchingLabel?: string;
  onLaunch(mode: Mode): void;
  onRetryKeymap?(): void;
  /** First-mount stagger (`--i` 2..6 after the hero and its actions). */
  reveal?: boolean;
}

export function ModeLauncher({
  reasons,
  launching,
  launchingLabel = "Starting…",
  onLaunch,
  onRetryKeymap,
  reveal = false,
}: ModeLauncherProps) {
  const idBase = useId();
  const busy = launching !== null;
  // The keymap reason hits every card; the inline Retry appears once (first card).
  let retryShown = false;
  return (
    <div className="launcher-grid" role="group" aria-label="Modes" data-testid="mode-launcher">
      {MODES.map((mode, i) => {
        const reason = reasons[mode];
        const disabled = reason !== null || busy;
        const isLaunching = launching === mode;
        const reasonId = `${idBase}-${mode}-reason`;
        const showRetry = reason === REASON.keymap && !!onRetryKeymap && !retryShown;
        if (showRetry) retryShown = true;
        const activate = () => {
          if (disabled) return;
          onLaunch(mode);
        };
        const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
          if (e.target !== e.currentTarget) return; // inline Retry handles its own keys
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            activate();
          }
        };
        const onRetry = (e: MouseEvent<HTMLButtonElement>) => {
          e.stopPropagation();
          onRetryKeymap?.();
        };
        return (
          <div
            key={mode}
            role="button"
            tabIndex={0}
            aria-disabled={disabled ? "true" : undefined}
            aria-busy={isLaunching ? "true" : undefined}
            aria-describedby={reason !== null ? reasonId : undefined}
            className={`card card-interactive launcher-card${reveal ? " enter-fade" : ""}`}
            style={reveal ? ({ "--i": i + 2 } as CSSProperties) : undefined}
            data-testid={`launch-${mode}`}
            data-mode={mode}
            onClick={activate}
            onKeyDown={onKeyDown}
          >
            <Icon name={MODE_ICONS[mode]} size={28} className="launcher-icon" />
            <span className="launcher-title text-title-3">{MODE_LABELS[mode]}</span>
            <span className="launcher-desc text-callout">{MODE_DESCRIPTIONS[mode]}</span>
            <span className="launcher-foot">
              {isLaunching ? (
                <span className="launcher-busy" data-testid={`launching-${mode}`}>
                  <span className="spinner" aria-hidden="true" />
                  {launchingLabel}
                </span>
              ) : reason !== null ? (
                <span className="reason-line" id={reasonId} data-testid={`launch-reason-${mode}`}>
                  <Icon name="info" size={14} />
                  <span>{reason}</span>
                  {showRetry && (
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={onRetry}
                      data-testid="keymap-retry"
                    >
                      Retry
                    </button>
                  )}
                </span>
              ) : (
                <span className="launcher-go">
                  {mode === "teleop" ? "Start now" : "Set up and start"}
                  <Icon name="chevron" size={16} />
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
