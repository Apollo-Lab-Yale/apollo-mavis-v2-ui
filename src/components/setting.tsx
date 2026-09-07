/** Welcome page **Setting** tab (2026-09-07): everything about the Vive
 * controller that is not a session — the link and pairing chain, the two
 * calibrations (base-station localisation and the angle/yaw alignment) and the
 * live tuning fields.
 *
 * Nothing here is new machinery: the wizard entry points (`CalibrationPanel`)
 * and the live fields (`TrackerSettingsForm`) are the Debug page's own
 * components, so both pages drive the same REST flows and the same
 * `tracker_settings` action. The Debug page keeps working unchanged; this tab
 * is the operator-facing front door to the same functions.
 *
 * Pairing is deliberately status-only: pairing a controller needs exclusive USB
 * access to the receiver, which the runtime's libsurvive context holds while it
 * is reading poses, and libsurvive's simple API exposes no pairing call. The
 * panel therefore shows the evidence and the exact operator command.
 */
import type { SessionInfo, TrackerSettingsArgs, TrackerTelemetry } from "../gen";
import type { Bindings } from "../input/bindings";
import { ControllerLinkPanel } from "./controller";
import { CalibrationPanel, TrackerSettingsForm } from "./devices";
import type { WizardKind } from "./TrackerCalibrationWizard";

/** The one-off pairing command (13-tracker §6, scripts/tracker/02 prints it). */
export const PAIRING_COMMAND =
  "LD_LIBRARY_PATH=~/opt/libsurvive/lib ~/opt/libsurvive/bin/survive-cli --pair-device --v 100";

export interface PairingPanelProps {
  tracker: TrackerTelemetry | null;
}

/** Pairing: what the runtime can see, and how the operator pairs a controller. */
export function PairingPanel({ tracker }: PairingPanelProps) {
  const objects = tracker?.objects;
  const paired = objects !== undefined && objects.length > 0;
  return (
    <div className="panel" data-testid="pairing-panel">
      <div className="kv">
        <strong>Pairing</strong>
        <span
          className={`pill ${paired ? "pill-ok" : objects === undefined ? "" : "pill-warn"}`}
          data-testid="pairing-state"
        >
          {objects === undefined
            ? "not reported"
            : paired
              ? `paired · ${objects.join(", ")}`
              : "no device paired"}
        </span>
      </div>
      <div className="text-caption fg-3">
        A controller is paired to the receiver once, and the pairing lives in the receiver — it
        survives restarts. Pairing needs exclusive USB access to the receiver, so the runtime cannot
        do it while it is reading poses: stop the runtime, run the command below, hold the
        controller&apos;s <strong>Menu + System</strong> buttons until its LED blinks blue (about 50
        s), then start the runtime again.{" "}
        <strong>Stopping the runtime takes this page offline</strong> — read the steps first, or run
        them from a terminal on the lab machine.
      </div>
      <pre className="mono code-block" data-testid="pairing-command">
        {PAIRING_COMMAND}
      </pre>
    </div>
  );
}

export interface SettingPaneProps {
  tracker: TrackerTelemetry | null;
  session: SessionInfo | null;
  bindings: Bindings | null;
  /** Opens the calibration wizard of that kind (hosted by the page). */
  onOpenWizard(kind: WizardKind): void;
  /** True when `tracker_settings` cannot be sent (no session / link / role). */
  settingsDisabled: boolean;
  settingsReason?: string;
  onSettings(args: TrackerSettingsArgs): void;
}

export function SettingPane({
  tracker,
  session,
  bindings,
  onOpenWizard,
  settingsDisabled,
  settingsReason,
  onSettings,
}: SettingPaneProps) {
  return (
    <div className="setting-grid" data-testid="setting-grid">
      <ControllerLinkPanel bindings={bindings} />
      <PairingPanel tracker={tracker} />
      <CalibrationPanel tracker={tracker} session={session} onOpen={onOpenWizard} />
      <div className="panel" data-testid="angle-panel">
        <div className="kv">
          <strong>Controller angle</strong>
          <span className="pill" data-testid="angle-live">
            yaw {tracker?.settings ? `${tracker.settings.yaw_deg}°` : "—"}
          </span>
        </div>
        <div className="text-caption fg-3">
          The angle maps the lighthouse world onto the cell: with it right, pushing the controller
          toward the arm bases moves the tool the same way. Set it with{" "}
          <strong>Yaw alignment</strong> above — the seven-click gesture fits it and persists it,
          and it must be redone after every base-station calibration. The field below nudges the
          live value during a session without persisting it.
        </div>
        <TrackerSettingsForm
          settings={tracker?.settings ?? null}
          disabled={settingsDisabled}
          disabledReason={settingsReason}
          onChange={onSettings}
        />
      </div>
    </div>
  );
}
