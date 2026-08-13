import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { AlertTriangle, ArrowRight, ChevronDown, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { ClashBookingLike, ReallocationSuggestion, RoomClash } from "@/lib/roomClashes";

interface Props {
  clashes: RoomClash[];
  loading?: boolean;
  suggestFor: (booking: ClashBookingLike) => ReallocationSuggestion[];
  /** Open the reservation for editing/re-allocation. */
  onOpenBooking?: (booking: ClashBookingLike) => void;
  /** Jump to the room plan focused on the clashing nights. */
  onOpenRoomPlan?: (clash: RoomClash) => void;
  currency?: string;
  className?: string;
}

function money(value: number | null, currency: string): string {
  if (value == null) return "—";
  return `${currency} ${Math.round(value).toLocaleString()}`;
}

function range(start: string, end: string): string {
  return `${format(parseISO(start), "d MMM")} – ${format(parseISO(end), "d MMM")}`;
}

/**
 * Command Centre alert for nights sold beyond the unit count. Each clash lists the
 * competing stays and, for every stay, alternative room types that are free for the
 * whole period at the closest price point — so a re-allocation is one click away.
 */
export function OverbookingAlertCard({
  clashes,
  loading,
  suggestFor,
  onOpenBooking,
  onOpenRoomPlan,
  currency = "ZAR",
  className,
}: Props) {
  const [openKey, setOpenKey] = useState<string | null>(clashes[0]?.key ?? null);

  const affectedStays = useMemo(
    () => new Set(clashes.flatMap((clash) => clash.bookings.map((b) => b.id))).size,
    [clashes]
  );

  if (loading && clashes.length === 0) return null;

  if (clashes.length === 0) {
    return (
      <Card className={cn("border-border", className)}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            Double bookings
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 text-sm text-muted-foreground">
          No overbooked nights in the next six months.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("border-destructive", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          Double bookings
          <Badge variant="destructive" className="ml-1">
            {clashes.length} {clashes.length === 1 ? "clash" : "clashes"}
          </Badge>
          <span className="text-xs font-normal text-muted-foreground">
            {affectedStays} {affectedStays === 1 ? "reservation" : "reservations"} need re-allocation
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {clashes.map((clash) => (
          <Collapsible
            key={clash.key}
            open={openKey === clash.key}
            onOpenChange={(open) => setOpenKey(open ? clash.key : null)}
          >
            <div className="rounded-lg border border-destructive/60 bg-destructive/5">
              <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 p-3 text-left">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {clash.roomTypeName}
                    {clash.propertyName ? ` · ${clash.propertyName}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {range(clash.start, clash.end)} · {clash.peakDemand} stays on {clash.units}{" "}
                    {clash.units === 1 ? "unit" : "units"}
                  </p>
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                    openKey === clash.key && "rotate-180"
                  )}
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 border-t border-destructive/30 p-3">
                {clash.bookings.map((booking) => {
                  const suggestions = suggestFor(booking);
                  return (
                    <div key={booking.id} className="space-y-2 rounded-md bg-card p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {booking.guest_name || "Guest"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {range(booking.check_in_date, booking.check_out_date)} ·{" "}
                            {money(booking.total_price != null ? Number(booking.total_price) : null, currency)}
                          </p>
                        </div>
                        {onOpenBooking && (
                          <Button size="sm" variant="outline" onClick={() => onOpenBooking(booking)}>
                            Open reservation
                          </Button>
                        )}
                      </div>
                      <div className="space-y-1">
                        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <Sparkles className="h-3 w-3" /> Suggested re-allocation
                        </p>
                        {suggestions.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Nothing comparable is free for these nights — offer alternative dates or a portfolio sibling.
                          </p>
                        ) : (
                          <ul className="space-y-1">
                            {suggestions.map((s) => (
                              <li key={s.roomTypeId} className="flex flex-wrap items-center gap-2 text-xs">
                                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                <span className="font-medium text-foreground">{s.roomTypeName}</span>
                                <span className="text-muted-foreground">
                                  {s.freeUnits} free · {money(s.nightlyRate, currency)}/night
                                </span>
                                {s.rateDelta != null && s.rateDelta !== 0 && (
                                  <Badge variant="outline" className="text-[10px]">
                                    {s.rateDelta > 0 ? "+" : "−"}
                                    {money(Math.abs(s.rateDelta), currency)}
                                  </Badge>
                                )}
                                {!s.fitsParty && (
                                  <Badge variant="outline" className="text-[10px] text-destructive">
                                    sleeps {s.maxOccupancy}
                                  </Badge>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  );
                })}
                {onOpenRoomPlan && (
                  <Button size="sm" variant="ghost" className="w-full" onClick={() => onOpenRoomPlan(clash)}>
                    Show these nights on the room plan
                  </Button>
                )}
              </CollapsibleContent>
            </div>
          </Collapsible>
        ))}
      </CardContent>
    </Card>
  );
}

export default OverbookingAlertCard;
