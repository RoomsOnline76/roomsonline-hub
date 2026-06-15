import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RoomTypeDataViewer } from "@/components/ExpandableDataViewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon, Plus, Minus, Trash2, Copy, Edit, DollarSign, Calendar, Info, Cloud } from "lucide-react";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ACCOMMODATION_LABEL_OPTIONS } from "@/lib/accommodationLabels";
import { AdditionalChargesManager } from "@/components/charges";
import SeasonsCalendar from "@/components/property/SeasonsCalendar";
import { SyncRatesDialog } from "@/components/property/SyncRatesDialog";
import { BillingConfigTab } from "@/components/property/BillingConfigTab";
import { PoliciesTab } from "@/components/property/PoliciesTab";
import { PaymentProvidersTab } from "@/components/property/PaymentProvidersTab";
import { ReferralSection } from "@/components/property/ReferralSection";
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
  isDev,
  isFearlessLeader,
  setIsDirty,
}: RateManagerTabProps) {
  const { toast } = useToast();

  // ── Local state ────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<string>("rate-types");
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
    <div className="flex gap-4 h-[calc(100vh-250px)]">
      {/* Left Sidebar - Room Types List */}
      <div className="w-56 border-r bg-muted/30 p-2 space-y-1">
        <div className="flex items-center justify-between mb-2 px-1">
          <h3 className="font-semibold text-xs text-muted-foreground">
            {(accommodationLabel ? ACCOMMODATION_LABEL_OPTIONS.find((o) => o.value === accommodationLabel)?.label?.toUpperCase() : "ROOM")} TYPES
          </h3>
        </div>
        {roomTypes.map((room) => (
          <div
            key={room.id}
            onClick={() => setSelectedRoomType(room.id)}
            className={`px-2 py-1.5 rounded cursor-pointer transition-colors ${
              selectedRoomType === room.id ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
            }`}
          >
            <span className="text-xs font-medium">{room.name}</span>
          </div>
        ))}
      </div>

      {/* Main Content - Rate Breakdown Details */}
      <div className="flex-1 overflow-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList>
            <TabsTrigger value="rate-types">Rate Types</TabsTrigger>
            <TabsTrigger value="season">Seasons</TabsTrigger>
            <TabsTrigger value="seasons-calendar">Calendar</TabsTrigger>
            <TabsTrigger value="rate-breakdown">Rate Breakdown</TabsTrigger>
            <TabsTrigger value="charges">Charges</TabsTrigger>
            {(isAdmin || isDev || isFearlessLeader) && <TabsTrigger value="billing">Billing</TabsTrigger>}
            <TabsTrigger value="policies">Policies</TabsTrigger>
            <TabsTrigger value="payment-providers">Payment Providers</TabsTrigger>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            {(isDev || isFearlessLeader) && <TabsTrigger value="data-explorer">Data Explorer</TabsTrigger>}
          </TabsList>

          {/* ── Rate Types Sub-tab ────────────────────────────────────────── */}
          <TabsContent value="rate-types" className="p-6 space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Manage rate types for this property. Each room type needs at least one rate type linked.
              </p>
              <div className="flex gap-2">
                {propertyId && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setSyncRateTypesOpen(true)} className="gap-1">
                    <Copy className="h-3 w-3" />
                    Sync to Others
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const newId = `manual-rate-${Date.now()}`;
                    setPmsRateTypes((prev) => [
                      ...prev,
                      { id: newId, name: "New Rate Type", priceType: "per_room", minStayDays: 1, maxStayDays: 0, minAdvanceDays: 0, maxAdvanceDays: 0, description: "", baseRate: null, pms_synced: false, linkedRoomId: null },
                    ]);
                    setIsDirty(true);
                  }}
                  className="gap-1"
                >
                  <Plus className="h-3 w-3" />
                  Add Rate Type
                </Button>
              </div>
            </div>

            {pmsRateTypes.length === 0 ? (
              <div className="border rounded-lg p-8 text-center text-muted-foreground">
                <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No rate types configured yet.</p>
                <p className="text-sm">Click "Add Rate Type" above to create one, or sync from PMS.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pmsRateTypes.map((rateType) => (
                  <Card key={rateType.id} className="border">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {rateType.pms_synced ? (
                            <CardTitle className="text-lg">{rateType.name}</CardTitle>
                          ) : (
                            <Input
                              value={rateType.name}
                              onChange={(e) => {
                                setPmsRateTypes((prev) => prev.map((rt) => (rt.id === rateType.id ? { ...rt, name: e.target.value } : rt)));
                                setIsDirty(true);
                              }}
                              className="text-lg font-semibold h-8 w-auto max-w-[250px]"
                            />
                          )}
                          <Badge variant="outline" className="font-mono text-xs">ID: {rateType.id}</Badge>
                          {rateType.baseRate && <Badge variant="secondary" className="text-xs">R{rateType.baseRate}</Badge>}
                        </div>
                        <div className="flex items-center gap-2">
                          {!rateType.pms_synced && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => { setPmsRateTypes((prev) => prev.filter((rt) => rt.id !== rateType.id)); setIsDirty(true); }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {rateType.pms_synced && !isRolProperty ? (
                            <Badge variant="outline" className="text-xs bg-primary/10"><Cloud className="h-3 w-3 mr-1" />PMS</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs bg-amber-100 text-amber-700">Manual</Badge>
                          )}
                        </div>
                      </div>
                      {rateType.description && <p className="text-sm text-muted-foreground mt-2">{rateType.description}</p>}
                    </CardHeader>
                    <CardContent className="pt-0">
                      {/* Base Rate - only editable for non-PMS */}
                      {!rateType.pms_synced && (
                        <div className="mb-4 p-3 bg-muted/50 rounded-lg">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-sm font-medium">Base Rate (R)</Label>
                              <Input
                                type="number"
                                placeholder="e.g. 1500"
                                value={rateType.baseRate || ""}
                                onChange={(e) => {
                                  const value = e.target.value ? parseFloat(e.target.value) : null;
                                  setPmsRateTypes((prev) => prev.map((rt) => (rt.id === rateType.id ? { ...rt, baseRate: value } : rt)));
                                  setIsDirty(true);
                                }}
                                className="bg-background"
                              />
                              <p className="text-xs text-muted-foreground">The default nightly or per-stay rate for this room</p>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm font-medium">Pricing Model</Label>
                              <Select
                                value={rateType.pricingModel || rateType.priceType || "UnitRate"}
                                onValueChange={(value) => {
                                  setPmsRateTypes((prev) => prev.map((rt) => (rt.id === rateType.id ? { ...rt, priceType: value, pricingModel: value } : rt)));
                                  setIsDirty(true);
                                }}
                              >
                                <SelectTrigger className="bg-background text-xs h-7"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="per_room">Per Room / Per Unit</SelectItem>
                                  <SelectItem value="per_person">Per Person</SelectItem>
                                  <SelectItem value="per_person_sharing">Per Person Sharing</SelectItem>
                                  <SelectItem value="UnitRate">Per Night (legacy)</SelectItem>
                                  <SelectItem value="PerStay">Per Stay</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          {/* Per-Person Rate Breakdown */}
                          {(rateType.priceType === "per_person" || rateType.priceType === "per_person_sharing" || rateType.pricingModel === "per_person" || rateType.pricingModel === "per_person_sharing") && (
                            <div className="mt-4 p-3 border rounded-lg bg-muted/30">
                              <Label className="text-sm font-medium mb-3 block">Per-Person Rate Breakdown</Label>
                              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                {(["adult1Rate", "adult2Rate", "teenRate", "childRate", "infantRate"] as const).map((field, idx) => {
                                  const labels = ["1 Adult (½)", "2 Adults", "Teen (t)", "Child (c)", "Infant (i)"];
                                  return (
                                    <div key={field} className="space-y-1">
                                      <Label className="text-xs text-muted-foreground">{labels[idx]}</Label>
                                      <Input
                                        type="number"
                                        placeholder="0"
                                        value={rateType[field] ?? ""}
                                        onChange={(e) => {
                                          const value = e.target.value ? parseFloat(e.target.value) : null;
                                          setPmsRateTypes((prev) => prev.map((rt) => (rt.id === rateType.id ? { ...rt, [field]: value } : rt)));
                                          setIsDirty(true);
                                        }}
                                        className="bg-background h-8 text-sm"
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                              <p className="text-xs text-muted-foreground mt-2">
                                Set individual rates per guest type. Base rate above is used as fallback when per-person rates are not set.
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        {rateType.pms_synced && (
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Pricing Model</Label>
                            <p className="font-medium">
                              {rateType.priceType === "per_room" ? "Per Room / Per Unit" : rateType.priceType === "per_person" ? "Per Person" : rateType.priceType === "per_person_sharing" ? "Per Person Sharing" : rateType.priceType === "UnitRate" ? "Per Night" : rateType.priceType || "—"}
                            </p>
                          </div>
                        )}
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Min Stay (Days)</Label>
                          {rateType.pms_synced ? (
                            <p className="font-medium">{rateType.minStayDays ?? "-"}</p>
                          ) : (
                            <Input type="number" min="0" value={rateType.minStayDays || ""} onChange={(e) => { setPmsRateTypes((prev) => prev.map((rt) => (rt.id === rateType.id ? { ...rt, minStayDays: e.target.value ? parseInt(e.target.value) : 0 } : rt))); setIsDirty(true); }} className="h-8" />
                          )}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Max Stay (Days)</Label>
                          {rateType.pms_synced ? (
                            <p className="font-medium">{rateType.maxStayDays ?? "-"}</p>
                          ) : (
                            <Input type="number" min="0" placeholder="0 = unlimited" value={rateType.maxStayDays || ""} onChange={(e) => { setPmsRateTypes((prev) => prev.map((rt) => (rt.id === rateType.id ? { ...rt, maxStayDays: e.target.value ? parseInt(e.target.value) : 0 } : rt))); setIsDirty(true); }} className="h-8" />
                          )}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Min Advance (Days)</Label>
                          {rateType.pms_synced ? (
                            <p className="font-medium">{rateType.minAdvanceDays ?? "-"}</p>
                          ) : (
                            <Input type="number" min="0" value={rateType.minAdvanceDays || ""} onChange={(e) => { setPmsRateTypes((prev) => prev.map((rt) => (rt.id === rateType.id ? { ...rt, minAdvanceDays: e.target.value ? parseInt(e.target.value) : 0 } : rt))); setIsDirty(true); }} className="h-8" />
                          )}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Max Advance (Days)</Label>
                          {rateType.pms_synced ? (
                            <p className="font-medium">{rateType.maxAdvanceDays ?? "-"}</p>
                          ) : (
                            <Input type="number" min="0" placeholder="0 = unlimited" value={rateType.maxAdvanceDays || ""} onChange={(e) => { setPmsRateTypes((prev) => prev.map((rt) => (rt.id === rateType.id ? { ...rt, maxAdvanceDays: e.target.value ? parseInt(e.target.value) : 0 } : rt))); setIsDirty(true); }} className="h-8" />
                          )}
                        </div>
                      </div>

                      {/* Stay Pay Discount Section */}
                      <Separator className="my-4" />
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stay/Pay Discount</Label>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Stay Nights</Label>
                            {rateType.pms_synced ? (
                              <p className="font-medium">{rateType.stayPayStayNights ?? "-"}</p>
                            ) : (
                              <Input type="number" min="0" placeholder="e.g. 7" value={rateType.stayPayStayNights || ""} onChange={(e) => { setPmsRateTypes((prev) => prev.map((rt) => (rt.id === rateType.id ? { ...rt, stayPayStayNights: e.target.value ? parseInt(e.target.value) : null } : rt))); setIsDirty(true); }} className="h-8" />
                            )}
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Discount Nights</Label>
                            {rateType.pms_synced ? (
                              <p className="font-medium">{rateType.stayPayDiscountNights ?? "-"}</p>
                            ) : (
                              <Input type="number" min="0" placeholder="e.g. 1" value={rateType.stayPayDiscountNights || ""} onChange={(e) => { setPmsRateTypes((prev) => prev.map((rt) => (rt.id === rateType.id ? { ...rt, stayPayDiscountNights: e.target.value ? parseInt(e.target.value) : null } : rt))); setIsDirty(true); }} className="h-8" />
                            )}
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Discount %</Label>
                            {rateType.pms_synced ? (
                              <p className="font-medium">{rateType.stayPayDiscountPercentage != null ? `${rateType.stayPayDiscountPercentage}%` : "-"}</p>
                            ) : (
                              <Input type="number" min="0" max="100" placeholder="e.g. 15" value={rateType.stayPayDiscountPercentage || ""} onChange={(e) => { setPmsRateTypes((prev) => prev.map((rt) => (rt.id === rateType.id ? { ...rt, stayPayDiscountPercentage: e.target.value ? parseFloat(e.target.value) : null } : rt))); setIsDirty(true); }} className="h-8" />
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Season Sub-tab ────────────────────────────────────────────── */}
          <TabsContent value="season" className="p-6 space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Manually define seasonal periods with custom stay requirements. Seasons are not imported from PMS.
              </p>
              <div className="flex gap-2">
                {propertyId && (
                  <Button variant="outline" size="sm" onClick={() => setSyncSeasonsOpen(true)} className="gap-1">
                    <Copy className="h-3 w-3" />
                    Sync to Others
                  </Button>
                )}
                {seasons.length === 0 && (
                  <Button variant="outline" onClick={createDefaultSeasons} className="gap-2">
                    <Calendar className="h-4 w-4" />
                    Add Default Seasons
                  </Button>
                )}
                <Button onClick={openAddSeasonDialog} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Season
                </Button>
              </div>
            </div>

            {seasons.length === 0 ? (
              <div className="border rounded-lg p-8 text-center text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No seasons defined.</p>
                <p className="text-sm mb-4">Seasons are optional. Add them manually if you need different rate periods.</p>
                <Button variant="secondary" onClick={createDefaultSeasons} className="gap-2">
                  <Calendar className="h-4 w-4" />
                  Create Southern Hemisphere Seasons
                </Button>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-3 font-semibold text-sm">NAME / PERIOD</th>
                      <th className="text-left p-3 font-semibold text-sm">FROM</th>
                      <th className="text-left p-3 font-semibold text-sm">TO</th>
                      <th className="text-left p-3 font-semibold text-sm">MIN STAY</th>
                      <th className="text-left p-3 font-semibold text-sm">MAX STAY</th>
                      <th className="w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {seasons.map((season) => (
                      <tr key={season.id} className="border-t hover:bg-muted/50">
                        <td className="p-3 font-medium">{season.name || season.title}</td>
                        <td className="p-3 text-muted-foreground">{season.from ? format(new Date(season.from), "dd MMM yyyy") : "-"}</td>
                        <td className="p-3 text-muted-foreground">{season.to ? format(new Date(season.to), "dd MMM yyyy") : "-"}</td>
                        <td className="p-3">{season.minStay || 1} nights</td>
                        <td className="p-3">{season.maxStay || "No limit"}</td>
                        <td className="p-3">
                          <div className="flex gap-2 justify-end">
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEditSeasonDialog(season)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => deleteSeason(season.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Season Dialog */}
            <Dialog open={isSeasonDialogOpen} onOpenChange={setIsSeasonDialogOpen}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>{editingSeason ? "Edit Season" : "Add New Season"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>Season Name (optional)</Label>
                    <Input placeholder="e.g., Peak Season, Low Season, Christmas" value={seasonForm.name} onChange={(e) => setSeasonForm({ ...seasonForm, name: e.target.value })} />
                    <p className="text-xs text-muted-foreground">If left empty, the date range will be used as the name</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Start Date *</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start text-left font-normal">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {seasonForm.from ? format(new Date(seasonForm.from), "dd MMM yyyy") : "Select date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarComponent mode="single" selected={seasonForm.from ? new Date(seasonForm.from) : undefined} onSelect={(date) => setSeasonForm({ ...seasonForm, from: date ? format(date, "yyyy-MM-dd") : "" })} className="pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label>End Date *</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start text-left font-normal">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {seasonForm.to ? format(new Date(seasonForm.to), "dd MMM yyyy") : "Select date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarComponent mode="single" selected={seasonForm.to ? new Date(seasonForm.to) : undefined} onSelect={(date) => setSeasonForm({ ...seasonForm, to: date ? format(date, "yyyy-MM-dd") : "" })} className="pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Minimum Stay (nights)</Label>
                      <Input type="number" min="1" value={seasonForm.minStay} onChange={(e) => setSeasonForm({ ...seasonForm, minStay: parseInt(e.target.value) || 1 })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Maximum Stay (nights)</Label>
                      <Input type="number" min="0" value={seasonForm.maxStay} onChange={(e) => setSeasonForm({ ...seasonForm, maxStay: parseInt(e.target.value) || 0 })} />
                      <p className="text-xs text-muted-foreground">0 = No limit</p>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button variant="outline" onClick={() => setIsSeasonDialogOpen(false)}>Cancel</Button>
                    <Button onClick={saveSeason}>{editingSeason ? "Update Season" : "Add Season"}</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </TabsContent>

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

          {/* ── Rate Breakdown Sub-tab ─────────────────────────────────────── */}
          <TabsContent value="rate-breakdown" className="p-6 space-y-6">
            {seasons.length === 0 ? (
              (() => {
                const currentRoom = roomTypes.find((r: any) => r.id === selectedRoomType);
                const linkedRateTypes = currentRoom?.linkedRateTypes || [];
                const availableRateTypes = (pmsRateTypes || []) as Array<{ id: number | string; name: string; priceType?: string }>;
                const roomLinkedRateTypes = availableRateTypes.filter((rt) => linkedRateTypes.some((linked: number | string) => String(linked) === String(rt.id)));

                if (roomLinkedRateTypes.length === 0) {
                  return (
                    <div className="border rounded-lg p-8 text-center text-muted-foreground">
                      <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No rate types linked to this room.</p>
                      <p className="text-sm">Link rate types in the Room Type tab first.</p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-6">
                    <p className="text-sm text-muted-foreground">
                      Set base rates for <strong>{currentRoom?.name}</strong> (no seasons defined).
                    </p>
                    {roomLinkedRateTypes.map((rateType) => {
                      const priceType = rateType.priceType || "Per Unit";
                      const isPerPerson = priceType.toLowerCase().includes("person");
                      const roomRateTypes = currentRoom?.rateTypes || [];
                      const rateTypeData = roomRateTypes.find((rt: any) => rt.rateTypeId === rateType.id);
                      const todayStr = format(new Date(), "yyyy-MM-dd");
                      const todayRateData = rateTypeData?.rates?.find((r: any) => r.date === todayStr);

                      return (
                        <div key={rateType.id} className="border rounded-lg overflow-hidden">
                          <div className="p-4 bg-muted/50">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold">{rateType.name}</h3>
                              <Badge variant="outline" className="text-xs">{priceType}</Badge>
                              {selectedPMS === "benson" && <Badge variant="outline" className="text-xs bg-primary/10"><Cloud className="h-3 w-3 mr-1" />Benson</Badge>}
                            </div>
                            {selectedPMS === "benson" && <p className="text-xs text-muted-foreground mt-1">Today's rate from Benson ({todayStr})</p>}
                          </div>
                          <div className="p-4">
                            {isPerPerson ? (
                              <div className="grid grid-cols-5 gap-4">
                                {["Room Amount", "Adult Amount", "Teen Amount", "Child Amount", "Infant Amount"].map((label, idx) => {
                                  const fields = ["roomAmount", "adultAmount1", "teenAmount", "childAmount", "infantAmount"];
                                  const altFields = [null, "adultAmount2", null, null, null];
                                  return (
                                    <div key={label} className="space-y-2">
                                      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
                                      <Input type="number" min="0" value={todayRateData?.[fields[idx]] ?? (altFields[idx] ? todayRateData?.[altFields[idx]!] : null) ?? 0} className="text-center bg-muted cursor-not-allowed" placeholder="—" disabled />
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="max-w-xs">
                                <div className="space-y-2">
                                  <Label className="text-xs font-medium text-muted-foreground">Room Amount</Label>
                                  <Input type="number" min="0" value={todayRateData?.roomAmount ?? 0} className="text-center bg-muted cursor-not-allowed" placeholder="—" disabled />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            ) : (
              (() => {
                const currentRoom = roomTypes.find((r: any) => r.id === selectedRoomType);
                const linkedRateTypes = currentRoom?.linkedRateTypes || [];
                const availableRateTypes = (pmsRateTypes || []) as Array<{ id: number | string; name: string; priceType?: string }>;
                const roomLinkedRateTypes = availableRateTypes.filter((rt) => linkedRateTypes.some((linked: number | string) => String(linked) === String(rt.id)));

                if (roomLinkedRateTypes.length === 0) {
                  return (
                    <div className="border rounded-lg p-8 text-center text-muted-foreground">
                      <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No rate types linked to this room.</p>
                      <p className="text-sm">Link rate types in the Room Type tab first.</p>
                    </div>
                  );
                }

                return (
                  <>
                    <div className="flex justify-between items-center">
                      <p className="text-sm text-muted-foreground">
                        Rate breakdown for <strong>{currentRoom?.name}</strong> by season
                      </p>
                      <Select value={rateBreakdownGroupBy} onValueChange={(v) => setRateBreakdownGroupBy(v as "season" | "mealType")}>
                        <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="season">Group by Season</SelectItem>
                          <SelectItem value="mealType">Group by Rate Type</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {rateBreakdownGroupBy === "season" &&
                      seasons.map((season) => {
                        const isExpanded = expandedSeasons[season.id] ?? true;
                        return (
                          <div key={season.id} className="border rounded-lg overflow-hidden">
                            <button type="button" onClick={() => toggleSeasonExpanded(season.id)} className="w-full flex items-center justify-between p-4 bg-muted/50 hover:bg-muted transition-colors text-left">
                              <div className="flex items-center gap-3">
                                {isExpanded ? <Minus className="h-4 w-4 text-primary" /> : <Plus className="h-4 w-4 text-primary" />}
                                <div className="flex items-center gap-2">
                                  <h3 className="font-semibold">{season.name || season.title}</h3>
                                  <span className="text-sm text-muted-foreground">
                                    {season.from ? format(new Date(season.from), "dd MMM") : ""} - {season.to ? format(new Date(season.to), "dd MMM") : ""}
                                  </span>
                                </div>
                              </div>
                            </button>
                            {isExpanded && (
                              <div className="p-4 space-y-4">
                                {roomLinkedRateTypes.map((rateType) => {
                                  const priceType = rateType.priceType || "Per Unit";
                                  const isPerPerson = priceType.toLowerCase().includes("person");
                                  return (
                                    <div key={rateType.id} className="border rounded-lg p-4 bg-card">
                                      <div className="text-sm font-medium text-muted-foreground mb-4">{rateType.name}</div>
                                      {isPerPerson ? (
                                        <div className="grid grid-cols-5 gap-4">
                                          <div className="space-y-2">
                                            <Label className="text-xs font-medium text-muted-foreground">Room Amount</Label>
                                            <Input type="number" min="0" value={getSeasonRate(selectedRoomType, `${season.id}-${rateType.id}`, "roomAmount")} className="text-center bg-muted cursor-not-allowed" placeholder="—" disabled />
                                          </div>
                                          {(["adultAmount", "teenAmount", "childAmount", "infantAmount"] as RateField[]).map((field) => (
                                            <div key={field} className="space-y-2">
                                              <Label className="text-xs font-medium">{field.replace("Amount", " Amount").replace(/^./, (c) => c.toUpperCase())}</Label>
                                              <Input type="number" min="0" value={getSeasonRate(selectedRoomType, `${season.id}-${rateType.id}`, field)} onChange={(e) => updateSeasonRate(selectedRoomType, `${season.id}-${rateType.id}`, field, parseFloat(e.target.value) || 0)} className="text-center" placeholder="0.00" />
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="max-w-xs">
                                          <div className="space-y-2">
                                            <Label className="text-xs font-medium">Room Amount</Label>
                                            <Input type="number" min="0" value={getSeasonRate(selectedRoomType, `${season.id}-${rateType.id}`, "roomAmount")} onChange={(e) => updateSeasonRate(selectedRoomType, `${season.id}-${rateType.id}`, "roomAmount", parseFloat(e.target.value) || 0)} className="text-center" placeholder="0.00" />
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}

                    {rateBreakdownGroupBy === "mealType" &&
                      (() => {
                        return roomLinkedRateTypes.length === 0 ? (
                          <div className="border rounded-lg p-8 text-center text-muted-foreground">
                            <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>No rate types linked to this room.</p>
                          </div>
                        ) : (
                          roomLinkedRateTypes.map((rateType) => {
                            const isExpanded = expandedMealTypes[String(rateType.id)] ?? true;
                            const priceType = rateType.priceType || "Per Unit";
                            const isPerPerson = priceType.toLowerCase().includes("person");
                            return (
                              <div key={rateType.id} className="border rounded-lg overflow-hidden">
                                <button type="button" onClick={() => toggleMealTypeExpanded(String(rateType.id))} className="w-full flex items-center justify-between p-4 bg-muted/50 hover:bg-muted transition-colors text-left">
                                  <div className="flex items-center gap-3">
                                    {isExpanded ? <Minus className="h-4 w-4 text-primary" /> : <Plus className="h-4 w-4 text-primary" />}
                                    <div className="flex items-center gap-2">
                                      <h3 className="font-semibold">{rateType.name}</h3>
                                      <Badge variant="outline" className="text-xs">{priceType}</Badge>
                                    </div>
                                  </div>
                                  <span className="text-sm text-muted-foreground">{seasons.length} season{seasons.length !== 1 ? "s" : ""}</span>
                                </button>
                                {isExpanded && (
                                  <div className="p-4 space-y-4">
                                    {seasons.map((season) => (
                                      <div key={season.id} className="border rounded-lg p-4 bg-card">
                                        <div className="text-sm font-medium text-muted-foreground mb-4">
                                          {season.name || season.title}
                                          <span className="ml-2 text-xs">
                                            ({season.from ? format(new Date(season.from), "dd MMM") : ""} - {season.to ? format(new Date(season.to), "dd MMM") : ""})
                                          </span>
                                        </div>
                                        {isPerPerson ? (
                                          <div className="grid grid-cols-5 gap-4">
                                            <div className="space-y-2">
                                              <Label className="text-xs font-medium text-muted-foreground">Room Amount</Label>
                                              <Input type="number" min="0" value={getSeasonRate(selectedRoomType, `${season.id}-${rateType.id}`, "roomAmount")} className="text-center bg-muted cursor-not-allowed" placeholder="—" disabled />
                                            </div>
                                            {(["adultAmount", "teenAmount", "childAmount", "infantAmount"] as RateField[]).map((field) => (
                                              <div key={field} className="space-y-2">
                                                <Label className="text-xs font-medium">{field.replace("Amount", " Amount").replace(/^./, (c) => c.toUpperCase())}</Label>
                                                <Input type="number" min="0" value={getSeasonRate(selectedRoomType, `${season.id}-${rateType.id}`, field)} onChange={(e) => updateSeasonRate(selectedRoomType, `${season.id}-${rateType.id}`, field, parseFloat(e.target.value) || 0)} className="text-center" placeholder="0.00" />
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <div className="max-w-xs">
                                            <div className="space-y-2">
                                              <Label className="text-xs font-medium">Room Amount</Label>
                                              <Input type="number" min="0" value={getSeasonRate(selectedRoomType, `${season.id}-${rateType.id}`, "roomAmount")} onChange={(e) => updateSeasonRate(selectedRoomType, `${season.id}-${rateType.id}`, "roomAmount", parseFloat(e.target.value) || 0)} className="text-center" placeholder="0.00" />
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        );
                      })()}
                  </>
                );
              })()
            )}
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

          {/* ── Billing Sub-tab ────────────────────────────────────────────── */}
          {(isAdmin || isDev || isFearlessLeader) && (
            <TabsContent value="billing">
              <BillingConfigTab propertyId={propertyId} onSwitchTab={setActiveTab} />
              <div className="mt-4"><ReferralSection propertyId={propertyId} /></div>
            </TabsContent>
          )}

          {/* ── Policies Sub-tab ──────────────────────────────────────────── */}
          <TabsContent value="policies" className="p-6">
            {propertyId && <PoliciesTab propertyId={propertyId} />}
            {!propertyId && <p className="text-sm text-muted-foreground">Save the property first to configure policies.</p>}
          </TabsContent>

          {/* ── Payment Providers Sub-tab ────────────────────────────────── */}
          <TabsContent value="payment-providers" className="p-0">
            <PaymentProvidersTab
              propertyId={propertyId}
              isAdmin={!!isAdmin}
              isDev={!!isDev}
              isFearlessLeader={!!isFearlessLeader}
            />
          </TabsContent>



          {/* ── Overview Sub-tab ──────────────────────────────────────────── */}
          <TabsContent value="overview" className="p-6 space-y-6">
            {(() => {
              const currentRoom = roomTypes.find((r: any) => r.id === selectedRoomType);
              let linkedRateTypesArr = getRoomLinkedRateTypes(selectedRoomType);
              if (linkedRateTypesArr.length === 0 && currentRoom?.availableRateTypes?.length > 0) {
                linkedRateTypesArr = currentRoom.availableRateTypes;
              }
              const linkedRateTypeData = pmsRateTypes.filter((rt) => linkedRateTypesArr.includes(rt.id));
              const pmsRates = currentRoom?.pms_rates || [];
              const hasPmsRates = pmsRates.length > 0;
              const pmsRatesByType: Record<number, any[]> = {};
              pmsRates.forEach((rate: any) => {
                if (!pmsRatesByType[rate.rateTypeId]) pmsRatesByType[rate.rateTypeId] = [];
                pmsRatesByType[rate.rateTypeId].push(rate);
              });

              const getPmsRateValue = (rateTypeId: number, field: string) => {
                const rates = pmsRatesByType[rateTypeId] || [];
                for (const rate of rates) {
                  if (rate[field] !== null && rate[field] !== undefined) return rate[field];
                }
                return null;
              };

              if (linkedRateTypeData.length === 0 && !hasPmsRates) {
                return (
                  <div className="border rounded-lg p-8 text-center text-muted-foreground">
                    <Info className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No rate types linked to this room.</p>
                    <p className="text-sm">Link rate types in the "Rate Types" tab or sync from PMS to see the overview.</p>
                  </div>
                );
              }

              const displayRateTypes = linkedRateTypeData.length > 0 ? linkedRateTypeData : Object.keys(pmsRatesByType).map((id) => {
                const rates = pmsRatesByType[Number(id)];
                return { id: Number(id), name: rates[0]?.rateTypeName || `Rate Type ${id}`, priceType: null, description: null };
              });

              return (
                <>
                  <p className="text-sm text-muted-foreground">
                    Rate overview for <strong>{currentRoom?.name}</strong>
                    {hasPmsRates && <Badge variant="outline" className="ml-2 text-xs"><Cloud className="h-3 w-3 mr-1" />{pmsRates.length} PMS rates loaded</Badge>}
                  </p>
                  {displayRateTypes.map((rateType) => {
                    const typeRates = pmsRatesByType[Number(rateType.id)] || [];
                    const roomAmount = getPmsRateValue(Number(rateType.id), "roomAmount");
                    const adultAmount1 = getPmsRateValue(Number(rateType.id), "adultAmount1");
                    const adultAmount2 = getPmsRateValue(Number(rateType.id), "adultAmount2");
                    const teenAmount = getPmsRateValue(Number(rateType.id), "teenAmount");
                    const childAmount = getPmsRateValue(Number(rateType.id), "childAmount");
                    const infantAmount = getPmsRateValue(Number(rateType.id), "infantAmount");

                    return (
                      <div key={rateType.id} className="border rounded-lg overflow-hidden">
                        <div className="p-4 bg-muted/50 flex items-center gap-3">
                          <h3 className="font-semibold">{rateType.name}</h3>
                          {rateType.priceType && <Badge variant="outline" className="text-xs">{rateType.priceType}</Badge>}
                          {typeRates.length > 0 && <Badge variant="secondary" className="text-xs">{typeRates.length} rates</Badge>}
                        </div>
                        {typeRates.length > 0 ? (
                          <div className="p-4">
                            <div className="grid grid-cols-6 gap-3 mb-4">
                              {[
                                ["ROOM", roomAmount],
                                ["ADULT 1", adultAmount1],
                                ["ADULT 2", adultAmount2],
                                ["TEEN", teenAmount],
                                ["CHILD", childAmount],
                                ["INFANT", infantAmount],
                              ].map(([label, value]) => (
                                <div key={label as string} className="text-center p-3 bg-muted/50 rounded">
                                  <div className="text-xs text-muted-foreground mb-1">{label as string}</div>
                                  <div className="font-mono font-semibold">{value as any}</div>
                                </div>
                              ))}
                            </div>
                            <div className="mt-4">
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <tbody>
                                    {typeRates.slice(0, 5).map((rate: any, idx: number) => (
                                      <tr key={idx} className="border-t hover:bg-muted/20">
                                        <td className="p-2 font-mono">{rate.date}</td>
                                        <td className="p-2 text-right">{rate.roomAmount ?? "—"}</td>
                                        <td className="p-2 text-right">{rate.adultAmount1 ?? "—"}</td>
                                        <td className="p-2 text-right">{rate.adultAmount2 ?? "—"}</td>
                                        <td className="p-2 text-right">{rate.teenAmount ?? "—"}</td>
                                        <td className="p-2 text-right">{rate.childAmount ?? "—"}</td>
                                        <td className="p-2 text-right">{rate.infantAmount ?? "—"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                {typeRates.length > 5 && <p className="text-xs text-muted-foreground mt-1">+ {typeRates.length - 5} more dates</p>}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <table className="w-full">
                            <thead className="bg-muted">
                              <tr>
                                <th className="text-left p-3 font-semibold text-sm">SEASON</th>
                                <th className="text-left p-3 font-semibold text-sm">PERIOD</th>
                                <th className="text-left p-3 font-semibold text-sm">MEAL TYPE</th>
                                <th className="text-right p-3 font-semibold text-sm">ROOM</th>
                                <th className="text-right p-3 font-semibold text-sm">ADULT</th>
                                <th className="text-right p-3 font-semibold text-sm">TEEN</th>
                                <th className="text-right p-3 font-semibold text-sm">CHILD</th>
                                <th className="text-right p-3 font-semibold text-sm">INFANT</th>
                              </tr>
                            </thead>
                            <tbody>
                              {seasons.length > 0 ? (
                                seasons.map((season) => {
                                  const roomMealTypes = currentRoom?.mealTypes || [];
                                  return roomMealTypes.length > 0 ? (
                                    roomMealTypes.map((mealType: string, idx: number) => (
                                      <tr key={`${rateType.id}-${season.id}-${mealType}`} className="border-t hover:bg-muted/50">
                                        {idx === 0 && (
                                          <>
                                            <td className="p-3 font-medium" rowSpan={roomMealTypes.length}>{season.name || season.title}</td>
                                            <td className="p-3 text-muted-foreground text-sm" rowSpan={roomMealTypes.length}>
                                              {season.from ? format(new Date(season.from), "dd MMM") : ""} - {season.to ? format(new Date(season.to), "dd MMM") : ""}
                                            </td>
                                          </>
                                        )}
                                        <td className="p-3">{mealType}</td>
                                        {(["roomAmount", "adultAmount", "teenAmount", "childAmount", "infantAmount"] as RateField[]).map((field) => (
                                          <td key={field} className="p-3 text-right font-mono">
                                            {getSeasonRate(selectedRoomType, `${season.id}-${mealType}`, field) || "—"}
                                          </td>
                                        ))}
                                      </tr>
                                    ))
                                  ) : (
                                    <tr key={`${rateType.id}-${season.id}`} className="border-t">
                                      <td className="p-3 font-medium">{season.name || season.title}</td>
                                      <td className="p-3 text-muted-foreground text-sm">
                                        {season.from ? format(new Date(season.from), "dd MMM") : ""} - {season.to ? format(new Date(season.to), "dd MMM") : ""}
                                      </td>
                                      <td colSpan={6} className="p-3 text-center text-muted-foreground text-sm">No meal types configured for this room</td>
                                    </tr>
                                  );
                                })
                              ) : (
                                <tr>
                                  <td colSpan={8} className="p-6 text-center text-muted-foreground">No seasons configured. Add seasons or sync from PMS to see rates.</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        )}
                      </div>
                    );
                  })}
                </>
              );
            })()}
          </TabsContent>

          {/* ── Data Explorer Sub-tab ──────────────────────────────────────── */}
          {(isDev || isFearlessLeader) && (
            <TabsContent value="data-explorer" className="p-6 space-y-4">
              {(() => {
                const currentRoom = roomTypes.find((r: any) => r.id === selectedRoomType);
                if (!currentRoom) {
                  return (
                    <div className="border rounded-lg p-8 text-center text-muted-foreground">
                      <Info className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Select a room type to explore its data.</p>
                    </div>
                  );
                }
                return (
                  <>
                    <p className="text-sm text-muted-foreground">Raw data explorer for <strong>{currentRoom.name}</strong></p>
                    <RoomTypeDataViewer room={currentRoom} rateTypes={pmsRateTypes} />
                  </>
                );
              })()}
            </TabsContent>
          )}
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
