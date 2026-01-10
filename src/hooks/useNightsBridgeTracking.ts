import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface CreateSessionParams {
  propertyId: string;
  propertyName: string;
  checkIn?: string;
  checkOut?: string;
  currency?: string;
}

/**
 * Hook for tracking NightsBridge booking sessions.
 * Creates a session record when a user enters the NightsBridge booking flow,
 * enabling probabilistic tracking of completed bookings.
 */
export function useNightsBridgeTracking() {
  /**
   * Creates a booking session and returns the tracking reference.
   * This tracking ref is appended to the NightsBridge iframe URL.
   */
  const createBookingSession = useCallback(async ({
    propertyId,
    propertyName,
    checkIn,
    checkOut,
    currency = 'ZAR',
  }: CreateSessionParams): Promise<string | null> => {
    try {
      const trackingRef = crypto.randomUUID();
      
      const { error } = await supabase
        .from('nightsbridge_booking_sessions')
        .insert({
          tracking_ref: trackingRef,
          property_id: propertyId,
          property_name: propertyName,
          check_in_date: checkIn || null,
          check_out_date: checkOut || null,
          currency,
          user_agent: navigator.userAgent,
        });

      if (error) {
        console.error('Failed to create NightsBridge booking session:', error);
        return null;
      }

      console.log('NightsBridge booking session created:', trackingRef);
      return trackingRef;
    } catch (err) {
      console.error('Error creating NightsBridge booking session:', err);
      return null;
    }
  }, []);

  return { createBookingSession };
}
