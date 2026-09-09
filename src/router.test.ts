import { afterEach, describe, expect, it, vi } from "vitest";
import { handleHello } from "./api/clients";
import { makeSessionLoader } from "./router";
import { useStore } from "./store";
import type { SessionInfo } from "./gen";

const session: SessionInfo = {
  session_id: "s1",
  epoch: "e1",
  mode: "teleop",
  arms: ["arm0"],
  streams: ["sim"],
  state: "running",
};

afterEach(() => {
  vi.unstubAllGlobals();
  useStore.getState().resetForEpochChange();
  useStore.setState({ toasts: [] });
});

describe("sessionLoader guard", () => {
  it("redirects to / when there is no session (404)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify({ detail: "no active session" }), { status: 404 }),
      ),
    );
    const res = await makeSessionLoader("teleop")();
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).headers.get("Location")).toBe("/");
  });

  it("redirects when the session mode mismatches the route", async () => {
    useStore.getState().setSession({ ...session, mode: "collect" });
    const res = await makeSessionLoader("teleop")();
    expect((res as Response).headers.get("Location")).toBe("/");
  });

  it("passes when the session mode matches", async () => {
    useStore.getState().setSession(session);
    expect(await makeSessionLoader("teleop")()).toBeNull();
  });

  it("gello (phase-15): the /gello loader passes for a gello session and redirects the others", async () => {
    useStore.getState().setSession({ ...session, mode: "gello", arms: ["grip", "view"] });
    expect(await makeSessionLoader("gello")()).toBeNull();
    const res = await makeSessionLoader("teleop")();
    expect((res as Response).headers.get("Location")).toBe("/");
  });

  it("adopts a live session found over REST", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(session), { status: 200 })),
    );
    expect(await makeSessionLoader("teleop")()).toBeNull();
    expect(useStore.getState().session?.session_id).toBe("s1");
  });
});

describe("handleHello epoch resync", () => {
  it("epoch mismatch resets the store, toasts, and navigates home", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 404 })),
    );
    useStore.getState().setSession(session);
    location.hash = "#/teleop";
    handleHello({ epoch: "DIFFERENT", role: "controller" });
    expect(useStore.getState().session).toBeNull();
    expect(useStore.getState().toasts.some((t) => t.text.includes("Runtime restarted"))).toBe(true);
    expect(location.hash).toBe("#/");
  });

  it("matching epoch keeps the session and records the role", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(session), { status: 200 })),
    );
    useStore.getState().setSession(session);
    handleHello({ epoch: "e1", role: "observer" });
    expect(useStore.getState().session).not.toBeNull();
    expect(useStore.getState().conn.role).toBe("observer");
  });
});
