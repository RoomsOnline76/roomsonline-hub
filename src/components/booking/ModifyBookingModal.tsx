import React, { useState } from "react";
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
import { Loader2 } from "lucide-react";

interface ModifyBookingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: {
    id: string;
    guest_name: string;
    check_in_date: string;
    check_out_date: string;
    adults: number;
    teens?: number | null;
    children?: number | null;
    infants?: number | null;
    special_requests?: string | null;
  };
  onSubmit: (modifications: Record<string, any>) => Promise<void>;
  loading?: boolean;
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

    if (Object.keys(modifications).length === 0) {
      return; // Nothing changed
    }

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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Check-in</Label>
              <Input
                type="date"
                value={checkInDate}
                onChange={(e) => setCheckInDate(e.target.value)}
                className="h-8 text-xs"
                min={new Date().toISOString().split("T")[0]}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Check-out</Label>
              <Input
                type="date"
                value={checkOutDate}
                onChange={(e) => setCheckOutDate(e.target.value)}
                className="h-8 text-xs"
                min={checkInDate}
              />
            </div>
          </div>

          {/* Guest Counts */}
          <div className="grid grid-cols-4 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Adults</Label>
              <Input
                type="number"
                min={1}
                value={adults}
                onChange={(e) => setAdults(Number(e.target.value))}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Teens</Label>
              <Input
                type="number"
                min={0}
                value={teens}
                onChange={(e) => setTeens(Number(e.target.value))}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Children</Label>
              <Input
                type="number"
                min={0}
                value={children}
                onChange={(e) => setChildren(Number(e.target.value))}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Infants</Label>
              <Input
                type="number"
                min={0}
                value={infants}
                onChange={(e) => setInfants(Number(e.target.value))}
                className="h-8 text-xs"
              />
            </div>
          </div>

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
              disabled={!hasChanges || loading}
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
