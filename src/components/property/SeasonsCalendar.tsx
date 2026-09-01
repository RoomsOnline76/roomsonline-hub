import React, { useState, useMemo, useCallback } from "react";
import { format, getDaysInMonth, isWithinInterval, parseISO, startOfDay } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Plus, Trash2, X, Lock, CalendarPlus, Building2, BedDouble } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { isSeasonExpired } from "@/lib/seasonLifecycle";
import { computeSeasonCoverage } from "@/lib/seasonCoverage";
import { useStayShapeBySeason } from "@/components/pms/rateplans/useStayShapeBySeason";

const SEASON_COLORS = [
  { name: "Red", value: "red", bg: "bg-red-200", border: "border-danger-border", text: "text-destructive", cell: "bg-danger-surface" },
  { name: "Orange", value: "orange", bg: "bg-orange-200", border: "border-warning-border", text: "text-warning", cell: "bg-warning-surface" },
  { name: "Amber", value: "amber", bg: "bg-amber-200", border: "border-warning-border", text: "text-warning", cell: "bg-warning-surface" },
  { name: "Yellow", value: "yellow", bg: "bg-yellow-200", border: "border-warning-border", text: "text-warning", cell: "bg-warning-surface" },
  { name: "Teal", value: "teal", bg: "bg-teal-200", border: "border-success-border", text: "text-success", cell: "bg-success-surface" },
  { name: "Blue", value: "blue", bg: "bg-blue-200", border: "border-info-border", text: "text-info", cell: "bg-info-surface" },
  { name: "Purple", value: "purple", bg: "bg-purple-200", border: "border-purple-400", text: "text-purple-800", cell: "bg-purple-100" },
  { name: "Green", value: "green", bg: "bg-green-200", border: "border-success-border", text: "text-success", cell: "bg-success-surface" },
];

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface SeasonPeriod {
  from: string;
  to: string;
}

interface Season {
  id: string;
  name: string;
  title?: string;
  from: string;
  to: string;
  periods?: SeasonPeriod[];
  minStay?: number;
  maxStay?: number;
  color?: string;
}

type RateField = "roomAmount" | "adultAmount" | "teenAmount" | "childAmount" | "infantAmount";

interface SeasonRates {
  [roomId: string]: {
    [seasonKey: string]: {
      roomAmount: number;
      adultAmount: number;
      teenAmount: number;
      childAmount: number;
      infantAmount: number;
    };
  };
}

interface RoomType {
  id: string;
  name: string;
  linkedRateTypes?: string[];
}

interface RateType {
  id: string | number;
  name: string;
  pms_synced?: boolean;
}

interface SeasonsCalendarProps {
  seasons: Season[];
  seasonRates: SeasonRates;
  roomTypes: RoomType[];
  selectedRoomType: string;
  pmsRateTypes: RateType[];
  pricingModel: string;
  currency: string;
  isReadOnly: boolean;
  externalSystem?: string;
  mealTypeSuggestions?: string[];
  /** Read-only: used to surface saved LOS / full-stay ladders on a season. */
  propertyId?: string | null;
  onSeasonsChange: (seasons: Season[]) => void;
  onSeasonRatesChange: (rates: SeasonRates) => void;
  onSelectedRoomTypeChange?: (id: string) => void;
}

function getSeasonColor(season: Season, index: number) {
  const c = season.color;
  if (c) {
    const found = SEASON_COLORS.find((sc) => sc.value === c);
    if (found) return found;
  }
  return SEASON_COLORS[index % SEASON_COLORS.length];
}

/** Get all periods for a season, falling back to from/to if no periods array */
function getSeasonPeriods(s: Season): SeasonPeriod[] {
  if (s.periods && s.periods.length > 0) return s.periods;
  if (s.from && s.to) return [{ from: s.from, to: s.to }];
  return [];
}

function getSeasonForDate(date: Date, seasons: Season[]): Season | null {
  for (const s of seasons) {
    const periods = getSeasonPeriods(s);
    for (const p of periods) {
      if (!p.from || !p.to) continue;
      try {
        const from = startOfDay(parseISO(p.from));
        const to = startOfDay(parseISO(p.to));
        if (isWithinInterval(date, { start: from, end: to })) return s;
      } catch {
        continue;
      }
    }
  }
  return null;
}

