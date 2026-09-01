import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ACCOMMODATION_LABEL_OPTIONS } from "@/lib/accommodationLabels";
import { AdditionalChargesManager } from "@/components/charges";
import SeasonsCalendar from "@/components/property/SeasonsCalendar";
import { PoliciesTab } from "@/components/property/PoliciesTab";


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

  // ── Local state ────────────────────────────────────────────────────────
  /**
   * Legacy "Seasons" and "Rate Types" sub-tabs are retired. Calendar / Seasons owns
   * season dates; Rate Plans owns commercial rates.
   */
  const effectiveTab = view === "charges" ? "charges" : view === "policies" ? "policies" : "seasons-calendar";


  // ── Render ─────────────────────────────────────────────────────────────
  // The calendar needs a fixed viewport; policies & charges should grow to fit
  // their content so nothing is clipped inside a nested scroll frame.
  const isRatesSurface = view === "rates";
  return (
    <div className="flex gap-3 items-start min-h-[520px]">
      {/* Left Sidebar - Room Types List (rates surface only) */}
      {view === "rates" && (
        <div className="w-44 shrink-0 self-stretch border-r bg-muted/30 p-1.5 space-y-px md:sticky md:top-2 md:max-h-[calc(100vh-140px)] md:overflow-y-auto">
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
      <div className={`flex-1 min-w-0 ${isRatesSurface ? "overflow-x-auto" : ""}`}>
        <Tabs value={effectiveTab} className="w-full">
          {/* ── Seasons Calendar Sub-tab ───────────────────────────────────── */}
          <TabsContent value="seasons-calendar" className="p-4">
            <SeasonsCalendar
              propertyId={propertyId}
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
            {propertyId && (
              <PoliciesTab
                propertyId={propertyId}
                onOpenSpecials={onOpenSpecials}
                onDirty={() => setIsDirty(true)}
              />
            )}
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

    </div>
  );
}
