/** Vive-controller link status for the Welcome page (13-tracker §3.5).
 *
 * One pure classifier, two views: a compact pill on the Hardware / Sim tabs
 * ("is the controller connected?") and a full panel on the Setting tab (the
 * pairing chain, station fix and a button self-test).
 *
 * Honesty rules, learned from the 2026-09-06 session:
 *  - The POSE path and the BUTTON path are independent. Poses ran at 135 Hz
 *    while libsurvive delivered no button event at all, so the clutch could
 *    never engage. `status: "tracking"` alone must therefore never be shown as
 *    "everything works" — the button path gets its own row.
 *  - An idle controller legitimately sends no button/axis events, so a large
 *    `controller_age_s` is NOT proof of a fault. The panel reports the age and
 *    asks the operator to squeeze the trigger; it never claims "buttons dead".
 *  - The three link fields are additive (a runtime that has not been restarted
 *    yet omits them). `undefined` means UNKNOWN and must not be read as "no
 *    receiver" / "not paired"; only an explicit `false` is evidence.
 *  - A FRESH POSE STREAM OUTRANKS every other signal: if poses are arriving the
 *    radio path demonstrably works, so a sysfs miss (throttled by
 *    `DONGLE_POLL_S`, up to 5 s stale) must not paint "receiver unplugged" over
 *    a live link.
 *  - An empty `objects` is NOT proof of "not paired": the runtime clears it
 *    whenever the libsurvive loop exits or restarts, so it is also the
 *    transient state of a restarting reader. The label says "not detected" and
 *    hands the runtime's own `detail` over, which enumerates the causes
 *    (unpaired, dongle busy, udev, tracker off).
 *  - `tracker.stale_s` is 0.2 s in the lab config, so `status: "stale"` toggles
 *    on any sub-second occlusion. The pill uses its own, slower threshold
 *    (`POSE_STALE_UI_S`) so it cannot blink several times a second.
 */
import { useShallow } from "zustand/react/shallow";
import type { TrackerTelemetry } from "../gen";
import type { Bindings } from "../input/bindings";
import { selectTracker, useStore, type AppState } from "../store";
import { ControllerView } from "./ControllerView";

export type ControllerLinkState =
  | "no_telemetry" // the page has no telemetry frame yet
  | "off" // tracker.backend: none
  | "fake" // tracker.backend: fake (scripted circle, no real device)
  | "no_backend" // libsurvive/pysurvive not importable in the runtime venv
  | "no_receiver" // Watchman receiver not on USB
  | "unpaired" // receiver there, libsurvive enumerates no device
  | "error" // libsurvive reported an error (detail carries it)
  | "searching" // paired, waiting for a base-station fix
  | "stale" // had poses, none within tracker.stale_s
  | "connected"; // poses arriving now

/** Pill tone → the Welcome page's `pill-*` classes. */
export type LinkTone = "ok" | "warn" | "danger" | "neutral" | "accent";

export interface ControllerLink {
  state: ControllerLinkState;
  /** Pill text. Deliberately number-free so a 25 Hz tick never re-renders it. */
  label: string;
  /** One sentence naming the next action; tooltip + Setting-panel line. */
  detail: string;
  tone: LinkTone;
}

const PILL_CLASS: Record<LinkTone, string> = {
  ok: "pill pill-ok",
  warn: "pill pill-warn",
  danger: "pill pill-danger",
  accent: "pill pill-accent",
  neutral: "pill",
};

/** How long without a controller input event before the Setting panel nudges
 * the operator to squeeze the trigger (an idle controller sends nothing). */
export const BUTTON_IDLE_HINT_S = 10;
/** Pose age at which the pill stops calling the link live. The runtime flips
 * `status` to `stale` after `tracker.stale_s` (0.2 s in the lab config), which
 * is right for the control loop and far too twitchy for a status pill. */
export const POSE_STALE_UI_S = 1.0;

