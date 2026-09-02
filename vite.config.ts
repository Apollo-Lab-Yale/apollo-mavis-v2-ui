import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const runtime = process.env.APOLLO_RUNTIME_URL ?? "http://localhost:8765";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": { target: runtime },
      "/ws": { target: runtime, ws: true },
      "/video": { target: runtime },
    },
  },
});
