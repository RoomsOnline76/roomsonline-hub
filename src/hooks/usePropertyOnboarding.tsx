import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SCORE_WEIGHTS, getScoreBand, PMS_SENSITIVE_FIELDS, WIZARD_SECTIONS, OnboardingImage } from "@/config/onboardingFieldSchema";
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
  short_description: string | null;  // NEW: Marketing summary
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

export function usePropertyOnboarding(propertyId: string, initialOwnerEmail?: string) {
  const { toast } = useToast();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingChangesRef = useRef<Partial<PropertyData>>({});
  const emailPrePopulatedRef = useRef(false);

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

  const fetchProperty = useCallback(async () => {
    if (!propertyId) return;

    try {
      setState(prev => ({ ...prev, isLoading: true }));

      const { data, error } = await supabase
        .from("properties")
        .select("id, name, property_type, property_url, address, city, country, latitude, longitude, description, short_description, images, amenities, pms_managed_fields")
        .eq("id", propertyId)
        .single();

      if (error) throw error;

      let propertyData = data as PropertyData;
      const pmsManagedFields = (propertyData.pms_managed_fields || []) as string[];
      
      if (initialOwnerEmail && !emailPrePopulatedRef.current) {
        const currentAmenities = (propertyData.amenities || {}) as Record<string, unknown>;
        if (!currentAmenities.contact_email) {
          const newAmenities = { ...currentAmenities, contact_email: initialOwnerEmail };
          propertyData = { ...propertyData, amenities: newAmenities as Json };
          
          await supabase.from("properties").update({ amenities: newAmenities }).eq("id", propertyId);
          emailPrePopulatedRef.current = true;
        }
      }
      
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
      toast({ title: "Error loading property", variant: "destructive" });
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [propertyId, toast]);

  useEffect(() => {
    fetchProperty();
  }, [fetchProperty]);

  const calculateScores = useCallback((data: PropertyData | null) => {
    if (!data) return { completionPercent: 0, score: 0 };

    const amenities = (data.amenities || {}) as Record<string, unknown>;
    let earnedScore = 0;

    // Property Identity (20%)
    const offerings = amenities.offerings as Record<string, boolean> | undefined;
    const offeringCount = offerings ? Object.values(offerings).filter(Boolean).length : 0;
    const identityFields = [data.name, data.property_type, data.property_url, offeringCount > 0].filter(Boolean).length;
    earnedScore += (identityFields / 4) * SCORE_WEIGHTS.property_identity;

    // Contact Details (5%)
    const contactFields = [amenities.telephone, amenities.contact_email].filter(Boolean).length;
    earnedScore += (contactFields / 2) * SCORE_WEIGHTS.contact_details;

    // Location (15%)
    const locationFields = [data.address, data.city, data.country, data.latitude, data.longitude].filter(Boolean).length;
    earnedScore += (locationFields / 5) * SCORE_WEIGHTS.location;

    // Policies & Pricing (15%) - Enhanced with new fields
    const policyFields = [
      amenities.check_in_from || amenities.check_in_time,
      amenities.bank_name || amenities.bank_confirmation_letter_url,
      amenities.payment_policy,
      amenities.cancellation_policy,
      amenities.key_collection_procedure
    ].filter(Boolean).length;
    earnedScore += (policyFields / 5) * SCORE_WEIGHTS.policies_pricing;

    // Guest Experience (10%) - Enhanced with new fields
    const descFields = [
      data.description, 
      data.short_description,
      amenities.unique_selling_points,
      amenities.meal_plan
    ].filter(Boolean).length;
    earnedScore += (descFields / 4) * SCORE_WEIGHTS.guest_experience;

    // Facilities (10%)
    const facilities = amenities.facilities as string[] | undefined;
    earnedScore += (facilities && facilities.length > 0 ? 1 : 0) * SCORE_WEIGHTS.facilities;

    // Rooms (10%) - Enhanced with units check
    const roomTypes = amenities.room_types as Array<{ name?: string; units?: number; max_guests?: number }> | undefined;
    const roomsComplete = roomTypes && roomTypes.length > 0 && roomTypes.every(r => r.name && r.max_guests);
    earnedScore += (roomsComplete ? 1 : roomTypes && roomTypes.length > 0 ? 0.5 : 0) * SCORE_WEIGHTS.rooms_overview;

    // Media & Documents (15%) - Enhanced with image validation
    const images = (data.images || []) as unknown as OnboardingImage[];
    const hasHero = images.some(img => img.type === 'hero');
    const hasMinImages = images.length >= 3;
    const hasMaxImages = images.length <= 5;
    const imageScore = hasHero && hasMinImages && hasMaxImages ? 1 : 
                       hasMinImages ? 0.7 : 
                       images.length / 3;
    earnedScore += imageScore * SCORE_WEIGHTS.media_documents;

    const score = Math.round(earnedScore);
    const completionPercent = Math.round((earnedScore / 100) * 100);

    return { completionPercent, score };
  }, []);

  const saveChanges = useCallback(async (changes: Partial<PropertyData>) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    pendingChangesRef.current = { ...pendingChangesRef.current, ...changes };

    saveTimeoutRef.current = setTimeout(async () => {
      const changesToSave = { ...pendingChangesRef.current };
      pendingChangesRef.current = {};
      if (Object.keys(changesToSave).length === 0) return;

      setState(prev => ({ ...prev, isSaving: true }));

      try {
        const { error } = await supabase.from("properties").update(changesToSave).eq("id", propertyId);
        if (error) throw error;

        setState(prev => ({
          ...prev,
          propertyData: prev.propertyData ? { ...prev.propertyData, ...changesToSave } : null,
          isSaving: false,
          lastSavedAt: new Date()
        }));

        setState(prev => {
          if (!prev.propertyData) return prev;
          const { completionPercent, score } = calculateScores(prev.propertyData);
          return { ...prev, completionPercent, score, scoreBand: getScoreBand(score) };
        });
      } catch (error) {
        toast({ title: "Save failed", variant: "destructive" });
        setState(prev => ({ ...prev, isSaving: false }));
      }
    }, DEBOUNCE_MS);
  }, [propertyId, calculateScores, toast]);

  const updateField = useCallback((field: string, value: unknown) => {
    setState(prev => {
      if (!prev.propertyData) return prev;

      let newPropertyData: PropertyData;

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
      return { ...prev, propertyData: newPropertyData, completionPercent, score, scoreBand: getScoreBand(score) };
    });
  }, [saveChanges, calculateScores]);

  const isPMSManaged = useCallback((field: string): boolean => {
    return state.pmsManagedFields.includes(field) || PMS_SENSITIVE_FIELDS.some(f => f.includes(field));
  }, [state.pmsManagedFields]);

  const goToStep = useCallback((step: number) => {
    setState(prev => ({ ...prev, currentStep: Math.max(0, Math.min(WIZARD_SECTIONS.length - 1, step)) }));
  }, []);

  const nextStep = useCallback(() => {
    setState(prev => ({ ...prev, currentStep: Math.min(WIZARD_SECTIONS.length - 1, prev.currentStep + 1) }));
  }, []);

  const prevStep = useCallback(() => {
    setState(prev => ({ ...prev, currentStep: Math.max(0, prev.currentStep - 1) }));
  }, []);

  const getAmenityValue = useCallback(<T,>(key: string, defaultValue: T): T => {
    if (!state.propertyData?.amenities) return defaultValue;
    const amenities = state.propertyData.amenities as Record<string, unknown>;
    return (amenities[key] as T) ?? defaultValue;
  }, [state.propertyData]);

  useEffect(() => {
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, []);

  return { ...state, updateField, isPMSManaged, goToStep, nextStep, prevStep, getAmenityValue, refetch: fetchProperty };
}
