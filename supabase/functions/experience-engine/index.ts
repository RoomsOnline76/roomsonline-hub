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

      // Evaluate policy with dates if provided
      let evaluation: Record<string, unknown> | null = null;
      const policyRule = policy?.rule as Record<string, unknown> | null;
      if (policyRule && payload?.check_in_date) {
        const checkIn = new Date(payload.check_in_date);
        const now = new Date();
        const msPerDay = 86400000;
        const daysUntil = Math.floor((checkIn.getTime() - now.getTime()) / msPerDay);

        let effectiveDaysBefore = (policyRule.days_before as number) ?? 0;
        let effectiveForfeitPct = (policyRule.forfeit_percent as number) ?? 100;

        // Check date range overrides
        const dateRanges = policyRule.date_ranges as Array<{ start: string; end: string; days_before?: number; forfeit_percent?: number }> | undefined;
        if (dateRanges?.length) {
          const override = dateRanges.find(r => checkIn >= new Date(r.start) && checkIn <= new Date(r.end));
          if (override) {
            effectiveDaysBefore = override.days_before ?? effectiveDaysBefore;
            effectiveForfeitPct = override.forfeit_percent ?? effectiveForfeitPct;
          }
        }

        const isFree = daysUntil >= effectiveDaysBefore;
        const totalPrice = (payload.total_price as number) || 0;
        const forfeitAmount = isFree ? 0 : (totalPrice * effectiveForfeitPct / 100);
        const deadlineDate = new Date(checkIn.getTime() - effectiveDaysBefore * msPerDay).toISOString().split('T')[0];

        evaluation = {
          is_free_cancel: isFree,
          forfeit_amount: forfeitAmount,
          forfeit_percent: effectiveForfeitPct,
          deadline_date: deadlineDate,
          days_until_deadline: daysUntil - effectiveDaysBefore,
          is_non_refundable: !!(policyRule.non_refundable),
        };
      }

      result = {
        policy: policyRule || null,
        is_ai_generated: policy?.is_ai_generated || false,
        last_evaluated_at: policy?.last_evaluated_at || null,
        live_occupancy: liveData || null,
        evaluation,
      };
    } else if (experience_type === 'brand_kit') {
      // Return property font + color config alongside experience config
      const { data: property } = await supabase
        .from('properties')
        .select('brand_heading_font, brand_body_font, brand_primary_color, brand_secondary_color, brand_font_color, brand_logo_url')
        .eq('id', property_id)
        .single();

      const config = await resolveExperienceConfig(supabase, property_id, 'brand_kit');
      result = {
        config,
        fonts: {
          heading: property?.brand_heading_font || null,
          body: property?.brand_body_font || null,
        },
        colors: {
          primary: property?.brand_primary_color || null,
          secondary: property?.brand_secondary_color || null,
          font: property?.brand_font_color || null,
        },
        logo_url: property?.brand_logo_url || null,
        experience_type,
      };
    } else if (experience_type === 'agent_command') {
      // AI-powered agent suggestions based on availability data
      const propertyIds = payload?.properties || [property_id];
      const dateRange = payload?.date_range || { start: new Date().toISOString().split('T')[0], end: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0] };

      // Fetch availability data
      const { data: availData } = await supabase
        .from('pms_availability_cache')
        .select('property_id, external_room_type_id, date, available_units')
        .in('property_id', propertyIds)
        .gte('date', dateRange.start)
        .lte('date', dateRange.end)
        .order('date');

      // Fetch property names
      const { data: propNames } = await supabase
        .from('properties')
        .select('id, name')
        .in('id', propertyIds);
      const nameMap: Record<string, string> = {};
      (propNames || []).forEach((p: any) => { nameMap[p.id] = p.name; });

      // Build summary for AI
      const occupancySummary = payload?.occupancy_summary || [];
      const availSummary = (availData || []).map((r: any) => ({
        property: nameMap[r.property_id] || r.property_id,
        room_type: r.external_room_type_id,
        date: r.date,
        available: r.available_units,
      }));

      // Get AI config
      const config = await resolveExperienceConfig(supabase, property_id, 'agent_command');
      const systemPrompt = (config as any)?.system_prompt ||
        'You are a travel agent assistant for a hotel booking platform. Given property availability and occupancy data, provide 3-5 actionable recommendations for agents to maximize bookings. Each suggestion should have a title, description, and priority (high/medium/low). Return as JSON array with keys: title, description, priority.';
      const model = (config as any)?.model || 'google/gemini-3-flash-preview';

      // Call Lovable AI
      let suggestions: unknown[] = [];
      try {
        const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
        if (LOVABLE_API_KEY) {
          const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: systemPrompt },
                {
                  role: 'user',
                  content: `Availability data:\n${JSON.stringify(availSummary.slice(0, 50))}\n\nOccupancy summary:\n${JSON.stringify(occupancySummary)}\n\nProvide actionable suggestions as a JSON array.`,
                },
              ],
              tools: [{
                type: 'function',
                function: {
                  name: 'provide_suggestions',
                  description: 'Return agent booking suggestions',
                  parameters: {
                    type: 'object',
                    properties: {
                      suggestions: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            title: { type: 'string' },
                            description: { type: 'string' },
                            priority: { type: 'string', enum: ['high', 'medium', 'low'] },
                          },
                          required: ['title', 'description', 'priority'],
                        },
                      },
                    },
                    required: ['suggestions'],
                  },
                },
              }],
              tool_choice: { type: 'function', function: { name: 'provide_suggestions' } },
            }),
          });

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
            if (toolCall?.function?.arguments) {
              const parsed = JSON.parse(toolCall.function.arguments);
              suggestions = parsed.suggestions || [];
            }
          } else if (aiResponse.status === 429) {
            console.warn('AI rate limited for agent_command');
          } else if (aiResponse.status === 402) {
            console.warn('AI credits exhausted for agent_command');
          }
        }
      } catch (aiErr) {
        console.warn('AI suggestions failed:', aiErr);
      }

      result = {
        suggestions,
        availability_summary: availSummary.slice(0, 100),
        properties_count: propertyIds.length,
        date_range: dateRange,
      };
    } else if (experience_type === 'guest_email') {
      const action = payload?.action;

      if (action === 'generate') {
        // AI content generation for email templates
        const triggerEvent = payload?.trigger_event || 'booking_confirmed';
        const tone = payload?.tone || 'friendly';
        const customPrompt = payload?.custom_prompt || '';

        // Fetch property details for context
        const { data: prop } = await supabase
          .from('properties')
          .select('name, city, country, property_type, amenities, brand_primary_color')
          .eq('id', property_id)
          .single();

        const config = await resolveExperienceConfig(supabase, property_id, 'guest_email');

        // Fetch brand voice/tone from brand_kit config
        const { data: brandKitRow } = await supabase
          .from('rolos_experience_configs')
          .select('config')
          .eq('property_id', property_id)
          .eq('experience_type', 'brand_kit')
          .maybeSingle();
        const brandKitCfg = brandKitRow?.config as Record<string, unknown> | null;
        const brandVoice = brandKitCfg?.brand_voice as string || '';
        const aiEmailTone = brandKitCfg?.ai_email_tone as string || tone;

        let systemPromptBase = (config as any)?.system_prompt ||
          `You are an email copywriter for ${prop?.name || 'a property'}, a ${prop?.property_type || 'accommodation'} in ${[prop?.city, prop?.country].filter(Boolean).join(', ') || 'a beautiful destination'}. Write engaging, on-brand guest emails. Use these placeholders where appropriate: {{guest_name}}, {{guest_first_name}}, {{property_name}}, {{check_in_date}}, {{check_out_date}}, {{confirmation_number}}, {{total_amount}}, {{nights}}. Return HTML suitable for email clients with inline styles.`;
        if (brandVoice) systemPromptBase += ` Brand voice: ${brandVoice}.`;
        if (aiEmailTone) systemPromptBase += ` Write in a ${aiEmailTone} tone.`;
        const systemPrompt = systemPromptBase;
        const model = (config as any)?.model || 'google/gemini-3-flash-preview';

        let generated: { subject: string; body_html: string; tone_used: string } = { subject: '', body_html: '', tone_used: tone };

        try {
          const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
          if (LOVABLE_API_KEY) {
            const userPrompt = `Write a ${triggerEvent.replace(/_/g, ' ')} email in a ${tone} tone.${customPrompt ? ` Additional instructions: ${customPrompt}` : ''} Return a subject line and HTML body.`;

            const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${LOVABLE_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model,
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: userPrompt },
                ],
                tools: [{
                  type: 'function',
                  function: {
                    name: 'create_email_template',
                    description: 'Return an email subject and HTML body',
                    parameters: {
                      type: 'object',
                      properties: {
                        subject: { type: 'string', description: 'Email subject line' },
                        body_html: { type: 'string', description: 'HTML email body with inline styles and placeholders' },
                      },
                      required: ['subject', 'body_html'],
                    },
                  },
                }],
                tool_choice: { type: 'function', function: { name: 'create_email_template' } },
              }),
            });

            if (aiResponse.ok) {
              const aiData = await aiResponse.json();
              const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
              if (toolCall?.function?.arguments) {
                const parsed = JSON.parse(toolCall.function.arguments);
                generated = { subject: parsed.subject || '', body_html: parsed.body_html || '', tone_used: tone };
              }
            } else if (aiResponse.status === 429) {
              console.warn('AI rate limited for guest_email generate');
            } else if (aiResponse.status === 402) {
              console.warn('AI credits exhausted for guest_email generate');
            }
          }
        } catch (aiErr) {
          console.warn('AI email generation failed:', aiErr);
        }

        result = generated;

      } else if (action === 'resolve') {
        // Template resolution for sending
        const triggerEvent = payload?.trigger_event || 'booking_confirmed';

        const { data: tpl } = await supabase
          .from('rolos_message_templates')
          .select('*')
          .eq('property_id', property_id)
          .eq('trigger_event', triggerEvent)
          .eq('is_active', true)
          .eq('channel', 'email')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        result = {
          template: tpl || null,
          resolved_from: tpl ? 'experience_engine' : 'none',
        };
      } else {
        // Default: return config
        const config = await resolveExperienceConfig(supabase, property_id, 'guest_email');
        result = { config, experience_type };
      }
    } else if (experience_type === 'portfolio') {
      const action = payload?.action;

      if (action === 'recommend') {
        // Fetch portfolio and member properties
        const portfolioId = payload?.portfolio_id;
        if (!portfolioId) {
          return new Response(
            JSON.stringify(createErrorResponse('INVALID_REQUEST', 'portfolio_id required for recommend action', 'roomsonline' as any, 'experience-engine')),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: members } = await supabase
          .from('property_portfolio_members')
          .select('property_id')
          .eq('portfolio_id', portfolioId);

        const propIds = (members || []).map((m: any) => m.property_id);
        if (propIds.length === 0) {
          result = { semantic_groups: [], bundles: [], featured: null };
        } else {
          const { data: props } = await supabase
            .from('properties')
            .select('id, name, slug, city, country, description, property_type, amenities, brand_primary_color')
            .eq('is_active', true)
            .in('id', propIds);

          const { data: rooms } = await supabase
            .from('hostfully_room_types')
            .select('property_id, name, daily_rate, max_guests')
            .eq('is_active', true)
            .in('property_id', propIds);

          const roomsByProp: Record<string, any[]> = {};
          (rooms || []).forEach((r: any) => {
            if (!roomsByProp[r.property_id]) roomsByProp[r.property_id] = [];
            roomsByProp[r.property_id].push({ name: r.name, rate: r.daily_rate, max_guests: r.max_guests });
          });

          const propSummaries = (props || []).map((p: any) => ({
            slug: p.slug,
            name: p.name,
            city: p.city,
            country: p.country,
            type: p.property_type,
            description: p.description?.substring(0, 200),
            rooms: roomsByProp[p.id] || [],
          }));

          const config = await resolveExperienceConfig(supabase, property_id, 'portfolio');
          const themeGuidance = payload?.theme || (config as any)?.theme || '';
          const systemPrompt = (config as any)?.system_prompt ||
            `You are a travel portfolio curator. Given a list of properties, group them into semantic themes, suggest multi-property bundles, and pick a featured property.${themeGuidance ? ` Focus on: ${themeGuidance}` : ''}`;
          const model = (config as any)?.model || 'google/gemini-3-flash-preview';

          let aiResult: any = { semantic_groups: [], bundles: [], featured: null };
          try {
            const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
            if (LOVABLE_API_KEY && propSummaries.length > 0) {
              const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${LOVABLE_API_KEY}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model,
                  messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Properties:\n${JSON.stringify(propSummaries)}\n\nGroup these properties into themes, suggest bundles, and pick a featured property.` },
                  ],
                  tools: [{
                    type: 'function',
                    function: {
                      name: 'portfolio_recommendations',
                      description: 'Return portfolio groupings, bundles, and featured property',
                      parameters: {
                        type: 'object',
                        properties: {
                          semantic_groups: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                group_name: { type: 'string' },
                                property_slugs: { type: 'array', items: { type: 'string' } },
                                description: { type: 'string' },
                              },
                              required: ['group_name', 'property_slugs', 'description'],
                            },
                          },
                          bundles: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                bundle_name: { type: 'string' },
                                property_slugs: { type: 'array', items: { type: 'string' } },
                                pitch: { type: 'string' },
                              },
                              required: ['bundle_name', 'property_slugs', 'pitch'],
                            },
                          },
                          featured: {
                            type: 'object',
                            properties: {
                              property_slug: { type: 'string' },
                              reason: { type: 'string' },
                            },
                            required: ['property_slug', 'reason'],
                          },
                        },
                        required: ['semantic_groups', 'bundles', 'featured'],
                      },
                    },
                  }],
                  tool_choice: { type: 'function', function: { name: 'portfolio_recommendations' } },
                }),
              });

              if (aiResponse.ok) {
                const aiData = await aiResponse.json();
                const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
                if (toolCall?.function?.arguments) {
                  aiResult = JSON.parse(toolCall.function.arguments);
                }
              } else if (aiResponse.status === 429) {
                console.warn('AI rate limited for portfolio recommend');
              } else if (aiResponse.status === 402) {
                console.warn('AI credits exhausted for portfolio recommend');
              }
            }
          } catch (aiErr) {
            console.warn('AI portfolio recommend failed:', aiErr);
          }

          result = aiResult;
        }

      } else if (action === 'search') {
        const query = payload?.query;
        const portfolioId = payload?.portfolio_id;
        if (!query || !portfolioId) {
          return new Response(
            JSON.stringify(createErrorResponse('INVALID_REQUEST', 'query and portfolio_id required for search', 'roomsonline' as any, 'experience-engine')),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: members } = await supabase
          .from('property_portfolio_members')
          .select('property_id')
          .eq('portfolio_id', portfolioId);

        const propIds = (members || []).map((m: any) => m.property_id);

        const { data: props } = await supabase
          .from('properties')
          .select('id, name, slug, city, description, amenities')
          .eq('is_active', true)
          .in('id', propIds);

        let results: any[] = [];
        try {
          const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
          if (LOVABLE_API_KEY && (props || []).length > 0) {
            const propList = (props || []).map((p: any) => ({
              slug: p.slug, name: p.name, city: p.city, description: p.description?.substring(0, 150),
            }));

            const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${LOVABLE_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'google/gemini-3-flash-preview',
                messages: [
                  { role: 'system', content: 'You are a property search assistant. Score each property against the query on a 0-100 scale. Only return properties with score > 30.' },
                  { role: 'user', content: `Query: "${query}"\n\nProperties:\n${JSON.stringify(propList)}` },
                ],
                tools: [{
                  type: 'function',
                  function: {
                    name: 'rank_properties',
                    description: 'Return ranked property matches',
                    parameters: {
                      type: 'object',
                      properties: {
                        results: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              slug: { type: 'string' },
                              name: { type: 'string' },
                              score: { type: 'number' },
                              reason: { type: 'string' },
                            },
                            required: ['slug', 'name', 'score', 'reason'],
                          },
                        },
                      },
                      required: ['results'],
                    },
                  },
                }],
                tool_choice: { type: 'function', function: { name: 'rank_properties' } },
              }),
            });

            if (aiResponse.ok) {
              const aiData = await aiResponse.json();
              const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
              if (toolCall?.function?.arguments) {
                const parsed = JSON.parse(toolCall.function.arguments);
                results = (parsed.results || []).sort((a: any, b: any) => b.score - a.score);
              }
            }
          }
        } catch (aiErr) {
          console.warn('AI portfolio search failed:', aiErr);
        }

        result = { results };

      } else {
        const config = await resolveExperienceConfig(supabase, property_id, 'portfolio');
        result = { config, experience_type };
      }
    } else if (experience_type === 'guest_portal') {
      const action = payload?.action;

      if (action === 'alternatives') {
        // AI-powered save attempt — suggest alternatives before cancellation
        const bookingId = payload?.booking_id;
        const checkInDate = payload?.check_in_date;
        const checkOutDate = payload?.check_out_date;
        const totalPrice = payload?.total_price || 0;
        const guestName = payload?.guest_name || 'Guest';

        // Fetch property info
        const { data: prop } = await supabase
          .from('properties')
          .select('name, city, country, property_type')
          .eq('id', property_id)
          .single();

        // Fetch nearby availability
        const checkIn = new Date(checkInDate);
        const altStart = new Date(checkIn.getTime() - 7 * 86400000).toISOString().split('T')[0];
        const altEnd = new Date(checkIn.getTime() + 14 * 86400000).toISOString().split('T')[0];

        const { data: availData } = await supabase
          .from('property_availability')
          .select('date, available_units, rate_override')
          .eq('property_id', property_id)
          .gte('date', altStart)
          .lte('date', altEnd)
          .eq('is_stop_sell', false)
          .gt('available_units', 0)
          .order('date');

        let alternatives: unknown[] = [];
        let saveMessage = '';

        try {
          const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
          if (LOVABLE_API_KEY) {
            const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${LOVABLE_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'google/gemini-3-flash-preview',
                messages: [
                  {
                    role: 'system',
                    content: `You are a guest retention assistant for ${prop?.name || 'a hotel'}. A guest is about to cancel their booking. Suggest 2-3 alternatives to save the booking. Be empathetic and concise. Consider: date changes to nearby available dates, shorter stays, or future credits. Each alternative should have type (date_change/shorter_stay/credit), title, description, and optional savings text.`,
                  },
                  {
                    role: 'user',
                    content: `Guest "${guestName}" wants to cancel:\n- Check-in: ${checkInDate}\n- Check-out: ${checkOutDate}\n- Total: R${totalPrice}\n- Property: ${prop?.name} in ${prop?.city}\n\nNearby available dates:\n${JSON.stringify((availData || []).slice(0, 20))}\n\nSuggest alternatives.`,
                  },
                ],
                tools: [{
                  type: 'function',
                  function: {
                    name: 'suggest_alternatives',
                    description: 'Return cancellation alternatives and a save message',
                    parameters: {
                      type: 'object',
                      properties: {
                        save_message: { type: 'string', description: 'Empathetic message shown above alternatives' },
                        alternatives: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              type: { type: 'string', enum: ['date_change', 'shorter_stay', 'credit'] },
                              title: { type: 'string' },
                              description: { type: 'string' },
                              savings: { type: 'string' },
                            },
                            required: ['type', 'title', 'description'],
                          },
                        },
                      },
                      required: ['save_message', 'alternatives'],
                    },
                  },
                }],
                tool_choice: { type: 'function', function: { name: 'suggest_alternatives' } },
              }),
            });

            if (aiResponse.ok) {
              const aiData = await aiResponse.json();
              const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
              if (toolCall?.function?.arguments) {
                const parsed = JSON.parse(toolCall.function.arguments);
                alternatives = parsed.alternatives || [];
                saveMessage = parsed.save_message || '';
              }
            }
          }
        } catch (aiErr) {
          console.warn('AI alternatives failed:', aiErr);
        }

        result = { alternatives, save_message: saveMessage };

      } else if (action === 'resolve') {
        const config = await resolveExperienceConfig(supabase, property_id, 'guest_portal');
        result = { config, experience_type };
      } else {
        const config = await resolveExperienceConfig(supabase, property_id, 'guest_portal');
        result = { config, experience_type };
      }
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
