import { Gift, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PackageStay {
  roomName?: string;
  nights?: number;
}

interface PackageItem {
  id?: string;
  name: string;
  description?: string;
  category?: string;
  inclusions?: string[];
  stays?: PackageStay[];
  price?: number;
  validFrom?: string;
  validTo?: string;
  images?: Array<string | { url: string }>;
}

interface PackageCardsProps {
  packages: PackageItem[];
  className?: string;
  brandColor?: string;
  onBookPackage?: (pkg: PackageItem) => void;
}

export function PackageCards({ packages, className, brandColor, onBookPackage }: PackageCardsProps) {
  const now = new Date().toISOString().split("T")[0];
  const active = packages.filter((p) => {
    if (p.validFrom && now < p.validFrom) return false;
    if (p.validTo && now > p.validTo) return false;
    return true;
  });

  if (active.length === 0) return null;

  return (
    <div className={cn("space-y-4", className)}>
      <h3 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
        <Gift className="h-4 w-4 text-primary" style={brandColor ? { color: brandColor } : undefined} />
        Packages & Experiences
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {active.map((pkg, i) => {
          const img = pkg.images?.[0];
          const imgUrl = typeof img === "string" ? img : img?.url;

          return (
            <div
              key={pkg.id || i}
              className="rounded-xl border border-border/50 bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              {imgUrl && (
                <div className="h-36 bg-muted">
                  <img src={imgUrl} alt={pkg.name} className="h-full w-full object-cover" />
                </div>
              )}
              <div className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-semibold text-sm">{pkg.name}</h4>
                  {pkg.price != null && pkg.price > 0 && (
                    <span className="text-sm font-bold whitespace-nowrap">R{pkg.price.toLocaleString()}</span>
                  )}
                </div>
                {pkg.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{pkg.description}</p>
                )}
                {pkg.inclusions && pkg.inclusions.length > 0 && (
                  <ul className="text-[11px] text-muted-foreground space-y-0.5">
                    {pkg.inclusions.slice(0, 4).map((inc, j) => (
                      <li key={j} className="flex items-center gap-1">
                        <span className="text-primary" style={brandColor ? { color: brandColor } : undefined}>✓</span>
                        {inc}
                      </li>
                    ))}
                  </ul>
                )}
                {pkg.validTo && (
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Until {new Date(pkg.validTo).toLocaleDateString("en", { month: "short", day: "numeric" })}
                  </p>
                )}
                {onBookPackage && (
                  <Button
                    size="sm"
                    className="w-full h-8 text-xs"
                    style={brandColor ? { backgroundColor: brandColor, color: "#fff" } : undefined}
                    onClick={() => onBookPackage(pkg)}
                  >
                    Book Package
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
