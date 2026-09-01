/** Shared jsdom stubs (05-ui §11): createImageBitmap / canvas 2D / OffscreenCanvas
 * are missing in jsdom — stub once here, never per-test.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

export interface DrawCall {
  args: unknown[];
}

/** Test hooks: recorded drawImage calls + controllable decode gate. */
export const canvasStub = {
  drawCalls: [] as DrawCall[],
  reset() {
    this.drawCalls = [];
    decodeGate.pending = [];
    decodeGate.auto = true;
  },
};

export const decodeGate = {
  auto: true, // resolve createImageBitmap immediately
  pending: [] as (() => void)[],
  releaseOne() {
    this.pending.shift()?.();
  },
};

vi.stubGlobal(
  "createImageBitmap",
  vi.fn(
    (_blob: Blob) =>
      new Promise<ImageBitmap>((resolve) => {
        const bmp = { width: 320, height: 240, close: vi.fn() } as unknown as ImageBitmap;
        if (decodeGate.auto) resolve(bmp);
        else decodeGate.pending.push(() => resolve(bmp));
      }),
  ),
);

// Minimal 2D context recording drawImage calls.
const ctx2d = {
  drawImage: (...args: unknown[]) => {
    canvasStub.drawCalls.push({ args });
  },
  clearRect: vi.fn(),
  fillRect: vi.fn(),
};
HTMLCanvasElement.prototype.getContext = vi.fn(function (this: HTMLCanvasElement, kind: string) {
  return kind === "2d" ? (ctx2d as unknown as CanvasRenderingContext2D) : null;
}) as never;

afterEach(() => {
  cleanup();
  canvasStub.reset();
});
