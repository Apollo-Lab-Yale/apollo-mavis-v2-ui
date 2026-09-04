import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canvasStub, decodeGate } from "../../tests/setup";
import { MockVideoServer, mockWsFactory } from "../../tests/mocks/mockWs";
import { useStore } from "../store";
import { StreamView, streamState } from "./StreamView";

const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

const URL_BASE = `ws://${location.host}/ws/video`;

describe("StreamView", () => {
  let server: MockVideoServer;

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance", "Date"],
    });
    server = new MockVideoServer(`${URL_BASE}/camX`);
  });
  afterEach(() => {
    server.stop();
    vi.useRealTimers();
    act(() => useStore.setState({ video: {} }));
  });

  const mount = () =>
    render(
      <StreamView streamId="camX" label="cam X" wsFactory={mockWsFactory} useWorker={false} />,
    );

  it("draws each delivered frame (two frames → two drawImage calls)", async () => {
    mount();
    await tick(50); // mock-socket connection delay
    server.pushFrame(1.0);
    await tick(20);
    expect(canvasStub.drawCalls.length).toBe(1);
    server.pushFrame(1.033);
    await tick(20);
    expect(canvasStub.drawCalls.length).toBe(2);
  });

  it("drops frames while a decode is in flight (latest-wins)", async () => {
    mount();
    await tick(50);
    decodeGate.auto = false;
    server.pushFrame(1.0); // decode starts, held pending
    await tick(20);
    server.pushFrame(1.033); // dropped — decode in flight
    server.pushFrame(1.066); // dropped
    await tick(20);
    expect(decodeGate.pending.length).toBe(1); // only one decode ever started
    decodeGate.releaseOne();
    await tick(20);
    expect(canvasStub.drawCalls.length).toBe(1);
    // Next frame decodes normally again.
    server.pushFrame(1.1);
    await tick(20);
    expect(decodeGate.pending.length).toBe(1);
    decodeGate.releaseOne();
    await tick(20);
    expect(canvasStub.drawCalls.length).toBe(2);
  });

  it("shows the STALE chip after 500 ms without frames (last frame kept, data-state=stale)", async () => {
    mount();
    const tile = screen.getByTestId("stream-camX");
    expect(tile.dataset["state"]).toBe("connecting");
    await tick(50);
    server.pushFrame(1.0);
    await tick(300);
    expect(screen.queryByTestId("stream-stale")).toBeNull();
    expect(tile.dataset["state"]).toBe("live");
    expect(screen.getByTestId("stream-status").textContent).toBe("LIVE");
    await tick(600); // > 500 ms since the last drawn frame
    expect(screen.getByTestId("stream-stale")).toBeInTheDocument();
    expect(screen.getByText("STALE")).toBeInTheDocument();
    expect(tile.dataset["state"]).toBe("stale");
    expect(tile.querySelector("canvas")).not.toBeNull(); // context beats black
    // Recovers on the next frame.
    server.pushFrame(2.0);
    await tick(300);
    expect(screen.queryByTestId("stream-stale")).toBeNull();
    expect(tile.dataset["state"]).toBe("live");
  });

  it("stays 'connecting' while the socket is open but no frame has arrived", async () => {
    mount();
    await tick(600); // two stats ticks, socket open, nothing drawn yet
    const tile = screen.getByTestId("stream-camX");
    expect(tile.dataset["state"]).toBe("connecting");
    expect(screen.queryByTestId("stream-stale")).toBeNull();
  });

  it("title prop is the display name; the stream id stays canonical", () => {
    render(
      <StreamView
        streamId="grip_wrist_cam"
        title="Manipulation · wrist cam"
        wsFactory={mockWsFactory}
        useWorker={false}
      />,
    );
    expect(screen.getByTestId("stream-grip_wrist_cam").dataset["streamId"]).toBe("grip_wrist_cam");
    expect(screen.getByTestId("stream-title").textContent).toBe("Manipulation · wrist cam");
  });

  it("absent: pure black, crossed camera, 'camera1 · no signal', and NO WebSocket", async () => {
    const factory = vi.fn(mockWsFactory);
    render(<StreamView streamId="camera1" absent wsFactory={factory} useWorker={false} />);
    await tick(600);
    expect(factory).not.toHaveBeenCalled();
    const tile = screen.getByTestId("stream-camera1");
    expect(tile.dataset["state"]).toBe("absent");
    expect(tile.querySelector("canvas")).toBeNull();
    expect(screen.getByTestId("stream-absent").textContent).toContain("camera1 · no signal");
    expect(tile.querySelector("svg[data-icon='camera-off']")).not.toBeNull();
    expect(screen.queryByTestId("stream-status")).toBeNull();
    expect(screen.queryByTestId("stream-closed")).toBeNull();
  });

  it("streamState is pure", () => {
    const base = { stale: false, fps: 0, latencyMs: null };
    expect(streamState(undefined, true)).toBe("absent");
    expect(streamState(undefined, false)).toBe("connecting");
    expect(streamState({ ...base, status: "connecting" }, false)).toBe("connecting");
    expect(streamState({ ...base, status: "closed", stale: true }, false)).toBe("closed");
    expect(streamState({ ...base, status: "open", stale: true, hasFrame: false }, false)).toBe(
      "connecting",
    );
    expect(streamState({ ...base, status: "open", stale: true, hasFrame: true }, false)).toBe(
      "stale",
    );
    expect(streamState({ ...base, status: "open", hasFrame: true }, false)).toBe("live");
    expect(streamState({ ...base, status: "open" }, false)).toBe("live"); // legacy stats
  });
});
