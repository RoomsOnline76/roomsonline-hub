import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { queueChannelContentSync } from "@/lib/channelContentSync";
import { useToast } from "@/hooks/use-toast";
import { 
  SCORE_WEIGHTS, 
  getScoreBand, 
  PMS_SENSITIVE_FIELDS, 
  WIZARD_SECTIONS, 
  OnboardingImage,
  getWizardStepsForIntent,
  getCompletionState,
  getCompletionStateDetails,
  getMissingFieldsByImpact,
  ListingIntent,
  WizardSection,
  FieldDefinition,
  FieldImpactLevel,
  CompletionState,
  COMPLETION_STATES
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
  short_description: string | null;
  images: Json | null;
  amenities: Json | null;
  pms_managed_fields: string[] | null;
  listing_intent?: string | null;
  listing_status?: string | null;
  [key: string]: unknown; // Allow dynamic property access for updateField
}

interface RoadmapMilestone {
  id: string;
  label: string;
  required: boolean;
  completed: boolean;
}

interface ChecklistItem {
  id: string;
  phase: string;
  item_key: string;
  item_label: string;
  completed: boolean;
  auto_verified: boolean;
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
  // New Phase 4 fields
  listingIntent: ListingIntent;
  wizardSteps: WizardSection[];
  completionState: CompletionState;
  completionStateDetails: typeof COMPLETION_STATES[CompletionState];
  missingFields: Record<FieldImpactLevel, FieldDefinition[]>;
  roadmap: RoadmapMilestone[];
  checklist: ChecklistItem[];
  nextAction: { label: string; stepId: string } | null;
}

const DEBOUNCE_MS = 2000;

// Helper to get stored step from sessionStorage
const getStoredStep = (propId: string): number => {
  try {
    const stored = sessionStorage.getItem(`onboarding_step_${propId}`);
    return stored ? parseInt(stored, 10) : 0;
  } catch {
    return 0;
  }
};

// Helper to persist step to sessionStorage
const persistStep = (propId: string, step: number) => {
  try {
    sessionStorage.setItem(`onboarding_step_${propId}`, String(step));
  } catch {
    // Ignore storage errors
  }
};

