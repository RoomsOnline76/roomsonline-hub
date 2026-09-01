import { useCallback, useEffect, useMemo, useState } from "react";
import { Layers } from "lucide-react";

/** Minimal shape the deck needs from a rate plan. */
export interface DeckPlan {
  id: string;
  name: string;
  is_active?: boolean;
  is_primary_sell?: boolean | null;
}

/** Ghost layers drawn behind the front card, no matter how deep the deck is. */
const MAX_GHOSTS = 3;

/**
 * "Deck of cards" presentation for a property's rate plans: one card in front, the rest
 * peeking behind it, with a named tab per plan. Tabs can be multi-selected (Compare) so the
 * front card renders the comparison series inline.
 */
export function RatePlanDeck<T extends DeckPlan>({
  plans,
  renderCard,
}: {
  plans: T[];
  /** Renders the front card; `series` is the ordered comparison set (always includes the front plan). */
  renderCard: (frontPlan: T, series: T[]) => React.ReactNode;
}) {
  const [activeId, setActiveId] = useState<string>(() => plans[0]?.id ?? "");
  const [compareIds, setCompareIds] = useState<string[]>([]);

  // Keep the deck valid when plans are added, removed, or refetched.
  useEffect(() => {
    const ids = plans.map((p) => p.id);
    setActiveId((prev) => (prev && ids.includes(prev) ? prev : (ids[0] ?? "")));
    setCompareIds((prev) => prev.filter((id) => ids.includes(id)));
  }, [plans]);

  const frontPlan = useMemo(
    () => plans.find((p) => p.id === activeId) ?? plans[0],
    [plans, activeId],
  );

  const series = useMemo(() => {
    if (!frontPlan) return [];
    const ids = [frontPlan.id, ...compareIds.filter((id) => id !== frontPlan.id)];
    return ids.map((id) => plans.find((p) => p.id === id)).filter((p): p is T => Boolean(p));
  }, [frontPlan, compareIds, plans]);

  const toggleCompare = useCallback((id: string) => {
    setCompareIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const selectTab = useCallback(
    (id: string, additive: boolean) => {
      if (additive) {
        toggleCompare(id);
        return;
      }
      setActiveId(id);
    },
    [toggleCompare],
  );

  if (!frontPlan) return null;

  const ghosts = Math.min(MAX_GHOSTS, Math.max(0, plans.length - 1));

  return (
    <div className="space-y-2">
      {plans.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {plans.map((plan) => {
            const isFront = plan.id === frontPlan.id;
            const inCompare = compareIds.includes(plan.id) && !isFront;
            return (
              <div
                key={plan.id}
                className={`flex items-center gap-1 rounded-t-md border px-2 py-1 text-xs transition-colors ${
                  isFront
                    ? "border-border border-b-transparent bg-card font-medium text-foreground"
                    : inCompare
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "border-border/60 bg-muted/50 text-muted-foreground hover:bg-muted"
                }`}
              >
                <button
                  type="button"
                  onClick={(e) => selectTab(plan.id, e.metaKey || e.ctrlKey)}
                  title={`${plan.name} — click to bring to front, ${navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}-click to compare`}
                  className="max-w-[12rem] truncate"
                >
                  {plan.name}
                </button>
                {plan.is_primary_sell && (
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" title="Live rate" aria-hidden />
                )}
                {plan.is_active === false && (
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" title="Inactive" aria-hidden />
                )}
                {!isFront && (
                  <button
                    type="button"
                    onClick={() => toggleCompare(plan.id)}
                    title={inCompare ? "Remove from comparison" : "Compare with the front plan"}
                    className={`rounded p-0.5 ${inCompare ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <Layers className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
          {series.length > 1 && (
            <div className="ml-auto flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <span>Comparing:</span>
              {series.map((plan) => (
                <span
                  key={plan.id}
                  className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-foreground"
                >
                  {plan.name}
                  {plan.id !== frontPlan.id && (
                    <button
                      type="button"
                      onClick={() => toggleCompare(plan.id)}
                      title="Remove from comparison"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
              <button
                type="button"
                onClick={() => setCompareIds([])}
                className="rounded px-1 underline-offset-2 hover:underline"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}

      {/* Stack: ghost card edges behind the front card. */}
      <div className="relative" style={{ paddingBottom: ghosts * 6 }}>
        {Array.from({ length: ghosts }, (_, i) => {
          const depth = ghosts - i;
          return (
            <div
              key={depth}
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-full rounded-lg border bg-card"
              style={{
                transform: `translateY(${depth * 6}px) scale(${1 - depth * 0.012})`,
                opacity: 0.5 - depth * 0.1,
                zIndex: 0,
              }}
            />
          );
        })}
        <div className="relative z-10">{renderCard(frontPlan, series)}</div>
      </div>
    </div>
  );
}
