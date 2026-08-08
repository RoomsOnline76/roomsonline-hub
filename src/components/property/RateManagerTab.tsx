import { useMemo, useState } from "react";
import { isRolosPms } from "@/lib/pmsUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon, Plus, Minus, Trash2, Copy, Edit, DollarSign, Calendar, Cloud } from "lucide-react";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ACCOMMODATION_LABEL_OPTIONS } from "@/lib/accommodationLabels";
import { AdditionalChargesManager } from "@/components/charges";
import SeasonsCalendar from "@/components/property/SeasonsCalendar";
import { SyncRatesDialog } from "@/components/property/SyncRatesDialog";
import { PoliciesTab } from "@/components/property/PoliciesTab";
import { useToast } from "@/hooks/use-toast";

// ── Types ──────────────────────────────────────────────────────────────────
type RateField = "roomAmount" | "adultAmount" | "teenAmount" | "childAmount" | "infantAmount";

export interface RateType {
  id: number | string;
  name: string;
  description?: string | null;
  priceType?: string | null;
  minAdvanceDays?: number | null;
  maxAdvanceDays?: number | null;
  minStayDays?: number | null;
  maxStayDays?: number | null;
  minNights?: number | null;
  maxNights?: number | null;
  stayPayStayNights?: number | null;
  stayPayDiscountNights?: number | null;
  stayPayDiscountPercentage?: number | null;
  baseRate?: number | null;
  pricingModel?: string | null;
  adult1Rate?: number | null;
  adult2Rate?: number | null;
  teenRate?: number | null;
  childRate?: number | null;
  infantRate?: number | null;
  pms_synced?: boolean;
  linkedRoomId?: string | null;
}

export type SeasonRates = Record<
  string,
  Record<string, { roomAmount: number; adultAmount: number; teenAmount: number; childAmount: number; infantAmount: number }>
>;

export interface RateManagerTabProps {
  propertyId: string | null;
  roomTypes: any[];
  selectedRoomType: string;
  setSelectedRoomType: (id: string) => void;
  pmsRateTypes: RateType[];
  setPmsRateTypes: React.Dispatch<React.SetStateAction<RateType[]>>;
  seasons: any[];
  setSeasons: React.Dispatch<React.SetStateAction<any[]>>;
  seasonRates: SeasonRates;
  setSeasonRates: React.Dispatch<React.SetStateAction<SeasonRates>>;
  selectedPMS: string;
  isRolProperty: boolean;
  accommodationLabel: string;
  selectedMealTypes: string[];
  formData: { currency?: string; owner_email?: string };
  amenities: any;
  isAdmin?: boolean;
  isDev?: boolean;
  isFearlessLeader?: boolean;
  setIsDirty: (dirty: boolean) => void;
  /** Navigate the parent form to the Specials tab. */
  onOpenSpecials?: () => void;
  /** Extra content rendered inside the Policies sub-tab (house rules & stay terms). */
  policiesExtra?: React.ReactNode;
  /**
   * Which surface to render. Charges and Policies are now standalone sections in the
   * property setup rail; "rates" keeps only Calendar / Seasons (and legacy rate types
   * for non-ROL'OS properties). Rate Plans live on their own ROL'OS master page.
   */
  view?: "rates" | "charges" | "policies";

}

