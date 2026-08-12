/**
 * Shared helpers for locating, decorating and focusing readiness-counted fields
 * inside the property editing surfaces.
 *
 * Presentation only: the classes are defined in src/index.css
 * (.pf-req-mandatory / .pf-req-recommended / .pf-req-satisfied / .pf-req-pulse).
 */

import type { RequirementStatus } from "@/config/propertyFieldRequirements";

export const REQ_ATTR = "data-req-field";

const CLASSES = [
  "pf-req-field",
  "pf-req-mandatory",
  "pf-req-recommended",
  "pf-req-satisfied",
  "pf-req-pulse",
] as const;

const isVisible = (el: HTMLElement): boolean =>
  !!(el.offsetParent || el.getClientRects().length) &&
  getComputedStyle(el).visibility !== "hidden";

/**
 * Resolve the element a requirement points at, within an optional root.
 * Visible matches win over hidden ones, so a duplicated id (e.g. `#name`
 * present in two tabs) never sends the user to an invisible control.
 */
export function resolveRequirementElement(
  targets: string[],
  root: ParentNode = document,
): HTMLElement | null {
  let hiddenFallback: HTMLElement | null = null;
  for (const selector of targets) {
    try {
      const matches = Array.from(root.querySelectorAll<HTMLElement>(selector));
      for (const el of matches) {
        if (isVisible(el)) return el;
        hiddenFallback ??= el;
      }
    } catch {
      /* invalid selector — skip */
    }
  }
  return hiddenFallback;
}

/** Registry selectors per requirement key, published by the decorator. */
const targetIndex = new Map<string, string[]>();

/**
 * The element that should carry the border. For a Radix select trigger or an
 * input we mark the control itself; for a wrapper (data-field on a div) we mark
 * the wrapper.
 */
function markTarget(el: HTMLElement): HTMLElement {
  return el;
}

/**
 * Expand any collapsed ancestor (accordion item, collapsible, closed details)
 * so a hidden target can actually be shown.
 */
function revealAncestors(el: HTMLElement): void {
  let node: HTMLElement | null = el;
  while (node && node !== document.body) {
    const details = node.closest("details");
    if (details && !details.open) details.open = true;
    if (node.getAttribute("data-state") === "closed") {
      const id = node.getAttribute("id");
      const trigger =
        (id && document.querySelector<HTMLElement>(`[aria-controls="${id}"]`)) ||
        node.previousElementSibling?.querySelector<HTMLElement>("button") ||
        (node.previousElementSibling as HTMLElement | null);
      if (trigger && typeof trigger.click === "function") trigger.click();
    }
    node = node.parentElement;
  }
}


/** Remove every requirement class/attribute inside root. */
export function clearRequirementDecoration(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>(`[${REQ_ATTR}]`).forEach((el) => {
    el.classList.remove(...CLASSES);
    el.removeAttribute(REQ_ATTR);
    el.removeAttribute("data-req-tier");
    el.removeAttribute("data-req-satisfied");
  });
}

/** Paint pink/blue borders for the given statuses inside root. */
export function decorateRequirements(statuses: RequirementStatus[], root: ParentNode = document) {
  const seen = new Set<HTMLElement>();

  for (const status of statuses) {
    // Remember the selectors so "Show me" can find the field even when it is
    // not decorated yet (tab still painting, or block collapsed).
    targetIndex.set(status.key, status.target);
    const found = resolveRequirementElement(status.target, root);
    if (!found) continue;
    const el = markTarget(found);
    if (seen.has(el)) continue;
    seen.add(el);

    el.setAttribute(REQ_ATTR, status.key);
    el.setAttribute("data-req-tier", status.tier);
    el.setAttribute("data-req-satisfied", status.satisfied ? "1" : "0");
    el.classList.add("pf-req-field");
    el.classList.toggle("pf-req-mandatory", status.tier === "mandatory");
    el.classList.toggle("pf-req-recommended", status.tier === "recommended");
    el.classList.toggle("pf-req-satisfied", status.satisfied);
  }

  // Drop decoration from elements that are no longer part of the active set.
  root.querySelectorAll<HTMLElement>(`[${REQ_ATTR}]`).forEach((el) => {
    if (!seen.has(el)) {
      el.classList.remove(...CLASSES);
      el.removeAttribute(REQ_ATTR);
      el.removeAttribute("data-req-tier");
      el.removeAttribute("data-req-satisfied");
    }
  });
}

/**
 * Scroll a requirement field into view and pulse its border so it is
 * impossible to miss. Retries briefly while the tab paints, then falls back to
 * the registry selectors (and finally to any visible ancestor) so "Show me"
 * always lands somewhere useful.
 */
