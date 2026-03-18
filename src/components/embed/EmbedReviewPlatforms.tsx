interface ReviewPlatform {
  type: string;
  id?: string;
  place_id?: string;
  url?: string;
  rating?: number;
  review_count?: number;
  enabled: boolean;
}

interface EmbedReviewPlatformsProps {
  platforms: ReviewPlatform[];
  brandColor: string;
}

const platformMeta: Record<string, { label: string; icon: string; color: string; buildUrl: (p: ReviewPlatform) => string }> = {
  google: {
    label: "Google Reviews",
    icon: "G",
    color: "#4285F4",
    buildUrl: (p) => p.place_id ? `https://search.google.com/local/reviews?placeid=${p.place_id}` : (p.url || "#"),
  },
  tripadvisor: {
    label: "TripAdvisor",
    icon: "TA",
    color: "#34E0A1",
    buildUrl: (p) => p.id ? `https://www.tripadvisor.com/attraction_review-d${p.id}` : (p.url || "#"),
  },
  booking_com: {
    label: "Booking.com",
    icon: "B",
    color: "#003580",
    buildUrl: (p) => p.url || "#",
  },
};

export function EmbedReviewPlatforms({ platforms, brandColor }: EmbedReviewPlatformsProps) {
  const enabled = platforms.filter((p) => p.enabled && platformMeta[p.type]);
  if (enabled.length === 0) return null;

  return (
    <div style={{ padding: "16px" }}>
      <div style={{ fontWeight: 700, fontSize: "13px", color: "#333", marginBottom: "10px" }}>Guest Ratings</div>
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        {enabled.map((p) => {
          const meta = platformMeta[p.type];
          const url = meta.buildUrl(p);
          return (
            <a
              key={p.type}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 14px",
                border: "1px solid #e5e5e5",
                borderRadius: "8px",
                textDecoration: "none",
                background: "#fafafa",
                transition: "border-color 0.15s",
                cursor: "pointer",
                minWidth: "140px",
              }}
            >
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "6px",
                  background: meta.color,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: "11px",
                }}
              >
                {meta.icon}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: "12px", color: "#333" }}>{meta.label}</div>
                {p.rating && (
                  <div style={{ fontSize: "11px", color: "#666" }}>
                    {p.rating.toFixed(1)} / 5
                    {p.review_count ? ` · ${p.review_count} reviews` : ""}
                  </div>
                )}
                {!p.rating && <div style={{ fontSize: "10px", color: "#999" }}>View reviews →</div>}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
