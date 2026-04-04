import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tag } from "lucide-react";
import { cn } from "@/lib/utils";

interface SpecialRaw {
  id: string;
  name: string;
  description: string | null;
  special_type: string;
  discount_percent: number | null;
  fixed_amount: number | null;
  fixed_price: number | null;
  valid_from: string;
  valid_to: string;
  book_from: string | null;
  book_until: string | null;
  applicable_room_ids: string[] | null;
  age_restricted: boolean;
  age_label: string | null;
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
      return ((data || []) as unknown as SpecialRaw[]).filter((s) => {
        const inStayWindow = s.valid_from <= today && s.valid_to >= today;
      const inBookWindow = (s.book_from || s.book_until)
          ? (!s.book_from || s.book_from <= today) && (!s.book_until || s.book_until >= today)
          : false;
        return inStayWindow || inBookWindow;
      });
    },
    enabled: !!propertyId,
    staleTime: 5 * 60 * 1000,
  });

  if (!specials || specials.length === 0) return null;

  const formatDiscount = (s: SpecialRaw) => {
    const st = s.special_type || '';
    if ((st === 'discount' || st === 'percentage') && s.discount_percent) return `${s.discount_percent}% off`;
    if (st === 'fixed_off' || st === 'fixed_amount') return `R${s.fixed_amount || 0} off`;
    if (st === 'fixed_price') return `From R${s.fixed_price || 0}`;
    return s.age_label || 'Special';
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
              <p className="text-sm font-semibold text-foreground">{s.name}{s.age_restricted && s.age_label ? ` (${s.age_label})` : ''}</p>
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
  specials: SpecialRaw[] | undefined,
  roomId: string
): { label: string; color: string } | null {
  if (!specials) return null;
  const match = specials.find(
    (s) => !s.applicable_room_ids || s.applicable_room_ids.length === 0 || s.applicable_room_ids.includes(roomId)
  );
  if (!match) return null;
  const st = match.special_type || '';
  if ((st === 'discount' || st === 'percentage') && match.discount_percent) return { label: `${match.discount_percent}% off`, color: "#ef4444" };
  if (st === 'fixed_off' || st === 'fixed_amount') return { label: `R${match.fixed_amount || 0} off`, color: "#ef4444" };
  return { label: "Special", color: "#ef4444" };
}
