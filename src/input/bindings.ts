/** Keymap → BOUND set, grouping, display labels (05-ui §6.1).
 *
 * The canonical keymap is fetched from GET /api/keymap — no hardcoded copy.
 * Rail keys are always in `bound` and always sent while held; the server
 * ignores them for non-rail arms (UI only hides them from the overlay).
 */
import type { KeymapEntry } from "../gen";
import type { ActionName } from "../lib/types";

export interface Bindings {
  bound: ReadonlySet<string>; // every code we preventDefault
  held: ReadonlySet<string>; // kind === "held"
  discrete: ReadonlyMap<string, ActionName>; // code → action
  byGroup: ReadonlyMap<KeymapEntry["group"], KeymapEntry[]>;
  /** Gamepad control label ("A", "RT", "DpadLeft", …) → keymap row (13-tracker §1). */
  gamepad: ReadonlyMap<string, KeymapEntry>;
  entries: readonly KeymapEntry[];
}

export function buildBindings(entries: KeymapEntry[]): Bindings {
  const bound = new Set<string>();
  const held = new Set<string>();
  const discrete = new Map<string, ActionName>();
  const byGroup = new Map<KeymapEntry["group"], KeymapEntry[]>();
  const gamepad = new Map<string, KeymapEntry>();
  for (const e of entries) {
    bound.add(e.code);
    if (e.kind === "held") held.add(e.code);
    else discrete.set(e.code, e.action as ActionName);
    const g = byGroup.get(e.group);
    if (g) g.push(e);
    else byGroup.set(e.group, [e]);
    if (e.gamepad) gamepad.set(e.gamepad, e);
  }
  return { bound, held, discrete, byGroup, gamepad, entries };
}

export function actionFor(bindings: Bindings, code: string): ActionName | null {
  return bindings.discrete.get(code) ?? null;
}

/** First key code bound to a discrete action ("switch_arm" → "Tab"), or null.
 * The Cockpit's page-wide arm-switch shortcut resolves its key through this
 * instead of hardcoding one: the served keymap is the OPERATOR'S and they may
 * have rebound it, so both the handler and the hint beside the arm rows have to
 * follow it. */
export function codeForAction(bindings: Bindings, action: ActionName): string | null {
  for (const [code, a] of bindings.discrete) if (a === action) return code;
  return null;
}

/** Physical keycap hint from a KeyboardEvent.code ("KeyW" → "W", "ArrowLeft" → "←"). */
export function keycapLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  const special: Record<string, string> = {
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
    Space: "Space",
    Tab: "Tab",
    Enter: "Enter",
    Backspace: "Backspace",
    Escape: "Esc",
    Slash: "/",
  };
  return special[code] ?? code;
}

/** Short glyph for a `KeymapEntry.gamepad` label ("DpadLeft" → "◁", "RT" → "RT"). */
export function gamepadGlyph(label: string | null | undefined): string {
  if (!label) return "";
  const glyphs: Record<string, string> = {
    DpadLeft: "◁",
    DpadRight: "▷",
    DpadUp: "△",
    DpadDown: "▽",
    A: "Ⓐ",
    B: "Ⓑ",
    X: "Ⓧ",
    Y: "Ⓨ",
    LB: "LB",
    RB: "RB",
    LT: "LT",
    RT: "RT",
  };
  return glyphs[label] ?? label;
}

/** Vive-controller input per ACTION (13-tracker §1.1 mapping table). The served
 * keymap has no controller field (the runtime injects key codes, not labels),
 * so this is the one static table in the UI. Keyed by action name — never by
 * key code — so a re-bound key in the served keymap still shows the right
 * controller hint. Trackpad clicks are classified by position at the press
 * edge: up/down = gripper rate (held), left/right = rail (held); the menu
 * button is switch_arm (discrete). `switch_arm_prev` has no controller input. */
export const CONTROLLER_GLYPHS: Readonly<Record<string, string>> = {
  tracker_clutch: "trigger",
  gripper_open: "pad ▲",
  gripper_close: "pad ▼",
  rail_neg: "pad ◀",
  rail_pos: "pad ▶",
  switch_arm: "menu",
};

/** Controller glyph for a keymap action ("tracker_clutch" → "trigger"), or null. */
export function controllerGlyph(action: string | null | undefined): string | null {
  if (!action) return null;
  return CONTROLLER_GLYPHS[action] ?? null;
}
