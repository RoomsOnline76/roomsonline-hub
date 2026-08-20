import { useEffect, type RefObject } from "react";

/**
 * Keeps every horizontal scroller that shares a group id in step: scrolling one
 * property's calendar moves all the other properties in the portfolio to the
 * same night, so the eye never has to re-find the date column.
 */
const groups = new Map<string, Set<HTMLElement>>();
let syncing = false;

export function useSyncedHorizontalScroll(
  ref: RefObject<HTMLElement>,
  groupId?: string | null
) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !groupId) return;

    let members = groups.get(groupId);
    if (!members) {
      members = new Set();
      groups.set(groupId, members);
    }
    members.add(el);

    // Adopt the group's current position so a late-mounting calendar lines up.
    for (const other of members) {
      if (other !== el && other.scrollLeft > 0) {
        el.scrollLeft = other.scrollLeft;
        break;
      }
    }

    const onScroll = () => {
      if (syncing) return;
      syncing = true;
      const left = el.scrollLeft;
      for (const other of groups.get(groupId) || []) {
        if (other !== el && other.scrollLeft !== left) other.scrollLeft = left;
      }
      // Release after the browser has applied the writes.
      requestAnimationFrame(() => {
        syncing = false;
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      const set = groups.get(groupId);
      set?.delete(el);
      if (set && set.size === 0) groups.delete(groupId);
    };
  }, [ref, groupId]);
}