export function RateManagerTab({
  propertyId,
  roomTypes,
  selectedRoomType,
  setSelectedRoomType,
  pmsRateTypes,
  setPmsRateTypes,
  seasons,
  setSeasons,
  seasonRates,
  setSeasonRates,
  selectedPMS,
  isRolProperty,
  accommodationLabel,
  selectedMealTypes,
  formData,
  amenities,
  isAdmin,
  setIsDirty,
  onOpenSpecials,
  policiesExtra,
  view = "rates",
}: RateManagerTabProps) {

  const { toast } = useToast();

  /** ROL'OS-managed properties never edit rates from Admin — ROL'OS is the source of truth. */
  const isRolosProperty = isRolosPms(selectedPMS);

  // ── Local state ────────────────────────────────────────────────────────
  const defaultTab =
    view === "charges" ? "charges" : view === "policies" ? "policies" : isRolosProperty ? "seasons-calendar" : "rate-types";
  const [activeTab, setActiveTab] = useState<string>(defaultTab);
  /** Keep hidden sub-tabs unreachable for ROL'OS properties. */
  const effectiveTab =
    view !== "rates"
      ? defaultTab
      : ["rate-plans", "rate-breakdown"].includes(activeTab) ||
          (isRolosProperty && ["rate-types", "season"].includes(activeTab))
        ? "seasons-calendar"
        : activeTab;
  const [isSeasonDialogOpen, setIsSeasonDialogOpen] = useState(false);
  const [editingSeason, setEditingSeason] = useState<any>(null);
  const [expandedSeasons, setExpandedSeasons] = useState<Record<string, boolean>>({});
  const [expandedMealTypes, setExpandedMealTypes] = useState<Record<string, boolean>>({});
  const [syncRateTypesOpen, setSyncRateTypesOpen] = useState(false);
  const [syncSeasonsOpen, setSyncSeasonsOpen] = useState(false);
  const [rateBreakdownGroupBy, setRateBreakdownGroupBy] = useState<"season" | "mealType">("season");
  const [seasonForm, setSeasonForm] = useState({ name: "", from: "", to: "", minStay: 1, maxStay: 0 });

  // ── Helpers ────────────────────────────────────────────────────────────
  const toggleSeasonExpanded = (seasonId: string) => {
    setExpandedSeasons((prev) => ({ ...prev, [seasonId]: !prev[seasonId] }));
  };

  const toggleMealTypeExpanded = (mealType: string) => {
    setExpandedMealTypes((prev) => ({ ...prev, [mealType]: !prev[mealType] }));
  };

  const getRoomLinkedRateTypes = (roomId: string): (number | string)[] => {
    const room = roomTypes.find((r: any) => r.id === roomId);
    return room?.linkedRateTypes || [];
  };

  const getSeasonRate = (roomId: string, seasonId: string, field: RateField) => {
    return seasonRates[roomId]?.[seasonId]?.[field] || 0;
  };

  const updateSeasonRate = (roomId: string, seasonId: string, field: RateField, value: number) => {
    setSeasonRates((prev) => ({
      ...prev,
      [roomId]: {
        ...prev[roomId],
        [seasonId]: {
          ...prev[roomId]?.[seasonId],
          [field]: value,
        },
      },
    }));
    setIsDirty(true);
  };

  const generateSeasonTitle = (from: string, to: string) => {
    if (!from || !to) return "";
    return `${format(new Date(from), "dd/MM/yyyy")}-${format(new Date(to), "dd/MM/yyyy")}`;
  };

  // ── Season CRUD ────────────────────────────────────────────────────────
  const openAddSeasonDialog = () => {
    setEditingSeason(null);
    setSeasonForm({ name: "", from: "", to: "", minStay: 1, maxStay: 0 });
    setIsSeasonDialogOpen(true);
  };

  const openEditSeasonDialog = (season: any) => {
    setEditingSeason(season);
    setSeasonForm({
      name: season.name || season.title || "",
      from: season.from,
      to: season.to,
      minStay: season.minStay || 1,
      maxStay: season.maxStay || 0,
    });
    setIsSeasonDialogOpen(true);
  };

  const saveSeason = () => {
    if (!seasonForm.from || !seasonForm.to) {
      toast({ title: "Error", description: "Please select start and end dates", variant: "destructive" });
      return;
    }
    const title = seasonForm.name || generateSeasonTitle(seasonForm.from, seasonForm.to);
    if (editingSeason) {
      setSeasons(
        seasons.map((s) => {
          if (s.id !== editingSeason.id) return s;
          const updatedSeason: any = { ...s, name: seasonForm.name, title, from: seasonForm.from, to: seasonForm.to, minStay: seasonForm.minStay, maxStay: seasonForm.maxStay };
          const existingPeriods = s.periods && s.periods.length > 0 ? [...s.periods] : [];
          if (existingPeriods.length > 0) {
            existingPeriods[0] = { from: seasonForm.from, to: seasonForm.to };
            updatedSeason.periods = existingPeriods;
          } else {
            updatedSeason.periods = [{ from: seasonForm.from, to: seasonForm.to }];
          }
          return updatedSeason;
        }),
      );
      toast({ title: "Season updated", description: "Season has been updated successfully." });
    } else {
      const newSeason = {
        id: Date.now().toString(),
        name: seasonForm.name,
        title,
        from: seasonForm.from,
        to: seasonForm.to,
        periods: [{ from: seasonForm.from, to: seasonForm.to }],
        minStay: seasonForm.minStay,
        maxStay: seasonForm.maxStay,
      };
      setSeasons([...seasons, newSeason]);
      toast({ title: "Season created", description: "New season has been added." });
    }
    setIsSeasonDialogOpen(false);
    setIsDirty(true);
  };

  const createDefaultSeasons = () => {
    const currentYear = new Date().getFullYear();
    const defaultSeasons = [
      { id: `summer-${Date.now()}`, name: "Summer (Peak)", title: "Summer (Peak)", from: `${currentYear}-12-01`, to: `${currentYear + 1}-02-28`, periods: [{ from: `${currentYear}-12-01`, to: `${currentYear + 1}-02-28` }], minStay: 2, maxStay: 0 },
      { id: `autumn-${Date.now() + 1}`, name: "Autumn (Shoulder)", title: "Autumn (Shoulder)", from: `${currentYear}-03-01`, to: `${currentYear}-05-31`, periods: [{ from: `${currentYear}-03-01`, to: `${currentYear}-05-31` }], minStay: 1, maxStay: 0 },
      { id: `winter-${Date.now() + 2}`, name: "Winter (Low)", title: "Winter (Low)", from: `${currentYear}-06-01`, to: `${currentYear}-08-31`, periods: [{ from: `${currentYear}-06-01`, to: `${currentYear}-08-31` }], minStay: 1, maxStay: 0 },
      { id: `spring-${Date.now() + 3}`, name: "Spring (Shoulder)", title: "Spring (Shoulder)", from: `${currentYear}-09-01`, to: `${currentYear}-11-30`, periods: [{ from: `${currentYear}-09-01`, to: `${currentYear}-11-30` }], minStay: 1, maxStay: 0 },
    ];
    setSeasons(defaultSeasons);
    setIsDirty(true);
    toast({ title: "Default seasons created", description: "4 Southern Hemisphere seasons have been added." });
  };

  const deleteSeason = (seasonId: string) => {
    setSeasons(seasons.filter((s) => s.id !== seasonId));
    const updatedRates = { ...seasonRates };
    Object.keys(updatedRates).forEach((roomId) => {
      if (updatedRates[roomId][seasonId]) {
        delete updatedRates[roomId][seasonId];
      }
    });
    setSeasonRates(updatedRates);
    setIsDirty(true);
    toast({ title: "Season deleted", description: "Season has been removed." });
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex gap-3 h-[calc(100vh-230px)] min-h-[520px]">
      {/* Left Sidebar - Room Types List (rates surface only) */}
      {view === "rates" && (
        <div className="w-44 shrink-0 overflow-y-auto border-r bg-muted/30 p-1.5 space-y-px">
          <div className="flex items-center justify-between mb-2 px-1">
            <h3 className="font-semibold text-xs text-muted-foreground">
              {(accommodationLabel ? ACCOMMODATION_LABEL_OPTIONS.find((o) => o.value === accommodationLabel)?.label?.toUpperCase() : "ROOM")} TYPES
            </h3>
          </div>
          {roomTypes.map((room) => (
            <div
              key={room.id}
              onClick={() => setSelectedRoomType(room.id)}
              className={`px-2 py-1 rounded cursor-pointer text-left transition-colors ${
                selectedRoomType === room.id ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
              }`}
            >
              <span className="text-xs font-medium">{room.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <Tabs value={effectiveTab} onValueChange={setActiveTab} className="w-full">
          {/* ── Seasons Calendar Sub-tab ───────────────────────────────────── */}
          <TabsContent value="seasons-calendar" className="p-4">
            <SeasonsCalendar
              seasons={seasons}
              seasonRates={seasonRates}
              roomTypes={roomTypes}
              selectedRoomType={selectedRoomType}
              pmsRateTypes={pmsRateTypes}
              pricingModel={pmsRateTypes[0]?.pricingModel || pmsRateTypes[0]?.priceType || "per_unit"}
              currency={formData.currency || "ZAR"}
              isReadOnly={!!(selectedPMS && selectedPMS !== "roomsonline" && selectedPMS !== "none")}
              externalSystem={selectedPMS}
              mealTypeSuggestions={selectedMealTypes}
              onSeasonsChange={(s) => { setSeasons(s); setIsDirty(true); }}
              onSeasonRatesChange={(r) => { setSeasonRates(r); setIsDirty(true); }}
              onSelectedRoomTypeChange={(id) => setSelectedRoomType(id)}
            />
          </TabsContent>


          {/* ── Charges Sub-tab ────────────────────────────────────────────── */}
          <TabsContent value="charges" className="p-6 space-y-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium">Additional Charges</h3>
                <p className="text-sm text-muted-foreground">Configure taxes, fees, deposits, and surcharges that apply to bookings at this property.</p>
              </div>
              {propertyId && <AdditionalChargesManager propertyId={propertyId} pmsSystem={selectedPMS} ownerEmail={formData.owner_email} />}
            </div>
          </TabsContent>

          {/* ── Policies Sub-tab ──────────────────────────────────────────── */}
          <TabsContent value="policies" className="p-4 space-y-5">
            {propertyId && <PoliciesTab propertyId={propertyId} onOpenSpecials={onOpenSpecials} />}
            {!propertyId && <p className="text-xs text-muted-foreground">Save the property first to configure policies.</p>}
            {policiesExtra && (
              <section className="pf-section">
                <div className="mb-2 border-b border-border/60 pb-1.5">
                  <h3 className="pf-section-title">House rules &amp; stay terms</h3>
                  <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                    Check-in/out times, deposits, age ranges, cots and extra beds, pets and fine print.
                  </p>
                </div>
                {policiesExtra}
              </section>
            )}
          </TabsContent>




        </Tabs>
      </div>

      {/* Sync Dialogs */}
      {propertyId && (
        <>
          <SyncRatesDialog
            open={syncRateTypesOpen}
            onOpenChange={setSyncRateTypesOpen}
            currentPropertyId={propertyId}
            mode="rate-types"
            currentAmenities={amenities}
          />
          <SyncRatesDialog
            open={syncSeasonsOpen}
            onOpenChange={setSyncSeasonsOpen}
            currentPropertyId={propertyId}
            mode="seasons"
            currentAmenities={amenities}
          />
        </>
      )}
    </div>
  );
}
