/** Gamepad adapter (13-tracker §5): 50 Hz poll of `navigator.getGamepads()`.
 *
 * The browser reads the pad and folds it into the existing single-writer
 * control channel: held rows become codes in a shared held set (unioned with
 * the keyboard set by `clients.heldUnion`), discrete rows become one
 * `sendAction` per press edge. Which label drives which row comes from the
 * served keymap (`KeymapEntry.gamepad`) — nothing here is per-action.
 *
 * Normalizer: `mapping === "standard"` → buttons 0 A, 1 B, 4 LB, 5 RB,
 * 7 RT (value ≥ 0.5), 14 DpadLeft, 15 DpadRight. Anything else is treated as
 * raw Linux joydev order → buttons 0 A, 1 B, 4 LB, 5 RB; axes[6] = D-pad x
 * (−1 left, +1 right); axes[5] = RT, either −1..1 (rest −1) or 0..1 (rest 0);
 * the adapter tracks the observed minimum to pick the threshold.
 *
 * Release-all (clear held + empty-set transition + disarm) on
 * `gamepaddisconnected`, window blur, hidden visibilitychange, explicit
 * disarm, and whenever `canArm()` turns false (control link not open).
 *
 * Release-all from blur / hidden / link-down / pad loss is LATCHED (13-tracker
 * §5): the adapter accepts no new press edges until every mapped control
 * reads released, or the page is focused and visible again. A control that
 * was held across the latch never re-fires by itself — it has to be released
 * and pressed again — so an RT still held when the tab comes back cannot
 * re-engage the clutch or restart the heartbeat on its own.
 */
import type { ActionName } from "../lib/types";
import type { Bindings } from "./bindings";

export const GAMEPAD_POLL_MS = 20; // 50 Hz

export const GAMEPAD_LABELS = ["A", "B", "LB", "RB", "RT", "DpadLeft", "DpadRight"] as const;
export type GamepadLabel = (typeof GAMEPAD_LABELS)[number];

/** Structural subset of the DOM `Gamepad` so tests can inject plain objects. */
export interface GamepadLike {
  index: number;
  id: string;
  mapping: string;
  connected: boolean;
  buttons: readonly { pressed: boolean; value: number }[];
  axes: readonly number[];
}

export interface NormalizedPad {
  index: number;
  id: string;
  mapping: string;
  pressed: Record<GamepadLabel, boolean>;
  /** RT as 0..1 after range normalization (display only). */
  rt: number;
  buttons: number[]; // raw values
  buttonPressed: boolean[]; // raw pressed flags
  axes: number[]; // raw axes
}

const STANDARD_BUTTONS: Record<GamepadLabel, number> = {
  A: 0,
  B: 1,
  LB: 4,
  RB: 5,
  RT: 7,
  DpadLeft: 14,
  DpadRight: 15,
};
const RAW_BUTTONS: Partial<Record<GamepadLabel, number>> = { A: 0, B: 1, LB: 4, RB: 5 };
const RAW_DPAD_X_AXIS = 6;
const RAW_RT_AXIS = 5;
export const RT_THRESHOLD = 0.5;
const AXIS_THRESHOLD = 0.5;

const btn = (gp: GamepadLike, i: number) => gp.buttons[i];
const isPressed = (gp: GamepadLike, i: number): boolean => {
  const b = btn(gp, i);
  return b ? b.pressed || b.value >= RT_THRESHOLD : false;
};

/** Normalize one pad. `rtMin` is the lowest RT axis value seen so far (raw
 * mapping only): ≤ −0.5 means the axis is −1..1, otherwise 0..1. */
