import { describe, expect, it } from "vitest";
import {
  APP_TITLE,
  ARM_LABELS,
  ARM_ORDER,
  armLabel,
  armTitle,
  HARDWARE_CAMERA_SLOTS,
  HARDWARE_GRID_SLOTS,
  HARDWARE_OVERLAY_SLOTS,
  isOverlayStream,
  MIC_LABEL,
  micSubtitle,
  orderArms,
  MODE_LABELS,
  orderStreams,
  overlayBase,
  pageTitle,
  sessionStreamIds,
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
    expect(HARDWARE_CAMERA_SLOTS).toEqual(["grip_wrist", "view_wrist"]);
    // Phase-09a twin overlays: `<camera_id>_align`, each right after its camera.
    expect(HARDWARE_OVERLAY_SLOTS).toEqual(["grip_wrist_align", "view_wrist_align"]);
    expect(HARDWARE_GRID_SLOTS).toEqual([
      "grip_wrist",
      "grip_wrist_align",
      "view_wrist",
      "view_wrist_align",
    ]);
    expect(streamLabel("grip_wrist_align")).toBe("Manipulation · twin overlay");
    expect(streamLabel("view_wrist_align")).toBe("Perception · twin overlay");
    expect(overlayBase("grip_wrist_align")).toBe("grip_wrist");
    expect(overlayBase("grip_wrist")).toBeNull();
    expect(isOverlayStream("view_wrist_align")).toBe(true);
    expect(isOverlayStream("view_wrist_cam")).toBe(false);
    // `setting` is the device Setting tab (2026-09-07), not a workcell kind.
    expect(TAB_LABELS).toEqual({ hardware: "Hardware", sim: "Sim", setting: "Setting" });
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
    expect(orderStreams(["sim", "view_wrist", "grip_wrist"])).toEqual([
      "view_wrist",
      "grip_wrist",
      "sim",
    ]);
  });

  it("sessionStreamIds: a hardware session with the wire's empty streams tiles the grid slots", () => {
    // Runtime `SessionInfo.streams` is [] for hardware sessions (previews adopted, not re-added).
    expect(sessionStreamIds({ streams: [], kind: "hardware" })).toEqual([...HARDWARE_GRID_SLOTS]);
    expect(orderStreams(sessionStreamIds({ streams: [], kind: "hardware" }))).toEqual([
      "grip_wrist",
      "grip_wrist_align",
      "view_wrist",
      "view_wrist_align",
    ]);
    // A listed set (sim; a future runtime listing the adopted ids) is used as is.
    expect(sessionStreamIds({ streams: ["view_wrist", "grip_wrist"], kind: "hardware" })).toEqual([
      "view_wrist",
      "grip_wrist",
    ]);
    expect(sessionStreamIds({ streams: ["grip_wrist_cam", "sim"], kind: "sim" })).toEqual([
      "grip_wrist_cam",
      "sim",
    ]);
    // No session / a sim session without streams / an older runtime without `kind`: nothing.
    expect(sessionStreamIds(null)).toEqual([]);
    expect(sessionStreamIds(undefined)).toEqual([]);
    expect(sessionStreamIds({ streams: [], kind: "sim" })).toEqual([]);
    expect(sessionStreamIds({ streams: [] })).toEqual([]);
  });

  it("orderStreams: a twin overlay follows its camera; orphan overlays keep their own place", () => {
    expect(
      orderStreams(["view_wrist_align", "sim", "view_wrist", "grip_wrist_align", "grip_wrist"]),
    ).toEqual(["view_wrist", "view_wrist_align", "grip_wrist", "grip_wrist_align", "sim"]);
    // The overlay inherits its camera's rank (a wrist cam outranks environment cams).
    expect(orderStreams(["cam_front", "grip_wrist_cam_align", "grip_wrist_cam"])).toEqual([
      "grip_wrist_cam",
      "grip_wrist_cam_align",
      "cam_front",
    ]);
    // Camera not listed → the overlay is an ordinary rank-1 stream, stable.
    expect(orderStreams(["sim", "grip_wrist_align", "cam_top"])).toEqual([
      "grip_wrist_align",
      "cam_top",
      "sim",
    ]);
  });
});
