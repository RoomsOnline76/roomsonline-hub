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
  // Hostfully-specific fields
  hostfully_api_key: z.string().optional(),
  hostfully_environment: z.enum(["production", "sandbox"]).optional(),
  hostfully_agency_uid: z.string().optional(),
  selected_property_uids: z.array(z.string()).optional(),
  hostfully_owner_will_provide: z.boolean().optional(), // Owner will provide key on first login
});

// Hostfully API helper
async function fetchHostfullyPropertyDetails(
  apiKey: string,
  environment: string,
  propertyUid: string
): Promise<any> {
  const baseUrl = environment === "sandbox"
    ? "https://sandbox.hostfully.com/api/v3"
    : "https://api.hostfully.com/api/v3";

  const response = await fetch(`${baseUrl}/properties/${propertyUid}`, {
    headers: {
      "X-HOSTFULLY-APIKEY": apiKey,
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    console.error(`Failed to fetch Hostfully property ${propertyUid}:`, response.status);
    return null;
  }

  return response.json();
}

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
      hostfully_api_key,
      hostfully_environment,
      hostfully_agency_uid,
      selected_property_uids,
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
    let hostfullyCredentialId: string | null = null;
    
    if (role === 'user' && pms_systems && pms_systems.length > 0) {
      for (const systemType of pms_systems) {
        const credentialData: Record<string, any> = {
          owner_id: userId,
          system_type: systemType,
          sync_status: 'pending',
          is_active: true,
        };

        // Add Hostfully-specific data if provided
        if (systemType === 'hostfully' && hostfully_api_key) {
          credentialData.api_key = hostfully_api_key;
          credentialData.environment = hostfully_environment || 'production';
          credentialData.external_account_id = hostfully_agency_uid;
          credentialData.sync_status = 'connected';
        }

        const { data: credData, error: pmsError } = await supabaseAdmin
          .from('owner_pms_credentials')
          .upsert(credentialData, {
            onConflict: 'owner_id,system_type'
          })
          .select('id')
          .single();

        if (pmsError) {
          console.error(`Failed to create PMS credential for ${systemType}:`, pmsError);
        } else if (systemType === 'hostfully') {
          hostfullyCredentialId = credData.id;
        }
      }
    }

    // Create properties from selected Hostfully listings
    let propertiesCreated = 0;
    
    if (
      role === 'user' && 
      hostfully_api_key && 
      hostfully_environment && 
      selected_property_uids && 
      selected_property_uids.length > 0 &&
      hostfullyCredentialId
    ) {
      console.log(`Creating ${selected_property_uids.length} properties from Hostfully`);

      for (const propertyUid of selected_property_uids) {
        try {
          // Fetch property details from Hostfully
          const propertyDetails = await fetchHostfullyPropertyDetails(
            hostfully_api_key,
            hostfully_environment,
            propertyUid
          );

          if (!propertyDetails) {
            console.error(`Failed to fetch details for property ${propertyUid}, skipping`);
            continue;
          }

          // Create property in database
          const { error: propError } = await supabaseAdmin
            .from('properties')
            .insert({
              name: propertyDetails.name || `Property ${propertyUid.slice(0, 8)}`,
              description: propertyDetails.description || null,
              address: propertyDetails.address1 || propertyDetails.streetAddress || 'Address TBD',
              city: propertyDetails.city || 'Unknown',
              country: propertyDetails.countryCode || propertyDetails.country || 'Unknown',
              property_type: propertyDetails.type || propertyDetails.propertyType || 'property',
              bedrooms: propertyDetails.bedrooms || null,
              bathrooms: propertyDetails.bathrooms || null,
              max_guests: propertyDetails.maxGuests || 2,
              price_per_night: propertyDetails.baseDailyRate || 0,
              images: propertyDetails.pictureLink ? [propertyDetails.pictureLink] : null,
              latitude: propertyDetails.latitude || null,
              longitude: propertyDetails.longitude || null,
              // Owner information
              owner_name: full_name,
              owner_email: email,
              owner_pms_credential_id: hostfullyCredentialId,
              // External system info
              external_system: 'hostfully',
              external_id: propertyUid,
              hostfully_property_uid: propertyUid,
              external_metadata: propertyDetails,
              pms_managed_fields: ['availability', 'rates', 'max_guests', 'bedrooms', 'bathrooms'],
              pms_sync_status: 'synced',
              last_pms_sync_at: new Date().toISOString(),
              // Start inactive until reviewed
              is_active: false,
            });

          if (propError) {
            console.error(`Failed to create property ${propertyUid}:`, propError);
          } else {
            propertiesCreated++;
            console.log(`Created property: ${propertyDetails.name}`);
          }
        } catch (err) {
          console.error(`Error processing property ${propertyUid}:`, err);
        }
      }

      // Update credential with listing info
      if (propertiesCreated > 0) {
        await supabaseAdmin
          .from('owner_pms_credentials')
          .update({
            last_sync_at: new Date().toISOString(),
            sync_status: 'connected',
          })
          .eq('id', hostfullyCredentialId);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        properties_created: propertiesCreated,
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