/** Sync top-level from/to with periods[0] */
function syncTopLevel(season: Season): Season {
  const periods = season.periods || [];
  if (periods.length > 0) {
    return { ...season, from: periods[0].from, to: periods[0].to };
  }
  return season;
}

export default function SeasonsCalendar({
  seasons,
  seasonRates,
  roomTypes,
  selectedRoomType,
  pmsRateTypes,
  isReadOnly,
  externalSystem,
  mealTypeSuggestions = [],
  propertyId,
  onSeasonsChange,
  onSeasonRatesChange,
}: SeasonsCalendarProps) {
  const stayShapeBySeason = useStayShapeBySeason(propertyId);
  const { toast } = useToast();
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isAddingPeriod, setIsAddingPeriod] = useState(false);
  const [selectionStart, setSelectionStart] = useState<Date | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<Date | null>(null);
  const [editForm, setEditForm] = useState({ name: "", color: "red", minStay: 1, maxStay: 30 });
  const [selectedRateTypeId, setSelectedRateTypeId] = useState<string>("");
  /** Past seasons are hidden by default — they can no longer be sold. */
  const [showPastSeasons, setShowPastSeasons] = useState(false);

  const expiredSeasonIds = useMemo(
    () => new Set(seasons.filter((s) => isSeasonExpired(s)).map((s) => s.id)),
    [seasons],
  );
  /** Seasons the owner can still sell (plus past ones while the toggle is on). */
  const visibleSeasons = useMemo(
    () => (showPastSeasons ? seasons : seasons.filter((s) => !expiredSeasonIds.has(s.id))),
    [seasons, expiredSeasonIds, showPastSeasons],
  );


  /**
   * Coverage of the rolling 365-day window, derived from the authored season
   * periods already in memory. Informational: it never feeds the mandatory
   * readiness counters.
   */
  const coverage = useMemo(
    () => computeSeasonCoverage(seasons.flatMap((s) => getSeasonPeriods(s))),
    [seasons],
  );

  // Normalize legacy seasons that don't have periods array on first render
  React.useEffect(() => {
    const needsNormalization = seasons.some(s => !s.periods || s.periods.length === 0);
    if (needsNormalization) {
      const normalized = seasons.map(s => {
        if (s.periods && s.periods.length > 0) return s;
        if (s.from && s.to) return { ...s, periods: [{ from: s.from, to: s.to }] };
        return s;
      });
      onSeasonsChange(normalized);
    }
  }, []); // only on mount

  const selectedSeason = useMemo(
    () => visibleSeasons.find((s) => s.id === selectedSeasonId) || null,
    [visibleSeasons, selectedSeasonId],
  );
  const currentRoom = useMemo(() => roomTypes.find((r) => r.id === selectedRoomType), [roomTypes, selectedRoomType]);
  const linkedRateTypes = useMemo(() => {
    const linked = currentRoom?.linkedRateTypes || [];
    if (linked.length === 0) return pmsRateTypes;
    return pmsRateTypes.filter((rt) => linked.includes(String(rt.id)));
  }, [currentRoom, pmsRateTypes]);

  // Auto-select first rate type when room changes or on mount
  React.useEffect(() => {
    if (linkedRateTypes.length > 0 && !linkedRateTypes.find(rt => String(rt.id) === selectedRateTypeId)) {
      setSelectedRateTypeId(String(linkedRateTypes[0].id));
    }
  }, [linkedRateTypes, selectedRateTypeId]);

  const monthsGrid = useMemo(() => {
    return Array.from({ length: 12 }, (_, m) => {
      const daysInMonth = getDaysInMonth(new Date(year, m));
      return { month: m, days: daysInMonth };
    });
  }, [year]);

  const handleCellClick = useCallback((date: Date) => {
    if (isReadOnly) return;

    if (isAddingPeriod && selectedSeasonId) {
      if (!selectionStart) {
        setSelectionStart(date);
        setSelectionEnd(null);
      } else if (!selectionEnd) {
        const end = date >= selectionStart ? date : selectionStart;
        const start = date >= selectionStart ? selectionStart : date;
        setSelectionStart(start);
        setSelectionEnd(end);
      } else {
        setSelectionStart(date);
        setSelectionEnd(null);
      }
      return;
    }

    if (!isAdding) {
      const s = getSeasonForDate(date, seasons);
      if (s) {
        setSelectedSeasonId(s.id);
        setIsAdding(false);
        setIsAddingPeriod(false);
      }
      return;
    }
    if (!selectionStart) {
      setSelectionStart(date);
      setSelectionEnd(null);
    } else if (!selectionEnd) {
      const end = date >= selectionStart ? date : selectionStart;
      const start = date >= selectionStart ? selectionStart : date;
      setSelectionStart(start);
      setSelectionEnd(end);
    } else {
      setSelectionStart(date);
      setSelectionEnd(null);
    }
  }, [isAdding, isAddingPeriod, isReadOnly, selectionStart, selectionEnd, seasons, selectedSeasonId]);

  const confirmAddSeason = () => {
    if (!selectionStart || !selectionEnd) return;
    const fromStr = format(selectionStart, "yyyy-MM-dd");
    const toStr = format(selectionEnd, "yyyy-MM-dd");
    const newSeason: Season = {
      id: Date.now().toString(),
      name: editForm.name || `Season ${seasons.length + 1}`,
      title: editForm.name || `Season ${seasons.length + 1}`,
      from: fromStr,
      to: toStr,
      periods: [{ from: fromStr, to: toStr }],
      minStay: editForm.minStay,
      maxStay: editForm.maxStay,
      color: editForm.color,
    };
    onSeasonsChange([...seasons, newSeason]);
    setIsAdding(false);
    setSelectionStart(null);
    setSelectionEnd(null);
    setEditForm({ name: "", color: "red", minStay: 1, maxStay: 30 });
    setSelectedSeasonId(newSeason.id);
    toast({ title: "Season created" });
  };

  const confirmAddPeriod = () => {
    if (!selectionStart || !selectionEnd || !selectedSeasonId) return;
    const fromStr = format(selectionStart, "yyyy-MM-dd");
    const toStr = format(selectionEnd, "yyyy-MM-dd");
    const updated = seasons.map((s) => {
      if (s.id !== selectedSeasonId) return s;
      const existingPeriods = getSeasonPeriods(s);
      const newPeriods = [...existingPeriods, { from: fromStr, to: toStr }];
      return syncTopLevel({ ...s, periods: newPeriods });
    });
    onSeasonsChange(updated);
    setIsAddingPeriod(false);
    setSelectionStart(null);
    setSelectionEnd(null);
    toast({ title: "Period added" });
  };

  const deletePeriod = (seasonId: string, periodIndex: number) => {
    const updated = seasons.map((s) => {
      if (s.id !== seasonId) return s;
      const periods = getSeasonPeriods(s);
      if (periods.length <= 1) return s;
      const newPeriods = periods.filter((_, i) => i !== periodIndex);
      return syncTopLevel({ ...s, periods: newPeriods });
    });
    onSeasonsChange(updated);
    toast({ title: "Period removed" });
  };

  const updatePeriodDate = (seasonId: string, periodIndex: number, field: "from" | "to", value: string) => {
    const updated = seasons.map((s) => {
      if (s.id !== seasonId) return s;
      const periods = [...getSeasonPeriods(s)];
      periods[periodIndex] = { ...periods[periodIndex], [field]: value };
      return syncTopLevel({ ...s, periods });
    });
    onSeasonsChange(updated);
  };

  const updateSeason = (field: string, value: any) => {
    if (!selectedSeason) return;
    const updated = seasons.map((s) => (s.id === selectedSeason.id ? { ...s, [field]: value, title: field === "name" ? value : s.title } : s));
    onSeasonsChange(updated);
  };

  const deleteSeason = (id: string) => {
    onSeasonsChange(seasons.filter((s) => s.id !== id));
    const updatedRates = { ...seasonRates };
    Object.keys(updatedRates).forEach((roomId) => {
      const roomRates = { ...updatedRates[roomId] };
      Object.keys(roomRates).forEach((key) => {
        if (key === id || key.startsWith(`${id}-`)) delete roomRates[key];
      });
      updatedRates[roomId] = roomRates;
    });
    onSeasonRatesChange(updatedRates);
    if (selectedSeasonId === id) setSelectedSeasonId(null);
    setIsAddingPeriod(false);
    toast({ title: "Season deleted" });
  };

  // Rate capture moved to Rate Plans — the Calendar authors season dates only.

  const isInSelection = (date: Date) => {
    if (!selectionStart) return false;
    if (!selectionEnd) return date.getTime() === selectionStart.getTime();
    return isWithinInterval(date, { start: selectionStart, end: selectionEnd });
  };

  const cancelSelection = () => {
    setIsAdding(false);
    setIsAddingPeriod(false);
    setSelectionStart(null);
    setSelectionEnd(null);
  };

  const startAddPeriod = () => {
    setIsAddingPeriod(true);
    setIsAdding(false);
    setSelectionStart(null);
    setSelectionEnd(null);
  };

  return (
    <div className="space-y-6">
      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* SECTION 1: PROPERTY SEASONS (global — applies to all rooms)   */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Property Seasons</h3>
          <span className="text-[10px] text-muted-foreground">(applies to all rooms)</span>
          {isReadOnly && (
            <Badge variant="outline" className="text-[10px] gap-1 ml-auto"><Lock className="h-3 w-3" /> Synced from {externalSystem || "PMS"}</Badge>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Seasons define <span className="font-medium">when</span> only. Nightly pricing for each season is set in Rate
          Plans.
        </p>

        {/* Coverage over the rolling 365-day selling window — informational only. */}
        <div
          className={cn(
            "rounded-md border px-2.5 py-1.5 text-[11px]",
            coverage.fullyCovered ? "border-success-border bg-success-surface" : "border-warning-border bg-warning-surface",
          )}
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium">Season coverage</span>
            <span>
              {coverage.coveredDays} of {coverage.windowDays} days covered ({coverage.windowStart} to{" "}
              {coverage.windowEnd})
            </span>
            {coverage.earliest && coverage.latest && (
              <span className="text-muted-foreground">
                Authored {coverage.earliest} to {coverage.latest}
              </span>
            )}
          </div>
          {coverage.fullyCovered ? (
            <p className="mt-0.5 text-muted-foreground">
              The full rolling year is covered — no season gaps block selling.
            </p>
          ) : (
            <p className="mt-0.5">
              Gaps with no season:{" "}
              {coverage.gaps
                .slice(0, 4)
                .map((g) => (g.from === g.to ? g.from : `${g.from} to ${g.to}`))
                .join(" · ")}
              {coverage.gaps.length > 4 ? ` +${coverage.gaps.length - 4} more` : ""}
            </p>
          )}
        </div>


        {/* Year nav + Add Season */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setYear((y) => y - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold w-12 text-center">{year}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setYear((y) => y + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {!isReadOnly && !isAdding && !isAddingPeriod && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setIsAdding(true); setSelectedSeasonId(null); setIsAddingPeriod(false); }}>
                <Plus className="h-3 w-3 mr-1" /> Add Season
              </Button>
            )}
            {(isAdding || isAddingPeriod) && (
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={cancelSelection}>
                <X className="h-3 w-3 mr-1" /> Cancel
              </Button>
            )}
          </div>
        </div>

        {isAdding && (
          <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
            Click a start date, then an end date on the calendar below to define the season range.
          </div>
        )}
        {isAddingPeriod && selectedSeason && (
          <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
            Adding period to <strong>{selectedSeason.name}</strong> — click a start date, then an end date.
          </div>
        )}

        {/* Calendar Grid */}
        <div className="overflow-x-auto border rounded-md">
          <table className="w-full text-[10px] border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 bg-background z-10 px-2 py-1 text-left font-medium border-b w-10"></th>
                {Array.from({ length: 31 }, (_, i) => (
                  <th key={i} className="px-0 py-1 text-center font-normal border-b text-muted-foreground w-6 min-w-[20px]">{i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthsGrid.map(({ month, days }) => (
                <tr key={month} className="group">
                  <td className="sticky left-0 bg-background z-10 px-2 py-0.5 font-medium border-r text-xs">{MONTH_NAMES[month]}</td>
                  {Array.from({ length: 31 }, (_, d) => {
                    const day = d + 1;
                    if (day > days) return <td key={d} className="bg-muted/20" />;
                    const date = new Date(year, month, day);
                    const season = getSeasonForDate(date, seasons);
                    const seasonIdx = season ? seasons.indexOf(season) : -1;
                    const colorDef = season ? getSeasonColor(season, seasonIdx) : null;
                    const inSel = (isAdding || isAddingPeriod) && isInSelection(date);
                    const isToday = format(date, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");

                    return (
                      <td
                        key={d}
                        className={cn(
                          "px-0 py-0.5 text-center cursor-pointer transition-colors border-r border-b",
                          colorDef ? colorDef.cell : "hover:bg-accent/30",
                          inSel && "!bg-primary/30 ring-1 ring-primary",
                          isToday && !colorDef && "bg-accent/50",
                          season && selectedSeasonId === season.id && "ring-1 ring-primary/50",
                        )}
                        onClick={() => handleCellClick(date)}
                        title={season ? `${season.name}` : format(date, "yyyy-MM-dd")}
                      >
                        <span className={cn("inline-block w-full", colorDef?.text)}>{day}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        {(visibleSeasons.length > 0 || expiredSeasonIds.size > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            {visibleSeasons.map((s) => {
              const c = getSeasonColor(s, seasons.indexOf(s));
              const periodCount = getSeasonPeriods(s).length;
              const expired = expiredSeasonIds.has(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => { setSelectedSeasonId(s.id === selectedSeasonId ? null : s.id); setIsAddingPeriod(false); }}
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 rounded text-xs border transition-all",
                    c.bg, c.border, c.text,
                    expired && "opacity-60",
                    selectedSeasonId === s.id && "ring-2 ring-primary shadow-sm",
                  )}
                >
                  {s.name || s.title}
                  {periodCount > 1 && <span className="opacity-60">({periodCount})</span>}
                  {expired && <span className="opacity-70">· past</span>}
                  {!isReadOnly && (
                    <Trash2
                      className="h-3 w-3 ml-1 opacity-50 hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); deleteSeason(s.id); }}
                    />
                  )}
                </button>
              );
            })}
            {expiredSeasonIds.size > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[10px]"
                onClick={() => { setShowPastSeasons((v) => !v); setIsAddingPeriod(false); }}
              >
                {showPastSeasons ? "Hide" : "Show"} past seasons ({expiredSeasonIds.size})
              </Button>
            )}
          </div>
        )}


        {/* Add Season Form (when range selected) */}
        {isAdding && selectionStart && selectionEnd && (
          <Card className="border-primary/30">
            <CardContent className="p-4 space-y-3">
              <p className="text-xs font-medium">New Season: {format(selectionStart, "dd MMM yyyy")} — {format(selectionEnd, "dd MMM yyyy")}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs">Name</Label>
                  <Input className="h-7 text-xs" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="e.g. Peak, Low, Festive" />
                </div>
                <div>
                  <Label className="text-xs">Color</Label>
                  <Select value={editForm.color} onValueChange={(v) => setEditForm({ ...editForm, color: v })}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SEASON_COLORS.map((c) => (
                        <SelectItem key={c.value} value={c.value} className="text-xs">
                          <span className={cn("inline-block w-3 h-3 rounded-sm mr-1", c.bg)} /> {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Min Stay</Label>
                  <Input className="h-7 text-xs" type="number" min={1} value={editForm.minStay} onChange={(e) => setEditForm({ ...editForm, minStay: parseInt(e.target.value) || 1 })} />
                </div>
                <div>
                  <Label className="text-xs">Max Stay</Label>
                  <Input className="h-7 text-xs" type="number" min={1} value={editForm.maxStay} onChange={(e) => setEditForm({ ...editForm, maxStay: parseInt(e.target.value) || 30 })} />
                </div>
              </div>
              <Button size="sm" className="h-7 text-xs" onClick={confirmAddSeason}>Create Season</Button>
            </CardContent>
          </Card>
        )}

        {/* Confirm Add Period */}
        {isAddingPeriod && selectionStart && selectionEnd && selectedSeason && (
          <Card className="border-primary/30">
            <CardContent className="p-4 space-y-3">
              <p className="text-xs font-medium">
                Add period to <strong>{selectedSeason.name}</strong>: {format(selectionStart, "dd MMM yyyy")} — {format(selectionEnd, "dd MMM yyyy")}
              </p>
              <Button size="sm" className="h-7 text-xs" onClick={confirmAddPeriod}>Add Period</Button>
            </CardContent>
          </Card>
        )}

        {/* Season Detail (property-level only — no rates here) */}
        {selectedSeason && !isAdding && (
          <Card className="border-primary/20">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">{selectedSeason.name || selectedSeason.title}</h4>
                <div className="flex items-center gap-1">
                  {!isReadOnly && !isAddingPeriod && (
                    <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={startAddPeriod}>
                      <CalendarPlus className="h-3 w-3" /> Add Period
                    </Button>
                  )}
                  {!isReadOnly && (
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => deleteSeason(selectedSeason.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setSelectedSeasonId(null); setIsAddingPeriod(false); }}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {/* Season metadata */}
              {!isReadOnly && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">Name</Label>
                    <Input className="h-7 text-xs" value={selectedSeason.name || ""} onChange={(e) => updateSeason("name", e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Color</Label>
                    <Select value={selectedSeason.color || "red"} onValueChange={(v) => updateSeason("color", v)}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SEASON_COLORS.map((c) => (
                          <SelectItem key={c.value} value={c.value} className="text-xs">
                            <span className={cn("inline-block w-3 h-3 rounded-sm mr-1", c.bg)} /> {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Min Stay</Label>
                    <Input className="h-7 text-xs" type="number" min={1} value={selectedSeason.minStay || 1} onChange={(e) => updateSeason("minStay", parseInt(e.target.value) || 1)} />
                  </div>
                  <div>
                    <Label className="text-xs">Max Stay</Label>
                    <Input className="h-7 text-xs" type="number" min={1} value={selectedSeason.maxStay || 30} onChange={(e) => updateSeason("maxStay", parseInt(e.target.value) || 30)} />
                  </div>
                </div>
              )}

              {/* Periods list */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">
                  Periods ({getSeasonPeriods(selectedSeason).length})
                </Label>
                {getSeasonPeriods(selectedSeason).map((period, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    {!isReadOnly ? (
                      <>
                        <Input
                          className="h-7 text-xs w-[130px]"
                          type="date"
                          value={period.from}
                          onChange={(e) => updatePeriodDate(selectedSeason.id, idx, "from", e.target.value)}
                        />
                        <span className="text-xs text-muted-foreground">—</span>
                        <Input
                          className="h-7 text-xs w-[130px]"
                          type="date"
                          value={period.to}
                          onChange={(e) => updatePeriodDate(selectedSeason.id, idx, "to", e.target.value)}
                        />
                        {getSeasonPeriods(selectedSeason).length > 1 && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 shrink-0"
                            onClick={() => deletePeriod(selectedSeason.id, idx)}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {period.from && period.to
                          ? `${format(parseISO(period.from), "dd MMM yyyy")} — ${format(parseISO(period.to), "dd MMM yyyy")}`
                          : "No dates"}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Stay shape — read-only mirror of ladders authored on Rate Plans */}
              {(stayShapeBySeason[selectedSeason.id]?.plans?.length ?? 0) > 0 && (
                <div className="space-y-1 border-t pt-2">
                  <Label className="text-xs font-medium text-muted-foreground">Stay shape (from Rate Plans)</Label>
                  {stayShapeBySeason[selectedSeason.id].plans.map((p) => (
                    <div key={p.rate_plan_id} className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{p.name}</span>
                      {p.los.map((r) => (
                        <span key={`los-${r.nights}-${r.label}`}> &middot; LOS {r.label}</span>
                      ))}
                      {p.fsp.map((c) => (
                        <span key={`fsp-${c.nights}-${c.guests}-${c.label}`}> &middot; FSP {c.label}</span>
                      ))}
                    </div>
                  ))}
                  <p className="text-[11px] text-muted-foreground">
                    Edit length-of-stay and full-stay on Rate Plans. Calendar still owns the dates.
                  </p>
                </div>
              )}

              {linkedRateTypes.length > 0 && (
                <div className="text-xs text-muted-foreground mt-2">
                  Linked rate types: {linkedRateTypes.map((rt) => rt.name).join(", ")}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {visibleSeasons.length === 0 && !isAdding && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            {expiredSeasonIds.size > 0
              ? "No current seasons — only past seasons exist. Use \"Show past seasons\" to review them."
              : isReadOnly
                ? "No seasons synced from PMS."
                : "No seasons defined. Click \"Add Season\" to get started."}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* SECTION 2: RATES LIVE IN RATE PLANS (read-only pointer)        */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {visibleSeasons.length > 0 && (
        <div className="border-t pt-4">
          <div className="flex items-start gap-2 rounded-lg border border-dashed p-3">
            <BedDouble className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Nightly rates, length-of-stay and full-stay are captured in Rate Plans.</span>{" "}
              The Calendar defines seasons — their dates, colours and minimum stay — only. Open{" "}
              <span className="font-medium text-foreground">Rate Manager &rarr; Rate Plans &rarr; Pricing by season</span>{" "}
              to set the amount each unit charges in every season.
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
