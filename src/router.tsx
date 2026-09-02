/** Hash routes + session guard (05-ui §3). */
import { createHashRouter, redirect } from "react-router-dom";
import { getSession } from "./api/rest";
import type { Mode } from "./lib/types";
import { useStore } from "./store";
import { Devices } from "./pages/Devices";
import { Landing } from "./pages/Landing";
import { Collect, Dagger, Inference, Teleop } from "./pages/modes";

/** Mode routes require an active session whose mode matches the route. */
export function makeSessionLoader(mode: Mode) {
  return async (): Promise<Response | null> => {
    let session = useStore.getState().session;
    if (!session) {
      try {
        session = await getSession();
      } catch {
        session = null;
      }
      if (session) useStore.getState().setSession(session);
    }
    if (!session || session.mode !== mode) return redirect("/");
    return null;
  };
}

export const router = createHashRouter([
  { path: "/", element: <Landing /> },
  { path: "/devices", element: <Devices /> }, // no session loader (13-tracker §5)
  { path: "/teleop", element: <Teleop />, loader: makeSessionLoader("teleop") },
  { path: "/collect", element: <Collect />, loader: makeSessionLoader("collect") },
  { path: "/dagger", element: <Dagger />, loader: makeSessionLoader("dagger") },
  { path: "/inference", element: <Inference />, loader: makeSessionLoader("inference") },
  { path: "*", loader: () => redirect("/") },
]);
