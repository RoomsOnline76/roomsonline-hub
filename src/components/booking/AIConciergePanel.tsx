import { useState, useEffect, useRef, useCallback } from "react";
import { format, addDays, parseISO } from "date-fns";
import { 
  Sparkles, 
  Send, 
  Calendar, 
  Users, 
  ChevronUp, 
  ChevronDown,
  MessageCircle,
  Loader2,
  Check,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useItinerary } from "@/contexts/ItineraryContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useMobileBooking } from "@/contexts/MobileBookingContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { VoiceInputButton } from "./VoiceInputButton";
import { BottomSheetDatePicker } from "./BottomSheetDatePicker";
import { GuestCountStepper } from "./GuestCountStepper";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";

interface RoomType {
  id: string;
  name: string;
  maxPeople?: number;
  maxAdults?: number;
  description?: string;
  images?: string[];
  bedConfiguration?: string | { type: string; count: number }[];
}

interface ConciergeMessage {
  id: string;
  type: 'user' | 'assistant' | 'suggestion';
  content: string;
  suggestions?: ConciergeSuggestion[];
  timestamp: Date;
}

interface ConciergeSuggestion {
  id: string;
  type: 'dates' | 'room' | 'upsell' | 'date_alternative';
  dates?: { check_in: string; check_out: string };
  room?: { id: string; name: string; price_per_night: number; total: number };
  message: string;
  savings?: number;
  is_best_value?: boolean;
}

const QUICK_CHIPS = [
  "This weekend for 2",
  "Show me the best room",
  "Family-friendly options",
  "Under R1500/night",
];

interface AIconciergePanelProps {
  propertyId: string;
  propertyName: string;
  propertySlug: string;
  propertyImage?: string;
  externalSystem?: string;
  roomTypes: RoomType[];
  availabilityMap?: Map<string, { available: boolean; rate?: number }>;
  onRoomSelected?: (roomId: string, dates: { check_in: string; check_out: string }, guests: { adults: number; children: number; infants: number }) => void;
  onError?: () => void;
  className?: string;
}

