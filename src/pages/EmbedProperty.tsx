import { useParams, useSearchParams } from "react-router-dom";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays, differenceInCalendarDays, startOfDay, eachDayOfInterval } from "date-fns";
import { PoweredByRolOS } from "@/components/pms/PoweredByRolOS";
import { EmbedDatePicker } from "@/components/embed/EmbedDatePicker";
import { EmbedAvailabilityGrid } from "@/components/embed/EmbedAvailabilityGrid";
import { EmbedTripAdvisorReviews } from "@/components/embed/EmbedTripAdvisorReviews";
import { EmbedReviewPlatforms } from "@/components/embed/EmbedReviewPlatforms";

export default function EmbedProperty() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const integration = searchParams.get("integration") || "widget";
  const mode = searchParams.get("mode") || "widget";
  const brandColorParam = searchParams.get("brand_color");
  const propertyId = searchParams.get("property_id");

  const [property, setProperty] = useState<any>(null);
  const [roomTypes, setRoomTypes] = useState<any[]>([]);
  const [ratePlanMap, setRatePlanMap] = useState<Record<string, { base_rate: number; pricing_model: string }>>({});
  const [loading, setLoading] = useState(true);
  const [showCalendar, setShowCalendar] = useState(true);

  const today = startOfDay(new Date());
  const [checkIn, setCheckIn] = useState<string>(format(today, "yyyy-MM-dd"));
  const [checkOut, setCheckOut] = useState<string>(format(addDays(today, 2), "yyyy-MM-dd"));
  const [promoCode, setPromoCode] = useState("");
  const [showPromo, setShowPromo] = useState(false);

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

        // Fetch ROL'OS rate plans for rooms that lack a daily rate
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

  // Track embed load
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
  const fontColor = property?.brand_font_color || "#ffffff";

  const nights = useMemo(() => {
    if (!checkIn || !checkOut) return 0;
    const diff = differenceInCalendarDays(new Date(checkOut), new Date(checkIn));
    return diff > 0 ? diff : 0;
  }, [checkIn, checkOut]);

  // Build availability grid data from rooms + rates
  const gridRooms = useMemo(() => {
    if (!checkIn) return [];
    const start = new Date(checkIn);
    const dates = eachDayOfInterval({ start, end: addDays(start, 13) });

    return roomTypes.map((room) => {
      const rate = room.daily_rate ? Number(room.daily_rate) : null;
      const rolosPlan = room.linked_rolos_id ? ratePlanMap[room.linked_rolos_id] : null;

      // Wizard fallback
      const amenitiesData = property?.amenities as any;
      const wizardRooms = Array.isArray(amenitiesData?.room_types) ? amenitiesData.room_types : [];
      const wizardRateTypes = Array.isArray(amenitiesData?.pms_rate_types) ? amenitiesData.pms_rate_types : [];
      const wizardRoom = wizardRooms.find((wr: any) => String(wr?.id) === String(room.id) || wr?.name === room.name);
      const linkedRateTypeId = Array.isArray(wizardRoom?.linkedRateTypes) ? wizardRoom.linkedRateTypes[0] : undefined;
      const linkedRateType = linkedRateTypeId ? wizardRateTypes.find((rt: any) => String(rt?.id) === String(linkedRateTypeId)) : null;
      const wizardRate = linkedRateType?.baseRate != null ? Number(linkedRateType.baseRate) : wizardRoom?.baseRate != null ? Number(wizardRoom.baseRate) : null;

      const effectiveRate = rate ?? (rolosPlan?.base_rate ?? wizardRate ?? null);

      const ratesByDate: Record<string, number | null> = {};
      dates.forEach((d) => {
        ratesByDate[format(d, "yyyy-MM-dd")] = effectiveRate;
      });

      return {
        roomId: room.id,
        roomName: room.name,
        maxGuests: room.max_guests,
        beds: room.beds,
        ratesByDate,
      };
    });
  }, [roomTypes, ratePlanMap, checkIn, property]);

  // TripAdvisor ID resolution
  const tripadvisorId = useMemo(() => {
    if (!property?.amenities) return null;
    const a = property.amenities as any;
    return a.tripadvisor_id || a.external_ids?.tripadvisor_id || null;
  }, [property]);

  // Review platforms
  const reviewPlatforms = useMemo(() => {
    if (!property?.amenities) return [];
    const a = property.amenities as any;
    const platforms = a.review_platforms || [];
    // Auto-include tripadvisor if ID exists but not in platforms
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
  const heroImage = images.length > 0 ? ((images[0] as any)?.url || images[0]) : null;
  const galleryImages = images.slice(0, 6).map((img: any) => img?.url || img);
  const facilities = property.amenities?.facilities || property.amenities?.general_facilities || [];

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: "#fff", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* ── Section A: Branded Header ── */}
      <header style={{ background: brandColor, color: fontColor, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {property.brand_logo_url && (
            <img src={property.brand_logo_url} alt="" style={{ height: "28px", objectFit: "contain" }} />
          )}
          <span style={{ fontWeight: 700, fontSize: "15px" }}>{property.name}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button onClick={() => setShowPromo(!showPromo)} style={{ background: "none", border: "none", color: fontColor, cursor: "pointer", textDecoration: "underline", fontSize: "11px" }}>
            {showPromo ? "Hide promo" : "Promo code?"}
          </button>
        </div>
      </header>

      {/* Promo row */}
      {showPromo && (
        <div style={{ background: "#f5f5f5", padding: "6px 16px", display: "flex", alignItems: "center", gap: "8px" }}>
          <input type="text" placeholder="Enter promo code" value={promoCode} onChange={(e) => setPromoCode(e.target.value)} style={{ padding: "5px 10px", border: "1px solid #ddd", borderRadius: "4px", fontSize: "12px", flex: 1, maxWidth: "180px" }} />
          <button style={{ background: brandColor, color: fontColor, border: "none", padding: "5px 12px", borderRadius: "4px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>Apply</button>
        </div>
      )}

      {/* ── Section B: Date Controls Row (NightsBridge-style) ── */}
      <div style={{ background: "#f8f8f8", borderBottom: "1px solid #e0e0e0", padding: "8px 16px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", fontSize: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ fontWeight: 600, color: "#555" }}>Check-in</span>
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
          <span style={{ background: brandColor, color: fontColor, padding: "3px 10px", borderRadius: "10px", fontSize: "11px", fontWeight: 700 }}>
            {nights} night{nights !== 1 ? "s" : ""}
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
          <button
            onClick={() => setShowCalendar(!showCalendar)}
            style={{ background: "#fff", border: "1px solid #ddd", borderRadius: "4px", padding: "4px 10px", fontSize: "11px", cursor: "pointer", color: "#555", fontWeight: 500 }}
          >
            {showCalendar ? "Hide Calendar" : "Show Calendar"}
          </button>
        </div>
      </div>

      {/* ── Section C: Availability Calendar Grid ── */}
      {showCalendar && (
        <div style={{ borderBottom: "1px solid #e5e5e5" }}>
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

      {/* ── Section D: Property Info (NightsBridge-style) ── */}
      <div style={{ padding: "20px 16px", borderBottom: "1px solid #e5e5e5" }}>
        <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
          {/* Left: Images */}
          <div style={{ flex: "0 0 auto", maxWidth: "320px", width: "100%" }}>
            {heroImage && (
              <img src={heroImage} alt={property.name} style={{ width: "100%", height: "200px", objectFit: "cover", borderRadius: "8px", marginBottom: "8px" }} />
            )}
            {galleryImages.length > 1 && (
              <div style={{ display: "flex", gap: "4px", overflowX: "auto" }}>
                {galleryImages.slice(1).map((img: string, i: number) => (
                  <img key={i} src={img} alt="" style={{ width: "60px", height: "44px", objectFit: "cover", borderRadius: "4px", flexShrink: 0 }} />
                ))}
              </div>
            )}
          </div>

          {/* Right: Info */}
          <div style={{ flex: 1, minWidth: "220px" }}>
            {property.description && (
              <div style={{ marginBottom: "16px" }}>
                <h3 style={{ fontWeight: 700, fontSize: "14px", color: "#222", margin: "0 0 6px 0" }}>About us</h3>
                <p style={{ fontSize: "12px", color: "#555", lineHeight: 1.6, margin: 0 }}>{property.description}</p>
              </div>
            )}

            {Array.isArray(facilities) && facilities.length > 0 && (
              <div style={{ marginBottom: "16px" }}>
                <h3 style={{ fontWeight: 700, fontSize: "14px", color: "#222", margin: "0 0 6px 0" }}>General facilities</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 16px" }}>
                  {facilities.map((f: string, i: number) => (
                    <div key={i} style={{ fontSize: "11px", color: "#555", padding: "2px 0", display: "flex", alignItems: "center", gap: "4px" }}>
                      <span style={{ color: brandColor, fontSize: "8px" }}>●</span> {f}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Contact info */}
            <div>
              <h3 style={{ fontWeight: 700, fontSize: "14px", color: "#222", margin: "0 0 6px 0" }}>Contact information</h3>
              <div style={{ fontSize: "12px", color: "#555" }}>
                {(property.amenities as any)?.phone && <div style={{ marginBottom: "2px" }}>📞 {(property.amenities as any).phone}</div>}
                {(property.amenities as any)?.email && <div style={{ marginBottom: "2px" }}>✉️ {(property.amenities as any).email}</div>}
                {(property.address || property.city) && (
                  <div>📍 {[property.address, property.city].filter(Boolean).join(", ")}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section E: TripAdvisor Reviews ── */}
      {tripadvisorId && (
        <div style={{ borderBottom: "1px solid #e5e5e5" }}>
          <EmbedTripAdvisorReviews tripadvisorId={tripadvisorId} brandColor={brandColor} />
        </div>
      )}

      {/* ── Section F: Other Review Platforms ── */}
      {reviewPlatforms.length > 0 && !tripadvisorId && (
        <div style={{ borderBottom: "1px solid #e5e5e5" }}>
          <EmbedReviewPlatforms platforms={reviewPlatforms} brandColor={brandColor} />
        </div>
      )}
      {reviewPlatforms.length > 0 && tripadvisorId && (
        <div style={{ borderBottom: "1px solid #e5e5e5" }}>
          <EmbedReviewPlatforms platforms={reviewPlatforms.filter((p: any) => p.type !== "tripadvisor")} brandColor={brandColor} />
        </div>
      )}

      {/* Footer */}
      <footer style={{ borderTop: "1px solid #e5e5e5", padding: "10px 16px", textAlign: "center", marginTop: "auto" }}>
        <PoweredByRolOS />
      </footer>
    </div>
  );
}
