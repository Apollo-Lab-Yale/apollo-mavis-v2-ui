import react from "@vitejs/plugin-react";
import { defineConfig, type ProxyOptions } from "vite";

const runtime = process.env.APOLLO_RUNTIME_URL ?? "http://localhost:8765";

/** WebSocket proxy hardening (2026-09-05): when the runtime goes away (restart,
 * SIGKILL) http-proxy reports the upstream error but can leave the BROWSER side
 * of a proxied WebSocket half-open — the page then sees an OPEN socket that never
 * delivers a frame ("Connecting…" tiles, "Starting…" microphone) and its normal
 * onclose → reconnect path never runs. Destroy the client socket on any upstream
 * error so the browser gets a close event at once and redials (the clients also
 * self-heal after 10 s of silence, see 05-ui §5.1). */
const wsProxy: ProxyOptions = {
  target: runtime,
  ws: true,
  configure: (proxy) => {
    proxy.on("error", (err, _req, socketOrRes) => {
      console.warn(`[vite] ws proxy error: ${err.message} — closing the client side`);
      const s = socketOrRes as { destroy?: () => void; end?: () => void };
      try {
        if (typeof s.destroy === "function") s.destroy();
        else if (typeof s.end === "function") s.end();
      } catch {
        /* already gone */
      }
    });
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": { target: runtime },
      "/ws": wsProxy,
      "/video": { target: runtime },
    },
  },
});
