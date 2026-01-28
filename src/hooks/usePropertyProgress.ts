import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  getCompletionState,
  getCompletionStateDetails,
  getMissingFieldsByImpact,
  ListingIntent,
  FieldDefinition,
  FieldImpactLevel,
  CompletionState,
  COMPLETION_STATES,
  getScoreBand,
  SCORE_BANDS
} from "@/config/onboardingFieldSchema";

export type ListingStatus = 
  | 'draft_pre_contract' 
  | 'contract_sent' 
  | 'contract_signed' 
  | 'onboarding_active' 
  | 'review_pending' 
  | 'activation_ready' 
  | 'review_failed'
  | 'rejected'
  | 'live' 
  | 'inactive';

export interface Blocker {
  id: string;
  name: string;
  message: string;
  fix?: string;
  field?: string;
  severity: 'blocker' | 'warning';
}

export interface ChecklistProgress {
  total: number;
  completed: number;
  percent: number;
  items: Array<{
    key: string;
    label: string;
    completed: boolean;
    phase: string;
  }>;
}

export interface NextAction {
  label: string;
  stepId: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

type ScoreBand = typeof SCORE_BANDS[number];

export interface PropertyProgress {
  propertyId: string;
  propertyName: string;
  status: ListingStatus;
  listingIntent: ListingIntent;
  score: number;
  scoreBand: ScoreBand;
  completionState: CompletionState;
  completionStateDetails: typeof COMPLETION_STATES[CompletionState];
  nextAction: NextAction | null;
  blockers: Blocker[];
  warnings: Blocker[];
  checklistProgress: ChecklistProgress;
  missingFields: Record<FieldImpactLevel, FieldDefinition[]>;
  timeline: Array<{
    status: ListingStatus;
    label: string;
    completed: boolean;
    current: boolean;
    timestamp?: string;
  }>;
  canRequestReview: boolean;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

const STATUS_ORDER: ListingStatus[] = [
  'draft_pre_contract',
  'contract_sent',
  'contract_signed',
  'onboarding_active',
  'review_pending',
  'activation_ready',
  'live'
];

const STATUS_LABELS: Record<ListingStatus, string> = {
  draft_pre_contract: 'Pre-Contract',
  contract_sent: 'Contract Sent',
  contract_signed: 'Contract Signed',
  onboarding_active: 'Onboarding',
  review_pending: 'Under Review',
  activation_ready: 'Ready to Go Live',
  review_failed: 'Review Failed',
  rejected: 'Rejected',
  live: 'Live',
  inactive: 'Inactive'
};

export function usePropertyProgress(propertyId: string): PropertyProgress {
  // Fetch property data
  const { data: property, isLoading: propertyLoading, error: propertyError, refetch: refetchProperty } = useQuery({
    queryKey: ['property-progress', propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, listing_status, listing_intent, description, short_description, address, city, country, images, amenities, pms_managed_fields, activated_at")
        .eq("id", propertyId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!propertyId
  });

  // Fetch checklist
  const { data: checklist, isLoading: checklistLoading, refetch: refetchChecklist } = useQuery({
    queryKey: ['property-checklist', propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_checklist")
        .select("id, phase, item_key, item_label, completed, auto_verified")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!propertyId
  });

  // Fetch quality gate results
  const { data: qualityGate, isLoading: gateLoading, refetch: refetchGate } = useQuery({
    queryKey: ['activation-readiness', propertyId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('check-activation-readiness', {
        body: { property_id: propertyId }
      });
      if (error) throw error;
      return data as {
        passed: boolean;
        score: number;
        blockers: Blocker[];
        warnings: Blocker[];
        checks: Blocker[];
      };
    },
    enabled: !!propertyId,
    staleTime: 30000
  });

  const refetch = () => {
    refetchProperty();
    refetchChecklist();
    refetchGate();
  };

  // Calculate derived values
  const isLoading = propertyLoading || checklistLoading || gateLoading;
  const error = propertyError as Error | null;

  if (!property || isLoading) {
    return {
      propertyId,
      propertyName: '',
      status: 'draft_pre_contract',
      listingIntent: 'accommodation',
      score: 0,
      scoreBand: getScoreBand(0),
      completionState: 'INCOMPLETE',
      completionStateDetails: COMPLETION_STATES.INCOMPLETE,
      nextAction: null,
      blockers: [],
      warnings: [],
      checklistProgress: { total: 0, completed: 0, percent: 0, items: [] },
      missingFields: { critical: [], high: [], medium: [], low: [] },
      timeline: [],
      canRequestReview: false,
      isLoading,
      error,
      refetch
    };
  }

  const status = (property.listing_status as ListingStatus) || 'draft_pre_contract';
  const listingIntent = (property.listing_intent as ListingIntent) || 'accommodation';
  const score = qualityGate?.score || 0;
  const scoreBand = getScoreBand(score);
  const completionState = getCompletionState(score);
  const completionStateDetails = getCompletionStateDetails(score);

  // Calculate missing fields
  const amenities = (property.amenities || {}) as Record<string, unknown>;
  const missingFields = getMissingFieldsByImpact(
    property as unknown as Record<string, unknown>,
    amenities,
    listingIntent
  );

  // Calculate next action
  let nextAction: NextAction | null = null;
  if (missingFields.critical.length > 0) {
    const field = missingFields.critical[0];
    nextAction = { label: `Complete ${field.label}`, stepId: field.section, priority: 'critical' };
  } else if (missingFields.high.length > 0) {
    const field = missingFields.high[0];
    nextAction = { label: `Add ${field.label}`, stepId: field.section, priority: 'high' };
  } else if (missingFields.medium.length > 0) {
    const field = missingFields.medium[0];
    nextAction = { label: `Consider adding ${field.label}`, stepId: field.section, priority: 'medium' };
  } else if (score >= 80 && status === 'onboarding_active') {
    nextAction = { label: 'Request Admin Review', stepId: 'review', priority: 'high' };
  }

  // Build checklist progress
  const checklistProgress: ChecklistProgress = {
    total: checklist?.length || 0,
    completed: checklist?.filter(c => c.completed).length || 0,
    percent: checklist?.length ? Math.round((checklist.filter(c => c.completed).length / checklist.length) * 100) : 0,
    items: (checklist || []).map(c => ({
      key: c.item_key,
      label: c.item_label,
      completed: c.completed,
      phase: c.phase
    }))
  };

  // Build timeline
  const statusIndex = STATUS_ORDER.indexOf(status);
  const timeline = STATUS_ORDER.map((s, i) => ({
    status: s,
    label: STATUS_LABELS[s],
    completed: i < statusIndex || status === 'live',
    current: s === status,
    timestamp: s === 'live' && property.activated_at ? property.activated_at : undefined
  }));

  // Can request review if onboarding and score >= 70
  const canRequestReview = status === 'onboarding_active' && score >= 70;

  return {
    propertyId,
    propertyName: property.name || 'Unnamed Property',
    status,
    listingIntent,
    score,
    scoreBand,
    completionState,
    completionStateDetails,
    nextAction,
    blockers: qualityGate?.blockers || [],
    warnings: qualityGate?.warnings || [],
    checklistProgress,
    missingFields,
    timeline,
    canRequestReview,
    isLoading,
    error,
    refetch
  };
}
