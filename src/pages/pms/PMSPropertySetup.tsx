import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import PropertyForm from "@/pages/PropertyForm";
import PropertyContactDetails from "@/components/property/PropertyContactDetails";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PropertySectionRail } from "@/components/property/PropertySectionRail";
import { buildSectionGroups, type PropertySectionKey } from "@/config/propertySectionOrder";

/**
 * ROLOS "Property Setup" hub.
 *
 * Source of truth for ROLOS-PMS booking-backend + guest-experience data.
 * Section order + groups come from the shared propertySectionOrder config
 * (same IA as Admin PropertyForm and the onboarding wizard).
 */

type TabKey = Extract<
  PropertySectionKey,
  | "info-facilities"
  | "rooms"
  | "rates"
  | "packages"
  | "specials"
  | "addons"
  | "house-rules"
  | "templates"
  | "announcements"
  | "contacts"
  | "images"
>;

/** Only sections that are editable inside this hub */
const HUB_KEYS: TabKey[] = [
  "info-facilities",
  "rooms",
  "rates",
  "packages",
  "specials",
  "addons",
  "house-rules",
  "templates",
  "announcements",
  "contacts",
  "images",
];

const SECTION_GROUPS = buildSectionGroups(HUB_KEYS);
const VALID_TABS = new Set<TabKey>(
  SECTION_GROUPS.flatMap((g) => g.sections.map((s) => s.key as TabKey)),
);


export default function PMSPropertySetup() {
  const { propertyId: resolvedPropertyId, properties } = usePmsPropertyId();
  const [searchParams, setSearchParams] = useSearchParams();
  const [stablePropertyId, setStablePropertyId] = useState<string | null>(() =>
    searchParams.get("property"),
  );

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

  useEffect(() => {
    const section = searchParams.get("section") as TabKey | null;
    if (section && VALID_TABS.has(section) && section !== activeTab) {
      setActiveTab(section);
    }
  }, [activeTab, searchParams]);

  const handleSelectTab = useCallback(
    (key: TabKey) => {
      setActiveTab(key);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("section", key);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

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
            <Badge variant="outline" className="text-[10px]">
              ROLOS source of truth
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {property?.name ? (
              <>
                <span className="font-medium text-foreground">{property.name}</span> ·{" "}
              </>
            ) : null}
            Rates, packages, specials, addons, house rules, templates, announcements and contacts
            live here — same tables the admin editor and book. OTA read.
          </p>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        {/* Left rail — shared IA */}
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
                      <Icon
                        className={cn(
                          "h-3.5 w-3.5",
                          active ? "text-primary" : "text-muted-foreground",
                        )}
                      />
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

        <div className="min-w-0 overflow-hidden rounded-lg border bg-background">
          {activeTab === "contacts" ? (
            <PropertyContactDetails propertyId={propertyId} />
          ) : (
            <PropertyForm
              embeddedPropertyId={propertyId}
              embeddedInitialTab={activeTab}
              embeddedOverride={true}
              forceTabsOverride={true}
            />
          )}
        </div>
      </div>

      <Alert>
        <AlertDescription className="text-[11px] text-muted-foreground">
          Changes write to the same tables the admin editor uses, so the book. OTA and ROLOS
          operations stay in sync.
        </AlertDescription>
      </Alert>
    </div>
  );
}
