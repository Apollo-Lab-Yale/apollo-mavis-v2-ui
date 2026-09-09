/** Mode pages — ~15-line wrappers around Cockpit (05-ui §8.2). */
import { Cockpit } from "./Cockpit";

export const Teleop = () => <Cockpit mode="teleop" />;
export const Collect = () => <Cockpit mode="collect" />;
export const Dagger = () => <Cockpit mode="dagger" />;
export const Inference = () => <Cockpit mode="inference" />;
/** GELLO Manipulation (phase-15, 16-gello §11). */
export const Gello = () => <Cockpit mode="gello" />;
