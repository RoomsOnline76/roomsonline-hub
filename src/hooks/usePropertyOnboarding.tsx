import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { queueChannelContentSync } from "@/lib/channelContentSync";
import { useToast } from "@/hooks/use-toast";
import { 
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
import { hydrateWebsiteWizardAmenitiesFromInventory } from "@/lib/websiteWizardHydrate";
import { calculateWebsiteWizardScore } from "@/lib/websiteWizardScore";

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
  price_per_night?: number | null;
  owner_name?: string | null;
  owner_email?: string | null;
  ru_location_id?: number | null;
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

async function hydrateRoomsFromInventory(propertyId: string, propertyData: PropertyData): Promise<PropertyData> {
  const amenities = { ...((propertyData.amenities || {}) as Record<string, unknown>) };

  const [{ data: units }, { data: plans }, { data: contacts }] = await Promise.all([
    supabase
      .from("hostfully_room_types")
      .select("id, name, is_active, max_guests, daily_rate, total_units, description")
      .eq("property_id", propertyId),
    supabase
      .from("rolos_rate_plans")
      .select("base_rate, is_primary_sell, is_active")
      .eq("property_id", propertyId),
    supabase
      .from("property_contact_details")
      .select("role, phone, name, email")
      .eq("property_id", propertyId)
      .then(
        (r) => r,
        () => ({ data: [] as { role: string | null; phone: string | null; name: string | null; email: string | null }[] }),
      ),
  ]);

  const filled = hydrateWebsiteWizardAmenitiesFromInventory(
    amenities,
    {
      owner_name: propertyData.owner_name,
      owner_email: propertyData.owner_email,
      ru_location_id: propertyData.ru_location_id,
      price_per_night: propertyData.price_per_night,
    },
    { rooms: units ?? [], ratePlans: plans ?? [], contacts: contacts ?? [] },
  );

  const before = JSON.stringify(amenities);
  const after = JSON.stringify(filled);
  if (before === after) return propertyData;

  await supabase.from("properties").update({ amenities: filled as Json }).eq("id", propertyId);
  return { ...propertyData, amenities: filled as Json };
}

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
  const scoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        .select("id, name, property_type, property_url, address, city, country, latitude, longitude, description, short_description, images, amenities, pms_managed_fields, listing_intent, listing_status, price_per_night, owner_name, owner_email, ru_location_id")
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

      // Fill website-wizard room fields from the live RU / property inventory
      // so completed channel work raises the listing score and the Rooms step
      // is not blank.
      propertyData = await hydrateRoomsFromInventory(propertyId, propertyData);
      
      const { completionPercent, score } = calculateScores(propertyData, listingIntent);
      const amenitiesForScore = { ...((propertyData.amenities || {}) as Record<string, unknown>) };
      if (amenitiesForScore.onboarding_score !== score) {
        amenitiesForScore.onboarding_score = score;
        propertyData = { ...propertyData, amenities: amenitiesForScore as Json };
        void supabase.from("properties").update({ amenities: amenitiesForScore as Json }).eq("id", propertyId);
      }
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

  const calculateScores = useCallback((data: PropertyData | null, _intent: ListingIntent = 'accommodation') => {
    const score = calculateWebsiteWizardScore(data);
    return { completionPercent: score, score };
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
        const { error } = await supabase.from("properties").update(changesToSave as never).eq("id", propertyId);
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

      return {
        ...prev,
        propertyData: newPropertyData,
      };
    });

    if (scoreTimeoutRef.current) clearTimeout(scoreTimeoutRef.current);
    scoreTimeoutRef.current = setTimeout(() => {
      setState((latest) => {
        if (!latest.propertyData) return latest;
        const { completionPercent, score } = calculateScores(latest.propertyData, latest.listingIntent);
        return {
          ...latest,
          completionPercent,
          score,
          scoreBand: getScoreBand(score),
          completionState: getCompletionState(score),
          completionStateDetails: getCompletionStateDetails(score),
        };
      });
    }, 160);
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
    const nested = (path: string): unknown => {
      const parts = path.split(".");
      let current: unknown = amenities;
      for (const part of parts) {
        if (!current || typeof current !== "object" || !(part in (current as Record<string, unknown>))) {
          return undefined;
        }
        current = (current as Record<string, unknown>)[part];
      }
      return current;
    };
    const aliases: Record<string, string[]> = {
      star_grading: ["star_grading", "star_rating"],
      contact_email: ["contact_email", "contact.email"],
      telephone: ["telephone", "contact.telephone"],
      main_contact_name: ["main_contact_name", "key_representative", "contact.owner"],
      ru_location_id: ["ru_location_id"],
      region: ["region", "address_details.region", "address_details.province"],
      meal_types: ["meal_types", "breakfast_options"],
      facilities: ["facilities"],
    };
    for (const path of aliases[key] ?? [key]) {
      const value = nested(path);
      if (value !== undefined && value !== null && value !== "") return value as T;
    }
    if (key === "ru_location_id" && state.propertyData.ru_location_id != null) {
      return state.propertyData.ru_location_id as T;
    }
    return defaultValue;
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
