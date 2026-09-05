/** REST client (05-ui §4): `postArmMaintenance` URL / body / error mapping. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeMaintenanceResult } from "../../tests/mocks/fixtures";
import { ApiError, postArmMaintenance } from "./rest";

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
