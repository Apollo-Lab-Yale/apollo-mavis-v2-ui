/** Hand-written aliases over the generated wire types (src/gen is generated). */
import type { ActionMsg } from "../gen";

export type WsStatus = "connecting" | "open" | "closed";
/** Session modes in card order; `gello` (phase-15, 16-gello §11) is the fifth. */
export type Mode = "teleop" | "collect" | "dagger" | "inference" | "gello";
export type Kind = "hardware" | "sim";
/** Welcome-page tabs: the two workcell kinds plus the device **Setting** tab,
 * which launches nothing and therefore is NOT a `Kind` (2026-09-07). */
export type TabKey = Kind | "setting";
export const SETTING_TAB = "setting" as const;
/** Narrow a tab key to a workcell kind (`null` on the Setting tab). */
export const tabKind = (t: TabKey): Kind | null => (t === SETTING_TAB ? null : t);
/** "world" | "arm_base:<id>" | "camera:<id>" | "ee:<id>" */
export type FrameRef = string;
export type ActionName = ActionMsg["name"];

export const MODES: readonly Mode[] = ["teleop", "collect", "dagger", "inference", "gello"];
