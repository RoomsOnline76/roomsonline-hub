import { useParams, useSearchParams } from "react-router-dom";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays, differenceInCalendarDays, startOfDay, eachDayOfInterval } from "date-fns";
import { PoweredByRolOS } from "@/components/pms/PoweredByRolOS";
import { EmbedDatePicker } from "@/components/embed/EmbedDatePicker";
import { EmbedAvailabilityGrid } from "@/components/embed/EmbedAvailabilityGrid";
import { EmbedTripAdvisorReviews } from "@/components/embed/EmbedTripAdvisorReviews";
import { EmbedReviewPlatforms } from "@/components/embed/EmbedReviewPlatforms";

// postMessage helper for iframe ↔ parent communication
function postToParent(data: Record<string, unknown>) {
  if (window.parent !== window) {
    window.parent.postMessage(data, "*");
  }
}

export default function EmbedProperty() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const integration = searchParams.get("integration") || "widget";
  const mode = searchParams.get("mode") || "widget";
  const brandColorParam = searchParams.get("brand_color");
  const propertyId = searchParams.get("property_id");

  // Enhanced white-label params from rol-embed.js
  const brandLogoParam = searchParams.get("brand_logo");
  const brandSecondaryParam = searchParams.get("brand_secondary_color");
  const brandFontParam = searchParams.get("brand_font_color");
  const layoutParam = searchParams.get("layout") || "standard";
  const hidePoweredBy = searchParams.get("hide_powered_by") === "1";

  const [property, setProperty] = useState<any>(null);
  const [roomTypes, setRoomTypes] = useState<any[]>([]);
  const [ratePlanMap, setRatePlanMap] = useState<Record<string, { base_rate: number; pricing_model: string }>>({});
  const [loading, setLoading] = useState(true);
  const [showCalendar, setShowCalendar] = useState(true);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const today = startOfDay(new Date());
  const [checkIn, setCheckIn] = useState<string>(format(today, "yyyy-MM-dd"));
  const [checkOut, setCheckOut] = useState<string>(format(addDays(today, 2), "yyyy-MM-dd"));
  const [promoCode, setPromoCode] = useState("");
  const [showPromo, setShowPromo] = useState(false);

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
        .select("id, name, slug, brand_primary_color, brand_secondary_color, brand_font_color, brand_logo_url, images, description, amenities, address, city, is_rol_property")
        .eq("slug", slug)
        .eq("is_active", true)
        .single();

      if (prop) {
        setProperty(prop);
        const { data: rooms } = await supabase
          .from("hostfully_room_types")
          .select("id, name, description, daily_rate, max_guests, beds, bedrooms, bathrooms, images, thumbnail_url, is_active, amenities, linked_rolos_id")
          .eq("property_id", prop.id)
          .eq("is_active", true)
          .order("name");
        setRoomTypes(rooms || []);

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

  const brandColor = brandColorParam ? decodeURIComponent(brandColorParam) : property?.brand_primary_color || "#e91e63";
  const fontColor = brandFontParam ? decodeURIComponent(brandFontParam) : property?.brand_font_color || "#ffffff";
  const logoUrl = brandLogoParam ? decodeURIComponent(brandLogoParam) : property?.brand_logo_url;

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
      const effectiveRate = rate ?? (rolosPlan?.base_rate ?? wizardRate ?? null);
      const roomOverrides = availabilityOverrides[room.name] || availabilityOverrides[String(room.id)] || {};

      const ratesByDate: Record<string, number | null> = {};
      dates.forEach((d) => {
        const dateKey = format(d, "yyyy-MM-dd");
        const override = roomOverrides[dateKey];
        if (override && (override.is_stop_sell || override.available_units === 0)) {
          ratesByDate[dateKey] = null;
        } else {
          ratesByDate[dateKey] = effectiveRate;
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
  }, [roomTypes, ratePlanMap, checkIn, property, availabilityOverrides]);

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

  const handleBookRoom = (roomId: string, roomName: string) => {
    const room = roomTypes.find((r) => r.id === roomId);
    const rate = room?.daily_rate ? Number(room.daily_rate) : null;
    const rolosPlan = room?.linked_rolos_id ? ratePlanMap[room.linked_rolos_id] : null;
    const effectiveRate = rate ?? rolosPlan?.base_rate ?? null;
    const pricingModel = rolosPlan?.pricing_model || null;

    // Notify parent of step change
    postToParent({ type: "rolos:step-change", step: "checkout", slug });

    const params = new URLSearchParams({
      roomTypeId: roomId,
      roomTypeName: roomName,
      checkIn,
      checkOut,
      integration,
      property_id: property.id,
      adults: "2",
    });
    if (effectiveRate) params.set("embed_rate", String(effectiveRate));
    if (pricingModel) params.set("embed_pricing_model", pricingModel);
    if (room?.linked_rolos_id) params.set("linked_rolos_id", room.linked_rolos_id);
    if (promoCode) params.set("voucher", promoCode);
    if (property.brand_primary_color) params.set("brand_color", property.brand_primary_color);
    if (property.brand_secondary_color) params.set("brand_secondary_color", property.brand_secondary_color);
    if (property.brand_font_color) params.set("brand_font_color", property.brand_font_color);
    window.location.href = `/booking/${property.slug}?${params.toString()}`;
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#fafafa" }}>
        <div style={{ animation: "pulse 2s infinite", color: "#999", fontSize: "14px" }}>Loading...</div>
      </div>
    );
  }

  if (!property) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#fafafa" }}>
        <p style={{ color: "#999" }}>Property not found</p>
      </div>
    );
  }

  const images = Array.isArray(property.images) ? property.images : [];
  const galleryImages = images.slice(0, 6).map((img: any) => img?.url || img);
  const heroImage = galleryImages.length > 0 ? galleryImages[activeImageIndex] || galleryImages[0] : null;
  const facilities = property.amenities?.facilities || property.amenities?.general_facilities || [];

  return (
    <div style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif", background: "#f7f8fa", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* ── Header ── */}
      <header
        style={{
          background: brandColor,
          color: fontColor,
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {logoUrl && (
            <img src={logoUrl} alt="" style={{ height: "32px", objectFit: "contain" }} />
          )}
          {!logoUrl && property.brand_logo_url && (
            <img src={property.brand_logo_url} alt="" style={{ height: "32px", objectFit: "contain" }} />
          )}
          <div>
            <div style={{ fontWeight: 700, fontSize: "16px", letterSpacing: "-0.01em" }}>{property.name}</div>
            {(property.address || property.city) && (
              <div style={{ fontSize: "11px", opacity: 0.8 }}>
                {[property.address, property.city].filter(Boolean).join(", ")}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowPromo(!showPromo)}
          style={{
            background: "rgba(255,255,255,0.15)",
            border: "1px solid rgba(255,255,255,0.25)",
            color: fontColor,
            cursor: "pointer",
            fontSize: "11px",
            fontWeight: 600,
            padding: "5px 12px",
            borderRadius: "6px",
            backdropFilter: "blur(4px)",
          }}
        >
          {showPromo ? "Hide promo" : "🏷 Promo code"}
        </button>
      </header>

      {/* Promo row */}
      {showPromo && (
        <div style={{ background: "#fff", padding: "10px 20px", display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid #eee" }}>
          <input
            type="text"
            placeholder="Enter promo code"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value)}
            style={{
              padding: "7px 12px",
              border: "1px solid #e0e0e0",
              borderRadius: "8px",
              fontSize: "13px",
              flex: 1,
              maxWidth: "200px",
              outline: "none",
            }}
          />
          <button
            style={{
              background: brandColor,
              color: fontColor,
              border: "none",
              padding: "7px 16px",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Apply
          </button>
        </div>
      )}

      {/* ── Date Controls ── */}
      <div
        style={{
          background: "#fff",
          borderBottom: "1px solid #eee",
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
          fontSize: "13px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontWeight: 600, color: "#555", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Dates</span>
          <EmbedDatePicker
            checkIn={checkIn}
            checkOut={checkOut}
            onCheckInChange={(d) => {
              setCheckIn(d);
              if (d && (!checkOut || new Date(checkOut) <= new Date(d))) {
                setCheckOut(format(addDays(new Date(d), 1), "yyyy-MM-dd"));
              }
            }}
            onCheckOutChange={setCheckOut}
            brandColor={brandColor}
            fontColor={fontColor}
          />
        </div>
        {nights > 0 && (
          <span
            style={{
              background: `${brandColor}15`,
              color: brandColor,
              padding: "4px 12px",
              borderRadius: "999px",
              fontSize: "12px",
              fontWeight: 700,
              border: `1px solid ${brandColor}30`,
            }}
          >
            {nights} night{nights !== 1 ? "s" : ""}
          </span>
        )}
        <div style={{ marginLeft: "auto" }}>
          <button
            onClick={() => setShowCalendar(!showCalendar)}
            style={{
              background: showCalendar ? `${brandColor}10` : "#f5f5f5",
              border: `1px solid ${showCalendar ? `${brandColor}30` : "#e0e0e0"}`,
              borderRadius: "8px",
              padding: "6px 14px",
              fontSize: "12px",
              cursor: "pointer",
              color: showCalendar ? brandColor : "#555",
              fontWeight: 600,
              transition: "all 0.15s ease",
            }}
          >
            {showCalendar ? "Hide Calendar" : "Show Calendar"}
          </button>
        </div>
      </div>

      {/* ── Availability Grid ── */}
      {showCalendar && (
        <div style={{ background: "#fff", borderBottom: "1px solid #eee" }}>
          <EmbedAvailabilityGrid
            rooms={gridRooms}
            startDate={checkIn}
            visibleDays={10}
            brandColor={brandColor}
            fontColor={fontColor}
            onBook={(roomId, roomName) => handleBookRoom(roomId, roomName)}
          />
        </div>
      )}

      {/* ── Property Info Card ── */}
      <div style={{ padding: "20px" }}>
        <div
          style={{
            background: "#fff",
            borderRadius: "12px",
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
          }}
        >
          <div style={{ display: "flex", gap: "0", flexWrap: "wrap" }}>
            {/* Left: Images */}
            <div style={{ flex: "0 0 auto", maxWidth: "340px", width: "100%", padding: "16px" }}>
              {heroImage && (
                <img
                  src={heroImage}
                  alt={property.name}
                  style={{
                    width: "100%",
                    height: "210px",
                    objectFit: "cover",
                    borderRadius: "10px",
                    marginBottom: "8px",
                  }}
                />
              )}
              {galleryImages.length > 1 && (
                <div style={{ display: "flex", gap: "6px", overflowX: "auto" }}>
                  {galleryImages.map((img: string, i: number) => (
                    <img
                      key={i}
                      src={img}
                      alt=""
                      onClick={() => setActiveImageIndex(i)}
                      style={{
                        width: "64px",
                        height: "48px",
                        objectFit: "cover",
                        borderRadius: "6px",
                        flexShrink: 0,
                        cursor: "pointer",
                        opacity: i === activeImageIndex ? 1 : 0.6,
                        border: i === activeImageIndex ? `2px solid ${brandColor}` : "2px solid transparent",
                        transition: "all 0.15s",
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Right: Info */}
            <div style={{ flex: 1, minWidth: "240px", padding: "20px 20px 20px 4px" }}>
              {property.description && (
                <div style={{ marginBottom: "20px" }}>
                  <h3 style={{ fontWeight: 700, fontSize: "15px", color: "#111", margin: "0 0 8px 0", letterSpacing: "-0.01em" }}>About</h3>
                  <p style={{ fontSize: "13px", color: "#555", lineHeight: 1.7, margin: 0 }}>{property.description}</p>
                </div>
              )}

              {Array.isArray(facilities) && facilities.length > 0 && (
                <div style={{ marginBottom: "20px" }}>
                  <h3 style={{ fontWeight: 700, fontSize: "15px", color: "#111", margin: "0 0 8px 0", letterSpacing: "-0.01em" }}>Facilities</h3>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {facilities.map((f: string, i: number) => (
                      <span
                        key={i}
                        style={{
                          fontSize: "11px",
                          color: "#555",
                          padding: "4px 10px",
                          background: "#f5f5f5",
                          borderRadius: "6px",
                          fontWeight: 500,
                        }}
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Contact */}
              <div>
                <h3 style={{ fontWeight: 700, fontSize: "15px", color: "#111", margin: "0 0 8px 0", letterSpacing: "-0.01em" }}>Contact</h3>
                <div style={{ fontSize: "13px", color: "#555", display: "flex", flexDirection: "column", gap: "4px" }}>
                  {(property.amenities as any)?.phone && <div>📞 {(property.amenities as any).phone}</div>}
                  {(property.amenities as any)?.email && <div>✉️ {(property.amenities as any).email}</div>}
                  {(property.address || property.city) && (
                    <div>📍 {[property.address, property.city].filter(Boolean).join(", ")}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Reviews ── */}
      {tripadvisorId && (
        <div style={{ padding: "0 20px 16px" }}>
          <div style={{ background: "#fff", borderRadius: "12px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <EmbedTripAdvisorReviews tripadvisorId={tripadvisorId} brandColor={brandColor} />
          </div>
        </div>
      )}
      {reviewPlatforms.length > 0 && !tripadvisorId && (
        <div style={{ padding: "0 20px 16px" }}>
          <div style={{ background: "#fff", borderRadius: "12px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <EmbedReviewPlatforms platforms={reviewPlatforms} brandColor={brandColor} />
          </div>
        </div>
      )}
      {reviewPlatforms.length > 0 && tripadvisorId && (
        <div style={{ padding: "0 20px 16px" }}>
          <div style={{ background: "#fff", borderRadius: "12px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <EmbedReviewPlatforms platforms={reviewPlatforms.filter((p: any) => p.type !== "tripadvisor")} brandColor={brandColor} />
          </div>
        </div>
      )}

      {/* Footer */}
      {!hidePoweredBy && (
        <footer style={{ padding: "16px 20px", textAlign: "center", marginTop: "auto" }}>
          <PoweredByRolOS />
        </footer>
      )}
    </div>
  );
}
