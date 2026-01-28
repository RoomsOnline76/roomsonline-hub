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
      ai_search_logs: {
        Row: {
          created_at: string
          id: string
          matched_count: number | null
          query: string
        }
        Insert: {
          created_at?: string
          id?: string
          matched_count?: number | null
          query: string
        }
        Update: {
          created_at?: string
          id?: string
          matched_count?: number | null
          query?: string
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
      audit_logs: {
        Row: {
          action_type: Database["public"]["Enums"]["audit_action_type"]
          change_summary: string
          changed_fields: string[] | null
          correlation_id: string | null
          created_at: string
          edge_function_name: string | null
          id: string
          immutable_hash: string | null
          ip_address: string | null
          is_sensitive: boolean | null
          metadata: Json | null
          new_values: Json | null
          old_values: Json | null
          property_id: string | null
          record_id: string
          redacted_fields: string[] | null
          request_origin: Database["public"]["Enums"]["audit_request_origin"]
          session_id: string | null
          table_name: string
          user_agent: string | null
          user_email: string
          user_id: string
          user_role: Database["public"]["Enums"]["audit_user_role"]
        }
        Insert: {
          action_type: Database["public"]["Enums"]["audit_action_type"]
          change_summary: string
          changed_fields?: string[] | null
          correlation_id?: string | null
          created_at?: string
          edge_function_name?: string | null
          id?: string
          immutable_hash?: string | null
          ip_address?: string | null
          is_sensitive?: boolean | null
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          property_id?: string | null
          record_id: string
          redacted_fields?: string[] | null
          request_origin: Database["public"]["Enums"]["audit_request_origin"]
          session_id?: string | null
          table_name: string
          user_agent?: string | null
          user_email: string
          user_id: string
          user_role: Database["public"]["Enums"]["audit_user_role"]
        }
        Update: {
          action_type?: Database["public"]["Enums"]["audit_action_type"]
          change_summary?: string
          changed_fields?: string[] | null
          correlation_id?: string | null
          created_at?: string
          edge_function_name?: string | null
          id?: string
          immutable_hash?: string | null
          ip_address?: string | null
          is_sensitive?: boolean | null
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          property_id?: string | null
          record_id?: string
          redacted_fields?: string[] | null
          request_origin?: Database["public"]["Enums"]["audit_request_origin"]
          session_id?: string | null
          table_name?: string
          user_agent?: string | null
          user_email?: string
          user_id?: string
          user_role?: Database["public"]["Enums"]["audit_user_role"]
        }
        Relationships: []
      }
      book_page_images: {
        Row: {
          alt_text: string | null
          column_type: string
          created_at: string | null
          id: string
          image_url: string
          row_position: number
          updated_at: string | null
        }
        Insert: {
          alt_text?: string | null
          column_type: string
          created_at?: string | null
          id?: string
          image_url: string
          row_position: number
          updated_at?: string | null
        }
        Update: {
          alt_text?: string | null
          column_type?: string
          created_at?: string | null
          id?: string
          image_url?: string
          row_position?: number
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
          {
            foreignKeyName: "booking_sync_status_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings_decrypted"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          adults: number
          ai_metadata: Json | null
          booking_channel: string | null
          calculated_commission: number | null
          charges_breakdown: Json | null
          check_in_date: string
          check_out_date: string
          children: number | null
          commission_calculated_at: string | null
          commission_rate_applied: number | null
          created_at: string | null
          external_reservation_id: string | null
          guest_email: string
          guest_email_encrypted: string | null
          guest_name: string
          guest_name_encrypted: string | null
          guest_phone: string | null
          guest_phone_encrypted: string | null
          id: string
          infants: number | null
          paid_at: string | null
          payment_intent_id: string | null
          payment_method: string | null
          payment_reference: string | null
          payment_status: string | null
          pets: number | null
          property_id: string
          rate_type_id: string | null
          room_type_id: string | null
          rooms: Json | null
          special_requests: string | null
          special_requests_parsed: Json | null
          status: string
          teens: number | null
          total_price: number
          updated_at: string | null
          user_id: string | null
          voucher: string | null
        }
        Insert: {
          adults?: number
          ai_metadata?: Json | null
          booking_channel?: string | null
          calculated_commission?: number | null
          charges_breakdown?: Json | null
          check_in_date: string
          check_out_date: string
          children?: number | null
          commission_calculated_at?: string | null
          commission_rate_applied?: number | null
          created_at?: string | null
          external_reservation_id?: string | null
          guest_email: string
          guest_email_encrypted?: string | null
          guest_name: string
          guest_name_encrypted?: string | null
          guest_phone?: string | null
          guest_phone_encrypted?: string | null
          id?: string
          infants?: number | null
          paid_at?: string | null
          payment_intent_id?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          pets?: number | null
          property_id: string
          rate_type_id?: string | null
          room_type_id?: string | null
          rooms?: Json | null
          special_requests?: string | null
          special_requests_parsed?: Json | null
          status?: string
          teens?: number | null
          total_price: number
          updated_at?: string | null
          user_id?: string | null
          voucher?: string | null
        }
        Update: {
          adults?: number
          ai_metadata?: Json | null
          booking_channel?: string | null
          calculated_commission?: number | null
          charges_breakdown?: Json | null
          check_in_date?: string
          check_out_date?: string
          children?: number | null
          commission_calculated_at?: string | null
          commission_rate_applied?: number | null
          created_at?: string | null
          external_reservation_id?: string | null
          guest_email?: string
          guest_email_encrypted?: string | null
          guest_name?: string
          guest_name_encrypted?: string | null
          guest_phone?: string | null
          guest_phone_encrypted?: string | null
          id?: string
          infants?: number | null
          paid_at?: string | null
          payment_intent_id?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          pets?: number | null
          property_id?: string
          rate_type_id?: string | null
          room_type_id?: string | null
          rooms?: Json | null
          special_requests?: string | null
          special_requests_parsed?: Json | null
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
      brochure_templates: {
        Row: {
          created_at: string | null
          id: string
          is_default: boolean | null
          name: string
          sections: Json | null
          styles: Json | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          sections?: Json | null
          styles?: Json | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          sections?: Json | null
          styles?: Json | null
        }
        Relationships: []
      }
      charge_presets: {
        Row: {
          category: string
          created_at: string | null
          default_calculation_method: string | null
          default_description: string | null
          display_order: number | null
          id: string
          is_common: boolean | null
          name: string
        }
        Insert: {
          category: string
          created_at?: string | null
          default_calculation_method?: string | null
          default_description?: string | null
          display_order?: number | null
          id?: string
          is_common?: boolean | null
          name: string
        }
        Update: {
          category?: string
          created_at?: string | null
          default_calculation_method?: string | null
          default_description?: string | null
          display_order?: number | null
          id?: string
          is_common?: boolean | null
          name?: string
        }
        Relationships: []
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
      contract_template_versions: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          content_markdown: string
          created_at: string | null
          created_by: string | null
          id: string
          status: string | null
          template_id: string | null
          variables_schema: Json
          version_number: number
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          content_markdown: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          status?: string | null
          template_id?: string | null
          variables_schema?: Json
          version_number: number
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          content_markdown?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          status?: string | null
          template_id?: string | null
          variables_schema?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          current_version_id: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          current_version_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          current_version_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_current_version"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "contract_template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      field_registry: {
        Row: {
          created_at: string | null
          data_type: string | null
          db_column: string | null
          db_table: string | null
          field_key: string
          id: string
          is_required: boolean | null
          notes: string | null
          pms_lockable: boolean | null
          pms_populated: boolean | null
          section: string | null
          tab: string | null
          ui_label: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          data_type?: string | null
          db_column?: string | null
          db_table?: string | null
          field_key: string
          id?: string
          is_required?: boolean | null
          notes?: string | null
          pms_lockable?: boolean | null
          pms_populated?: boolean | null
          section?: string | null
          tab?: string | null
          ui_label: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          data_type?: string | null
          db_column?: string | null
          db_table?: string | null
          field_key?: string
          id?: string
          is_required?: boolean | null
          notes?: string | null
          pms_lockable?: boolean | null
          pms_populated?: boolean | null
          section?: string | null
          tab?: string | null
          ui_label?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      financial_metrics: {
        Row: {
          cash_balance_usd: number | null
          cash_balance_zar: number | null
          created_at: string | null
          created_by: string | null
          exchange_rate: number | null
          id: string
          metric_date: string
          monthly_burn_usd: number | null
          monthly_revenue_usd: number | null
          notes: string | null
          runway_months: number | null
          updated_at: string | null
        }
        Insert: {
          cash_balance_usd?: number | null
          cash_balance_zar?: number | null
          created_at?: string | null
          created_by?: string | null
          exchange_rate?: number | null
          id?: string
          metric_date: string
          monthly_burn_usd?: number | null
          monthly_revenue_usd?: number | null
          notes?: string | null
          runway_months?: number | null
          updated_at?: string | null
        }
        Update: {
          cash_balance_usd?: number | null
          cash_balance_zar?: number | null
          created_at?: string | null
          created_by?: string | null
          exchange_rate?: number | null
          id?: string
          metric_date?: string
          monthly_burn_usd?: number | null
          monthly_revenue_usd?: number | null
          notes?: string | null
          runway_months?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      help_articles: {
        Row: {
          content_markdown: string
          created_at: string | null
          id: string
          impact_level: Database["public"]["Enums"]["help_impact_level"] | null
          is_published: boolean | null
          related_field: string | null
          related_table: string | null
          role_target: string[]
          section: string
          slug: string
          sort_order: number | null
          title: string
          updated_at: string | null
          view_count: number | null
        }
        Insert: {
          content_markdown: string
          created_at?: string | null
          id?: string
          impact_level?: Database["public"]["Enums"]["help_impact_level"] | null
          is_published?: boolean | null
          related_field?: string | null
          related_table?: string | null
          role_target?: string[]
          section: string
          slug: string
          sort_order?: number | null
          title: string
          updated_at?: string | null
          view_count?: number | null
        }
        Update: {
          content_markdown?: string
          created_at?: string | null
          id?: string
          impact_level?: Database["public"]["Enums"]["help_impact_level"] | null
          is_published?: boolean | null
          related_field?: string | null
          related_table?: string | null
          role_target?: string[]
          section?: string
          slug?: string
          sort_order?: number | null
          title?: string
          updated_at?: string | null
          view_count?: number | null
        }
        Relationships: []
      }
      help_search_logs: {
        Row: {
          created_at: string | null
          id: string
          results_count: number | null
          search_query: string
          selected_article_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          results_count?: number | null
          search_query: string
          selected_article_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          results_count?: number | null
          search_query?: string
          selected_article_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "help_search_logs_selected_article_id_fkey"
            columns: ["selected_article_id"]
            isOneToOne: false
            referencedRelation: "help_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      hostfully_room_types: {
        Row: {
          address_city: string | null
          address_country: string | null
          address_postal_code: string | null
          address_state: string | null
          address_street: string | null
          amenities: Json | null
          bathrooms: number | null
          bed_configuration: Json | null
          bedrooms: number | null
          beds: number | null
          cancellation_policy: string | null
          check_in_instructions: string | null
          check_in_time: string | null
          check_out_time: string | null
          cleaning_fee: number | null
          created_at: string | null
          currency: string | null
          daily_rate: number | null
          description: string | null
          extra_guest_fee: number | null
          extra_person_policy: string | null
          facilities_raw: string[] | null
          hostfully_room_id: string | null
          house_rules: string | null
          id: string
          images: Json | null
          is_active: boolean | null
          last_synced_at: string | null
          latitude: number | null
          linked_rate_type_ids: string[] | null
          longitude: number | null
          max_guests: number | null
          max_stay: number | null
          min_guests: number | null
          min_stay: number | null
          name: string
          pms_synced_fields: string[] | null
          property_id: string
          property_type: string | null
          rate_type: string | null
          raw_data: Json | null
          room_size: number | null
          room_size_unit: string | null
          security_deposit: number | null
          tax_rate: number | null
          thumbnail_url: string | null
          updated_at: string | null
          wifi_network: string | null
          wifi_password: string | null
        }
        Insert: {
          address_city?: string | null
          address_country?: string | null
          address_postal_code?: string | null
          address_state?: string | null
          address_street?: string | null
          amenities?: Json | null
          bathrooms?: number | null
          bed_configuration?: Json | null
          bedrooms?: number | null
          beds?: number | null
          cancellation_policy?: string | null
          check_in_instructions?: string | null
          check_in_time?: string | null
          check_out_time?: string | null
          cleaning_fee?: number | null
          created_at?: string | null
          currency?: string | null
          daily_rate?: number | null
          description?: string | null
          extra_guest_fee?: number | null
          extra_person_policy?: string | null
          facilities_raw?: string[] | null
          hostfully_room_id?: string | null
          house_rules?: string | null
          id?: string
          images?: Json | null
          is_active?: boolean | null
          last_synced_at?: string | null
          latitude?: number | null
          linked_rate_type_ids?: string[] | null
          longitude?: number | null
          max_guests?: number | null
          max_stay?: number | null
          min_guests?: number | null
          min_stay?: number | null
          name: string
          pms_synced_fields?: string[] | null
          property_id: string
          property_type?: string | null
          rate_type?: string | null
          raw_data?: Json | null
          room_size?: number | null
          room_size_unit?: string | null
          security_deposit?: number | null
          tax_rate?: number | null
          thumbnail_url?: string | null
          updated_at?: string | null
          wifi_network?: string | null
          wifi_password?: string | null
        }
        Update: {
          address_city?: string | null
          address_country?: string | null
          address_postal_code?: string | null
          address_state?: string | null
          address_street?: string | null
          amenities?: Json | null
          bathrooms?: number | null
          bed_configuration?: Json | null
          bedrooms?: number | null
          beds?: number | null
          cancellation_policy?: string | null
          check_in_instructions?: string | null
          check_in_time?: string | null
          check_out_time?: string | null
          cleaning_fee?: number | null
          created_at?: string | null
          currency?: string | null
          daily_rate?: number | null
          description?: string | null
          extra_guest_fee?: number | null
          extra_person_policy?: string | null
          facilities_raw?: string[] | null
          hostfully_room_id?: string | null
          house_rules?: string | null
          id?: string
          images?: Json | null
          is_active?: boolean | null
          last_synced_at?: string | null
          latitude?: number | null
          linked_rate_type_ids?: string[] | null
          longitude?: number | null
          max_guests?: number | null
          max_stay?: number | null
          min_guests?: number | null
          min_stay?: number | null
          name?: string
          pms_synced_fields?: string[] | null
          property_id?: string
          property_type?: string | null
          rate_type?: string | null
          raw_data?: Json | null
          room_size?: number | null
          room_size_unit?: string | null
          security_deposit?: number | null
          tax_rate?: number | null
          thumbnail_url?: string | null
          updated_at?: string | null
          wifi_network?: string | null
          wifi_password?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hostfully_room_types_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostfully_room_types_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          billing_type: string
          category: string | null
          cost_usd: number
          cost_zar: number | null
          created_at: string | null
          created_by: string | null
          description: string
          due_date: string | null
          id: string
          invoice_date: string | null
          is_paid: boolean | null
          notes: string | null
          paid_at: string | null
          updated_at: string | null
          vendor: string | null
        }
        Insert: {
          billing_type: string
          category?: string | null
          cost_usd: number
          cost_zar?: number | null
          created_at?: string | null
          created_by?: string | null
          description: string
          due_date?: string | null
          id?: string
          invoice_date?: string | null
          is_paid?: boolean | null
          notes?: string | null
          paid_at?: string | null
          updated_at?: string | null
          vendor?: string | null
        }
        Update: {
          billing_type?: string
          category?: string | null
          cost_usd?: number
          cost_zar?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string
          due_date?: string | null
          id?: string
          invoice_date?: string | null
          is_paid?: boolean | null
          notes?: string | null
          paid_at?: string | null
          updated_at?: string | null
          vendor?: string | null
        }
        Relationships: []
      }
      itineraries: {
        Row: {
          brochure_generated_at: string | null
          brochure_pdf_url: string | null
          created_at: string
          currency: string
          expires_at: string | null
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          session_id: string | null
          special_requests: string | null
          status: string
          stays: Json
          title: string | null
          total_nights: number
          total_price: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          brochure_generated_at?: string | null
          brochure_pdf_url?: string | null
          created_at?: string
          currency?: string
          expires_at?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          session_id?: string | null
          special_requests?: string | null
          status?: string
          stays?: Json
          title?: string | null
          total_nights?: number
          total_price?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          brochure_generated_at?: string | null
          brochure_pdf_url?: string | null
          created_at?: string
          currency?: string
          expires_at?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          session_id?: string | null
          special_requests?: string | null
          status?: string
          stays?: Json
          title?: string | null
          total_nights?: number
          total_price?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      itinerary_bookings: {
        Row: {
          booking_id: string
          created_at: string
          error_message: string | null
          external_reservation_id: string | null
          id: string
          itinerary_id: string
          property_id: string | null
          status: string
          stay_index: number
          updated_at: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          error_message?: string | null
          external_reservation_id?: string | null
          id?: string
          itinerary_id: string
          property_id?: string | null
          status?: string
          stay_index: number
          updated_at?: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          error_message?: string | null
          external_reservation_id?: string | null
          id?: string
          itinerary_id?: string
          property_id?: string | null
          status?: string
          stay_index?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_bookings_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_bookings_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings_decrypted"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_bookings_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_bookings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_bookings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      journals: {
        Row: {
          author_id: string | null
          content: string | null
          created_at: string
          excerpt: string | null
          featured_image_url: string | null
          header_image_url: string | null
          id: string
          meta_description: string | null
          meta_title: string | null
          publish_date: string | null
          slug: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          content?: string | null
          created_at?: string
          excerpt?: string | null
          featured_image_url?: string | null
          header_image_url?: string | null
          id?: string
          meta_description?: string | null
          meta_title?: string | null
          publish_date?: string | null
          slug?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          content?: string | null
          created_at?: string
          excerpt?: string | null
          featured_image_url?: string | null
          header_image_url?: string | null
          id?: string
          meta_description?: string | null
          meta_title?: string | null
          publish_date?: string | null
          slug?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      local_experiences: {
        Row: {
          best_time: string | null
          booking_link: string | null
          category: string | null
          created_at: string | null
          cuisine_type: string | null
          description: string | null
          display_order: number | null
          distance_km: number | null
          dress_code: string | null
          duration_hours: number | null
          id: string
          image_url: string | null
          is_active: boolean | null
          price_indicator: string | null
          property_id: string | null
          reservation_required: boolean | null
          source: string | null
          title: string
          updated_at: string | null
          venue_type: string | null
          why_locals_love_it: string | null
        }
        Insert: {
          best_time?: string | null
          booking_link?: string | null
          category?: string | null
          created_at?: string | null
          cuisine_type?: string | null
          description?: string | null
          display_order?: number | null
          distance_km?: number | null
          dress_code?: string | null
          duration_hours?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          price_indicator?: string | null
          property_id?: string | null
          reservation_required?: boolean | null
          source?: string | null
          title: string
          updated_at?: string | null
          venue_type?: string | null
          why_locals_love_it?: string | null
        }
        Update: {
          best_time?: string | null
          booking_link?: string | null
          category?: string | null
          created_at?: string | null
          cuisine_type?: string | null
          description?: string | null
          display_order?: number | null
          distance_km?: number | null
          dress_code?: string | null
          duration_hours?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          price_indicator?: string | null
          property_id?: string | null
          reservation_required?: boolean | null
          source?: string | null
          title?: string
          updated_at?: string | null
          venue_type?: string | null
          why_locals_love_it?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "local_experiences_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "local_experiences_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
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
      navigation_tag_categories: {
        Row: {
          category: string
          created_at: string
          id: string
          tag_name: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          tag_name: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          tag_name?: string
        }
        Relationships: []
      }
      nightsbridge_booking_sessions: {
        Row: {
          check_in_date: string | null
          check_out_date: string | null
          created_at: string | null
          currency: string | null
          estimated_revenue: number | null
          expires_at: string | null
          id: string
          match_confidence: string | null
          matched_at: string | null
          matched_reservation_id: string | null
          property_id: string | null
          property_name: string | null
          revenue_currency: string | null
          session_started_at: string | null
          status: string | null
          tracking_ref: string
          updated_at: string | null
          user_agent: string | null
        }
        Insert: {
          check_in_date?: string | null
          check_out_date?: string | null
          created_at?: string | null
          currency?: string | null
          estimated_revenue?: number | null
          expires_at?: string | null
          id?: string
          match_confidence?: string | null
          matched_at?: string | null
          matched_reservation_id?: string | null
          property_id?: string | null
          property_name?: string | null
          revenue_currency?: string | null
          session_started_at?: string | null
          status?: string | null
          tracking_ref: string
          updated_at?: string | null
          user_agent?: string | null
        }
        Update: {
          check_in_date?: string | null
          check_out_date?: string | null
          created_at?: string | null
          currency?: string | null
          estimated_revenue?: number | null
          expires_at?: string | null
          id?: string
          match_confidence?: string | null
          matched_at?: string | null
          matched_reservation_id?: string | null
          property_id?: string | null
          property_name?: string | null
          revenue_currency?: string | null
          session_started_at?: string | null
          status?: string | null
          tracking_ref?: string
          updated_at?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nightsbridge_booking_sessions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nightsbridge_booking_sessions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_fields: {
        Row: {
          created_at: string | null
          field_key: string
          help_text: string | null
          id: string
          is_active: boolean | null
          is_pms_lockable: boolean | null
          is_required: boolean | null
          label_override: string | null
          order_index: number
          score_weight: number | null
          step_id: string | null
          updated_at: string | null
          validation_rules: Json | null
        }
        Insert: {
          created_at?: string | null
          field_key: string
          help_text?: string | null
          id?: string
          is_active?: boolean | null
          is_pms_lockable?: boolean | null
          is_required?: boolean | null
          label_override?: string | null
          order_index: number
          score_weight?: number | null
          step_id?: string | null
          updated_at?: string | null
          validation_rules?: Json | null
        }
        Update: {
          created_at?: string | null
          field_key?: string
          help_text?: string | null
          id?: string
          is_active?: boolean | null
          is_pms_lockable?: boolean | null
          is_required?: boolean | null
          label_override?: string | null
          order_index?: number
          score_weight?: number | null
          step_id?: string | null
          updated_at?: string | null
          validation_rules?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_fields_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "onboarding_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_steps: {
        Row: {
          component_type: string | null
          created_at: string | null
          custom_component_path: string | null
          description: string | null
          estimated_minutes: number | null
          icon: string | null
          id: string
          is_active: boolean | null
          is_required: boolean | null
          order_index: number
          step_key: string
          title: string
          updated_at: string | null
          weight: number | null
          wizard_id: string | null
        }
        Insert: {
          component_type?: string | null
          created_at?: string | null
          custom_component_path?: string | null
          description?: string | null
          estimated_minutes?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          order_index: number
          step_key: string
          title: string
          updated_at?: string | null
          weight?: number | null
          wizard_id?: string | null
        }
        Update: {
          component_type?: string | null
          created_at?: string | null
          custom_component_path?: string | null
          description?: string | null
          estimated_minutes?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          order_index?: number
          step_key?: string
          title?: string
          updated_at?: string | null
          weight?: number | null
          wizard_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_steps_wizard_id_fkey"
            columns: ["wizard_id"]
            isOneToOne: false
            referencedRelation: "onboarding_wizards"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_wizards: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      owner_contracts: {
        Row: {
          created_at: string | null
          id: string
          is_new_owner: boolean | null
          override_at: string | null
          override_by: string | null
          override_reason: string | null
          owner_email: string
          owner_name: string | null
          pdf_url: string | null
          pending_property_data: Json | null
          sent_at: string | null
          signature_data: Json | null
          signature_image_url: string | null
          signature_ip: unknown
          signature_user_agent: string | null
          signed_at: string | null
          signed_by_designation: string | null
          signed_by_email: string | null
          signed_by_name: string | null
          signing_token: string | null
          status: string
          template_version: string
          template_version_id: string | null
          token_expires_at: string | null
          unsigned_pdf_url: string | null
          updated_at: string | null
          version: number
          viewed_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_new_owner?: boolean | null
          override_at?: string | null
          override_by?: string | null
          override_reason?: string | null
          owner_email: string
          owner_name?: string | null
          pdf_url?: string | null
          pending_property_data?: Json | null
          sent_at?: string | null
          signature_data?: Json | null
          signature_image_url?: string | null
          signature_ip?: unknown
          signature_user_agent?: string | null
          signed_at?: string | null
          signed_by_designation?: string | null
          signed_by_email?: string | null
          signed_by_name?: string | null
          signing_token?: string | null
          status?: string
          template_version?: string
          template_version_id?: string | null
          token_expires_at?: string | null
          unsigned_pdf_url?: string | null
          updated_at?: string | null
          version?: number
          viewed_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_new_owner?: boolean | null
          override_at?: string | null
          override_by?: string | null
          override_reason?: string | null
          owner_email?: string
          owner_name?: string | null
          pdf_url?: string | null
          pending_property_data?: Json | null
          sent_at?: string | null
          signature_data?: Json | null
          signature_image_url?: string | null
          signature_ip?: unknown
          signature_user_agent?: string | null
          signed_at?: string | null
          signed_by_designation?: string | null
          signed_by_email?: string | null
          signed_by_name?: string | null
          signing_token?: string | null
          status?: string
          template_version?: string
          template_version_id?: string | null
          token_expires_at?: string | null
          unsigned_pdf_url?: string | null
          updated_at?: string | null
          version?: number
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "owner_contracts_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "contract_template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_pms_credentials: {
        Row: {
          api_key: string | null
          available_listings: Json | null
          created_at: string | null
          environment: string | null
          external_account_id: string | null
          external_account_name: string | null
          id: string
          is_active: boolean | null
          last_sync_at: string | null
          owner_id: string
          refresh_token: string | null
          sync_error: string | null
          sync_status: string | null
          system_type: string
          token_expires_at: string | null
          updated_at: string | null
        }
        Insert: {
          api_key?: string | null
          available_listings?: Json | null
          created_at?: string | null
          environment?: string | null
          external_account_id?: string | null
          external_account_name?: string | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          owner_id: string
          refresh_token?: string | null
          sync_error?: string | null
          sync_status?: string | null
          system_type: string
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Update: {
          api_key?: string | null
          available_listings?: Json | null
          created_at?: string | null
          environment?: string | null
          external_account_id?: string | null
          external_account_name?: string | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          owner_id?: string
          refresh_token?: string | null
          sync_error?: string | null
          sync_status?: string | null
          system_type?: string
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "owner_pms_credentials_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          addpay_response: Json | null
          amount: number
          booking_id: string | null
          created_at: string | null
          currency: string | null
          id: string
          payment_method: string | null
          psn: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          addpay_response?: Json | null
          amount: number
          booking_id?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          payment_method?: string | null
          psn?: string | null
          status: string
          updated_at?: string | null
        }
        Update: {
          addpay_response?: Json | null
          amount?: number
          booking_id?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          payment_method?: string | null
          psn?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings_decrypted"
            referencedColumns: ["id"]
          },
        ]
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
          available_listings: Json | null
          base_url: string | null
          capabilities: Json | null
          created_at: string | null
          environment: string
          id: string
          is_active: boolean | null
          last_sync_at: string | null
          password: string | null
          property_code: string | null
          property_name: string | null
          refresh_interval_minutes: number | null
          sync_status: string | null
          system_type: string
          updated_at: string | null
          username: string | null
        }
        Insert: {
          agent_code?: string | null
          api_key?: string | null
          available_listings?: Json | null
          base_url?: string | null
          capabilities?: Json | null
          created_at?: string | null
          environment?: string
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          password?: string | null
          property_code?: string | null
          property_name?: string | null
          refresh_interval_minutes?: number | null
          sync_status?: string | null
          system_type: string
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          agent_code?: string | null
          api_key?: string | null
          available_listings?: Json | null
          base_url?: string | null
          capabilities?: Json | null
          created_at?: string | null
          environment?: string
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          password?: string | null
          property_code?: string | null
          property_name?: string | null
          refresh_interval_minutes?: number | null
          sync_status?: string | null
          system_type?: string
          updated_at?: string | null
          username?: string | null
        }
        Relationships: []
      }
      pms_dev_notes_log: {
        Row: {
          created_at: string | null
          created_by: string | null
          created_by_email: string | null
          created_by_name: string | null
          id: string
          note_content: string
          system_type: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          created_by_email?: string | null
          created_by_name?: string | null
          id?: string
          note_content: string
          system_type: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          created_by_email?: string | null
          created_by_name?: string | null
          id?: string
          note_content?: string
          system_type?: string
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
      pms_tracker_status: {
        Row: {
          active_environment: string
          additional_info: Json | null
          contact_email: string | null
          contact_name: string | null
          contact_person: string | null
          contact_tel: string | null
          created_at: string | null
          has_access: boolean | null
          has_account: boolean | null
          has_docs: boolean | null
          has_edge: boolean | null
          has_get: boolean | null
          has_health: boolean | null
          has_post: boolean | null
          has_soft_test: boolean | null
          id: string
          integration_status:
            | Database["public"]["Enums"]["pms_integration_status"]
            | null
          is_certified: boolean | null
          is_production: boolean | null
          notes: string | null
          status: string | null
          system_type: string
          updated_at: string | null
        }
        Insert: {
          active_environment?: string
          additional_info?: Json | null
          contact_email?: string | null
          contact_name?: string | null
          contact_person?: string | null
          contact_tel?: string | null
          created_at?: string | null
          has_access?: boolean | null
          has_account?: boolean | null
          has_docs?: boolean | null
          has_edge?: boolean | null
          has_get?: boolean | null
          has_health?: boolean | null
          has_post?: boolean | null
          has_soft_test?: boolean | null
          id?: string
          integration_status?:
            | Database["public"]["Enums"]["pms_integration_status"]
            | null
          is_certified?: boolean | null
          is_production?: boolean | null
          notes?: string | null
          status?: string | null
          system_type: string
          updated_at?: string | null
        }
        Update: {
          active_environment?: string
          additional_info?: Json | null
          contact_email?: string | null
          contact_name?: string | null
          contact_person?: string | null
          contact_tel?: string | null
          created_at?: string | null
          has_access?: boolean | null
          has_account?: boolean | null
          has_docs?: boolean | null
          has_edge?: boolean | null
          has_get?: boolean | null
          has_health?: boolean | null
          has_post?: boolean | null
          has_soft_test?: boolean | null
          id?: string
          integration_status?:
            | Database["public"]["Enums"]["pms_integration_status"]
            | null
          is_certified?: boolean | null
          is_production?: boolean | null
          notes?: string | null
          status?: string | null
          system_type?: string
          updated_at?: string | null
        }
        Relationships: []
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
          ai_confidence_metadata: Json | null
          amenities: Json | null
          bathrooms: number | null
          bedrooms: number | null
          benson_environment: string | null
          benson_property_code: string | null
          checkfront_property_code: string | null
          city: string
          cloudbeds_property_id: string | null
          country: string
          created_at: string | null
          description: string | null
          editorial_rating: string | null
          external_id: string | null
          external_metadata: Json | null
          external_system: string | null
          hero_listing: boolean | null
          hero_video_url: string | null
          hostfully_property_uid: string | null
          hotelbeds_hotel_code: string | null
          id: string
          images: Json | null
          is_active: boolean | null
          is_rol_property: boolean | null
          last_pms_sync_at: string | null
          latitude: number | null
          littlehotelier_channel_code: string | null
          littlehotelier_region: string | null
          longitude: number | null
          max_guests: number
          name: string
          navigation_tags: string[] | null
          owner_email: string | null
          owner_name: string | null
          owner_notes: string | null
          owner_pms_credential_id: string | null
          permanently_deleted_at: string | null
          pms_managed_fields: string[] | null
          pms_sync_status: string | null
          price_per_night: number
          property_type: string
          property_url: string | null
          short_description: string | null
          show_on_website: boolean | null
          siteminder_property_code: string | null
          slug: string | null
          updated_at: string | null
          what_its_really_like: string | null
          who_its_not_for: string | null
          who_this_suits: string | null
          why_this_place_matters: string | null
          why_we_chose_this_place: string | null
        }
        Insert: {
          address: string
          ai_confidence_metadata?: Json | null
          amenities?: Json | null
          bathrooms?: number | null
          bedrooms?: number | null
          benson_environment?: string | null
          benson_property_code?: string | null
          checkfront_property_code?: string | null
          city: string
          cloudbeds_property_id?: string | null
          country: string
          created_at?: string | null
          description?: string | null
          editorial_rating?: string | null
          external_id?: string | null
          external_metadata?: Json | null
          external_system?: string | null
          hero_listing?: boolean | null
          hero_video_url?: string | null
          hostfully_property_uid?: string | null
          hotelbeds_hotel_code?: string | null
          id?: string
          images?: Json | null
          is_active?: boolean | null
          is_rol_property?: boolean | null
          last_pms_sync_at?: string | null
          latitude?: number | null
          littlehotelier_channel_code?: string | null
          littlehotelier_region?: string | null
          longitude?: number | null
          max_guests?: number
          name: string
          navigation_tags?: string[] | null
          owner_email?: string | null
          owner_name?: string | null
          owner_notes?: string | null
          owner_pms_credential_id?: string | null
          permanently_deleted_at?: string | null
          pms_managed_fields?: string[] | null
          pms_sync_status?: string | null
          price_per_night: number
          property_type: string
          property_url?: string | null
          short_description?: string | null
          show_on_website?: boolean | null
          siteminder_property_code?: string | null
          slug?: string | null
          updated_at?: string | null
          what_its_really_like?: string | null
          who_its_not_for?: string | null
          who_this_suits?: string | null
          why_this_place_matters?: string | null
          why_we_chose_this_place?: string | null
        }
        Update: {
          address?: string
          ai_confidence_metadata?: Json | null
          amenities?: Json | null
          bathrooms?: number | null
          bedrooms?: number | null
          benson_environment?: string | null
          benson_property_code?: string | null
          checkfront_property_code?: string | null
          city?: string
          cloudbeds_property_id?: string | null
          country?: string
          created_at?: string | null
          description?: string | null
          editorial_rating?: string | null
          external_id?: string | null
          external_metadata?: Json | null
          external_system?: string | null
          hero_listing?: boolean | null
          hero_video_url?: string | null
          hostfully_property_uid?: string | null
          hotelbeds_hotel_code?: string | null
          id?: string
          images?: Json | null
          is_active?: boolean | null
          is_rol_property?: boolean | null
          last_pms_sync_at?: string | null
          latitude?: number | null
          littlehotelier_channel_code?: string | null
          littlehotelier_region?: string | null
          longitude?: number | null
          max_guests?: number
          name?: string
          navigation_tags?: string[] | null
          owner_email?: string | null
          owner_name?: string | null
          owner_notes?: string | null
          owner_pms_credential_id?: string | null
          permanently_deleted_at?: string | null
          pms_managed_fields?: string[] | null
          pms_sync_status?: string | null
          price_per_night?: number
          property_type?: string
          property_url?: string | null
          short_description?: string | null
          show_on_website?: boolean | null
          siteminder_property_code?: string | null
          slug?: string | null
          updated_at?: string | null
          what_its_really_like?: string | null
          who_its_not_for?: string | null
          who_this_suits?: string | null
          why_this_place_matters?: string | null
          why_we_chose_this_place?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_owner_pms_credential_id_fkey"
            columns: ["owner_pms_credential_id"]
            isOneToOne: false
            referencedRelation: "owner_pms_credentials"
            referencedColumns: ["id"]
          },
        ]
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
      property_bank_details: {
        Row: {
          account_holder: string
          account_number_encrypted: string
          account_number_masked: string
          account_type: string | null
          bank_name: string
          branch_code: string
          created_at: string
          created_by: string | null
          id: string
          is_verified: boolean
          property_id: string
          swift_code: string | null
          updated_at: string
          verification_method: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          account_holder: string
          account_number_encrypted: string
          account_number_masked: string
          account_type?: string | null
          bank_name: string
          branch_code: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_verified?: boolean
          property_id: string
          swift_code?: string | null
          updated_at?: string
          verification_method?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          account_holder?: string
          account_number_encrypted?: string
          account_number_masked?: string
          account_type?: string | null
          bank_name?: string
          branch_code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_verified?: boolean
          property_id?: string
          swift_code?: string | null
          updated_at?: string
          verification_method?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_bank_details_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_bank_details_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_charges: {
        Row: {
          amount: number
          applies_to_adults: boolean | null
          applies_to_all_rooms: boolean | null
          applies_to_children: boolean | null
          applies_to_infants: boolean | null
          calculation_method: string
          category: string
          created_at: string | null
          currency: string | null
          description: string | null
          display_order: number | null
          id: string
          internal_code: string | null
          is_active: boolean | null
          is_refundable: boolean | null
          max_cap: number | null
          max_nights: number | null
          min_cap: number | null
          min_nights: number | null
          name: string
          partial_refund_percentage: number | null
          percentage_apply_to: string | null
          pms_external_id: string | null
          property_id: string
          rate_type_ids: string[] | null
          refund_timing: string | null
          refund_type: string | null
          room_type_ids: string[] | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          applies_to_adults?: boolean | null
          applies_to_all_rooms?: boolean | null
          applies_to_children?: boolean | null
          applies_to_infants?: boolean | null
          calculation_method: string
          category: string
          created_at?: string | null
          currency?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          internal_code?: string | null
          is_active?: boolean | null
          is_refundable?: boolean | null
          max_cap?: number | null
          max_nights?: number | null
          min_cap?: number | null
          min_nights?: number | null
          name: string
          partial_refund_percentage?: number | null
          percentage_apply_to?: string | null
          pms_external_id?: string | null
          property_id: string
          rate_type_ids?: string[] | null
          refund_timing?: string | null
          refund_type?: string | null
          room_type_ids?: string[] | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          applies_to_adults?: boolean | null
          applies_to_all_rooms?: boolean | null
          applies_to_children?: boolean | null
          applies_to_infants?: boolean | null
          calculation_method?: string
          category?: string
          created_at?: string | null
          currency?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          internal_code?: string | null
          is_active?: boolean | null
          is_refundable?: boolean | null
          max_cap?: number | null
          max_nights?: number | null
          min_cap?: number | null
          min_nights?: number | null
          name?: string
          partial_refund_percentage?: number | null
          percentage_apply_to?: string | null
          pms_external_id?: string | null
          property_id?: string
          rate_type_ids?: string[] | null
          refund_timing?: string | null
          refund_type?: string | null
          room_type_ids?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_charges_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_charges_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_commercial_terms: {
        Row: {
          contract_status: string | null
          created_at: string | null
          created_by: string | null
          document_url: string | null
          effective_from: string
          effective_to: string | null
          id: string
          notes: string | null
          property_id: string
          revenue_share_percent: number
          signed_at: string | null
          signed_by: string | null
          updated_at: string | null
        }
        Insert: {
          contract_status?: string | null
          created_at?: string | null
          created_by?: string | null
          document_url?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          notes?: string | null
          property_id: string
          revenue_share_percent?: number
          signed_at?: string | null
          signed_by?: string | null
          updated_at?: string | null
        }
        Update: {
          contract_status?: string | null
          created_at?: string | null
          created_by?: string | null
          document_url?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          notes?: string | null
          property_id?: string
          revenue_share_percent?: number
          signed_at?: string | null
          signed_by?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_commercial_terms_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_commercial_terms_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_contracts: {
        Row: {
          created_at: string | null
          id: string
          override_at: string | null
          override_by: string | null
          override_reason: string | null
          pdf_url: string | null
          property_id: string
          sent_at: string | null
          sent_to_email: string | null
          signature_data: Json | null
          signature_image_url: string | null
          signature_ip: unknown
          signature_user_agent: string | null
          signed_at: string | null
          signed_by_designation: string | null
          signed_by_email: string | null
          signed_by_name: string | null
          signing_token: string | null
          status: string
          template_hash: string | null
          template_version: string
          token_expires_at: string | null
          unsigned_pdf_url: string | null
          updated_at: string | null
          version: number
          viewed_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          override_at?: string | null
          override_by?: string | null
          override_reason?: string | null
          pdf_url?: string | null
          property_id: string
          sent_at?: string | null
          sent_to_email?: string | null
          signature_data?: Json | null
          signature_image_url?: string | null
          signature_ip?: unknown
          signature_user_agent?: string | null
          signed_at?: string | null
          signed_by_designation?: string | null
          signed_by_email?: string | null
          signed_by_name?: string | null
          signing_token?: string | null
          status?: string
          template_hash?: string | null
          template_version?: string
          token_expires_at?: string | null
          unsigned_pdf_url?: string | null
          updated_at?: string | null
          version?: number
          viewed_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          override_at?: string | null
          override_by?: string | null
          override_reason?: string | null
          pdf_url?: string | null
          property_id?: string
          sent_at?: string | null
          sent_to_email?: string | null
          signature_data?: Json | null
          signature_image_url?: string | null
          signature_ip?: unknown
          signature_user_agent?: string | null
          signed_at?: string | null
          signed_by_designation?: string | null
          signed_by_email?: string | null
          signed_by_name?: string | null
          signing_token?: string | null
          status?: string
          template_hash?: string | null
          template_version?: string
          token_expires_at?: string | null
          unsigned_pdf_url?: string | null
          updated_at?: string | null
          version?: number
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_contracts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_contracts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_onboarding_tokens: {
        Row: {
          created_at: string | null
          created_by: string | null
          expires_at: string
          id: string
          owner_email: string
          property_id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          expires_at?: string
          id?: string
          owner_email: string
          property_id: string
          token?: string
          used_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          expires_at?: string
          id?: string
          owner_email?: string
          property_id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_onboarding_tokens_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_onboarding_tokens_property_id_fkey"
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
      rol_bank_export_batches: {
        Row: {
          bank_provider: string
          batch_reference: string
          batch_sequence: number
          created_at: string
          created_by: string
          export_file_url: string | null
          export_format: string
          exported_at: string | null
          exported_by: string | null
          failed_at: string | null
          failure_reason: string | null
          id: string
          status: string
          total_amount: number
          total_records: number
          updated_at: string
        }
        Insert: {
          bank_provider: string
          batch_reference: string
          batch_sequence?: number
          created_at?: string
          created_by: string
          export_file_url?: string | null
          export_format?: string
          exported_at?: string | null
          exported_by?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          status?: string
          total_amount?: number
          total_records?: number
          updated_at?: string
        }
        Update: {
          bank_provider?: string
          batch_reference?: string
          batch_sequence?: number
          created_at?: string
          created_by?: string
          export_file_url?: string | null
          export_format?: string
          exported_at?: string | null
          exported_by?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          status?: string
          total_amount?: number
          total_records?: number
          updated_at?: string
        }
        Relationships: []
      }
      rol_bank_export_lines: {
        Row: {
          account_number_encrypted: string
          account_number_masked: string
          amount: number
          bank_name: string
          batch_id: string
          beneficiary_name: string
          branch_code: string
          created_at: string
          currency: string
          failure_code: string | null
          failure_reason: string | null
          id: string
          ledger_count: number
          ledger_ids: string[]
          payment_reference: string
          property_id: string
          status: string
        }
        Insert: {
          account_number_encrypted: string
          account_number_masked: string
          amount: number
          bank_name: string
          batch_id: string
          beneficiary_name: string
          branch_code: string
          created_at?: string
          currency?: string
          failure_code?: string | null
          failure_reason?: string | null
          id?: string
          ledger_count: number
          ledger_ids: string[]
          payment_reference: string
          property_id: string
          status?: string
        }
        Update: {
          account_number_encrypted?: string
          account_number_masked?: string
          amount?: number
          bank_name?: string
          batch_id?: string
          beneficiary_name?: string
          branch_code?: string
          created_at?: string
          currency?: string
          failure_code?: string | null
          failure_reason?: string | null
          id?: string
          ledger_count?: number
          ledger_ids?: string[]
          payment_reference?: string
          property_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "rol_bank_export_lines_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "rol_bank_export_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rol_bank_export_lines_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rol_bank_export_lines_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      rol_financial_signoffs: {
        Row: {
          acknowledgment_text: string
          batch_id: string
          id: string
          ip_address: string
          ip_hash: string
          signature_hash: string
          signed_at: string
          user_agent: string | null
          user_email: string
          user_id: string
          user_role: string
        }
        Insert: {
          acknowledgment_text: string
          batch_id: string
          id?: string
          ip_address: string
          ip_hash: string
          signature_hash: string
          signed_at?: string
          user_agent?: string | null
          user_email: string
          user_id: string
          user_role: string
        }
        Update: {
          acknowledgment_text?: string
          batch_id?: string
          id?: string
          ip_address?: string
          ip_hash?: string
          signature_hash?: string
          signed_at?: string
          user_agent?: string | null
          user_email?: string
          user_id?: string
          user_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "rol_financial_signoffs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "rol_bank_export_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      rol_revenue_ledger: {
        Row: {
          commission_amount: number
          commission_rate: number
          created_at: string
          currency: string
          eligible_at: string | null
          escrow_release_date: string | null
          export_batch_id: string | null
          exported_at: string | null
          gross_amount: number
          id: string
          idempotency_key: string
          immutable_hash: string
          net_amount: number
          property_id: string
          reversal_reason: string | null
          reverses_ledger_id: string | null
          source_id: string
          source_type: string
          status: string
          updated_at: string
        }
        Insert: {
          commission_amount: number
          commission_rate: number
          created_at?: string
          currency?: string
          eligible_at?: string | null
          escrow_release_date?: string | null
          export_batch_id?: string | null
          exported_at?: string | null
          gross_amount: number
          id?: string
          idempotency_key: string
          immutable_hash: string
          net_amount?: number
          property_id: string
          reversal_reason?: string | null
          reverses_ledger_id?: string | null
          source_id: string
          source_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          currency?: string
          eligible_at?: string | null
          escrow_release_date?: string | null
          export_batch_id?: string | null
          exported_at?: string | null
          gross_amount?: number
          id?: string
          idempotency_key?: string
          immutable_hash?: string
          net_amount?: number
          property_id?: string
          reversal_reason?: string | null
          reverses_ledger_id?: string | null
          source_id?: string
          source_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rol_revenue_ledger_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rol_revenue_ledger_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rol_revenue_ledger_reverses_ledger_id_fkey"
            columns: ["reverses_ledger_id"]
            isOneToOne: false
            referencedRelation: "rol_revenue_ledger"
            referencedColumns: ["id"]
          },
        ]
      }
      supporting_systems: {
        Row: {
          account_owner: string | null
          category: string | null
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          login_password_encrypted: string | null
          login_username: string | null
          system_function: string | null
          system_name: string
          system_url: string | null
          updated_at: string | null
        }
        Insert: {
          account_owner?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          login_password_encrypted?: string | null
          login_username?: string | null
          system_function?: string | null
          system_name: string
          system_url?: string | null
          updated_at?: string | null
        }
        Update: {
          account_owner?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          login_password_encrypted?: string | null
          login_username?: string | null
          system_function?: string | null
          system_name?: string
          system_url?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      survey_responses: {
        Row: {
          business_name: string
          client_email: string
          contact_details: string | null
          created_at: string | null
          id: string
          report_sent_at: string | null
          response_data: Json
          submitted_at: string | null
        }
        Insert: {
          business_name: string
          client_email: string
          contact_details?: string | null
          created_at?: string | null
          id?: string
          report_sent_at?: string | null
          response_data: Json
          submitted_at?: string | null
        }
        Update: {
          business_name?: string
          client_email?: string
          contact_details?: string | null
          created_at?: string | null
          id?: string
          report_sent_at?: string | null
          response_data?: Json
          submitted_at?: string | null
        }
        Relationships: []
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
            foreignKeyName: "sync_logs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings_decrypted"
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
      system_alerts: {
        Row: {
          alert_type: string
          component_key: string | null
          created_at: string
          expires_at: string | null
          id: string
          is_resolved: boolean
          message: string
          metadata: Json | null
          property_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          title: string
        }
        Insert: {
          alert_type: string
          component_key?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_resolved?: boolean
          message: string
          metadata?: Json | null
          property_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          title: string
        }
        Update: {
          alert_type?: string
          component_key?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_resolved?: boolean
          message?: string
          metadata?: Json | null
          property_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_alerts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_alerts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      system_health_aggregates: {
        Row: {
          avg_latency_ms: number | null
          component_key: string
          date: string
          degraded_count: number | null
          failed_count: number | null
          healthy_count: number | null
          hour: number
          id: string
          last_status: Database["public"]["Enums"]["health_status"] | null
          p95_latency_ms: number | null
          total_checks: number | null
          updated_at: string | null
        }
        Insert: {
          avg_latency_ms?: number | null
          component_key: string
          date: string
          degraded_count?: number | null
          failed_count?: number | null
          healthy_count?: number | null
          hour: number
          id?: string
          last_status?: Database["public"]["Enums"]["health_status"] | null
          p95_latency_ms?: number | null
          total_checks?: number | null
          updated_at?: string | null
        }
        Update: {
          avg_latency_ms?: number | null
          component_key?: string
          date?: string
          degraded_count?: number | null
          failed_count?: number | null
          healthy_count?: number | null
          hour?: number
          id?: string
          last_status?: Database["public"]["Enums"]["health_status"] | null
          p95_latency_ms?: number | null
          total_checks?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      system_health_checks: {
        Row: {
          checked_at: string
          component_key: string
          created_at: string | null
          error_code: string | null
          error_message: string | null
          id: string
          latency_ms: number | null
          metadata: Json | null
          response_data: Json | null
          status: Database["public"]["Enums"]["health_status"]
        }
        Insert: {
          checked_at?: string
          component_key: string
          created_at?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          metadata?: Json | null
          response_data?: Json | null
          status: Database["public"]["Enums"]["health_status"]
        }
        Update: {
          checked_at?: string
          component_key?: string
          created_at?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          metadata?: Json | null
          response_data?: Json | null
          status?: Database["public"]["Enums"]["health_status"]
        }
        Relationships: [
          {
            foreignKeyName: "system_health_checks_component_key_fkey"
            columns: ["component_key"]
            isOneToOne: false
            referencedRelation: "system_health_components"
            referencedColumns: ["component_key"]
          },
        ]
      }
      system_health_components: {
        Row: {
          check_interval_minutes: number | null
          component_key: string
          component_name: string
          component_type: Database["public"]["Enums"]["component_type"]
          created_at: string | null
          description: string | null
          expected_latency_ms: number | null
          health_check_endpoint: string | null
          id: string
          is_active: boolean | null
          is_critical: boolean | null
          retry_count: number | null
          updated_at: string | null
        }
        Insert: {
          check_interval_minutes?: number | null
          component_key: string
          component_name: string
          component_type: Database["public"]["Enums"]["component_type"]
          created_at?: string | null
          description?: string | null
          expected_latency_ms?: number | null
          health_check_endpoint?: string | null
          id?: string
          is_active?: boolean | null
          is_critical?: boolean | null
          retry_count?: number | null
          updated_at?: string | null
        }
        Update: {
          check_interval_minutes?: number | null
          component_key?: string
          component_name?: string
          component_type?: Database["public"]["Enums"]["component_type"]
          created_at?: string | null
          description?: string | null
          expected_latency_ms?: number | null
          health_check_endpoint?: string | null
          id?: string
          is_active?: boolean | null
          is_critical?: boolean | null
          retry_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_help_views: {
        Row: {
          article_id: string | null
          id: string
          user_id: string
          viewed_at: string | null
          was_helpful: boolean | null
        }
        Insert: {
          article_id?: string | null
          id?: string
          user_id: string
          viewed_at?: string | null
          was_helpful?: boolean | null
        }
        Update: {
          article_id?: string | null
          id?: string
          user_id?: string
          viewed_at?: string | null
          was_helpful?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "user_help_views_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "help_articles"
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
      wizard_audit_log: {
        Row: {
          action: string | null
          after_state: Json | null
          before_state: Json | null
          changed_at: string | null
          changed_by: string | null
          entity_id: string
          entity_type: string | null
          id: string
        }
        Insert: {
          action?: string | null
          after_state?: Json | null
          before_state?: Json | null
          changed_at?: string | null
          changed_by?: string | null
          entity_id: string
          entity_type?: string | null
          id?: string
        }
        Update: {
          action?: string | null
          after_state?: Json | null
          before_state?: Json | null
          changed_at?: string | null
          changed_by?: string | null
          entity_id?: string
          entity_type?: string | null
          id?: string
        }
        Relationships: []
      }
    }
    Views: {
      bookings_decrypted: {
        Row: {
          adults: number | null
          check_in_date: string | null
          check_out_date: string | null
          children: number | null
          created_at: string | null
          external_reservation_id: string | null
          guest_email: string | null
          guest_email_encrypted: string | null
          guest_name: string | null
          guest_name_encrypted: string | null
          guest_phone: string | null
          guest_phone_encrypted: string | null
          id: string | null
          infants: number | null
          paid_at: string | null
          payment_intent_id: string | null
          payment_method: string | null
          payment_reference: string | null
          payment_status: string | null
          property_id: string | null
          rate_type_id: string | null
          room_type_id: string | null
          rooms: Json | null
          special_requests: string | null
          status: string | null
          teens: number | null
          total_price: number | null
          updated_at: string | null
          user_id: string | null
          voucher: string | null
        }
        Insert: {
          adults?: number | null
          check_in_date?: string | null
          check_out_date?: string | null
          children?: number | null
          created_at?: string | null
          external_reservation_id?: string | null
          guest_email?: never
          guest_email_encrypted?: string | null
          guest_name?: never
          guest_name_encrypted?: string | null
          guest_phone?: never
          guest_phone_encrypted?: string | null
          id?: string | null
          infants?: number | null
          paid_at?: string | null
          payment_intent_id?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          property_id?: string | null
          rate_type_id?: string | null
          room_type_id?: string | null
          rooms?: Json | null
          special_requests?: string | null
          status?: string | null
          teens?: number | null
          total_price?: number | null
          updated_at?: string | null
          user_id?: string | null
          voucher?: string | null
        }
        Update: {
          adults?: number | null
          check_in_date?: string | null
          check_out_date?: string | null
          children?: number | null
          created_at?: string | null
          external_reservation_id?: string | null
          guest_email?: never
          guest_email_encrypted?: string | null
          guest_name?: never
          guest_name_encrypted?: string | null
          guest_phone?: never
          guest_phone_encrypted?: string | null
          id?: string | null
          infants?: number | null
          paid_at?: string | null
          payment_intent_id?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          property_id?: string | null
          rate_type_id?: string | null
          room_type_id?: string | null
          rooms?: Json | null
          special_requests?: string | null
          status?: string | null
          teens?: number | null
          total_price?: number | null
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
          city: string | null
          country: string | null
          created_at: string | null
          description: string | null
          external_id: string | null
          external_system: string | null
          hero_listing: boolean | null
          id: string | null
          images: Json | null
          is_active: boolean | null
          latitude: number | null
          longitude: number | null
          max_guests: number | null
          name: string | null
          navigation_tags: string[] | null
          price_per_night: number | null
          property_type: string | null
          property_url: string | null
          slug: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          amenities?: Json | null
          bathrooms?: number | null
          bedrooms?: number | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          description?: string | null
          external_id?: string | null
          external_system?: string | null
          hero_listing?: boolean | null
          id?: string | null
          images?: Json | null
          is_active?: boolean | null
          latitude?: number | null
          longitude?: number | null
          max_guests?: number | null
          name?: string | null
          navigation_tags?: string[] | null
          price_per_night?: number | null
          property_type?: string | null
          property_url?: string | null
          slug?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          amenities?: Json | null
          bathrooms?: number | null
          bedrooms?: number | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          description?: string | null
          external_id?: string | null
          external_system?: string | null
          hero_listing?: boolean | null
          id?: string | null
          images?: Json | null
          is_active?: boolean | null
          latitude?: number | null
          longitude?: number | null
          max_guests?: number | null
          name?: string | null
          navigation_tags?: string[] | null
          price_per_night?: number | null
          property_type?: string | null
          property_url?: string | null
          slug?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_view_rol_pulse: { Args: { user_id: string }; Returns: boolean }
      decrypt_sensitive_text: {
        Args: { encrypted_data: string }
        Returns: string
      }
      decrypt_system_password: {
        Args: { encrypted_data: string }
        Returns: string
      }
      encrypt_sensitive_text: { Args: { plaintext: string }; Returns: string }
      encrypt_system_password: { Args: { plaintext: string }; Returns: string }
      generate_journal_slug: {
        Args: { journal_id: string; journal_title: string }
        Returns: string
      }
      generate_property_slug: {
        Args: { property_id: string; property_name: string }
        Returns: string
      }
      get_booking_encryption_key: { Args: never; Returns: string }
      get_user_audit_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["audit_user_role"]
      }
      get_user_email: { Args: { _user_id: string }; Returns: string }
      get_user_help_role: { Args: { _user_id: string }; Returns: string }
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
      is_property_owner: {
        Args: { _property_id: string; _user_id: string }
        Returns: boolean
      }
      trigger_daily_health_report: { Args: never; Returns: undefined }
      trigger_system_health_check: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "user" | "dev" | "fearless_leader"
      audit_action_type:
        | "create"
        | "update"
        | "delete"
        | "permission_change"
        | "sync"
        | "export"
        | "login"
        | "other"
      audit_request_origin:
        | "admin_ui"
        | "edge_function"
        | "api"
        | "cron"
        | "db_trigger"
      audit_user_role: "admin" | "dev" | "owner" | "system"
      component_type: "pms" | "internal" | "external" | "infrastructure"
      health_status: "healthy" | "degraded" | "failed" | "unknown"
      help_impact_level: "critical" | "warning" | "info"
      pms_integration_status:
        | "coming_soon"
        | "in_development"
        | "parked"
        | "in_testing"
        | "deployed"
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
      app_role: ["admin", "user", "dev", "fearless_leader"],
      audit_action_type: [
        "create",
        "update",
        "delete",
        "permission_change",
        "sync",
        "export",
        "login",
        "other",
      ],
      audit_request_origin: [
        "admin_ui",
        "edge_function",
        "api",
        "cron",
        "db_trigger",
      ],
      audit_user_role: ["admin", "dev", "owner", "system"],
      component_type: ["pms", "internal", "external", "infrastructure"],
      health_status: ["healthy", "degraded", "failed", "unknown"],
      help_impact_level: ["critical", "warning", "info"],
      pms_integration_status: [
        "coming_soon",
        "in_development",
        "parked",
        "in_testing",
        "deployed",
      ],
    },
  },
} as const
