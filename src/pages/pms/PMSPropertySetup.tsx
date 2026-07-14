import { useNavigate } from "react-router-dom";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  DollarSign,
  Package,
  Calendar,
  Sparkles,
  ArrowRight,
  CalendarRange,
  Layers,
  Wallet,
  ShieldCheck,
  CreditCard,
  LayoutList,
  Receipt,
} from "lucide-react";

/**
 * ROLOS "Property Setup" hub — source of truth for the booking backend.
 *
 * Rates / Packages / Specials / Addons are managed here for ROLOS-PMS
 * properties. Each editor is the same one used by /admin/edit-property,
 * opened with ?forceTabs=1 so ROLOS-hidden tabs remain reachable through
 * this hub. That guarantees ROLOS and the admin OTA read the same rows.
 */

interface SubSection {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  hint: string;
}

interface Section {
  tab: "rates" | "packages" | "specials" | "addons";
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  subsections?: SubSection[];
}

const SECTIONS: Section[] = [
  {
    tab: "rates",
    title: "Rates",
    icon: DollarSign,
    description: "Seasons, rate types, calendar pricing, charges, cancellation policies and payment providers.",
    subsections: [
      { key: "seasons", label: "Seasons", icon: CalendarRange, hint: "Define seasonal date ranges" },
      { key: "types", label: "Rate Types", icon: Layers, hint: "Rate plans applied per season" },
      { key: "calendar", label: "Calendar", icon: Calendar, hint: "Per-night rate calendar view" },
      { key: "breakdown", label: "Rate Breakdown", icon: LayoutList, hint: "Adult / teen / child tiers" },
      { key: "charges", label: "Charges", icon: Wallet, hint: "Mandatory & optional charges" },
      { key: "policies", label: "Policies", icon: ShieldCheck, hint: "Cancellation & booking rules" },
      { key: "payment-providers", label: "Payment Providers", icon: CreditCard, hint: "Gateway configuration" },
      { key: "overview", label: "Overview", icon: Receipt, hint: "Summary of all rate settings" },
    ],
  },
  {
    tab: "packages",
    title: "Packages",
    icon: Package,
    description: "Curated stay packages that combine rooms with experiences or inclusions.",
  },
  {
    tab: "specials",
    title: "Specials",
    icon: Sparkles,
    description: "Time-boxed promotional offers and discounted rate plans.",
  },
  {
    tab: "addons",
    title: "Addons",
    icon: Package,
    description: "Optional guest add-ons: breakfast, transfers, activities, gifts.",
  },
];

export default function PMSPropertySetup() {
  const navigate = useNavigate();
  const { propertyId, properties, loading } = usePmsPropertyId();

  const property = properties.find((p) => p.id === propertyId);

  const openEditor = (tab: Section["tab"]) => {
    if (!propertyId) return;
    navigate(`/admin/edit-property/${propertyId}?forceTabs=1&tab=${tab}&from=pms-setup`);
  };

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
    <div className="p-6 space-y-6 max-w-6xl">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Property Setup</h1>
          <Badge variant="outline" className="text-[10px]">ROLOS source of truth</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {property?.name ? <><span className="font-medium text-foreground">{property.name}</span> · </> : null}
          Everything the booking engine needs — rates, packages, specials and addons — is managed here.
          The public book. OTA reads the same data.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <Card key={section.tab} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-md bg-primary/10 p-2">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{section.title}</CardTitle>
                  </div>
                  <Button size="sm" onClick={() => openEditor(section.tab)}>
                    Manage
                    <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </div>
                <CardDescription className="pt-1">{section.description}</CardDescription>
              </CardHeader>
              {section.subsections && (
                <CardContent className="pt-0">
                  <ul className="grid grid-cols-2 gap-2">
                    {section.subsections.map((sub) => {
                      const SubIcon = sub.icon;
                      return (
                        <li
                          key={sub.key}
                          className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5"
                        >
                          <SubIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <div className="text-xs font-medium truncate">{sub.label}</div>
                            <div className="text-[10px] text-muted-foreground truncate">{sub.hint}</div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      <Alert>
        <AlertDescription className="text-xs text-muted-foreground">
          Changes made in Property Setup are stored in the same tables the admin editor uses, so the
          book. OTA and ROLOS operations always stay in sync.
        </AlertDescription>
      </Alert>
    </div>
  );
}
