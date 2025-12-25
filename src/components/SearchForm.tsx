import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, isAfter, isBefore, isSameDay, addMonths, subMonths, endOfMonth, startOfMonth } from "date-fns";
import { CalendarIcon, MapPin, Users, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { DayPicker, DateRange } from "react-day-picker";
import { supabase } from "@/integrations/supabase/client";
import { useSearch, PropertySearchResult } from "@/contexts/SearchContext";
import { SearchResultsDropdown } from "@/components/SearchResultsDropdown";

export const SearchForm = () => {
  const navigate = useNavigate();
  const { 
    isExpanded, 
    setIsExpanded, 
    searchQuery, 
    setSearchQuery, 
    searchResults, 
    setSearchResults,
    setSelectedProperty,
    resetSearch 
  } = useSearch();
  
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [guests, setGuests] = useState({ adults: 2, children: 0 });
  const [showGuestPicker, setShowGuestPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  
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
        .select("id, name, city, country, slug, images, navigation_tags, description, why_we_chose_this_place, who_this_suits, what_its_really_like, why_this_place_matters, who_its_not_for")
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

  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!searchQuery || !dateRange?.from || !dateRange?.to) {
      return;
    }
    
    const searchParams = new URLSearchParams({
      destination: searchQuery,
      checkIn: format(dateRange.from, "yyyy-MM-dd"),
      checkOut: format(dateRange.to, "yyyy-MM-dd"),
      adults: guests.adults.toString(),
      children: guests.children.toString(),
    });
    
    navigate(`/search?${searchParams.toString()}`);
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

  const isRangeStart = (day: Date): boolean => {
    return displayRange?.from ? isSameDay(day, displayRange.from) : false;
  };

  const isRangeEnd = (day: Date): boolean => {
    return displayRange?.to ? isSameDay(day, displayRange.to) : false;
  };

  const isRangeMiddle = (day: Date): boolean => {
    if (!displayRange?.from || !displayRange?.to) return false;
    return isAfter(day, displayRange.from) && isBefore(day, displayRange.to);
  };

  // Expanded mode - inline, not fixed
  if (isExpanded) {
    return (
      <div ref={formRef} className="w-full relative flex items-center gap-2">
        <form onSubmit={handleSearch} className="flex-1 bg-card rounded-full shadow-md border border-border px-3 py-2 flex items-center gap-2">
          {/* Destination with live search */}
          <div className="flex-1 min-w-0 relative">
            <div className="relative">
              <MapPin className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search properties..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => setShowResults(searchResults.length > 0)}
                className="pl-8 h-9 text-sm bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                autoFocus
              />
            </div>
          </div>

          <div className="w-px h-7 bg-border" />

          {/* Date Range Picker */}
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
              <DayPicker
                mode="range"
                selected={displayRange}
                month={displayedMonth}
                onMonthChange={setDisplayedMonth}
                numberOfMonths={2}
                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                onDayClick={handleDayClick}
                onDayMouseEnter={handleDayMouseEnterWithNav}
                onDayMouseLeave={handleDayMouseLeaveWithNav}
                modifiers={{
                  range_start: (day) => isRangeStart(day),
                  range_end: (day) => isRangeEnd(day),
                  range_middle: (day) => isRangeMiddle(day),
                }}
                modifiersClassNames={{
                  range_start: "bg-primary text-primary-foreground rounded-l-md rounded-r-none",
                  range_end: "bg-primary text-primary-foreground rounded-r-md rounded-l-none",
                  range_middle: "bg-primary/30 text-foreground rounded-none",
                }}
                className="p-3 pointer-events-auto"
                classNames={{
                  months: "flex flex-col sm:flex-row gap-4",
                  month: "space-y-3",
                  caption: "flex justify-center pt-1 relative items-center",
                  caption_label: "text-sm font-medium",
                  nav: "space-x-1 flex items-center",
                  nav_button: "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 inline-flex items-center justify-center",
                  nav_button_previous: "absolute left-1",
                  nav_button_next: "absolute right-1",
                  table: "w-full border-collapse",
                  head_row: "flex",
                  head_cell: "text-muted-foreground rounded-md w-8 font-normal text-[11px]",
                  row: "flex w-full mt-1",
                  cell: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20",
                  day: cn(
                    "h-8 w-8 p-0 font-normal hover:bg-primary/20 rounded-md transition-colors cursor-pointer inline-flex items-center justify-center text-sm"
                  ),
                  day_today: "bg-accent text-accent-foreground font-semibold",
                  day_outside: "text-muted-foreground opacity-50",
                  day_disabled: "text-muted-foreground opacity-50 cursor-not-allowed hover:bg-transparent",
                  day_hidden: "invisible",
                }}
              />
            </PopoverContent>
          </Popover>

          <div className="w-px h-7 bg-border" />

          {/* Guests */}
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
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Adults</p>
                    <p className="text-xs text-muted-foreground">Ages 13+</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 rounded-full"
                      onClick={() => setGuests(g => ({ ...g, adults: Math.max(1, g.adults - 1) }))}
                      disabled={guests.adults <= 1}
                    >
                      −
                    </Button>
                    <span className="w-5 text-center text-sm">{guests.adults}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 rounded-full"
                      onClick={() => setGuests(g => ({ ...g, adults: Math.min(10, g.adults + 1) }))}
                      disabled={guests.adults >= 10}
                    >
                      +
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Children</p>
                    <p className="text-xs text-muted-foreground">Ages 0-12</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 rounded-full"
                      onClick={() => setGuests(g => ({ ...g, children: Math.max(0, g.children - 1) }))}
                      disabled={guests.children <= 0}
                    >
                      −
                    </Button>
                    <span className="w-5 text-center text-sm">{guests.children}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 rounded-full"
                      onClick={() => setGuests(g => ({ ...g, children: Math.min(10, g.children + 1) }))}
                      disabled={guests.children >= 10}
                    >
                      +
                    </Button>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Search Button */}
          <Button
            type="submit"
            size="icon"
            className="h-9 w-9 rounded-full bg-primary hover:bg-primary/90 flex-shrink-0"
            disabled={!searchQuery || !dateRange?.from || !dateRange?.to}
          >
            <Search className="h-4 w-4" />
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
          className="h-9 w-9 rounded-full hover:bg-muted flex-shrink-0"
          onClick={handleClose}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
    );
  }

  // Default compact mode (in hero)
  return (
    <div className="w-full max-w-xl mx-auto">
      <form onSubmit={handleSearch} className="bg-card/95 backdrop-blur-md rounded-full shadow-lg border border-border/50 px-2 py-1.5 flex items-center gap-1">
        {/* Destination */}
        <div className="flex-1 min-w-0">
          <div className="relative">
            <MapPin className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Destination loading..."
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
            <DayPicker
              mode="range"
              selected={displayRange}
              month={displayedMonth}
              onMonthChange={setDisplayedMonth}
              numberOfMonths={2}
              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
              onDayClick={handleDayClick}
              onDayMouseEnter={handleDayMouseEnterWithNav}
              onDayMouseLeave={handleDayMouseLeaveWithNav}
              modifiers={{
                range_start: (day) => isRangeStart(day),
                range_end: (day) => isRangeEnd(day),
                range_middle: (day) => isRangeMiddle(day),
              }}
              modifiersClassNames={{
                range_start: "bg-primary text-primary-foreground rounded-l-md rounded-r-none",
                range_end: "bg-primary text-primary-foreground rounded-r-md rounded-l-none",
                range_middle: "bg-primary/30 text-foreground rounded-none",
              }}
              className="p-3 pointer-events-auto"
              classNames={{
                months: "flex flex-col sm:flex-row gap-4",
                month: "space-y-3",
                caption: "flex justify-center pt-1 relative items-center",
                caption_label: "text-sm font-medium",
                nav: "space-x-1 flex items-center",
                nav_button: "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 inline-flex items-center justify-center",
                nav_button_previous: "absolute left-1",
                nav_button_next: "absolute right-1",
                table: "w-full border-collapse",
                head_row: "flex",
                head_cell: "text-muted-foreground rounded-md w-8 font-normal text-[11px]",
                row: "flex w-full mt-1",
                cell: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20",
                day: cn(
                  "h-8 w-8 p-0 font-normal hover:bg-primary/20 rounded-md transition-colors cursor-pointer inline-flex items-center justify-center text-sm"
                ),
                day_today: "bg-accent text-accent-foreground font-semibold",
                day_outside: "text-muted-foreground opacity-50",
                day_disabled: "text-muted-foreground opacity-50 cursor-not-allowed hover:bg-transparent",
                day_hidden: "invisible",
              }}
            />
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
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Adults</p>
                  <p className="text-xs text-muted-foreground">Ages 13+</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 rounded-full"
                    onClick={() => setGuests(g => ({ ...g, adults: Math.max(1, g.adults - 1) }))}
                    disabled={guests.adults <= 1}
                  >
                    −
                  </Button>
                  <span className="w-5 text-center text-sm">{guests.adults}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 rounded-full"
                    onClick={() => setGuests(g => ({ ...g, adults: Math.min(10, g.adults + 1) }))}
                    disabled={guests.adults >= 10}
                  >
                    +
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Children</p>
                  <p className="text-xs text-muted-foreground">Ages 0-12</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 rounded-full"
                    onClick={() => setGuests(g => ({ ...g, children: Math.max(0, g.children - 1) }))}
                    disabled={guests.children <= 0}
                  >
                    −
                  </Button>
                  <span className="w-5 text-center text-sm">{guests.children}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 rounded-full"
                    onClick={() => setGuests(g => ({ ...g, children: Math.min(10, g.children + 1) }))}
                    disabled={guests.children >= 10}
                  >
                    +
                  </Button>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Search Button */}
        <Button
          type="submit"
          size="icon"
          className="h-8 w-8 rounded-full bg-primary hover:bg-primary/90 flex-shrink-0"
          disabled={!searchQuery || !dateRange?.from || !dateRange?.to}
        >
          <Search className="h-3.5 w-3.5" />
        </Button>
      </form>
    </div>
  );
};
