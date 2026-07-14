import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
  FileText,
  Mail,
  Megaphone,
  Building2,
  BedDouble,
  ListChecks,
  Image as ImageIcon,
} from "lucide-react";



/**
 * ROLOS "Property Setup" hub.
 *
 * Renders the same-origin admin editor (`/admin/properties/:id`) inline
 * via an iframe running in `?embed=1` mode. This is the source of truth for
 * ROLOS-PMS booking-backend + guest-experience data (Rates, Packages,
 * Specials, Addons, House Rules, Templates, Announcements). The public
 * book. OTA reads the same tables — no dual writes.
 */

type TabKey =
  | "info-facilities"
  | "rooms"
  | "rates"
  | "packages"
  | "specials"
  | "addons"
  | "house-rules"
  | "templates"
  | "announcements";



interface Section {
  key: TabKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  hints?: { key: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
}

interface SectionGroup {
  label: string;
  sections: Section[];
}

const SECTION_GROUPS: SectionGroup[] = [
  {
    label: "Property profile",
    sections: [
      {
        key: "info-facilities",
        label: "Info & Facilities",
        icon: Building2,
        description: "Star rating, accommodation type, facilities checklist, self-catering, breakfast options and property-level info.",
      },
    ],
  },
  {
    label: "Booking backend",

    sections: [
      {
        key: "rooms",
        label: "Rooms",
        icon: BedDouble,
        description: "Room types, rate-type links, facilities, amenities, images and per-room agreements.",
        hints: [
          { key: "type", label: "Type", icon: Layers },
          { key: "rate-types", label: "Rate Types", icon: DollarSign },
          { key: "facilities", label: "Facilities", icon: ListChecks },
          { key: "amenities", label: "Amenities", icon: Sparkles },
          { key: "images", label: "Images", icon: ImageIcon },
          { key: "agreement", label: "Agreement", icon: FileText },
        ],
      },
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
    ],
  },
  {
    label: "Guest experience",
    sections: [
      {
        key: "house-rules",
        label: "House Rules",
        icon: FileText,
        description: "Check-in/out times, child/pet/smoking policy, deposits and cancellation rules.",
      },
      {
        key: "templates",
        label: "Templates",
        icon: Mail,
        description: "Confirmation, pre-stay and post-stay guest email templates.",
      },
      {
        key: "announcements",
        label: "Announcements",
        icon: Megaphone,
        description: "Dated announcement banners shown on the booking site.",
      },
    ],
  },
];

const ALL_SECTIONS: Section[] = SECTION_GROUPS.flatMap((g) => g.sections);
const VALID_TABS = new Set<TabKey>(ALL_SECTIONS.map((s) => s.key));

export default function PMSPropertySetup() {
  const { propertyId: resolvedPropertyId, properties } = usePmsPropertyId();
  const [searchParams, setSearchParams] = useSearchParams();
  const [stablePropertyId, setStablePropertyId] = useState<string | null>(() => searchParams.get("property"));

  useEffect(() => {
    if (resolvedPropertyId && resolvedPropertyId !== stablePropertyId) {
      setStablePropertyId(resolvedPropertyId);
    }
  }, [resolvedPropertyId, stablePropertyId]);

  const propertyId = stablePropertyId ?? resolvedPropertyId;
  const property = properties.find((p) => p.id === propertyId);

  const initialTab = (() => {
    const q = searchParams.get("section") as TabKey | null;
    return q && VALID_TABS.has(q) ? q : "rates";
  })();

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [iframeHeight, setIframeHeight] = useState<number>(720);
  const editorFrameRef = useRef<HTMLIFrameElement | null>(null);
  const appliedEditorSrcRef = useRef<string>("");

  useEffect(() => {
    const section = searchParams.get("section") as TabKey | null;
    if (section && VALID_TABS.has(section) && section !== activeTab) {
      setActiveTab(section);
    }
  }, [activeTab, searchParams]);

  // Change active tab AND URL together on user click. No mount-time URL writes,
  // no cross-effects with usePmsPropertyId's own ?property= sync — that combo
  // was causing the page to appear to reload continuously.
  const handleSelectTab = useCallback((key: TabKey) => {
    setActiveTab(key);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("section", key);
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const iframeSrc = useMemo(() => {
    if (!propertyId) return "";
    return `/admin/properties/${propertyId}?forceTabs=1&embed=1&tab=${activeTab}`;
  }, [propertyId, activeTab]);

  useEffect(() => {
    const frame = editorFrameRef.current;
    if (!frame || !iframeSrc) return;
    if (appliedEditorSrcRef.current !== iframeSrc) {
      appliedEditorSrcRef.current = iframeSrc;
      frame.setAttribute("src", iframeSrc);
    }
  }, [iframeSrc]);


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

  if (!propertyId) {
    return (
      <div className="p-6">
        <Alert>
          <AlertDescription>Select a property to configure its booking backend.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const activeSection = ALL_SECTIONS.find((s) => s.key === activeTab);

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
            Everything the booking engine and guest experience needs — rates, packages, specials,
            addons, house rules, templates and announcements — lives here.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => {
            // Per project domain policy: always link to the production ROLOS
            // domain (never lovable.dev / lovable.app / lovableproject.com),
            // otherwise the admin route 404s in the Lovable editor origin.
            const url = `https://sleepinafrica.roomsonline.co.za/admin/properties/${propertyId}?tab=${activeTab}`;
            window.open(url, "_blank", "noopener");
          }}

        >
          <ExternalLink className="h-3 w-3" />
          Open full editor
        </Button>
      </header>

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        {/* Left rail */}
        <nav className="space-y-4">
          {SECTION_GROUPS.map((group) => (
            <div key={group.label} className="space-y-1">
              <div className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </div>
              {group.sections.map((s) => {
                const Icon = s.icon;
                const active = activeTab === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => handleSelectTab(s.key)}
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
            </div>
          ))}
        </nav>

        {/* Editor pane — inline via same-origin iframe */}
        <div className="min-w-0 overflow-hidden rounded-lg border bg-background">
          <iframe
            ref={editorFrameRef}
            title={`${activeSection?.label ?? "Editor"} — ${property?.name ?? ""}`}
            className={cn("block w-full border-0", !iframeSrc && "hidden")}
            style={{ height: iframeHeight }}
          />
          {!iframeSrc && (
            <div className="p-6 text-sm text-muted-foreground">Loading property…</div>
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

