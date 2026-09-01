/** Keybinding hint overlay, driven entirely by the fetched keymap (05-ui §8.2). */
import type { KeymapEntry } from "../gen";
import { keycapLabel } from "../input/bindings";
import type { Mode } from "../lib/types";

export interface KeymapOverlayProps {
  entries: KeymapEntry[];
  mode: Mode;
  activeArmHasRail: boolean;
  open: boolean;
  onToggle(): void;
}

const GROUP_ORDER: KeymapEntry["group"][] = [
  "translate",
  "rotate",
  "gripper",
  "rail",
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
      {open && (
        <table className="keymap">
          <tbody>
            {GROUP_ORDER.flatMap((g) =>
              visible
                .filter((e) => e.group === g)
                .map((e) => (
                  <tr key={e.code} data-testid={`keyrow-${e.code}`}>
                    <td>
                      <kbd>{keycapLabel(e.code)}</kbd>
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
