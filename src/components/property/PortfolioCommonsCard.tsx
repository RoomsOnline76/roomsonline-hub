import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, ArrowDownToLine, Check, ChevronDown, ChevronUp, Loader2, Share2, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  PORTFOLIO_COMMONS_GROUPS,
  backfillCommonsFromPortfolio,
  fetchCommonsState,
  describeUnknownError,
  setPortfolioAutoShare,
  shareCommonsToSiblings,
  type CommonsState,
} from "@/lib/portfolioCommons";

interface Props {
  propertyId?: string;
  /** Warn that unsaved edits are not included. */
  isDirty?: boolean;
}

/**
 * Portfolio Commons.
 *
 * A central store for the data that is the same on every property in a
 * portfolio (legal entity, banking, contacts, house rules, locale, RU
 * distribution defaults). Owners fill it once and share it, or pull it into a
 * new property to clear its mandatory / recommended readiness shortfalls.
 */
export function PortfolioCommonsCard({ propertyId, isDirty }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [state, setState] = useState<CommonsState | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<"share" | "pull" | "auto" | null>(null);
  const [selectedGroups, setSelectedGroups] = useState<Record<string, boolean>>(
    Object.fromEntries(PORTFOLIO_COMMONS_GROUPS.map((g) => [g.key, true])),
  );
  const [selectedTargets, setSelectedTargets] = useState<Record<string, boolean>>({});
  // Commons is a maintenance tool, not a daily task — it starts collapsed.
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    try {
      const next = await fetchCommonsState(propertyId);
      setState(next);
      setSelectedTargets(Object.fromEntries(next.siblings.map((s) => [s.id, true])));
    } catch (error) {
      console.error("Portfolio commons load failed:", error);
      toast({
        title: "Could not load portfolio commons",
        description: describeUnknownError(error, "Unknown error"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [propertyId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const groupKeys = useMemo(
    () => PORTFOLIO_COMMONS_GROUPS.filter((g) => selectedGroups[g.key]).map((g) => g.key),
    [selectedGroups],
  );
  const targetIds = useMemo(
    () => Object.entries(selectedTargets).filter(([, on]) => on).map(([id]) => id),
    [selectedTargets],
  );

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["property-readiness"] });
    void load();
  }, [queryClient, load]);

  const handleShare = useCallback(async () => {
    if (!propertyId) return;
    setBusy("share");
    try {
      const result = await shareCommonsToSiblings(propertyId, targetIds, groupKeys);
      toast({
        title: result.updatedProperties > 0 ? "Shared to portfolio" : "Nothing to share",
        description:
          result.updatedProperties > 0
            ? `${result.updatedProperties} propert${result.updatedProperties === 1 ? "y" : "ies"} updated (${result.updatedGroups.length} data set${result.updatedGroups.length === 1 ? "" : "s"}). Existing values were left untouched.`
            : "Siblings already hold this data, or there is nothing completed here to share.",
      });
      refresh();
    } catch (error) {
      toast({
        title: "Share failed",
        description: describeUnknownError(error, "Unknown error"),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }, [propertyId, targetIds, groupKeys, toast, refresh]);

  const handlePull = useCallback(async () => {
    if (!propertyId) return;
    setBusy("pull");
    try {
      const result = await backfillCommonsFromPortfolio(propertyId, groupKeys);
      toast({
        title: result.updatedGroups.length > 0 ? "Filled from portfolio" : "Nothing to fill",
        description:
          result.updatedGroups.length > 0
            ? `${result.updatedGroups.length} data set${result.updatedGroups.length === 1 ? "" : "s"} copied into this property's blank fields. Reload the editor to see the new values.`
            : "No blank fields could be filled from the portfolio.",
      });
      refresh();
    } catch (error) {
      toast({
        title: "Fill failed",
        description: describeUnknownError(error, "Unknown error"),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }, [propertyId, groupKeys, toast, refresh]);

  const handleAutoShare = useCallback(
    async (enabled: boolean) => {
      if (!state || busy) return;
      setBusy("auto");
      setState({ ...state, autoShare: enabled });
      try {
        await setPortfolioAutoShare(state.portfolioIds, enabled);
        toast({
          title: enabled ? "Auto-share on" : "Auto-share off",
          description: enabled
            ? "Common data now flows both ways across the portfolio each time a property is saved."
            : "Portfolio properties will no longer share common data automatically.",
        });
      } catch (error) {
        setState({ ...state, autoShare: !enabled });
        toast({
          title: "Could not change auto-share",
          description: describeUnknownError(error, "Unknown error"),
          variant: "destructive",
        });
      } finally {
        setBusy(null);
      }
    },
    [state, busy, toast],
  );

  if (!propertyId) return null;
  if (loading && !state) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking portfolio…
        </CardContent>
      </Card>
    );
  }
  if (!state || state.siblings.length === 0) return null;

  return (
    <Card data-field="portfolio_commons">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" />
              Portfolio Commons
            </CardTitle>
            <CardDescription>
              Data that is the same for every property in this portfolio. Fill it once, share it everywhere — it
              satisfies the same mandatory and recommended checks on each property.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="commons-auto-share" className="text-xs text-muted-foreground">
              Auto-share on save
            </Label>
            <Switch
              id="commons-auto-share"
              type="button"
              checked={state.autoShare}
              disabled={busy !== null}
              onCheckedChange={handleAutoShare}
              onClick={(event) => event.preventDefault()}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {expanded ? "Hide" : "Manage"}
            </Button>
          </div>
        </div>
      </CardHeader>
      {expanded && (
      <CardContent className="space-y-4">
        {isDirty && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <AlertCircle className="h-3.5 w-3.5" />
            Unsaved edits are not included — save the property first.
          </p>
        )}

        <div className="space-y-2">
          {state.coverage.map(({ group, hasHere, sourceSiblings, missingSiblings }) => (
            <div key={group.key} className="flex items-start gap-3 rounded-md border border-border p-3">
              <Checkbox
                id={`commons-${group.key}`}
                checked={!!selectedGroups[group.key]}
                onCheckedChange={(checked) =>
                  setSelectedGroups((prev) => ({ ...prev, [group.key]: checked === true }))
                }
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Label htmlFor={`commons-${group.key}`} className="cursor-pointer text-sm font-medium">
                    {group.label}
                  </Label>
                  <Badge variant={group.tier === "mandatory" ? "default" : "secondary"} className="text-[10px]">
                    {group.tier === "mandatory" ? "Mandatory" : "Nice to have"}
                  </Badge>
                  {hasHere ? (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Check className="h-3 w-3" /> on this property
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {sourceSiblings.length > 0
                        ? `available from ${sourceSiblings[0].name}`
                        : "not captured anywhere yet"}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{group.description}</p>
                {missingSiblings.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Missing on {missingSiblings.length} of {state.siblings.length} sibling
                    {state.siblings.length === 1 ? "" : "s"}: {missingSiblings.map((s) => s.name).join(", ")}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        <Separator />

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Share to these properties
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {state.siblings.map((sibling) => (
              <label key={sibling.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={!!selectedTargets[sibling.id]}
                  onCheckedChange={(checked) =>
                    setSelectedTargets((prev) => ({ ...prev, [sibling.id]: checked === true }))
                  }
                />
                <span className="truncate">{sibling.name}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={handleShare}
            disabled={busy !== null || groupKeys.length === 0 || targetIds.length === 0}
          >
            {busy === "share" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Share2 className="mr-2 h-4 w-4" />}
            Share to portfolio
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handlePull}
            disabled={busy !== null || groupKeys.length === 0}
          >
            {busy === "pull" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ArrowDownToLine className="mr-2 h-4 w-4" />
            )}
            Fill blanks from portfolio
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Both actions are blank-safe: a value already captured on a property is never overwritten.
        </p>
      </CardContent>
      )}
    </Card>
  );
}
