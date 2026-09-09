/** Keybinding hint overlay, driven entirely by the fetched keymap (05-ui §8.2).
 * Glyph columns: keycap, gamepad (`KeymapEntry.gamepad`) and Vive controller
 * (static `CONTROLLER_GLYPHS` keyed by action — 13-tracker §1.1). */
import type { KeymapEntry, SessionTelemetry } from "../gen";
import { controllerGlyph, gamepadGlyph, keycapLabel } from "../input/bindings";
import type { Mode } from "../lib/types";

export interface KeymapOverlayProps {
  entries: KeymapEntry[];
  mode: Mode;
  activeArmHasRail: boolean;
  open: boolean;
  onToggle(): void;
  /** `telemetry.session.translate_frame` (2026-09-08): which frame W/S/A/D/E/Q act
   * in right now — `world` (the runtime default since the 2026-09-08 evening
   * decision), `camera` or `base` (config options). The keymap labels the KEY axes
   * ("forward", "up"), so without this the operator cannot tell what they currently
   * point at — the exact confusion the 2026-09-08 frame change came from. Omitted /
   * null → no caption. */
  translateFrame?: SessionTelemetry["translate_frame"];
}

/** One line explaining what the translate keys mean in each frame (04-runtime §6).
 * `world` is the default; `camera` and `base` are the selectable alternatives. */
const FRAME_CAPTION: Record<"camera" | "world" | "base", string> = {
  world:
    "translate = the OPERATOR frame, fixed to the table (the default): forward away from " +
    "you, left to your left, up is up. Does not follow the tool.",
  camera:
    "translate = the active arm's WRIST-CAMERA frame: forward along the optical axis, " +
    "left/right and up/down as seen in the wrist image (so up/down = image up/down, not " +
    "world up/down). Follows the tool.",
  base:
    "translate = the arm's BASE axes (pre-2026-09-08). Fixed, but yawed 180° against " +
    "your view in this cell: forward comes toward you, left goes to your right.",
};

const GROUP_ORDER: KeymapEntry["group"][] = [
  "translate",
  "rotate",
  "gripper",
  "rail",
  "tracker",
  "session",
  "episode",
];

function rowLabel(e: KeymapEntry, mode: Mode): string {
  if (e.action === "takeover_toggle") {
    if (mode === "dagger") return "takeover toggle (recorded as intervention)";
    if (mode === "inference") return "takeover toggle (safety escape — never recorded)";
  }
  return e.label;
}

export function KeymapOverlay({
  entries,
  mode,
  activeArmHasRail,
  open,
  onToggle,
  translateFrame,
}: KeymapOverlayProps) {
  const visible = entries.filter((e) => {
    if (e.requires_rail && !activeArmHasRail) return false;
    if (e.group === "episode" && mode !== "collect" && mode !== "dagger") return false;
    if (e.action === "takeover_toggle" && mode !== "dagger" && mode !== "inference") return false;
    return true;
  });
  return (
    <div className="panel" data-testid="keymap-overlay">
      <button onClick={onToggle} data-testid="keymap-toggle">
        Keys ({keycapLabel("Slash")}) {open ? "▾" : "▸"}
      </button>
      {open && translateFrame && (
        <p className="dim text-small" data-testid="translate-frame-caption" style={{ margin: 0 }}>
          <strong>{translateFrame}</strong> — {FRAME_CAPTION[translateFrame]} Rotations are always
          about the tool (TCP) axes.
        </p>
      )}
      {open && (
        <table className="keymap">
          <thead>
            <tr className="dim" data-testid="keymap-head">
              <th>key</th>
              <th className="pad-col">gamepad</th>
              <th className="ctrl-col">controller</th>
              <th />
              <th />
            </tr>
          </thead>
          <tbody>
            {GROUP_ORDER.flatMap((g) =>
              visible
                .filter((e) => e.group === g)
                .map((e) => (
                  <tr key={e.code} data-testid={`keyrow-${e.code}`}>
                    <td>
                      <kbd>{keycapLabel(e.code)}</kbd>
                    </td>
                    <td className="pad-col" data-testid={`keyrow-${e.code}-pad`}>
                      {e.gamepad ? (
                        <kbd className="pad" title={`gamepad ${e.gamepad}`}>
                          {gamepadGlyph(e.gamepad)}
                        </kbd>
                      ) : (
                        <span className="dim">—</span>
                      )}
                    </td>
                    <td className="ctrl-col" data-testid={`keyrow-${e.code}-ctrl`}>
                      {controllerGlyph(e.action) ? (
                        <kbd
                          className="ctrl"
                          title={`Vive controller ${controllerGlyph(e.action)}`}
                        >
                          {controllerGlyph(e.action)}
                        </kbd>
                      ) : (
                        <span className="dim">—</span>
                      )}
                    </td>
                    <td>{rowLabel(e, mode)}</td>
                    <td className="dim">{e.group}</td>
                  </tr>
                )),
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
