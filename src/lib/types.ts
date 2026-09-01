/** Hand-written aliases over the generated wire types (src/gen is generated). */
import type { ActionMsg } from "../gen";

export type WsStatus = "connecting" | "open" | "closed";
export type Mode = "teleop" | "collect" | "dagger" | "inference";
export type Kind = "hardware" | "sim";
/** "world" | "arm_base:<id>" | "camera:<id>" | "ee:<id>" */
export type FrameRef = string;
export type ActionName = ActionMsg["name"];

export const MODES: readonly Mode[] = ["teleop", "collect", "dagger", "inference"];