export function usePropertyOnboarding(propertyId: string, initialOwnerEmail?: string) {
  const { toast } = useToast();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingChangesRef = useRef<Partial<PropertyData>>({});
  const emailPrePopulatedRef = useRef(false);

  const [state, setState] = useState<OnboardingState>(() => ({
    currentStep: getStoredStep(propertyId),
    propertyData: null,
    isLoading: true,
    isSaving: false,
    lastSavedAt: null,
    completionPercent: 0,
    score: 0,
    scoreBand: getScoreBand(0),
    pmsManagedFields: [],
    // New Phase 4 fields
    listingIntent: 'accommodation',
    wizardSteps: WIZARD_SECTIONS,
    completionState: 'INCOMPLETE',
    completionStateDetails: COMPLETION_STATES.INCOMPLETE,
    missingFields: { critical: [], high: [], medium: [], low: [] },
    roadmap: [],
    checklist: [],
    nextAction: null
  }));

  // Fetch roadmap from database
  const fetchRoadmap = useCallback(async (propId: string) => {
    try {
      const { data } = await supabase
        .from("property_onboarding_roadmap")
        .select("roadmap")
        .eq("property_id", propId)
        .maybeSingle();
      
      if (data?.roadmap) {
        const roadmapData = data.roadmap as { milestones?: RoadmapMilestone[] };
        return roadmapData.milestones || [];
      }
      return [];
    } catch (error) {
      console.error("Error fetching roadmap:", error);
      return [];
    }
  }, []);

  // Fetch checklist from database
  const fetchChecklist = useCallback(async (propId: string) => {
    try {
      const { data } = await supabase
        .from("property_checklist")
        .select("id, phase, item_key, item_label, completed, auto_verified")
        .eq("property_id", propId)
        .order("created_at", { ascending: true });
      
      return (data || []) as ChecklistItem[];
    } catch (error) {
      console.error("Error fetching checklist:", error);
      return [];
    }
  }, []);

  // Update checklist item
  const updateChecklistItem = useCallback(async (itemKey: string, completed: boolean) => {
    if (!state.propertyData?.id) return;

    try {
      await supabase
        .from("property_checklist")
        .update({ 
          completed, 
          completed_at: completed ? new Date().toISOString() : null 
        })
        .eq("property_id", state.propertyData.id)
        .eq("item_key", itemKey);

      setState(prev => ({
        ...prev,
        checklist: prev.checklist.map(item => 
          item.item_key === itemKey ? { ...item, completed } : item
        )
      }));
    } catch (error) {
      console.error("Error updating checklist:", error);
    }
  }, [state.propertyData?.id]);

  // Auto-verify checklist based on field completion
  const autoVerifyChecklist = useCallback((data: PropertyData) => {
    const amenities = (data.amenities || {}) as Record<string, unknown>;
    const verifications: { key: string; completed: boolean }[] = [];

    // Map fields to checklist items
    if (data.name) verifications.push({ key: 'property_name', completed: true });
    if (data.property_type) verifications.push({ key: 'property_type', completed: true });
    if (data.address && data.city && data.country) verifications.push({ key: 'location_complete', completed: true });
    if (amenities.telephone || amenities.contact_email) verifications.push({ key: 'contact_info', completed: true });
    if (data.description) verifications.push({ key: 'description_added', completed: true });
    
    const rawImages = data.images;
    const images: OnboardingImage[] = Array.isArray(rawImages) ? rawImages as unknown as OnboardingImage[] : [];
    if (images.length >= 3) verifications.push({ key: 'min_images', completed: true });
    if (images.some(img => img.type === 'hero')) verifications.push({ key: 'hero_image', completed: true });
    
    const roomTypes = amenities.room_types as Array<{ name?: string }> | undefined;
    if (roomTypes && roomTypes.length > 0) verifications.push({ key: 'rooms_configured', completed: true });

    return verifications;
  }, []);

  // Calculate next action based on missing fields
  const calculateNextAction = useCallback((
    missingFields: Record<FieldImpactLevel, FieldDefinition[]>,
    wizardSteps: WizardSection[]
  ): { label: string; stepId: string } | null => {
    // Prioritize critical fields first
    if (missingFields.critical.length > 0) {
      const field = missingFields.critical[0];
      const step = wizardSteps.find(s => s.id === field.section);
      return {
        label: `Complete ${field.label}`,
        stepId: field.section
      };
    }
    
    if (missingFields.high.length > 0) {
      const field = missingFields.high[0];
      return {
        label: `Add ${field.label}`,
        stepId: field.section
      };
    }
    
    if (missingFields.medium.length > 0) {
      const field = missingFields.medium[0];
      return {
        label: `Consider adding ${field.label}`,
        stepId: field.section
      };
    }
    
    return null;
  }, []);

  const fetchProperty = useCallback(async () => {
    if (!propertyId) return;

    try {
      setState(prev => ({ ...prev, isLoading: true }));

      const { data, error } = await supabase
        .from("properties")
        .select("id, name, property_type, property_url, address, city, country, latitude, longitude, description, short_description, images, amenities, pms_managed_fields, listing_intent, listing_status")
        .eq("id", propertyId)
        .single();

      if (error) throw error;

      let propertyData = data as PropertyData;
      const pmsManagedFields = (propertyData.pms_managed_fields || []) as string[];
      
      // Determine listing intent
      const listingIntent = (propertyData.listing_intent as ListingIntent) || 'accommodation';
      const wizardSteps = getWizardStepsForIntent(listingIntent);
      
      // Pre-populate email if provided
      if (initialOwnerEmail && !emailPrePopulatedRef.current) {
        const currentAmenities = (propertyData.amenities || {}) as Record<string, unknown>;
        if (!currentAmenities.contact_email) {
          const newAmenities = { ...currentAmenities, contact_email: initialOwnerEmail };
          propertyData = { ...propertyData, amenities: newAmenities as Json };
          await supabase.from("properties").update({ amenities: newAmenities }).eq("id", propertyId);
          emailPrePopulatedRef.current = true;
        }
      }
      
      // Update listing_status to onboarding_active if contract_signed
      if (propertyData.listing_status === 'contract_signed') {
        await supabase.from("properties").update({ listing_status: 'onboarding_active' }).eq("id", propertyId);
        propertyData = { ...propertyData, listing_status: 'onboarding_active' };
      }
      
      const { completionPercent, score } = calculateScores(propertyData, listingIntent);
      const completionState = getCompletionState(score);
      const completionStateDetails = getCompletionStateDetails(score);
      
      // Calculate missing fields
      const amenities = (propertyData.amenities || {}) as Record<string, unknown>;
      const missingFields = getMissingFieldsByImpact(
        propertyData as unknown as Record<string, unknown>,
        amenities,
        listingIntent
      );
      
      // Fetch roadmap and checklist
      const [roadmap, checklist] = await Promise.all([
        fetchRoadmap(propertyId),
        fetchChecklist(propertyId)
      ]);
      
      const nextAction = calculateNextAction(missingFields, wizardSteps);

      setState(prev => ({
        ...prev,
        propertyData,
        pmsManagedFields,
        completionPercent,
        score,
        scoreBand: getScoreBand(score),
        listingIntent,
        wizardSteps,
        completionState,
        completionStateDetails,
        missingFields,
        roadmap,
        checklist,
        nextAction,
        isLoading: false
      }));
    } catch (error) {
      console.error("Error fetching property:", error);
      toast({ title: "Error loading property", variant: "destructive" });
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [propertyId, toast, fetchRoadmap, fetchChecklist, calculateNextAction, initialOwnerEmail]);

  useEffect(() => {
    fetchProperty();
  }, [fetchProperty]);

  const calculateScores = useCallback((data: PropertyData | null, intent: ListingIntent = 'accommodation') => {
    if (!data) return { completionPercent: 0, score: 0 };

    const amenities = (data.amenities || {}) as Record<string, unknown>;
    
    // Helper to get nested values from amenities
    const getNestedValue = (...paths: string[]): unknown => {
      for (const path of paths) {
        const parts = path.split('.');
        let current: unknown = amenities;
        for (const part of parts) {
          if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
            current = (current as Record<string, unknown>)[part];
          } else {
            current = undefined;
            break;
          }
        }
        if (current !== undefined && current !== null && current !== '') {
          return current;
        }
      }
      return undefined;
    };
    
    let earnedScore = 0;
    let totalWeight = 0;

    // Get steps for this intent to determine which sections to score
    const steps = getWizardStepsForIntent(intent);
    const stepIds = steps.map(s => s.id);

    // Property Identity (20%)
    if (stepIds.includes('property_identity')) {
      totalWeight += SCORE_WEIGHTS.property_identity;
      const offerings = amenities.offerings as Record<string, boolean> | undefined;
      const offeringCount = offerings ? Object.values(offerings).filter(Boolean).length : 0;
      const identityFields = [data.name, data.property_type, data.property_url, offeringCount > 0].filter(Boolean).length;
      earnedScore += (identityFields / 4) * SCORE_WEIGHTS.property_identity;
    }

    // Contact Details (5%)
    if (stepIds.includes('contact_details')) {
      totalWeight += SCORE_WEIGHTS.contact_details;
      // Check both flat and nested paths for contact info
      const hasPhone = !!(getNestedValue('contact.telephone', 'telephone') || getNestedValue('contact.mobile', 'mobile'));
      const hasEmail = !!(getNestedValue('contact.email', 'contact_email'));
      const contactFields = [hasPhone, hasEmail].filter(Boolean).length;
      earnedScore += (contactFields / 2) * SCORE_WEIGHTS.contact_details;
    }

    // Location (15%)
    if (stepIds.includes('location')) {
      totalWeight += SCORE_WEIGHTS.location;
      const locationFields = [data.address, data.city, data.country, data.latitude, data.longitude].filter(Boolean).length;
      earnedScore += (locationFields / 5) * SCORE_WEIGHTS.location;
    }

    // Policies & Pricing (15%)
    if (stepIds.includes('policies_pricing')) {
      totalWeight += SCORE_WEIGHTS.policies_pricing;
      // Check nested house_rules paths for check-in/out times
      const hasCheckIn = !!(getNestedValue('house_rules.check_in_from', 'check_in_from', 'check_in_time'));
      const hasCheckOut = !!(getNestedValue('house_rules.check_out_to', 'check_out_to', 'check_out_from'));
      // Check nested banking paths
      const hasBanking = !!(getNestedValue('banking.bank_name', 'bank_name', 'banking.bank_confirmation_letter_url', 'bank_confirmation_letter_url'));
      // Check both cancellation_policies array and flat field
      const cancellationPolicies = getNestedValue('cancellation_policies') as unknown[] | undefined;
      const hasCancellation = !!(cancellationPolicies && cancellationPolicies.length > 0) || !!getNestedValue('cancellation_policy');
      const hasPaymentPolicy = !!getNestedValue('payment_policy');
      const hasKeyCollection = !!getNestedValue('key_collection_procedure');
      
      const policyFields = [hasCheckIn, hasCheckOut, hasBanking, hasCancellation, hasPaymentPolicy || hasKeyCollection].filter(Boolean).length;
      earnedScore += (policyFields / 5) * SCORE_WEIGHTS.policies_pricing;
    }

    // Guest Experience (10%)
    if (stepIds.includes('guest_experience')) {
      totalWeight += SCORE_WEIGHTS.guest_experience;
      // Check both flat and nested meal_plan paths
      const hasMealPlan = !!(getNestedValue('meal_plan') || (getNestedValue('breakfast_options') as unknown[] | undefined)?.length);
      const descFields = [
        data.description, 
        data.short_description,
        getNestedValue('unique_selling_points'),
        hasMealPlan
      ].filter(Boolean).length;
      earnedScore += (descFields / 4) * SCORE_WEIGHTS.guest_experience;
    }

    // Facilities (10%)
    if (stepIds.includes('facilities')) {
      totalWeight += SCORE_WEIGHTS.facilities;
      const facilities = amenities.facilities as string[] | undefined;
      earnedScore += (facilities && facilities.length > 0 ? 1 : 0) * SCORE_WEIGHTS.facilities;
    }

    // Rooms (10%)
    if (stepIds.includes('rooms_overview')) {
      totalWeight += SCORE_WEIGHTS.rooms_overview;
      const roomTypes = amenities.room_types as Array<{ name?: string; units?: number; max_guests?: number }> | undefined;
      const roomsComplete = roomTypes && roomTypes.length > 0 && roomTypes.every(r => r.name && r.max_guests);
      earnedScore += (roomsComplete ? 1 : roomTypes && roomTypes.length > 0 ? 0.5 : 0) * SCORE_WEIGHTS.rooms_overview;
    }

    // Media & Documents (15%)
    if (stepIds.includes('media_documents')) {
      totalWeight += SCORE_WEIGHTS.media_documents;
      const rawImages = data.images;
      const images: OnboardingImage[] = Array.isArray(rawImages) ? rawImages as unknown as OnboardingImage[] : [];
      const hasHero = images.some(img => img.type === 'hero');
      const hasMinImages = images.length >= 3;
      const imageScore = hasHero && hasMinImages ? 1 : 
                         hasMinImages ? 0.7 : 
                         images.length / 3;
      earnedScore += imageScore * SCORE_WEIGHTS.media_documents;
    }

    // Venue Capacity (for venue/hybrid)
    if (stepIds.includes('capacity') && SCORE_WEIGHTS.capacity) {
      totalWeight += SCORE_WEIGHTS.capacity;
      const hasCapacity = getNestedValue('venue_capacity', 'max_event_capacity');
      earnedScore += (hasCapacity ? 1 : 0) * SCORE_WEIGHTS.capacity;
    }

    // Event Types (for venue/hybrid)
    if (stepIds.includes('event_types') && SCORE_WEIGHTS.event_types) {
      totalWeight += SCORE_WEIGHTS.event_types;
      const eventTypes = amenities.event_types as string[] | undefined;
      earnedScore += (eventTypes && eventTypes.length > 0 ? 1 : 0) * SCORE_WEIGHTS.event_types;
    }

    // Normalize score based on total weight for this intent
    const normalizedScore = totalWeight > 0 ? Math.round((earnedScore / totalWeight) * 100) : 0;
    const completionPercent = normalizedScore;

    return { completionPercent, score: normalizedScore };
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

        // Static content changed in the PMS — push a delta to the Channel Manager.
        void queueChannelContentSync(propertyId, "onboarding_save");

        setState(prev => {
          const newPropertyData = prev.propertyData ? { ...prev.propertyData, ...changesToSave } : null;
          
          if (!newPropertyData) {
            return { ...prev, isSaving: false, lastSavedAt: new Date() };
          }
          
          const { completionPercent, score } = calculateScores(newPropertyData, prev.listingIntent);
          const completionState = getCompletionState(score);
          const completionStateDetails = getCompletionStateDetails(score);
          
          const amenities = (newPropertyData.amenities || {}) as Record<string, unknown>;
          const missingFields = getMissingFieldsByImpact(
            newPropertyData as unknown as Record<string, unknown>,
            amenities,
            prev.listingIntent
          );
          
          const nextAction = calculateNextAction(missingFields, prev.wizardSteps);
          
          // Auto-verify checklist items
          const verifications = autoVerifyChecklist(newPropertyData);
          verifications.forEach(v => {
            if (v.completed) {
              updateChecklistItem(v.key, true);
            }
          });
          
          return { 
            ...prev, 
            propertyData: newPropertyData,
            completionPercent, 
            score, 
            scoreBand: getScoreBand(score),
            completionState,
            completionStateDetails,
            missingFields,
            nextAction,
            isSaving: false,
            lastSavedAt: new Date()
          };
        });
      } catch (error) {
        toast({ title: "Save failed", variant: "destructive" });
        setState(prev => ({ ...prev, isSaving: false }));
      }
    }, DEBOUNCE_MS);
  }, [propertyId, calculateScores, toast, calculateNextAction, autoVerifyChecklist, updateChecklistItem]);

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

      const { completionPercent, score } = calculateScores(newPropertyData, prev.listingIntent);
      const completionState = getCompletionState(score);
      const completionStateDetails = getCompletionStateDetails(score);
      
      return { 
        ...prev, 
        propertyData: newPropertyData, 
        completionPercent, 
        score, 
        scoreBand: getScoreBand(score),
        completionState,
        completionStateDetails
      };
    });
  }, [saveChanges, calculateScores]);

  const isPMSManaged = useCallback((field: string): boolean => {
    return state.pmsManagedFields.includes(field) || PMS_SENSITIVE_FIELDS.some(f => f.includes(field));
  }, [state.pmsManagedFields]);

  const goToStep = useCallback((step: number) => {
    setState(prev => {
      const newStep = Math.max(0, Math.min(prev.wizardSteps.length - 1, step));
      persistStep(propertyId, newStep);
      return { ...prev, currentStep: newStep };
    });
  }, [propertyId]);

  const goToStepById = useCallback((stepId: string) => {
    setState(prev => {
      const stepIndex = prev.wizardSteps.findIndex(s => s.id === stepId);
      if (stepIndex >= 0) {
        persistStep(propertyId, stepIndex);
        return { ...prev, currentStep: stepIndex };
      }
      return prev;
    });
  }, [propertyId]);

  const nextStep = useCallback(() => {
    setState(prev => {
      const newStep = Math.min(prev.wizardSteps.length - 1, prev.currentStep + 1);
      persistStep(propertyId, newStep);
      return { ...prev, currentStep: newStep };
    });
  }, [propertyId]);

  const prevStep = useCallback(() => {
    setState(prev => {
      const newStep = Math.max(0, prev.currentStep - 1);
      persistStep(propertyId, newStep);
      return { ...prev, currentStep: newStep };
    });
  }, [propertyId]);

  const getAmenityValue = useCallback(<T,>(key: string, defaultValue: T): T => {
    if (!state.propertyData?.amenities) return defaultValue;
    const amenities = state.propertyData.amenities as Record<string, unknown>;
    return (amenities[key] as T) ?? defaultValue;
  }, [state.propertyData]);

  useEffect(() => {
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, []);

  return { 
    ...state, 
    updateField, 
    isPMSManaged, 
    goToStep, 
    goToStepById,
    nextStep, 
    prevStep, 
    getAmenityValue, 
    updateChecklistItem,
    refetch: fetchProperty 
  };
}
