/** Shared jsdom stubs (05-ui §11): createImageBitmap / canvas 2D / OffscreenCanvas
 * are missing in jsdom — stub once here, never per-test. Phase-11 adds
 * `HTMLDialogElement.showModal/show/close` (Sheet) and `ResizeObserver` (MicTile).
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { resetModalHosts } from "../src/lib/modalHost";

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
    for (const fn of Object.values(canvas2d)) if (typeof fn === "function") fn.mockClear?.();
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

// Minimal 2D context recording drawImage calls; path/text ops are spies
// (the tracker trail and the mic oscillogram draw lines/arcs/rects/text).
export const canvas2d = {
  drawImage: vi.fn((...args: unknown[]) => {
    canvasStub.drawCalls.push({ args });
  }),
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  rect: vi.fn(),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  arc: vi.fn(),
  stroke: vi.fn(),
  fill: vi.fn(),
  fillText: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  save: vi.fn(),
  restore: vi.fn(),
  scale: vi.fn(),
  translate: vi.fn(),
  setTransform: vi.fn(),
  resetTransform: vi.fn(),
  setLineDash: vi.fn(),
  strokeStyle: "",
  fillStyle: "",
  lineWidth: 1,
  font: "",
};
HTMLCanvasElement.prototype.getContext = vi.fn(function (this: HTMLCanvasElement, kind: string) {
  return kind === "2d" ? (canvas2d as unknown as CanvasRenderingContext2D) : null;
}) as never;

// <dialog>: jsdom has the element but not showModal/show/close.
if (typeof HTMLDialogElement !== "undefined") {
  const proto = HTMLDialogElement.prototype;
  if (typeof proto.showModal !== "function") {
    proto.showModal = function showModal(this: HTMLDialogElement) {
      if (this.open) throw new DOMException("already open", "InvalidStateError");
      this.setAttribute("open", "");
    };
  }
  if (typeof proto.show !== "function") {
    proto.show = function show(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
  }
  if (typeof proto.close !== "function") {
    proto.close = function close(this: HTMLDialogElement, returnValue?: string) {
      if (!this.open) return;
      this.removeAttribute("open");
      if (returnValue !== undefined) this.returnValue = returnValue;
      this.dispatchEvent(new Event("close"));
    };
  }
}

// ResizeObserver: no layout in jsdom; observe/unobserve/disconnect are no-ops.
if (typeof ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
}

afterEach(() => {
  cleanup();
  localStorage.clear(); // the Welcome tab choice is persisted; never leak it between tests
  resetModalHosts();
  canvasStub.reset();
});
