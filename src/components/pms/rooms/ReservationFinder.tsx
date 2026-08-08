import { useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { Search, X, Users, BedDouble } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { paxLabel, stayNights, type PlanRoom, type RoomsBooking } from "./roomTypePlanLayout";
import { displayBookingReference, matchesReferenceSearch } from "@/lib/bookingReference";


interface Props {
  bookings: RoomsBooking[];
  rooms: PlanRoom[];
  propertyNames: Map<string, string>;
  onSelectBooking: (booking: RoomsBooking) => void;
}

/**
 * One-field reservation finder: matches guest name, contact, reference, room and
 * room type, and opens the booking in a single click.
 */
export function ReservationFinder({ bookings, rooms, propertyNames, onSelectBooking }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // "/" focuses the finder from anywhere on the page; Esc clears it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if (event.key === "/" && !typing) {
        event.preventDefault();
        inputRef.current?.focus();
      }
      if (event.key === "Escape" && document.activeElement === inputRef.current) {
        setQuery("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const roomLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const room of rooms) {
      map.set(room.id, room.room_name ? `${room.room_number} · ${room.room_name}` : room.room_number);
    }
    return map;
  }, [rooms]);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (term.length < 2) return [];
    return bookings
      .filter((booking) => {
        const roomLabels = (booking.rolos_room_ids || []).map((id) => roomLabelById.get(id) || "").join(" ");
        // ROL reference matches on partial input too ("00142", "jon-003", "rol-wl").
        if (matchesReferenceSearch(booking.rol_reference, term)) return true;
        const haystack = [
          booking.guest_name,
          booking.guest_email,
          booking.guest_phone,
          booking.rol_reference,
          booking.external_reservation_id,
          roomLabels,
          propertyNames.get(booking.property_id) || "",
          booking.check_in_date,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(term);

      })
      .sort((a, b) => a.check_in_date.localeCompare(b.check_in_date))
      .slice(0, 25);
  }, [bookings, query, roomLabelById, propertyNames]);

  const showEmpty = query.trim().length >= 2 && results.length === 0;

  return (
    <div className="space-y-2">
      <div className="relative w-full sm:max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a reservation — guest, room, reference…"
          className="h-9 pl-8 pr-8 text-sm"
        />
        {query && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
            onClick={() => setQuery("")}
            aria-label="Clear search"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
        {!query && (
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 hidden sm:block rounded border border-border px-1 text-[10px] text-muted-foreground">
            /
          </kbd>
        )}
      </div>

      {showEmpty && (
        <p className="text-xs text-muted-foreground">
          No reservation matches “{query.trim()}” in the loaded window. Move the plan forward to search later dates.
        </p>
      )}

      {results.length > 0 && (
        <div className="rounded-lg border border-border divide-y divide-border max-h-72 overflow-y-auto">
          {results.map((booking) => {
            const roomLabel = (booking.rolos_room_ids || [])
              .map((id) => roomLabelById.get(id))
              .filter(Boolean)
              .join(", ");
            return (
              <button
                key={booking.id}
                type="button"
                onClick={() => onSelectBooking(booking)}
                className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{booking.guest_name}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{displayBookingReference(booking)}</span>
                  <Badge variant="secondary" className="text-[10px] capitalize">{booking.status.replace(/_/g, " ")}</Badge>
                  {booking.payment_status && (
                    <Badge variant="outline" className="text-[10px] capitalize">{booking.payment_status.replace(/_/g, " ")}</Badge>
                  )}
                  {propertyNames.size > 1 && (
                    <span className="text-[10px] text-muted-foreground">{propertyNames.get(booking.property_id)}</span>
                  )}
                </div>

                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span>
                    {format(parseISO(booking.check_in_date), "d MMM")} → {format(parseISO(booking.check_out_date), "d MMM yyyy")} ·{" "}
                    {stayNights(booking)} night{stayNights(booking) === 1 ? "" : "s"}
                  </span>
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />{paxLabel(booking)}</span>
                  {roomLabel && <span className="flex items-center gap-1"><BedDouble className="h-3 w-3" />{roomLabel}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
