import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  SCORE_WEIGHTS, 
  getScoreBand,
  PMS_SENSITIVE_FIELDS 
} from "@/config/onboardingFieldSchema";
import { Json } from "@/integrations/supabase/types";

interface PropertyData {
  id: string;
  name: string;
  property_type: string;
  property_url: string | null;
  address: string;
  city: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  images: Json | null;
  amenities: Json | null;
  pms_managed_fields: string[] | null;
}

interface OnboardingState {
  currentStep: number;
  propertyData: PropertyData | null;
  isLoading: boolean;
  isSaving: boolean;
  lastSavedAt: Date | null;
  completionPercent: number;
  score: number;
  scoreBand: ReturnType<typeof getScoreBand>;
  pmsManagedFields: string[];
}

const DEBOUNCE_MS = 2000;

export function usePropertyOnboarding(propertyId: string) {
  const { toast } = useToast();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingChangesRef = useRef<Partial<PropertyData>>({});

  const [state, setState] = useState<OnboardingState>({
    currentStep: 0,
    propertyData: null,
    isLoading: true,
    isSaving: false,
    lastSavedAt: null,
    completionPercent: 0,
    score: 0,
    scoreBand: getScoreBand(0),
    pmsManagedFields: []
  });

  // Fetch property data
  const fetchProperty = useCallback(async () => {
    if (!propertyId) return;

    try {
      setState(prev => ({ ...prev, isLoading: true }));

      const { data, error } = await supabase
        .from("properties")
        .select("id, name, property_type, property_url, address, city, country, latitude, longitude, description, images, amenities, pms_managed_fields")
        .eq("id", propertyId)
        .single();

      if (error) throw error;

      const propertyData = data as PropertyData;
      const pmsManagedFields = (propertyData.pms_managed_fields || []) as string[];
      const { completionPercent, score } = calculateScores(propertyData);

      setState(prev => ({
        ...prev,
        propertyData,
        pmsManagedFields,
        completionPercent,
        score,
        scoreBand: getScoreBand(score),
        isLoading: false
      }));
    } catch (error) {
      console.error("Error fetching property:", error);
      toast({
        title: "Error loading property",
        description: "Could not load property data. Please try again.",
        variant: "destructive"
      });
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [propertyId, toast]);

  useEffect(() => {
    fetchProperty();
  }, [fetchProperty]);

  // Calculate completion and score
  const calculateScores = useCallback((data: PropertyData | null) => {
    if (!data) return { completionPercent: 0, score: 0 };

    const amenities = (data.amenities || {}) as Record<string, unknown>;
    let totalWeight = 0;
    let earnedScore = 0;

    // Property Identity (15%)
    const identityFields = [data.name, data.property_type, data.property_url].filter(Boolean).length;
    earnedScore += (identityFields / 3) * SCORE_WEIGHTS.property_identity;
    totalWeight += SCORE_WEIGHTS.property_identity;

    // Contact Details (5%)
    const contactFields = [amenities.telephone, amenities.contact_email].filter(Boolean).length;
    earnedScore += (contactFields / 2) * SCORE_WEIGHTS.contact_details;
    totalWeight += SCORE_WEIGHTS.contact_details;

    // Offerings (5%)
    const offerings = amenities.offerings as Record<string, boolean> | undefined;
    const offeringCount = offerings ? Object.values(offerings).filter(Boolean).length : 0;
    earnedScore += (offeringCount > 0 ? 1 : 0) * SCORE_WEIGHTS.offerings;
    totalWeight += SCORE_WEIGHTS.offerings;

    // Location (15%)
    const locationFields = [data.address, data.city, data.country, data.latitude, data.longitude].filter(Boolean).length;
    earnedScore += (locationFields / 5) * SCORE_WEIGHTS.location;
    totalWeight += SCORE_WEIGHTS.location;

    // Policies (10%)
    const policyFields = [
      amenities.min_check_in_age,
      amenities.pets_allowed !== undefined,
      amenities.payment_policy,
      amenities.cancellation_policies
    ].filter(Boolean).length;
    earnedScore += (policyFields / 4) * SCORE_WEIGHTS.policies;
    totalWeight += SCORE_WEIGHTS.policies;

    // Banking (10%)
    const bankingFields = [
      amenities.bank_name,
      amenities.branch_code,
      amenities.account_holder,
      amenities.account_number
    ].filter(Boolean).length;
    earnedScore += (bankingFields / 4) * SCORE_WEIGHTS.banking;
    totalWeight += SCORE_WEIGHTS.banking;

    // Description & Meals (10%)
    const descFields = [data.description, amenities.meal_plan].filter(Boolean).length;
    earnedScore += (descFields / 2) * SCORE_WEIGHTS.description_and_meals;
    totalWeight += SCORE_WEIGHTS.description_and_meals;

    // Facilities (10%)
    const facilities = amenities.facilities as string[] | undefined;
    earnedScore += (facilities && facilities.length > 0 ? 1 : 0) * SCORE_WEIGHTS.facilities;
    totalWeight += SCORE_WEIGHTS.facilities;

    // Rooms (10%)
    const roomTypes = amenities.room_types as unknown[] | undefined;
    earnedScore += (roomTypes && roomTypes.length > 0 ? 1 : 0) * SCORE_WEIGHTS.rooms_overview;
    totalWeight += SCORE_WEIGHTS.rooms_overview;

    // Media (10%)
    const images = (data.images || []) as unknown[];
    earnedScore += (images.length >= 3 ? 1 : images.length / 3) * SCORE_WEIGHTS.media;
    totalWeight += SCORE_WEIGHTS.media;

    const score = Math.round(earnedScore);
    const completionPercent = totalWeight > 0 ? Math.round((earnedScore / totalWeight) * 100) : 0;

    return { completionPercent, score };
  }, []);

  // Debounced save
  const saveChanges = useCallback(async (changes: Partial<PropertyData>) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Merge with pending changes
    pendingChangesRef.current = { ...pendingChangesRef.current, ...changes };

    saveTimeoutRef.current = setTimeout(async () => {
      const changesToSave = { ...pendingChangesRef.current };
      pendingChangesRef.current = {};

      if (Object.keys(changesToSave).length === 0) return;

      setState(prev => ({ ...prev, isSaving: true }));

      try {
        const { error } = await supabase
          .from("properties")
          .update(changesToSave)
          .eq("id", propertyId);

        if (error) throw error;

        setState(prev => ({
          ...prev,
          propertyData: prev.propertyData ? { ...prev.propertyData, ...changesToSave } : null,
          isSaving: false,
          lastSavedAt: new Date()
        }));

        // Recalculate scores after save
        setState(prev => {
          if (!prev.propertyData) return prev;
          const { completionPercent, score } = calculateScores(prev.propertyData);
          return {
            ...prev,
            completionPercent,
            score,
            scoreBand: getScoreBand(score)
          };
        });
      } catch (error) {
        console.error("Error saving property:", error);
        toast({
          title: "Save failed",
          description: "Could not save changes. Please try again.",
          variant: "destructive"
        });
        setState(prev => ({ ...prev, isSaving: false }));
      }
    }, DEBOUNCE_MS);
  }, [propertyId, calculateScores, toast]);

  // Update field with auto-save
  const updateField = useCallback((field: string, value: unknown) => {
    setState(prev => {
      if (!prev.propertyData) return prev;

      let newPropertyData: PropertyData;

      // Check if it's an amenities field
      if (field.startsWith("amenities.")) {
        const amenityField = field.replace("amenities.", "");
        const currentAmenities = (prev.propertyData.amenities || {}) as Record<string, unknown>;
        const newAmenities = { ...currentAmenities, [amenityField]: value };
        newPropertyData = { ...prev.propertyData, amenities: newAmenities as Json };
        saveChanges({ amenities: newAmenities as Json });
      } else {
        newPropertyData = { ...prev.propertyData, [field]: value } as PropertyData;
        saveChanges({ [field]: value } as Partial<PropertyData>);
      }

      const { completionPercent, score } = calculateScores(newPropertyData);

      return {
        ...prev,
        propertyData: newPropertyData,
        completionPercent,
        score,
        scoreBand: getScoreBand(score)
      };
    });
  }, [saveChanges, calculateScores]);

  // Check if field is PMS managed
  const isPMSManaged = useCallback((field: string): boolean => {
    return state.pmsManagedFields.includes(field) || 
           PMS_SENSITIVE_FIELDS.some(f => f.includes(field));
  }, [state.pmsManagedFields]);

  // Navigate steps
  const goToStep = useCallback((step: number) => {
    setState(prev => ({ ...prev, currentStep: Math.max(0, Math.min(10, step)) }));
  }, []);

  const nextStep = useCallback(() => {
    setState(prev => ({ ...prev, currentStep: Math.min(10, prev.currentStep + 1) }));
  }, []);

  const prevStep = useCallback(() => {
    setState(prev => ({ ...prev, currentStep: Math.max(0, prev.currentStep - 1) }));
  }, []);

  // Get amenity value helper
  const getAmenityValue = useCallback(<T,>(key: string, defaultValue: T): T => {
    if (!state.propertyData?.amenities) return defaultValue;
    const amenities = state.propertyData.amenities as Record<string, unknown>;
    return (amenities[key] as T) ?? defaultValue;
  }, [state.propertyData]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    ...state,
    updateField,
    isPMSManaged,
    goToStep,
    nextStep,
    prevStep,
    getAmenityValue,
    refetch: fetchProperty
  };
}
