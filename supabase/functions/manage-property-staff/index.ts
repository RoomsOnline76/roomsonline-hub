import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate caller
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const action = body.action || body.actionType;
    const propertyId = body.property_id || body.propertyId;

    if (!propertyId) {
      return new Response(JSON.stringify({ error: 'property_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Authorization check: caller must be admin/dev OR property owner
    const { data: callerRoles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id);
    
    const isAdminOrDev = callerRoles?.some(r => r.role === 'admin' || r.role === 'dev');

    if (!isAdminOrDev) {
      // Check if caller is property owner
      const { data: isOwner } = await supabaseAdmin.rpc('is_property_owner', {
        _property_id: propertyId, _user_id: caller.id,
      });
      const { data: isLinked } = await supabaseAdmin.rpc('is_linked_owner', {
        _property_id: propertyId, _user_id: caller.id,
      });
      // Also check if caller is property_owner/general_manager staff
      const { data: callerStaff } = await supabaseAdmin
        .from('property_staff')
        .select('staff_role')
        .eq('property_id', propertyId)
        .eq('user_id', caller.id)
        .eq('is_active', true)
        .maybeSingle();
      
      const isStaffOwner = callerStaff?.staff_role === 'property_owner' || callerStaff?.staff_role === 'general_manager';

      if (!isOwner && !isLinked && !isStaffOwner) {
        return new Response(JSON.stringify({ error: 'Forbidden: not a property owner' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ─── ACTION: CREATE ───
    if (action === 'create') {
      const email = (body.email || '').trim().toLowerCase();
      const fullName = (body.full_name || body.fullName || '').trim();
      const password = body.password || '';
      const staffRole = body.staff_role || body.staffRole || 'front_desk';
      const displayName = body.display_name || body.displayName || fullName;

      if (!email || !password || !fullName) {
        return new Response(JSON.stringify({ error: 'email, full_name, and password are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (password.length < 8) {
        return new Response(JSON.stringify({ error: 'Password must be at least 8 characters' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if user already exists
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === email);

      let userId: string;

      if (existingUser) {
        userId = existingUser.id;
        // Check if already staff for this property
        const { data: existingStaff } = await supabaseAdmin
          .from('property_staff')
          .select('id')
          .eq('property_id', propertyId)
          .eq('user_id', userId)
          .maybeSingle();
        
        if (existingStaff) {
          return new Response(JSON.stringify({ error: 'User is already staff for this property' }), {
            status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } else {
        // Create new auth user with email confirmed
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });

        if (createError) {
          return new Response(JSON.stringify({ error: createError.message }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        userId = newUser.user.id;

        // Ensure user role exists
        await supabaseAdmin.from('user_roles').upsert(
          { user_id: userId, role: 'user' },
          { onConflict: 'user_id,role' }
        );
      }

      // Create property_staff record
      const { data: staffRecord, error: staffError } = await supabaseAdmin
        .from('property_staff')
        .insert({
          property_id: propertyId,
          user_id: userId,
          staff_role: staffRole,
          display_name: displayName,
          email: email,
          must_change_password: true,
          invited_by: caller.id,
        })
        .select()
        .single();

      if (staffError) {
        return new Response(JSON.stringify({ error: staffError.message }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true, staff: staffRecord }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── ACTION: RESET-PASSWORD ───
    if (action === 'reset-password') {
      const staffId = body.staff_id || body.staffId;
      const newPassword = body.password || body.new_password || body.newPassword;

      if (!staffId || !newPassword) {
        return new Response(JSON.stringify({ error: 'staff_id and password are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (newPassword.length < 8) {
        return new Response(JSON.stringify({ error: 'Password must be at least 8 characters' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get staff record
      const { data: staff, error: staffErr } = await supabaseAdmin
        .from('property_staff')
        .select('user_id, property_id')
        .eq('id', staffId)
        .eq('property_id', propertyId)
        .single();

      if (staffErr || !staff) {
        return new Response(JSON.stringify({ error: 'Staff member not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Reset password
      const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(staff.user_id, {
        password: newPassword,
      });

      if (pwErr) {
        return new Response(JSON.stringify({ error: pwErr.message }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Set must_change_password
      await supabaseAdmin
        .from('property_staff')
        .update({ must_change_password: true })
        .eq('id', staffId);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── ACTION: DEACTIVATE ───
    if (action === 'deactivate' || action === 'activate') {
      const staffId = body.staff_id || body.staffId;
      const isActive = action === 'activate';

      if (!staffId) {
        return new Response(JSON.stringify({ error: 'staff_id is required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error: updateErr } = await supabaseAdmin
        .from('property_staff')
        .update({ is_active: isActive })
        .eq('id', staffId)
        .eq('property_id', propertyId);

      if (updateErr) {
        return new Response(JSON.stringify({ error: updateErr.message }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── ACTION: UPDATE-ROLE ───
    if (action === 'update-role') {
      const staffId = body.staff_id || body.staffId;
      const newRole = body.staff_role || body.staffRole;

      if (!staffId || !newRole) {
        return new Response(JSON.stringify({ error: 'staff_id and staff_role are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error: updateErr } = await supabaseAdmin
        .from('property_staff')
        .update({ staff_role: newRole })
        .eq('id', staffId)
        .eq('property_id', propertyId);

      if (updateErr) {
        return new Response(JSON.stringify({ error: updateErr.message }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('manage-property-staff error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
