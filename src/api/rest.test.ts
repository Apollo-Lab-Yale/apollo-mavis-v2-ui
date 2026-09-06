/** REST client (05-ui §4): `postArmMaintenance` URL / body / error mapping;
 * (phase-09c) the `dry_run` body key and the client deadline of `home_rail`;
 * (phase-09d) `getArmMaintenanceLast` — the asynchronous job's final result. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeMaintenanceResult } from "../../tests/mocks/fixtures";
import { ApiError, getArmMaintenanceLast, HOME_RAIL_TIMEOUT_MS, postArmMaintenance } from "./rest";

describe("postArmMaintenance", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs {op} to /api/hardware/arms/<id>/maintenance and returns the result", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(makeMaintenanceResult()), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await postArmMaintenance("view", "clear_errors");
    expect(r.ok).toBe(true);
    expect(r.after?.error_code).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("/api/hardware/arms/view/maintenance");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ op: "clear_errors" });
    expect((init?.headers as Record<string, string>)["content-type"]).toBe("application/json");
  });

  it("non-2xx throws ApiError carrying the server detail (409 / 404), statusText otherwise", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ detail: "no hardware session — use clear_errors" }), {
            status: 409,
          }),
      ),
    );
    await expect(postArmMaintenance("grip", "recover")).rejects.toMatchObject({
      name: "ApiError",
      status: 409,
      detail: "no hardware session — use clear_errors",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 404, statusText: "Not Found" })),
    );
    const err = await postArmMaintenance("nope", "clear_errors").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).detail).toBe("Not Found");
  });

  it("home_rail: dry_run travels only when given; timeoutMs attaches an AbortSignal; a timeout is ApiError 0", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(makeMaintenanceResult({ op: "home_rail" })), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await postArmMaintenance("grip", "home_rail", { dryRun: true });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      op: "home_rail",
      dry_run: true,
    });
    expect(fetchMock.mock.calls[0]?.[1]?.signal ?? null).toBeNull();
    await postArmMaintenance("grip", "home_rail", {
      dryRun: false,
      timeoutMs: HOME_RAIL_TIMEOUT_MS,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      op: "home_rail",
      dry_run: false,
    });
    expect(fetchMock.mock.calls[1]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(HOME_RAIL_TIMEOUT_MS).toBe(60_000);
    // The other ops keep the legacy `{op}` body.
    await postArmMaintenance("grip", "clear_errors");
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({ op: "clear_errors" });
    // fetch rejecting with the signal's TimeoutError → ApiError{status 0} with a readable detail.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("signal timed out", "TimeoutError");
      }),
    );
    await expect(
      postArmMaintenance("grip", "home_rail", { dryRun: false, timeoutMs: 60_000 }),
    ).rejects.toMatchObject({
      name: "ApiError",
      status: 0,
      detail: "no answer after 60 s — check the arm card's rail read-back",
    });
    // Other network errors pass through untouched.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(postArmMaintenance("grip", "clear_errors")).rejects.toThrow("Failed to fetch");
  });

  it("encodes the arm id", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(makeMaintenanceResult()), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await postArmMaintenance("a b/c", "apply_backstops");
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/hardware/arms/a%20b%2Fc/maintenance");
  });
});

describe("getArmMaintenanceLast (phase-09d)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("GETs /api/hardware/arms/<id>/maintenance/last and returns the stored result (202 body shape included)", async () => {
    const stored = makeMaintenanceResult({
      arm_id: "grip",
      op: "home_rail",
      status: "done",
      job_id: "job-7",
    });
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(stored), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await getArmMaintenanceLast("grip");
    expect(r).toEqual(stored);
    expect(r?.status).toBe("done");
    expect(r?.job_id).toBe("job-7");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("/api/hardware/arms/grip/maintenance/last");
    expect(init?.method).toBeUndefined(); // GET
    // An `accepted` snapshot (the job has not stored its final result yet) is returned as is.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify(
              makeMaintenanceResult({ op: "home_rail", status: "accepted", job_id: "job-7" }),
            ),
            { status: 200 },
          ),
      ),
    );
    expect((await getArmMaintenanceLast("grip"))?.status).toBe("accepted");
  });

  it("404 (no result stored / unknown arm) → null; other errors throw ApiError; encodes the id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ detail: "no result" }), { status: 404 })),
    );
    expect(await getArmMaintenanceLast("grip")).toBeNull();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ detail: "monitor off" }), { status: 409 })),
    );
    await expect(getArmMaintenanceLast("grip")).rejects.toMatchObject({
      name: "ApiError",
      status: 409,
      detail: "monitor off",
    });
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(makeMaintenanceResult()), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await getArmMaintenanceLast("a b/c");
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "/api/hardware/arms/a%20b%2Fc/maintenance/last",
    );
  });
});
