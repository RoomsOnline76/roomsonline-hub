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

/** Resolve the element a requirement points at, within an optional root. */
export function resolveRequirementElement(
  targets: string[],
  root: ParentNode = document,
): HTMLElement | null {
  for (const selector of targets) {
    try {
      const el = root.querySelector<HTMLElement>(selector);
      if (el) return el;
    } catch {
      /* invalid selector — skip */
    }
  }
  return null;
}

/**
 * The element that should carry the border. For a Radix select trigger or an
 * input we mark the control itself; for a wrapper (data-field on a div) we mark
 * the wrapper.
 */
function markTarget(el: HTMLElement): HTMLElement {
  return el;
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
 * impossible to miss. Retries briefly while the tab paints.
 */
export function focusRequirementField(key: string, attempt = 0): void {
  const el = document.querySelector<HTMLElement>(`[${REQ_ATTR}="${key}"]`);
  if (!el) {
    if (attempt < 12) {
      window.setTimeout(() => focusRequirementField(key, attempt + 1), 250);
    }
    return;
  }

  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove("pf-req-pulse");
  // Force a reflow so re-adding the class restarts the animation.
  void el.offsetWidth;
  el.classList.add("pf-req-pulse");
  window.setTimeout(() => el.classList.remove("pf-req-pulse"), 2400);

  const focusable = el.matches("input, textarea, select, button")
    ? el
    : el.querySelector<HTMLElement>("input, textarea, select, button, [tabindex]");
  focusable?.focus({ preventScroll: true });
}
