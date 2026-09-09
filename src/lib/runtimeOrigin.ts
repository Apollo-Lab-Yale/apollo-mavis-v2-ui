/** Where the RUNTIME's REST server is, as a URL origin, for copy that leaves the
 * browser (the Online DAgger skill-install one-liner, 15-online-dagger §8).
 *
 * In production the runtime serves the SPA, so the page origin IS the runtime.
 * Under the Vite dev server the runtime sits behind the `/api` proxy
 * (`vite.config.ts`: `APOLLO_RUNTIME_URL ?? http://localhost:8765`), so the page
 * origin would point a `curl` at Vite, not at the runtime. The DEV SERVER injects
 * the proxy target as `__APOLLO_RUNTIME_PROXY__` (a production build defines it as
 * `undefined`, so the whole dev branch below — note text included — is dead code
 * there; `scripts/check-dist.ts` asserts it); its PORT is taken with the page's own
 * hostname (a policy repo on another machine needs the runtime's LAN address, not
 * `localhost`), and the note says so. Nothing here is hard-coded: the port comes
 * from the proxy target the operator configured. */
export interface RuntimeOrigin {
  origin: string;
  /** Present only when the address was derived from the dev proxy. */
  note: string | null;
}

export interface LocationLike {
  protocol: string;
  hostname: string;
  origin: string;
}

export function runtimeOrigin(loc: LocationLike, proxyTarget: string | null): RuntimeOrigin {
  if (!proxyTarget) return { origin: loc.origin, note: null };
  let port = "";
  let protocol = loc.protocol;
  try {
    const url = new URL(proxyTarget);
    port = url.port;
    protocol = url.protocol || protocol;
  } catch {
    return { origin: loc.origin, note: null };
  }
  const origin = `${protocol}//${loc.hostname}${port ? `:${port}` : ""}`;
  return {
    origin,
    note: `Dev server: /api is proxied to ${proxyTarget} — the address above uses that port on this host.`,
  };
}

/** The dev-proxy target the dev server injected, or null (production / tests). */
export function injectedProxyTarget(): string | null {
  return typeof __APOLLO_RUNTIME_PROXY__ === "string" ? __APOLLO_RUNTIME_PROXY__ : null;
}

/** The runtime origin of THIS page. The `typeof` test is on the build-time constant
 * itself (not through `injectedProxyTarget`) so a production build folds the dev
 * branch away and the bundler drops `runtimeOrigin` with it. */
export function currentRuntimeOrigin(): RuntimeOrigin {
  if (typeof __APOLLO_RUNTIME_PROXY__ === "string")
    return runtimeOrigin(window.location, __APOLLO_RUNTIME_PROXY__);
  return { origin: window.location.origin, note: null };
}
