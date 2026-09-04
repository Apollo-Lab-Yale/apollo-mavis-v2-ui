/** Registry of open modal `<dialog>` hosts (phase-11 §4 Sheet).
 *
 * `showModal()` makes everything outside the dialog's subtree inert — including
 * other top-layer elements such as a popover — so a toast stack rendered next
 * to the page cannot be clicked while a Sheet is up (the click lands on the
 * dialog and reads as a backdrop dismiss). Sheet registers its host while open;
 * Toasts subscribes and re-parents its stack under the topmost host so it stays
 * interactive. A plain module store (no React context: Sheets and Toasts live in
 * unrelated subtrees). */
import { useSyncExternalStore } from "react";

const hosts: HTMLElement[] = [];
const listeners = new Set<() => void>();

const emit = () => {
  for (const fn of listeners) fn();
};

/** Topmost open modal host, or `null` when no modal is open. */
export function getModalHost(): HTMLElement | null {
  return hosts[hosts.length - 1] ?? null;
}

export function registerModalHost(host: HTMLElement): void {
  if (hosts.includes(host)) return;
  hosts.push(host);
  emit();
}

export function unregisterModalHost(host: HTMLElement): void {
  const i = hosts.indexOf(host);
  if (i < 0) return;
  hosts.splice(i, 1);
  emit();
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export function useModalHost(): HTMLElement | null {
  return useSyncExternalStore(subscribe, getModalHost, () => null);
}

/** Test hook: forget every host (Sheets unmounted by a test harness never re-register). */
export function resetModalHosts(): void {
  if (hosts.length === 0) return;
  hosts.length = 0;
  emit();
}
