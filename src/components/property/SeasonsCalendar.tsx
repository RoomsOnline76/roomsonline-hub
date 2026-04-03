import React, { useState, useMemo, useCallback } from "react";
import { format, getDaysInMonth, isWithinInterval, parseISO, startOfDay } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Plus, Trash2, X, Lock, CalendarPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const SEASON_COLORS = [
  { name: "Red", value: "red", bg: "bg-red-200", border: "border-red-400", text: "text-red-800", cell: "bg-red-100" },
  { name: "Orange", value: "orange", bg: "bg-orange-200", border: "border-orange-400", text: "text-orange-800", cell: "bg-orange-100" },
  { name: "Amber", value: "amber", bg: "bg-amber-200", border: "border-amber-400", text: "text-amber-800", cell: "bg-amber-100" },
  { name: "Yellow", value: "yellow", bg: "bg-yellow-200", border: "border-yellow-400", text: "text-yellow-800", cell: "bg-yellow-100" },
  { name: "Teal", value: "teal", bg: "bg-teal-200", border: "border-teal-400", text: "text-teal-800", cell: "bg-teal-100" },
  { name: "Blue", value: "blue", bg: "bg-blue-200", border: "border-blue-400", text: "text-blue-800", cell: "bg-blue-100" },
  { name: "Purple", value: "purple", bg: "bg-purple-200", border: "border-purple-400", text: "text-purple-800", cell: "bg-purple-100" },
  { name: "Green", value: "green", bg: "bg-green-200", border: "border-green-400", text: "text-green-800", cell: "bg-green-100" },
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
  pricingModel,
  currency,
  isReadOnly,
  externalSystem,
  mealTypeSuggestions = [],
  onSeasonsChange,
  onSeasonRatesChange,
  onSelectedRoomTypeChange,
}: SeasonsCalendarProps) {
  const { toast } = useToast();
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isAddingPeriod, setIsAddingPeriod] = useState(false); // adding period to existing season
  const [selectionStart, setSelectionStart] = useState<Date | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<Date | null>(null);
  const [editForm, setEditForm] = useState({ name: "", color: "red", minStay: 1, maxStay: 30 });

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

  const selectedSeason = useMemo(() => seasons.find((s) => s.id === selectedSeasonId) || null, [seasons, selectedSeasonId]);
  const currentRoom = useMemo(() => roomTypes.find((r) => r.id === selectedRoomType), [roomTypes, selectedRoomType]);
  const linkedRateTypes = useMemo(() => {
    const linked = currentRoom?.linkedRateTypes || [];
    if (linked.length === 0) return pmsRateTypes;
    return pmsRateTypes.filter((rt) => linked.includes(String(rt.id)));
  }, [currentRoom, pmsRateTypes]);

  const monthsGrid = useMemo(() => {
    return Array.from({ length: 12 }, (_, m) => {
      const daysInMonth = getDaysInMonth(new Date(year, m));
      return { month: m, days: daysInMonth };
    });
  }, [year]);

  const handleCellClick = useCallback((date: Date) => {
    if (isReadOnly) return;

    // Adding period to existing season
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
    // In add mode: select range
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
      if (periods.length <= 1) return s; // can't delete last period
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

  const updateRate = (seasonId: string, mealTypeKey: string, field: RateField, value: number) => {
    const rateKey = mealTypeKey ? `${seasonId}-${mealTypeKey}` : seasonId;
    const updated: SeasonRates = {
      ...seasonRates,
      [selectedRoomType]: {
        ...(seasonRates[selectedRoomType] || {}),
        [rateKey]: {
          ...(seasonRates[selectedRoomType]?.[rateKey] || { roomAmount: 0, adultAmount: 0, teenAmount: 0, childAmount: 0, infantAmount: 0 }),
          [field]: value,
        },
      },
    };
    onSeasonRatesChange(updated);
  };

  const getRate = (seasonId: string, mealTypeKey: string, field: RateField): number => {
    const rateKey = mealTypeKey ? `${seasonId}-${mealTypeKey}` : seasonId;
    return seasonRates[selectedRoomType]?.[rateKey]?.[field] || 0;
  };

  const isInSelection = (date: Date) => {
    if (!selectionStart) return false;
    if (!selectionEnd) return date.getTime() === selectionStart.getTime();
    return isWithinInterval(date, { start: selectionStart, end: selectionEnd });
  };

  const allRateFields: { key: RateField; label: string; show: boolean }[] = [
    { key: "roomAmount" as RateField, label: pricingModel === "per_person" ? "Base" : "Room Rate", show: true },
    { key: "adultAmount" as RateField, label: "Adult", show: pricingModel === "per_person" },
    { key: "teenAmount" as RateField, label: "Teen", show: pricingModel === "per_person" },
    { key: "childAmount" as RateField, label: "Child", show: pricingModel === "per_person" },
    { key: "infantAmount" as RateField, label: "Infant", show: pricingModel === "per_person" },
  ];
  const rateFields = allRateFields.filter((f) => f.show);

  const activeMealTypes = mealTypeSuggestions.length > 0 ? mealTypeSuggestions : [""];

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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {roomTypes.length > 1 && (
            <Select value={selectedRoomType} onValueChange={(v) => onSelectedRoomTypeChange?.(v)}>
              <SelectTrigger className="h-8 text-xs w-[180px]">
                <SelectValue placeholder="Select room" />
              </SelectTrigger>
              <SelectContent>
                {roomTypes.map((r) => (
                  <SelectItem key={r.id} value={r.id} className="text-xs">{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setYear((y) => y - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold w-12 text-center">{year}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setYear((y) => y + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isReadOnly && (
            <Badge variant="outline" className="text-xs gap-1"><Lock className="h-3 w-3" /> Synced from {externalSystem || "PMS"}</Badge>
          )}
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
      {seasons.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {seasons.map((s, i) => {
            const c = getSeasonColor(s, i);
            const periodCount = getSeasonPeriods(s).length;
            return (
              <button
                key={s.id}
                onClick={() => { setSelectedSeasonId(s.id === selectedSeasonId ? null : s.id); setIsAddingPeriod(false); }}
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded text-xs border transition-all",
                  c.bg, c.border, c.text,
                  selectedSeasonId === s.id && "ring-2 ring-primary shadow-sm",
                )}
              >
                {s.name || s.title}
                {periodCount > 1 && <span className="opacity-60">({periodCount})</span>}
                {!isReadOnly && (
                  <Trash2
                    className="h-3 w-3 ml-1 opacity-50 hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); deleteSeason(s.id); }}
                  />
                )}
              </button>
            );
          })}
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

      {/* Season Detail / Rate Editor */}
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

            {/* Rate Editor per meal type */}
            {currentRoom && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground">Rates for: {currentRoom.name}</p>
                {activeMealTypes.map((mealType) => (
                  <div key={mealType || "__default"} className="space-y-1">
                    {mealType && <p className="text-xs font-medium capitalize">{mealType}</p>}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                      {rateFields.map((rf) => (
                        <div key={rf.key}>
                          <Label className="text-[10px] text-muted-foreground">{rf.label} ({currency})</Label>
                          <Input
                            className="h-7 text-xs"
                            type="number"
                            min={0}
                            value={getRate(selectedSeason.id, mealType, rf.key) || ""}
                            onChange={(e) => updateRate(selectedSeason.id, mealType, rf.key, parseFloat(e.target.value) || 0)}
                            disabled={isReadOnly}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
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

      {seasons.length === 0 && !isAdding && (
        <div className="text-center py-8 text-sm text-muted-foreground">
          {isReadOnly ? "No seasons synced from PMS." : "No seasons defined. Click \"Add Season\" to get started."}
        </div>
      )}
    </div>
  );
}