/** Classify the controller link from one telemetry frame (pure). */
export function controllerLink(tracker: TrackerTelemetry | null): ControllerLink {
  const t = tracker;
  if (!t) {
    return {
      state: "no_telemetry",
      label: "Controller —",
      detail: "No telemetry yet — the runtime link is still coming up.",
      tone: "neutral",
    };
  }
  if (t.backend === "none") {
    return {
      state: "off",
      label: "Controller off",
      detail: "tracker.backend is none — controller teleop is disabled in the runtime config.",
      tone: "neutral",
    };
  }
  if (t.backend === "fake") {
    return {
      state: "fake",
      label: "Controller simulated",
      detail:
        "tracker.backend is fake: a scripted circle stands in for the controller. " +
        "Set backend: libsurvive for the real one.",
      tone: "accent",
    };
  }
  if (t.status === "no_backend") {
    return {
      state: "no_backend",
      label: "Controller unavailable",
      detail: t.detail || "libsurvive (pysurvive) is not installed in the runtime venv.",
      tone: "danger",
    };
  }
  // Poses win: a stream this fresh proves the whole radio path, so no slower or
  // coarser signal (a 5 s-throttled sysfs scan, a cleared object list) may
  // contradict it. `stale` counts as live until POSE_STALE_UI_S.
  const poseAge = t.age_s;
  const posesLive =
    t.status === "tracking" ||
    (t.status === "stale" && poseAge != null && poseAge < POSE_STALE_UI_S);
  if (posesLive) {
    return {
      state: "connected",
      label: "Controller connected",
      detail: "Poses are arriving. Squeeze the trigger to confirm the buttons on the Setting tab.",
      tone: "ok",
    };
  }
  // Explicit false only: an older runtime omits the field (undefined = unknown).
  if (t.dongle_present === false) {
    return {
      state: "no_receiver",
      label: "Receiver unplugged",
      detail: "No Valve Watchman receiver on USB — plug the dongle in, then restart the tracker.",
      tone: "danger",
    };
  }
  if (t.status === "error") {
    return {
      state: "error",
      label: "Controller error",
      detail: t.detail || "libsurvive reported an error.",
      tone: "danger",
    };
  }
  const objects = t.objects;
  const noDevice = objects !== undefined && objects.length === 0;
  if (noDevice) {
    return {
      state: "unpaired",
      label: "Controller not detected",
      // The runtime's own detail names the causes (unpaired, dongle busy, udev,
      // tracker off); an empty list is also how a restarting reader reads.
      detail:
        t.detail ||
        "libsurvive enumerates no device: not paired (hold Menu + System), the USB " +
          "interface is claimed, or the controller is off.",
      tone: "warn",
    };
  }
  if (t.status === "stale") {
    return {
      state: "stale",
      label: "Controller signal lost",
      detail: "Poses stopped arriving — the controller may be asleep, out of sight or flat.",
      tone: "warn",
    };
  }
  return {
    state: "searching",
    label: objects && objects.length > 0 ? "Controller searching" : "Controller starting",
    detail:
      t.detail || "Waiting for poses: the controller needs at least two base stations in sight.",
    tone: "warn",
  };
}

/** Store selector — shallow-compared, so the page re-renders only when the
 * classification changes and not on every 25 Hz telemetry frame. */
export const selectControllerLink = (s: AppState): ControllerLink =>
  controllerLink(s.telemetry?.tracker ?? null);

export interface ControllerPillProps {
  link: ControllerLink;
  /** Tab this pill sits on — only used for the testid. */
  tab: string;
  /** Renders a quiet "Set up" affordance that opens the Setting tab. */
  onOpenSetting?: () => void;
}

/** Compact controller line for the Hardware / Sim tabs. Kept OUT of the
 * `status-<tab>` caption so that caption's text stays what the tests read. */
export function ControllerPill({ link, tab, onOpenSetting }: ControllerPillProps) {
  return (
    <div
      className="controller-line"
      data-testid={`controller-line-${tab}`}
      role="status"
      aria-live="polite"
    >
      <span
        className={PILL_CLASS[link.tone]}
        data-testid={`controller-link-${tab}`}
        data-state={link.state}
        title={link.detail}
      >
        {link.tone === "ok" && <span className="status-dot" aria-hidden="true" />}
        {link.label}
      </span>
      <span className="text-caption fg-3 controller-line-help">{link.detail}</span>
      {onOpenSetting && (
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={onOpenSetting}
          data-testid={`controller-setup-${tab}`}
        >
          Set up
        </button>
      )}
    </div>
  );
}

/** Hook form for pages: shallow-compared, so a 25 Hz telemetry frame re-renders
 * the caller only when one of the four classification fields changes. */
export function useControllerLink(): ControllerLink {
  return useStore(useShallow(selectControllerLink));
}

const f1 = (v: number) => v.toFixed(1);

