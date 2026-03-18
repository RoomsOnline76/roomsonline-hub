import { useParams, useSearchParams } from "react-router-dom";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays, differenceInCalendarDays, startOfDay } from "date-fns";
import { PoweredByRolOS } from "@/components/pms/PoweredByRolOS";
import { EmbedDatePicker } from "@/components/embed/EmbedDatePicker";

export default function EmbedProperty() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const integration = searchParams.get("integration") || "widget";
  const mode = searchParams.get("mode") || "widget";
  const brandColorParam = searchParams.get("brand_color");
  const propertyId = searchParams.get("property_id");

  const [property, setProperty] = useState<any>(null);
  const [roomTypes, setRoomTypes] = useState<any[]>([]);
  const [ratePlanMap, setRatePlanMap] = useState<Record<string, { base_rate: number; pricing_model: string; adult_1_rate?: number; adult_2_rate?: number }>>({});
  const [loading, setLoading] = useState(true);

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

        if (prop.is_rol_property && rooms && rooms.some((r: any) => !r.daily_rate && r.linked_rolos_id)) {
          const rolosIds = rooms.filter((r: any) => r.linked_rolos_id).map((r: any) => r.linked_rolos_id);
          const { data: rpRoomTypes } = await supabase
            .from("rolos_rate_plan_room_types")
            .select("room_type_id, rate_plan_id, rolos_rate_plans!inner(id, base_rate, pricing_model, adult_1_rate, adult_2_rate, is_active)")
            .in("room_type_id", rolosIds)
            .eq("rolos_rate_plans.is_active", true);

          if (rpRoomTypes) {
            const map: Record<string, any> = {};
            for (const entry of rpRoomTypes) {
              const plan = (entry as any).rolos_rate_plans;
              if (plan && plan.base_rate != null) {
                map[entry.room_type_id] = {
                  base_rate: Number(plan.base_rate),
                  pricing_model: plan.pricing_model || "per_unit",
                  adult_1_rate: plan.adult_1_rate ? Number(plan.adult_1_rate) : undefined,
                  adult_2_rate: plan.adult_2_rate ? Number(plan.adult_2_rate) : undefined,
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

  const heroImage = Array.isArray(property.images) && property.images.length > 0
    ? (property.images[0] as any)?.url || property.images[0]
    : null;

  const facilities = property.amenities?.facilities || property.amenities?.general_facilities || [];

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: "#fff", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Branded Header */}
      <header style={{ background: brandColor, color: fontColor, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {property.brand_logo_url && (
            <img src={property.brand_logo_url} alt="" style={{ height: "28px", objectFit: "contain" }} />
          )}
          <span style={{ fontWeight: 700, fontSize: "15px" }}>{property.name}</span>
        </div>
        <button
          onClick={() => setShowPromo(!showPromo)}
          style={{ background: "none", border: "none", color: fontColor, cursor: "pointer", textDecoration: "underline", fontSize: "12px" }}
        >
          {showPromo ? "Hide promo" : "Promo code?"}
        </button>
      </header>

      {/* Promo code row */}
      {showPromo && (
        <div style={{ background: "#f5f5f5", padding: "8px 16px", display: "flex", alignItems: "center", gap: "8px" }}>
          <input
            type="text"
            placeholder="Enter promo code"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value)}
            style={{ padding: "6px 12px", border: "1px solid #ddd", borderRadius: "4px", fontSize: "13px", flex: 1, maxWidth: "200px" }}
          />
          <button style={{ background: brandColor, color: fontColor, border: "none", padding: "6px 14px", borderRadius: "4px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
            Apply
          </button>
        </div>
      )}

      {/* Date Picker Row */}
      <div style={{ background: "#f8f8f8", borderBottom: "1px solid #e5e5e5", padding: "12px 16px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
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
        {nights > 0 && (
          <span style={{ background: brandColor, color: fontColor, padding: "4px 12px", borderRadius: "12px", fontSize: "12px", fontWeight: 700 }}>
            {nights} night{nights !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Room Cards — responsive card layout */}
      <div style={{ padding: "16px", flex: 1 }}>
        {roomTypes.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 16px", color: "#999" }}>
            <p style={{ fontSize: "16px", fontWeight: 500 }}>No rooms available</p>
            <p style={{ fontSize: "13px", marginTop: "4px" }}>Please check back soon or adjust your dates.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
            {roomTypes.map((room) => {
              const rate = room.daily_rate ? Number(room.daily_rate) : null;
              const rolosPlan = room.linked_rolos_id ? ratePlanMap[room.linked_rolos_id] : null;
              const effectiveRate = rate ?? (rolosPlan?.base_rate ?? null);
              const pricingModel = rolosPlan?.pricing_model;
              const isPerPerson = pricingModel === "per_person";
              const totalPrice = effectiveRate && nights > 0 ? effectiveRate * nights : null;
              const thumbnail = room.thumbnail_url || (Array.isArray(room.images) && room.images.length > 0 ? ((room.images[0] as any)?.url || room.images[0]) : null);

              return (
                <div
                  key={room.id}
                  style={{
                    border: "1px solid #e5e5e5",
                    borderRadius: "10px",
                    overflow: "hidden",
                    background: "#fff",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {/* Room image */}
                  {thumbnail && (
                    <img
                      src={thumbnail}
                      alt={room.name}
                      style={{ width: "100%", height: "160px", objectFit: "cover" }}
                    />
                  )}

                  {/* Room info */}
                  <div style={{ padding: "14px 16px", flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "15px", color: "#222" }}>{room.name}</div>
                      <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>
                        {[
                          room.max_guests && `Up to ${room.max_guests} guests`,
                          room.beds && `${room.beds} bed${room.beds > 1 ? "s" : ""}`,
                          room.bedrooms && `${room.bedrooms} bedroom${room.bedrooms > 1 ? "s" : ""}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>

                    {room.description && (
                      <p style={{ fontSize: "12px", color: "#666", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {room.description}
                      </p>
                    )}

                    <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "8px", borderTop: "1px solid #f0f0f0" }}>
                      <div>
                        {effectiveRate ? (
                          <>
                            <div style={{ fontSize: "18px", fontWeight: 700, color: "#222" }}>
                              R{effectiveRate.toLocaleString()}
                              <span style={{ fontSize: "12px", fontWeight: 400, color: "#888" }}>
                                {isPerPerson ? " pp/night" : " /night"}
                              </span>
                            </div>
                            {totalPrice && (
                              <div style={{ fontSize: "12px", color: "#666" }}>
                                R{totalPrice.toLocaleString()} total{isPerPerson ? " pp" : ""}
                              </div>
                            )}
                          </>
                        ) : (
                          <div style={{ fontSize: "13px", color: "#999" }}>Rate on request</div>
                        )}
                      </div>

                      {effectiveRate && nights > 0 && (
                        <button
                          onClick={() => {
                            const params = new URLSearchParams({
                              roomTypeId: room.id,
                              roomTypeName: room.name,
                              checkIn,
                              checkOut,
                              integration,
                              property_id: property.id,
                              adults: "2",
                            });
                            if (effectiveRate) params.set("embed_rate", String(effectiveRate));
                            if (pricingModel) params.set("embed_pricing_model", pricingModel);
                            if (room.linked_rolos_id) params.set("linked_rolos_id", room.linked_rolos_id);
                            if (promoCode) params.set("voucher", promoCode);
                            if (property.brand_primary_color) params.set("brand_color", property.brand_primary_color);
                            if (property.brand_secondary_color) params.set("brand_secondary_color", property.brand_secondary_color);
                            if (property.brand_font_color) params.set("brand_font_color", property.brand_font_color);
                            window.location.href = `/booking/${property.slug}?${params.toString()}`;
                          }}
                          style={{
                            background: brandColor,
                            color: fontColor,
                            border: "none",
                            padding: "10px 20px",
                            borderRadius: "6px",
                            fontSize: "13px",
                            fontWeight: 700,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Book Now
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Property Info Section */}
      <div style={{ borderTop: "1px solid #e5e5e5", padding: "20px 16px" }}>
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          {heroImage && (
            <div style={{ flex: "0 0 auto", maxWidth: "240px", width: "100%" }}>
              <img src={heroImage} alt={property.name} style={{ width: "100%", height: "140px", objectFit: "cover", borderRadius: "8px" }} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: "200px" }}>
            {property.description && (
              <div style={{ marginBottom: "12px" }}>
                <h3 style={{ fontWeight: 700, fontSize: "14px", color: "#222", marginBottom: "4px" }}>About</h3>
                <p style={{ fontSize: "12px", color: "#555", lineHeight: 1.6, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{property.description}</p>
              </div>
            )}
            {Array.isArray(facilities) && facilities.length > 0 && (
              <div>
                <h3 style={{ fontWeight: 700, fontSize: "14px", color: "#222", marginBottom: "4px" }}>Facilities</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                  {facilities.slice(0, 8).map((f: string, i: number) => (
                    <span key={i} style={{ background: "#f0f0f0", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", color: "#555" }}>{f}</span>
                  ))}
                  {facilities.length > 8 && (
                    <span style={{ fontSize: "11px", color: "#888", padding: "2px 4px" }}>+{facilities.length - 8} more</span>
                  )}
                </div>
              </div>
            )}
            {(property.address || property.city) && (
              <p style={{ fontSize: "11px", color: "#888", marginTop: "8px" }}>
                📍 {[property.address, property.city].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid #e5e5e5", padding: "10px 16px", textAlign: "center" }}>
        <PoweredByRolOS />
      </footer>
    </div>
  );
}
