import { useState } from "react";
import { ChevronRight, ChevronDown, Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

interface ExpandableDataViewerProps {
  data: any;
  label?: string;
  level?: number;
  defaultExpanded?: boolean;
}

export function ExpandableDataViewer({ 
  data, 
  label, 
  level = 0, 
  defaultExpanded = false 
}: ExpandableDataViewerProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  const isArray = Array.isArray(data);
  const isObject = data !== null && typeof data === "object" && !isArray;
  const isExpandable = isArray || isObject;
  const isEmpty = isArray ? data.length === 0 : isObject ? Object.keys(data).length === 0 : false;
  
  // Format primitive values
  const formatValue = (value: any): string => {
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") return value.toString();
    if (typeof value === "string") return value.length > 50 ? `"${value.substring(0, 50)}..."` : `"${value}"`;
    return String(value);
  };
  
  // Get type badge color
  const getTypeBadge = (value: any) => {
    if (Array.isArray(value)) return <Badge variant="outline" className="text-xs font-mono ml-2">Array[{value.length}]</Badge>;
    if (value === null) return <Badge variant="outline" className="text-xs font-mono ml-2 text-muted-foreground">null</Badge>;
    if (typeof value === "object") return <Badge variant="outline" className="text-xs font-mono ml-2">Object</Badge>;
    if (typeof value === "number") return <Badge variant="outline" className="text-xs font-mono ml-2 text-blue-600">number</Badge>;
    if (typeof value === "boolean") return <Badge variant="outline" className="text-xs font-mono ml-2 text-purple-600">boolean</Badge>;
    if (typeof value === "string") return <Badge variant="outline" className="text-xs font-mono ml-2 text-green-600">string</Badge>;
    return null;
  };
  
  if (!isExpandable) {
    return (
      <div className={cn("flex items-center gap-2 py-1", level > 0 && "pl-4")}>
        {label && <span className="font-medium text-sm text-muted-foreground">{label}:</span>}
        <span className="text-sm font-mono">{formatValue(data)}</span>
        {getTypeBadge(data)}
      </div>
    );
  }
  
  if (isEmpty) {
    return (
      <div className={cn("flex items-center gap-2 py-1", level > 0 && "pl-4")}>
        {label && <span className="font-medium text-sm text-muted-foreground">{label}:</span>}
        <span className="text-sm text-muted-foreground italic">{isArray ? "[]" : "{}"}</span>
        {getTypeBadge(data)}
      </div>
    );
  }
  
  return (
    <div className={cn(level > 0 && "pl-4")}>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "flex items-center gap-2 py-1 hover:bg-muted/50 rounded px-2 -ml-2 w-full text-left transition-colors",
          isExpanded && "bg-muted/30"
        )}
      >
        <span className="text-muted-foreground">
          {isExpanded ? (
            <Minus className="h-3.5 w-3.5" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
        </span>
        {label && <span className="font-medium text-sm">{label}</span>}
        {getTypeBadge(data)}
        {!isExpanded && isArray && data.length > 0 && (
          <span className="text-xs text-muted-foreground ml-2">
            {data.length} item{data.length !== 1 ? "s" : ""}
          </span>
        )}
        {!isExpanded && isObject && (
          <span className="text-xs text-muted-foreground ml-2 truncate max-w-[200px]">
            {Object.keys(data).slice(0, 3).join(", ")}{Object.keys(data).length > 3 ? "..." : ""}
          </span>
        )}
      </button>
      
      {isExpanded && (
        <div className={cn(
          "border-l-2 border-muted ml-1 mt-1",
          level === 0 && "border-primary/20"
        )}>
          {isArray ? (
            data.map((item: any, index: number) => (
              <ExpandableDataViewer 
                key={index} 
                data={item} 
                label={`[${index}]`} 
                level={level + 1} 
              />
            ))
          ) : (
            Object.entries(data).map(([key, value]) => (
              <ExpandableDataViewer 
                key={key} 
                data={value} 
                label={key} 
                level={level + 1} 
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Specialized viewer for room type data
interface RoomTypeDataViewerProps {
  room: any;
  rateTypes?: any[];
}

export function RoomTypeDataViewer({ room, rateTypes = [] }: RoomTypeDataViewerProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  
  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };
  
  // Get linked rate type objects
  const linkedRateTypeData = rateTypes.filter(rt => 
    (room.linkedRateTypes || []).includes(rt.id)
  );
  
  // Get available rate types for this room
  const availableRateTypeData = rateTypes.filter(rt =>
    (room.availableRateTypes || room.linkedRateTypes || []).includes(rt.id)
  );
  
  // Get embedded rate types from room (from Benson API nested array)
  const embeddedRateTypes = room.rateTypes || [];
  
  return (
    <div className="space-y-2 text-sm">
      {/* Basic Fields */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 p-2 bg-muted/30 rounded">
        <div><span className="text-muted-foreground">ID:</span> <span className="font-mono">{room.id}</span></div>
        <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{room.name}</span></div>
        {room.pmsRoomId && <div><span className="text-muted-foreground">PMS ID:</span> <span className="font-mono">{room.pmsRoomId}</span></div>}
        {room.maxPeople && <div><span className="text-muted-foreground">Max People:</span> {room.maxPeople}</div>}
        {room.minAgeCategory && <div><span className="text-muted-foreground">Min Age Category:</span> {room.minAgeCategory}</div>}
        {room.minAdultsToOfferNonAdultRates !== undefined && <div><span className="text-muted-foreground">Min Adults for Non-Adult Rates:</span> {room.minAdultsToOfferNonAdultRates}</div>}
      </div>
      
      {/* Embedded Rate Types from Room (nested array from API) */}
      {embeddedRateTypes.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('embeddedRateTypes')}
            className="flex items-center gap-2 w-full p-2 bg-muted/50 hover:bg-muted transition-colors text-left"
          >
            {expandedSections['embeddedRateTypes'] ? (
              <Minus className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Plus className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="font-medium">Rate Types (Nested from API)</span>
            <Badge variant="outline" className="ml-auto">
              {embeddedRateTypes.length} entries
            </Badge>
          </button>
          
          {expandedSections['embeddedRateTypes'] && (
            <div className="p-3 max-h-[400px] overflow-auto">
              <ExpandableDataViewer data={embeddedRateTypes} level={0} />
            </div>
          )}
        </div>
      )}
      
      {/* Rate Types Section - from prop */}
      {availableRateTypeData.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('rateTypes')}
            className="flex items-center gap-2 w-full p-2 bg-muted/50 hover:bg-muted transition-colors text-left"
          >
            {expandedSections['rateTypes'] ? (
              <Minus className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Plus className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="font-medium">Rate Types (Linked)</span>
            <Badge variant="outline" className="ml-auto">
              {linkedRateTypeData.length}/{availableRateTypeData.length} linked
            </Badge>
          </button>
          
          {expandedSections['rateTypes'] && (
            <div className="divide-y">
              {availableRateTypeData.map((rateType) => {
                const isLinked = (room.linkedRateTypes || []).includes(rateType.id);
                const isRateExpanded = expandedSections[`rate-${rateType.id}`];
                
                return (
                  <div key={rateType.id} className={cn(
                    "transition-colors",
                    isLinked ? "bg-primary/5" : "bg-muted/20"
                  )}>
                    <button
                      type="button"
                      onClick={() => toggleSection(`rate-${rateType.id}`)}
                      className="flex items-center gap-2 w-full p-2 hover:bg-muted/30 text-left"
                    >
                      {isRateExpanded ? (
                        <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span className={cn("font-medium", !isLinked && "text-muted-foreground")}>{rateType.name}</span>
                      <Badge variant={isLinked ? "default" : "outline"} className="text-xs ml-auto">
                        {isLinked ? "Linked" : "Available"}
                      </Badge>
                    </button>
                    
                    {isRateExpanded && (
                      <div className="px-4 pb-3">
                        <ExpandableDataViewer data={rateType} level={0} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      
      {/* PMS Rates (date-specific rates from API) */}
      {room.pms_rates && room.pms_rates.length > 0 && (
        <div className="border rounded-lg overflow-hidden border-primary/30">
          <button
            type="button"
            onClick={() => toggleSection('pmsRates')}
            className="flex items-center gap-2 w-full p-2 bg-primary/10 hover:bg-primary/20 transition-colors text-left"
          >
            {expandedSections['pmsRates'] ? (
              <Minus className="h-4 w-4 text-primary" />
            ) : (
              <Plus className="h-4 w-4 text-primary" />
            )}
            <span className="font-medium text-primary">Rates from PMS</span>
            <Badge variant="default" className="ml-auto">
              {room.pms_rates.length} rate entries
            </Badge>
          </button>
          
          {expandedSections['pmsRates'] && (
            <div className="p-3 max-h-[400px] overflow-auto">
              {/* Group rates by rate type for easier viewing */}
              {(() => {
                const ratesByType: Record<string, any[]> = {};
                room.pms_rates.forEach((rate: any) => {
                  const key = rate.rateTypeName || `Rate Type ${rate.rateTypeId}`;
                  if (!ratesByType[key]) ratesByType[key] = [];
                  ratesByType[key].push(rate);
                });
                
                return Object.entries(ratesByType).map(([typeName, rates]) => (
                  <div key={typeName} className="mb-3 last:mb-0">
                    <div className="font-medium text-sm mb-2 flex items-center gap-2">
                      {typeName}
                      <Badge variant="outline" className="text-xs">{rates.length} dates</Badge>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-muted/50">
                            <th className="border p-1 text-left">Date</th>
                            <th className="border p-1 text-right">Room</th>
                            <th className="border p-1 text-right">1 Adult</th>
                            <th className="border p-1 text-right">2 Adults</th>
                            <th className="border p-1 text-right">Teen</th>
                            <th className="border p-1 text-right">Child</th>
                            <th className="border p-1 text-right">Infant</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rates.slice(0, 10).map((rate: any, idx: number) => (
                            <tr key={idx} className="hover:bg-muted/30">
                              <td className="border p-1 font-mono">{rate.date}</td>
                              <td className="border p-1 text-right">{rate.roomAmount ?? '—'}</td>
                              <td className="border p-1 text-right">{rate.adultAmount1 ?? '—'}</td>
                              <td className="border p-1 text-right">{rate.adultAmount2 ?? '—'}</td>
                              <td className="border p-1 text-right">{rate.teenAmount ?? '—'}</td>
                              <td className="border p-1 text-right">{rate.childAmount ?? '—'}</td>
                              <td className="border p-1 text-right">{rate.infantAmount ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {rates.length > 10 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Showing 10 of {rates.length} entries
                        </p>
                      )}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      )}
      
      {/* Rooms Available Per Night */}
      {room.roomsAvailablePerNight && room.roomsAvailablePerNight.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('availability')}
            className="flex items-center gap-2 w-full p-2 bg-muted/50 hover:bg-muted transition-colors text-left"
          >
            {expandedSections['availability'] ? (
              <Minus className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Plus className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="font-medium">Rooms Available Per Night</span>
            <Badge variant="outline" className="ml-auto">
              {room.roomsAvailablePerNight.length} entries
            </Badge>
          </button>
          
          {expandedSections['availability'] && (
            <div className="p-3 max-h-[300px] overflow-auto">
              <ExpandableDataViewer data={room.roomsAvailablePerNight} level={0} />
            </div>
          )}
        </div>
      )}
      
      {/* PMS Synced Fields */}
      {room.pms_synced_fields && room.pms_synced_fields.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('pmsSyncedFields')}
            className="flex items-center gap-2 w-full p-2 bg-muted/50 hover:bg-muted transition-colors text-left"
          >
            {expandedSections['pmsSyncedFields'] ? (
              <Minus className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Plus className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="font-medium">PMS Synced Fields</span>
            <Badge variant="outline" className="ml-auto">
              {room.pms_synced_fields.length} fields
            </Badge>
          </button>
          
          {expandedSections['pmsSyncedFields'] && (
            <div className="p-3">
              <div className="flex flex-wrap gap-1">
                {room.pms_synced_fields.map((field: string) => (
                  <Badge key={field} variant="secondary" className="text-xs">{field}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* All Other Data */}
      <div className="border rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('rawData')}
          className="flex items-center gap-2 w-full p-2 bg-muted/50 hover:bg-muted transition-colors text-left"
        >
          {expandedSections['rawData'] ? (
            <Minus className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Plus className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="font-medium">All Room Data</span>
        </button>
        
        {expandedSections['rawData'] && (
          <div className="p-3 max-h-[400px] overflow-auto">
            <ExpandableDataViewer data={room} level={0} />
          </div>
        )}
      </div>
    </div>
  );
}

// Rate Type Item with expandable details
interface RateTypeItemProps {
  rateType: any;
  isLinked: boolean;
  onToggleLink: () => void;
}

export function RateTypeItem({ rateType, isLinked, onToggleLink }: RateTypeItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div
      className={cn(
        "border rounded-lg transition-all",
        isLinked 
          ? "border-primary bg-primary/5 ring-1 ring-primary" 
          : "border-border"
      )}
    >
      <div 
        className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={onToggleLink}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Checkbox 
                checked={isLinked}
                className="pointer-events-none"
              />
              <span className="font-medium">{rateType.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 ml-2"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
              >
                {isExpanded ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              </Button>
            </div>
            {rateType.description && (
              <p className="text-xs text-muted-foreground mt-1 ml-6 line-clamp-2">
                {rateType.description}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2 ml-6">
              {rateType.priceType && (
                <Badge variant="secondary" className="text-xs">
                  {rateType.priceType}
                </Badge>
              )}
              {(rateType.minStayDays || rateType.minNights) && (
                <Badge variant="outline" className="text-xs">
                  Min {rateType.minStayDays || rateType.minNights} nights
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>
      {isExpanded && (
        <div className="border-t px-4 py-3 bg-muted/20">
          <ExpandableDataViewer data={rateType} defaultExpanded={true} />
        </div>
      )}
    </div>
  );
}
