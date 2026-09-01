import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canvasStub, decodeGate } from "../../tests/setup";
import { MockVideoServer, mockWsFactory } from "../../tests/mocks/mockWs";
import { useStore } from "../store";
import { StreamView } from "./StreamView";

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
    useStore.setState({ video: {} });
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

  it("shows the STALE chip after 500 ms without frames", async () => {
    mount();
    await tick(50);
    server.pushFrame(1.0);
    await tick(300);
    expect(screen.queryByTestId("stream-stale")).toBeNull();
    await tick(600); // > 500 ms since the last drawn frame
    expect(screen.getByTestId("stream-stale")).toBeInTheDocument();
    expect(screen.getByText("STALE")).toBeInTheDocument();
    // Recovers on the next frame.
    server.pushFrame(2.0);
    await tick(300);
    expect(screen.queryByTestId("stream-stale")).toBeNull();
  });
});