export function AIConciergePanel({
  propertyId,
  propertyName,
  propertySlug,
  propertyImage,
  externalSystem,
  roomTypes,
  availabilityMap,
  onRoomSelected,
  onError,
  className,
}: AIconciergePanelProps) {
  const isMobile = useIsMobile();
  const { formatPrice } = useCurrency();
  const { state: mobileBookingState, setDates, updateRoom, addRoom } = useMobileBooking();
  const { addStay, totalPrice, hasStays } = useItinerary();

  const [isExpanded, setIsExpanded] = useState(!isMobile);
  const [isMinimized, setIsMinimized] = useState(false); // NEW: Desktop minimize state
  const [isInitiated, setIsInitiated] = useState(false); // Start hidden until user initiates
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<ConciergeMessage[]>([
    {
      id: 'welcome',
      type: 'assistant',
      content: "Hi! 👋 I'm **TOBI**, your AI travel concierge. Tell me your dates, number of guests, room preference, or budget — and I'll find the perfect stay for you!",
      timestamp: new Date(),
    },
  ]);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [guestPickerOpen, setGuestPickerOpen] = useState(false);
  const [showProactivePrompt, setShowProactivePrompt] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const proactiveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const lastActivityRef = useRef<Date>(new Date());

  // Get current dates and guests from context
  const checkInDate = mobileBookingState.checkIn ? parseISO(mobileBookingState.checkIn) : null;
  const checkOutDate = mobileBookingState.checkOut ? parseISO(mobileBookingState.checkOut) : null;
  const firstRoom = mobileBookingState.rooms[0] || {
    numberOfAdults: 2,
    numberOfTeens: 0,
    numberOfChildren: 0,
    numberOfInfants: 0,
  };

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Proactive message after 8 seconds idle
  useEffect(() => {
    const resetProactiveTimer = () => {
      lastActivityRef.current = new Date();
      setShowProactivePrompt(false);
      if (proactiveTimeoutRef.current) {
        clearTimeout(proactiveTimeoutRef.current);
      }
      
      if (messages.length === 0 && !isLoading && isExpanded) {
        proactiveTimeoutRef.current = setTimeout(() => {
          setShowProactivePrompt(true);
        }, 8000);
      }
    };

    // Reset timer on any interaction
    resetProactiveTimer();

    // Listen for external date picker trigger (from "Book Now" button on map)
    const handleOpenDatePicker = () => {
      setIsInitiated(true);
      setDatePickerOpen(true);
    };
    // Listen for direct "book now" trigger when dates already exist
    const handleConciergeBookNow = () => {
      setIsInitiated(true);
      handleBookNowClick();
    };
    window.addEventListener('openConciergeDatePicker', handleOpenDatePicker);
    window.addEventListener('conciergeBookNow', handleConciergeBookNow);

    return () => {
      window.removeEventListener('openConciergeDatePicker', handleOpenDatePicker);
      window.removeEventListener('conciergeBookNow', handleConciergeBookNow);
      if (proactiveTimeoutRef.current) {
        clearTimeout(proactiveTimeoutRef.current);
      }
    };
  }, [messages.length, isLoading, isExpanded]);

  // Handle voice input
  const handleVoiceTranscript = useCallback((transcript: string) => {
    setQuery(transcript);
    // Auto-submit after voice input
    handleSubmitQuery(transcript);
  }, []);

  // Handle query submission
  const handleSubmitQuery = async (inputQuery?: string) => {
    const queryText = inputQuery || query;
    if (!queryText.trim()) return;

    setShowProactivePrompt(false);
    
    // Add user message
    const userMessage: ConciergeMessage = {
      id: crypto.randomUUID(),
      type: 'user',
      content: queryText,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setQuery('');
    setIsLoading(true);

    try {
      // Get delight tracking info from itinerary context
      const sessionDelightCount = typeof window !== 'undefined' 
        ? parseInt(sessionStorage.getItem('rol_session_delight_count') || '0', 10)
        : 0;
      
      // Build conversation history from messages (last 10, excluding welcome)
      const conversationHistory = messages
        .filter(m => m.id !== 'welcome')
        .slice(-10)
        .map(m => ({ role: m.type === 'user' ? 'user' : 'assistant', content: m.content }));

      // Call AI concierge edge function with value-based delight parameters
      const { data, error } = await supabase.functions.invoke('ai-booking-concierge', {
        body: {
          property_id: propertyId,
          user_query: queryText,
          current_dates: checkInDate && checkOutDate ? {
            check_in: format(checkInDate, 'yyyy-MM-dd'),
            check_out: format(checkOutDate, 'yyyy-MM-dd'),
          } : undefined,
          current_guests: {
            adults: firstRoom.numberOfAdults,
            children: firstRoom.numberOfChildren,
            infants: firstRoom.numberOfInfants,
          },
          room_types: roomTypes.map(rt => ({
            id: rt.id,
            name: rt.name,
            max_guests: rt.maxPeople || rt.maxAdults || 2,
          })),
          session_id: sessionIdRef.current,
          current_booking_value: totalPrice || mobileBookingState.totalCost || 0,
          session_delight_count: sessionDelightCount,
          conversation_history: conversationHistory,
        },
      });

      if (error) {
        throw error;
      }

      // Add assistant response
      const assistantMessage: ConciergeMessage = {
        id: crypto.randomUUID(),
        type: 'assistant',
        content: data?.narrative_response || "I found some options for you!",
        suggestions: data?.suggestions || [],
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);

      // Handle surprise gift and track delight delivery
      if (data?.surprise_gift) {
        // Increment session delight count
        const currentCount = parseInt(sessionStorage.getItem('rol_session_delight_count') || '0', 10);
        sessionStorage.setItem('rol_session_delight_count', String(currentCount + 1));
        
        toast.success(data.surprise_gift.description, {
          icon: '🎁',
          duration: 6000,
        });
      }

      // Show proactive tip
      if (data?.proactive_tip) {
        setTimeout(() => {
          toast.info(data.proactive_tip, {
            icon: '💡',
            duration: 4000,
          });
        }, 1500);
      }

    } catch (err) {
      console.error('Concierge error:', err);
      
      // Fallback response
      const fallbackMessage: ConciergeMessage = {
        id: crypto.randomUUID(),
        type: 'assistant',
        content: "I'm having a moment – please try selecting dates manually below, or ask me again!",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, fallbackMessage]);
      
      onError?.();
    } finally {
      setIsLoading(false);
    }
  };

  // Handle suggestion selection
  const handleSelectSuggestion = (suggestion: ConciergeSuggestion) => {
    if (suggestion.dates) {
      setDates(suggestion.dates.check_in, suggestion.dates.check_out);
      toast.success(`Dates updated: ${format(parseISO(suggestion.dates.check_in), 'MMM d')} – ${format(parseISO(suggestion.dates.check_out), 'MMM d')}`);
    }
    
    if (suggestion.room) {
      // Add to itinerary
      const nights = suggestion.dates 
        ? Math.ceil((new Date(suggestion.dates.check_out).getTime() - new Date(suggestion.dates.check_in).getTime()) / (1000 * 60 * 60 * 24))
        : 1;

      addStay({
        property_id: propertyId,
        property_name: propertyName,
        property_slug: propertySlug,
        property_image: propertyImage || '',
        external_system: externalSystem || 'none',
        dates: suggestion.dates || {
          check_in: mobileBookingState.checkIn || format(addDays(new Date(), 1), 'yyyy-MM-dd'),
          check_out: mobileBookingState.checkOut || format(addDays(new Date(), 2), 'yyyy-MM-dd'),
        },
        rooms: [{
          room_type_id: suggestion.room.id,
          room_type_name: suggestion.room.name,
          quantity: 1,
          rate_per_night: suggestion.room.price_per_night,
          total_price: suggestion.room.total,
        }],
        guests: {
          adults: firstRoom.numberOfAdults,
          children: firstRoom.numberOfChildren,
          infants: firstRoom.numberOfInfants,
        },
        price_breakdown: {
          subtotal: suggestion.room.total,
          fees: [],
          taxes: [],
          total: suggestion.room.total,
        },
        availability_status: 'available',
        nights,
      });

      toast.success(`Added ${suggestion.room.name} to your journey!`);
      
      onRoomSelected?.(
        suggestion.room.id,
        suggestion.dates || { check_in: mobileBookingState.checkIn!, check_out: mobileBookingState.checkOut! },
        { adults: firstRoom.numberOfAdults, children: firstRoom.numberOfChildren, infants: firstRoom.numberOfInfants }
      );
    }
  };

  // Handle manual date change - auto-add to cart for single-room properties
  const handleDatesChange = (checkIn: Date, checkOut: Date) => {
    setDates(format(checkIn, 'yyyy-MM-dd'), format(checkOut, 'yyyy-MM-dd'));
    
    // For single-room properties, auto-add to cart after date selection
    if (roomTypes.length === 1) {
      const room = roomTypes[0];
      const nights = Math.ceil(
        (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      // Get rate from availability map or room data
      const dateKey = format(checkIn, 'yyyy-MM-dd');
      const dayData = availabilityMap?.get(dateKey);
      const roomRate = dayData?.rate || (room as any).baseRate || (room as any).base_rate || 0;
      const totalPriceCalc = roomRate * nights;
      
      addStay({
        property_id: propertyId,
        property_name: propertyName,
        property_slug: propertySlug,
        property_image: propertyImage || '',
        external_system: externalSystem || 'none',
        dates: {
          check_in: format(checkIn, 'yyyy-MM-dd'),
          check_out: format(checkOut, 'yyyy-MM-dd'),
        },
        rooms: [{
          room_type_id: room.id,
          room_type_name: room.name,
          quantity: 1,
          rate_per_night: roomRate,
          total_price: totalPriceCalc,
        }],
        guests: {
          adults: firstRoom.numberOfAdults,
          children: firstRoom.numberOfChildren,
          infants: firstRoom.numberOfInfants,
        },
        price_breakdown: {
          subtotal: totalPriceCalc,
          fees: [],
          taxes: [],
          total: totalPriceCalc,
        },
        availability_status: 'available',
        nights,
      });
      
      toast.success(`Added ${room.name} to your journey! Click Checkout to complete.`);
    }
  };

  // Handle Book Now click from collapsed strip
  const handleBookNowClick = () => {
    // If no dates selected, open date picker
    if (!checkInDate || !checkOutDate) {
      setDatePickerOpen(true);
      return;
    }
    
    // For single-room properties, auto-add to cart AND navigate to checkout
    if (roomTypes.length === 1) {
      const room = roomTypes[0];
      const nights = Math.ceil(
        (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      // Get rate from availability map or room data
      const dateKey = format(checkInDate, 'yyyy-MM-dd');
      const dayData = availabilityMap?.get(dateKey);
      const roomRate = dayData?.rate || (room as any).baseRate || (room as any).base_rate || 0;
      const totalPrice = roomRate * nights;
      
      addStay({
        property_id: propertyId,
        property_name: propertyName,
        property_slug: propertySlug,
        property_image: propertyImage || '',
        external_system: externalSystem || 'none',
        dates: {
          check_in: format(checkInDate, 'yyyy-MM-dd'),
          check_out: format(checkOutDate, 'yyyy-MM-dd'),
        },
        rooms: [{
          room_type_id: room.id,
          room_type_name: room.name,
          quantity: 1,
          rate_per_night: roomRate,
          total_price: totalPrice,
        }],
        guests: {
          adults: firstRoom.numberOfAdults,
          children: firstRoom.numberOfChildren,
          infants: firstRoom.numberOfInfants,
        },
        price_breakdown: {
          subtotal: totalPrice,
          fees: [],
          taxes: [],
          total: totalPrice,
        },
        availability_status: 'available',
        nights,
      });
      
      toast.success(`Added ${room.name} to your journey!`);
      
      // Let SmartCart appear - it will handle checkout navigation
      // Don't navigate away here
      return;
    }
    
    // Multiple rooms - scroll to room section
    document.getElementById('rooms-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  // Handle manual guest change
  const handleGuestChange = (field: string, value: number) => {
    if (mobileBookingState.rooms.length === 0) {
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

  // Render suggestion card
  const renderSuggestionCard = (suggestion: ConciergeSuggestion) => (
    <motion.button
      key={suggestion.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => handleSelectSuggestion(suggestion)}
      className={cn(
        "w-full text-left p-3 rounded-xl border transition-all",
        "bg-card hover:bg-accent hover:border-primary/50",
        suggestion.is_best_value && "ring-2 ring-primary/30 border-primary"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {suggestion.is_best_value && (
            <span className="inline-block px-2 py-0.5 text-[10px] font-semibold bg-primary text-primary-foreground rounded-full mb-1">
              ✨ Best Value
            </span>
          )}
          <p className="text-sm font-medium">{suggestion.message}</p>
          {suggestion.dates && (
            <p className="text-xs text-muted-foreground mt-1">
              {format(parseISO(suggestion.dates.check_in), 'MMM d')} – {format(parseISO(suggestion.dates.check_out), 'MMM d')}
            </p>
          )}
          {suggestion.savings && suggestion.savings > 0 && (
            <p className="text-xs text-green-600 font-medium mt-1">
              Save {formatPrice(suggestion.savings)}
            </p>
          )}
        </div>
        {suggestion.room && (
          <span className="text-sm font-bold shrink-0">
            {formatPrice(suggestion.room.total)}
          </span>
        )}
      </div>
    </motion.button>
  );

  // Desktop sidebar
  if (!isMobile) {
    // Hide completely if SmartCart has items
    if (hasStays) {
      return (
        <BottomSheetDatePicker
          open={datePickerOpen}
          onOpenChange={setDatePickerOpen}
          checkIn={checkInDate}
          checkOut={checkOutDate}
          onDatesChange={handleDatesChange}
          availabilityMap={availabilityMap}
        />
      );
    }

    // If not initiated, show only minimal floating button
    if (!isInitiated) {
      return (
        <>
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={() => {
              setIsInitiated(true);
              setDatePickerOpen(true);
            }}
            className={cn(
              "fixed right-6 bottom-6 z-40 h-14 px-6 rounded-full gap-2",
              "bg-primary text-primary-foreground shadow-xl",
              "flex items-center justify-center",
              "hover:scale-105 transition-transform",
              className
            )}
          >
            <Calendar className="h-5 w-5" />
            <span className="font-medium">Select Dates</span>
          </motion.button>
          
          <BottomSheetDatePicker
            open={datePickerOpen}
            onOpenChange={setDatePickerOpen}
            checkIn={checkInDate}
            checkOut={checkOutDate}
            onDatesChange={handleDatesChange}
            availabilityMap={availabilityMap}
          />
        </>
      );
    }

    // Minimized state - floating button only
    if (isMinimized) {
      return (
        <>
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setIsMinimized(false)}
            className={cn(
              "fixed right-6 bottom-6 z-40 h-14 w-14 rounded-full",
              "bg-primary text-primary-foreground shadow-xl",
              "flex items-center justify-center",
              "hover:scale-105 transition-transform",
              className
            )}
          >
            <Sparkles className="h-6 w-6" />
          </motion.button>
          
          {/* Date Picker still accessible */}
          <BottomSheetDatePicker
            open={datePickerOpen}
            onOpenChange={setDatePickerOpen}
            checkIn={checkInDate}
            checkOut={checkOutDate}
            onDatesChange={handleDatesChange}
            availabilityMap={availabilityMap}
          />
        </>
      );
    }
    
    // Full sidebar
    return (
      <div className={cn(
        "fixed right-0 top-0 h-screen w-80 xl:w-96 z-30",
        "bg-background/95 backdrop-blur-xl border-l border-border shadow-2xl",
        "flex flex-col",
        className
      )}>
        {/* Header with minimize button */}
        <div className="p-4 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="font-serif text-lg font-semibold">Your Travel Concierge</h2>
            </div>
            <button
              onClick={() => setIsMinimized(true)}
              className="p-1.5 rounded-full hover:bg-muted transition-colors"
              title="Minimize"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Sleep in Africa like never before
          </p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Proactive prompt */}
          <AnimatePresence>
            {showProactivePrompt && messages.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="bg-primary/5 border border-primary/20 rounded-xl p-4"
              >
                <p className="text-sm">
                  <span className="font-medium">Need help choosing dates?</span>
                  <br />
                  <span className="text-muted-foreground">
                    Tell me your ideal trip and I'll find the best options.
                  </span>
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {messages.map((msg) => (
            <div key={msg.id} className={cn(
              "flex",
              msg.type === 'user' ? "justify-end" : "justify-start"
            )}>
              <div className={cn(
                "max-w-[85%] rounded-2xl p-3",
                msg.type === 'user' 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-muted"
              )}>
                <p className="text-sm">{msg.content}</p>
                
                {/* Suggestion cards */}
                {msg.suggestions && msg.suggestions.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {msg.suggestions.map(renderSuggestionCard)}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Loading state */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl p-4 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Thinking...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Manual date/guest selectors */}
        <div className="p-3 border-t border-border bg-muted/30">
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setDatePickerOpen(true)}
              className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-background border text-left text-sm hover:bg-accent transition-colors"
            >
              <Calendar className="h-4 w-4 text-primary" />
              <span className="truncate">
                {checkInDate && checkOutDate
                  ? `${format(checkInDate, 'MMM d')} – ${format(checkOutDate, 'MMM d')}`
                  : 'Select dates'}
              </span>
            </button>
            <button
              onClick={() => setGuestPickerOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background border text-sm hover:bg-accent transition-colors"
            >
              <Users className="h-4 w-4 text-primary" />
              <span>{firstRoom.numberOfAdults + firstRoom.numberOfChildren}</span>
            </button>
          </div>
        </div>

        {/* Input */}
        <div className="p-4 border-t border-border">
          <form onSubmit={(e) => { e.preventDefault(); handleSubmitQuery(); }} className="flex gap-2">
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="E.g. 4 nights for 2 adults in March..."
              className="flex-1"
              disabled={isLoading}
            />
            <VoiceInputButton onTranscript={handleVoiceTranscript} />
            <Button 
              type="submit" 
              size="icon"
              disabled={!query.trim() || isLoading}
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>

        {/* Date Picker */}
        <BottomSheetDatePicker
          open={datePickerOpen}
          onOpenChange={setDatePickerOpen}
          checkIn={checkInDate}
          checkOut={checkOutDate}
          onDatesChange={handleDatesChange}
          availabilityMap={availabilityMap}
        />

        {/* Guest Picker */}
        <Drawer open={guestPickerOpen} onOpenChange={setGuestPickerOpen}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Guests</DrawerTitle>
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
                <Button className="w-full">Done</Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </div>
    );
  }

  // Mobile: Collapsible bottom sheet with compact booking strip
  // If SmartCart has items, hide the collapsed strip - SmartCart will take over
  if (hasStays) {
    return (
      <>
        {/* Date Picker - still accessible when SmartCart is showing */}
        <BottomSheetDatePicker
          open={datePickerOpen}
          onOpenChange={setDatePickerOpen}
          checkIn={checkInDate}
          checkOut={checkOutDate}
          onDatesChange={handleDatesChange}
          availabilityMap={availabilityMap}
        />

        {/* Guest Picker - still accessible */}
        <Drawer open={guestPickerOpen} onOpenChange={setGuestPickerOpen}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Guests</DrawerTitle>
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
                <Button className="w-full">Done</Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  // If not initiated and no stays, show only a minimal trigger button
  const hasDatesSelected = Boolean(checkInDate && checkOutDate);
  if (!isInitiated && !hasStays) {
    return (
      <>
        {/* Minimal floating button — smart label based on date state */}
        <div className="fixed bottom-4 right-4 z-40 pb-[env(safe-area-inset-bottom,0px)]">
          <Button
            onClick={() => {
              setIsInitiated(true);
              if (hasDatesSelected) {
                handleBookNowClick();
              } else {
                setDatePickerOpen(true);
              }
            }}
            className="rounded-full h-12 px-6 shadow-lg bg-primary text-primary-foreground"
          >
            {hasDatesSelected ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Book Now
              </>
            ) : (
              <>
                <Calendar className="h-4 w-4 mr-2" />
                Select Dates
              </>
            )}
          </Button>
        </div>
        
        {/* Date picker still needs to be available */}
        <BottomSheetDatePicker
          open={datePickerOpen}
          onOpenChange={setDatePickerOpen}
          checkIn={checkInDate}
          checkOut={checkOutDate}
          onDatesChange={handleDatesChange}
          availabilityMap={availabilityMap}
        />
      </>
    );
  }

  return (
    <>
      {/* Collapsed: Compact booking strip + floating AI icon */}
      <div className={cn(
        "fixed bottom-0 left-0 right-0 z-40",
        "pb-[env(safe-area-inset-bottom,16px)] px-4",
        className
      )}>
        <AnimatePresence mode="wait">
          {!isExpanded ? (
            <motion.div
              key="collapsed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="flex items-center justify-center gap-2"
            >
              {/* Compact booking controls - always visible */}
              <div className="flex items-center gap-2 px-3 py-2 bg-background/95 backdrop-blur-sm rounded-full border shadow-lg">
                <button 
                  onClick={() => setDatePickerOpen(true)} 
                  className="flex items-center gap-1.5 text-sm"
                >
                  <Calendar className="h-4 w-4 text-primary" />
                  <span className="font-medium">
                    {checkInDate && checkOutDate
                      ? `${format(checkInDate, 'MMM d')} – ${format(checkOutDate, 'MMM d')}`
                      : 'Dates'}
                  </span>
                </button>
                <span className="text-muted-foreground/50">|</span>
                <button 
                  onClick={() => setGuestPickerOpen(true)} 
                  className="flex items-center gap-1 text-sm"
                >
                  <Users className="h-4 w-4 text-primary" />
                  <span>{firstRoom.numberOfAdults + firstRoom.numberOfChildren}</span>
                </button>
                
                {/* Book Now button */}
                <Button 
                  size="sm" 
                  onClick={handleBookNowClick}
                  className="ml-1"
                >
                  Book Now
                </Button>
              </div>
              
              {/* Floating AI icon - minimized concierge */}
              <motion.button
                onClick={() => setIsExpanded(true)}
                className={cn(
                  "h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg",
                  "flex items-center justify-center",
                  "hover:scale-105 active:scale-95 transition-transform"
                )}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Sparkles className="h-5 w-5" />
              </motion.button>
            </motion.div>
          ) : (
            <motion.div
              key="expanded"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-background rounded-t-2xl border border-b-0 shadow-2xl max-h-[70vh] overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="p-3 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="font-medium text-sm">Your Travel Concierge</span>
                </div>
                <button onClick={() => setIsExpanded(false)}>
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                </button>
              </div>

              {/* Messages (scrollable) */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3 max-h-[40vh]">
                {showProactivePrompt && messages.length === 0 && (
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-sm">
                    <span className="font-medium">Need help?</span> Tell me about your ideal trip.
                  </div>
                )}

                {messages.map((msg) => (
                  <div key={msg.id} className={cn(
                    "flex",
                    msg.type === 'user' ? "justify-end" : "justify-start"
                  )}>
                    <div className={cn(
                      "max-w-[85%] rounded-2xl p-2.5",
                      msg.type === 'user' 
                        ? "bg-primary text-primary-foreground" 
                        : "bg-muted"
                    )}>
                      <p className="text-sm">{msg.content}</p>
                      {msg.suggestions && msg.suggestions.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {msg.suggestions.map(renderSuggestionCard)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-2xl p-3 flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-xs text-muted-foreground">Thinking...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick selectors */}
              <div className="p-2 border-t flex gap-2">
                <button
                  onClick={() => setDatePickerOpen(true)}
                  className="flex-1 flex items-center gap-2 px-2.5 py-2 rounded-lg bg-muted text-xs"
                >
                  <Calendar className="h-3.5 w-3.5 text-primary" />
                  <span className="truncate">
                    {checkInDate && checkOutDate
                      ? `${format(checkInDate, 'MMM d')} – ${format(checkOutDate, 'MMM d')}`
                      : 'Dates'}
                  </span>
                </button>
                <button
                  onClick={() => setGuestPickerOpen(true)}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-muted text-xs"
                >
                  <Users className="h-3.5 w-3.5 text-primary" />
                  <span>{firstRoom.numberOfAdults + firstRoom.numberOfChildren}</span>
                </button>
              </div>

              {/* Input */}
              <div className="p-3 border-t">
                <form onSubmit={(e) => { e.preventDefault(); handleSubmitQuery(); }} className="flex gap-2">
                  <Input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="E.g. 4 nights in March..."
                    className="flex-1 h-10 text-sm"
                    disabled={isLoading}
                  />
                  <VoiceInputButton onTranscript={handleVoiceTranscript} size="sm" />
                  <Button 
                    type="submit" 
                    size="icon"
                    className="h-10 w-10"
                    disabled={!query.trim() || isLoading}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Date Picker */}
      <BottomSheetDatePicker
        open={datePickerOpen}
        onOpenChange={setDatePickerOpen}
        checkIn={checkInDate}
        checkOut={checkOutDate}
        onDatesChange={handleDatesChange}
        availabilityMap={availabilityMap}
      />

      {/* Guest Picker */}
      <Drawer open={guestPickerOpen} onOpenChange={setGuestPickerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Guests</DrawerTitle>
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
              <Button className="w-full">Done</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}
