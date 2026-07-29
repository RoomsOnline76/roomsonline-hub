import { useParams, useSearchParams } from "react-router-dom";
import { useEffect, useState, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays, differenceInCalendarDays, startOfDay, eachDayOfInterval } from "date-fns";
import { PoweredByRolOS } from "@/components/pms/PoweredByRolOS";
import { AnnouncementBanner } from "@/components/showcase/AnnouncementBanner";
import { SpecialsBanner } from "@/components/showcase/SpecialsBanner";
import { PackageCards } from "@/components/showcase/PackageCards";
import { EmbedDatePicker } from "@/components/embed/EmbedDatePicker";
import { EmbedAvailabilityGrid } from "@/components/embed/EmbedAvailabilityGrid";
import { EmbedTripAdvisorReviews } from "@/components/embed/EmbedTripAdvisorReviews";
import { EmbedReviewPlatforms } from "@/components/embed/EmbedReviewPlatforms";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { MapPin, Phone, Mail, Tag, ChevronDown, Users, BedDouble, Bath, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchLiveRates, type LivePropertyRates, type LiveRoomRate } from "@/lib/pmsLiveAvailability";
import { EmbedConciergeChat } from "@/components/embed/EmbedConciergeChat";
import { useItinerary } from "@/contexts/ItineraryContext";

// postMessage helper for iframe ↔ parent communication
function postToParent(data: Record<string, unknown>) {
  if (window.parent !== window) {
    window.parent.postMessage(data, "*");
  }
}

const normalizeImageUrls = (images: unknown): string[] => {
  if (!Array.isArray(images)) return [];
  return images
    .map((img: any) => {
      if (typeof img === "string") return img;
      return img?.url || img?.src || img?.image || img?.thumbnail || null;
    })
    .filter((url): url is string => typeof url === "string" && url.length > 0);
};

