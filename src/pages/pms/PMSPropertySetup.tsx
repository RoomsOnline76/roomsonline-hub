import { useEffect, useMemo, useRef, useState } from "react";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import {
  DollarSign,
  Package,
  Sparkles,
  ExternalLink,
  CalendarRange,
  Layers,
  Calendar,
  LayoutList,
  Wallet,
  ShieldCheck,
  CreditCard,
  Receipt,
} from "lucide-react";

/**
 * ROLOS "Property Setup" hub.
 *
 * Renders the same-origin admin editor (`/admin/edit-property/:id`) inline
 * via an iframe running in `?embed=1` mode. This is the source of truth for
 * ROLOS-PMS booking-backend data (Rates, Packages, Specials, Addons). The
 * public book. OTA reads the same tables — no dual writes.
 */

type TabKey = "rates" | "packages" | "specials" | "addons";

interface Section {
  key: TabKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  hints?: { key: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
}

const SECTIONS: Section[] = [
  {
    key: "rates",
    label: "Rates",
    icon: DollarSign,
    description: "Seasons, rate types, calendar, breakdown, charges, policies and payment providers.",
    hints: [
      { key: "seasons", label: "Seasons", icon: CalendarRange },
      { key: "types", label: "Rate Types", icon: Layers },
      { key: "calendar", label: "Calendar", icon: Calendar },
      { key: "breakdown", label: "Breakdown", icon: LayoutList },
      { key: "charges", label: "Charges", icon: Wallet },
      { key: "policies", label: "Policies", icon: ShieldCheck },
      { key: "providers", label: "Providers", icon: CreditCard },
      { key: "overview", label: "Overview", icon: Receipt },
    ],
  },
  {
    key: "packages",
    label: "Packages",
    icon: Package,
    description: "Curated stay packages that combine rooms with experiences or inclusions.",
  },
  {
    key: "specials",
    label: "Specials",
    icon: Sparkles,
    description: "Time-boxed promotional offers and discounted rate plans.",
  },
  {
    key: "addons",
    label: "Addons",
    icon: Package,
    description: "Optional guest add-ons: breakfast, transfers, activities, gifts.",
  },
];

export default function PMSPropertySetup() {
  const { propertyId, properties, loading } = usePmsPropertyId();
  const property = properties.find((p) => p.id === propertyId);
  const [activeTab, setActiveTab] = useState<TabKey>("rates");
  const [iframeHeight, setIframeHeight] = useState<number>(720);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const iframeSrc = useMemo(() => {
    if (!propertyId) return "";
    return `/admin/edit-property/${propertyId}?forceTabs=1&embed=1&tab=${activeTab}`;
  }, [propertyId, activeTab]);

  // Auto-size the iframe based on messages from the embedded PropertyForm.
  useEffect(() => {
    const onMessage = (evt: MessageEvent) => {
      if (evt.origin !== window.location.origin) return;
      const data = evt.data as { type?: string; height?: number } | null;
      if (data?.type === "rolos-embed-height" && typeof data.height === "number") {
        setIframeHeight(Math.max(600, Math.min(data.height + 40, 4000)));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Loading property…</p>
      </div>
    );
  }

  if (!propertyId) {
    return (
      <div className="p-6">
        <Alert>
          <AlertDescription>Select a property to configure its booking backend.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">Property Setup</h1>
            <Badge variant="outline" className="text-[10px]">ROLOS source of truth</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {property?.name ? (
              <>
                <span className="font-medium text-foreground">{property.name}</span> ·{" "}
              </>
            ) : null}
            Everything the booking engine needs — rates, packages, specials and addons — lives here.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => window.open(`/admin/edit-property/${propertyId}?tab=${activeTab}`, "_blank", "noopener")}
        >
          <ExternalLink className="h-3 w-3" />
          Open full editor
        </Button>
      </header>

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        {/* Left rail */}
        <nav className="space-y-1">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = activeTab === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setActiveTab(s.key)}
                className={cn(
                  "w-full rounded-md border px-3 py-2 text-left text-xs transition-colors",
                  active
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-transparent bg-muted/40 text-muted-foreground hover:border-border hover:bg-muted",
                )}
              >
                <div className="flex items-center gap-2">
                  <Icon className={cn("h-3.5 w-3.5", active ? "text-primary" : "text-muted-foreground")} />
                  <span className="font-medium">{s.label}</span>
                </div>
                <p className="mt-1 text-[10px] leading-tight opacity-80">{s.description}</p>
                {active && s.hints && (
                  <ul className="mt-2 flex flex-wrap gap-1">
                    {s.hints.map((h) => {
                      const HIcon = h.icon;
                      return (
                        <li
                          key={h.key}
                          className="flex items-center gap-1 rounded border border-border/50 bg-background/60 px-1.5 py-0.5 text-[9px] text-muted-foreground"
                        >
                          <HIcon className="h-2.5 w-2.5" />
                          {h.label}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </button>
            );
          })}
        </nav>

        {/* Editor pane — inline via same-origin iframe */}
        <div className="min-w-0 overflow-hidden rounded-lg border bg-background">
          {iframeSrc && (
            <iframe
              ref={iframeRef}
              key={iframeSrc}
              src={iframeSrc}
              title={`${SECTIONS.find((s) => s.key === activeTab)?.label ?? "Editor"} — ${property?.name ?? ""}`}
              className="block w-full border-0"
              style={{ height: iframeHeight }}
            />
          )}
        </div>
      </div>

      <Alert>
        <AlertDescription className="text-[11px] text-muted-foreground">
          Changes are written to the same tables the admin editor uses, so the book. OTA and ROLOS operations
          always stay in sync.
        </AlertDescription>
      </Alert>
    </div>
  );
}
