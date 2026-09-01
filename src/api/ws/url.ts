/** Same-origin WS URL derivation (05-ui §1.1). */
export const wsUrl = (path: string): string =>
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${path}`;
