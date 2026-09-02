import { afterEach, describe, expect, it } from "vitest";
import {
  anyArmed,
  heldUnion,
  registerHeldSource,
  resetClients,
  setArmedSource,
  setHeldSource,
} from "./clients";

afterEach(() => resetClients());

describe("held-source union (13-tracker §5)", () => {
  it("is empty with no sources", () => {
    expect([...heldUnion()]).toEqual([]);
  });

  it("setHeldSource keeps the legacy single keyboard slot semantics", () => {
    setHeldSource(() => new Set(["KeyW"]));
    expect([...heldUnion()]).toEqual(["KeyW"]);
    setHeldSource(() => new Set(["KeyA"])); // replaces, never accumulates
    expect([...heldUnion()]).toEqual(["KeyA"]);
    setHeldSource(() => new Set());
    expect(heldUnion().size).toBe(0);
  });

  it("unions keyboard + gamepad sources and dedupes shared codes", () => {
    const kb = new Set(["KeyW", "KeyH"]);
    const gp = new Set(["KeyH", "ArrowLeft"]);
    setHeldSource(() => kb);
    const unregister = registerHeldSource("gamepad", () => gp);
    expect([...heldUnion()].sort()).toEqual(["ArrowLeft", "KeyH", "KeyW"]);
    kb.delete("KeyH");
    expect([...heldUnion()].sort()).toEqual(["ArrowLeft", "KeyH", "KeyW"]); // still held by gamepad
    gp.clear();
    expect([...heldUnion()].sort()).toEqual(["KeyW"]);
    unregister();
    gp.add("KeyC");
    expect([...heldUnion()].sort()).toEqual(["KeyW"]); // unregistered source ignored
  });

  it("unregister is a no-op if the slot was replaced meanwhile", () => {
    const first = registerHeldSource("gamepad", () => new Set(["KeyC"]));
    registerHeldSource("gamepad", () => new Set(["KeyZ"]));
    first(); // stale unregister must not drop the replacement
    expect([...heldUnion()]).toEqual(["KeyZ"]);
  });
});

describe("armed-source union", () => {
  it("stays armed while any source is armed", () => {
    expect(anyArmed()).toBe(false);
    setArmedSource("keyboard", true);
    setArmedSource("gamepad", true);
    setArmedSource("keyboard", false);
    expect(anyArmed()).toBe(true);
    setArmedSource("gamepad", false);
    expect(anyArmed()).toBe(false);
  });
});
