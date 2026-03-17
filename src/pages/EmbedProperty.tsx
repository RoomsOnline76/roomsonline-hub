import { useParams, useSearchParams } from "react-router-dom";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays, differenceInCalendarDays, eachDayOfInterval, isAfter, isBefore, startOfDay } from "date-fns";
import { PoweredByRolOS } from "@/components/pms/PoweredByRolOS";

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

        // For ROL'OS properties, resolve rate plans for rooms missing daily_rate
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

  // Generate date columns for the grid
  const dateColumns = useMemo(() => {
    if (!checkIn) return [];
    const start = new Date(checkIn);
    const end = addDays(start, Math.max(nights, 7) - 1);
    return eachDayOfInterval({ start, end });
  }, [checkIn, nights]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: "#fafafa" }}>
        <div className="animate-pulse text-sm" style={{ color: "#999" }}>Loading...</div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: "#fafafa" }}>
        <p style={{ color: "#999" }}>Property not found</p>
      </div>
    );
  }

  const heroImage = Array.isArray(property.images) && property.images.length > 0
    ? (property.images[0] as any)?.url || property.images[0]
    : null;

  const facilities = property.amenities?.facilities || property.amenities?.general_facilities || [];

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: "#fff", minHeight: "100vh" }}>
      {/* Branded Header */}
      <header style={{ background: brandColor, color: fontColor, padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {property.brand_logo_url && (
            <img src={property.brand_logo_url} alt="" style={{ height: "32px", objectFit: "contain" }} />
          )}
          <span style={{ fontWeight: 700, fontSize: "16px" }}>{property.name}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: "13px" }}>
          <button
            onClick={() => setShowPromo(!showPromo)}
            style={{ background: "none", border: "none", color: fontColor, cursor: "pointer", textDecoration: "underline", fontSize: "13px" }}
          >
            {showPromo ? "Hide promo" : "Do you have a promo code?"}
          </button>
        </div>
      </header>

      {/* Promo code row */}
      {showPromo && (
        <div style={{ background: "#f5f5f5", padding: "8px 20px", display: "flex", alignItems: "center", gap: "8px" }}>
          <input
            type="text"
            placeholder="Enter promo code"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value)}
            style={{ padding: "6px 12px", border: "1px solid #ddd", borderRadius: "4px", fontSize: "13px", flex: 1, maxWidth: "240px" }}
          />
          <button style={{ background: brandColor, color: fontColor, border: "none", padding: "6px 16px", borderRadius: "4px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
            Apply
          </button>
        </div>
      )}

      {/* Date Picker Row */}
      <div style={{ background: "#f8f8f8", borderBottom: "1px solid #e5e5e5", padding: "12px 20px", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <label style={{ fontSize: "13px", fontWeight: 500, color: "#444" }}>Check-in</label>
          <input
            type="date"
            value={checkIn}
            min={format(today, "yyyy-MM-dd")}
            onChange={(e) => {
              setCheckIn(e.target.value);
              if (e.target.value && (!checkOut || !isAfter(new Date(checkOut), new Date(e.target.value)))) {
                setCheckOut(format(addDays(new Date(e.target.value), 1), "yyyy-MM-dd"));
              }
            }}
            style={{ padding: "6px 10px", border: "1px solid #ccc", borderRadius: "4px", fontSize: "14px" }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <label style={{ fontSize: "13px", fontWeight: 500, color: "#444" }}>Check-out</label>
          <input
            type="date"
            value={checkOut}
            min={checkIn ? format(addDays(new Date(checkIn), 1), "yyyy-MM-dd") : undefined}
            onChange={(e) => setCheckOut(e.target.value)}
            style={{ padding: "6px 10px", border: "1px solid #ccc", borderRadius: "4px", fontSize: "14px" }}
          />
        </div>
        {nights > 0 && (
          <span style={{ background: brandColor, color: fontColor, padding: "4px 12px", borderRadius: "12px", fontSize: "12px", fontWeight: 700 }}>
            {nights} night{nights !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Availability Grid */}
      <div style={{ padding: "20px", overflowX: "auto" }}>
        {roomTypes.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "#999" }}>
            <p style={{ fontSize: "16px", fontWeight: 500 }}>No rooms available</p>
            <p style={{ fontSize: "13px", marginTop: "4px" }}>Please check back soon or adjust your dates.</p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "2px solid #e5e5e5", fontWeight: 600, color: "#333", minWidth: "200px", position: "sticky", left: 0, background: "#fff", zIndex: 1 }}>
                  Room Type
                </th>
                {dateColumns.map((d) => (
                  <th key={d.toISOString()} style={{ textAlign: "center", padding: "8px 6px", borderBottom: "2px solid #e5e5e5", fontWeight: 500, color: "#666", minWidth: "70px", whiteSpace: "nowrap" }}>
                    <div style={{ fontSize: "11px", color: "#999" }}>{format(d, "EEE")}</div>
                    <div>{format(d, "d MMM")}</div>
                  </th>
                ))}
                <th style={{ textAlign: "center", padding: "8px 12px", borderBottom: "2px solid #e5e5e5", fontWeight: 600, color: "#333", minWidth: "100px" }}>
                  Total
                </th>
                <th style={{ padding: "8px", borderBottom: "2px solid #e5e5e5", minWidth: "100px" }}></th>
              </tr>
            </thead>
            <tbody>
              {roomTypes.map((room) => {
                const rate = room.daily_rate ? Number(room.daily_rate) : null;
                const rolosPlan = room.linked_rolos_id ? ratePlanMap[room.linked_rolos_id] : null;
                const effectiveRate = rate ?? (rolosPlan?.base_rate ?? null);
                const pricingModel = rolosPlan?.pricing_model;
                const isPerPerson = pricingModel === "per_person";
                const totalPrice = effectiveRate && nights > 0 ? effectiveRate * nights : null;
                const thumbnail = room.thumbnail_url || (Array.isArray(room.images) && room.images.length > 0 ? ((room.images[0] as any)?.url || room.images[0]) : null);

                return (
                  <tr key={room.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "12px", position: "sticky", left: 0, background: "#fff", zIndex: 1 }}>
                      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                        {thumbnail && (
                          <img src={thumbnail} alt="" style={{ width: "56px", height: "40px", objectFit: "cover", borderRadius: "4px", flexShrink: 0 }} />
                        )}
                        <div>
                          <div style={{ fontWeight: 600, color: "#222" }}>{room.name}</div>
                          <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>
                            {[room.max_guests && `${room.max_guests} guests`, room.beds && `${room.beds} bed${room.beds > 1 ? "s" : ""}`].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                      </div>
                    </td>
                    {dateColumns.map((d) => (
                      <td key={d.toISOString()} style={{ textAlign: "center", padding: "8px 4px" }}>
                        {effectiveRate ? (
                          <span style={{ fontSize: "12px", color: "#333", fontWeight: 500 }}>
                            R{effectiveRate.toLocaleString()}{isPerPerson ? <span style={{ fontSize: "10px", color: "#888" }}> pp</span> : null}
                          </span>
                        ) : (
                          <span style={{ fontSize: "11px", color: "#ccc" }}>—</span>
                        )}
                      </td>
                    ))}
                    <td style={{ textAlign: "center", padding: "8px 12px" }}>
                      {totalPrice ? (
                        <span style={{ fontWeight: 700, color: "#222", fontSize: "14px" }}>
                          R{totalPrice.toLocaleString()}{isPerPerson ? <span style={{ fontSize: "10px", color: "#888", fontWeight: 400 }}> pp</span> : null}
                        </span>
                      ) : (
                        <span style={{ color: "#ccc" }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "center" }}>
                      {effectiveRate && nights > 0 && (
                        <button
                          onClick={() => {
                            // Navigate to booking — pass rate data so Booking.tsx can calculate
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
                            window.location.href = `/booking/${property.slug}?${params.toString()}`;
                          }}
                          style={{ background: brandColor, color: fontColor, border: "none", padding: "6px 16px", borderRadius: "4px", fontSize: "12px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                        >
                          Book
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Property Info Section */}
      <div style={{ borderTop: "1px solid #e5e5e5", padding: "24px 20px", display: "flex", gap: "24px", flexWrap: "wrap" }}>
        {heroImage && (
          <div style={{ flex: "0 0 280px" }}>
            <img src={heroImage} alt={property.name} style={{ width: "100%", height: "180px", objectFit: "cover", borderRadius: "8px" }} />
          </div>
        )}
        <div style={{ flex: 1, minWidth: "240px" }}>
          {property.description && (
            <div style={{ marginBottom: "16px" }}>
              <h3 style={{ fontWeight: 700, fontSize: "15px", color: "#222", marginBottom: "6px" }}>About</h3>
              <p style={{ fontSize: "13px", color: "#555", lineHeight: 1.6 }}>{property.description}</p>
            </div>
          )}
          {Array.isArray(facilities) && facilities.length > 0 && (
            <div>
              <h3 style={{ fontWeight: 700, fontSize: "15px", color: "#222", marginBottom: "6px" }}>Facilities</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {facilities.map((f: string, i: number) => (
                  <span key={i} style={{ background: "#f0f0f0", padding: "3px 10px", borderRadius: "12px", fontSize: "12px", color: "#555" }}>{f}</span>
                ))}
              </div>
            </div>
          )}
          {(property.address || property.city) && (
            <p style={{ fontSize: "12px", color: "#888", marginTop: "12px" }}>
              📍 {[property.address, property.city].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid #e5e5e5", padding: "12px 20px", textAlign: "center" }}>
        <p style={{ fontSize: "10px", color: "#aaa" }}>
          Online booking powered by <strong>ROL'OS</strong> on behalf of {property.name}
        </p>
      </footer>
    </div>
  );
}
