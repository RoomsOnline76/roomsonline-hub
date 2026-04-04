import { useState } from "react";
import { X, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";

interface Announcement {
  id?: string;
  title?: string;
  message?: string;
  enabled?: boolean;
  validFrom?: string;
  validTo?: string;
  link?: string;
  linkText?: string;
}

interface AnnouncementBannerProps {
  announcements: Announcement[];
  className?: string;
  brandColor?: string;
}

export function AnnouncementBanner({ announcements, className, brandColor }: AnnouncementBannerProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const now = new Date().toISOString().split("T")[0];
  const active = announcements.filter((a) => {
    if (!a.enabled) return false;
    if (dismissed.has(a.id || a.title || "")) return false;
    if (a.validFrom && now < a.validFrom) return false;
    if (a.validTo && now > a.validTo) return false;
    return !!(a.title || a.message);
  });

  if (active.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      {active.map((a, i) => (
        <div
          key={a.id || i}
          className="relative flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3"
        >
          <Megaphone
            className="h-4 w-4 mt-0.5 shrink-0 text-primary"
            style={brandColor ? { color: brandColor } : undefined}
          />
          <div className="flex-1 min-w-0">
            {a.title && (
              <p className="text-sm font-semibold text-foreground">{a.title}</p>
            )}
            {a.message && (
              <p className="text-xs text-muted-foreground mt-0.5">{a.message}</p>
            )}
            {a.link && (
              <a
                href={a.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-primary underline mt-1 inline-block"
                style={brandColor ? { color: brandColor } : undefined}
              >
                {a.linkText || "Learn more"}
              </a>
            )}
          </div>
          <button
            onClick={() => setDismissed((prev) => new Set(prev).add(a.id || a.title || ""))}
            className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      ))}
    </div>
  );
}
