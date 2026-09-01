import { beforeEach, describe, expect, it } from "vitest";
import { makeTelemetry } from "../../tests/mocks/fixtures";
import type { SessionInfo } from "../gen";
import { selectActiveArm, selectControlLinkDown, useStore } from "./index";

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
