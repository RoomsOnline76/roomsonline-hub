import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Calendar, Users, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMobileBooking } from "@/contexts/MobileBookingContext";
import { BottomSheetDatePicker } from "./BottomSheetDatePicker";
import { GuestCountStepper } from "./GuestCountStepper";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";
import { motion, AnimatePresence } from "framer-motion";

interface FloatingDateGuestPickerProps {
  onContinue?: () => void;
  ctaLabel?: string;
  showCta?: boolean;
  className?: string;
}

export function FloatingDateGuestPicker({
  onContinue,
  ctaLabel = "Check Rates",
  showCta = true,
  className,
}: FloatingDateGuestPickerProps) {
  const { state, setDates, updateRoom, addRoom, nights, totalGuests } = useMobileBooking();
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [guestPickerOpen, setGuestPickerOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const checkInDate = state.checkIn ? parseISO(state.checkIn) : null;
  const checkOutDate = state.checkOut ? parseISO(state.checkOut) : null;

  // Get first room for guest count display (or create defaults)
  const firstRoom = state.rooms[0] || {
    numberOfAdults: 2,
    numberOfTeens: 0,
    numberOfChildren: 0,
    numberOfInfants: 0,
  };

  const handleDatesChange = (checkIn: Date, checkOut: Date) => {
    setDates(format(checkIn, "yyyy-MM-dd"), format(checkOut, "yyyy-MM-dd"));
  };

  const handleGuestChange = (field: string, value: number) => {
    if (state.rooms.length === 0) {
      // Create first room with default values
      addRoom({
        roomTypeId: "",
        roomTypeName: "",
        numberOfAdults: field === "numberOfAdults" ? value : 2,
        numberOfTeens: field === "numberOfTeens" ? value : 0,
        numberOfChildren: field === "numberOfChildren" ? value : 0,
        numberOfInfants: field === "numberOfInfants" ? value : 0,
      });
    } else {
      updateRoom(0, { [field]: value });
    }
  };

  // Collapsed pill view
  const CollapsedPill = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="flex items-center gap-3"
    >
      <button
        onClick={() => setDatePickerOpen(true)}
        className={cn(
          "flex items-center gap-2 px-4 py-2.5 rounded-full",
          "bg-white/95 backdrop-blur-xl border border-white/20 shadow-lg",
          "text-sm font-medium transition-all duration-200",
          "hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
        )}
      >
        <Calendar className="h-4 w-4 text-primary" />
        <span>
          {checkInDate ? format(checkInDate, "MMM d") : "Check-in"}
          {" – "}
          {checkOutDate ? format(checkOutDate, "MMM d") : "Check-out"}
        </span>
      </button>

      <button
        onClick={() => setGuestPickerOpen(true)}
        className={cn(
          "flex items-center gap-2 px-4 py-2.5 rounded-full",
          "bg-white/95 backdrop-blur-xl border border-white/20 shadow-lg",
          "text-sm font-medium transition-all duration-200",
          "hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
        )}
      >
        <Users className="h-4 w-4 text-primary" />
        <span>{totalGuests || 2} guest{totalGuests !== 1 ? "s" : ""}</span>
      </button>

      {showCta && (
        <Button
          onClick={onContinue}
          className="h-11 px-6 rounded-full shadow-lg font-medium"
        >
          {ctaLabel}
        </Button>
      )}
    </motion.div>
  );

  // Expanded summary view
  const ExpandedSummary = () => (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className={cn(
        "w-full max-w-md mx-auto rounded-2xl overflow-hidden",
        "bg-white/95 backdrop-blur-xl border border-white/20 shadow-2xl"
      )}
    >
      <div className="p-4 space-y-3">
        {/* Dates row */}
        <button
          onClick={() => setDatePickerOpen(true)}
          className="w-full flex items-center justify-between p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
        >
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-primary" />
            <div className="text-left">
              <p className="text-xs text-muted-foreground">Dates</p>
              <p className="font-medium">
                {checkInDate && checkOutDate
                  ? `${format(checkInDate, "MMM d")} – ${format(checkOutDate, "MMM d")}`
                  : "Select dates"}
              </p>
            </div>
          </div>
          {nights > 0 && (
            <span className="text-sm text-muted-foreground">
              {nights} night{nights !== 1 ? "s" : ""}
            </span>
          )}
        </button>

        {/* Guests row */}
        <button
          onClick={() => setGuestPickerOpen(true)}
          className="w-full flex items-center justify-between p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
        >
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-primary" />
            <div className="text-left">
              <p className="text-xs text-muted-foreground">Guests</p>
              <p className="font-medium">
                {firstRoom.numberOfAdults} adult{firstRoom.numberOfAdults !== 1 ? "s" : ""}
                {firstRoom.numberOfChildren > 0 && `, ${firstRoom.numberOfChildren} child${firstRoom.numberOfChildren !== 1 ? "ren" : ""}`}
                {firstRoom.numberOfInfants > 0 && `, ${firstRoom.numberOfInfants} infant${firstRoom.numberOfInfants !== 1 ? "s" : ""}`}
              </p>
            </div>
          </div>
        </button>
      </div>

      {showCta && (
        <div className="px-4 pb-4">
          <Button
            onClick={onContinue}
            className="w-full h-12 rounded-xl text-base font-medium"
          >
            {ctaLabel}
          </Button>
        </div>
      )}

      {/* Collapse toggle */}
      <button
        onClick={() => setIsExpanded(false)}
        className="w-full py-2 border-t border-border/50 flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronDown className="h-4 w-4" />
        <span>Collapse</span>
      </button>
    </motion.div>
  );

  return (
    <>
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-40",
          "pb-[env(safe-area-inset-bottom,16px)] px-4 pt-3",
          className
        )}
      >
        <div className="flex items-center justify-center">
          <AnimatePresence mode="wait">
            {isExpanded ? (
              <ExpandedSummary key="expanded" />
            ) : (
              <CollapsedPill key="collapsed" />
            )}
          </AnimatePresence>
        </div>

        {/* Expand toggle for collapsed state */}
        {!isExpanded && (
          <button
            onClick={() => setIsExpanded(true)}
            className="absolute -top-8 left-1/2 -translate-x-1/2 flex items-center gap-1 px-3 py-1 rounded-full bg-background/80 backdrop-blur-sm border border-border/50 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronUp className="h-3 w-3" />
            <span>Details</span>
          </button>
        )}
      </div>

      {/* Date Picker Bottom Sheet */}
      <BottomSheetDatePicker
        open={datePickerOpen}
        onOpenChange={setDatePickerOpen}
        checkIn={checkInDate}
        checkOut={checkOutDate}
        onDatesChange={handleDatesChange}
      />

      {/* Guest Picker Bottom Sheet */}
      <Drawer open={guestPickerOpen} onOpenChange={setGuestPickerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="font-sans text-lg font-medium tracking-tight">
              Guests
            </DrawerTitle>
          </DrawerHeader>

          <div className="px-4 py-2 space-y-1">
            <GuestCountStepper
              label="Adults"
              sublabel="Ages 13+"
              value={firstRoom.numberOfAdults}
              min={1}
              max={10}
              onChange={(v) => handleGuestChange("numberOfAdults", v)}
            />
            <GuestCountStepper
              label="Children"
              sublabel="Ages 2-12"
              value={firstRoom.numberOfChildren}
              min={0}
              max={6}
              onChange={(v) => handleGuestChange("numberOfChildren", v)}
            />
            <GuestCountStepper
              label="Infants"
              sublabel="Under 2"
              value={firstRoom.numberOfInfants}
              min={0}
              max={4}
              onChange={(v) => handleGuestChange("numberOfInfants", v)}
            />
          </div>

          <DrawerFooter>
            <DrawerClose asChild>
              <Button className="w-full h-12 text-base font-medium">
                Done
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}