export function normalizeGamepad(gp: GamepadLike, rtMin = 0): NormalizedPad {
  const pressed = {} as Record<GamepadLabel, boolean>;
  let rt = 0;
  if (gp.mapping === "standard") {
    for (const label of GAMEPAD_LABELS) {
      const i = STANDARD_BUTTONS[label];
      pressed[label] = label === "RT" ? (btn(gp, i)?.value ?? 0) >= RT_THRESHOLD : isPressed(gp, i);
    }
    rt = btn(gp, STANDARD_BUTTONS.RT)?.value ?? 0;
  } else {
    for (const label of GAMEPAD_LABELS) pressed[label] = false;
    for (const [label, i] of Object.entries(RAW_BUTTONS) as [GamepadLabel, number][])
      pressed[label] = isPressed(gp, i);
    const dx = gp.axes[RAW_DPAD_X_AXIS] ?? 0;
    pressed.DpadLeft = dx <= -AXIS_THRESHOLD;
    pressed.DpadRight = dx >= AXIS_THRESHOLD;
    const raw = gp.axes[RAW_RT_AXIS] ?? 0;
    rt = rtMin <= -AXIS_THRESHOLD ? (raw + 1) / 2 : Math.max(0, raw);
    pressed.RT = rt >= RT_THRESHOLD;
  }
  return {
    index: gp.index,
    id: gp.id,
    mapping: gp.mapping,
    pressed,
    rt,
    buttons: gp.buttons.map((b) => b.value),
    buttonPressed: gp.buttons.map((b) => b.pressed),
    axes: [...gp.axes],
  };
}

export interface GamepadSnapshot {
  connected: boolean;
  index: number | null;
  id: string | null;
  mapping: string | null;
  buttons: number[];
  pressed: boolean[];
  axes: number[];
  active: GamepadLabel[];
  armed: boolean;
  /** Release-all latch engaged: no press edges accepted until all mapped
   * controls are released (or focus + visibility return). */
  latched: boolean;
}

const idleSnapshot = (armed: boolean, latched = false): GamepadSnapshot => ({
  connected: false,
  index: null,
  id: null,
  mapping: null,
  buttons: [],
  pressed: [],
  axes: [],
  active: [],
  armed,
  latched,
});

export interface GamepadAdapterOpts {
  /** Injectable for tests; defaults to `navigator.getGamepads()` when present. */
  getGamepads?: () => readonly (GamepadLike | null)[];
  getBindings: () => Bindings | null; // served keymap; null → inert
  canArm: () => boolean; // control link open && role controller
  onHeldChange: () => void; // → control.notifyTransition()
  onAction: (name: ActionName) => void; // → control.sendAction(name)
  onArmedChange: (armed: boolean) => void; // → setArmedSource("gamepad", armed)
  onSnapshot?: (s: GamepadSnapshot) => void; // → store.setGamepad (only on change)
  pollMs?: number;
  target?: Pick<Window, "addEventListener" | "removeEventListener">;
}

const defaultGetGamepads = (): readonly (GamepadLike | null)[] => {
  if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return [];
  try {
    return navigator.getGamepads() as readonly (GamepadLike | null)[];
  } catch {
    return [];
  }
};

export class GamepadAdapter {
  readonly held = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private armed = false;
  private latched = false;
  private prev: Record<GamepadLabel, boolean> | null = null;
  private rtMin = 0;
  private padIndex: number | null = null;
  private lastKey = JSON.stringify(idleSnapshot(false)); // store starts idle
  private readonly target: GamepadAdapterOpts["target"];

  constructor(private readonly opts: GamepadAdapterOpts) {
    this.target = opts.target ?? (typeof window !== "undefined" ? window : undefined);
  }

  get isArmed(): boolean {
    return this.armed;
  }

