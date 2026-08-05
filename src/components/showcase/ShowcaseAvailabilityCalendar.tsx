import { useEffect, useMemo, useState } from "react";
import { addDays, eachDayOfInterval, format } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { EmbedAvailabilityGrid } from "@/components/embed/EmbedAvailabilityGrid";

/**
 * NightsBridge-style availability calendar for the property & portfolio
 * showcase pages. Self-contained: resolves rooms, season rates, manual
 * blocks and PMS cache on its own, then renders the shared NB grid.
 * Collapsed by default behind a "View Calendar" toggle.
 */
interface ShowcaseAvailabilityCalendarProps {
  propertyId: string;
  /** `properties.amenities` blob (wizard rooms, seasons, season_rates, pms_rate_types). */
  amenities?: Record<string, any> | null;
  startDate?: string;
  brandColor?: string;
  fontColor?: string;
  currency?: string;
  visibleDays?: number;
  className?: string;
  /** Optional label override for the collapse toggle. */
  title?: string;
  onBook?: (roomId: string, roomName: string) => void;
}

type DayCell = { available_units: number | null; is_stop_sell: boolean };

const GRID_WINDOW_DAYS = 21;

function buildSeasonResolver(amenities: Record<string, any> | null | undefined) {
  const seasons = Array.isArray(amenities?.seasons) ? amenities!.seasons : [];
  const seasonRates = amenities?.season_rates || {};
  const wizardRooms = Array.isArray(amenities?.room_types) ? amenities!.room_types : [];

  const findSeasonForDate = (dateStr: string): string | null => {
    for (const season of seasons) {
      const periods = Array.isArray(season?.periods) ? season.periods : [];
      const allPeriods = periods.length > 0
        ? periods
        : [{ from: season?.from || season?.start_date || season?.startDate, to: season?.to || season?.end_date || season?.endDate }];
      for (const p of allPeriods) {
        const from = p?.from || p?.start_date || p?.startDate;
        const to = p?.to || p?.end_date || p?.endDate;
        if (from && to && dateStr >= from && dateStr <= to) return String(season.id);
      }
    }
    return null;
  };

  return (roomId: string, roomName: string, dateStr: string, fallbackRate: number | null): number | null => {
    const wizardRoom = wizardRooms.find((wr: any) =>
      String(wr?.id) === String(roomId) ||
      String(wr?.pmsRoomId || "") === String(roomId) ||
      String(wr?.name || "").trim().toLowerCase() === String(roomName || "").trim().toLowerCase()
    );
    if (!wizardRoom) return fallbackRate;

    const seasonId = findSeasonForDate(dateStr);
    if (!seasonId) return fallbackRate;

    const lookupKeys = [wizardRoom.id, wizardRoom.room_type_id, wizardRoom.pmsRoomId, roomId, roomName]
      .filter(Boolean)
      .map(String);
    const linkedRateTypeId = Array.isArray(wizardRoom.linkedRateTypes) ? wizardRoom.linkedRateTypes[0] : null;

    for (const lookupKey of lookupKeys) {
      const roomSeasonRates = seasonRates[lookupKey];
      if (!roomSeasonRates || typeof roomSeasonRates !== "object") continue;
      const preferredKey = linkedRateTypeId ? `${seasonId}-${linkedRateTypeId}` : null;
      if (preferredKey && roomSeasonRates[preferredKey]) {
        const amt = roomSeasonRates[preferredKey]?.roomAmount;
        if (amt != null && Number(amt) > 0) return Number(amt);
      }
      for (const key of Object.keys(roomSeasonRates)) {
        if (key.startsWith(`${seasonId}-`)) {
          const amt = roomSeasonRates[key]?.roomAmount;
          if (amt != null && Number(amt) > 0) return Number(amt);
        }
      }
    }
    return fallbackRate;
  };
}

