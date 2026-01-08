import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const requestSchema = z.object({
  email: z.string().trim().email("Invalid email address").max(255, "Email too long"),
  full_name: z.string().trim().min(1, "Name is required").max(100, "Name too long"),
  role: z.enum(["admin", "user"], { errorMap: () => ({ message: "Role must be admin or user" }) }),
  pms_systems: z.array(z.string()).optional(),
  // Hostfully-specific fields - now only Agency UID (owner provides API key on first login)
  hostfully_agency_uid: z.string().optional(),
  hostfully_owner_will_provide: z.boolean().optional(), // Owner will provide all details on first login
});


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Create Supabase client with service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get the requesting user
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Check if requesting user is admin or dev
    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'dev']);

    if (!roleData || roleData.length === 0) {
      throw new Error('Only admins can create users');
    }

    // Get and validate request body
    const body = await req.json();
    
    const validationResult = requestSchema.safeParse(body);
    if (!validationResult.success) {
      console.error("Validation failed:", validationResult.error);
      throw new Error('Missing required fields');
    }
    
    const { 
      email, 
      full_name, 
      role, 
      pms_systems,
      hostfully_agency_uid,
      hostfully_owner_will_provide,
    } = validationResult.data;

    // Check if user already exists in auth
    const { data: { users: existingAuthUsers } } = await supabaseAdmin.auth.admin.listUsers();
    const existingAuthUser = existingAuthUsers.find(u => u.email === email);

    let userId: string;
    
    if (existingAuthUser) {
      // User exists in auth, check if they have profile and role
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('id', existingAuthUser.id)
        .maybeSingle();

      const { data: existingRole } = await supabaseAdmin
        .from('user_roles')
        .select('id')
        .eq('user_id', existingAuthUser.id)
        .eq('role', role)
        .maybeSingle();

      if (existingProfile && existingRole) {
        throw new Error('User with this email already exists and is fully set up');
      }

      // User exists in auth but missing profile/role, we'll add them
      console.log('User exists in auth, creating missing profile/role');
      userId = existingAuthUser.id;
    } else {
      // Create new user with admin client
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          full_name,
        },
      });

      if (createError) throw createError;
      userId = newUser.user.id;
    }

    // Create or update profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: userId,
        email,
        full_name,
      }, {
        onConflict: 'id'
      });

    if (profileError) throw profileError;

    // Create or update role
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .upsert({
        user_id: userId,
        role,
      }, {
        onConflict: 'user_id,role'
      });

    if (roleError) throw roleError;

    // Create PMS credentials for owners if PMS systems were selected
    if (role === 'user' && pms_systems && pms_systems.length > 0) {
      for (const systemType of pms_systems) {
        const credentialData: Record<string, unknown> = {
          owner_id: userId,
          system_type: systemType,
          sync_status: 'pending',
          is_active: true,
        };

        // Add Hostfully-specific data if Agency UID provided
        // Owner will provide their API key on first login
        if (systemType === 'hostfully' && hostfully_agency_uid) {
          credentialData.external_account_id = hostfully_agency_uid;
          credentialData.sync_status = 'pending_key'; // Awaiting owner to provide API key
        }

        // Insert new credential (new unique constraint allows multiple of same type if external_account_id differs)
        const { error: pmsError } = await supabaseAdmin
          .from('owner_pms_credentials')
          .insert(credentialData);

        if (pmsError) {
          // If duplicate, log and continue (owner already has this PMS connection)
          if (pmsError.code === '23505') {
            console.log(`PMS credential for ${systemType} already exists for user ${userId}`);
          } else {
            console.error(`Failed to create PMS credential for ${systemType}:`, pmsError);
          }
        }
      }
    }

    // Properties will be imported when owner provides API key during onboarding
    // No property creation at user creation time

    return new Response(
      JSON.stringify({ 
        success: true,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error creating user:', error);
    
    // Only expose safe, user-friendly error messages - never internal details
    const safeErrors = [
      'Missing required fields',
      'Invalid role',
      'Unauthorized',
      'Only admins can create users',
      'User with this email already exists and is fully set up'
    ];
    
    let errorMessage = 'An error occurred creating the user';
    if (error instanceof Error && safeErrors.includes(error.message)) {
      errorMessage = error.message;
    }
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
