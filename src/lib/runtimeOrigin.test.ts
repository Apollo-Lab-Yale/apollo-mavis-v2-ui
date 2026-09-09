import { describe, expect, it } from "vitest";
import { copyText } from "./clipboard";
import { currentRuntimeOrigin, injectedProxyTarget, runtimeOrigin } from "./runtimeOrigin";

const loc = { protocol: "http:", hostname: "192.168.0.88", origin: "http://192.168.0.88:5173" };

describe("runtimeOrigin", () => {
  it("production: the page origin IS the runtime (same origin), no note", () => {
    expect(runtimeOrigin(loc, null)).toEqual({ origin: "http://192.168.0.88:5173", note: null });
  });
  it("dev proxy: the proxy target's port on the page's hostname, with a note", () => {
    const r = runtimeOrigin(loc, "http://localhost:8765");
    expect(r.origin).toBe("http://192.168.0.88:8765");
    expect(r.note).toContain("http://localhost:8765");
    // a target without an explicit port → no port (the scheme's default)
    expect(runtimeOrigin(loc, "http://10.0.0.5").origin).toBe("http://192.168.0.88");
    // an unparsable target degrades to the page origin
    expect(runtimeOrigin(loc, "not a url").origin).toBe(loc.origin);
  });
  it("nothing is injected under vitest (as in a production build): the page origin, no note", () => {
    expect(injectedProxyTarget()).toBeNull();
    expect(currentRuntimeOrigin()).toEqual({ origin: window.location.origin, note: null });
  });
});

describe("copyText", () => {
  it("prefers navigator.clipboard, falls back to a textarea + execCommand", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    expect(await copyText("abc")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("abc");
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    const exec = vi.fn(() => true);
    (document as unknown as { execCommand: unknown }).execCommand = exec;
    expect(await copyText("def")).toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull(); // cleaned up
    (document as unknown as { execCommand: unknown }).execCommand = vi.fn(() => false);
    expect(await copyText("ghi")).toBe(false);
  });
});
