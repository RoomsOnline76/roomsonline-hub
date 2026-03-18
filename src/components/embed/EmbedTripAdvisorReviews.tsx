import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface EmbedTripAdvisorReviewsProps {
  tripadvisorId: string;
  brandColor: string;
}

interface Review {
  id?: string;
  title?: string;
  text?: string;
  rating?: number;
  published_date?: string;
  user?: { username?: string };
}

interface LocationDetails {
  name?: string;
  rating?: string;
  num_reviews?: string;
  ranking_data?: { ranking_string?: string };
  subratings?: Record<string, { name: string; value: string }>;
  rating_image_url?: string;
}

export function EmbedTripAdvisorReviews({ tripadvisorId, brandColor }: EmbedTripAdvisorReviewsProps) {
  const [details, setDetails] = useState<LocationDetails | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tripadvisorId) return;
    let cancelled = false;

    async function fetch() {
      try {
        const [detailsRes, reviewsRes] = await Promise.all([
          supabase.functions.invoke("tripadvisor-api", { body: { action: "get_location_details", locationId: tripadvisorId } }),
          supabase.functions.invoke("tripadvisor-api", { body: { action: "get_location_reviews", locationId: tripadvisorId, limit: 3 } }),
        ]);
        if (cancelled) return;
        if (detailsRes.data) setDetails(detailsRes.data);
        if (reviewsRes.data?.data) setReviews(reviewsRes.data.data);
      } catch {
        // silently fail – reviews are enhancement, not critical
      }
      setLoading(false);
    }
    fetch();
    return () => { cancelled = true; };
  }, [tripadvisorId]);

  if (loading) return <div style={{ padding: "16px", textAlign: "center", color: "#999", fontSize: "12px" }}>Loading reviews…</div>;
  if (!details) return null;

  const rating = details.rating ? parseFloat(details.rating) : 0;
  const reviewCount = details.num_reviews || "0";
  const subratings = details.subratings ? Object.values(details.subratings) : [];

  return (
    <div style={{ padding: "16px" }}>
      {/* TripAdvisor Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="12" fill="#34E0A1" />
          <circle cx="8" cy="12" r="3" fill="white" />
          <circle cx="16" cy="12" r="3" fill="white" />
          <circle cx="8" cy="12" r="1.5" fill="#333" />
          <circle cx="16" cy="12" r="1.5" fill="#333" />
          <path d="M8 9C9.5 7 14.5 7 16 9" stroke="#333" strokeWidth="1.5" fill="none" />
        </svg>
        <div>
          <div style={{ fontWeight: 700, fontSize: "14px", color: "#333" }}>TripAdvisor</div>
          <div style={{ fontSize: "11px", color: "#666" }}>{reviewCount} reviews</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ fontWeight: 700, fontSize: "20px", color: "#333" }}>{rating.toFixed(1)}</span>
          <span style={{ fontSize: "12px", color: "#666" }}>/ 5</span>
        </div>
      </div>

      {/* Rating bubbles */}
      <div style={{ display: "flex", gap: "3px", marginBottom: "12px" }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <div
            key={n}
            style={{
              width: "18px",
              height: "18px",
              borderRadius: "50%",
              background: n <= Math.round(rating) ? "#34E0A1" : "#e5e5e5",
              border: "2px solid " + (n <= Math.round(rating) ? "#00AA6C" : "#ddd"),
            }}
          />
        ))}
      </div>

      {/* Subratings */}
      {subratings.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", marginBottom: "16px" }}>
          {subratings.map((sr) => (
            <div key={sr.name} style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
              <span style={{ color: "#666" }}>{sr.name}</span>
              <span style={{ fontWeight: 600, color: "#333" }}>{parseFloat(sr.value).toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Recent reviews */}
      {reviews.length > 0 && (
        <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: "12px" }}>
          <div style={{ fontWeight: 600, fontSize: "12px", color: "#333", marginBottom: "8px" }}>Recent Reviews</div>
          {reviews.map((r, i) => (
            <div key={r.id || i} style={{ marginBottom: "12px", paddingBottom: "12px", borderBottom: i < reviews.length - 1 ? "1px solid #f5f5f5" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                <div style={{ display: "flex", gap: "2px" }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <div key={n} style={{ width: "10px", height: "10px", borderRadius: "50%", background: n <= (r.rating || 0) ? "#34E0A1" : "#e5e5e5" }} />
                  ))}
                </div>
                {r.user?.username && <span style={{ fontSize: "11px", color: "#888" }}>{r.user.username}</span>}
              </div>
              {r.title && <div style={{ fontWeight: 600, fontSize: "12px", color: "#333", marginBottom: "2px" }}>{r.title}</div>}
              {r.text && (
                <p style={{ fontSize: "11px", color: "#555", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", margin: 0 }}>
                  {r.text}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Link to TripAdvisor */}
      <a
        href={`https://www.tripadvisor.com/attraction_review-d${tripadvisorId}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: "inline-block", fontSize: "11px", color: brandColor, textDecoration: "underline", marginTop: "4px" }}
      >
        View all reviews on TripAdvisor →
      </a>
    </div>
  );
}
