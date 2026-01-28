import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

// Types for behavioral signals
export interface PropertyView {
  propertyId: string;
  propertyName: string;
  timestamp: number;
  location?: string;
  priceRange?: string;
  tags?: string[];
}

export interface FilterAdjustment {
  filterType: string;
  value: string | number | boolean;
  timestamp: number;
}

export interface DateInterest {
  checkIn: string;
  checkOut: string;
  hoverDuration: number;
  timestamp: number;
}

export interface DropOff {
  page: string;
  stage: string;
  timestamp: number;
}

export interface BehavioralPreferences {
  preferredLocations: string[];
  preferredPriceRange?: string;
  preferredAmenities: string[];
  preferredPropertyTypes: string[];
  flexibleDates: boolean;
  avgSessionDuration: number;
}

export interface BehavioralMemoryState {
  viewedProperties: PropertyView[];
  filterHistory: FilterAdjustment[];
  dateInterests: DateInterest[];
  dropOffs: DropOff[];
  preferences: BehavioralPreferences;
  sessionStart: number;
}

interface BehavioralMemoryContextValue {
  // State
  state: BehavioralMemoryState;
  
  // Actions
  trackPropertyView: (property: Omit<PropertyView, 'timestamp'>) => void;
  trackFilterAdjustment: (filter: Omit<FilterAdjustment, 'timestamp'>) => void;
  trackDateInterest: (dates: Omit<DateInterest, 'timestamp'>) => void;
  trackDropOff: (dropOff: Omit<DropOff, 'timestamp'>) => void;
  
  // Insights
  getInferredPreferences: () => BehavioralPreferences;
  getRecommendation: () => string | null;
  getHesitationLevel: () => 'none' | 'mild' | 'moderate' | 'high';
  
  // Helpers
  hasViewedProperty: (propertyId: string) => boolean;
  getViewCount: () => number;
  clearMemory: () => void;
}

const BehavioralMemoryContext = createContext<BehavioralMemoryContextValue | undefined>(undefined);

const STORAGE_KEY = 'rol_behavioral_memory';
const MAX_HISTORY_ITEMS = 50;
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

const defaultState: BehavioralMemoryState = {
  viewedProperties: [],
  filterHistory: [],
  dateInterests: [],
  dropOffs: [],
  preferences: {
    preferredLocations: [],
    preferredAmenities: [],
    preferredPropertyTypes: [],
    flexibleDates: false,
    avgSessionDuration: 0,
  },
  sessionStart: Date.now(),
};

interface BehavioralMemoryProviderProps {
  children: ReactNode;
}

