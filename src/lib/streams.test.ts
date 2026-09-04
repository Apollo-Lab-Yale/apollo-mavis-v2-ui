import { describe, expect, it } from "vitest";
import {
  APP_TITLE,
  ARM_LABELS,
  ARM_ORDER,
  armLabel,
  armTitle,
  HARDWARE_CAMERA_SLOTS,
  MIC_LABEL,
  micSubtitle,
  orderArms,
  MODE_LABELS,
  orderStreams,
  pageTitle,
  SCENE_DISPLAY_NAME,
  SCENE_ID,
  SIM_CAMERA_SLOTS,
  streamLabel,
  TAB_LABELS,
} from "./streams";
import { makeMicrophoneInfo } from "../../tests/mocks/fixtures";

describe("streams", () => {
  it("names", () => {
    expect(APP_TITLE).toBe("APOLLO MAVIS V2");
    expect(SCENE_ID).toBe("mavis_v2");
    expect(SCENE_DISPLAY_NAME).toBe("APOLLO MAVIS V2 Digital Twin");
    expect(MODE_LABELS).toEqual({
      teleop: "Teleop",
      collect: "Data Collection",
      dagger: "DAgger",
      inference: "Inference",
    });
    expect(pageTitle()).toBe("APOLLO MAVIS V2");
    expect(pageTitle("Teleop")).toBe("APOLLO MAVIS V2 · Teleop");
    expect(streamLabel("grip_wrist_cam")).toBe("Manipulation · wrist cam");
    expect(streamLabel("view_wrist_cam")).toBe("Perception · wrist cam");
    expect(streamLabel("unknown_cam")).toBe("unknown_cam");
    expect(MIC_LABEL).toBe("Perception · microphone");
    expect(SIM_CAMERA_SLOTS).toEqual(["grip_wrist_cam", "view_wrist_cam", "cam_front", "cam_top"]);
    expect(HARDWARE_CAMERA_SLOTS).toEqual(["camera1", "camera2"]);
    expect(TAB_LABELS).toEqual({ hardware: "Hardware", sim: "Sim" });
    expect(micSubtitle(makeMicrophoneInfo())).toBe("RØDE NT-USB Mini · 48 kHz mono");
    expect(micSubtitle(makeMicrophoneInfo({ channels: 2, sample_rate: 44100 }))).toBe(
      "RØDE NT-USB Mini · 44.1 kHz 2 ch",
    );
  });

  it("arm names: ids stay grip / view; Manipulation Arm first in every list", () => {
    expect(ARM_LABELS).toEqual({ grip: "Manipulation Arm", view: "Perception Arm" });
    expect(armLabel("grip")).toBe("Manipulation Arm");
    expect(armLabel("view")).toBe("Perception Arm");
    expect(armLabel("aux")).toBe("aux");
    expect(armTitle("grip")).toBe("Manipulation Arm (grip)");
    expect(armTitle("view")).toBe("Perception Arm (view)");
    expect(armTitle("aux")).toBe("aux");
    expect(ARM_ORDER).toEqual(["grip", "view"]);
    // The sim runtime lists `view` first; unknown ids keep their relative order after the known ones.
    expect(orderArms(["view", "aux2", "grip", "aux1"], (a) => a)).toEqual([
      "grip",
      "view",
      "aux2",
      "aux1",
    ]);
    expect(orderArms([{ arm_id: "view" }, { arm_id: "grip" }], (a) => a.arm_id)).toEqual([
      { arm_id: "grip" },
      { arm_id: "view" },
    ]);
  });

  it("orderStreams: wrist cams → environment cams → sim → twin, stable within a rank", () => {
    expect(
      orderStreams(["cam_front", "sim", "grip_wrist_cam", "twin", "cam_top", "view_wrist_cam"]),
    ).toEqual(["grip_wrist_cam", "view_wrist_cam", "cam_front", "cam_top", "sim", "twin"]);
    expect(orderStreams(["sim", "camera2", "camera1"])).toEqual(["camera2", "camera1", "sim"]);
  });
});
