import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

// Types
export interface GuestCount {
  adults: number;
  children: number;
  infants: number;
}

export interface RoomSelection {
  room_type_id: string;
  room_type_name: string;
  quantity: number;
  rate_per_night: number;
  total_price: number;
}

export interface PriceBreakdown {
  subtotal: number;
  fees: { name: string; amount: number }[];
  taxes: { name: string; amount: number }[];
  total: number;
}

export interface ItineraryStay {
  id: string;
  property_id: string;
  property_name: string;
  property_slug: string;
  property_image: string;
  external_system: string;
  dates: { check_in: string; check_out: string };
  rooms: RoomSelection[];
  guests: GuestCount;
  rate_type_id?: string;
  rate_type_name?: string;
  price_breakdown: PriceBreakdown;
  availability_status: 'available' | 'checking' | 'unavailable' | 'unknown';
  nights: number;
}

export interface GuestDetails {
  name: string;
  email: string;
  phone: string;
}

export interface ItineraryContextValue {
  // State
  stays: ItineraryStay[];
  guestDetails: GuestDetails;
  specialRequests: string;
  totalPrice: number;
  totalNights: number;
  itineraryId: string | null;
  isLoading: boolean;
  
  // Actions
  addStay: (stay: Omit<ItineraryStay, 'id'>) => void;
  addMultipleStays: (stays: Omit<ItineraryStay, 'id'>[]) => void;
  updateStay: (stayId: string, updates: Partial<ItineraryStay>) => void;
  removeStay: (stayId: string) => void;
  reorderStays: (fromIndex: number, toIndex: number) => void;
  setGuestDetails: (details: Partial<GuestDetails>) => void;
  setSpecialRequests: (text: string) => void;
  clearItinerary: () => void;
  
  // Persistence
  saveToDatabase: () => Promise<string | null>;
  loadFromDatabase: (itineraryId: string) => Promise<void>;
  
  // Delight Tracking (NEW)
  getSessionDelightCount: () => number;
  incrementSessionDelightCount: () => void;
  getSessionId: () => string;
  
  // Helpers
  hasStays: boolean;
  stayCount: number;
}

const ItineraryContext = createContext<ItineraryContextValue | undefined>(undefined);

const STORAGE_KEY = 'rol_itinerary';
const SESSION_ID_KEY = 'rol_session_id';
const GUEST_DETAILS_KEY = 'rol_guest_details'; // Persistent across sessions
const SESSION_DELIGHT_COUNT_KEY = 'rol_session_delight_count'; // Delight tracking

function generateId(): string {
  return crypto.randomUUID();
}

function getSessionId(): string {
  let sessionId = sessionStorage.getItem(SESSION_ID_KEY);
  if (!sessionId) {
    sessionId = generateId();
    sessionStorage.setItem(SESSION_ID_KEY, sessionId);
  }
  return sessionId;
}

// Delight tracking helpers
function getSessionDelightCount(): number {
  const count = sessionStorage.getItem(SESSION_DELIGHT_COUNT_KEY);
  return count ? parseInt(count, 10) : 0;
}

function incrementSessionDelightCount(): void {
  const current = getSessionDelightCount();
  sessionStorage.setItem(SESSION_DELIGHT_COUNT_KEY, String(current + 1));
}

