import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tag } from "lucide-react";
import { cn } from "@/lib/utils";

interface Special {
  id: string;
  name: string;
  description: string | null;
  discount_type: string;
  discount_value: number;
  valid_from: string;
  valid_to: string;
  book_from: string | null;
  book_until: string | null;
  applicable_room_ids: string[] | null;
}

interface SpecialsBannerProps {
  propertyId: string;
  className?: string;
  brandColor?: string;
}

export function SpecialsBanner({ propertyId, className, brandColor }: SpecialsBannerProps) {
  const { data: specials } = useQuery({
    queryKey: ["property-specials-public", propertyId],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data } = await supabase
        .from("property_specials" as any)
        .select("*")
        .eq("property_id", propertyId)
        .eq("is_active", true)
        .order("valid_to", { ascending: true });
      // Filter client-side: show if today is within stay window OR booking window
      return ((data || []) as unknown as Special[]).filter((s) => {
        const inStayWindow = s.valid_from <= today && s.valid_to >= today;
        const inBookWindow = s.book_from && s.book_until
          ? s.book_from <= today && s.book_until >= today
          : false;
        return inStayWindow || inBookWindow;
      });
    },
    enabled: !!propertyId,
    staleTime: 5 * 60 * 1000,
  });

  if (!specials || specials.length === 0) return null;

  const formatDiscount = (s: Special) => {
    if (s.discount_type === "percentage") return `${s.discount_value}% off`;
    if (s.discount_type === "fixed_amount") return `R${s.discount_value} off`;
    if (s.discount_type === "fixed_price") return `From R${s.discount_value}`;
    return s.discount_type;
  };

  return (
    <div className={cn("space-y-2", className)}>
      {specials.map((s) => (
        <div
          key={s.id}
          className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3"
        >
          <div
            className="shrink-0 mt-0.5 h-7 w-7 rounded-full flex items-center justify-center bg-primary/10"
            style={brandColor ? { backgroundColor: `${brandColor}15` } : undefined}
          >
            <Tag
              className="h-3.5 w-3.5 text-primary"
              style={brandColor ? { color: brandColor } : undefined}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground">{s.name}</p>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary text-primary-foreground"
                style={brandColor ? { backgroundColor: brandColor, color: "#fff" } : undefined}
              >
                {formatDiscount(s)}
              </span>
            </div>
            {s.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
            )}
            <p className="text-[10px] text-muted-foreground mt-1">
              Valid until {new Date(s.valid_to).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Helper: check if a room has an active special */
export function getRoomSpecialBadge(
  specials: Special[] | undefined,
  roomId: string
): { label: string; color: string } | null {
  if (!specials) return null;
  const match = specials.find(
    (s) => !s.applicable_room_ids || s.applicable_room_ids.length === 0 || s.applicable_room_ids.includes(roomId)
  );
  if (!match) return null;
  if (match.discount_type === "percentage") return { label: `${match.discount_value}% off`, color: "#ef4444" };
  if (match.discount_type === "fixed_amount") return { label: `R${match.discount_value} off`, color: "#ef4444" };
  return { label: "Special", color: "#ef4444" };
}
