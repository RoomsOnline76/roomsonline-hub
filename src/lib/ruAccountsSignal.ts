/**
 * Channel account readiness (keys stored / verified / bind changes) is rendered in two
 * places at once: the RU Accounts tab and the Channel Monitor status strip. The strip
 * loads its own lightweight snapshot, so it needs a nudge whenever the accounts tab
 * mutates a key pair — otherwise the banner keeps showing the pre-bind state.
 */
export const RU_ACCOUNTS_CHANGED_EVENT = "ru:accounts-changed";

export function notifyRuAccountsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(RU_ACCOUNTS_CHANGED_EVENT));
}

export function onRuAccountsChanged(handler: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(RU_ACCOUNTS_CHANGED_EVENT, handler);
  return () => window.removeEventListener(RU_ACCOUNTS_CHANGED_EVENT, handler);
}
