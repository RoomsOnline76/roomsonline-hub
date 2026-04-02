import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { format, isWithinInterval, parseISO } from "date-fns";
import { 
  BedDouble, 
  Calendar, 
  DollarSign, 
  Clock, 
  Users, 
  AlertCircle,
  CheckCircle,
  Info,
  CalendarRange,
  Tag
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";

interface Season {
  id: string;
  name?: string;
  title?: string;
  from: string;
  to: string;
  minStay?: number;
  maxStay?: number;
}

interface RoomType {
  id: string;
  name: string;
  numRooms?: number;
  maxPeople?: number;
  maxAdults?: number;
  minStay?: number;
  maxStay?: number;
  rateType?: string;
  baseRate?: number | null;
  dailyRate?: number | null;
  linkedRateTypes?: string[];
  mealTypes?: string[];
  pms_synced?: boolean;
}

interface RateType {
  id: string | number;
  name: string;
  description?: string | null;
  priceType?: string | null;
  minAdvanceDays?: number | null;
  maxAdvanceDays?: number | null;
  minStayDays?: number | null;
  maxStayDays?: number | null;
  baseRate?: number | null;
  linkedRoomId?: string;
  pms_synced?: boolean;
}

interface SeasonRates {
  [roomId: string]: {
    [seasonMealKey: string]: {
      roomAmount: number;
      adultAmount: number;
      teenAmount: number;
      childAmount: number;
      infantAmount: number;
    };
  };
}

interface Issue {
  message: string;
  severity: 'warning' | 'error';
  action?: {
    tab: string;
    roomId?: string;
  };
}

interface RatesOverviewPanelProps {
  roomTypes: RoomType[];
  rateTypes: RateType[];
  seasons: Season[];
  seasonRates: SeasonRates;
  currency?: string;
  hasPMS?: boolean;
  pmsName?: string;
  onNavigate?: (tab: string, roomId?: string) => void;
}

export function RatesOverviewPanel({
  roomTypes,
  rateTypes,
  seasons,
  seasonRates,
  currency = "ZAR",
  hasPMS = false,
  pmsName,
  onNavigate
}: RatesOverviewPanelProps) {
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set([roomTypes[0]?.id]));
  
  const toggleRoom = (roomId: string) => {
    setExpandedRooms(prev => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
  };
  
  const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined || amount === 0) return null;
    return new Intl.NumberFormat('en-ZA', { 
      style: 'currency', 
      currency, 
      minimumFractionDigits: 0,
      maximumFractionDigits: 0 
    }).format(amount);
  };
  
  // Get current active season
  const today = new Date();
  const activeSeason = seasons.find(s => {
    try {
      if (!s.from || !s.to) return false;
      return isWithinInterval(today, { 
        start: parseISO(s.from), 
        end: parseISO(s.to) 
      });
    } catch {
      return false;
    }
  });
  
  // Get rate type for a room
  const getRoomRateTypes = (room: RoomType): RateType[] => {
    if (!room.linkedRateTypes?.length) return [];
    return rateTypes.filter(rt => room.linkedRateTypes?.includes(String(rt.id)));
  };
  
  // Get season rates for a room
  const getRoomSeasonRates = (roomId: string, seasonId: string) => {
    const roomRates = seasonRates[roomId] || {};
    // Find any rate entry for this season (could be season-only or season-mealType combo)
    const matchingKeys = Object.keys(roomRates).filter(k => k.startsWith(seasonId));
    if (matchingKeys.length === 0) return null;
    
    // Aggregate rates across meal types
    const rates = matchingKeys.map(k => roomRates[k]).filter(Boolean);
    if (rates.length === 0) return null;
    
    return {
      roomAmount: Math.max(...rates.map(r => r.roomAmount || 0)),
      adultAmount: Math.max(...rates.map(r => r.adultAmount || 0)),
      childAmount: Math.max(...rates.map(r => r.childAmount || 0)),
    };
  };
  
  // Check completeness with navigation actions
  const hasRooms = roomTypes.length > 0;
  const hasRates = rateTypes.length > 0 || roomTypes.some(r => r.baseRate || r.dailyRate);
  const hasSeasons = seasons.length > 0;
  
  const issues: Issue[] = [];
  if (!hasRooms) issues.push({ message: "No room types configured", severity: 'error', action: { tab: 'rooms' } });
  if (!hasRates) issues.push({ message: "No rate information available", severity: 'error', action: { tab: 'rates' } });
  if (!hasSeasons && !hasPMS) issues.push({ message: "No seasons defined", severity: 'warning', action: { tab: 'rates' } });
  
  roomTypes.forEach(room => {
    if (!room.maxPeople && !room.maxAdults) {
      issues.push({ message: `${room.name}: Missing max guests`, severity: 'warning', action: { tab: 'rooms', roomId: room.id } });
    }
    if (!room.baseRate && !room.dailyRate && !getRoomRateTypes(room).some(rt => rt.baseRate)) {
      issues.push({ message: `${room.name}: No base rate set`, severity: 'error', action: { tab: 'rooms', roomId: room.id } });
    }
  });

  return (
    <div className="space-y-6">
      {/* Summary Header */}
      <Card className={cn(
        "border-2",
        issues.length === 0 ? "border-green-500/30 bg-green-50/50" : 
        issues.length <= 2 ? "border-yellow-500/30 bg-yellow-50/50" : 
        "border-destructive/30 bg-destructive/5"
      )}>
        <CardContent className="pt-6">
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-3xl font-bold text-foreground">{roomTypes.length}</div>
              <p className="text-xs text-muted-foreground">Room Types</p>
            </div>
            <div>
              <div className="text-3xl font-bold text-foreground">{rateTypes.length}</div>
              <p className="text-xs text-muted-foreground">Rate Types</p>
            </div>
            <div>
              <div className="text-3xl font-bold text-foreground">{seasons.length}</div>
              <p className="text-xs text-muted-foreground">Seasons</p>
            </div>
            <div>
              <div className="text-3xl font-bold text-foreground">
                {issues.length === 0 ? (
                  <CheckCircle className="h-8 w-8 mx-auto text-green-600" />
                ) : (
                  <span className="text-yellow-600">{issues.length}</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {issues.length === 0 ? "Complete" : "Issues"}
              </p>
            </div>
          </div>
          
          {issues.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm font-medium text-muted-foreground mb-2">Missing Information:</p>
              <div className="flex flex-wrap gap-2">
                {issues.slice(0, 5).map((issue, i) => (
                  <Badge 
                    key={i} 
                    variant="outline" 
                    className={cn(
                      "text-xs bg-background",
                      issue.action && onNavigate && "cursor-pointer hover:bg-muted transition-colors"
                    )}
                    onClick={() => {
                      if (issue.action && onNavigate) {
                        onNavigate(issue.action.tab, issue.action.roomId);
                      }
                    }}
                  >
                    <AlertCircle className={cn(
                      "h-3 w-3 mr-1",
                      issue.severity === 'error' ? "text-destructive" : "text-yellow-600"
                    )} />
                    {issue.message}
                  </Badge>
                ))}
                {issues.length > 5 && (
                  <Badge variant="outline" className="text-xs">
                    +{issues.length - 5} more
                  </Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Season Banner */}
      {activeSeason && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-3 flex items-center gap-3">
            <Calendar className="h-5 w-5 text-primary" />
            <div>
              <span className="font-medium">Current Season: </span>
              <span className="text-primary font-semibold">{activeSeason.name || activeSeason.title}</span>
              <span className="text-muted-foreground text-sm ml-2">
                ({format(parseISO(activeSeason.from), "d MMM")} - {format(parseISO(activeSeason.to), "d MMM")})
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Room Types with Rates */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <BedDouble className="h-4 w-4" />
          Room Types & Rates
        </h3>
        
        {roomTypes.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center text-muted-foreground">
              <BedDouble className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No room types configured yet.</p>
              <p className="text-sm">Add rooms in the onboarding wizard or Rooms tab.</p>
            </CardContent>
          </Card>
        ) : (
          roomTypes.map(room => {
            const linkedRates = getRoomRateTypes(room);
            const baseRate = room.baseRate || room.dailyRate || linkedRates[0]?.baseRate;
            const isExpanded = expandedRooms.has(room.id);
            
            return (
              <Collapsible key={room.id} open={isExpanded} onOpenChange={() => toggleRoom(room.id)}>
                <Card className={cn(
                  "transition-all",
                  room.pms_synced && "border-primary/20"
                )}>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="py-3 cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <CardTitle className="text-base font-medium">{room.name}</CardTitle>
                          {room.pms_synced && (
                            <Badge variant="secondary" className="text-xs">PMS</Badge>
                          )}
                          {room.numRooms && room.numRooms > 1 && (
                            <Badge variant="outline" className="text-xs">
                              {room.numRooms} units
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          {baseRate && (
                            <span className="text-lg font-bold text-primary">
                              {formatCurrency(baseRate)}
                              <span className="text-xs text-muted-foreground font-normal ml-1">
                                /{room.rateType === 'per-stay' ? 'stay' : 'night'}
                              </span>
                            </span>
                          )}
                          <Badge variant={baseRate ? "default" : "destructive"} className="text-xs">
                            {baseRate ? "Priced" : "No Rate"}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent>
                    <CardContent className="pt-0 pb-4">
                      <Separator className="mb-4" />
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        {/* Occupancy */}
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-muted-foreground text-xs">Max Guests</p>
                            <p className="font-medium">{room.maxPeople || room.maxAdults || "—"}</p>
                          </div>
                        </div>
                        
                        {/* Stay Limits */}
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-muted-foreground text-xs">Stay Limits</p>
                            <p className="font-medium">
                              {(room.minStay && room.minStay > 1) || (room.maxStay && room.maxStay > 0) ? (
                                <>
                                  {room.minStay && room.minStay > 1 ? `${room.minStay} min` : ""}
                                  {room.minStay && room.minStay > 1 && room.maxStay && room.maxStay > 0 ? ", " : ""}
                                  {room.maxStay && room.maxStay > 0 ? `${room.maxStay} max` : ""}
                                </>
                              ) : "No limits"}
                            </p>
                          </div>
                        </div>
                        
                        {/* Rate Type */}
                        <div className="flex items-center gap-2">
                          <Tag className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-muted-foreground text-xs">Rate Type</p>
                            <p className="font-medium capitalize">
                              {room.rateType?.replace('-', ' ') || "Per Night"}
                            </p>
                          </div>
                        </div>
                        
                        {/* Linked Rate Types */}
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-muted-foreground text-xs">Rate Types</p>
                            <p className="font-medium">{linkedRates.length || "1 default"}</p>
                          </div>
                        </div>
                      </div>
                      
                      {/* Linked Rate Types Detail */}
                      {linkedRates.length > 0 && (
                        <div className="mt-4 pt-4 border-t">
                          <p className="text-xs font-medium text-muted-foreground mb-2">Linked Rate Types:</p>
                          <div className="flex flex-wrap gap-2">
                            {linkedRates.map(rt => (
                              <Badge key={rt.id} variant="outline" className="text-xs">
                                {rt.name}
                                {rt.baseRate && (
                                  <span className="ml-1 text-primary">{formatCurrency(rt.baseRate)}</span>
                                )}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Season Rates for this room */}
                      {seasons.length > 0 && (
                        <div className="mt-4 pt-4 border-t">
                          <p className="text-xs font-medium text-muted-foreground mb-2">Season Rates:</p>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="text-xs text-muted-foreground">
                                <tr>
                                  <th className="text-left pb-2">Season</th>
                                  <th className="text-left pb-2">Period</th>
                                  <th className="text-right pb-2">Room</th>
                                  <th className="text-right pb-2">Adult</th>
                                  <th className="text-right pb-2">Child</th>
                                </tr>
                              </thead>
                              <tbody>
                                {seasons.map(season => {
                                  const rates = getRoomSeasonRates(room.id, season.id);
                                  return (
                                    <tr key={season.id} className="border-t">
                                      <td className="py-2 font-medium">{season.name || season.title}</td>
                                      <td className="py-2 text-muted-foreground">
                                        {format(parseISO(season.from), "d MMM")} - {format(parseISO(season.to), "d MMM")}
                                      </td>
                                      <td className="py-2 text-right font-mono">
                                        {rates?.roomAmount ? formatCurrency(rates.roomAmount) : "—"}
                                      </td>
                                      <td className="py-2 text-right font-mono">
                                        {rates?.adultAmount ? formatCurrency(rates.adultAmount) : "—"}
                                      </td>
                                      <td className="py-2 text-right font-mono">
                                        {rates?.childAmount ? formatCurrency(rates.childAmount) : "—"}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })
        )}
      </div>

      {/* Seasons Overview */}
      {seasons.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <CalendarRange className="h-4 w-4" />
            Seasons & Availability Rules
          </h3>
          
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-3">
                {seasons.map((season, idx) => {
                  const isCurrent = activeSeason?.id === season.id;
                  return (
                    <div 
                      key={season.id} 
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg border",
                        isCurrent && "bg-primary/5 border-primary/30"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          isCurrent ? "bg-primary" : "bg-muted-foreground/30"
                        )} />
                        <div>
                          <p className="font-medium">
                            {season.name || season.title || `Season ${idx + 1}`}
                            {isCurrent && (
                              <Badge variant="default" className="ml-2 text-xs">Active</Badge>
                            )}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {format(parseISO(season.from), "d MMM yyyy")} — {format(parseISO(season.to), "d MMM yyyy")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        {season.minStay && season.minStay > 1 && (
                          <Badge variant="outline" className="text-xs">
                            Min {season.minStay} nights
                          </Badge>
                        )}
                        {season.maxStay && season.maxStay > 0 && (
                          <Badge variant="outline" className="text-xs">
                            Max {season.maxStay} nights
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Rate Types Overview */}
      {rateTypes.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Rate Types & Restrictions
          </h3>
          
          <Card>
            <CardContent className="pt-4">
              <div className="grid gap-3">
                {rateTypes.map(rt => (
                  <div key={rt.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50">
                    <div>
                      <p className="font-medium">{rt.name}</p>
                      {rt.description && (
                        <p className="text-sm text-muted-foreground">{rt.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {rt.baseRate && (
                        <Badge variant="default" className="font-mono">
                          {formatCurrency(rt.baseRate)}
                        </Badge>
                      )}
                      {rt.priceType && (
                        <Badge variant="outline" className="text-xs capitalize">
                          {rt.priceType}
                        </Badge>
                      )}
                      {rt.minStayDays && rt.minStayDays > 1 && (
                        <Badge variant="secondary" className="text-xs">
                          Min {rt.minStayDays}n
                        </Badge>
                      )}
                      {rt.minAdvanceDays && rt.minAdvanceDays > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          Book {rt.minAdvanceDays}d ahead
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Empty State */}
      {!hasRooms && !hasSeasons && !hasRates && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Info className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
            <h3 className="font-medium mb-2">No Rates Configured</h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              {hasPMS 
                ? `Sync from ${pmsName || 'your PMS'} to import room types and rates.`
                : "Add room types, seasons, and rates to set up pricing for your property."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
