import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Calendar, Users, ChevronDown, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormattedPrice } from '@/components/FormattedPrice';
import { cn } from '@/lib/utils';
import { useMobileBooking } from '@/contexts/MobileBookingContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useItinerary } from '@/contexts/ItineraryContext';
import { BottomSheetDatePicker } from '@/components/booking/BottomSheetDatePicker';
import { GuestCountStepper } from '@/components/booking/GuestCountStepper';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle,
  DrawerFooter, DrawerClose,
} from '@/components/ui/drawer';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { AffiliateNotice } from '@/components/AffiliateNotice';

interface BookingSidebarProps {
  lowestRate?: number | null;
  propertyName?: string;
  onBook: () => void;
  onViewJourney?: () => void;
  availabilityMap?: Map<string, { available: boolean; rate?: number }>;
  isExternal?: boolean;
  className?: string;
}

/**
 * Fluent-inspired sticky booking sidebar (desktop) / bottom bar (mobile)
 * Always visible, shows dates + guests + price + CTA
 */
export function BookingSidebar({
  lowestRate,
  propertyName,
  onBook,
  onViewJourney,
  availabilityMap,
  isExternal = false,
  className,
}: BookingSidebarProps) {
  const isMobile = useIsMobile();
  const { state, setDates, updateRoom, addRoom, nights, totalGuests } = useMobileBooking();
  const { hasStays, stayCount } = useItinerary();
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [guestPickerOpen, setGuestPickerOpen] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoCode, setPromoCode] = useState('');

  const checkInDate = state.checkIn ? parseISO(state.checkIn) : null;
  const checkOutDate = state.checkOut ? parseISO(state.checkOut) : null;
  const hasDates = checkInDate && checkOutDate;

  const firstRoom = state.rooms[0] || {
    numberOfAdults: 2, numberOfTeens: 0,
    numberOfChildren: 0, numberOfInfants: 0,
  };

  const handleDatesChange = (checkIn: Date, checkOut: Date) => {
    setDates(format(checkIn, 'yyyy-MM-dd'), format(checkOut, 'yyyy-MM-dd'));
  };

  const handleGuestChange = (field: string, value: number) => {
    if (state.rooms.length === 0) {
      addRoom({
        roomTypeId: '', roomTypeName: '',
        numberOfAdults: field === 'numberOfAdults' ? value : 2,
        numberOfTeens: field === 'numberOfTeens' ? value : 0,
        numberOfChildren: field === 'numberOfChildren' ? value : 0,
        numberOfInfants: field === 'numberOfInfants' ? value : 0,
      });
    } else {
      updateRoom(0, { [field]: value });
    }
  };

  // Calculate estimated total from availability map
  const estimatedTotal = (() => {
    if (!hasDates || !availabilityMap || availabilityMap.size === 0) return null;
    let total = 0;
    let daysFound = 0;
    const start = checkInDate!;
    for (let i = 0; i < nights; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const dateStr = format(d, 'yyyy-MM-dd');
      const entry = availabilityMap.get(dateStr);
      if (entry?.rate) {
        total += entry.rate;
        daysFound++;
      }
    }
    return daysFound > 0 ? total : null;
  })();

  // ----- MOBILE: sticky bottom bar -----
  if (isMobile) {
    return (
      <>
        <div className={cn(
          "fixed bottom-0 left-0 right-0 z-40",
          "bg-card/95 backdrop-blur-xl border-t border-border shadow-lg",
          "px-4 py-3 safe-area-bottom",
          className,
        )}>
          <div className="flex items-center gap-3">
            {/* Price / info */}
            <div className="flex-1 min-w-0">
              {estimatedTotal ? (
                <div>
                  <span className="text-lg font-semibold text-foreground">
                    <FormattedPrice amount={estimatedTotal} />
                  </span>
                  <span className="text-xs text-muted-foreground ml-1">
                    total · {nights} night{nights !== 1 ? 's' : ''}
                  </span>
                </div>
              ) : lowestRate ? (
                <div>
                  <span className="text-xs text-muted-foreground">From </span>
                  <span className="text-lg font-semibold text-foreground">
                    <FormattedPrice amount={lowestRate} />
                  </span>
                  <span className="text-xs text-muted-foreground"> /night</span>
                </div>
              ) : (
                <span className="text-sm font-medium truncate">{propertyName}</span>
              )}

              {/* Date/guest summary */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <button onClick={() => setDatePickerOpen(true)} className="hover:text-foreground transition-colors">
                  {hasDates
                    ? `${format(checkInDate!, 'MMM d')} – ${format(checkOutDate!, 'MMM d')}`
                    : 'Select dates'}
                </button>
                <span>·</span>
                <button onClick={() => setGuestPickerOpen(true)} className="hover:text-foreground transition-colors">
                  {totalGuests || 2} guest{totalGuests !== 1 ? 's' : ''}
                </button>
              </div>
            </div>

            {/* CTA */}
            <Button
              size="lg"
              onClick={onBook}
              className="shrink-0 h-12 px-6 rounded-xl font-medium shadow-md"
            >
              {hasDates ? 'Book Now' : 'Check Availability'}
            </Button>
          </div>
        </div>

        {/* Bottom sheets */}
        <BottomSheetDatePicker
          open={datePickerOpen}
          onOpenChange={setDatePickerOpen}
          checkIn={checkInDate}
          checkOut={checkOutDate}
          onDatesChange={handleDatesChange}
          availabilityMap={availabilityMap}
        />

        <Drawer open={guestPickerOpen} onOpenChange={setGuestPickerOpen}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle className="font-sans text-lg font-medium">Guests</DrawerTitle>
            </DrawerHeader>
            <div className="px-4 py-2 space-y-1">
              <GuestCountStepper label="Adults" sublabel="Ages 13+" value={firstRoom.numberOfAdults} min={1} max={10} onChange={(v) => handleGuestChange('numberOfAdults', v)} />
              <GuestCountStepper label="Children" sublabel="Ages 2-12" value={firstRoom.numberOfChildren} min={0} max={6} onChange={(v) => handleGuestChange('numberOfChildren', v)} />
              <GuestCountStepper label="Infants" sublabel="Under 2" value={firstRoom.numberOfInfants} min={0} max={4} onChange={(v) => handleGuestChange('numberOfInfants', v)} />
            </div>
            <DrawerFooter>
              <DrawerClose asChild>
                <Button className="w-full h-12 text-base font-medium">Done</Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  // ----- DESKTOP: sticky sidebar card -----
  return (
    <div className={cn(
      "sticky top-6 w-full max-w-[340px]",
      "bg-card rounded-2xl border border-border shadow-md",
      "p-6 space-y-5",
      className,
    )}>
      {/* Price header */}
      {(estimatedTotal || lowestRate) && (
        <div className="pb-4 border-b border-border/50">
          {estimatedTotal ? (
            <div>
              <span className="text-2xl font-semibold text-foreground">
                <FormattedPrice amount={estimatedTotal} />
              </span>
              <span className="text-sm text-muted-foreground ml-1">total</span>
              <p className="text-xs text-muted-foreground mt-0.5">
                {nights} night{nights !== 1 ? 's' : ''} · avg <FormattedPrice amount={Math.round(estimatedTotal / nights)} />/night
              </p>
            </div>
          ) : lowestRate ? (
            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">From</span>
              <div className="text-2xl font-semibold text-foreground">
                <FormattedPrice amount={lowestRate} />
              </div>
              <span className="text-xs text-muted-foreground">per night</span>
            </div>
          ) : null}
        </div>
      )}

      {/* Dates */}
      <button
        onClick={() => setDatePickerOpen(true)}
        className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/40 hover:bg-muted/30 transition-all text-left"
      >
        <Calendar className="h-5 w-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">Dates</p>
          <p className="text-sm font-medium truncate">
            {hasDates
              ? `${format(checkInDate!, 'MMM d')} – ${format(checkOutDate!, 'MMM d')}`
              : 'Select dates'}
          </p>
        </div>
        {nights > 0 && (
          <span className="text-xs text-muted-foreground shrink-0">
            {nights} night{nights !== 1 ? 's' : ''}
          </span>
        )}
      </button>

      {/* Guests */}
      <button
        onClick={() => setGuestPickerOpen(true)}
        className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/40 hover:bg-muted/30 transition-all text-left"
      >
        <Users className="h-5 w-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">Guests</p>
          <p className="text-sm font-medium">
            {firstRoom.numberOfAdults} adult{firstRoom.numberOfAdults !== 1 ? 's' : ''}
            {firstRoom.numberOfChildren > 0 && `, ${firstRoom.numberOfChildren} child${firstRoom.numberOfChildren !== 1 ? 'ren' : ''}`}
          </p>
        </div>
      </button>

      {/* Promo code */}
      <Collapsible open={promoOpen} onOpenChange={setPromoOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full">
          <Tag className="h-3.5 w-3.5" />
          <span>Have a promo code?</span>
          <ChevronDown className={cn("h-3 w-3 ml-auto transition-transform", promoOpen && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <Input
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value)}
            placeholder="Enter code"
            className="h-10 text-sm"
          />
        </CollapsibleContent>
      </Collapsible>

      {/* CTA */}
      <Button
        size="lg"
        onClick={onBook}
        className="w-full h-12 rounded-xl text-base font-medium shadow-md"
      >
        {hasDates ? 'Book Now' : 'Check Availability'}
      </Button>

      {isExternal && <AffiliateNotice />}

      {/* Journey link */}
      {hasStays && onViewJourney && (
        <Button
          variant="outline"
          size="sm"
          onClick={onViewJourney}
          className="w-full text-sm"
        >
          View Journey ({stayCount} stay{stayCount !== 1 ? 's' : ''})
        </Button>
      )}

      {/* Date picker popover for desktop */}
      <BottomSheetDatePicker
        open={datePickerOpen}
        onOpenChange={setDatePickerOpen}
        checkIn={checkInDate}
        checkOut={checkOutDate}
        onDatesChange={handleDatesChange}
        availabilityMap={availabilityMap}
      />

      {/* Guest picker drawer for desktop too (simpler than building inline) */}
      <Drawer open={guestPickerOpen} onOpenChange={setGuestPickerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="font-sans text-lg font-medium">Guests</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 py-2 space-y-1">
            <GuestCountStepper label="Adults" sublabel="Ages 13+" value={firstRoom.numberOfAdults} min={1} max={10} onChange={(v) => handleGuestChange('numberOfAdults', v)} />
            <GuestCountStepper label="Children" sublabel="Ages 2-12" value={firstRoom.numberOfChildren} min={0} max={6} onChange={(v) => handleGuestChange('numberOfChildren', v)} />
            <GuestCountStepper label="Infants" sublabel="Under 2" value={firstRoom.numberOfInfants} min={0} max={4} onChange={(v) => handleGuestChange('numberOfInfants', v)} />
          </div>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button className="w-full h-12 text-base font-medium">Done</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
