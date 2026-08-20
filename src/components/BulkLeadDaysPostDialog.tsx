import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { syncRestrictionsToChannels } from "@/lib/restrictionSync";
import { format, eachDayOfInterval, getDay } from "date-fns";
import {
  PropertyScopeSelector,
  PropertyScopeValue,
  resolveTargetPropertyIds,
  useUnionRoomTypes,
} from "@/components/restrictions/PropertyScopeSelector";

interface BulkLeadDaysPostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId?: string;
  propertyName?: string;
  roomTypes?: { name: string; id?: string; units?: number }[];
  portfolioProperties?: { id: string; name: string }[];
  roomTypesByProperty?: Record<string, { name: string; id?: string; units?: number }[]>;
  onRuleCreated?: () => void;
}

export function BulkLeadDaysPostDialog({ 
  open, 
  onOpenChange,
  propertyId,
  propertyName,
  roomTypes = [],
  portfolioProperties,
  roomTypesByProperty,
  onRuleCreated
}: BulkLeadDaysPostDialogProps) {
  const [selectedRoomTypes, setSelectedRoomTypes] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(() => format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"));
  const [leadDaysPost, setLeadDaysPost] = useState("0");
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState<PropertyScopeValue>({ mode: "single", specificIds: [] });
  const [selectedDays, setSelectedDays] = useState({
    allDays: true,
    sunday: true,
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: true,
    saturday: true,
  });

  useEffect(() => {
    if (open) {
      setSelectedRoomTypes([]);
      setScope({ mode: "single", specificIds: [] });
    }
  }, [open]);

  const toggleDay = (day: keyof typeof selectedDays) => {
    if (day === "allDays") {
      const newValue = !selectedDays.allDays;
      setSelectedDays({
        allDays: newValue,
        sunday: newValue,
        monday: newValue,
        tuesday: newValue,
        wednesday: newValue,
        thursday: newValue,
        friday: newValue,
        saturday: newValue,
      });
    } else {
      setSelectedDays(prev => ({
        ...prev,
        [day]: !prev[day],
        allDays: false,
      }));
    }
  };

  const dayOfWeekMap: { [key: string]: number } = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

  const targetPropertyIds = useMemo(
    () => resolveTargetPropertyIds(scope, propertyId, portfolioProperties),
    [scope, propertyId, portfolioProperties],
  );
  const effectiveRoomTypes = useUnionRoomTypes(targetPropertyIds, roomTypesByProperty, roomTypes);

  const handleCreateRule = async () => {
    if (targetPropertyIds.length === 0) {
      toast.error("No property selected");
      return;
    }
    
    if (selectedRoomTypes.length === 0) {
      toast.error("Please select at least one room type");
      return;
    }
    
    if (!fromDate || !toDate) {
      toast.error("Please select date range");
      return;
    }

    const leadDays = parseInt(leadDaysPost, 10);
    if (isNaN(leadDays) || leadDays < 0) {
      toast.error("Please enter a valid number of days");
      return;
    }

    setSaving(true);
    try {
      const allDates = eachDayOfInterval({
        start: new Date(fromDate),
        end: new Date(toDate),
      });

      const selectedDaysOfWeek = Object.entries(selectedDays)
        .filter(([key, value]) => key !== 'allDays' && value)
        .map(([key]) => dayOfWeekMap[key]);

      const filteredDates = allDates.filter(date => 
        selectedDaysOfWeek.includes(getDay(date))
      );

      if (filteredDates.length === 0) {
        toast.error("No dates match the selected days of week");
        setSaving(false);
        return;
      }

      const records = [];
      for (const pid of targetPropertyIds) {
        for (const roomType of selectedRoomTypes) {
          for (const date of filteredDates) {
            records.push({
              property_id: pid,
              room_type: roomType,
              date: format(date, "yyyy-MM-dd"),
              lead_days_post: leadDays,
              external_system: 'manual',
            });
          }
        }
      }

      const { error } = await supabase
        .from("property_availability")
        .upsert(records, { 
          onConflict: 'property_id,room_type,date',
          ignoreDuplicates: false 
        });

      if (error) throw error;

      toast.success(`Set post lead days to ${leadDays} for ${filteredDates.length} dates`);
      onRuleCreated?.();
      void syncRestrictionsToChannels(targetPropertyIds, "lead_days");
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error creating lead days post rule:", error);
      toast.error(error.message || "Failed to create rule");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Lead Days Post
            <Badge variant="outline" className="ml-2">Manual Mode</Badge>
          </DialogTitle>
          <DialogDescription>
            {propertyName ? `Set post-booking window for ${propertyName}` : 'Set buffer days after last-minute bookings'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-12 gap-4 mt-4">
          {/* Left Sidebar - Rooms */}
          <div className="col-span-4 border rounded-lg p-4 space-y-2 max-h-[400px] overflow-y-auto">
            <p className="text-sm font-medium mb-2">Select Rooms</p>
            {effectiveRoomTypes.length > 0 ? (
              effectiveRoomTypes.map((room) => (
                <div key={room.id || room.name} className="flex items-center justify-between p-2 hover:bg-muted rounded">
                  <div className="flex items-center">
                    <Checkbox
                      id={`leadpost-${room.id || room.name}`}
                      checked={selectedRoomTypes.includes(room.name)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedRoomTypes([...selectedRoomTypes, room.name]);
                        } else {
                          setSelectedRoomTypes(selectedRoomTypes.filter(name => name !== room.name));
                        }
                      }}
                    />
                    <label htmlFor={`leadpost-${room.id || room.name}`} className="text-sm cursor-pointer ml-2">
                      {room.name}
                    </label>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No room types available</p>
            )}
          </div>

          {/* Right Content - Form */}
          <div className="col-span-8 space-y-4">
            {portfolioProperties && portfolioProperties.length > 1 && (
              <PropertyScopeSelector
                portfolioProperties={portfolioProperties}
                defaultPropertyId={propertyId}
                defaultPropertyName={propertyName}
                value={scope}
                onChange={setScope}
              />
            )}
            <div className="border rounded-lg p-6 space-y-4">
              <div className="space-y-2">
                <Label>Post Lead Days</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    type="number"
                    min="0"
                    value={leadDaysPost}
                    onChange={(e) => setLeadDaysPost(e.target.value)}
                    className="w-32"
                  />
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Buffer period after a booking is made (preparation time)
                </p>
              </div>

              <div className="space-y-2">
                <Label>Date Range</Label>
                <div className="flex gap-4 items-center">
                  <Input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="flex-1"
                  />
                  <span className="text-muted-foreground">to</span>
                  <Input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Apply to Days</Label>
                <div className="flex flex-wrap gap-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="leadpost-allDays"
                      checked={selectedDays.allDays}
                      onCheckedChange={() => toggleDay("allDays")}
                    />
                    <label htmlFor="leadpost-allDays" className="text-sm cursor-pointer font-medium">All days</label>
                  </div>
                  {["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].map((day) => (
                    <div key={day} className="flex items-center space-x-2">
                      <Checkbox
                        id={`leadpost-${day}`}
                        checked={selectedDays[day as keyof typeof selectedDays]}
                        onCheckedChange={() => toggleDay(day as keyof typeof selectedDays)}
                      />
                      <label htmlFor={`leadpost-${day}`} className="text-sm cursor-pointer capitalize">{day.slice(0, 3)}</label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreateRule} 
                  disabled={saving || selectedRoomTypes.length === 0 || targetPropertyIds.length === 0}
                >
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Set Lead Days
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