  /** Release-all latch state (see class doc). */
  get isLatched(): boolean {
    return this.latched;
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.poll(), this.opts.pollMs ?? GAMEPAD_POLL_MS);
    this.target?.addEventListener("gamepaddisconnected", this.onDisconnected);
    this.target?.addEventListener("blur", this.onBlur);
    this.target?.addEventListener("focus", this.onFocus);
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.target?.removeEventListener("gamepaddisconnected", this.onDisconnected);
    this.target?.removeEventListener("blur", this.onBlur);
    this.target?.removeEventListener("focus", this.onFocus);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.releaseAll();
    this.latched = false;
    this.publish(null);
  }

  /** Clear held codes (empty-set transition if anything was held) and disarm. */
  releaseAll(): void {
    const hadHeld = this.held.size > 0;
    this.held.clear();
    this.prev = null;
    if (hadHeld) this.opts.onHeldChange();
    this.disarm();
  }

  /** Release-all + latch (blur / hidden / link-down / pad loss). */
  private latchReleaseAll(): void {
    this.releaseAll();
    this.latched = true;
  }

  /** Focus + visibility returned: lift the latch WITHOUT re-firing controls
   * that are still held — snapshot the current pad state as `prev` so only
   * genuinely new press edges are accepted from here on. */
  private unlatch(): void {
    if (!this.latched) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    const pad = this.pickPad();
    this.prev = pad ? normalizeGamepad(pad, this.rtMin).pressed : null;
    this.latched = false;
  }

  disarm(): void {
    if (!this.armed) return;
    this.armed = false;
    this.opts.onArmedChange(false);
  }

  private arm(): boolean {
    if (this.armed) return true;
    if (!this.opts.canArm()) return false;
    this.armed = true;
    this.opts.onArmedChange(true);
    return true;
  }

  private readonly onDisconnected = () => this.latchReleaseAll();
  private readonly onBlur = () => this.latchReleaseAll();
  private readonly onFocus = () => this.unlatch();
  private readonly onVisibility = () => {
    if (document.visibilityState === "hidden") this.latchReleaseAll();
    else this.unlatch();
  };

  private pickPad(): GamepadLike | null {
    const pads = (this.opts.getGamepads ?? defaultGetGamepads)();
    if (this.padIndex !== null) {
      const same = pads.find((p) => p && p.index === this.padIndex && p.connected);
      if (same) return same;
    }
    const first = pads.find((p): p is GamepadLike => !!p && p.connected) ?? null;
    if (first?.index !== this.padIndex) this.rtMin = 0; // new pad → relearn RT range
    this.padIndex = first?.index ?? null;
    return first;
  }

  /** One poll tick — public so tests can drive it without timers. */
  poll(): void {
    const pad = this.pickPad();
    if (!pad) {
      if (this.held.size > 0 || this.armed) this.latchReleaseAll();
      this.publish(null);
      return;
    }
    if (pad.mapping !== "standard") {
      const raw = pad.axes[RAW_RT_AXIS];
      if (raw !== undefined && raw < this.rtMin) this.rtMin = raw;
    }
    const n = normalizeGamepad(pad, this.rtMin);
    const bindings = this.opts.getBindings();

    // Link down / role lost → release-all (latched), but keep reporting the raw pad.
    if (!this.opts.canArm()) {
      if (this.held.size > 0 || this.armed) this.latchReleaseAll();
      this.publish(n);
      return;
    }

    // Latched: track the pad state but inject nothing until every mapped
    // control reads released (focus/visibility return lifts it via unlatch()).
    if (this.latched) {
      const anyMapped = GAMEPAD_LABELS.some((l) => n.pressed[l] && bindings?.gamepad.has(l));
      if (anyMapped) {
        this.prev = n.pressed;
        this.publish(n);
        return;
      }
      this.latched = false;
    }

    const prev = this.prev ?? ({} as Record<GamepadLabel, boolean>);
    let changed = false;
    for (const label of GAMEPAD_LABELS) {
      const now = n.pressed[label];
      const was = prev[label] ?? false;
      if (now === was) continue;
      const row = bindings?.gamepad.get(label);
      if (!row) continue; // label not in the served keymap → never injected
      if (now) {
        // Press edge: first press auto-arms capture (13-tracker §5).
        if (!this.arm()) continue;
        if (row.kind === "held") {
          if (!this.held.has(row.code)) {
            this.held.add(row.code);
            changed = true;
          }
        } else {
          this.opts.onAction(row.action as ActionName);
        }
      } else if (row.kind === "held" && this.held.delete(row.code)) {
        changed = true;
      }
    }
    this.prev = n.pressed;
    if (changed) this.opts.onHeldChange();
    this.publish(n);
  }

  private publish(n: NormalizedPad | null): void {
    if (!this.opts.onSnapshot) return;
    const snap: GamepadSnapshot = n
      ? {
          connected: true,
          index: n.index,
          id: n.id,
          mapping: n.mapping,
          buttons: n.buttons.map((v) => Math.round(v * 100) / 100),
          pressed: n.buttonPressed,
          axes: n.axes.map((v) => Math.round(v * 100) / 100),
          active: GAMEPAD_LABELS.filter((l) => n.pressed[l]),
          armed: this.armed,
          latched: this.latched,
        }
      : idleSnapshot(this.armed, this.latched);
    const key = JSON.stringify(snap);
    if (key === this.lastKey) return; // publish only on change (50 Hz poll)
    this.lastKey = key;
    this.opts.onSnapshot(snap);
  }
}
