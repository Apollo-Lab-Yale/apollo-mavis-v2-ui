import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KEYMAP } from "../../tests/mocks/fixtures";
import { buildBindings } from "./bindings";
import { useKeyCapture, type KeyCaptureApi } from "./useKeyCapture";

const bindings = buildBindings(KEYMAP);

function setup() {
  const onHeldChange = vi.fn();
  const onAction = vi.fn();
  const onArmedChange = vi.fn();
  const hook = renderHook(() => useKeyCapture({ bindings, onHeldChange, onAction, onArmedChange }));
  const api = (): KeyCaptureApi => hook.result.current;
  const arm = () => act(() => api().arm());
  return { hook, api, arm, onHeldChange, onAction, onArmedChange };
}

function key(type: "keydown" | "keyup", code: string, repeat = false): KeyboardEvent {
  const ev = new KeyboardEvent(type, { code, repeat, cancelable: true, bubbles: true });
  act(() => {
    window.dispatchEvent(ev);
  });
  return ev;
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => (hidden ? "hidden" : "visible"),
  });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

afterEach(() => setHiddenReset());
function setHiddenReset() {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "visible",
  });
}

describe("useKeyCapture", () => {
  it("ignores auto-repeat keydown", () => {
    const { api, arm, onHeldChange } = setup();
    arm();
    key("keydown", "KeyW");
    expect(onHeldChange).toHaveBeenCalledTimes(1);
    key("keydown", "KeyW", true); // OS auto-repeat
    key("keydown", "KeyW", true);
    expect(onHeldChange).toHaveBeenCalledTimes(1);
    expect([...api().heldRef.current!]).toEqual(["KeyW"]);
  });

  it("preventDefaults bound codes, not unbound ones", () => {
    const { arm } = setup();
    arm();
    expect(key("keydown", "KeyW").defaultPrevented).toBe(true);
    expect(key("keydown", "Tab").defaultPrevented).toBe(true);
    expect(key("keydown", "ArrowLeft").defaultPrevented).toBe(true); // rail always bound
    expect(key("keydown", "KeyP").defaultPrevented).toBe(false); // unbound → browser default
    expect(key("keyup", "KeyW").defaultPrevented).toBe(true);
    expect(key("keyup", "KeyP").defaultPrevented).toBe(false);
  });

  it("does nothing while disarmed", () => {
    const { onHeldChange, onAction } = setup();
    expect(key("keydown", "KeyW").defaultPrevented).toBe(false);
    expect(onHeldChange).not.toHaveBeenCalled();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("Tab → switch_arm exactly once per press, never in the held set", () => {
    const { api, arm, onAction } = setup();
    arm();
    key("keydown", "Tab");
    key("keydown", "Tab", true); // repeat filtered
    key("keyup", "Tab"); // discrete keyup is a no-op
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith("switch_arm");
    expect(api().heldRef.current!.has("Tab")).toBe(false);
  });

  it("Space → takeover_toggle once per physical press", () => {
    const { api, arm, onAction } = setup();
    arm();
    key("keydown", "Space");
    key("keyup", "Space");
    key("keydown", "Space");
    key("keyup", "Space");
    expect(onAction).toHaveBeenCalledTimes(2);
    expect(onAction).toHaveBeenNthCalledWith(2, "takeover_toggle");
    expect(api().heldRef.current!.has("Space")).toBe(false);
  });

  it("blur clears held, fires an empty-set transition, and disarms", () => {
    const { api, arm, onHeldChange, onArmedChange } = setup();
    arm();
    key("keydown", "KeyW");
    onHeldChange.mockClear();
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(api().heldRef.current!.size).toBe(0);
    expect(onHeldChange).toHaveBeenCalledTimes(1); // the empty-set send
    expect(onArmedChange).toHaveBeenLastCalledWith(false);
    expect(api().armed).toBe(false);
  });

  it("hidden visibilitychange releases all and disarms", () => {
    const { api, arm, onHeldChange, onArmedChange } = setup();
    arm();
    key("keydown", "KeyW");
    key("keydown", "KeyA");
    onHeldChange.mockClear();
    setHidden(true);
    expect(api().heldRef.current!.size).toBe(0);
    expect(onHeldChange).toHaveBeenCalledTimes(1);
    expect(onArmedChange).toHaveBeenLastCalledWith(false);
  });

  it("Escape releases all and disarms", () => {
    const { api, arm, onHeldChange, onArmedChange } = setup();
    arm();
    key("keydown", "KeyW");
    onHeldChange.mockClear();
    key("keydown", "Escape");
    expect(api().heldRef.current!.size).toBe(0);
    expect(onHeldChange).toHaveBeenCalledTimes(1);
    expect(onArmedChange).toHaveBeenLastCalledWith(false);
    expect(api().armed).toBe(false);
  });

  it("unmount removes listeners and releases", () => {
    const { hook, arm, onHeldChange, onAction, onArmedChange } = setup();
    arm();
    key("keydown", "KeyW");
    onHeldChange.mockClear();
    hook.unmount();
    expect(onArmedChange).toHaveBeenLastCalledWith(false);
    expect(onHeldChange).toHaveBeenCalledTimes(1); // release-all on unmount
    onHeldChange.mockClear();
    onAction.mockClear();
    key("keydown", "KeyW");
    key("keydown", "Tab");
    expect(onHeldChange).not.toHaveBeenCalled();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("stays inert with null bindings", () => {
    const onArmedChange = vi.fn();
    const hook = renderHook(() =>
      useKeyCapture({
        bindings: null,
        onHeldChange: vi.fn(),
        onAction: vi.fn(),
        onArmedChange,
      }),
    );
    act(() => hook.result.current.arm());
    expect(hook.result.current.armed).toBe(false);
    expect(onArmedChange).not.toHaveBeenCalled();
  });
});
