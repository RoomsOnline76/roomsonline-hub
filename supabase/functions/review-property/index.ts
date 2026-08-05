import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReviewRequest {
  property_id: string;
  action: 'approve' | 'reject' | 'request_fixes' | 'override';
  reviewer_id?: string;
  reason?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request
    const { property_id, action, reviewer_id, reason }: ReviewRequest = await req.json();

    if (!property_id || !action) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing property_id or action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[review-property] Processing ${action} for property ${property_id}`);

    // Fetch property details
    const { data: property, error: propertyError } = await supabase
      .from('properties')
      .select('id, name, owner_email, owner_name, listing_status')
      .eq('id', property_id)
      .single();

    if (propertyError || !property) {
      console.error('[review-property] Property not found:', propertyError);
      return new Response(
        JSON.stringify({ success: false, error: 'Property not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get reviewer email
    let reviewerEmail = 'system@roomsonline.com';
    if (reviewer_id) {
      const { data: reviewer } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', reviewer_id)
        .single();
      if (reviewer?.email) {
        reviewerEmail = reviewer.email;
      }
    }

    let newStatus: string;
    let activated = false;
    let notifyOwner = false;
    let notificationSubject = '';
    let notificationMessage = '';

    switch (action) {
      case 'approve': {
        // Run quality gate check first
        const qualityResponse = await supabase.functions.invoke('check-activation-readiness', {
          body: { property_id }
        });

        const qualityResult = qualityResponse.data;
        
        if (qualityResult?.passed) {
          // Quality gate passed - mark as live
          newStatus = 'live';
          activated = true;
          
          // Update property to live
          const { error: updateError } = await supabase
            .from('properties')
            .update({
              listing_status: 'live',
              show_on_website: true,
              activated_at: new Date().toISOString(),
              activated_by: reviewer_id,
            })
            .eq('id', property_id);

          if (updateError) {
            console.error('[review-property] Update error:', updateError);
            throw updateError;
          }

          // Log activation
          await supabase.from('property_activation_logs').insert({
            property_id,
            activated_at: new Date().toISOString(),
            activated_by: reviewer_id,
            pre_activation_score: qualityResult.score,
            quality_gate_results: qualityResult,
          });

          notifyOwner = true;
          notificationSubject = `🎉 Your property "${property.name}" is now live!`;
          notificationMessage = `Great news! Your property has been approved and is now visible on RoomsOnline. Guests can start booking immediately.`;
        } else {
          // Quality gate failed but admin approved - mark as activation_ready
          newStatus = 'activation_ready';
          
          const { error: updateError } = await supabase
            .from('properties')
            .update({ listing_status: 'activation_ready' })
            .eq('id', property_id);

          if (updateError) {
            console.error('[review-property] Update error:', updateError);
            throw updateError;
          }

          notifyOwner = true;
          notificationSubject = `Your property "${property.name}" is approved!`;
          notificationMessage = `Your property has been approved by our team. There are a few remaining quality checks before it goes live. We'll notify you once it's fully activated.`;
        }
        break;
      }

      case 'reject': {
        newStatus = 'rejected';
        
        const { error: updateError } = await supabase
          .from('properties')
          .update({ listing_status: 'rejected' })
          .eq('id', property_id);

        if (updateError) {
          console.error('[review-property] Update error:', updateError);
          throw updateError;
        }

        // Log rejection reason
        await supabase.from('property_activation_logs').insert({
          property_id,
          activated_at: new Date().toISOString(),
          activated_by: reviewer_id,
          quality_gate_results: { action: 'rejected', reason },
        });

        notifyOwner = true;
        notificationSubject = `Update on your property "${property.name}"`;
        notificationMessage = `We regret to inform you that your property listing could not be approved at this time.\n\nReason: ${reason}\n\nIf you believe this was in error or would like to discuss, please contact our team.`;
        break;
      }

      case 'request_fixes': {
        newStatus = 'onboarding_active';
        
        const { error: updateError } = await supabase
          .from('properties')
          .update({ listing_status: 'onboarding_active' })
          .eq('id', property_id);

        if (updateError) {
          console.error('[review-property] Update error:', updateError);
          throw updateError;
        }

        // Log the request
        await supabase.from('property_activation_logs').insert({
          property_id,
          activated_at: new Date().toISOString(),
          activated_by: reviewer_id,
          quality_gate_results: { action: 'request_fixes', reason },
        });

        notifyOwner = true;
        notificationSubject = `Action needed for "${property.name}"`;
        notificationMessage = `Our team has reviewed your property and identified some items that need attention before we can approve your listing.\n\n${reason}\n\nPlease log in to your dashboard to make these updates.`;
        break;
      }

      case 'override': {
        newStatus = 'activation_ready';
        
        const { error: updateError } = await supabase
          .from('properties')
          .update({ listing_status: 'activation_ready' })
          .eq('id', property_id);

        if (updateError) {
          console.error('[review-property] Update error:', updateError);
          throw updateError;
        }

        // Log override with reason
        await supabase.from('property_activation_logs').insert({
          property_id,
          activated_at: new Date().toISOString(),
          activated_by: reviewer_id,
          quality_gate_results: { 
            action: 'admin_override', 
            reason,
            override_by: reviewerEmail,
          },
        });
        break;
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // Send notification email if needed
    if (notifyOwner && property.owner_email) {
      const resendApiKey = Deno.env.get('RESEND_API_KEY');
      if (resendApiKey) {
        try {
          const emailResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'RoomsOnline <notifications@roomsonline.co.za>',
              to: property.owner_email,
              subject: notificationSubject,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #333;">Hello ${property.owner_name || 'Property Owner'},</h2>
                  <p style="color: #555; line-height: 1.6;">${notificationMessage.replace(/\n/g, '<br>')}</p>
                  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
                  <p style="color: #999; font-size: 12px;">
                    This email was sent by the RoomsOnline team.<br>
                    <a href="https://sleepinafrica.roomsonline.co.za" style="color: #0066cc;">Visit Dashboard</a>
                  </p>
                </div>
              `,
            }),
          });

          if (!emailResponse.ok) {
            console.error('[review-property] Email send failed:', await emailResponse.text());
          } else {
            console.log('[review-property] Notification email sent to:', property.owner_email);
          }
        } catch (emailError) {
          console.error('[review-property] Email error:', emailError);
          // Don't fail the whole operation for email issues
        }
      }
    }

    console.log(`[review-property] ${action} completed - new status: ${newStatus}`);

    return new Response(
      JSON.stringify({
        success: true,
        action,
        new_status: newStatus,
        activated,
        notified: notifyOwner,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('[review-property] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
