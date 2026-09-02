import { beforeEach, describe, expect, it } from "vitest";
import { makeTelemetry, makeTracker } from "../../tests/mocks/fixtures";
import type { SessionInfo } from "../gen";
import {
  DEVICES_IDLE,
  GAMEPAD_IDLE,
  selectActiveArm,
  selectControlLinkDown,
  selectTracker,
  useStore,
} from "./index";

const session: SessionInfo = {
  session_id: "s1",
  epoch: "e1",
  mode: "teleop",
  arms: ["arm0"],
  streams: ["cam0", "sim"],
  state: "running",
};

describe("store", () => {
  beforeEach(() => {
    useStore.getState().resetForEpochChange();
    useStore.getState().setConn("control", "closed");
  });

  it("resetForEpochChange clears session + telemetry", () => {
    const st = useStore.getState();
    st.setSession(session);
    st.setTelemetry(makeTelemetry());
    useStore.getState().resetForEpochChange();
    expect(useStore.getState().session).toBeNull();
    expect(useStore.getState().telemetry).toBeNull();
    expect(useStore.getState().captureArmed).toBe(false);
  });

  it("resetForEpochChange clears the gamepad + devices slices", () => {
    const st = useStore.getState();
    st.setGamepad({ connected: true, id: "pad", armed: true, active: ["A"] });
    st.setDevices({ startedScene: "mavis_v2", pendingTrackerSettings: { yaw_deg: 1 } });
    expect(useStore.getState().gamepad.armed).toBe(true);
    useStore.getState().resetForEpochChange();
    expect(useStore.getState().gamepad).toEqual(GAMEPAD_IDLE);
    expect(useStore.getState().devices).toEqual(DEVICES_IDLE);
  });

  it("selectTracker reads telemetry.tracker (null when absent)", () => {
    expect(selectTracker(useStore.getState())).toBeNull();
    useStore.getState().setTelemetry(makeTelemetry({ tracker: makeTracker() }));
    expect(selectTracker(useStore.getState())?.backend).toBe("fake");
  });

  it("selectControlLinkDown tracks conn.control", () => {
    expect(selectControlLinkDown(useStore.getState())).toBe(true);
    useStore.getState().setConn("control", "open");
    expect(selectControlLinkDown(useStore.getState())).toBe(false);
    useStore.getState().setConn("control", "connecting");
    expect(selectControlLinkDown(useStore.getState())).toBe(true);
  });

  it("selectActiveArm resolves the server-authoritative active arm", () => {
    useStore.getState().setTelemetry(makeTelemetry({ active_arm: "arm0" }));
    expect(selectActiveArm(useStore.getState())?.arm_id).toBe("arm0");
    useStore.getState().setTelemetry(makeTelemetry({ seq: 2, active_arm: null }));
    expect(selectActiveArm(useStore.getState())).toBeNull();
  });
});
