export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      access_requests: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          message: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_required: boolean | null
          key_name: string
          key_value: string | null
          name: string
          system_type: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_required?: boolean | null
          key_name: string
          key_value?: string | null
          name: string
          system_type?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_required?: boolean | null
          key_name?: string
          key_value?: string | null
          name?: string
          system_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      booking_sync_status: {
        Row: {
          booking_id: string
          created_at: string | null
          error_message: string | null
          external_booking_id: string | null
          external_system: string
          id: string
          last_sync_at: string | null
          sync_attempts: number | null
          sync_status: string
          updated_at: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string | null
          error_message?: string | null
          external_booking_id?: string | null
          external_system: string
          id?: string
          last_sync_at?: string | null
          sync_attempts?: number | null
          sync_status?: string
          updated_at?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string | null
          error_message?: string | null
          external_booking_id?: string | null
          external_system?: string
          id?: string
          last_sync_at?: string | null
          sync_attempts?: number | null
          sync_status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_sync_status_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          adults: number
          check_in_date: string
          check_out_date: string
          children: number | null
          created_at: string | null
          external_reservation_id: string | null
          guest_email: string
          guest_name: string
          guest_phone: string | null
          id: string
          infants: number | null
          payment_intent_id: string | null
          property_id: string
          rate_type_id: string | null
          room_type_id: string | null
          rooms: Json | null
          special_requests: string | null
          status: string
          teens: number | null
          total_price: number
          updated_at: string | null
          user_id: string | null
          voucher: string | null
        }
        Insert: {
          adults?: number
          check_in_date: string
          check_out_date: string
          children?: number | null
          created_at?: string | null
          external_reservation_id?: string | null
          guest_email: string
          guest_name: string
          guest_phone?: string | null
          id?: string
          infants?: number | null
          payment_intent_id?: string | null
          property_id: string
          rate_type_id?: string | null
          room_type_id?: string | null
          rooms?: Json | null
          special_requests?: string | null
          status?: string
          teens?: number | null
          total_price: number
          updated_at?: string | null
          user_id?: string | null
          voucher?: string | null
        }
        Update: {
          adults?: number
          check_in_date?: string
          check_out_date?: string
          children?: number | null
          created_at?: string | null
          external_reservation_id?: string | null
          guest_email?: string
          guest_name?: string
          guest_phone?: string | null
          id?: string
          infants?: number | null
          payment_intent_id?: string | null
          property_id?: string
          rate_type_id?: string | null
          room_type_id?: string | null
          rooms?: Json | null
          special_requests?: string | null
          status?: string
          teens?: number | null
          total_price?: number
          updated_at?: string | null
          user_id?: string | null
          voucher?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      checkfront_connections: {
        Row: {
          access_token: string | null
          auth_mode: string
          created_at: string
          expires_at: string | null
          host: string
          id: string
          last_synced_at: string | null
          oauth_client_id: string | null
          oauth_scope: string | null
          property_id: string
          refresh_token: string | null
          token_type: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          auth_mode?: string
          created_at?: string
          expires_at?: string | null
          host: string
          id?: string
          last_synced_at?: string | null
          oauth_client_id?: string | null
          oauth_scope?: string | null
          property_id: string
          refresh_token?: string | null
          token_type?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          auth_mode?: string
          created_at?: string
          expires_at?: string | null
          host?: string
          id?: string
          last_synced_at?: string | null
          oauth_client_id?: string | null
          oauth_scope?: string | null
          property_id?: string
          refresh_token?: string | null
          token_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkfront_connections_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkfront_connections_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_type_suggestions: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      pms_availability_cache: {
        Row: {
          available_units: number | null
          created_at: string | null
          date: string
          external_room_type_id: string
          fetched_at: string | null
          id: string
          property_id: string | null
          rates: Json | null
          raw_data: Json | null
          restrictions: Json | null
          source_timestamp: string | null
          system_type: string
          updated_at: string | null
        }
        Insert: {
          available_units?: number | null
          created_at?: string | null
          date: string
          external_room_type_id: string
          fetched_at?: string | null
          id?: string
          property_id?: string | null
          rates?: Json | null
          raw_data?: Json | null
          restrictions?: Json | null
          source_timestamp?: string | null
          system_type: string
          updated_at?: string | null
        }
        Update: {
          available_units?: number | null
          created_at?: string | null
          date?: string
          external_room_type_id?: string
          fetched_at?: string | null
          id?: string
          property_id?: string | null
          rates?: Json | null
          raw_data?: Json | null
          restrictions?: Json | null
          source_timestamp?: string | null
          system_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pms_availability_cache_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_availability_cache_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_credentials: {
        Row: {
          agent_code: string | null
          api_key: string | null
          base_url: string | null
          capabilities: Json | null
          created_at: string | null
          environment: string
          id: string
          is_active: boolean | null
          password: string | null
          property_code: string | null
          property_name: string | null
          refresh_interval_minutes: number | null
          system_type: string
          updated_at: string | null
          username: string | null
        }
        Insert: {
          agent_code?: string | null
          api_key?: string | null
          base_url?: string | null
          capabilities?: Json | null
          created_at?: string | null
          environment?: string
          id?: string
          is_active?: boolean | null
          password?: string | null
          property_code?: string | null
          property_name?: string | null
          refresh_interval_minutes?: number | null
          system_type: string
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          agent_code?: string | null
          api_key?: string | null
          base_url?: string | null
          capabilities?: Json | null
          created_at?: string | null
          environment?: string
          id?: string
          is_active?: boolean | null
          password?: string | null
          property_code?: string | null
          property_name?: string | null
          refresh_interval_minutes?: number | null
          system_type?: string
          updated_at?: string | null
          username?: string | null
        }
        Relationships: []
      }
      pms_mappings: {
        Row: {
          created_at: string | null
          external_id: string
          external_name: string | null
          id: string
          internal_id: string | null
          internal_name: string | null
          is_active: boolean | null
          mapping_type: string
          metadata: Json | null
          property_id: string | null
          system_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          external_id: string
          external_name?: string | null
          id?: string
          internal_id?: string | null
          internal_name?: string | null
          is_active?: boolean | null
          mapping_type: string
          metadata?: Json | null
          property_id?: string | null
          system_type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          external_id?: string
          external_name?: string | null
          id?: string
          internal_id?: string | null
          internal_name?: string | null
          is_active?: boolean | null
          mapping_type?: string
          metadata?: Json | null
          property_id?: string | null
          system_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pms_mappings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_mappings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_rate_types_cache: {
        Row: {
          created_at: string | null
          description: string | null
          external_rate_type_id: string
          fetched_at: string | null
          id: string
          max_advance_days: number | null
          max_stay_days: number | null
          min_advance_days: number | null
          min_stay_days: number | null
          name: string
          price_type: string | null
          property_id: string
          raw_data: Json | null
          system_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          external_rate_type_id: string
          fetched_at?: string | null
          id?: string
          max_advance_days?: number | null
          max_stay_days?: number | null
          min_advance_days?: number | null
          min_stay_days?: number | null
          name: string
          price_type?: string | null
          property_id: string
          raw_data?: Json | null
          system_type?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          external_rate_type_id?: string
          fetched_at?: string | null
          id?: string
          max_advance_days?: number | null
          max_stay_days?: number | null
          min_advance_days?: number | null
          min_stay_days?: number | null
          name?: string
          price_type?: string | null
          property_id?: string
          raw_data?: Json | null
          system_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pms_rate_types_cache_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_rate_types_cache_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_reservations: {
        Row: {
          arrival_date: string
          cancellation: Json | null
          cancellation_date: string | null
          cancellation_reason: string | null
          cancellation_user_name: string | null
          charges: Json | null
          consultant_contact_number: string | null
          consultant_email: string | null
          consultant_name: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          create_date: string | null
          create_user_name: string | null
          created_at: string | null
          currency: string | null
          departure_date: string
          external_reservation_id: string
          guarantee: Json | null
          guest_nationality: string | null
          guests: Json | null
          id: string
          is_property_tax_inclusive: boolean | null
          link_id: string | null
          number_of_guests: number | null
          number_of_rooms: number | null
          originating_agent: Json | null
          payments: Json | null
          property_id: string | null
          rate_type_name: string | null
          raw_data: Json | null
          reservation_name: string | null
          reservation_voucher: string | null
          responsible_client: Json | null
          rooms: Json | null
          status: string | null
          status_at_time_of_cancellation: string | null
          synced_at: string | null
          system_type: string
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          arrival_date: string
          cancellation?: Json | null
          cancellation_date?: string | null
          cancellation_reason?: string | null
          cancellation_user_name?: string | null
          charges?: Json | null
          consultant_contact_number?: string | null
          consultant_email?: string | null
          consultant_name?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          create_date?: string | null
          create_user_name?: string | null
          created_at?: string | null
          currency?: string | null
          departure_date: string
          external_reservation_id: string
          guarantee?: Json | null
          guest_nationality?: string | null
          guests?: Json | null
          id?: string
          is_property_tax_inclusive?: boolean | null
          link_id?: string | null
          number_of_guests?: number | null
          number_of_rooms?: number | null
          originating_agent?: Json | null
          payments?: Json | null
          property_id?: string | null
          rate_type_name?: string | null
          raw_data?: Json | null
          reservation_name?: string | null
          reservation_voucher?: string | null
          responsible_client?: Json | null
          rooms?: Json | null
          status?: string | null
          status_at_time_of_cancellation?: string | null
          synced_at?: string | null
          system_type: string
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          arrival_date?: string
          cancellation?: Json | null
          cancellation_date?: string | null
          cancellation_reason?: string | null
          cancellation_user_name?: string | null
          charges?: Json | null
          consultant_contact_number?: string | null
          consultant_email?: string | null
          consultant_name?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          create_date?: string | null
          create_user_name?: string | null
          created_at?: string | null
          currency?: string | null
          departure_date?: string
          external_reservation_id?: string
          guarantee?: Json | null
          guest_nationality?: string | null
          guests?: Json | null
          id?: string
          is_property_tax_inclusive?: boolean | null
          link_id?: string | null
          number_of_guests?: number | null
          number_of_rooms?: number | null
          originating_agent?: Json | null
          payments?: Json | null
          property_id?: string | null
          rate_type_name?: string | null
          raw_data?: Json | null
          reservation_name?: string | null
          reservation_voucher?: string | null
          responsible_client?: Json | null
          rooms?: Json | null
          status?: string | null
          status_at_time_of_cancellation?: string | null
          synced_at?: string | null
          system_type?: string
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pms_reservations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_reservations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      pms_room_types_cache: {
        Row: {
          allow_children: boolean | null
          allow_infants: boolean | null
          allow_teens: boolean | null
          child_max_age: number | null
          child_min_age: number | null
          created_at: string | null
          description: string | null
          external_room_type_id: string
          fetched_at: string | null
          id: string
          infant_max_age: number | null
          infant_min_age: number | null
          linked_rate_type_ids: Json | null
          max_guests: number | null
          min_guests: number | null
          name: string
          property_id: string
          raw_data: Json | null
          system_type: string
          teen_max_age: number | null
          teen_min_age: number | null
          updated_at: string | null
        }
        Insert: {
          allow_children?: boolean | null
          allow_infants?: boolean | null
          allow_teens?: boolean | null
          child_max_age?: number | null
          child_min_age?: number | null
          created_at?: string | null
          description?: string | null
          external_room_type_id: string
          fetched_at?: string | null
          id?: string
          infant_max_age?: number | null
          infant_min_age?: number | null
          linked_rate_type_ids?: Json | null
          max_guests?: number | null
          min_guests?: number | null
          name: string
          property_id: string
          raw_data?: Json | null
          system_type?: string
          teen_max_age?: number | null
          teen_min_age?: number | null
          updated_at?: string | null
        }
        Update: {
          allow_children?: boolean | null
          allow_infants?: boolean | null
          allow_teens?: boolean | null
          child_max_age?: number | null
          child_min_age?: number | null
          created_at?: string | null
          description?: string | null
          external_room_type_id?: string
          fetched_at?: string | null
          id?: string
          infant_max_age?: number | null
          infant_min_age?: number | null
          linked_rate_type_ids?: Json | null
          max_guests?: number | null
          min_guests?: number | null
          name?: string
          property_id?: string
          raw_data?: Json | null
          system_type?: string
          teen_max_age?: number | null
          teen_min_age?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pms_room_types_cache_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pms_room_types_cache_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          phone: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          phone?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      properties: {
        Row: {
          address: string
          amenities: Json | null
          bathrooms: number | null
          bedrooms: number | null
          benson_property_code: string | null
          checkfront_property_code: string | null
          city: string
          country: string
          created_at: string | null
          description: string | null
          external_id: string | null
          external_system: string | null
          id: string
          images: Json | null
          is_active: boolean | null
          latitude: number | null
          longitude: number | null
          max_guests: number
          name: string
          owner_email: string | null
          owner_name: string | null
          permanently_deleted_at: string | null
          price_per_night: number
          property_type: string
          property_url: string | null
          siteminder_property_code: string | null
          slug: string | null
          updated_at: string | null
        }
        Insert: {
          address: string
          amenities?: Json | null
          bathrooms?: number | null
          bedrooms?: number | null
          benson_property_code?: string | null
          checkfront_property_code?: string | null
          city: string
          country: string
          created_at?: string | null
          description?: string | null
          external_id?: string | null
          external_system?: string | null
          id?: string
          images?: Json | null
          is_active?: boolean | null
          latitude?: number | null
          longitude?: number | null
          max_guests?: number
          name: string
          owner_email?: string | null
          owner_name?: string | null
          permanently_deleted_at?: string | null
          price_per_night: number
          property_type: string
          property_url?: string | null
          siteminder_property_code?: string | null
          slug?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string
          amenities?: Json | null
          bathrooms?: number | null
          bedrooms?: number | null
          benson_property_code?: string | null
          checkfront_property_code?: string | null
          city?: string
          country?: string
          created_at?: string | null
          description?: string | null
          external_id?: string | null
          external_system?: string | null
          id?: string
          images?: Json | null
          is_active?: boolean | null
          latitude?: number | null
          longitude?: number | null
          max_guests?: number
          name?: string
          owner_email?: string | null
          owner_name?: string | null
          permanently_deleted_at?: string | null
          price_per_night?: number
          property_type?: string
          property_url?: string | null
          siteminder_property_code?: string | null
          slug?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      property_availability: {
        Row: {
          available_units: number
          created_at: string | null
          date: string
          external_system: string
          id: string
          is_stop_sell: boolean | null
          lead_days_advance: number | null
          lead_days_post: number | null
          maximum_stay: number | null
          minimum_stay: number | null
          property_id: string
          room_type: string
          updated_at: string | null
        }
        Insert: {
          available_units?: number
          created_at?: string | null
          date: string
          external_system: string
          id?: string
          is_stop_sell?: boolean | null
          lead_days_advance?: number | null
          lead_days_post?: number | null
          maximum_stay?: number | null
          minimum_stay?: number | null
          property_id: string
          room_type: string
          updated_at?: string | null
        }
        Update: {
          available_units?: number
          created_at?: string | null
          date?: string
          external_system?: string
          id?: string
          is_stop_sell?: boolean | null
          lead_days_advance?: number | null
          lead_days_post?: number | null
          maximum_stay?: number | null
          minimum_stay?: number | null
          property_id?: string
          room_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_availability_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_availability_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_rates: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          date: string
          external_rate_id: string | null
          external_system: string
          id: string
          meal_type: string | null
          property_id: string
          rate_type: string
          room_type: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string | null
          date: string
          external_rate_id?: string | null
          external_system: string
          id?: string
          meal_type?: string | null
          property_id: string
          rate_type: string
          room_type: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          date?: string
          external_rate_id?: string | null
          external_system?: string
          id?: string
          meal_type?: string | null
          property_id?: string
          rate_type?: string
          room_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_rates_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_rates_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_logs: {
        Row: {
          booking_id: string | null
          created_at: string | null
          external_system: string
          id: string
          message: string | null
          property_id: string | null
          request_data: Json | null
          response_data: Json | null
          status: string
          sync_type: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string | null
          external_system: string
          id?: string
          message?: string | null
          property_id?: string | null
          request_data?: Json | null
          response_data?: Json | null
          status: string
          sync_type: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string | null
          external_system?: string
          id?: string
          message?: string | null
          property_id?: string | null
          request_data?: Json | null
          response_data?: Json | null
          status?: string
          sync_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_logs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_logs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_logs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      public_nightsbridge_config: {
        Row: {
          agent_code: string | null
        }
        Relationships: []
      }
      public_properties: {
        Row: {
          address: string | null
          amenities: Json | null
          bathrooms: number | null
          bedrooms: number | null
          benson_property_code: string | null
          checkfront_property_code: string | null
          city: string | null
          country: string | null
          created_at: string | null
          description: string | null
          external_id: string | null
          external_system: string | null
          id: string | null
          images: Json | null
          is_active: boolean | null
          latitude: number | null
          longitude: number | null
          max_guests: number | null
          name: string | null
          price_per_night: number | null
          property_type: string | null
          property_url: string | null
          siteminder_property_code: string | null
          slug: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          amenities?: Json | null
          bathrooms?: number | null
          bedrooms?: number | null
          benson_property_code?: string | null
          checkfront_property_code?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          description?: string | null
          external_id?: string | null
          external_system?: string | null
          id?: string | null
          images?: Json | null
          is_active?: boolean | null
          latitude?: number | null
          longitude?: number | null
          max_guests?: number | null
          name?: string | null
          price_per_night?: number | null
          property_type?: string | null
          property_url?: string | null
          siteminder_property_code?: string | null
          slug?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          amenities?: Json | null
          bathrooms?: number | null
          bedrooms?: number | null
          benson_property_code?: string | null
          checkfront_property_code?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          description?: string | null
          external_id?: string | null
          external_system?: string | null
          id?: string | null
          images?: Json | null
          is_active?: boolean | null
          latitude?: number | null
          longitude?: number | null
          max_guests?: number | null
          name?: string | null
          price_per_night?: number | null
          property_type?: string | null
          property_url?: string | null
          siteminder_property_code?: string | null
          slug?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      generate_property_slug: {
        Args: { property_id: string; property_name: string }
        Returns: string
      }
      get_user_profile: {
        Args: { user_id: string }
        Returns: {
          avatar_url: string
          email: string
          full_name: string
          id: string
          role: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_property_active: { Args: { prop_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user" | "dev"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user", "dev"],
    },
  },
} as const
