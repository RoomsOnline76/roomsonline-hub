import { useState, useEffect, useCallback, useRef } from 'react';

interface HesitationState {
  isHesitating: boolean;
  hesitationDuration: number;
  hesitationTrigger: 'date_picker' | 'room_selection' | 'checkout' | null;
  showValueHints: boolean;
}

interface UseHesitationDetectionOptions {
  threshold?: number; // Time in ms before considering hesitation
  onHesitationDetected?: (trigger: string) => void;
}

export function useHesitationDetection(options: UseHesitationDetectionOptions = {}) {
  const { threshold = 8000, onHesitationDetected } = options;
  
  const [state, setState] = useState<HesitationState>({
    isHesitating: false,
    hesitationDuration: 0,
    hesitationTrigger: null,
    showValueHints: false,
  });

  const interactionStartRef = useRef<number | null>(null);
  const activeElementRef = useRef<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Start tracking hesitation on a specific element/action
  const startTracking = useCallback((elementType: 'date_picker' | 'room_selection' | 'checkout') => {
    if (activeElementRef.current === elementType) return;
    
    // Clear previous tracking
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    interactionStartRef.current = Date.now();
    activeElementRef.current = elementType;

    // Update duration every second
    intervalRef.current = setInterval(() => {
      if (interactionStartRef.current) {
        const duration = Date.now() - interactionStartRef.current;
        const isHesitating = duration >= threshold;
        
        setState(prev => ({
          ...prev,
          hesitationDuration: duration,
          isHesitating,
          hesitationTrigger: elementType,
          showValueHints: isHesitating,
        }));

        // Trigger callback once when threshold exceeded
        if (isHesitating && duration < threshold + 1000) {
          onHesitationDetected?.(elementType);
        }
      }
    }, 1000);
  }, [threshold, onHesitationDetected]);

  // Stop tracking (user made a decision)
  const stopTracking = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    interactionStartRef.current = null;
    activeElementRef.current = null;
    
    setState({
      isHesitating: false,
      hesitationDuration: 0,
      hesitationTrigger: null,
      showValueHints: false,
    });
  }, []);

  // Reset hesitation state without stopping
  const resetHints = useCallback(() => {
    setState(prev => ({
      ...prev,
      showValueHints: false,
    }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    ...state,
    startTracking,
    stopTracking,
    resetHints,
  };
}
