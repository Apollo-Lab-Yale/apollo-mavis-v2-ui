/** Sets `document.title` for the mounted page (phase-11 §4). Compose the
 * string with `pageTitle()` from ./streams: Welcome → "APOLLO MAVIS V2",
 * mode pages → "APOLLO MAVIS V2 · Teleop" etc. */
import { useEffect } from "react";

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = title;
  }, [title]);
}
