import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, XCircle, AlertCircle, Calculator } from "lucide-react";
import { canonicalPricingModel } from "@/components/pms/rateplans/ratePlanDraft";
import { supabase } from "@/integrations/supabase/client";
import { StayRangePicker } from "@/components/ui/stay-range-picker";
import { GuestCountStepper } from "./GuestCountStepper";

interface AvailabilityStatus {
  loading: boolean;
  available: boolean | null;
  roomTypes: any[];
  error: string | null;
}

interface RatePlanInfo {
  pricing_model: string;
  base_rate: number;
  name: string;
}

interface ModifyBookingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: {
    id: string;
    guest_name: string;
    property_id: string;
    check_in_date: string;
    check_out_date: string;
    adults: number;
    teens?: number | null;
    children?: number | null;
    infants?: number | null;
    special_requests?: string | null;
    room_type_id?: string | null;
    total_price?: number;
    rolos_rate_plan_id?: string | null;
  };
  onSubmit: (modifications: Record<string, any>) => Promise<void>;
  loading?: boolean;
}

function countNights(checkIn: string, checkOut: string): number {
  const d1 = new Date(checkIn);
  const d2 = new Date(checkOut);
  return Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000));
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export const ModifyBookingModal: React.FC<ModifyBookingModalProps> = ({
  open,
  onOpenChange,
  booking,
  onSubmit,
  loading = false,
}) => {
  const [checkInDate, setCheckInDate] = useState(booking.check_in_date);
  const [checkOutDate, setCheckOutDate] = useState(booking.check_out_date);
  const [adults, setAdults] = useState(booking.adults);
  const [teens, setTeens] = useState(booking.teens || 0);
  const [children, setChildren] = useState(booking.children || 0);
  const [infants, setInfants] = useState(booking.infants || 0);
  const [specialRequests, setSpecialRequests] = useState(booking.special_requests || "");
  const [note, setNote] = useState("");

  const [propertyInfo, setPropertyInfo] = useState<{
    external_system: string | null;
    benson_property_code: string | null;
    is_rol_property: boolean | null;
  } | null>(null);

  const [ratePlan, setRatePlan] = useState<RatePlanInfo | null>(null);

  const [availability, setAvailability] = useState<AvailabilityStatus>({
    loading: false,
    available: null,
    roomTypes: [],
    error: null,
  });

  // Fetch property info and rate plan on mount
  useEffect(() => {
    if (!open) return;
    const fetchData = async () => {
      const { data: prop } = await supabase
        .from("properties")
        .select("external_system, benson_property_code, is_rol_property")
        .eq("id", booking.property_id)
        .maybeSingle();
      setPropertyInfo(prop);

      // Fetch rate plan if ROL booking
      if (booking.rolos_rate_plan_id) {
        const { data: rp } = await supabase
          .from("rolos_rate_plans")
          .select("pricing_model, base_rate, name")
          .eq("id", booking.rolos_rate_plan_id)
          .maybeSingle();
        if (rp) setRatePlan(rp as RatePlanInfo);
      }
    };
    fetchData();
  }, [open, booking.property_id, booking.rolos_rate_plan_id]);

  // Dynamic price calculation
  const estimatedPrice = useMemo(() => {
    if (!ratePlan) return null;

    const nights = countNights(checkInDate, checkOutDate);
    const rate = ratePlan.base_rate || 0;

    switch (canonicalPricingModel(ratePlan.pricing_model)) {
      case "per_person": {
        const totalPax = adults + teens;
        const childPax = children;
        return (totalPax * rate + childPax * rate) * nights;
      }
      case "per_person_sharing": {
        // Base rate covers 2 guests; each extra adult adds half the base.
        const extraAdults = Math.max(0, adults - 2);
        return (rate + extraAdults * (rate / 2)) * nights;
      }
      case "per_room":
      case "per_unit":
      default:
        return rate * nights;
    }
  }, [ratePlan, checkInDate, checkOutDate, adults, teens, children]);

  const priceChanged = estimatedPrice !== null && estimatedPrice !== booking.total_price;

  // Fetch live availability when dates change
  const fetchAvailability = useCallback(async (startDate: string, endDate: string) => {
    if (!propertyInfo?.external_system) return;
    if (!startDate || !endDate || startDate >= endDate) {
      setAvailability({ loading: false, available: null, roomTypes: [], error: null });
      return;
    }

    setAvailability({ loading: true, available: null, roomTypes: [], error: null });

    try {
      const edgeFunction = `${propertyInfo.external_system}-api`;
      const { data, error } = await supabase.functions.invoke(edgeFunction, {
        body: {
          action: "fetch_availability",
          property_id: booking.property_id,
          startDate: startDate,
          endDate: endDate,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) {
        const msg = typeof data.error === "string" ? data.error : data.error.message || "Availability check failed";
        throw new Error(msg);
      }

      const responseData = data?.data || data;
      const roomTypes = responseData?.room_types || responseData?.roomTypes || [];

      const hasAvailability = roomTypes.some((rt: any) => {
        const perNight = rt.rooms_available_per_night || rt.roomsAvailablePerNight || [];
        return perNight.length > 0 && perNight.every((n: any) => (n.available_units ?? n.numberOfRoomsAvailable ?? 0) > 0);
      });

      setAvailability({
        loading: false,
        available: hasAvailability,
        roomTypes,
        error: null,
      });
    } catch (err: any) {
      console.error("Availability check error:", err);
      setAvailability({
        loading: false,
        available: null,
        roomTypes: [],
        error: err.message || "Failed to check availability",
      });
    }
  }, [propertyInfo, booking.property_id]);

  // Trigger availability fetch when dates change
  useEffect(() => {
    if (checkInDate !== booking.check_in_date || checkOutDate !== booking.check_out_date) {
      const timer = setTimeout(() => {
        fetchAvailability(checkInDate, checkOutDate);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setAvailability({ loading: false, available: null, roomTypes: [], error: null });
    }
  }, [checkInDate, checkOutDate, booking.check_in_date, booking.check_out_date, fetchAvailability]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const modifications: Record<string, any> = {};
    
    if (checkInDate !== booking.check_in_date) modifications.check_in_date = checkInDate;
    if (checkOutDate !== booking.check_out_date) modifications.check_out_date = checkOutDate;
    if (adults !== booking.adults) modifications.adults = adults;
    if (teens !== (booking.teens || 0)) modifications.teens = teens;
    if (children !== (booking.children || 0)) modifications.children = children;
    if (infants !== (booking.infants || 0)) modifications.infants = infants;
    if (specialRequests !== (booking.special_requests || "")) modifications.special_requests = specialRequests;
    if (note.trim()) modifications.note = note.trim();

    if (Object.keys(modifications).length === 0) return;

    await onSubmit(modifications);
  };

  const hasChanges =
    checkInDate !== booking.check_in_date ||
    checkOutDate !== booking.check_out_date ||
    adults !== booking.adults ||
    teens !== (booking.teens || 0) ||
    children !== (booking.children || 0) ||
    infants !== (booking.infants || 0) ||
    specialRequests !== (booking.special_requests || "");

  const datesChanged = checkInDate !== booking.check_in_date || checkOutDate !== booking.check_out_date;
  const nights = countNights(checkInDate, checkOutDate);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Modify Booking</DialogTitle>
          <DialogDescription className="text-xs">
            Update reservation for <strong>{booking.guest_name}</strong>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Dates */}
          <div className="space-y-1">
            <Label className="text-xs">Stay dates</Label>
            <StayRangePicker
              size="compact"
              numberOfMonths={1}
              from={checkInDate}
              to={checkOutDate}
              onChange={({ from, to }) => {
                setCheckInDate(from ?? "");
                setCheckOutDate(to ?? "");
              }}
              placeholder="Select arrival & departure"
            />
          </div>

          {/* Availability Status Indicator */}
          {datesChanged && propertyInfo?.external_system && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-xs">
              {availability.loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  <span className="text-muted-foreground">Checking availability…</span>
                </>
              ) : availability.error ? (
                <>
                  <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-amber-600">{availability.error}</span>
                </>
              ) : availability.available === true ? (
                <>
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-emerald-600">Rooms available for selected dates</span>
                </>
              ) : availability.available === false ? (
                <>
                  <XCircle className="h-3.5 w-3.5 text-destructive" />
                  <span className="text-destructive">No availability for selected dates</span>
                </>
              ) : null}
            </div>
          )}

          {/* Guest Counts using GuestCountStepper */}
          <div className="space-y-0 border border-border rounded-lg px-3 divide-y divide-border">
            <GuestCountStepper
              label="Adults"
              value={adults}
              min={1}
              max={20}
              onChange={setAdults}
              className="py-2"
            />
            <GuestCountStepper
              label="Teens"
              sublabel="13–17 years"
              value={teens}
              min={0}
              max={10}
              onChange={setTeens}
              className="py-2"
            />
            <GuestCountStepper
              label="Children"
              sublabel="2–12 years"
              value={children}
              min={0}
              max={10}
              onChange={setChildren}
              className="py-2"
            />
            <GuestCountStepper
              label="Infants"
              sublabel="Under 2"
              value={infants}
              min={0}
              max={5}
              onChange={setInfants}
              className="py-2"
            />
          </div>

          {/* Dynamic Price Preview */}
          {ratePlan && (
            <div className={`rounded-lg border p-3 space-y-1.5 ${priceChanged ? "border-primary/40 bg-primary/5" : "border-border bg-muted/30"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calculator className="h-3 w-3" />
                  <span>Rate: {ratePlan.name} ({ratePlan.pricing_model.replace("_", " ")})</span>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {formatCurrency(ratePlan.base_rate || 0)}/{ratePlan.pricing_model === "per_person" ? "pp" : "night"}
                </Badge>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Current total</span>
                <span className="text-xs">{formatCurrency(booking.total_price || 0)}</span>
              </div>

              {estimatedPrice !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">New estimated total</span>
                  <span className={`text-sm font-semibold ${priceChanged ? "text-primary" : ""}`}>
                    {formatCurrency(estimatedPrice)}
                  </span>
                </div>
              )}

              {priceChanged && estimatedPrice !== null && (
                <div className="flex items-center justify-between pt-1 border-t border-border">
                  <span className="text-xs text-muted-foreground">Difference</span>
                  <span className={`text-xs font-medium ${(estimatedPrice - (booking.total_price || 0)) > 0 ? "text-destructive" : "text-emerald-600"}`}>
                    {(estimatedPrice - (booking.total_price || 0)) > 0 ? "+" : ""}
                    {formatCurrency(estimatedPrice - (booking.total_price || 0))}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Special Requests */}
          <div className="space-y-1">
            <Label className="text-xs">Special Requests</Label>
            <Textarea
              value={specialRequests}
              onChange={(e) => setSpecialRequests(e.target.value)}
              className="text-xs min-h-[60px]"
              placeholder="Any special requirements..."
            />
          </div>

          {/* Modification Note */}
          <div className="space-y-1">
            <Label className="text-xs">Modification Note</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="text-xs min-h-[40px]"
              placeholder="Reason for modification (internal)"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs h-8"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!hasChanges || loading || (datesChanged && availability.loading)}
              className="text-xs h-8"
            >
              {loading && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Confirm Modification
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