export function focusRequirementField(key: string, attempt = 0): void {
  let el = document.querySelector<HTMLElement>(`[${REQ_ATTR}="${key}"]`);

  if (!el) {
    const targets = targetIndex.get(key);
    if (targets) el = resolveRequirementElement(targets);
  }

  if (!el) {
    if (attempt < 12) {
      window.setTimeout(() => focusRequirementField(key, attempt + 1), 250);
    }
    return;
  }

  if (!isVisible(el)) {
    revealAncestors(el);
    if (!isVisible(el) && attempt < 8) {
      window.setTimeout(() => focusRequirementField(key, attempt + 1), 250);
      return;
    }
  }

  // If the exact control is still hidden, pulse the nearest visible ancestor.
  let paint: HTMLElement = el;
  while (!isVisible(paint) && paint.parentElement) paint = paint.parentElement;

  if (!paint.classList.contains("pf-req-field")) paint.classList.add("pf-req-field");
  paint.scrollIntoView({ behavior: "smooth", block: "center" });
  paint.classList.remove("pf-req-pulse");
  // Force a reflow so re-adding the class restarts the animation.
  void paint.offsetWidth;
  paint.classList.add("pf-req-pulse");
  window.setTimeout(() => paint.classList.remove("pf-req-pulse"), 2400);

  const focusable = el.matches("input, textarea, select, button")
    ? el
    : el.querySelector<HTMLElement>("input, textarea, select, button, [tabindex]");
  if (focusable && isVisible(focusable)) focusable.focus({ preventScroll: true });
}

/**
 * Same behaviour as `focusRequirementField`, but for controls that are not in the
 * requirement registry: pass the selector(s) directly. Used by cards that own
 * their own mandatory set (e.g. Company Information) so their "outstanding"
 * lines can walk the owner to the exact input.
 */
export function focusFieldTargets(targets: string[], attempt = 0): void {
  const el = resolveRequirementElement(targets);
  if (!el) {
    if (attempt < 12) window.setTimeout(() => focusFieldTargets(targets, attempt + 1), 250);
    return;
  }

  if (!isVisible(el)) {
    revealAncestors(el);
    if (!isVisible(el) && attempt < 8) {
      window.setTimeout(() => focusFieldTargets(targets, attempt + 1), 250);
      return;
    }
  }

  let paint: HTMLElement = el;
  while (!isVisible(paint) && paint.parentElement) paint = paint.parentElement;

  paint.classList.add("pf-req-field", "pf-req-mandatory");
  paint.scrollIntoView({ behavior: "smooth", block: "center" });
  paint.classList.remove("pf-req-pulse");
  void paint.offsetWidth;
  paint.classList.add("pf-req-pulse");
  window.setTimeout(() => paint.classList.remove("pf-req-pulse"), 2400);

  const focusable = el.matches("input, textarea, select, button")
    ? el
    : el.querySelector<HTMLElement>("input, textarea, select, button, [tabindex]");
  if (focusable && isVisible(focusable)) focusable.focus({ preventScroll: true });
}

/**
 * Focus a room/unit card by its name. Channel content failures are reported per
 * unit ("SEESTER: Description is 444 characters"), so the wizard needs to land
 * on that exact chalet type instead of the top of the Rooms tab.
 *
 * Matching is case-insensitive and falls back to a heading text scan, because
 * PMS-synced units render their name in a card header rather than an input.
 */
export function focusUnitCard(unitName: string, attempt = 0): void {
  const needle = unitName.trim().toLowerCase();
  if (!needle) return;

  let el =
    document.querySelector<HTMLElement>(`[data-room-name="${CSS.escape(unitName.trim())}"]`) ?? null;

  if (!el) {
    const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-room-name]"));
    el = cards.find((c) => (c.dataset.roomName ?? "").trim().toLowerCase() === needle) ?? null;
  }

  if (!el) {
    // Heading scan: any element whose own text is the unit name.
    const headings = Array.from(
      document.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, p, span, div"),
    );
    const hit = headings.find(
      (h) => h.children.length === 0 && (h.textContent ?? "").trim().toLowerCase() === needle,
    );
    if (hit) el = (hit.closest<HTMLElement>("[data-room-card], .rounded-lg, .rounded-md") ?? hit);
  }

  if (!el) {
    if (attempt < 12) window.setTimeout(() => focusUnitCard(unitName, attempt + 1), 250);
    return;
  }

  if (!isVisible(el)) {
    revealAncestors(el);
    if (!isVisible(el) && attempt < 8) {
      window.setTimeout(() => focusUnitCard(unitName, attempt + 1), 250);
      return;
    }
  }

  let paint: HTMLElement = el;
  while (!isVisible(paint) && paint.parentElement) paint = paint.parentElement;

  paint.classList.add("pf-req-field", "pf-req-mandatory");
  paint.scrollIntoView({ behavior: "smooth", block: "center" });
  paint.classList.remove("pf-req-pulse");
  void paint.offsetWidth;
  paint.classList.add("pf-req-pulse");
  window.setTimeout(() => {
    paint.classList.remove("pf-req-pulse", "pf-req-mandatory");
  }, 2400);
}