const normalizeRoomName = (name: unknown) =>
  String(name || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export default function EmbedProperty() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const integration = searchParams.get("integration") || "widget";
  const mode = searchParams.get("mode") || "widget";
  const brandColorParam = searchParams.get("brand_color");
  const propertyId = searchParams.get("property_id");
  const journeyMode = searchParams.get("journey_mode") === "true";
  const { addStay, stays } = useItinerary();

  // Enhanced white-label params from rol-embed.js
  const brandLogoParam = searchParams.get("brand_logo");
  const brandSecondaryParam = searchParams.get("brand_secondary_color");
  const brandFontParam = searchParams.get("brand_font_color");
  const layoutParam = searchParams.get("layout") || "standard";
  const isFullWhiteLabel = searchParams.get("wl") === "1";
  const hidePoweredBy = isFullWhiteLabel || searchParams.get("hide_powered_by") === "1";

  const [property, setProperty] = useState<any>(null);
  const [roomTypes, setRoomTypes] = useState<any[]>([]);
  const [ratePlanMap, setRatePlanMap] = useState<Record<string, { base_rate: number; pricing_model: string }>>({});
  const [pmsCacheMap, setPmsCacheMap] = useState<Record<string, Record<string, { available_units: number; rate: number | null }>>>({});
  const [loading, setLoading] = useState(true);
  const [showCalendar, setShowCalendar] = useState(true);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const today = startOfDay(new Date());
  const initialCheckIn = searchParams.get("checkIn") || searchParams.get("checkin") || format(today, "yyyy-MM-dd");
  const initialCheckOut = searchParams.get("checkOut") || searchParams.get("checkout") || format(addDays(today, 2), "yyyy-MM-dd");
  const [checkIn, setCheckIn] = useState<string>(initialCheckIn);
  const [checkOut, setCheckOut] = useState<string>(initialCheckOut);
  const [promoCode, setPromoCode] = useState("");
  const [showPromo, setShowPromo] = useState(false);
  const [datesConfirmed, setDatesConfirmed] = useState(!!(searchParams.get("checkIn") || searchParams.get("checkin")) && !!(searchParams.get("checkOut") || searchParams.get("checkout")));
  const dateControlsRef = useRef<HTMLDivElement>(null);
  const [datesPulse, setDatesPulse] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingRoom, setPendingRoom] = useState<{ roomId: string; roomName: string } | null>(null);

  // Resize observer — post height changes to parent
  useEffect(() => {
    if (window.parent === window) return;
    const observer = new ResizeObserver(() => {
      postToParent({ type: "rolos:resize", height: document.body.scrollHeight, slug });
    });
    observer.observe(document.body);
    return () => observer.disconnect();
  }, [slug]);

  // Listen for parent messages (setDates, setPromo)
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (!e.data || typeof e.data.type !== "string") return;
      if (e.data.type === "rolos:setDates") {
        if (e.data.checkIn) setCheckIn(e.data.checkIn);
        if (e.data.checkOut) setCheckOut(e.data.checkOut);
        setDatesConfirmed(true);
      }
      if (e.data.type === "rolos:setPromo" && e.data.code) {
        setPromoCode(e.data.code);
        setShowPromo(true);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (!slug) return;
      const { data: prop } = await supabase
        .from("properties")
        .select("id, name, slug, brand_primary_color, brand_secondary_color, brand_font_color, brand_logo_url, images, description, amenities, address, city, is_rol_property, external_system")
        .eq("slug", slug)
        .eq("is_active", true)
        .single();

      if (prop) {
        setProperty(prop);
        const { data: rooms } = await supabase
          .from("hostfully_room_types")
          .select("id, name, description, daily_rate, max_guests, beds, bedrooms, bathrooms, images, thumbnail_url, is_active, amenities, linked_rolos_id, hostfully_room_id")
          .eq("property_id", prop.id)
          .eq("is_active", true)
          .order("name");

        const wizardRooms = Array.isArray((prop as any)?.amenities?.room_types) ? (prop as any).amenities.room_types : [];
        const canonicalRoomNames = new Set((rooms || []).map((room: any) => normalizeRoomName(room.name)));

        const mergedRooms = (rooms || []).map((room: any) => {
          const wizardRoom = wizardRooms.find((wr: any) =>
            String(wr?.id) === String(room.id) ||
            String(wr?.id) === String(room.hostfully_room_id) ||
            String(wr?.pmsRoomId) === String(room.hostfully_room_id) ||
            String(wr?.pmsRoomId) === String(room.id) ||
            normalizeRoomName(wr?.name) === normalizeRoomName(room.name)
          );

          const dbImages = normalizeImageUrls(room.images);
          const wizardImages = normalizeImageUrls(wizardRoom?.images);
          const mergedImages = dbImages.length > 0 ? dbImages : wizardImages;
          const mergedThumbnail = room.thumbnail_url || wizardImages[0] || null;

          return {
            ...room,
            images: mergedImages,
            thumbnail_url: mergedThumbnail,
          };
        });

        const fallbackWizardRooms = wizardRooms
          .filter((wr: any) => wr?.is_active !== false)
          .filter((wr: any) => !canonicalRoomNames.has(normalizeRoomName(wr?.name)))
          .map((wr: any) => ({
            id: String(wr?.id || wr?.pmsRoomId || wr?.name),
            name: wr?.name || "Unnamed Room",
            description: wr?.description || "",
            daily_rate: wr?.baseRate || wr?.base_rate || null,
            max_guests: wr?.maxPeople || wr?.max_guests || 0,
            beds: Array.isArray(wr?.bedConfiguration) ? wr.bedConfiguration.length : null,
            bedrooms: null,
            bathrooms: wr?.bathrooms || null,
            images: normalizeImageUrls(wr?.images),
            thumbnail_url: normalizeImageUrls(wr?.images)[0] || null,
            is_active: true,
            amenities: wr?.amenities || [],
            linked_rolos_id: null,
            hostfully_room_id: wr?.pmsRoomId || null,
          }));

        const allVisibleRooms = [...mergedRooms, ...fallbackWizardRooms];

        const roomFilterId = searchParams.get("room");
        const filteredRooms = roomFilterId && allVisibleRooms
          ? allVisibleRooms.filter((r: any) => r.id === roomFilterId || r.hostfully_room_id === roomFilterId)
          : allVisibleRooms;
        setRoomTypes(filteredRooms || []);

        if (rooms && rooms.some((r: any) => !r.daily_rate && r.linked_rolos_id)) {
          const rolosIds = rooms.filter((r: any) => r.linked_rolos_id).map((r: any) => r.linked_rolos_id);
          const { data: rpRoomTypes } = await supabase
            .from("rolos_rate_plan_room_types")
            .select("room_type_id, rate_plan_id, rolos_rate_plans!inner(id, base_rate, pricing_model, is_active)")
            .in("room_type_id", rolosIds)
            .eq("rolos_rate_plans.is_active", true);

          if (rpRoomTypes) {
            const map: Record<string, any> = {};
            for (const entry of rpRoomTypes) {
              const plan = (entry as any).rolos_rate_plans;
              if (plan?.base_rate != null) {
                map[entry.room_type_id] = {
                  base_rate: Number(plan.base_rate),
                  pricing_model: plan.pricing_model || "per_unit",
                };
              }
            }
            setRatePlanMap(map);
          }
        }
      }
      setLoading(false);
    };
    fetchData();
  }, [slug]);

  useEffect(() => {
    if (propertyId) {
      supabase.from("integration_logs").insert({
        property_id: propertyId,
        integration_type: integration,
        event: "loaded",
        metadata: { source_url: document.referrer, user_agent: navigator.userAgent },
      });
    }
  }, [propertyId, integration]);

  // Canonical (non-WL) embed must always render ROL pink, never inherit the
  // property's brand from the DB. Only fall back to the property's brand when
  // an explicit brand_color is passed OR the frame is in full white-label mode.
  const ROL_PINK = "#E91E8C";
  const isWhiteLabelContext = isFullWhiteLabel || !!brandColorParam;
  const brandColor = brandColorParam
    ? decodeURIComponent(brandColorParam)
    : (isWhiteLabelContext ? (property?.brand_primary_color || ROL_PINK) : ROL_PINK);
  const requestedFontColor = brandFontParam
    ? decodeURIComponent(brandFontParam)
    : (isWhiteLabelContext ? (property?.brand_font_color || "#ffffff") : "#ffffff");
  // Readability guard: text sitting ON the brand bar must clear WCAG AA against it.
  const brandSurfaceText = surfaceForegroundPair(brandColor, requestedFontColor);
  const fontColor = brandSurfaceText.fg;
  const fontColorMuted = brandSurfaceText.muted;
  const logoUrl = brandLogoParam
    ? decodeURIComponent(brandLogoParam)
    : (isWhiteLabelContext ? property?.brand_logo_url : null);


  const nights = useMemo(() => {
    if (!checkIn || !checkOut) return 0;
    const diff = differenceInCalendarDays(new Date(checkOut), new Date(checkIn));
    return diff > 0 ? diff : 0;
  }, [checkIn, checkOut]);

  const [availabilityOverrides, setAvailabilityOverrides] = useState<Record<string, Record<string, { available_units: number | null; is_stop_sell: boolean }>>>({});

  useEffect(() => {
    if (!property?.id || roomTypes.length === 0) return;
    const fetchOverrides = async () => {
      const start = new Date(checkIn);
      const endDate = addDays(start, 30);
      const { data } = await supabase
        .from("property_availability")
        .select("room_type, date, available_units, is_stop_sell")
        .eq("property_id", property.id)
        .gte("date", format(start, "yyyy-MM-dd"))
        .lte("date", format(endDate, "yyyy-MM-dd"));
      if (data) {
        const map: Record<string, Record<string, { available_units: number | null; is_stop_sell: boolean }>> = {};
        for (const row of data) {
          if (!map[row.room_type]) map[row.room_type] = {};
          map[row.room_type][row.date] = { available_units: row.available_units, is_stop_sell: !!row.is_stop_sell };
        }
        setAvailabilityOverrides(map);
      }
    };
    fetchOverrides();
  }, [property?.id, roomTypes, checkIn]);

  // Fetch PMS availability cache for Hostfully properties (rates + availability per date)
  useEffect(() => {
    if (!property?.id || roomTypes.length === 0) return;
    const fetchPmsCache = async () => {
      const start = new Date(checkIn);
      const endDate = addDays(start, 30);
      // Build lookup: external_room_type_id → our active room id
      // Cache entries may be keyed by either room.id (active DB ID) or room.hostfully_room_id (old API UUID)
      // We map both but track priority: direct ID matches take precedence over hostfully_room_id matches
      const directIdSet = new Set<string>();
      const externalIdToRoomId: Record<string, string> = {};
      for (const room of roomTypes) {
        externalIdToRoomId[room.id] = room.id;
        directIdSet.add(room.id);
        if (room.hostfully_room_id) {
          externalIdToRoomId[room.hostfully_room_id] = room.id;
        }
      }
      const externalIds = Object.keys(externalIdToRoomId);
      if (externalIds.length === 0) {
        setPmsCacheMap({});
        return;
      }
      const { data } = await supabase
        .from("pms_availability_cache")
        .select("external_room_type_id, date, available_units, rates")
        .eq("property_id", property.id)
        .in("external_room_type_id", externalIds)
        .gte("date", format(start, "yyyy-MM-dd"))
        .lte("date", format(endDate, "yyyy-MM-dd"));
      if (data) {
        const map: Record<string, Record<string, { available_units: number; rate: number | null }>> = {};
        // Track which room+date combos already have data from a direct ID match
        const directHits = new Set<string>();
        // Process direct ID matches first, then hostfully_room_id fallbacks
        const sorted = [...data].sort((a, b) => {
          const aIsDirect = directIdSet.has(a.external_room_type_id) ? 0 : 1;
          const bIsDirect = directIdSet.has(b.external_room_type_id) ? 0 : 1;
          return aIsDirect - bIsDirect;
        });
        for (const row of sorted) {
          const roomId = externalIdToRoomId[row.external_room_type_id];
          if (!roomId) continue;
          const hitKey = `${roomId}:${row.date}`;
          const isDirect = directIdSet.has(row.external_room_type_id);
          // Skip hostfully_room_id entries if we already have a direct ID entry for this room+date
          if (!isDirect && directHits.has(hitKey)) continue;
          if (isDirect) directHits.add(hitKey);
          if (!map[roomId]) map[roomId] = {};
          const ratesArr = row.rates as any[];
          const dayRate = Array.isArray(ratesArr) && ratesArr.length > 0 ? (ratesArr[0]?.room_amount ?? null) : null;
          map[roomId][row.date] = {
            available_units: row.available_units ?? 0,
            rate: dayRate != null ? Number(dayRate) : null,
          };
        }
        setPmsCacheMap(map);
      }
    };
    fetchPmsCache();
  }, [property?.id, roomTypes, checkIn]);

  // Live ARI refresh for PMS-backed properties (background, non-blocking)
  // Uses a 30-day window matching the grid so the orchestrator returns rich
  // per-day data (and triggers background cache refresh if stale).
  const [liveRates, setLiveRates] = useState<LivePropertyRates | null>(null);
  useEffect(() => {
    if (!property?.id || !property?.external_system) return;
    if (property.external_system === "manual" || property.external_system === "roomsonline") return;

    let cancelled = false;
    const refetchCache = async () => {
      const start = new Date(checkIn);
      const endDate = addDays(start, 30);
      const externalIds = roomTypes.flatMap(r => [r.id, r.hostfully_room_id].filter(Boolean) as string[]);
      if (externalIds.length === 0) return;
      const { data } = await supabase
        .from("pms_availability_cache")
        .select("external_room_type_id, date, available_units, rates")
        .eq("property_id", property.id)
        .in("external_room_type_id", externalIds)
        .gte("date", format(start, "yyyy-MM-dd"))
        .lte("date", format(endDate, "yyyy-MM-dd"));
      if (cancelled || !data) return;
      const directIdSet = new Set(roomTypes.map(r => r.id));
      const externalIdToRoomId: Record<string, string> = {};
      for (const room of roomTypes) {
        externalIdToRoomId[room.id] = room.id;
        if (room.hostfully_room_id) externalIdToRoomId[room.hostfully_room_id] = room.id;
      }
      const map: Record<string, Record<string, { available_units: number; rate: number | null }>> = {};
      const directHits = new Set<string>();
      const sorted = [...data].sort((a, b) =>
        (directIdSet.has(a.external_room_type_id) ? 0 : 1) - (directIdSet.has(b.external_room_type_id) ? 0 : 1));
      for (const row of sorted) {
        const roomId = externalIdToRoomId[row.external_room_type_id];
        if (!roomId) continue;
        const hitKey = `${roomId}:${row.date}`;
        const isDirect = directIdSet.has(row.external_room_type_id);
        if (!isDirect && directHits.has(hitKey)) continue;
        if (isDirect) directHits.add(hitKey);
        if (!map[roomId]) map[roomId] = {};
        const ratesArr = row.rates as any[];
        const dayRate = Array.isArray(ratesArr) && ratesArr.length > 0 ? (ratesArr[0]?.room_amount ?? null) : null;
        map[roomId][row.date] = {
          available_units: row.available_units ?? 0,
          rate: dayRate != null ? Number(dayRate) : null,
        };
      }
      setPmsCacheMap(prev => {
        // Merge: prefer fresh map values, fall back to prev for missing dates
        const merged = { ...prev };
        for (const [roomId, byDate] of Object.entries(map)) {
          merged[roomId] = { ...(merged[roomId] || {}), ...byDate };
        }
        return merged;
      });
    };

    const resolve = async () => {
      // Use 30-day window so orchestrator returns full grid data (and
      // refreshes stale cache in background for next view).
      const start = new Date(checkIn);
      const gridEnd = format(addDays(start, 30), "yyyy-MM-dd");
      const { data, error } = await supabase.functions.invoke("booking-orchestrator-api", {
        body: {
          action: "fetch_availability",
          property_id: property.id,
          start_date: checkIn,
          end_date: gridEnd,
        },
      });

      if (cancelled) return;
      if (error || !data?.success) {
        // Re-query cache anyway in case background refresh populated it
        setTimeout(() => { if (!cancelled) refetchCache(); }, 4000);
        return;
      }

      const responseData = data.data || data;
      const roomTypesResp = responseData?.room_types || responseData?.roomTypes || [];
      const liveRooms: LiveRoomRate[] = [];
      let lowestRate: number | null = null;

      for (const rt of roomTypesResp) {
        const id = rt.room_type_id || rt.roomTypeId || rt.id || "";
        const name = rt.room_type_name || rt.roomTypeName || rt.name || "";
        const rateTypes = rt.rate_types || rt.rateTypes || [];
        const availableByDate: Record<string, number> = {};
        const ratesByDate: Record<string, number> = {};
        let minRate: number | null = null;
        let hasAvailability = false;

        const avail = rt.rooms_available_per_night || rt.roomsAvailablePerNight || rt.availability_per_night || rt.availabilityPerNight || [];
        for (const day of avail) {
          const units = day.available_units ?? day.numberOfRoomsAvailable ?? (day.available ? 1 : 0);
          const stopSell = day.stop_sell ?? day.stopSell ?? day.isClosed ?? day.closed ?? false;
          const dateStr = day.date || day.night_date || "";
          const effectiveUnits = (units > 0 && !stopSell) ? units : 0;
          if (dateStr) availableByDate[dateStr] = effectiveUnits;
          if (effectiveUnits > 0) hasAvailability = true;
        }
        for (const rateType of rateTypes) {
          for (const r of (rateType.rates || [])) {
            const amt = r.room_amount ?? r.roomAmount ?? 0;
            const dateStr = r.date || r.night_date || "";
            if (amt > 0) {
              if (dateStr) ratesByDate[dateStr] = amt;
              if (minRate === null || amt < minRate) minRate = amt;
            }
          }
        }
        liveRooms.push({ roomTypeId: String(id), roomName: name, minRate, available: hasAvailability, availableByDate, ratesByDate });
        if (minRate !== null && (lowestRate === null || minRate < lowestRate)) lowestRate = minRate;
      }

      setLiveRates({ propertyId: property.id, rooms: liveRooms, lowestRate, fetched: true });

      // Detect "thin" response: single Property-level row with no per-day data.
      // In that case, don't overwrite the cached multi-room grid — let
      // refetchCache() pick up the orchestrator's background refresh.
      const isThin = liveRooms.length <= 1 && liveRooms.every(r => Object.keys(r.availableByDate).length === 0);

      if (!isThin && liveRooms.length > 0) {
        setPmsCacheMap(prev => {
          const updated = { ...prev };
          for (const liveRoom of liveRooms) {
            const matchedRoom = roomTypes.find(rt =>
              rt.hostfully_room_id === liveRoom.roomTypeId ||
              rt.id === liveRoom.roomTypeId ||
              rt.name === liveRoom.roomName
            );
            if (!matchedRoom) continue;
            const hasPerDayData = Object.keys(liveRoom.availableByDate).length > 0;
            if (hasPerDayData) {
              const existing = updated[matchedRoom.id] || {};
              const merged = { ...existing };
              for (const [dateStr, units] of Object.entries(liveRoom.availableByDate)) {
                const liveRate = liveRoom.ratesByDate[dateStr] ?? merged[dateStr]?.rate ?? liveRoom.minRate;
                merged[dateStr] = { available_units: Number(units), rate: liveRate };
              }
              updated[matchedRoom.id] = merged;
            }
          }
          return updated;
        });
      }

      // Always re-query cache after a delay — orchestrator may have
      // fired a background refresh that populates richer data.
      setTimeout(() => { if (!cancelled) refetchCache(); }, 5000);
    };
    resolve();
    return () => { cancelled = true; };
  }, [property?.id, property?.external_system, checkIn, checkOut, roomTypes]);

  // ── Season rate resolver ──
  // Resolves the correct rate for a given room + date using amenities.season_rates
  const resolveSeasonRate = useMemo(() => {
    const amenitiesData = property?.amenities as any;
    const seasons = Array.isArray(amenitiesData?.seasons) ? amenitiesData.seasons : [];
    const seasonRates = amenitiesData?.season_rates || {};
    const wizardRooms = Array.isArray(amenitiesData?.room_types) ? amenitiesData.room_types : [];

    // Build a lookup: for each date, find which season it belongs to
    const findSeasonForDate = (dateStr: string): string | null => {
      for (const season of seasons) {
        const periods = Array.isArray(season.periods) ? season.periods : [];
        // Also check top-level from/to as a single period
        const allPeriods = periods.length > 0
          ? periods
          : [{ from: season.from || season.start_date || season.startDate, to: season.to || season.end_date || season.endDate }];
        for (const p of allPeriods) {
          const from = p?.from || p?.start_date || p?.startDate;
          const to = p?.to || p?.end_date || p?.endDate;
          if (from && to && dateStr >= from && dateStr <= to) return String(season.id);
        }
      }
      return null;
    };

    return (roomId: string, roomName: string, dateStr: string, fallbackRate: number | null): number | null => {
      // Find the wizard room to get its amenities ID and linked rate type
      const wizardRoom = wizardRooms.find((wr: any) =>
        String(wr?.id) === String(roomId) ||
        String(wr?.pmsRoomId || "") === String(roomId) ||
        String(wr?.name || "").trim().toLowerCase() === String(roomName || "").trim().toLowerCase()
      );
      if (!wizardRoom) return fallbackRate;

      const lookupKeys = [wizardRoom.id, wizardRoom.room_type_id, wizardRoom.pmsRoomId, roomId, roomName].filter(Boolean).map(String);

      const seasonId = findSeasonForDate(dateStr);
      if (!seasonId) return fallbackRate;

      // Try linked rate type first, then any matching season key
      const linkedRateTypeId = Array.isArray(wizardRoom.linkedRateTypes) ? wizardRoom.linkedRateTypes[0] : null;
      for (const lookupKey of lookupKeys) {
        const roomSeasonRates = seasonRates[lookupKey];
        if (!roomSeasonRates || typeof roomSeasonRates !== "object") continue;
        const preferredKey = linkedRateTypeId ? `${seasonId}-${linkedRateTypeId}` : null;
        if (preferredKey && roomSeasonRates[preferredKey]) {
          const amt = roomSeasonRates[preferredKey]?.roomAmount;
          if (amt != null && Number(amt) > 0) return Number(amt);
        }
        // Fallback: try any key starting with the seasonId
        for (const key of Object.keys(roomSeasonRates)) {
          if (key.startsWith(`${seasonId}-`)) {
            const amt = roomSeasonRates[key]?.roomAmount;
            if (amt != null && Number(amt) > 0) return Number(amt);
          }
        }
      }

      return fallbackRate;
    };
  }, [property]);

  const gridRooms = useMemo(() => {
    if (!checkIn) return [];
    const start = new Date(checkIn);
    const dates = eachDayOfInterval({ start, end: addDays(start, 13) });

    return roomTypes.map((room) => {
      const rate = room.daily_rate ? Number(room.daily_rate) : null;
      const rolosPlan = room.linked_rolos_id ? ratePlanMap[room.linked_rolos_id] : null;
      const amenitiesData = property?.amenities as any;
      const wizardRooms = Array.isArray(amenitiesData?.room_types) ? amenitiesData.room_types : [];
      const wizardRateTypes = Array.isArray(amenitiesData?.pms_rate_types) ? amenitiesData.pms_rate_types : [];
      const wizardRoom = wizardRooms.find((wr: any) => String(wr?.id) === String(room.id) || wr?.name === room.name);
      const linkedRateTypeId = Array.isArray(wizardRoom?.linkedRateTypes) ? wizardRoom.linkedRateTypes[0] : undefined;
      const linkedRateType = linkedRateTypeId ? wizardRateTypes.find((rt: any) => String(rt?.id) === String(linkedRateTypeId)) : null;
      const wizardRate = linkedRateType?.baseRate != null ? Number(linkedRateType.baseRate) : wizardRoom?.baseRate != null ? Number(wizardRoom.baseRate) : null;
      const fallbackRate = rate ?? (rolosPlan?.base_rate ?? wizardRate ?? null);
      const roomOverrides = availabilityOverrides[room.name] || availabilityOverrides[String(room.id)] || {};
      const roomPmsCache = pmsCacheMap[room.id] || {};

      const ratesByDate: Record<string, number | null> = {};
      dates.forEach((d) => {
        const dateKey = format(d, "yyyy-MM-dd");
        const override = roomOverrides[dateKey];
        if (override && (override.is_stop_sell || override.available_units === 0)) {
          ratesByDate[dateKey] = null;
          return;
        }
        // Use PMS cache if available (has per-day rates and availability)
        const cached = roomPmsCache[dateKey];
        if (cached) {
          if (cached.available_units <= 0) {
            ratesByDate[dateKey] = null; // SOLD
          } else {
            ratesByDate[dateKey] = cached.rate ?? resolveSeasonRate(room.id, room.name, dateKey, fallbackRate);
          }
        } else {
          // Resolve season rate for this specific date
          ratesByDate[dateKey] = resolveSeasonRate(room.id, room.name, dateKey, fallbackRate);
        }
      });

      return {
        roomId: room.id,
        roomName: room.name,
        maxGuests: room.max_guests,
        beds: room.beds,
        ratesByDate,
      };
    });
  }, [roomTypes, ratePlanMap, checkIn, property, availabilityOverrides, pmsCacheMap, resolveSeasonRate]);

  const tripadvisorId = useMemo(() => {
    if (!property?.amenities) return null;
    const a = property.amenities as any;
    return a.tripadvisor_id || a.external_ids?.tripadvisor_id || null;
  }, [property]);

  const reviewPlatforms = useMemo(() => {
    if (!property?.amenities) return [];
    const a = property.amenities as any;
    const platforms = a.review_platforms || [];
    if (tripadvisorId && !platforms.find((p: any) => p.type === "tripadvisor")) {
      platforms.push({ type: "tripadvisor", id: tripadvisorId, enabled: true });
    }
    return platforms;
  }, [property, tripadvisorId]);

  const handleBookRoom = (roomId: string, roomName: string, overrideCheckOut?: string) => {
    // If user hasn't explicitly selected dates, prompt them first
    if (!datesConfirmed) {
      setPendingRoom({ roomId, roomName });
      setShowCalendar(true);
      setPickerOpen(true);
      setDatesPulse(true);
      setTimeout(() => setDatesPulse(false), 4000);
      dateControlsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const room = roomTypes.find((r) => r.id === roomId);
    const rate = room?.daily_rate ? Number(room.daily_rate) : null;
    const rolosPlan = room?.linked_rolos_id ? ratePlanMap[room.linked_rolos_id] : null;

    // Resolve rate: DB daily_rate → ROL'OS plan → PMS cache for check-in date
    let effectiveRate = rate ?? rolosPlan?.base_rate ?? null;
    if (!effectiveRate && pmsCacheMap[roomId]) {
      const ciEntry = pmsCacheMap[roomId][checkIn];
      const ciRate = typeof ciEntry === 'object' ? ciEntry?.rate : ciEntry;
      if (ciRate && ciRate > 0) effectiveRate = ciRate;
    }
    const pricingModel = rolosPlan?.pricing_model || null;

    // Notify parent of step change
    postToParent({ type: "rolos:step-change", step: "checkout", slug });

    const finalCheckOut = overrideCheckOut || checkOut;
    const params = new URLSearchParams({
      roomTypeId: roomId,
      roomTypeName: roomName,
      checkIn,
      checkOut: finalCheckOut,
      integration,
      property_id: property.id,
      adults: String(Math.min(room?.max_guests || 2, 2)),
    });
    if (room?.max_guests) params.set("max_guests", String(room.max_guests));
    if (effectiveRate) params.set("embed_rate", String(effectiveRate));
    if (pricingModel) params.set("embed_pricing_model", pricingModel);
    if (room?.linked_rolos_id) params.set("linked_rolos_id", room.linked_rolos_id);
    // hostfully_room_id no longer needed — adapters return DB UUIDs directly
    if (promoCode) params.set("voucher", promoCode);
    // When portfolio_brand=1, forward the URL brand params (portfolio's brand) instead of property DB values
    const portfolioBrandLock = searchParams.get("portfolio_brand") === "1";
    if (portfolioBrandLock && brandColorParam) {
      params.set("brand_color", decodeURIComponent(brandColorParam));
      if (brandSecondaryParam) params.set("brand_secondary_color", decodeURIComponent(brandSecondaryParam));
      if (brandFontParam) params.set("brand_font_color", decodeURIComponent(brandFontParam));
    } else if (isWhiteLabelContext) {
      // Only forward the property's brand into checkout when the embed is in
      // white-label mode. Canonical (pink) embeds must not paint the checkout blue.
      if (property.brand_primary_color) params.set("brand_color", property.brand_primary_color);
      if (property.brand_secondary_color) params.set("brand_secondary_color", property.brand_secondary_color);
      if (property.brand_font_color) params.set("brand_font_color", property.brand_font_color);
    }
    // Forward portfolio_slug so checkout can route back to portfolio
    const portfolioSlugParam = searchParams.get("portfolio_slug");
    if (portfolioSlugParam) params.set("portfolio_slug", portfolioSlugParam);
    // Preserve full white-label mode through checkout so BookingConfirmation stays chrome-less.
    if (isFullWhiteLabel) {
      params.set("wl", "1");
      params.set("hide_powered_by", "1");
    }

    // Journey mode: add this stay to the itinerary and go to journey review
    if (journeyMode && property) {
      const finalCheckOutDate = overrideCheckOut || checkOut;
      const numNights = differenceInCalendarDays(new Date(finalCheckOutDate), new Date(checkIn));
      const stayRate = effectiveRate || 0;
      const stayTotal = stayRate * Math.max(numNights, 1);

      const alreadyInItinerary = stays.some(
        s => s.property_id === property.id && s.dates.check_in === checkIn && s.dates.check_out === finalCheckOutDate
      );
      if (!alreadyInItinerary) {
        const portfolioSlugParam = searchParams.get("portfolio_slug");
        addStay({
          property_id: property.id,
          property_name: property.name || '',
          property_slug: property.slug || slug || '',
          property_image: property.hero_image || '',
          external_system: property.external_system || integration || '',
          dates: { check_in: checkIn, check_out: finalCheckOutDate },
          rooms: [{
            room_type_id: roomId,
            room_type_name: roomName,
            quantity: 1,
            rate_per_night: stayRate,
            total_price: stayTotal,
          }],
          guests: { adults: Math.min(room?.max_guests || 2, 2), children: 0, infants: 0 },
          price_breakdown: {
            subtotal: stayTotal,
            fees: [],
            taxes: [],
            total: stayTotal,
          },
          availability_status: 'available',
          nights: Math.max(numNights, 1),
          portfolio_slug: portfolioSlugParam || undefined,
        });
      }
      // Route to journey review with all accumulated stays
      window.location.href = `/journey/review`;
      return;
    }

    window.location.href = `/booking/${property.slug}?${params.toString()}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!property) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <p className="text-muted-foreground text-sm">Property not found</p>
      </div>
    );
  }

  const images = Array.isArray(property.images) ? property.images : [];
  const galleryImages = images.slice(0, 6).map((img: any) => img?.url || img);
  const heroImage = galleryImages.length > 0 ? galleryImages[activeImageIndex] || galleryImages[0] : null;
  const facilities = property.amenities?.facilities || property.amenities?.general_facilities || [];

  return (
    <div className="font-sans bg-background min-h-screen flex flex-col">
      {/* ── Branded Header ── */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-4 sm:px-5 py-3 flex items-center justify-between flex-wrap gap-2"
        style={{ background: brandColor, color: fontColor }}
      >
        <div className="flex items-center gap-3">
          {(logoUrl || property.brand_logo_url) && (
            <img
              src={logoUrl || property.brand_logo_url}
              alt=""
              className="h-8 object-contain"
            />
          )}
          <div>
            <div className="font-semibold text-base tracking-tight">{property.name}</div>
            {(property.address || property.city) && (
              <div className="text-[11px] opacity-80">
                {[property.address, property.city].filter(Boolean).join(", ")}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowPromo(!showPromo)}
          className="text-[11px] font-semibold px-3 py-1.5 rounded-md border backdrop-blur-sm transition-colors"
          style={{
            background: "rgba(255,255,255,0.12)",
            borderColor: "rgba(255,255,255,0.2)",
            color: fontColor,
          }}
        >
          {showPromo ? "Hide promo" : "🏷 Promo code"}
        </button>
      </motion.header>

      {/* Promo Row */}
      <AnimatePresence>
        {showPromo && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-card border-b border-border overflow-hidden"
          >
            <div className="px-4 sm:px-5 py-2.5 flex items-center gap-2">
              <Input
                type="text"
                placeholder="Enter promo code"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                className="h-8 text-xs max-w-[200px]"
              />
              <Button
                size="sm"
                className="h-8 text-xs"
                style={{ background: brandColor, color: fontColor }}
              >
                Apply
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Date Controls ── */}
      <motion.div
        ref={dateControlsRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="bg-card border-b border-border px-4 sm:px-5 py-3 flex items-center gap-3 flex-wrap text-sm"
        style={datesPulse ? {
          boxShadow: `0 0 0 3px ${brandColor}60`,
          transition: "box-shadow 0.3s ease",
        } : { transition: "box-shadow 0.3s ease" }}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {!datesConfirmed ? "👉 Select your dates" : "Dates"}
          </span>
          <EmbedDatePicker
            checkIn={checkIn}
            checkOut={checkOut}
            onCheckInChange={(d) => {
              setCheckIn(d);
              setDatesConfirmed(true);
              if (d && (!checkOut || new Date(checkOut) <= new Date(d))) {
                setCheckOut(format(addDays(new Date(d), 1), "yyyy-MM-dd"));
              }
            }}
            onCheckOutChange={(d) => {
              setCheckOut(d);
              if (d) {
                setDatesConfirmed(true);
                setDatesPulse(false);
                // Auto-proceed if a pending room was stored
                if (pendingRoom) {
                  const pr = pendingRoom;
                  setPendingRoom(null);
                  setTimeout(() => handleBookRoom(pr.roomId, pr.roomName, d), 150);
                }
              }
            }}
            brandColor={brandColor}
            fontColor={fontColor}
            controlledOpen={pickerOpen}
            onOpenChange={setPickerOpen}
          />
        </div>
        {/* Prompt banner when user needs to pick dates */}
        <AnimatePresence>
          {datesPulse && pendingRoom && (
            <motion.span
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="text-xs font-medium"
              style={{ color: brandColor }}
            >
              ← Pick check-in & check-out to book {pendingRoom.roomName}
            </motion.span>
          )}
        </AnimatePresence>
        {nights > 0 && (
          <span
            className="text-xs font-bold px-3 py-1 rounded-full"
            style={{
              background: `${brandColor}15`,
              color: brandColor,
              border: `1px solid ${brandColor}30`,
            }}
          >
            {nights} night{nights !== 1 ? "s" : ""}
          </span>
        )}
        <div className="ml-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCalendar(!showCalendar)}
            className="h-8 text-xs font-semibold"
            style={showCalendar ? {
              background: `${brandColor}10`,
              borderColor: `${brandColor}30`,
              color: brandColor,
            } : undefined}
          >
            {showCalendar ? "Hide Calendar" : "Show Calendar"}
          </Button>
        </div>
      </motion.div>

      {/* ── Availability Grid ── */}
      <AnimatePresence>
        {showCalendar && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-card border-b border-border overflow-hidden"
          >
            <EmbedAvailabilityGrid
              rooms={gridRooms}
              startDate={checkIn}
              visibleDays={10}
              brandColor={brandColor}
              fontColor={fontColor}
              onBook={(roomId, roomName) => handleBookRoom(roomId, roomName)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Announcements ── */}
      {property.amenities?.announcements?.length > 0 && (
        <div className="px-4 sm:px-5 pt-3">
          <AnnouncementBanner
            announcements={property.amenities.announcements}
            brandColor={brandColor}
          />
        </div>
      )}

      {/* ── Current Specials ── */}
      {property.id && (
        <div className="px-4 sm:px-5 pt-3">
          <SpecialsBanner propertyId={property.id} brandColor={brandColor} />
        </div>
      )}

      {/* ── Packages ── */}
      {property.amenities?.packages?.length > 0 && (
        <div className="px-4 sm:px-5 pt-3">
          <PackageCards
            packages={property.amenities.packages}
            brandColor={brandColor}
            onBookPackage={(pkg) => {
              // Navigate to checkout with package info
              const params = new URLSearchParams({
                checkIn,
                checkOut: checkOut,
                integration,
                property_id: property.id,
              });
              if (isWhiteLabelContext && property.brand_primary_color) params.set("brand_color", property.brand_primary_color);
              if (isFullWhiteLabel) { params.set("wl", "1"); params.set("hide_powered_by", "1"); }
              window.location.href = `/booking/${property.slug}?${params.toString()}`;
            }}
          />
        </div>
      )}

      {/* ── Room Cards (Fluent horizontal cards) ── */}
      {roomTypes.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="px-4 sm:px-5 py-4 space-y-3"
        >
          <h3 className="text-sm font-semibold tracking-tight text-foreground">Rooms & Suites</h3>
          <div className="space-y-3">
            {roomTypes.map((room, roomIdx) => {
               const rate = room.daily_rate ? Number(room.daily_rate) : null;
               const rolosPlan = room.linked_rolos_id ? ratePlanMap[room.linked_rolos_id] : null;
               const amenitiesData = property?.amenities as any;
               const wizardRooms = Array.isArray(amenitiesData?.room_types) ? amenitiesData.room_types : [];
               const wizardRoom = wizardRooms.find((wr: any) => String(wr?.id) === String(room.id) || wr?.name === room.name);
               const wizardRate = wizardRoom?.baseRate || wizardRoom?.base_rate || null;
               const baseFallback = rate ?? rolosPlan?.base_rate ?? wizardRate ?? null;
               // Use today's season rate for the room card display price
               const todayDateStr = format(today, 'yyyy-MM-dd');
               const effectiveRate = resolveSeasonRate(room.id, room.name, todayDateStr, baseFallback);
              const roomImages = Array.isArray(room.images)
                ? room.images.map((img: any) => img?.url || img).filter(Boolean)
                : [];
              // Deterministic fallback: use room index to pick a varied property image
              const propertyFallback = galleryImages.length > 0
                ? galleryImages[roomIdx % galleryImages.length]
                : heroImage;
              const thumb = roomImages[0] || room.thumbnail_url || propertyFallback;

              // ── Availability badge logic ──
              const roomCache = pmsCacheMap[room.id] || {};
              const todayStr = format(today, 'yyyy-MM-dd');
              const todayEntry = roomCache[todayStr];
              const todayUnits = todayEntry?.available_units ?? (room.total_units || 0);

              let badgeType: 'low' | 'future' | 'soldout' | null = null;
              let badgeText = '';
              let nextAvailDay: { units: number; dayName: string } | null = null;

              if (todayUnits > 0 && todayUnits <= 3) {
                badgeType = 'low';
                badgeText = `${todayUnits} left today`;
              } else if (todayUnits <= 0) {
                // Scan next 7 days
                for (let d = 1; d <= 7; d++) {
                  const dateStr = format(addDays(today, d), 'yyyy-MM-dd');
                  const dayEntry = roomCache[dateStr];
                  const units = dayEntry?.available_units ?? 0;
                  if (units > 0) {
                    nextAvailDay = { units, dayName: format(addDays(today, d), 'EEEE') };
                    break;
                  }
                }
                if (nextAvailDay) {
                  badgeType = 'future';
                  badgeText = `${nextAvailDay.units} available from ${nextAvailDay.dayName}`;
                } else if (Object.keys(roomCache).length > 0) {
                  badgeType = 'soldout';
                }
              }

              const cardOpacity = badgeType === 'soldout' ? 0.5 : badgeType === 'future' ? 0.8 : 1;

              return (
                <motion.div
                  key={room.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: cardOpacity, x: 0 }}
                  className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                  style={badgeType === 'soldout' ? { pointerEvents: 'none' as const } : undefined}
                >
                  <div className="flex flex-col sm:flex-row">
                    {/* Room Image with availability badge */}
                    {thumb && (
                      <div className="sm:w-36 h-32 sm:h-auto shrink-0 bg-muted relative">
                        <img
                          src={thumb}
                          alt={room.name}
                          className="h-full w-full object-cover"
                        />
                        {badgeType === 'low' && (
                          <span style={{
                            position: 'absolute', top: 8, left: 8,
                            background: 'rgba(239,68,68,0.9)', color: '#fff',
                            fontSize: 10, fontWeight: 600, padding: '2px 8px',
                            borderRadius: 9999, lineHeight: '16px',
                          }}>{badgeText}</span>
                        )}
                        {badgeType === 'future' && (
                          <span style={{
                            position: 'absolute', top: 8, left: 8,
                            background: 'rgba(5,150,105,0.9)', color: '#fff',
                            fontSize: 10, fontWeight: 600, padding: '2px 8px',
                            borderRadius: 9999, lineHeight: '16px',
                          }}>{badgeText}</span>
                        )}
                      </div>
                    )}

                    {/* Room Info */}
                    <div className="flex-1 p-3 sm:p-4 flex flex-col justify-between">
                      <div>
                        <h4 className="font-semibold text-sm text-foreground">{room.name}</h4>
                        {room.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{room.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          {room.max_guests && (
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {room.max_guests} guests
                            </span>
                          )}
                          {room.beds && (
                            <span className="flex items-center gap-1">
                              <BedDouble className="h-3 w-3" />
                              {room.beds} bed{room.beds !== 1 ? "s" : ""}
                            </span>
                          )}
                          {room.bathrooms && (
                            <span className="flex items-center gap-1">
                              <Bath className="h-3 w-3" />
                              {room.bathrooms}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between mt-3">
                        {effectiveRate != null && (
                          <div className="text-foreground">
                            <span className="font-bold text-base">R{effectiveRate.toLocaleString()}</span>
                            <span className="text-xs text-muted-foreground ml-1">/ night</span>
                          </div>
                        )}
                        <Button
                          size="sm"
                          className="h-8 text-xs font-semibold rounded-lg"
                          style={{ background: brandColor, color: fontColor }}
                          onClick={() => handleBookRoom(room.id, room.name)}
                        >
                          Book Now
                        </Button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* ── Property Info (Editorial style) ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="px-4 sm:px-5 py-4"
      >
        <div className="rounded-xl border border-border/50 bg-card overflow-hidden shadow-sm">
          <div className="flex flex-col md:flex-row">
            {/* Gallery */}
            {heroImage && (
              <div className="md:w-[340px] shrink-0 p-4">
                <AnimatePresence mode="wait">
                  <motion.img
                    key={activeImageIndex}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    src={heroImage}
                    alt={property.name}
                    className="w-full h-52 object-cover rounded-lg"
                  />
                </AnimatePresence>
                {galleryImages.length > 1 && (
                  <div className="flex gap-1.5 mt-2 overflow-x-auto">
                    {galleryImages.map((img: string, i: number) => (
                      <img
                        key={i}
                        src={img}
                        alt=""
                        onClick={() => setActiveImageIndex(i)}
                        className={cn(
                          "w-16 h-12 object-cover rounded-md shrink-0 cursor-pointer transition-all border-2",
                          i === activeImageIndex
                            ? "opacity-100"
                            : "opacity-60 hover:opacity-80 border-transparent"
                        )}
                        style={i === activeImageIndex ? { borderColor: brandColor } : undefined}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Info */}
            <div className="flex-1 min-w-0 p-4 md:p-5 md:pl-2 space-y-5">
              {property.description && (
                <div>
                  <h3 className="font-semibold text-sm text-foreground tracking-tight mb-2">About</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{property.description}</p>
                </div>
              )}

              {Array.isArray(facilities) && facilities.length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm text-foreground tracking-tight mb-2">Facilities</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {facilities.map((f: string, i: number) => (
                      <span
                        key={i}
                        className="text-[11px] text-muted-foreground px-2.5 py-1 bg-muted rounded-md font-medium"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* The Space — only when enriched content exists (avoids duplicating the About description) */}
              {(property.amenities?.space_description || (property.amenities?.key_highlights?.length > 0)) && (
                <div>
                  <h3 className="font-semibold text-sm text-foreground tracking-tight mb-2">The space</h3>
                  {property.amenities?.key_highlights?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {(property.amenities.key_highlights as string[]).map((h: string, i: number) => (
                        <span key={i} className="text-[10px] font-medium px-2 py-0.5 rounded-full border" style={{ borderColor: brandColor + '40', color: brandColor, backgroundColor: brandColor + '10' }}>{h}</span>
                      ))}
                    </div>
                  )}
                  {property.amenities?.space_description && (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {property.amenities.space_description}
                    </p>
                  )}
                </div>
              )}

              {/* House Rules */}
              {(property.amenities?.check_in_time || property.amenities?.check_in_from || property.amenities?.house_rules) && (
                <div>
                  <h3 className="font-semibold text-sm text-foreground tracking-tight mb-2">Things to know</h3>
                  <div className="text-xs text-muted-foreground space-y-1">
                    {(property.amenities?.check_in_time || property.amenities?.check_in_from) && (
                      <div>Check-in: {property.amenities?.check_in_time || property.amenities?.check_in_from}</div>
                    )}
                    {(property.amenities?.check_out_time || property.amenities?.check_out_from) && (
                      <div>Check-out: {property.amenities?.check_out_time || property.amenities?.check_out_from}</div>
                    )}
                    {property.amenities?.house_rules?.pets_allowed !== undefined && (
                      <div>Pets: {property.amenities.house_rules.pets_allowed ? 'Allowed' : 'Not allowed'}</div>
                    )}
                    {property.amenities?.house_rules?.smoking_allowed !== undefined && (
                      <div>Smoking: {property.amenities.house_rules.smoking_allowed ? 'Allowed' : 'Not allowed'}</div>
                    )}
                  </div>
                </div>
              )}

              {/* Contact */}
              <div>
                <h3 className="font-semibold text-sm text-foreground tracking-tight mb-2">Contact</h3>
                <div className="text-xs text-muted-foreground space-y-1">
                  {(property.amenities as any)?.phone && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-3 w-3" />
                      {(property.amenities as any).phone}
                    </div>
                  )}
                  {(property.amenities as any)?.email && (
                    <div className="flex items-center gap-1.5">
                      <Mail className="h-3 w-3" />
                      {(property.amenities as any).email}
                    </div>
                  )}
                  {(property.address || property.city) && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3 w-3" />
                      {[property.address, property.city].filter(Boolean).join(", ")}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Reviews ── */}
      {tripadvisorId && (
        <div className="px-4 sm:px-5 pb-4">
          <div className="bg-card rounded-xl overflow-hidden border border-border/50 shadow-sm">
            <EmbedTripAdvisorReviews tripadvisorId={tripadvisorId} brandColor={brandColor} />
          </div>
        </div>
      )}
      {reviewPlatforms.length > 0 && !tripadvisorId && (
        <div className="px-4 sm:px-5 pb-4">
          <div className="bg-card rounded-xl overflow-hidden border border-border/50 shadow-sm">
            <EmbedReviewPlatforms platforms={reviewPlatforms} brandColor={brandColor} />
          </div>
        </div>
      )}
      {reviewPlatforms.length > 0 && tripadvisorId && (
        <div className="px-4 sm:px-5 pb-4">
          <div className="bg-card rounded-xl overflow-hidden border border-border/50 shadow-sm">
            <EmbedReviewPlatforms platforms={reviewPlatforms.filter((p: any) => p.type !== "tripadvisor")} brandColor={brandColor} />
          </div>
        </div>
      )}

      {/* Footer */}
      {!hidePoweredBy && (
        <footer className="py-4 px-5 text-center mt-auto">
          <PoweredByRolOS />
        </footer>
      )}

      {/* AI Concierge Chat */}
      <EmbedConciergeChat
        propertyId={property.id}
        propertyName={property.name}
        roomTypes={roomTypes.map((rt: any) => ({ id: rt.id, name: rt.name, max_guests: rt.max_guests }))}
        brandColor={brandColor}
        fontColor={fontColor}
        checkIn={checkIn}
        checkOut={checkOut}
      />
    </div>
  );
}