/** "3.4 s ago" / "never" — ages are quantised so the row does not flicker. */
export function ageText(age: number | null | undefined): string {
  if (age === undefined) return "not reported";
  if (age === null) return "no event yet";
  if (age < 1) return "just now";
  if (age < 60) return `${Math.round(age)} s ago`;
  const m = Math.floor(age / 60);
  return m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ago`;
}

interface RowProps {
  label: string;
  value: string;
  tone?: LinkTone;
  testId: string;
  hint?: string;
}

function Row({ label, value, tone = "neutral", testId, hint }: RowProps) {
  return (
    <div className="kv controller-row" data-testid={testId}>
      <span className="fg-3">{label}</span>
      <span>
        <span className={PILL_CLASS[tone]}>{value}</span>
        {hint && <span className="text-caption fg-3 controller-row-hint">{hint}</span>}
      </span>
    </div>
  );
}

export interface ControllerLinkPanelProps {
  /** Served keymap, so the button self-test can name the injected codes. */
  bindings?: Bindings | null;
}

/** Setting-tab panel: the whole chain from receiver to buttons, each link on its
 * own row, plus the live controller view as a button self-test. */
export function ControllerLinkPanel({ bindings = null }: ControllerLinkPanelProps) {
  const tracker = useStore(selectTracker);
  const link = controllerLink(tracker);
  const real = tracker !== null && tracker.backend === "libsurvive";
  const objects = tracker?.objects;
  const inputAge = tracker?.controller_age_s;
  const buttonsIdle =
    inputAge === null || (inputAge !== undefined && inputAge > BUTTON_IDLE_HINT_S);
  return (
    <div className="panel controller-panel" data-testid="controller-panel">
      <div className="kv">
        <strong>Controller link</strong>
        <span
          className={PILL_CLASS[link.tone]}
          data-testid="controller-link-setting"
          data-state={link.state}
        >
          {link.tone === "ok" && <span className="status-dot" aria-hidden="true" />}
          {link.label}
        </span>
      </div>
      <div className="text-caption fg-3" data-testid="controller-link-detail">
        {link.detail}
      </div>

      <Row
        label="Receiver (USB)"
        testId="controller-row-receiver"
        value={
          tracker?.dongle_present === true
            ? "plugged in"
            : tracker?.dongle_present === false
              ? "not found"
              : "not reported"
        }
        tone={
          tracker?.dongle_present === true
            ? "ok"
            : tracker?.dongle_present === false
              ? "danger"
              : "neutral"
        }
        hint={
          tracker?.dongle_present === undefined
            ? "restart the runtime to report it"
            : "Valve Watchman dongle 28de:2101"
        }
      />
      <Row
        label="Pairing"
        testId="controller-row-pairing"
        value={
          objects === undefined
            ? "not reported"
            : objects.length === 0
              ? "no device"
              : objects.join(", ")
        }
        tone={objects === undefined ? "neutral" : objects.length === 0 ? "warn" : "ok"}
        hint={
          objects === undefined
            ? "restart the runtime to report it"
            : objects.length === 0
              ? "pair with Menu + System held down"
              : `expected ${tracker?.object_name || "WM0"}`
        }
      />
      <Row
        label="Pose stream"
        testId="controller-row-pose"
        value={
          real || tracker?.backend === "fake"
            ? `${tracker?.status ?? "—"} · ${f1(tracker?.rate_hz ?? 0)} Hz`
            : "off"
        }
        tone={
          tracker?.status === "tracking" ? "ok" : tracker?.status === "error" ? "danger" : "warn"
        }
        hint={`pose ${ageText(tracker?.age_s)}`}
      />
      <Row
        label="Buttons"
        testId="controller-row-buttons"
        value={`last input ${ageText(inputAge)}`}
        tone={
          inputAge !== undefined && inputAge !== null && inputAge <= BUTTON_IDLE_HINT_S
            ? "ok"
            : "neutral"
        }
        hint={
          buttonsIdle
            ? "squeeze the trigger — the row below must light up"
            : "the button path is alive"
        }
      />
      {real && (
        <Row
          label="Battery"
          testId="controller-row-battery"
          value={
            tracker?.charging == null
              ? "not reported"
              : tracker.charging
                ? "on USB power"
                : "on battery"
          }
          tone="neutral"
          hint={tracker?.charging === false ? "a flat battery weakens the radio link" : undefined}
        />
      )}
      <div className="text-caption fg-3" data-testid="controller-selftest-help">
        Button self-test: squeeze the trigger, click the trackpad, press Menu. Each input lights up
        below and its injected key code appears next to it. The pose stream and the button stream
        are independent — a moving controller whose buttons stay dark can never engage the clutch.
      </div>
      <ControllerView
        controller={tracker?.controller ?? null}
        deviceHeld={tracker?.device_held ?? []}
        deviceAction={tracker?.device_action ?? null}
        bindings={bindings}
      />
    </div>
  );
}