function calculateNights(checkIn: string, checkOut: string): number {
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

interface ItineraryProviderProps {
  children: ReactNode;
}

export function ItineraryProvider({ children }: ItineraryProviderProps) {
  const [stays, setStays] = useState<ItineraryStay[]>([]);
  const [guestDetails, setGuestDetailsState] = useState<GuestDetails>({
    name: '',
    email: '',
    phone: ''
  });
  const [specialRequests, setSpecialRequestsState] = useState('');
  const [itineraryId, setItineraryId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load from sessionStorage (itinerary) and localStorage (sticky guest details) on mount
  useEffect(() => {
    try {
      // First, load sticky guest details from localStorage (persists across sessions)
      const storedGuest = localStorage.getItem(GUEST_DETAILS_KEY);
      if (storedGuest) {
        const guestData = JSON.parse(storedGuest);
        setGuestDetailsState({
          name: guestData.name || '',
          email: guestData.email || '',
          phone: guestData.phone || ''
        });
      }

      // Then load session-specific itinerary data (may override guest details if present)
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        setStays(data.stays || []);
        // Only override guest details if session has them filled
        if (data.guestDetails?.name || data.guestDetails?.email || data.guestDetails?.phone) {
          setGuestDetailsState(data.guestDetails);
        }
        setSpecialRequestsState(data.specialRequests || '');
        setItineraryId(data.itineraryId || null);
      }
    } catch (e) {
      console.error('Failed to load itinerary from storage:', e);
    }
  }, []);

  // Persist to sessionStorage on changes
  useEffect(() => {
    try {
      const data = {
        stays,
        guestDetails,
        specialRequests,
        itineraryId
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save itinerary to storage:', e);
    }
  }, [stays, guestDetails, specialRequests, itineraryId]);

  // Computed values
  const totalPrice = stays.reduce((sum, stay) => sum + stay.price_breakdown.total, 0);
  const totalNights = stays.reduce((sum, stay) => sum + stay.nights, 0);
  const hasStays = stays.length > 0;
  const stayCount = stays.length;

  // Actions
  const addStay = useCallback((stay: Omit<ItineraryStay, 'id'>) => {
    const newStay: ItineraryStay = {
      ...stay,
      id: generateId(),
      nights: calculateNights(stay.dates.check_in, stay.dates.check_out)
    };
    setStays(prev => [...prev, newStay]);
  }, []);

  const updateStay = useCallback((stayId: string, updates: Partial<ItineraryStay>) => {
    setStays(prev => prev.map(stay => {
      if (stay.id !== stayId) return stay;
      const updated = { ...stay, ...updates };
      // Recalculate nights if dates changed
      if (updates.dates) {
        updated.nights = calculateNights(updates.dates.check_in, updates.dates.check_out);
      }
      return updated;
    }));
  }, []);

  const removeStay = useCallback((stayId: string) => {
    setStays(prev => prev.filter(stay => stay.id !== stayId));
  }, []);

  const reorderStays = useCallback((fromIndex: number, toIndex: number) => {
    setStays(prev => {
      const result = [...prev];
      const [removed] = result.splice(fromIndex, 1);
      result.splice(toIndex, 0, removed);
      return result;
    });
  }, []);

  const setGuestDetails = useCallback((details: Partial<GuestDetails>) => {
    setGuestDetailsState(prev => {
      const updated = { ...prev, ...details };
      // Persist guest details to localStorage for sticky behavior across sessions
      try {
        localStorage.setItem(GUEST_DETAILS_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save guest details to localStorage:', e);
      }
      return updated;
    });
  }, []);

  const setSpecialRequests = useCallback((text: string) => {
    setSpecialRequestsState(text);
  }, []);

  const clearItinerary = useCallback(() => {
    setStays([]);
    setGuestDetailsState({ name: '', email: '', phone: '' });
    setSpecialRequestsState('');
    setItineraryId(null);
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  // Database persistence
  const saveToDatabase = useCallback(async (): Promise<string | null> => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const sessionId = getSessionId();

      const itineraryData = {
        user_id: user?.id || null,
        session_id: user?.id ? null : sessionId,
        stays: JSON.parse(JSON.stringify(stays)),
        total_price: totalPrice,
        total_nights: totalNights,
        guest_name: guestDetails.name || null,
        guest_email: guestDetails.email || null,
        guest_phone: guestDetails.phone || null,
        special_requests: specialRequests || null,
        status: 'draft' as const
      };

      if (itineraryId) {
        // Update existing
        const { error } = await supabase
          .from('itineraries')
          .update(itineraryData as Database['public']['Tables']['itineraries']['Update'])
          .eq('id', itineraryId);
        
        if (error) throw error;
        return itineraryId;
      } else {
        // Create new
        const { data, error } = await supabase
          .from('itineraries')
          .insert(itineraryData as Database['public']['Tables']['itineraries']['Insert'])
          .select('id')
          .single();
        
        if (error) throw error;
        setItineraryId(data.id);
        return data.id;
      }
    } catch (e) {
      console.error('Failed to save itinerary:', e);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [stays, guestDetails, specialRequests, totalPrice, totalNights, itineraryId]);

  const loadFromDatabase = useCallback(async (id: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('itineraries')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      if (data) {
        setStays((data.stays as unknown as ItineraryStay[]) || []);
        setGuestDetailsState({
          name: data.guest_name || '',
          email: data.guest_email || '',
          phone: data.guest_phone || ''
        });
        setSpecialRequestsState(data.special_requests || '');
        setItineraryId(data.id);
      }
    } catch (e) {
      console.error('Failed to load itinerary:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const value: ItineraryContextValue = {
    stays,
    guestDetails,
    specialRequests,
    totalPrice,
    totalNights,
    itineraryId,
    isLoading,
    addStay,
    updateStay,
    removeStay,
    reorderStays,
    setGuestDetails,
    setSpecialRequests,
    clearItinerary,
    saveToDatabase,
    loadFromDatabase,
    // Delight tracking (NEW)
    getSessionDelightCount,
    incrementSessionDelightCount,
    getSessionId,
    hasStays,
    stayCount
  };

  return (
    <ItineraryContext.Provider value={value}>
      {children}
    </ItineraryContext.Provider>
  );
}

export function useItinerary() {
  const context = useContext(ItineraryContext);
  if (!context) {
    throw new Error('useItinerary must be used within an ItineraryProvider');
  }
  return context;
}
