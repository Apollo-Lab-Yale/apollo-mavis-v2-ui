/** Copy text to the clipboard: `navigator.clipboard.writeText` when the page has
 * it (secure context), else the textarea + `execCommand("copy")` fallback (the
 * lab machine's UI is often reached over plain http on the LAN, where the async
 * clipboard API is absent). Resolves true when a copy path succeeded. */
export async function copyText(text: string): Promise<boolean> {
  const clip = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
  if (clip && typeof clip.writeText === "function") {
    try {
      await clip.writeText(text);
      return true;
    } catch {
      /* fall through to the textarea path */
    }
  }
  if (typeof document === "undefined") return false;
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "-1000px";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  ta.select();
  let ok = false;
  try {
    ok = typeof document.execCommand === "function" ? document.execCommand("copy") : false;
  } catch {
    ok = false;
  }
  ta.remove();
  active?.focus();
  return ok;
}
