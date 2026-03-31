import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createSuccessResponse, createErrorResponse } from '../_shared/adapter-contract.ts';
import { resolveExperienceConfig, callPmsAdapterWithLiveCheck } from '../_shared/experience-helpers.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const VALID_EXPERIENCE_TYPES = [
  'cancellation_policy',
  'brand_kit',
  'guest_email',
  'guest_portal',
  'portfolio',
  'agent_command',
] as const;

type ExperienceType = typeof VALID_EXPERIENCE_TYPES[number];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { property_id, experience_type, payload } = body;

    // Validate required fields
    if (!property_id || !experience_type) {
      return new Response(
        JSON.stringify(createErrorResponse('INVALID_REQUEST', 'property_id and experience_type are required', 'roomsonline' as any, 'experience-engine')),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!VALID_EXPERIENCE_TYPES.includes(experience_type as ExperienceType)) {
      return new Response(
        JSON.stringify(createErrorResponse('INVALID_REQUEST', `Invalid experience_type: ${experience_type}`, 'roomsonline' as any, 'experience-engine')),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Guard: check experience_engine_enabled on rolos_ui_configs
    const { data: uiConfig } = await supabase
      .from('rolos_ui_configs')
      .select('experience_engine_enabled')
      .eq('property_id', property_id)
      .maybeSingle();

    if (!uiConfig?.experience_engine_enabled) {
      return new Response(
        JSON.stringify(createErrorResponse('ACCESS_DENIED', 'Experience Engine is not enabled for this property', 'roomsonline' as any, 'experience-engine')),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Route by experience_type
    let result: Record<string, unknown>;

    if (experience_type === 'cancellation_policy') {
      // Read policy from rolos_policies
      const { data: policy, error: policyError } = await supabase
        .from('rolos_policies')
        .select('*')
        .eq('property_id', property_id)
        .eq('policy_type', 'cancellation')
        .maybeSingle();

      if (policyError) {
        return new Response(
          JSON.stringify(createErrorResponse('INTERNAL_ADAPTER_ERROR', policyError.message, 'roomsonline' as any, 'experience-engine')),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Optionally fetch live PMS data if the policy rule requires it
      let liveData: Record<string, unknown> | null = null;
      const rule = policy?.rule as Record<string, unknown> | null;
      if (rule?.dynamic_factors && Array.isArray(rule.dynamic_factors) && rule.dynamic_factors.includes('occupancy')) {
        try {
          liveData = await callPmsAdapterWithLiveCheck(supabase, property_id, payload || {});
        } catch (e) {
          console.warn('Live PMS check failed for cancellation policy, proceeding with static rule:', e);
        }
      }

      result = {
        policy: policy?.rule || null,
        is_ai_generated: policy?.is_ai_generated || false,
        last_evaluated_at: policy?.last_evaluated_at || null,
        live_occupancy: liveData || null,
      };
    } else {
      // All other types: read from rolos_experience_configs
      const config = await resolveExperienceConfig(supabase, property_id, experience_type);
      result = { config, experience_type };
    }

    return new Response(
      JSON.stringify(createSuccessResponse(result, 'roomsonline' as any, `experience-engine:${experience_type}`)),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Experience Engine error:', err);
    return new Response(
      JSON.stringify(createErrorResponse('INTERNAL_ADAPTER_ERROR', errorMessage, 'roomsonline' as any, 'experience-engine')),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
