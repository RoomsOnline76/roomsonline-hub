import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { addDays, format } from "date-fns";

// Room booking interface
export interface BookingRoom {
  roomTypeId: string;
  roomTypeName: string;
  numberOfAdults: number;
  numberOfTeens: number;
  numberOfChildren: number;
  numberOfInfants: number;
  checkIn?: string;
  checkOut?: string;
}

// Guest details interface
export interface GuestDetails {
  name: string;
  email: string;
  phone: string;
  voucher?: string;
  specialRequests?: string;
}

// Booking state interface
export interface BookingState {
  propertyId: string | null;
  propertyName: string | null;
  propertySlug: string | null;
  checkIn: string | null;
  checkOut: string | null;
  rooms: BookingRoom[];
  rateTypeId: string | null;
  rateTypeName: string | null;
  guestDetails: GuestDetails;
  totalCost: number;
  isExpanded: boolean;
}

// Context value interface
interface MobileBookingContextValue {
  state: BookingState;
  setProperty: (id: string, name: string, slug: string) => void;
  setDates: (checkIn: string, checkOut: string) => void;
  addRoom: (room: BookingRoom) => void;
  removeRoom: (index: number) => void;
  updateRoom: (index: number, room: Partial<BookingRoom>) => void;
  setRateType: (id: string, name: string) => void;
  setGuestDetails: (details: Partial<GuestDetails>) => void;
  setTotalCost: (cost: number) => void;
  toggleExpanded: () => void;
  setExpanded: (expanded: boolean) => void;
  clearBooking: () => void;
  totalGuests: number;
  nights: number;
}

// Default guest details
const defaultGuestDetails: GuestDetails = {
  name: "",
  email: "",
  phone: "",
  voucher: "",
  specialRequests: "",
};

// Default state
const getDefaultState = (): BookingState => {
  const tomorrow = addDays(new Date(), 1);
  const dayAfter = addDays(new Date(), 2);
  
  return {
    propertyId: null,
    propertyName: null,
    propertySlug: null,
    checkIn: format(tomorrow, "yyyy-MM-dd"),
    checkOut: format(dayAfter, "yyyy-MM-dd"),
    rooms: [],
    rateTypeId: null,
    rateTypeName: null,
    guestDetails: { ...defaultGuestDetails },
    totalCost: 0,
    isExpanded: false,
  };
};

// Storage key
const STORAGE_KEY = "mobile_booking_state";

// Context
const MobileBookingContext = createContext<MobileBookingContextValue | undefined>(undefined);

// Provider
export function MobileBookingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BookingState>(() => {
    // Try to restore from sessionStorage
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch (e) {
          console.error("Failed to parse stored booking state:", e);
        }
      }
    }
    return getDefaultState();
  });

  // Persist state to sessionStorage
  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // Set property
  const setProperty = useCallback((id: string, name: string, slug: string) => {
    setState((prev) => ({
      ...prev,
      propertyId: id,
      propertyName: name,
      propertySlug: slug,
    }));
  }, []);

  // Set dates
  const setDates = useCallback((checkIn: string, checkOut: string) => {
    setState((prev) => ({
      ...prev,
      checkIn,
      checkOut,
    }));
  }, []);

  // Add room
  const addRoom = useCallback((room: BookingRoom) => {
    setState((prev) => ({
      ...prev,
      rooms: [...prev.rooms, room],
    }));
  }, []);

  // Remove room
  const removeRoom = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      rooms: prev.rooms.filter((_, i) => i !== index),
    }));
  }, []);

  // Update room
  const updateRoom = useCallback((index: number, updates: Partial<BookingRoom>) => {
    setState((prev) => ({
      ...prev,
      rooms: prev.rooms.map((room, i) => 
        i === index ? { ...room, ...updates } : room
      ),
    }));
  }, []);

  // Set rate type
  const setRateType = useCallback((id: string, name: string) => {
    setState((prev) => ({
      ...prev,
      rateTypeId: id,
      rateTypeName: name,
    }));
  }, []);

  // Set guest details
  const setGuestDetails = useCallback((details: Partial<GuestDetails>) => {
    setState((prev) => ({
      ...prev,
      guestDetails: { ...prev.guestDetails, ...details },
    }));
  }, []);

  // Set total cost
  const setTotalCost = useCallback((cost: number) => {
    setState((prev) => ({
      ...prev,
      totalCost: cost,
    }));
  }, []);

  // Toggle expanded
  const toggleExpanded = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isExpanded: !prev.isExpanded,
    }));
  }, []);

  // Set expanded
  const setExpanded = useCallback((expanded: boolean) => {
    setState((prev) => ({
      ...prev,
      isExpanded: expanded,
    }));
  }, []);

  // Clear booking
  const clearBooking = useCallback(() => {
    setState(getDefaultState());
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  // Calculate total guests
  const totalGuests = state.rooms.reduce(
    (sum, room) => 
      sum + room.numberOfAdults + room.numberOfTeens + room.numberOfChildren + room.numberOfInfants,
    0
  );

  // Calculate nights
  const nights = state.checkIn && state.checkOut
    ? Math.max(0, Math.ceil(
        (new Date(state.checkOut).getTime() - new Date(state.checkIn).getTime()) / 
        (1000 * 60 * 60 * 24)
      ))
    : 0;

  const value: MobileBookingContextValue = {
    state,
    setProperty,
    setDates,
    addRoom,
    removeRoom,
    updateRoom,
    setRateType,
    setGuestDetails,
    setTotalCost,
    toggleExpanded,
    setExpanded,
    clearBooking,
    totalGuests,
    nights,
  };

  return (
    <MobileBookingContext.Provider value={value}>
      {children}
    </MobileBookingContext.Provider>
  );
}

// Hook
export function useMobileBooking() {
  const context = useContext(MobileBookingContext);
  if (context === undefined) {
    throw new Error("useMobileBooking must be used within a MobileBookingProvider");
  }
  return context;
}
