import { useEffect, useState, useMemo } from "react";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import { PmsNoPropertyState } from "@/components/pms/PmsNoPropertyState";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, LayoutGrid, Building2 } from "lucide-react";
import { PmsPageSkeleton } from "@/components/pms/PmsPageSkeleton";
import { RatePlansPanel } from "@/components/pms/rateplans/RatePlansPanel";

export default function PMSRatePlans() {
  const { propertyId, properties, portfolioProperties, switchProperty, loading: propertyLoading } = usePmsPropertyId();
  const scopeProperties = portfolioProperties && portfolioProperties.length > 0 ? portfolioProperties : properties;
  const currentIndex = scopeProperties.findIndex((p) => p.id === propertyId);
  const goToProperty = (offset: number) => {
    if (scopeProperties.length === 0) return;
    const next = (currentIndex + offset + scopeProperties.length) % scopeProperties.length;
    switchProperty(scopeProperties[next].id);
  };

  const [viewMode, setViewMode] = useState<"portfolio" | "single" | null>(null);
  const [userOverrode, setUserOverrode] = useState(false);

  // Default to portfolio once portfolio context is known; don't override user choice
  useEffect(() => {
    if (userOverrode || propertyLoading) return;
    if (portfolioProperties && portfolioProperties.length > 1) {
      setViewMode("portfolio");
    } else if (viewMode === null) {
      setViewMode("single");
    }
  }, [portfolioProperties, propertyLoading, userOverrode, viewMode]);

  const setViewModeManual = (m: "portfolio" | "single") => {
    setUserOverrode(true);
    setViewMode(m);
  };

  const isPortfolio = viewMode === "portfolio" && scopeProperties.length > 1;

  const surfaceProperties = useMemo(() => {
    if (viewMode === null || propertyLoading) return [];
    if (isPortfolio) return scopeProperties.map((p) => ({ id: p.id, name: p.name }));
    if (!propertyId) return [];
    return [{ id: propertyId, name: scopeProperties.find((p) => p.id === propertyId)?.name || "" }];
  }, [viewMode, propertyLoading, isPortfolio, scopeProperties, propertyId]);

  if (propertyLoading) return <PmsPageSkeleton rows={3} />;
  if (!isPortfolio && !propertyId) return <PmsNoPropertyState description="No property is assigned to this account yet, so there are no rate plans to show. Rate plans appear here once a property is linked." />;

  return (
    <RatePlansPanel
      properties={surfaceProperties}
      seedPropertyId={isPortfolio ? null : propertyId}
      showSectionHeadings={isPortfolio}
      headerExtra={
        scopeProperties.length > 1 ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setViewModeManual(viewMode === "portfolio" ? "single" : "portfolio")}
              title={viewMode === "portfolio" ? "Switch to single property" : "Switch to portfolio view"}
            >
              {viewMode === "portfolio" ? <Building2 className="h-4 w-4 mr-1" /> : <LayoutGrid className="h-4 w-4 mr-1" />}
              {viewMode === "portfolio" ? "Portfolio" : "Single"}
            </Button>
            {!isPortfolio && (
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => goToProperty(-1)} title="Previous property">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Select value={propertyId ?? undefined} onValueChange={(v) => switchProperty(v)}>
                  <SelectTrigger className="h-8 w-[220px]"><SelectValue placeholder="Select property" /></SelectTrigger>
                  <SelectContent>
                    {scopeProperties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => goToProperty(1)} title="Next property">
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground ml-1">
                  {currentIndex >= 0 ? currentIndex + 1 : "—"} / {scopeProperties.length}
                </span>
              </div>
            )}
          </>
        ) : null
      }
    />
  );
}