export function BehavioralMemoryProvider({ children }: BehavioralMemoryProviderProps) {
  const [state, setState] = useState<BehavioralMemoryState>(defaultState);

  // Load from sessionStorage on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Check if session is still valid (within timeout)
        if (Date.now() - parsed.sessionStart < SESSION_TIMEOUT) {
          setState(parsed);
        } else {
          // Start fresh session, but keep preferences
          setState({
            ...defaultState,
            preferences: parsed.preferences || defaultState.preferences,
            sessionStart: Date.now(),
          });
        }
      }
    } catch (e) {
      console.error('Failed to load behavioral memory:', e);
    }
  }, []);

  // Persist to sessionStorage on changes
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Failed to save behavioral memory:', e);
    }
  }, [state]);

  // Track property view
  const trackPropertyView = useCallback((property: Omit<PropertyView, 'timestamp'>) => {
    setState(prev => {
      const view: PropertyView = { ...property, timestamp: Date.now() };
      const updated = [view, ...prev.viewedProperties].slice(0, MAX_HISTORY_ITEMS);
      return { ...prev, viewedProperties: updated };
    });
  }, []);

  // Track filter adjustment
  const trackFilterAdjustment = useCallback((filter: Omit<FilterAdjustment, 'timestamp'>) => {
    setState(prev => {
      const adjustment: FilterAdjustment = { ...filter, timestamp: Date.now() };
      const updated = [adjustment, ...prev.filterHistory].slice(0, MAX_HISTORY_ITEMS);
      return { ...prev, filterHistory: updated };
    });
  }, []);

  // Track date interest (hover patterns)
  const trackDateInterest = useCallback((dates: Omit<DateInterest, 'timestamp'>) => {
    setState(prev => {
      const interest: DateInterest = { ...dates, timestamp: Date.now() };
      const updated = [interest, ...prev.dateInterests].slice(0, 20);
      return { ...prev, dateInterests: updated };
    });
  }, []);

  // Track drop-off point
  const trackDropOff = useCallback((dropOff: Omit<DropOff, 'timestamp'>) => {
    setState(prev => {
      const drop: DropOff = { ...dropOff, timestamp: Date.now() };
      const updated = [drop, ...prev.dropOffs].slice(0, 10);
      return { ...prev, dropOffs: updated };
    });
  }, []);

  // Analyze history to infer preferences
  const getInferredPreferences = useCallback((): BehavioralPreferences => {
    const { viewedProperties, filterHistory, dateInterests } = state;

    // Count location occurrences
    const locationCounts = new Map<string, number>();
    viewedProperties.forEach(p => {
      if (p.location) {
        locationCounts.set(p.location, (locationCounts.get(p.location) || 0) + 1);
      }
    });

    // Count tag occurrences (amenities/property types)
    const tagCounts = new Map<string, number>();
    viewedProperties.forEach(p => {
      p.tags?.forEach(tag => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    });

    // Sort and get top preferences
    const topLocations = Array.from(locationCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([loc]) => loc);

    const topTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => tag);

    // Analyze price preferences from filters
    const priceFilters = filterHistory.filter(f => f.filterType === 'price');
    const preferredPriceRange = priceFilters.length > 0 
      ? String(priceFilters[0].value) 
      : undefined;

    // Check date flexibility (multiple date range explorations)
    const flexibleDates = dateInterests.length > 3;

    // Calculate session duration
    const avgSessionDuration = Date.now() - state.sessionStart;

    return {
      preferredLocations: topLocations,
      preferredPriceRange,
      preferredAmenities: topTags.filter(t => ['pool', 'spa', 'gym', 'restaurant', 'wifi'].includes(t)),
      preferredPropertyTypes: topTags.filter(t => ['hotel', 'guesthouse', 'lodge', 'villa'].includes(t)),
      flexibleDates,
      avgSessionDuration,
    };
  }, [state]);

  // Generate recommendation based on behavior
  const getRecommendation = useCallback((): string | null => {
    const { viewedProperties, dateInterests } = state;

    if (viewedProperties.length === 0) return null;

    // Count common themes
    const locationCounts = new Map<string, number>();
    const tagCounts = new Map<string, number>();

    viewedProperties.forEach(p => {
      if (p.location) {
        locationCounts.set(p.location, (locationCounts.get(p.location) || 0) + 1);
      }
      p.tags?.forEach(tag => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    });

    // Generate contextual recommendation
    if (locationCounts.size > 0) {
      const topLocation = Array.from(locationCounts.entries())
        .sort((a, b) => b[1] - a[1])[0];
      
      if (topLocation && topLocation[1] >= 2) {
        // Multiple views in same location
        const hasFlexibleDates = dateInterests.length > 2;
        if (hasFlexibleDates) {
          return `${topLocation[0]} properties often have better availability mid-week`;
        }
        return `Popular ${topLocation[0]} escapes book quickly – secure your dates`;
      }
    }

    // Tag-based recommendations
    if (tagCounts.has('pool') && tagCounts.get('pool')! >= 2) {
      return 'Properties with pools are 30% more popular this season';
    }

    if (tagCounts.has('spa') || tagCounts.has('wellness')) {
      return 'Wellness retreats include complimentary treatments at select properties';
    }

    // General recommendation for engaged users
    if (viewedProperties.length >= 3) {
      return 'Save your favourites to compare – availability changes daily';
    }

    return null;
  }, [state]);

  // Determine hesitation level based on behavior patterns
  const getHesitationLevel = useCallback((): 'none' | 'mild' | 'moderate' | 'high' => {
    const { viewedProperties, dateInterests, dropOffs } = state;
    const sessionDuration = Date.now() - state.sessionStart;

    // High hesitation indicators
    if (dropOffs.length >= 2) return 'high';
    if (viewedProperties.length >= 5 && dateInterests.length >= 4) return 'high';

    // Moderate hesitation
    if (sessionDuration > 10 * 60 * 1000 && viewedProperties.length >= 3) return 'moderate';
    if (dateInterests.length >= 3) return 'moderate';

    // Mild hesitation
    if (viewedProperties.length >= 2 && dateInterests.length >= 1) return 'mild';

    return 'none';
  }, [state]);

  // Check if property has been viewed
  const hasViewedProperty = useCallback((propertyId: string): boolean => {
    return state.viewedProperties.some(p => p.propertyId === propertyId);
  }, [state.viewedProperties]);

  // Get total view count
  const getViewCount = useCallback((): number => {
    return state.viewedProperties.length;
  }, [state.viewedProperties]);

  // Clear memory
  const clearMemory = useCallback(() => {
    setState({ ...defaultState, sessionStart: Date.now() });
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  const value: BehavioralMemoryContextValue = {
    state,
    trackPropertyView,
    trackFilterAdjustment,
    trackDateInterest,
    trackDropOff,
    getInferredPreferences,
    getRecommendation,
    getHesitationLevel,
    hasViewedProperty,
    getViewCount,
    clearMemory,
  };

  return (
    <BehavioralMemoryContext.Provider value={value}>
      {children}
    </BehavioralMemoryContext.Provider>
  );
}

export function useBehavioralMemory() {
  const context = useContext(BehavioralMemoryContext);
  if (!context) {
    throw new Error('useBehavioralMemory must be used within a BehavioralMemoryProvider');
  }
  return context;
}
