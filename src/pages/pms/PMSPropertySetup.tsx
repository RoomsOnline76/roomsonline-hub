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
  const [railCollapsed, setRailCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("property-rail-collapsed") === "1";
    } catch {
      return false;
    }
  });
  const toggleRailCollapsed = useCallback(() => {
    setRailCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("property-rail-collapsed", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

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
    <div className="property-form-dense flex h-full flex-col gap-3 p-3">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold tracking-tight">Property Setup</h1>
            <Badge variant="outline" className="text-[10px]">
              ROLOS source of truth
            </Badge>
          </div>
          <p className="text-[11px] leading-tight text-muted-foreground">
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

      <div
        className={
          railCollapsed ? "grid gap-3 lg:grid-cols-[48px_1fr]" : "grid gap-3 lg:grid-cols-[200px_1fr]"
        }
      >
        {/* Left rail — shared IA */}
        <PropertySectionRail
          groups={SECTION_GROUPS}
          activeKey={activeTab}
          onSelect={(key) => handleSelectTab(key as TabKey)}
          collapsed={railCollapsed}
          onToggleCollapsed={toggleRailCollapsed}
        />


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

      <p className="text-[11px] leading-tight text-muted-foreground">
        Changes write to the same tables the admin editor uses, so the book. OTA and ROLOS
        operations stay in sync.
      </p>
    </div>
  );
}