export function ShowcaseAvailabilityCalendar({
  propertyId,
  amenities,
  startDate,
  brandColor = "#E91E8C",
  fontColor = "#FFFFFF",
  currency = "R",
  visibleDays = 10,
  className,
  title,
  onBook,
}: ShowcaseAvailabilityCalendarProps) {
  const [open, setOpen] = useState(false);
  const [blocks, setBlocks] = useState<Record<string, Record<string, DayCell>>>({});
  const [pmsCache, setPmsCache] = useState<Record<string, Record<string, { available_units: number; rate: number | null }>>>({});

  const start = startDate || format(new Date(), "yyyy-MM-dd");

  const wizardRooms = useMemo(() => {
    const rooms = Array.isArray(amenities?.room_types) ? amenities!.room_types : [];
    return rooms.filter((r: any) => r?.is_active !== false);
  }, [amenities]);

  // Load manual blocks + PMS cache once the panel is opened (keeps first paint fast)
  useEffect(() => {
    if (!open || !propertyId || wizardRooms.length === 0) return;
    let cancelled = false;

    const load = async () => {
      const from = start;
      const to = format(addDays(new Date(start), GRID_WINDOW_DAYS + 7), "yyyy-MM-dd");

      const [availRes, cacheRes] = await Promise.all([
        supabase
          .from("property_availability")
          .select("room_type, date, available_units, is_stop_sell")
          .eq("property_id", propertyId)
          .gte("date", from)
          .lte("date", to),
        supabase
          .from("pms_availability_cache")
          .select("external_room_type_id, date, available_units, rates")
          .eq("property_id", propertyId)
          .gte("date", from)
          .lte("date", to),
      ]);

      if (cancelled) return;

      const blockMap: Record<string, Record<string, DayCell>> = {};
      for (const row of availRes.data || []) {
        const key = row.room_type || "__property__";
        if (!blockMap[key]) blockMap[key] = {};
        blockMap[key][row.date] = { available_units: row.available_units, is_stop_sell: !!row.is_stop_sell };
      }
      setBlocks(blockMap);

      const cacheMap: Record<string, Record<string, { available_units: number; rate: number | null }>> = {};
      for (const row of cacheRes.data || []) {
        const id = String(row.external_room_type_id);
        if (!cacheMap[id]) cacheMap[id] = {};
        const ratesArr = row.rates as any[];
        const dayRate = Array.isArray(ratesArr) && ratesArr.length > 0 ? ratesArr[0]?.room_amount ?? null : null;
        cacheMap[id][row.date] = {
          available_units: row.available_units ?? 0,
          rate: dayRate != null ? Number(dayRate) : null,
        };
      }
      setPmsCache(cacheMap);
    };

    load();
    return () => { cancelled = true; };
  }, [open, propertyId, wizardRooms.length, start]);

  const resolveSeasonRate = useMemo(() => buildSeasonResolver(amenities), [amenities]);

  const gridRooms = useMemo(() => {
    if (wizardRooms.length === 0) return [];
    const dates = eachDayOfInterval({
      start: new Date(start),
      end: addDays(new Date(start), GRID_WINDOW_DAYS - 1),
    });
    const rateTypes = Array.isArray(amenities?.pms_rate_types) ? amenities!.pms_rate_types : [];

    return wizardRooms.map((room: any) => {
      const roomId = String(room.id || room.room_type_id || room.pmsRoomId || room.name);
      const roomName = room.name || "Room";
      const linkedRateTypeId = Array.isArray(room.linkedRateTypes) ? room.linkedRateTypes[0] : undefined;
      const linkedRateType = linkedRateTypeId
        ? rateTypes.find((rt: any) => String(rt?.id) === String(linkedRateTypeId))
        : null;
      const fallbackRate =
        linkedRateType?.baseRate != null
          ? Number(linkedRateType.baseRate)
          : room.baseRate != null
            ? Number(room.baseRate)
            : room.base_rate != null
              ? Number(room.base_rate)
              : room.daily_rate != null
                ? Number(room.daily_rate)
                : null;

      const roomBlocks = blocks[roomName] || blocks[roomId] || {};
      const propertyBlocks = blocks["__property__"] || {};
      const roomCache = pmsCache[roomId] || pmsCache[String(room.pmsRoomId || "")] || {};

      const ratesByDate: Record<string, number | null> = {};
      dates.forEach((d) => {
        const dateKey = format(d, "yyyy-MM-dd");
        const block = roomBlocks[dateKey] || propertyBlocks[dateKey];
        if (block && (block.is_stop_sell || block.available_units === 0)) {
          ratesByDate[dateKey] = null;
          return;
        }
        const cached = roomCache[dateKey];
        if (cached) {
          ratesByDate[dateKey] = cached.available_units <= 0
            ? null
            : cached.rate ?? resolveSeasonRate(roomId, roomName, dateKey, fallbackRate);
          return;
        }
        ratesByDate[dateKey] = resolveSeasonRate(roomId, roomName, dateKey, fallbackRate);
      });

      const childNote = room.allowChildren === false || room.allow_children === false
        ? "No children allowed."
        : room.child_min_age != null || room.childMinAge != null || room.child_max_age != null || room.childMaxAge != null
          ? `Children welcome (${room.child_min_age ?? room.childMinAge ?? 0}–${room.child_max_age ?? room.childMaxAge ?? 17} yrs).`
          : undefined;

      return {
        roomId,
        roomName,
        maxGuests: room.maxPeople ?? room.max_guests ?? room.maxGuests,
        maxAdults: room.max_adults ?? room.maxAdults ?? room.maxPeople ?? room.max_guests,
        beds: room.beds ?? room.number_of_beds,
        allowChildren: room.allowChildren ?? room.allow_children,
        childPolicyNote: childNote,
        mealPlan: linkedRateType?.name ?? undefined,
        ratesByDate,
      };
    });
  }, [wizardRooms, amenities, blocks, pmsCache, resolveSeasonRate, start]);

  if (wizardRooms.length === 0) return null;

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <CalendarDays className="h-4 w-4" style={{ color: brandColor }} />
          {title || "Availability & rates"}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen((v) => !v)}
          className="h-9 rounded-none text-[11px] font-bold uppercase tracking-wider"
          style={open
            ? { background: brandColor, borderColor: brandColor, color: fontColor }
            : { borderColor: "#e2e2e2", color: "#3d3d3d" }}
        >
          {open ? "Hide Calendar" : "View Calendar"}
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mt-3 border border-border bg-white"
          >
            <EmbedAvailabilityGrid
              rooms={gridRooms}
              startDate={start}
              visibleDays={visibleDays}
              brandColor={brandColor}
              fontColor={fontColor}
              currency={currency}
              onBook={onBook}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ShowcaseAvailabilityCalendar;
