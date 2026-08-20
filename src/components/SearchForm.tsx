import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { format, isAfter, isBefore, isSameDay, addMonths, subMonths, endOfMonth, startOfMonth } from "date-fns";
import { CalendarIcon, MapPin, Users, Search, X, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { DayPicker, DateRange } from "react-day-picker";
import { supabase } from "@/integrations/supabase/client";
import { useSearch, PropertySearchResult } from "@/contexts/SearchContext";
import { SearchResultsDropdown } from "@/components/SearchResultsDropdown";
import { useIsMobile } from "@/hooks/use-mobile";

export const SearchForm = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { 
    isExpanded, 
    setIsExpanded, 
    searchQuery, 
    setSearchQuery, 
    searchResults, 
    setSearchResults,
    selectedProperty,
    setSelectedProperty,
    resetSearch 
  } = useSearch();
  
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [guests, setGuests] = useState({ adults: 2, children: 0 });
  const [showGuestPicker, setShowGuestPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showMobileDateSheet, setShowMobileDateSheet] = useState(false);
  const [showMobileGuestSheet, setShowMobileGuestSheet] = useState(false);
  
  // Track hover date for preview "worm" effect
  const [hoverDate, setHoverDate] = useState<Date | undefined>();
  
  // Track displayed month for auto-navigation
  const [displayedMonth, setDisplayedMonth] = useState<Date>(new Date());
  const autoNavTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  // Handle focus on any field to expand
  const handleFieldFocus = () => {
    setIsExpanded(true);
  };

  // Handle close
  const handleClose = () => {
    resetSearch();
    setShowResults(false);
  };

  // Debounced search
  const performSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    try {
      const searchPattern = `%${query}%`;
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, city, country, slug, images, navigation_tags, external_system, description, why_we_chose_this_place, who_this_suits, what_its_really_like, why_this_place_matters, who_its_not_for")
        .eq("is_active", true)
        .is("permanently_deleted_at", null)
        .or(`name.ilike.${searchPattern},city.ilike.${searchPattern},description.ilike.${searchPattern},why_we_chose_this_place.ilike.${searchPattern},who_this_suits.ilike.${searchPattern},what_its_really_like.ilike.${searchPattern},why_this_place_matters.ilike.${searchPattern},who_its_not_for.ilike.${searchPattern}`)
        .order("name", { ascending: true });

      if (error) throw error;
      
      const results: PropertySearchResult[] = (data || []).map(p => ({
        id: p.id,
        name: p.name,
        city: p.city,
        country: p.country,
        slug: p.slug,
        images: p.images,
        navigation_tags: p.navigation_tags,
        external_system: p.external_system,
      }));
      
      setSearchResults(results);
      setShowResults(results.length > 0);
    } catch (error) {
      console.error("Search error:", error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [setSearchResults]);

  // Handle search input change with debounce
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  };

  // Handle property selection from dropdown
  const handlePropertySelect = (property: PropertySearchResult) => {
    setSelectedProperty(property);
    setShowResults(false);
    setSearchQuery(property.name);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Auto-navigate to next/previous month when hovering near edges
  const handleDayMouseEnterWithNav = (day: Date) => {
    if (dateRange?.from && !dateRange?.to) {
      setHoverDate(day);
      
      // Clear any pending navigation
      if (autoNavTimeoutRef.current) {
        clearTimeout(autoNavTimeoutRef.current);
      }
      
      const monthEnd = endOfMonth(displayedMonth);
      const monthStart = startOfMonth(displayedMonth);
      
      // If hovering on last row of month, auto-navigate to next month after delay
      if (day >= subMonths(monthEnd, 0) && day <= monthEnd) {
        const daysFromEnd = Math.floor((monthEnd.getTime() - day.getTime()) / (1000 * 60 * 60 * 24));
        if (daysFromEnd <= 6) {
          autoNavTimeoutRef.current = setTimeout(() => {
            setDisplayedMonth(addMonths(displayedMonth, 1));
          }, 400);
        }
      }
      
      // If hovering on first row of month, auto-navigate to previous month
      if (day >= monthStart && day <= addMonths(monthStart, 0)) {
        const daysFromStart = Math.floor((day.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24));
        if (daysFromStart <= 6 && monthStart > new Date()) {
          autoNavTimeoutRef.current = setTimeout(() => {
            setDisplayedMonth(subMonths(displayedMonth, 1));
          }, 400);
        }
      }
    }
  };

  const handleDayMouseLeaveWithNav = () => {
    if (autoNavTimeoutRef.current) {
      clearTimeout(autoNavTimeoutRef.current);
    }
  };

  // Handle date range selection
  const handleDayClick = (day: Date) => {
    if (!dateRange?.from) {
      setDateRange({ from: day, to: undefined });
      setHoverDate(undefined);
    } else if (dateRange.from && !dateRange.to) {
      if (isBefore(day, dateRange.from)) {
        setDateRange({ from: day, to: undefined });
      } else {
        setDateRange({ from: dateRange.from, to: day });
        setHoverDate(undefined);
        setTimeout(() => {
          setShowDatePicker(false);
        }, 150);
      }
    } else {
      setDateRange({ from: day, to: undefined });
      setHoverDate(undefined);
    }
  };


  const getDisplayRange = (): DateRange | undefined => {
    if (dateRange?.from && dateRange?.to) {
      return dateRange;
    }
    if (dateRange?.from && hoverDate) {
      if (isAfter(hoverDate, dateRange.from) || isSameDay(hoverDate, dateRange.from)) {
        return { from: dateRange.from, to: hoverDate };
      }
      return { from: hoverDate, to: dateRange.from };
    }
    if (dateRange?.from) {
      return { from: dateRange.from, to: dateRange.from };
    }
    return undefined;
  };

  const displayRange = getDisplayRange();

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    
    // Must have a selected property to proceed
    if (!selectedProperty) {
      return;
    }
    
    const propertySlug = selectedProperty.slug || selectedProperty.id;
    
    // Build query params - only include what's set
    const params = new URLSearchParams();
    if (dateRange?.from) params.set("checkIn", format(dateRange.from, "yyyy-MM-dd"));
    if (dateRange?.to) params.set("checkOut", format(dateRange.to, "yyyy-MM-dd"));
    if (guests.adults) params.set("adults", guests.adults.toString());
    if (guests.children) params.set("children", guests.children.toString());
    
    const queryString = params.toString() ? `?${params.toString()}` : "";
    
    // Check if NightsBridge property - route to property showcase (shows NB booking iframe)
    if (selectedProperty.external_system === "nightsbridge") {
      navigate(`/property/${propertySlug}${queryString}`);
    } else {
      // Navigate directly to booking page for other properties
      navigate(`/booking/${propertySlug}${queryString}`);
    }
    
    // Reset search state after navigation
    resetSearch();
  };

  const clearDates = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDateRange(undefined);
    setHoverDate(undefined);
  };

  const formatDateRange = () => {
    if (!dateRange?.from) return "Select dates";
    if (!dateRange?.to) return format(dateRange.from, "d MMM") + " — ...";
    return `${format(dateRange.from, "d MMM")} — ${format(dateRange.to, "d MMM")}`;
  };

  // Use actual dateRange when complete, otherwise displayRange for worm preview
  const getVisualRange = () => {
    if (dateRange?.from && dateRange?.to) return dateRange;
    return displayRange;
  };

  const isRangeStart = (day: Date): boolean => {
    const range = getVisualRange();
    return range?.from ? isSameDay(day, range.from) : false;
  };

  const isRangeEnd = (day: Date): boolean => {
    const range = getVisualRange();
    return range?.to ? isSameDay(day, range.to) : false;
  };

  const isRangeMiddle = (day: Date): boolean => {
    const range = getVisualRange();
    if (!range?.from || !range?.to) return false;
    return isAfter(day, range.from) && isBefore(day, range.to);
  };

  // Date picker content - using JSX variable instead of function component to prevent remounting
  const datePickerContent = (
    <DayPicker
      mode="range"
      selected={dateRange}
      month={displayedMonth}
      onMonthChange={setDisplayedMonth}
      numberOfMonths={isMobile ? 1 : 2}
      disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
      onSelect={(range) => {
        setDateRange(range);
        if (range?.from && range?.to) {
          setHoverDate(undefined);
          setTimeout(() => {
            setShowDatePicker(false);
            setShowMobileDateSheet(false);
          }, 150);
        }
      }}
      onDayMouseEnter={handleDayMouseEnterWithNav}
      onDayMouseLeave={handleDayMouseLeaveWithNav}
      modifiers={{
        range_start: (day) => isRangeStart(day),
        range_end: (day) => isRangeEnd(day),
        range_middle: (day) => isRangeMiddle(day),
      }}
      modifiersClassNames={{
        range_start: "rol-stay-start rounded-l-md rounded-r-none",
        range_end: "rol-stay-end rounded-r-md rounded-l-none",
        range_middle: "rol-stay-middle rounded-none",
      }}
      className="p-3 pointer-events-auto"
      classNames={{
        months: cn("flex gap-4", isMobile ? "flex-col" : "flex-row"),
        month: "space-y-3",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          "bg-transparent p-0 opacity-50 hover:opacity-100 inline-flex items-center justify-center",
          isMobile ? "h-10 w-10 touch-target" : "h-7 w-7"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse",
        head_row: "flex",
        head_cell: cn(
          "text-muted-foreground rounded-md font-normal",
          isMobile ? "w-10 text-xs flex-1" : "w-8 text-[11px]"
        ),
        row: "flex w-full mt-1",
        cell: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 flex-1",
        day: cn(
          "p-0 font-normal hover:bg-primary/20 rounded-md transition-colors cursor-pointer inline-flex items-center justify-center",
          isMobile ? "h-10 w-10 text-sm touch-target" : "h-8 w-8 text-sm"
        ),
        day_today: "bg-accent text-accent-foreground font-semibold",
        day_outside: "text-muted-foreground opacity-50",
        day_disabled: "text-muted-foreground opacity-50 cursor-not-allowed hover:bg-transparent",
        day_hidden: "invisible",
      }}
    />
  );

  // Mobile guest picker content
  const GuestPickerContent = () => (
    <div className={cn("space-y-4", isMobile && "p-2")}>
      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
        <div>
          <p className={cn("font-medium", isMobile ? "text-base" : "text-sm")}>Adults</p>
          <p className={cn("text-muted-foreground", isMobile ? "text-sm" : "text-xs")}>Ages 13+</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className={cn("rounded-full", isMobile ? "h-10 w-10 touch-target" : "h-7 w-7")}
            onClick={() => setGuests(g => ({ ...g, adults: Math.max(1, g.adults - 1) }))}
            disabled={guests.adults <= 1}
          >
            <Minus className={cn(isMobile ? "h-4 w-4" : "h-3 w-3")} />
          </Button>
          <span className={cn("text-center font-medium", isMobile ? "w-8 text-lg" : "w-5 text-sm")}>{guests.adults}</span>
          <Button
            variant="outline"
            size="icon"
            className={cn("rounded-full", isMobile ? "h-10 w-10 touch-target" : "h-7 w-7")}
            onClick={() => setGuests(g => ({ ...g, adults: Math.min(10, g.adults + 1) }))}
            disabled={guests.adults >= 10}
          >
            <Plus className={cn(isMobile ? "h-4 w-4" : "h-3 w-3")} />
          </Button>
        </div>
      </div>
      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
        <div>
          <p className={cn("font-medium", isMobile ? "text-base" : "text-sm")}>Children</p>
          <p className={cn("text-muted-foreground", isMobile ? "text-sm" : "text-xs")}>Ages 0-12</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className={cn("rounded-full", isMobile ? "h-10 w-10 touch-target" : "h-7 w-7")}
            onClick={() => setGuests(g => ({ ...g, children: Math.max(0, g.children - 1) }))}
            disabled={guests.children <= 0}
          >
            <Minus className={cn(isMobile ? "h-4 w-4" : "h-3 w-3")} />
          </Button>
          <span className={cn("text-center font-medium", isMobile ? "w-8 text-lg" : "w-5 text-sm")}>{guests.children}</span>
          <Button
            variant="outline"
            size="icon"
            className={cn("rounded-full", isMobile ? "h-10 w-10 touch-target" : "h-7 w-7")}
            onClick={() => setGuests(g => ({ ...g, children: Math.min(10, g.children + 1) }))}
            disabled={guests.children >= 10}
          >
            <Plus className={cn(isMobile ? "h-4 w-4" : "h-3 w-3")} />
          </Button>
        </div>
      </div>
    </div>
  );

  // Expanded mode - inline, not fixed
  if (isExpanded) {
    return (
      <div ref={formRef} className="w-full relative flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <form onSubmit={handleSearch} className="flex-1 bg-card rounded-2xl sm:rounded-full shadow-md border border-border px-3 py-2 sm:py-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2">
          {/* Destination with live search */}
          <div className="flex-1 min-w-0 relative">
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-4 sm:w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search properties..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => setShowResults(searchResults.length > 0)}
                className={cn(
                  "pl-10 bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0",
                  isMobile ? "h-12 text-base" : "h-9 text-sm"
                )}
                autoFocus
              />
            </div>
          </div>

          <div className="hidden sm:block w-px h-7 bg-border" />
          <div className="sm:hidden w-full h-px bg-border" />

          {/* Date Range - Mobile uses Sheet, Desktop uses Popover */}
          {isMobile ? (
            <Sheet open={showMobileDateSheet} onOpenChange={setShowMobileDateSheet}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(
                    "justify-start h-12 px-3 text-base font-normal hover:bg-secondary/50",
                    !dateRange?.from && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-5 w-5 flex-shrink-0" />
                  <span className="text-left whitespace-nowrap">
                    {formatDateRange()}
                  </span>
                  {dateRange?.from && (
                    <X 
                      className="h-4 w-4 ml-2 text-muted-foreground hover:text-foreground" 
                      onClick={(e) => {
                        e.stopPropagation();
                        clearDates(e);
                      }}
                    />
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-auto max-h-[85vh] rounded-t-2xl safe-area-bottom">
                <SheetHeader className="pb-4">
                  <SheetTitle>Select dates</SheetTitle>
                </SheetHeader>
                <div className="flex justify-center overflow-auto">
                  {datePickerContent}
                </div>
                <div className="pt-4 flex gap-2">
                  <Button variant="outline" className="flex-1 h-12" onClick={() => {
                    setDateRange(undefined);
                    setHoverDate(undefined);
                  }}>
                    Clear
                  </Button>
                  <Button className="flex-1 h-12" onClick={() => setShowMobileDateSheet(false)}>
                    Done
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          ) : (
            <Popover open={showDatePicker} onOpenChange={setShowDatePicker} modal={true}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-9 px-3 text-sm font-normal hover:bg-secondary/50",
                    !dateRange?.from && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-1.5 h-4 w-4 flex-shrink-0" />
                  <span className="truncate max-w-[100px]">
                    {formatDateRange()}
                  </span>
                  {dateRange?.from && (
                    <X 
                      className="h-3.5 w-3.5 ml-1 text-muted-foreground hover:text-foreground" 
                      onClick={clearDates}
                    />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent 
                className="w-auto p-0 z-[60] bg-background border border-border shadow-xl" 
                align="center" 
                sideOffset={8}
              >
                {datePickerContent}
              </PopoverContent>
            </Popover>
          )}

          <div className="hidden sm:block w-px h-7 bg-border" />
          <div className="sm:hidden w-full h-px bg-border" />

          {/* Guests - Mobile uses Sheet, Desktop uses Popover */}
          {isMobile ? (
            <Sheet open={showMobileGuestSheet} onOpenChange={setShowMobileGuestSheet}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="justify-start h-12 px-3 text-base font-normal hover:bg-secondary/50"
                >
                  <Users className="mr-2 h-5 w-5" />
                  <span>{guests.adults + guests.children} guest{guests.adults + guests.children !== 1 ? 's' : ''}</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-auto rounded-t-2xl safe-area-bottom">
                <SheetHeader className="pb-4">
                  <SheetTitle>How many guests?</SheetTitle>
                </SheetHeader>
                <GuestPickerContent />
                <div className="pt-4">
                  <Button className="w-full h-12" onClick={() => setShowMobileGuestSheet(false)}>
                    Done
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          ) : (
            <Popover open={showGuestPicker} onOpenChange={setShowGuestPicker} modal={true}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 px-3 text-sm font-normal hover:bg-secondary/50"
                >
                  <Users className="mr-1.5 h-4 w-4" />
                  <span>{guests.adults + guests.children}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-3 z-[60] bg-background border border-border shadow-xl" align="center" sideOffset={8}>
                <GuestPickerContent />
              </PopoverContent>
            </Popover>
          )}

          {/* Search Button */}
          <Button
            type="submit"
            className={cn(
              "rounded-full bg-primary hover:bg-primary/90 flex-shrink-0",
              isMobile ? "h-12 w-full sm:w-12" : "h-9 w-9"
            )}
            disabled={!selectedProperty}
          >
            <Search className={cn(isMobile ? "h-5 w-5" : "h-4 w-4")} />
            {isMobile && <span className="ml-2">Search</span>}
          </Button>
        </form>
        
        {/* Search Results Dropdown */}
        <SearchResultsDropdown 
          results={searchResults}
          onSelect={handlePropertySelect}
          isVisible={showResults && searchQuery.length >= 2}
        />

        {/* Close Button */}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "rounded-full hover:bg-muted flex-shrink-0",
            isMobile ? "h-12 w-12 touch-target absolute top-2 right-2 sm:relative sm:top-0 sm:right-0" : "h-9 w-9"
          )}
          onClick={handleClose}
        >
          <X className={cn(isMobile ? "h-6 w-6" : "h-5 w-5")} />
        </Button>
      </div>
    );
  }

  // Default compact mode (in hero)
  // Mobile: collapsed to just "Where to?" pill - tapping expands
  // Desktop: full inline form
  if (isMobile) {
    return (
      <div className="w-full max-w-xl mx-auto px-4">
        <button
          type="button"
          onClick={handleFieldFocus}
          className="w-full bg-white/20 backdrop-blur-xl rounded-full shadow-lg border border-white/30 px-4 py-3 flex items-center gap-3 transition-all duration-200 active:scale-[0.98]"
        >
          <Search className="h-5 w-5 text-white/80 flex-shrink-0" />
          <span className="text-base text-white/90 font-medium">Where to?</span>
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl mx-auto px-2 sm:px-0">
      <form onSubmit={handleSearch} className="bg-card/95 backdrop-blur-md rounded-full shadow-lg border border-border/50 px-2 py-1.5 flex flex-row items-center gap-1">
        {/* Destination */}
        <div className="flex-1 min-w-0">
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Where to?"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={handleFieldFocus}
              className="pl-7 h-8 text-xs bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
        </div>

        <div className="w-px h-6 bg-border" />

        {/* Date Range Picker */}
        <Popover open={showDatePicker} onOpenChange={(open) => {
          setShowDatePicker(open);
          if (open) handleFieldFocus();
        }} modal={true}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 px-2 text-xs font-normal hover:bg-secondary/50",
                !dateRange?.from && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-1 h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate max-w-[80px]">
                {formatDateRange()}
              </span>
              {dateRange?.from && (
                <X 
                  className="h-3 w-3 ml-1 text-muted-foreground hover:text-foreground" 
                  onClick={clearDates}
                />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent 
            className="w-auto p-0 z-50 bg-background border border-border shadow-xl" 
            align="center" 
            sideOffset={8}
          >
            {datePickerContent}
          </PopoverContent>
        </Popover>

        <div className="w-px h-6 bg-border" />

        {/* Guests */}
        <Popover open={showGuestPicker} onOpenChange={(open) => {
          setShowGuestPicker(open);
          if (open) handleFieldFocus();
        }} modal={true}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs font-normal hover:bg-secondary/50"
            >
              <Users className="mr-1 h-3.5 w-3.5" />
              <span>{guests.adults + guests.children}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3 z-50 bg-background border border-border shadow-xl" align="center" sideOffset={8}>
            <GuestPickerContent />
          </PopoverContent>
        </Popover>

        {/* Search Button */}
        <Button
          type="submit"
          className="rounded-full bg-primary hover:bg-primary/90 flex-shrink-0 h-8 w-8"
          disabled={!selectedProperty}
        >
          <Search className="h-3.5 w-3.5" />
        </Button>
      </form>
    </div>
  );
};
