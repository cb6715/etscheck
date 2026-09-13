"use client";

// The wage bar lives in the app shell and stays mounted across navigation,
// so nothing tells it when another component on the same page changed wage
// data (a historical week logged, settings saved). Components that mutate
// wage data call notifyWageContextChanged() after the server action
// resolves; the wage bar listens and refetches.
export const WAGE_CONTEXT_CHANGED_EVENT = "wage-context-changed";

export function notifyWageContextChanged() {
  window.dispatchEvent(new Event(WAGE_CONTEXT_CHANGED_EVENT));
}
