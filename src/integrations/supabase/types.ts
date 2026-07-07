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
          referrer_url: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_ip: string | null
          source_page: string | null
          status: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          message?: string | null
          referrer_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_ip?: string | null
          source_page?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          message?: string | null
          referrer_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_ip?: string | null
          source_page?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
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
      api_rate_limits: {
        Row: {
          burst_limit: number
          created_at: string
          daily_limit: number
          id: string
          is_active: boolean
          property_id: string
          requests_per_hour: number
          requests_per_minute: number
          updated_at: string
        }
        Insert: {
          burst_limit?: number
          created_at?: string
          daily_limit?: number
          id?: string
          is_active?: boolean
          property_id: string
          requests_per_hour?: number
          requests_per_minute?: number
          updated_at?: string
        }
        Update: {
          burst_limit?: number
          created_at?: string
          daily_limit?: number
          id?: string
          is_active?: boolean
          property_id?: string
          requests_per_hour?: number
          requests_per_minute?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_rate_limits_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "api_rate_limits_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_rate_limits_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      api_request_log: {
        Row: {
          action: string
          api_key_id: string | null
          api_version: string
          created_at: string
          endpoint: string
          error_code: string | null
          id: string
          ip_address: string | null
          property_id: string | null
          request_body_size: number | null
          response_time_ms: number | null
          status_code: number
          user_agent: string | null
        }
        Insert: {
          action: string
          api_key_id?: string | null
          api_version?: string
          created_at?: string
          endpoint?: string
          error_code?: string | null
          id?: string
          ip_address?: string | null
          property_id?: string | null
          request_body_size?: number | null
          response_time_ms?: number | null
          status_code: number
          user_agent?: string | null
        }
        Update: {
          action?: string
          api_key_id?: string | null
          api_version?: string
          created_at?: string
          endpoint?: string
          error_code?: string | null
          id?: string
          ip_address?: string | null
          property_id?: string | null
          request_body_size?: number | null
          response_time_ms?: number | null
          status_code?: number
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_request_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "api_request_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_request_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
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
      billing_global_defaults: {
        Row: {
          default_commission_rate: number | null
          default_subscription_fee: number | null
          default_transaction_fee: number | null
          id: string
          notes: string | null
          payment_facilitator_fee: number | null
          referral_clawback_days: number | null
          referral_first_year_rate: number | null
          referral_residual_months: number | null
          referral_residual_rate: number | null
          strategy: Database["public"]["Enums"]["billing_strategy"]
          tier_pricing_json: Json | null
          updated_at: string | null
          updated_by: string | null
          white_label_monthly_fee: number | null
        }
        Insert: {
          default_commission_rate?: number | null
          default_subscription_fee?: number | null
          default_transaction_fee?: number | null
          id?: string
          notes?: string | null
          payment_facilitator_fee?: number | null
          referral_clawback_days?: number | null
          referral_first_year_rate?: number | null
          referral_residual_months?: number | null
          referral_residual_rate?: number | null
          strategy: Database["public"]["Enums"]["billing_strategy"]
          tier_pricing_json?: Json | null
          updated_at?: string | null
          updated_by?: string | null
          white_label_monthly_fee?: number | null
        }
        Update: {
          default_commission_rate?: number | null
          default_subscription_fee?: number | null
          default_transaction_fee?: number | null
          id?: string
          notes?: string | null
          payment_facilitator_fee?: number | null
          referral_clawback_days?: number | null
          referral_first_year_rate?: number | null
          referral_residual_months?: number | null
          referral_residual_rate?: number | null
          strategy?: Database["public"]["Enums"]["billing_strategy"]
          tier_pricing_json?: Json | null
          updated_at?: string | null
          updated_by?: string | null
          white_label_monthly_fee?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_global_defaults_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_mappings: {
        Row: {
          description: string | null
          field: string | null
          id: string
          strategy: Database["public"]["Enums"]["billing_strategy"] | null
          value: string | null
        }
        Insert: {
          description?: string | null
          field?: string | null
          id?: string
          strategy?: Database["public"]["Enums"]["billing_strategy"] | null
          value?: string | null
        }
        Update: {
          description?: string | null
          field?: string | null
          id?: string
          strategy?: Database["public"]["Enums"]["billing_strategy"] | null
          value?: string | null
        }
        Relationships: []
      }
      billing_transactions: {
        Row: {
          amount: number
          calculated_by: string | null
          created_at: string | null
          currency: string | null
          id: string
          metadata: Json | null
          owner_id: string | null
          property_id: string | null
          reference_id: string | null
          type: string
        }
        Insert: {
          amount: number
          calculated_by?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          metadata?: Json | null
          owner_id?: string | null
          property_id?: string | null
          reference_id?: string | null
          type: string
        }
        Update: {
          amount?: number
          calculated_by?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          metadata?: Json | null
          owner_id?: string | null
          property_id?: string | null
          reference_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_transactions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_transactions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "billing_transactions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_transactions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
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
      booking_revenue_attributions: {
        Row: {
          basis_amount: number
          booking_id: string
          created_at: string
          currency: string
          from_property_id: string
          id: string
          invoice_id: string | null
          origin_type: Database["public"]["Enums"]["portfolio_share_origin"]
          origin_url: string | null
          portfolio_id: string
          share_amount: number
          share_percent: number
          status: Database["public"]["Enums"]["portfolio_share_attr_status"]
          to_property_id: string
          updated_at: string
        }
        Insert: {
          basis_amount?: number
          booking_id: string
          created_at?: string
          currency?: string
          from_property_id: string
          id?: string
          invoice_id?: string | null
          origin_type: Database["public"]["Enums"]["portfolio_share_origin"]
          origin_url?: string | null
          portfolio_id: string
          share_amount?: number
          share_percent?: number
          status?: Database["public"]["Enums"]["portfolio_share_attr_status"]
          to_property_id: string
          updated_at?: string
        }
        Update: {
          basis_amount?: number
          booking_id?: string
          created_at?: string
          currency?: string
          from_property_id?: string
          id?: string
          invoice_id?: string | null
          origin_type?: Database["public"]["Enums"]["portfolio_share_origin"]
          origin_url?: string | null
          portfolio_id?: string
          share_amount?: number
          share_percent?: number
          status?: Database["public"]["Enums"]["portfolio_share_attr_status"]
          to_property_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_revenue_attributions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_revenue_attributions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings_decrypted"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_revenue_attributions_from_property_id_fkey"
            columns: ["from_property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "booking_revenue_attributions_from_property_id_fkey"
            columns: ["from_property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_revenue_attributions_from_property_id_fkey"
            columns: ["from_property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_revenue_attributions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "portfolio_share_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_revenue_attributions_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "property_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_revenue_attributions_to_property_id_fkey"
            columns: ["to_property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "booking_revenue_attributions_to_property_id_fkey"
            columns: ["to_property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_revenue_attributions_to_property_id_fkey"
            columns: ["to_property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_sync_status: {
        Row: {
          booking_id: string
          created_at: string | null
          error_message: string | null
          external_booking_id: string | null
          external_system: string
          id: string
          last_action: string | null
          last_action_at: string | null
          last_error_message: string | null
          last_sync_at: string | null
          modification_attempts: number | null
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
          last_action?: string | null
          last_action_at?: string | null
          last_error_message?: string | null
          last_sync_at?: string | null
          modification_attempts?: number | null
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
          last_action?: string | null
          last_action_at?: string | null
          last_error_message?: string | null
          last_sync_at?: string | null
          modification_attempts?: number | null
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
          cancellation_reason: string | null
          charges_breakdown: Json | null
          check_in_date: string
          check_out_date: string
          children: number | null
          commission_calculated_at: string | null
          commission_rate_applied: number | null
          commission_type: string | null
          created_at: string | null
          external_reservation_id: string | null
          guest_email: string
          guest_email_encrypted: string | null
          guest_name: string
          guest_name_encrypted: string | null
          guest_nationality: string | null
          guest_phone: string | null
          guest_phone_encrypted: string | null
          id: string
          infants: number | null
          integration_type: string | null
          last_modified_at: string | null
          modification_notes: Json | null
          modified_by: string | null
          origin_portfolio_id: string | null
          origin_property_id: string | null
          origin_type: string | null
          origin_url: string | null
          paid_at: string | null
          payment_intent_id: string | null
          payment_method: string | null
          payment_reference: string | null
          payment_status: string | null
          pets: number | null
          property_id: string
          rate_type_id: string | null
          requires_intervention: boolean | null
          rolos_check_in_time: string | null
          rolos_check_out_time: string | null
          rolos_folio_id: string | null
          rolos_guest_id: string | null
          rolos_rate_plan_id: string | null
          rolos_room_ids: string[] | null
          room_type_id: string | null
          rooms: Json | null
          source_url: string | null
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
          cancellation_reason?: string | null
          charges_breakdown?: Json | null
          check_in_date: string
          check_out_date: string
          children?: number | null
          commission_calculated_at?: string | null
          commission_rate_applied?: number | null
          commission_type?: string | null
          created_at?: string | null
          external_reservation_id?: string | null
          guest_email: string
          guest_email_encrypted?: string | null
          guest_name: string
          guest_name_encrypted?: string | null
          guest_nationality?: string | null
          guest_phone?: string | null
          guest_phone_encrypted?: string | null
          id?: string
          infants?: number | null
          integration_type?: string | null
          last_modified_at?: string | null
          modification_notes?: Json | null
          modified_by?: string | null
          origin_portfolio_id?: string | null
          origin_property_id?: string | null
          origin_type?: string | null
          origin_url?: string | null
          paid_at?: string | null
          payment_intent_id?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          pets?: number | null
          property_id: string
          rate_type_id?: string | null
          requires_intervention?: boolean | null
          rolos_check_in_time?: string | null
          rolos_check_out_time?: string | null
          rolos_folio_id?: string | null
          rolos_guest_id?: string | null
          rolos_rate_plan_id?: string | null
          rolos_room_ids?: string[] | null
          room_type_id?: string | null
          rooms?: Json | null
          source_url?: string | null
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
          cancellation_reason?: string | null
          charges_breakdown?: Json | null
          check_in_date?: string
          check_out_date?: string
          children?: number | null
          commission_calculated_at?: string | null
          commission_rate_applied?: number | null
          commission_type?: string | null
          created_at?: string | null
          external_reservation_id?: string | null
          guest_email?: string
          guest_email_encrypted?: string | null
          guest_name?: string
          guest_name_encrypted?: string | null
          guest_nationality?: string | null
          guest_phone?: string | null
          guest_phone_encrypted?: string | null
          id?: string
          infants?: number | null
          integration_type?: string | null
          last_modified_at?: string | null
          modification_notes?: Json | null
          modified_by?: string | null
          origin_portfolio_id?: string | null
          origin_property_id?: string | null
          origin_type?: string | null
          origin_url?: string | null
          paid_at?: string | null
          payment_intent_id?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          pets?: number | null
          property_id?: string
          rate_type_id?: string | null
          requires_intervention?: boolean | null
          rolos_check_in_time?: string | null
          rolos_check_out_time?: string | null
          rolos_folio_id?: string | null
          rolos_guest_id?: string | null
          rolos_rate_plan_id?: string | null
          rolos_room_ids?: string[] | null
          room_type_id?: string | null
          rooms?: Json | null
          source_url?: string | null
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
            foreignKeyName: "bookings_origin_portfolio_id_fkey"
            columns: ["origin_portfolio_id"]
            isOneToOne: false
            referencedRelation: "property_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_origin_property_id_fkey"
            columns: ["origin_property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "bookings_origin_property_id_fkey"
            columns: ["origin_property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_origin_property_id_fkey"
            columns: ["origin_property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
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
          {
            foreignKeyName: "bookings_rolos_guest_id_fkey"
            columns: ["rolos_guest_id"]
            isOneToOne: false
            referencedRelation: "rolos_guest_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_rolos_rate_plan_id_fkey"
            columns: ["rolos_rate_plan_id"]
            isOneToOne: false
            referencedRelation: "rolos_rate_plans"
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
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
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
      connect_inquiries: {
        Row: {
          company: string | null
          created_at: string | null
          current_pms: string | null
          email: string
          id: string
          message: string | null
          name: string
          property_count: string | null
          source: string | null
          status: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string | null
          current_pms?: string | null
          email: string
          id?: string
          message?: string | null
          name: string
          property_count?: string | null
          source?: string | null
          status?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string | null
          current_pms?: string | null
          email?: string
          id?: string
          message?: string | null
          name?: string
          property_count?: string | null
          source?: string | null
          status?: string | null
        }
        Relationships: []
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
      dev_tasks: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_archived: boolean
          priority: Database["public"]["Enums"]["dev_task_priority"]
          status: Database["public"]["Enums"]["dev_task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean
          priority?: Database["public"]["Enums"]["dev_task_priority"]
          status?: Database["public"]["Enums"]["dev_task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean
          priority?: Database["public"]["Enums"]["dev_task_priority"]
          status?: Database["public"]["Enums"]["dev_task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      experience_vouchers: {
        Row: {
          code: string
          created_at: string | null
          description: string | null
          discount_percent: number | null
          id: string
          itinerary_id: string | null
          redeemed_at: string | null
          valid_until: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          description?: string | null
          discount_percent?: number | null
          id?: string
          itinerary_id?: string | null
          redeemed_at?: string | null
          valid_until?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          description?: string | null
          discount_percent?: number | null
          id?: string
          itinerary_id?: string | null
          redeemed_at?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "experience_vouchers_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
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
      guest_portal_tokens: {
        Row: {
          booking_id: string
          created_at: string | null
          expires_at: string
          guest_email: string
          id: string
          token: string
          used_for: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string | null
          expires_at?: string
          guest_email: string
          id?: string
          token?: string
          used_for?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string | null
          expires_at?: string
          guest_email?: string
          id?: string
          token?: string
          used_for?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_portal_tokens_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_portal_tokens_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings_decrypted"
            referencedColumns: ["id"]
          },
        ]
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
          linked_rolos_id: string | null
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
          rentalsunited_property_id: string | null
          room_size: number | null
          room_size_unit: string | null
          security_deposit: number | null
          tax_rate: number | null
          thumbnail_url: string | null
          total_units: number | null
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
          linked_rolos_id?: string | null
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
          rentalsunited_property_id?: string | null
          room_size?: number | null
          room_size_unit?: string | null
          security_deposit?: number | null
          tax_rate?: number | null
          thumbnail_url?: string | null
          total_units?: number | null
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
          linked_rolos_id?: string | null
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
          rentalsunited_property_id?: string | null
          room_size?: number | null
          room_size_unit?: string | null
          security_deposit?: number | null
          tax_rate?: number | null
          thumbnail_url?: string | null
          total_units?: number | null
          updated_at?: string | null
          wifi_network?: string | null
          wifi_password?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hostfully_room_types_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
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
      hostfully_unit_map: {
        Row: {
          created_at: string | null
          hostfully_uid: string
          id: string
          is_active: boolean | null
          property_id: string
          room_type_id: string
          unit_name: string | null
          unit_number: string | null
        }
        Insert: {
          created_at?: string | null
          hostfully_uid: string
          id?: string
          is_active?: boolean | null
          property_id: string
          room_type_id: string
          unit_name?: string | null
          unit_number?: string | null
        }
        Update: {
          created_at?: string | null
          hostfully_uid?: string
          id?: string
          is_active?: boolean | null
          property_id?: string
          room_type_id?: string
          unit_name?: string | null
          unit_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hostfully_unit_map_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "hostfully_unit_map_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostfully_unit_map_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostfully_unit_map_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "hostfully_room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      hyperguest_cert_runs: {
        Row: {
          created_at: string
          exported_at: string | null
          finished_at: string | null
          full_log: Json | null
          id: string
          property_id: string | null
          sandbox_hotel_id: string | null
          started_at: string
          status: string
          steps: Json
          token_hash: string
        }
        Insert: {
          created_at?: string
          exported_at?: string | null
          finished_at?: string | null
          full_log?: Json | null
          id?: string
          property_id?: string | null
          sandbox_hotel_id?: string | null
          started_at?: string
          status?: string
          steps?: Json
          token_hash: string
        }
        Update: {
          created_at?: string
          exported_at?: string | null
          finished_at?: string | null
          full_log?: Json | null
          id?: string
          property_id?: string | null
          sandbox_hotel_id?: string | null
          started_at?: string
          status?: string
          steps?: Json
          token_hash?: string
        }
        Relationships: []
      }
      hyperguest_portal_config: {
        Row: {
          enabled: boolean
          id: boolean
          notes: string | null
          rotated_at: string
          rotated_by: string | null
          token: string
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          id?: boolean
          notes?: string | null
          rotated_at?: string
          rotated_by?: string | null
          token: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          id?: boolean
          notes?: string | null
          rotated_at?: string
          rotated_by?: string | null
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      integration_configs: {
        Row: {
          allowed_domains: string[] | null
          api_key: string | null
          api_version: string
          config: Json | null
          created_at: string | null
          id: string
          integration_type: string
          is_active: boolean | null
          property_id: string
          updated_at: string | null
        }
        Insert: {
          allowed_domains?: string[] | null
          api_key?: string | null
          api_version?: string
          config?: Json | null
          created_at?: string | null
          id?: string
          integration_type: string
          is_active?: boolean | null
          property_id: string
          updated_at?: string | null
        }
        Update: {
          allowed_domains?: string[] | null
          api_key?: string | null
          api_version?: string
          config?: Json | null
          created_at?: string | null
          id?: string
          integration_type?: string
          is_active?: boolean | null
          property_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_configs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "integration_configs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_configs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_logs: {
        Row: {
          created_at: string | null
          event: string
          id: string
          integration_type: string
          metadata: Json | null
          property_id: string
        }
        Insert: {
          created_at?: string | null
          event: string
          id?: string
          integration_type: string
          metadata?: Json | null
          property_id: string
        }
        Update: {
          created_at?: string | null
          event?: string
          id?: string
          integration_type?: string
          metadata?: Json | null
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_logs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "integration_logs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_logs_property_id_fkey"
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
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
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
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
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
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
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
          metadata: Json | null
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
          metadata?: Json | null
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
          metadata?: Json | null
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
      owner_invoices: {
        Row: {
          created_at: string | null
          id: string
          net_payout: number | null
          owner_id: string | null
          pdf_url: string | null
          period_end: string
          period_start: string
          status: string | null
          total_commission: number | null
          total_fees: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          net_payout?: number | null
          owner_id?: string | null
          pdf_url?: string | null
          period_end: string
          period_start: string
          status?: string | null
          total_commission?: number | null
          total_fees?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          net_payout?: number | null
          owner_id?: string | null
          pdf_url?: string | null
          period_end?: string
          period_start?: string
          status?: string | null
          total_commission?: number | null
          total_fees?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "owner_invoices_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      payment_gateway_registry: {
        Row: {
          created_at: string
          display_name: string
          docs_url: string | null
          edge_function_name: string
          gateway_key: string
          id: string
          is_active: boolean
          is_international: boolean
          payment_method: string
          supported_countries: string[]
          supported_currencies: string[]
          updated_at: string
          website_url: string | null
        }
        Insert: {
          created_at?: string
          display_name: string
          docs_url?: string | null
          edge_function_name: string
          gateway_key: string
          id?: string
          is_active?: boolean
          is_international?: boolean
          payment_method?: string
          supported_countries?: string[]
          supported_currencies?: string[]
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string
          docs_url?: string | null
          edge_function_name?: string
          gateway_key?: string
          id?: string
          is_active?: boolean
          is_international?: boolean
          payment_method?: string
          supported_countries?: string[]
          supported_currencies?: string[]
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      payment_transactions: {
        Row: {
          amount: number
          booking_id: string | null
          created_at: string | null
          currency: string | null
          gateway_response: Json | null
          id: string
          m_payment_id: string | null
          payment_method: string | null
          payment_provider: string | null
          pf_payment_id: string | null
          signature_valid: boolean | null
          status: string
          transaction_ref: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          booking_id?: string | null
          created_at?: string | null
          currency?: string | null
          gateway_response?: Json | null
          id?: string
          m_payment_id?: string | null
          payment_method?: string | null
          payment_provider?: string | null
          pf_payment_id?: string | null
          signature_valid?: boolean | null
          status: string
          transaction_ref?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          booking_id?: string | null
          created_at?: string | null
          currency?: string | null
          gateway_response?: Json | null
          id?: string
          m_payment_id?: string | null
          payment_method?: string | null
          payment_provider?: string | null
          pf_payment_id?: string | null
          signature_valid?: boolean | null
          status?: string
          transaction_ref?: string | null
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
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
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
          api_secret: string | null
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
          api_secret?: string | null
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
          api_secret?: string | null
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
          assignment_mode: string | null
          child_unit_ids: Json | null
          collection_id: string | null
          created_at: string | null
          experience_mapping: Json | null
          external_id: string
          external_name: string | null
          id: string
          internal_id: string | null
          internal_name: string | null
          is_active: boolean | null
          mapping_type: string
          metadata: Json | null
          parent_room_type_id: string | null
          property_id: string | null
          system_type: string
          updated_at: string | null
        }
        Insert: {
          assignment_mode?: string | null
          child_unit_ids?: Json | null
          collection_id?: string | null
          created_at?: string | null
          experience_mapping?: Json | null
          external_id: string
          external_name?: string | null
          id?: string
          internal_id?: string | null
          internal_name?: string | null
          is_active?: boolean | null
          mapping_type: string
          metadata?: Json | null
          parent_room_type_id?: string | null
          property_id?: string | null
          system_type: string
          updated_at?: string | null
        }
        Update: {
          assignment_mode?: string | null
          child_unit_ids?: Json | null
          collection_id?: string | null
          created_at?: string | null
          experience_mapping?: Json | null
          external_id?: string
          external_name?: string | null
          id?: string
          internal_id?: string | null
          internal_name?: string | null
          is_active?: boolean | null
          mapping_type?: string
          metadata?: Json | null
          parent_room_type_id?: string | null
          property_id?: string | null
          system_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pms_mappings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
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
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
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
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
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
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
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
          has_cancel: boolean | null
          has_docs: boolean | null
          has_edge: boolean | null
          has_get: boolean | null
          has_health: boolean | null
          has_modify: boolean | null
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
          has_cancel?: boolean | null
          has_docs?: boolean | null
          has_edge?: boolean | null
          has_get?: boolean | null
          has_health?: boolean | null
          has_modify?: boolean | null
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
          has_cancel?: boolean | null
          has_docs?: boolean | null
          has_edge?: boolean | null
          has_get?: boolean | null
          has_health?: boolean | null
          has_modify?: boolean | null
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
      portfolio_revenue_share_config: {
        Row: {
          created_at: string
          id: string
          include_cross_property_origin: boolean
          include_portfolio_origin: boolean
          notes: string | null
          portfolio_id: string
          portfolio_origin_default_percent: number
          share_basis: Database["public"]["Enums"]["portfolio_share_basis"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          include_cross_property_origin?: boolean
          include_portfolio_origin?: boolean
          notes?: string | null
          portfolio_id: string
          portfolio_origin_default_percent?: number
          share_basis?: Database["public"]["Enums"]["portfolio_share_basis"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          include_cross_property_origin?: boolean
          include_portfolio_origin?: boolean
          notes?: string | null
          portfolio_id?: string
          portfolio_origin_default_percent?: number
          share_basis?: Database["public"]["Enums"]["portfolio_share_basis"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_revenue_share_config_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: true
            referencedRelation: "property_portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_revenue_share_pairs: {
        Row: {
          created_at: string
          from_property_id: string
          id: string
          portfolio_id: string
          set_by_role: string | null
          set_by_user_id: string | null
          share_percent: number
          to_property_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          from_property_id: string
          id?: string
          portfolio_id: string
          set_by_role?: string | null
          set_by_user_id?: string | null
          share_percent?: number
          to_property_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          from_property_id?: string
          id?: string
          portfolio_id?: string
          set_by_role?: string | null
          set_by_user_id?: string | null
          share_percent?: number
          to_property_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_revenue_share_pairs_from_property_id_fkey"
            columns: ["from_property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "portfolio_revenue_share_pairs_from_property_id_fkey"
            columns: ["from_property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_revenue_share_pairs_from_property_id_fkey"
            columns: ["from_property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_revenue_share_pairs_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "property_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_revenue_share_pairs_to_property_id_fkey"
            columns: ["to_property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "portfolio_revenue_share_pairs_to_property_id_fkey"
            columns: ["to_property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_revenue_share_pairs_to_property_id_fkey"
            columns: ["to_property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_share_invoices: {
        Row: {
          created_at: string
          currency: string
          from_property_id: string
          id: string
          invoice_number: string | null
          notes: string | null
          paid_at: string | null
          pdf_url: string | null
          period_end: string
          period_start: string
          portfolio_id: string
          sent_at: string | null
          status: Database["public"]["Enums"]["portfolio_share_invoice_status"]
          subtotal: number
          tax: number
          to_property_id: string
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          from_property_id: string
          id?: string
          invoice_number?: string | null
          notes?: string | null
          paid_at?: string | null
          pdf_url?: string | null
          period_end: string
          period_start: string
          portfolio_id: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["portfolio_share_invoice_status"]
          subtotal?: number
          tax?: number
          to_property_id: string
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          from_property_id?: string
          id?: string
          invoice_number?: string | null
          notes?: string | null
          paid_at?: string | null
          pdf_url?: string | null
          period_end?: string
          period_start?: string
          portfolio_id?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["portfolio_share_invoice_status"]
          subtotal?: number
          tax?: number
          to_property_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_share_invoices_from_property_id_fkey"
            columns: ["from_property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "portfolio_share_invoices_from_property_id_fkey"
            columns: ["from_property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_share_invoices_from_property_id_fkey"
            columns: ["from_property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_share_invoices_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "property_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_share_invoices_to_property_id_fkey"
            columns: ["to_property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "portfolio_share_invoices_to_property_id_fkey"
            columns: ["to_property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_share_invoices_to_property_id_fkey"
            columns: ["to_property_id"]
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
      promo_codes: {
        Row: {
          code: string
          conditions: Json | null
          created_at: string | null
          current_uses: number | null
          description: string | null
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean | null
          max_uses: number | null
          property_id: string | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          code: string
          conditions?: Json | null
          created_at?: string | null
          current_uses?: number | null
          description?: string | null
          discount_type: string
          discount_value: number
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          property_id?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          code?: string
          conditions?: Json | null
          created_at?: string | null
          current_uses?: number | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          property_id?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "promo_codes_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_codes_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          address: string
          ai_confidence_metadata: Json | null
          allow_custom_payment_provider: boolean
          amenities: Json | null
          bathrooms: number | null
          bedrooms: number | null
          benson_environment: string | null
          benson_property_code: string | null
          brand_accent_color: string | null
          brand_body_font: string | null
          brand_body_text_color: string | null
          brand_dark_bg_color: string | null
          brand_font_color: string | null
          brand_heading_font: string | null
          brand_heading_text_color: string | null
          brand_light_bg_color: string | null
          brand_logo_url: string | null
          brand_muted_text_color: string | null
          brand_override_enabled: boolean
          brand_primary_color: string | null
          brand_secondary_color: string | null
          checkfront_property_code: string | null
          city: string
          cloudbeds_property_id: string | null
          collections: Json | null
          commercial_model: string | null
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
          hyperguest_enabled: boolean
          hyperguest_environment: string
          hyperguest_hotel_id: string | null
          hyperguest_last_pull_at: string | null
          hyperguest_last_push_at: string | null
          hyperguest_last_static_sync_at: string | null
          id: string
          images: Json | null
          is_active: boolean | null
          is_rol_property: boolean | null
          is_test_property: boolean
          last_pms_sync_at: string | null
          latitude: number | null
          listing_intent: string | null
          listing_status: string | null
          littlehotelier_channel_code: string | null
          littlehotelier_region: string | null
          longitude: number | null
          max_guests: number
          multi_unit_config: Json | null
          name: string
          navigation_tags: string[] | null
          owner_email: string | null
          owner_name: string | null
          owner_notes: string | null
          owner_pms_credential_id: string | null
          payment_provider: string | null
          payment_providers: string[] | null
          permanently_deleted_at: string | null
          pms_managed_fields: string[] | null
          pms_readiness: string | null
          pms_sync_status: string | null
          price_per_night: number
          property_type: string
          property_url: string | null
          rentalsunited_building_id: string | null
          rentalsunited_property_id: string | null
          review_sentiment: Json | null
          short_description: string | null
          show_on_website: boolean | null
          siteminder_property_code: string | null
          slug: string | null
          timezone: string
          updated_at: string | null
          wetu_id: string | null
          what_its_really_like: string | null
          who_its_not_for: string | null
          who_this_suits: string | null
          why_this_place_matters: string | null
          why_we_chose_this_place: string | null
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          address: string
          ai_confidence_metadata?: Json | null
          allow_custom_payment_provider?: boolean
          amenities?: Json | null
          bathrooms?: number | null
          bedrooms?: number | null
          benson_environment?: string | null
          benson_property_code?: string | null
          brand_accent_color?: string | null
          brand_body_font?: string | null
          brand_body_text_color?: string | null
          brand_dark_bg_color?: string | null
          brand_font_color?: string | null
          brand_heading_font?: string | null
          brand_heading_text_color?: string | null
          brand_light_bg_color?: string | null
          brand_logo_url?: string | null
          brand_muted_text_color?: string | null
          brand_override_enabled?: boolean
          brand_primary_color?: string | null
          brand_secondary_color?: string | null
          checkfront_property_code?: string | null
          city: string
          cloudbeds_property_id?: string | null
          collections?: Json | null
          commercial_model?: string | null
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
          hyperguest_enabled?: boolean
          hyperguest_environment?: string
          hyperguest_hotel_id?: string | null
          hyperguest_last_pull_at?: string | null
          hyperguest_last_push_at?: string | null
          hyperguest_last_static_sync_at?: string | null
          id?: string
          images?: Json | null
          is_active?: boolean | null
          is_rol_property?: boolean | null
          is_test_property?: boolean
          last_pms_sync_at?: string | null
          latitude?: number | null
          listing_intent?: string | null
          listing_status?: string | null
          littlehotelier_channel_code?: string | null
          littlehotelier_region?: string | null
          longitude?: number | null
          max_guests?: number
          multi_unit_config?: Json | null
          name: string
          navigation_tags?: string[] | null
          owner_email?: string | null
          owner_name?: string | null
          owner_notes?: string | null
          owner_pms_credential_id?: string | null
          payment_provider?: string | null
          payment_providers?: string[] | null
          permanently_deleted_at?: string | null
          pms_managed_fields?: string[] | null
          pms_readiness?: string | null
          pms_sync_status?: string | null
          price_per_night: number
          property_type: string
          property_url?: string | null
          rentalsunited_building_id?: string | null
          rentalsunited_property_id?: string | null
          review_sentiment?: Json | null
          short_description?: string | null
          show_on_website?: boolean | null
          siteminder_property_code?: string | null
          slug?: string | null
          timezone?: string
          updated_at?: string | null
          wetu_id?: string | null
          what_its_really_like?: string | null
          who_its_not_for?: string | null
          who_this_suits?: string | null
          why_this_place_matters?: string | null
          why_we_chose_this_place?: string | null
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          address?: string
          ai_confidence_metadata?: Json | null
          allow_custom_payment_provider?: boolean
          amenities?: Json | null
          bathrooms?: number | null
          bedrooms?: number | null
          benson_environment?: string | null
          benson_property_code?: string | null
          brand_accent_color?: string | null
          brand_body_font?: string | null
          brand_body_text_color?: string | null
          brand_dark_bg_color?: string | null
          brand_font_color?: string | null
          brand_heading_font?: string | null
          brand_heading_text_color?: string | null
          brand_light_bg_color?: string | null
          brand_logo_url?: string | null
          brand_muted_text_color?: string | null
          brand_override_enabled?: boolean
          brand_primary_color?: string | null
          brand_secondary_color?: string | null
          checkfront_property_code?: string | null
          city?: string
          cloudbeds_property_id?: string | null
          collections?: Json | null
          commercial_model?: string | null
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
          hyperguest_enabled?: boolean
          hyperguest_environment?: string
          hyperguest_hotel_id?: string | null
          hyperguest_last_pull_at?: string | null
          hyperguest_last_push_at?: string | null
          hyperguest_last_static_sync_at?: string | null
          id?: string
          images?: Json | null
          is_active?: boolean | null
          is_rol_property?: boolean | null
          is_test_property?: boolean
          last_pms_sync_at?: string | null
          latitude?: number | null
          listing_intent?: string | null
          listing_status?: string | null
          littlehotelier_channel_code?: string | null
          littlehotelier_region?: string | null
          longitude?: number | null
          max_guests?: number
          multi_unit_config?: Json | null
          name?: string
          navigation_tags?: string[] | null
          owner_email?: string | null
          owner_name?: string | null
          owner_notes?: string | null
          owner_pms_credential_id?: string | null
          payment_provider?: string | null
          payment_providers?: string[] | null
          permanently_deleted_at?: string | null
          pms_managed_fields?: string[] | null
          pms_readiness?: string | null
          pms_sync_status?: string | null
          price_per_night?: number
          property_type?: string
          property_url?: string | null
          rentalsunited_building_id?: string | null
          rentalsunited_property_id?: string | null
          review_sentiment?: Json | null
          short_description?: string | null
          show_on_website?: boolean | null
          siteminder_property_code?: string | null
          slug?: string | null
          timezone?: string
          updated_at?: string | null
          wetu_id?: string | null
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
      property_activation_logs: {
        Row: {
          activated_at: string
          activated_by: string | null
          created_at: string | null
          id: string
          post_activation_checks: Json | null
          pre_activation_score: number | null
          property_id: string
          quality_gate_results: Json | null
        }
        Insert: {
          activated_at: string
          activated_by?: string | null
          created_at?: string | null
          id?: string
          post_activation_checks?: Json | null
          pre_activation_score?: number | null
          property_id: string
          quality_gate_results?: Json | null
        }
        Update: {
          activated_at?: string
          activated_by?: string | null
          created_at?: string | null
          id?: string
          post_activation_checks?: Json | null
          pre_activation_score?: number | null
          property_id?: string
          quality_gate_results?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "property_activation_logs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "property_activation_logs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_activation_logs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
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
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
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
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
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
      property_billing_configs: {
        Row: {
          billing_start_date: string | null
          billing_strategy: Database["public"]["Enums"]["billing_strategy"]
          commission_rate: number | null
          created_at: string | null
          custom_overrides: Json | null
          id: string
          linked_contract_id: string | null
          owner_id: string | null
          payment_facilitator_enabled: boolean | null
          property_id: string
          room_count_override: number | null
          subscription_fee_monthly: number | null
          tier_pricing_json: Json | null
          tier_scope: string | null
          transaction_fee_percentage: number | null
          updated_at: string | null
          volume_tier_json: Json | null
          white_label_allowed: boolean | null
          white_label_domain: string | null
          white_label_domain_status: string
          white_label_domain_verified_at: string | null
          white_label_monthly_fee: number | null
        }
        Insert: {
          billing_start_date?: string | null
          billing_strategy?: Database["public"]["Enums"]["billing_strategy"]
          commission_rate?: number | null
          created_at?: string | null
          custom_overrides?: Json | null
          id?: string
          linked_contract_id?: string | null
          owner_id?: string | null
          payment_facilitator_enabled?: boolean | null
          property_id: string
          room_count_override?: number | null
          subscription_fee_monthly?: number | null
          tier_pricing_json?: Json | null
          tier_scope?: string | null
          transaction_fee_percentage?: number | null
          updated_at?: string | null
          volume_tier_json?: Json | null
          white_label_allowed?: boolean | null
          white_label_domain?: string | null
          white_label_domain_status?: string
          white_label_domain_verified_at?: string | null
          white_label_monthly_fee?: number | null
        }
        Update: {
          billing_start_date?: string | null
          billing_strategy?: Database["public"]["Enums"]["billing_strategy"]
          commission_rate?: number | null
          created_at?: string | null
          custom_overrides?: Json | null
          id?: string
          linked_contract_id?: string | null
          owner_id?: string | null
          payment_facilitator_enabled?: boolean | null
          property_id?: string
          room_count_override?: number | null
          subscription_fee_monthly?: number | null
          tier_pricing_json?: Json | null
          tier_scope?: string | null
          transaction_fee_percentage?: number | null
          updated_at?: string | null
          volume_tier_json?: Json | null
          white_label_allowed?: boolean | null
          white_label_domain?: string | null
          white_label_domain_status?: string
          white_label_domain_verified_at?: string | null
          white_label_monthly_fee?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "property_billing_configs_linked_contract_id_fkey"
            columns: ["linked_contract_id"]
            isOneToOne: false
            referencedRelation: "contract_template_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_billing_configs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_billing_configs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "property_billing_configs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_billing_configs_property_id_fkey"
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
          room_charge_overrides: Json | null
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
          room_charge_overrides?: Json | null
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
          room_charge_overrides?: Json | null
          room_type_ids?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_charges_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
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
      property_checklist: {
        Row: {
          auto_verified: boolean | null
          completed: boolean | null
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          id: string
          item_key: string
          item_label: string
          phase: string
          property_id: string
          required_for: string[] | null
          updated_at: string | null
          verification_data: Json | null
        }
        Insert: {
          auto_verified?: boolean | null
          completed?: boolean | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          id?: string
          item_key: string
          item_label: string
          phase: string
          property_id: string
          required_for?: string[] | null
          updated_at?: string | null
          verification_data?: Json | null
        }
        Update: {
          auto_verified?: boolean | null
          completed?: boolean | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          id?: string
          item_key?: string
          item_label?: string
          phase?: string
          property_id?: string
          required_for?: string[] | null
          updated_at?: string | null
          verification_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "property_checklist_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "property_checklist_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_checklist_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_commercial_terms: {
        Row: {
          commission_type: string
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
          commission_type?: string
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
          commission_type?: string
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
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
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
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
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
      property_onboarding_roadmap: {
        Row: {
          created_at: string | null
          id: string
          property_id: string | null
          roadmap: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          property_id?: string | null
          roadmap?: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          property_id?: string | null
          roadmap?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_onboarding_roadmap_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "property_onboarding_roadmap_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_onboarding_roadmap_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
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
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
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
      property_owners: {
        Row: {
          added_by: string | null
          created_at: string
          id: string
          owner_email: string
          owner_name: string | null
          property_id: string
          user_id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          id?: string
          owner_email: string
          owner_name?: string | null
          property_id: string
          user_id: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          id?: string
          owner_email?: string
          owner_name?: string | null
          property_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_owners_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "property_owners_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_owners_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_portfolio_members: {
        Row: {
          created_at: string | null
          id: string
          portfolio_id: string
          property_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          portfolio_id: string
          property_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          portfolio_id?: string
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_portfolio_members_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "property_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_portfolio_members_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "property_portfolio_members_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_portfolio_members_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_portfolios: {
        Row: {
          created_at: string | null
          id: string
          metadata: Json | null
          name: string
          owner_id: string | null
          parent_portfolio_id: string | null
          slug: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          name: string
          owner_id?: string | null
          parent_portfolio_id?: string | null
          slug?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          owner_id?: string | null
          parent_portfolio_id?: string | null
          slug?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_portfolios_parent_portfolio_id_fkey"
            columns: ["parent_portfolio_id"]
            isOneToOne: false
            referencedRelation: "property_portfolios"
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
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
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
      property_referrals: {
        Row: {
          clawback_until: string | null
          converted_at: string | null
          created_at: string
          id: string
          lead_notes: string | null
          lead_source: Database["public"]["Enums"]["lead_source"]
          property_id: string
          referral_date: string
          rep_id: string
          status: Database["public"]["Enums"]["referral_status"]
          updated_at: string
        }
        Insert: {
          clawback_until?: string | null
          converted_at?: string | null
          created_at?: string
          id?: string
          lead_notes?: string | null
          lead_source?: Database["public"]["Enums"]["lead_source"]
          property_id: string
          referral_date?: string
          rep_id: string
          status?: Database["public"]["Enums"]["referral_status"]
          updated_at?: string
        }
        Update: {
          clawback_until?: string | null
          converted_at?: string | null
          created_at?: string
          id?: string
          lead_notes?: string | null
          lead_source?: Database["public"]["Enums"]["lead_source"]
          property_id?: string
          referral_date?: string
          rep_id?: string
          status?: Database["public"]["Enums"]["referral_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_referrals_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "property_referrals_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_referrals_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_referrals_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "sales_reps"
            referencedColumns: ["id"]
          },
        ]
      }
      property_review_cache: {
        Row: {
          created_at: string | null
          id: string
          overall_rating: number | null
          property_id: string
          rating_url: string | null
          reviews: Json | null
          source: string
          source_id: string | null
          synced_at: string | null
          tobi_blurb: string | null
          total_reviews: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          overall_rating?: number | null
          property_id: string
          rating_url?: string | null
          reviews?: Json | null
          source: string
          source_id?: string | null
          synced_at?: string | null
          tobi_blurb?: string | null
          total_reviews?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          overall_rating?: number | null
          property_id?: string
          rating_url?: string | null
          reviews?: Json | null
          source?: string
          source_id?: string | null
          synced_at?: string | null
          tobi_blurb?: string | null
          total_reviews?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "property_review_cache_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "property_review_cache_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_review_cache_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_specials: {
        Row: {
          age_label: string | null
          age_restricted: boolean | null
          applicable_room_ids: string[] | null
          book_from: string | null
          book_until: string | null
          category: string
          created_at: string | null
          created_by: string | null
          currency: string | null
          description: string | null
          discount_percent: number | null
          fixed_amount: number | null
          fixed_price: number | null
          id: string
          images: Json | null
          included_items: Json | null
          is_active: boolean | null
          is_public: boolean | null
          max_age: number | null
          max_stay: number | null
          min_age: number | null
          min_stay: number | null
          name: string
          property_id: string
          sort_order: number | null
          special_type: string
          terms: string | null
          updated_at: string | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          age_label?: string | null
          age_restricted?: boolean | null
          applicable_room_ids?: string[] | null
          book_from?: string | null
          book_until?: string | null
          category?: string
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          description?: string | null
          discount_percent?: number | null
          fixed_amount?: number | null
          fixed_price?: number | null
          id?: string
          images?: Json | null
          included_items?: Json | null
          is_active?: boolean | null
          is_public?: boolean | null
          max_age?: number | null
          max_stay?: number | null
          min_age?: number | null
          min_stay?: number | null
          name: string
          property_id: string
          sort_order?: number | null
          special_type?: string
          terms?: string | null
          updated_at?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          age_label?: string | null
          age_restricted?: boolean | null
          applicable_room_ids?: string[] | null
          book_from?: string | null
          book_until?: string | null
          category?: string
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          description?: string | null
          discount_percent?: number | null
          fixed_amount?: number | null
          fixed_price?: number | null
          id?: string
          images?: Json | null
          included_items?: Json | null
          is_active?: boolean | null
          is_public?: boolean | null
          max_age?: number | null
          max_stay?: number | null
          min_age?: number | null
          min_stay?: number | null
          name?: string
          property_id?: string
          sort_order?: number | null
          special_type?: string
          terms?: string | null
          updated_at?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_specials_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "property_specials_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_specials_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_staff: {
        Row: {
          created_at: string
          display_name: string
          email: string | null
          id: string
          invited_by: string | null
          is_active: boolean
          must_change_password: boolean
          property_id: string
          staff_role: Database["public"]["Enums"]["pms_staff_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          email?: string | null
          id?: string
          invited_by?: string | null
          is_active?: boolean
          must_change_password?: boolean
          property_id: string
          staff_role: Database["public"]["Enums"]["pms_staff_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
          invited_by?: string | null
          is_active?: boolean
          must_change_password?: boolean
          property_id?: string
          staff_role?: Database["public"]["Enums"]["pms_staff_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_staff_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "property_staff_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_staff_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      rep_commission_entries: {
        Row: {
          amount: number
          base_revenue: number
          clawback_reason: string | null
          commission_type: string
          created_at: string
          id: string
          period_end: string
          period_start: string
          property_id: string
          rate_applied: number
          referral_id: string
          rep_id: string
          status: Database["public"]["Enums"]["commission_entry_status"]
          updated_at: string
        }
        Insert: {
          amount?: number
          base_revenue?: number
          clawback_reason?: string | null
          commission_type: string
          created_at?: string
          id?: string
          period_end: string
          period_start: string
          property_id: string
          rate_applied: number
          referral_id: string
          rep_id: string
          status?: Database["public"]["Enums"]["commission_entry_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          base_revenue?: number
          clawback_reason?: string | null
          commission_type?: string
          created_at?: string
          id?: string
          period_end?: string
          period_start?: string
          property_id?: string
          rate_applied?: number
          referral_id?: string
          rep_id?: string
          status?: Database["public"]["Enums"]["commission_entry_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rep_commission_entries_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rep_commission_entries_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_commission_entries_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_commission_entries_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "property_referrals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_commission_entries_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "sales_reps"
            referencedColumns: ["id"]
          },
        ]
      }
      rep_commission_reports: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          generated_at: string
          id: string
          notes: string | null
          paid_at: string | null
          period_month: string
          rep_id: string
          status: Database["public"]["Enums"]["commission_report_status"]
          total_amount: number
          total_entries: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          generated_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          period_month: string
          rep_id: string
          status?: Database["public"]["Enums"]["commission_report_status"]
          total_amount?: number
          total_entries?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          generated_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          period_month?: string
          rep_id?: string
          status?: Database["public"]["Enums"]["commission_report_status"]
          total_amount?: number
          total_entries?: number
        }
        Relationships: [
          {
            foreignKeyName: "rep_commission_reports_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_commission_reports_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "sales_reps"
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
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
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
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
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
      rolos_booking_charges: {
        Row: {
          amount: number
          booking_id: string
          breakdown: string | null
          calculation_method: string
          category: string
          charge_id: string | null
          created_at: string | null
          folio_transaction_id: string | null
          id: string
          is_refundable: boolean | null
          name: string
          property_id: string
          refund_status: string | null
          refund_timing: string | null
          refund_transaction_id: string | null
        }
        Insert: {
          amount: number
          booking_id: string
          breakdown?: string | null
          calculation_method: string
          category: string
          charge_id?: string | null
          created_at?: string | null
          folio_transaction_id?: string | null
          id?: string
          is_refundable?: boolean | null
          name: string
          property_id: string
          refund_status?: string | null
          refund_timing?: string | null
          refund_transaction_id?: string | null
        }
        Update: {
          amount?: number
          booking_id?: string
          breakdown?: string | null
          calculation_method?: string
          category?: string
          charge_id?: string | null
          created_at?: string | null
          folio_transaction_id?: string | null
          id?: string
          is_refundable?: boolean | null
          name?: string
          property_id?: string
          refund_status?: string | null
          refund_timing?: string | null
          refund_transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rolos_booking_charges_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_booking_charges_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings_decrypted"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_booking_charges_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "property_charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_booking_charges_folio_transaction_id_fkey"
            columns: ["folio_transaction_id"]
            isOneToOne: false
            referencedRelation: "rolos_folio_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_booking_charges_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_booking_charges_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_booking_charges_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_booking_charges_refund_transaction_id_fkey"
            columns: ["refund_transaction_id"]
            isOneToOne: false
            referencedRelation: "rolos_folio_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_booking_rooms: {
        Row: {
          adults: number
          booking_id: string
          children: number | null
          created_at: string | null
          id: string
          rate_charged: number
          room_id: string | null
        }
        Insert: {
          adults?: number
          booking_id: string
          children?: number | null
          created_at?: string | null
          id?: string
          rate_charged: number
          room_id?: string | null
        }
        Update: {
          adults?: number
          booking_id?: string
          children?: number | null
          created_at?: string | null
          id?: string
          rate_charged?: number
          room_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rolos_booking_rooms_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_booking_rooms_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings_decrypted"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_booking_rooms_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rolos_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_brand_config: {
        Row: {
          business_address: Json | null
          business_name: string | null
          created_at: string | null
          custom_tagline: string | null
          email_footer_text: string | null
          favicon_url: string | null
          id: string
          is_vat_registered: boolean
          property_id: string
          updated_at: string | null
          vat_number: string | null
          vat_rate: number | null
        }
        Insert: {
          business_address?: Json | null
          business_name?: string | null
          created_at?: string | null
          custom_tagline?: string | null
          email_footer_text?: string | null
          favicon_url?: string | null
          id?: string
          is_vat_registered?: boolean
          property_id: string
          updated_at?: string | null
          vat_number?: string | null
          vat_rate?: number | null
        }
        Update: {
          business_address?: Json | null
          business_name?: string | null
          created_at?: string | null
          custom_tagline?: string | null
          email_footer_text?: string | null
          favicon_url?: string | null
          id?: string
          is_vat_registered?: boolean
          property_id?: string
          updated_at?: string | null
          vat_number?: string | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rolos_brand_config_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_brand_config_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_brand_config_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_channel_api_config: {
        Row: {
          channel_name: string
          config: Json
          created_at: string
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          channel_name: string
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          channel_name?: string
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      rolos_channel_connections: {
        Row: {
          channel_name: Database["public"]["Enums"]["channel_name"]
          created_at: string
          credentials: Json | null
          id: string
          last_error: string | null
          last_sync_at: string | null
          property_id: string
          settings: Json | null
          status: Database["public"]["Enums"]["channel_connection_status"]
          updated_at: string
        }
        Insert: {
          channel_name: Database["public"]["Enums"]["channel_name"]
          created_at?: string
          credentials?: Json | null
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          property_id: string
          settings?: Json | null
          status?: Database["public"]["Enums"]["channel_connection_status"]
          updated_at?: string
        }
        Update: {
          channel_name?: Database["public"]["Enums"]["channel_name"]
          created_at?: string
          credentials?: Json | null
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          property_id?: string
          settings?: Json | null
          status?: Database["public"]["Enums"]["channel_connection_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_channel_connections_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_channel_connections_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_channel_connections_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_channel_rate_mapping: {
        Row: {
          connection_id: string
          created_at: string
          external_rate_id: string
          external_rate_name: string | null
          id: string
          is_active: boolean
          rate_plan_id: string
        }
        Insert: {
          connection_id: string
          created_at?: string
          external_rate_id: string
          external_rate_name?: string | null
          id?: string
          is_active?: boolean
          rate_plan_id: string
        }
        Update: {
          connection_id?: string
          created_at?: string
          external_rate_id?: string
          external_rate_name?: string | null
          id?: string
          is_active?: boolean
          rate_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_channel_rate_mapping_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "rolos_channel_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_channel_rate_mapping_rate_plan_id_fkey"
            columns: ["rate_plan_id"]
            isOneToOne: false
            referencedRelation: "rolos_rate_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_channel_reservations: {
        Row: {
          booking_id: string | null
          channel_name: Database["public"]["Enums"]["channel_name"]
          connection_id: string
          error_message: string | null
          external_reservation_id: string
          id: string
          processed_at: string | null
          processing_status: Database["public"]["Enums"]["channel_reservation_status"]
          raw_data: Json
          received_at: string
        }
        Insert: {
          booking_id?: string | null
          channel_name: Database["public"]["Enums"]["channel_name"]
          connection_id: string
          error_message?: string | null
          external_reservation_id: string
          id?: string
          processed_at?: string | null
          processing_status?: Database["public"]["Enums"]["channel_reservation_status"]
          raw_data?: Json
          received_at?: string
        }
        Update: {
          booking_id?: string | null
          channel_name?: Database["public"]["Enums"]["channel_name"]
          connection_id?: string
          error_message?: string | null
          external_reservation_id?: string
          id?: string
          processed_at?: string | null
          processing_status?: Database["public"]["Enums"]["channel_reservation_status"]
          raw_data?: Json
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_channel_reservations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_channel_reservations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings_decrypted"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_channel_reservations_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "rolos_channel_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_channel_room_mapping: {
        Row: {
          connection_id: string
          created_at: string
          external_room_id: string
          external_room_name: string | null
          id: string
          is_active: boolean
          room_type_id: string
        }
        Insert: {
          connection_id: string
          created_at?: string
          external_room_id: string
          external_room_name?: string | null
          id?: string
          is_active?: boolean
          room_type_id: string
        }
        Update: {
          connection_id?: string
          created_at?: string
          external_room_id?: string
          external_room_name?: string | null
          id?: string
          is_active?: boolean
          room_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_channel_room_mapping_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "rolos_channel_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_channel_room_mapping_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "rolos_room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_channel_sync_log: {
        Row: {
          completed_at: string | null
          connection_id: string
          duration_ms: number | null
          errors: Json | null
          id: string
          records_processed: number
          started_at: string
          status: Database["public"]["Enums"]["channel_sync_status"]
          sync_type: Database["public"]["Enums"]["channel_sync_type"]
        }
        Insert: {
          completed_at?: string | null
          connection_id: string
          duration_ms?: number | null
          errors?: Json | null
          id?: string
          records_processed?: number
          started_at?: string
          status: Database["public"]["Enums"]["channel_sync_status"]
          sync_type: Database["public"]["Enums"]["channel_sync_type"]
        }
        Update: {
          completed_at?: string | null
          connection_id?: string
          duration_ms?: number | null
          errors?: Json | null
          id?: string
          records_processed?: number
          started_at?: string
          status?: Database["public"]["Enums"]["channel_sync_status"]
          sync_type?: Database["public"]["Enums"]["channel_sync_type"]
        }
        Relationships: [
          {
            foreignKeyName: "rolos_channel_sync_log_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "rolos_channel_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_daily_metrics: {
        Row: {
          adr: number | null
          available_rooms: number | null
          cancellation_count: number | null
          created_at: string | null
          date: string
          expenses: number | null
          id: string
          no_show_count: number | null
          occupancy_rate: number | null
          occupied_rooms: number | null
          property_id: string
          revenue: number | null
          revpar: number | null
          walk_in_count: number | null
        }
        Insert: {
          adr?: number | null
          available_rooms?: number | null
          cancellation_count?: number | null
          created_at?: string | null
          date: string
          expenses?: number | null
          id?: string
          no_show_count?: number | null
          occupancy_rate?: number | null
          occupied_rooms?: number | null
          property_id: string
          revenue?: number | null
          revpar?: number | null
          walk_in_count?: number | null
        }
        Update: {
          adr?: number | null
          available_rooms?: number | null
          cancellation_count?: number | null
          created_at?: string | null
          date?: string
          expenses?: number | null
          id?: string
          no_show_count?: number | null
          occupancy_rate?: number | null
          occupied_rooms?: number | null
          property_id?: string
          revenue?: number | null
          revpar?: number | null
          walk_in_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rolos_daily_metrics_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_daily_metrics_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_daily_metrics_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_deposit_schedules: {
        Row: {
          created_at: string
          deposit_type: string
          deposit_value: number
          due_days_before: number
          id: string
          is_active: boolean
          name: string
          property_id: string
          rate_plan_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deposit_type?: string
          deposit_value?: number
          due_days_before?: number
          id?: string
          is_active?: boolean
          name?: string
          property_id: string
          rate_plan_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deposit_type?: string
          deposit_value?: number
          due_days_before?: number
          id?: string
          is_active?: boolean
          name?: string
          property_id?: string
          rate_plan_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_deposit_schedules_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_deposit_schedules_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_deposit_schedules_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_deposit_schedules_rate_plan_id_fkey"
            columns: ["rate_plan_id"]
            isOneToOne: false
            referencedRelation: "rolos_rate_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_event_reservations: {
        Row: {
          booking_id: string | null
          created_at: string
          event_id: string
          guest_name: string | null
          id: string
          reservation_id: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          event_id: string
          guest_name?: string | null
          id?: string
          reservation_id?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          event_id?: string
          guest_name?: string | null
          id?: string
          reservation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rolos_event_reservations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_event_reservations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings_decrypted"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_event_reservations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "rolos_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_event_reservations_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "rolos_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_event_spaces: {
        Row: {
          amenities: Json | null
          capacity_max: number | null
          capacity_min: number | null
          created_at: string
          daily_rate: number | null
          description: string | null
          hourly_rate: number | null
          id: string
          images: Json | null
          is_active: boolean
          name: string
          property_id: string
          updated_at: string
        }
        Insert: {
          amenities?: Json | null
          capacity_max?: number | null
          capacity_min?: number | null
          created_at?: string
          daily_rate?: number | null
          description?: string | null
          hourly_rate?: number | null
          id?: string
          images?: Json | null
          is_active?: boolean
          name: string
          property_id: string
          updated_at?: string
        }
        Update: {
          amenities?: Json | null
          capacity_max?: number | null
          capacity_min?: number | null
          created_at?: string
          daily_rate?: number | null
          description?: string | null
          hourly_rate?: number | null
          id?: string
          images?: Json | null
          is_active?: boolean
          name?: string
          property_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_event_spaces_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_event_spaces_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_event_spaces_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_events: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          end_at: string
          event_type: string
          expected_attendees: number | null
          id: string
          linked_group_id: string | null
          name: string
          notes: string | null
          property_id: string
          setup_minutes: number
          space_id: string | null
          special_requirements: Json | null
          start_at: string
          status: Database["public"]["Enums"]["event_status"]
          teardown_minutes: number
          total_cost: number | null
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          end_at: string
          event_type?: string
          expected_attendees?: number | null
          id?: string
          linked_group_id?: string | null
          name: string
          notes?: string | null
          property_id: string
          setup_minutes?: number
          space_id?: string | null
          special_requirements?: Json | null
          start_at: string
          status?: Database["public"]["Enums"]["event_status"]
          teardown_minutes?: number
          total_cost?: number | null
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          end_at?: string
          event_type?: string
          expected_attendees?: number | null
          id?: string
          linked_group_id?: string | null
          name?: string
          notes?: string | null
          property_id?: string
          setup_minutes?: number
          space_id?: string | null
          special_requirements?: Json | null
          start_at?: string
          status?: Database["public"]["Enums"]["event_status"]
          teardown_minutes?: number
          total_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_events_linked_group_id_fkey"
            columns: ["linked_group_id"]
            isOneToOne: false
            referencedRelation: "rolos_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_events_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_events_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_events_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_events_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "rolos_event_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_experience_configs: {
        Row: {
          config: Json
          created_at: string | null
          experience_type: string
          id: string
          is_active: boolean | null
          property_id: string
          updated_at: string | null
        }
        Insert: {
          config?: Json
          created_at?: string | null
          experience_type: string
          id?: string
          is_active?: boolean | null
          property_id: string
          updated_at?: string | null
        }
        Update: {
          config?: Json
          created_at?: string | null
          experience_type?: string
          id?: string
          is_active?: boolean | null
          property_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rolos_experience_configs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_experience_configs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_experience_configs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_folio_transactions: {
        Row: {
          amount: number
          created_at: string | null
          created_by: string | null
          description: string
          folio_id: string
          id: string
          reference: string | null
          tax_amount: number | null
          transaction_type: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          created_by?: string | null
          description: string
          folio_id: string
          id?: string
          reference?: string | null
          tax_amount?: number | null
          transaction_type: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          created_by?: string | null
          description?: string
          folio_id?: string
          id?: string
          reference?: string | null
          tax_amount?: number | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_folio_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_folio_transactions_folio_id_fkey"
            columns: ["folio_id"]
            isOneToOne: false
            referencedRelation: "rolos_folios"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_folios: {
        Row: {
          balance: number | null
          booking_id: string
          closed_at: string | null
          created_at: string | null
          currency: string | null
          guest_name: string | null
          id: string
          property_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          balance?: number | null
          booking_id: string
          closed_at?: string | null
          created_at?: string | null
          currency?: string | null
          guest_name?: string | null
          id?: string
          property_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          balance?: number | null
          booking_id?: string
          closed_at?: string | null
          created_at?: string | null
          currency?: string | null
          guest_name?: string | null
          id?: string
          property_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rolos_folios_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_folios_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings_decrypted"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_folios_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_folios_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_folios_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_group_reservations: {
        Row: {
          booking_id: string | null
          created_at: string
          group_id: string
          guest_name: string | null
          id: string
          reservation_id: string | null
          status: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          group_id: string
          guest_name?: string | null
          id?: string
          reservation_id?: string | null
          status?: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          group_id?: string
          guest_name?: string | null
          id?: string
          reservation_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_group_reservations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_group_reservations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings_decrypted"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_group_reservations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "rolos_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_group_reservations_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "rolos_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_group_room_blocks: {
        Row: {
          blocked_count: number
          created_at: string
          end_date: string
          group_id: string
          id: string
          rate_override: number | null
          release_date: string | null
          room_type_id: string
          start_date: string
          status: string
        }
        Insert: {
          blocked_count?: number
          created_at?: string
          end_date: string
          group_id: string
          id?: string
          rate_override?: number | null
          release_date?: string | null
          room_type_id: string
          start_date: string
          status?: string
        }
        Update: {
          blocked_count?: number
          created_at?: string
          end_date?: string
          group_id?: string
          id?: string
          rate_override?: number | null
          release_date?: string | null
          room_type_id?: string
          start_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_group_room_blocks_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "rolos_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_group_room_blocks_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "rolos_room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_groups: {
        Row: {
          attrition_rate: number | null
          check_in_date: string | null
          check_out_date: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          group_type: string
          id: string
          name: string
          notes: string | null
          property_id: string
          release_date: string | null
          status: Database["public"]["Enums"]["group_booking_status"]
          total_rooms: number
          updated_at: string
        }
        Insert: {
          attrition_rate?: number | null
          check_in_date?: string | null
          check_out_date?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          group_type?: string
          id?: string
          name: string
          notes?: string | null
          property_id: string
          release_date?: string | null
          status?: Database["public"]["Enums"]["group_booking_status"]
          total_rooms?: number
          updated_at?: string
        }
        Update: {
          attrition_rate?: number | null
          check_in_date?: string | null
          check_out_date?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          group_type?: string
          id?: string
          name?: string
          notes?: string | null
          property_id?: string
          release_date?: string | null
          status?: Database["public"]["Enums"]["group_booking_status"]
          total_rooms?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_groups_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_groups_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_groups_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_guest_comments: {
        Row: {
          booking_id: string | null
          comment: string
          created_at: string | null
          created_by: string | null
          guest_id: string
          id: string
          is_private: boolean | null
        }
        Insert: {
          booking_id?: string | null
          comment: string
          created_at?: string | null
          created_by?: string | null
          guest_id: string
          id?: string
          is_private?: boolean | null
        }
        Update: {
          booking_id?: string | null
          comment?: string
          created_at?: string | null
          created_by?: string | null
          guest_id?: string
          id?: string
          is_private?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "rolos_guest_comments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_guest_comments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings_decrypted"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_guest_comments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_guest_comments_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "rolos_guest_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_guest_profiles: {
        Row: {
          address: Json | null
          communication_preferences: Json | null
          complaints: Json | null
          created_at: string | null
          date_of_birth: string | null
          email: string | null
          full_name: string
          id: string
          is_blacklisted: boolean | null
          last_stay_date: string | null
          nationality: string | null
          notes: string | null
          phone: string | null
          preferences: Json | null
          property_id: string
          tags: string[] | null
          total_spent: number | null
          total_stays: number | null
          updated_at: string | null
        }
        Insert: {
          address?: Json | null
          communication_preferences?: Json | null
          complaints?: Json | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          full_name: string
          id?: string
          is_blacklisted?: boolean | null
          last_stay_date?: string | null
          nationality?: string | null
          notes?: string | null
          phone?: string | null
          preferences?: Json | null
          property_id: string
          tags?: string[] | null
          total_spent?: number | null
          total_stays?: number | null
          updated_at?: string | null
        }
        Update: {
          address?: Json | null
          communication_preferences?: Json | null
          complaints?: Json | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_blacklisted?: boolean | null
          last_stay_date?: string | null
          nationality?: string | null
          notes?: string | null
          phone?: string | null
          preferences?: Json | null
          property_id?: string
          tags?: string[] | null
          total_spent?: number | null
          total_stays?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rolos_guest_profiles_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_guest_profiles_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_guest_profiles_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_housekeeping_schedules: {
        Row: {
          created_at: string | null
          day_of_week: number[] | null
          frequency: string | null
          id: string
          is_active: boolean | null
          property_id: string
          room_id: string | null
          task_type: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          day_of_week?: number[] | null
          frequency?: string | null
          id?: string
          is_active?: boolean | null
          property_id: string
          room_id?: string | null
          task_type?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          day_of_week?: number[] | null
          frequency?: string | null
          id?: string
          is_active?: boolean | null
          property_id?: string
          room_id?: string | null
          task_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rolos_housekeeping_schedules_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_housekeeping_schedules_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_housekeeping_schedules_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_housekeeping_schedules_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rolos_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_housekeeping_tasks: {
        Row: {
          assigned_to: string | null
          completed_date: string | null
          created_at: string | null
          id: string
          notes: string | null
          priority: string | null
          room_id: string
          scheduled_date: string | null
          status: string | null
          task_type: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          completed_date?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          priority?: string | null
          room_id: string
          scheduled_date?: string | null
          status?: string | null
          task_type?: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          completed_date?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          priority?: string | null
          room_id?: string
          scheduled_date?: string | null
          status?: string | null
          task_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rolos_housekeeping_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_housekeeping_tasks_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rolos_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_inventory_calendar: {
        Row: {
          available_units: number | null
          blocked_units: number
          booked_units: number
          created_at: string
          date: string
          id: string
          property_id: string
          restrictions: Json | null
          room_type_id: string
          total_units: number
          updated_at: string
        }
        Insert: {
          available_units?: number | null
          blocked_units?: number
          booked_units?: number
          created_at?: string
          date: string
          id?: string
          property_id: string
          restrictions?: Json | null
          room_type_id: string
          total_units?: number
          updated_at?: string
        }
        Update: {
          available_units?: number | null
          blocked_units?: number
          booked_units?: number
          created_at?: string
          date?: string
          id?: string
          property_id?: string
          restrictions?: Json | null
          room_type_id?: string
          total_units?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_inventory_calendar_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_inventory_calendar_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_inventory_calendar_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_inventory_calendar_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "rolos_room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_invoices: {
        Row: {
          created_at: string
          created_by: string | null
          due_date: string | null
          folio_id: string
          id: string
          invoice_number: string
          issued_date: string
          notes: string | null
          pdf_url: string | null
          property_id: string
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax_total: number
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          folio_id: string
          id?: string
          invoice_number: string
          issued_date?: string
          notes?: string | null
          pdf_url?: string | null
          property_id: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          folio_id?: string
          id?: string
          invoice_number?: string
          issued_date?: string
          notes?: string | null
          pdf_url?: string | null
          property_id?: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_invoices_folio_id_fkey"
            columns: ["folio_id"]
            isOneToOne: false
            referencedRelation: "rolos_folios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_invoices_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_invoices_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_invoices_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_maintenance_requests: {
        Row: {
          actual_cost: number | null
          assigned_to: string | null
          completed_date: string | null
          completion_notes: string | null
          created_at: string | null
          description: string
          estimated_cost: number | null
          id: string
          images: string[] | null
          issue_type: string | null
          priority: string | null
          property_id: string
          reported_by: string | null
          room_id: string | null
          room_ready_confirmed: boolean | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          actual_cost?: number | null
          assigned_to?: string | null
          completed_date?: string | null
          completion_notes?: string | null
          created_at?: string | null
          description: string
          estimated_cost?: number | null
          id?: string
          images?: string[] | null
          issue_type?: string | null
          priority?: string | null
          property_id: string
          reported_by?: string | null
          room_id?: string | null
          room_ready_confirmed?: boolean | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          actual_cost?: number | null
          assigned_to?: string | null
          completed_date?: string | null
          completion_notes?: string | null
          created_at?: string | null
          description?: string
          estimated_cost?: number | null
          id?: string
          images?: string[] | null
          issue_type?: string | null
          priority?: string | null
          property_id?: string
          reported_by?: string | null
          room_id?: string | null
          room_ready_confirmed?: boolean | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rolos_maintenance_requests_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_maintenance_requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_maintenance_requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_maintenance_requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_maintenance_requests_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_maintenance_requests_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rolos_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_message_log: {
        Row: {
          channel: string
          created_at: string
          error_message: string | null
          id: string
          property_id: string
          recipient_email: string | null
          recipient_phone: string | null
          reservation_id: string | null
          sent_at: string
          status: string
          subject: string | null
          template_id: string | null
        }
        Insert: {
          channel?: string
          created_at?: string
          error_message?: string | null
          id?: string
          property_id: string
          recipient_email?: string | null
          recipient_phone?: string | null
          reservation_id?: string | null
          sent_at?: string
          status?: string
          subject?: string | null
          template_id?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          error_message?: string | null
          id?: string
          property_id?: string
          recipient_email?: string | null
          recipient_phone?: string | null
          reservation_id?: string | null
          sent_at?: string
          status?: string
          subject?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rolos_message_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_message_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_message_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_message_log_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "rolos_message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_message_queue: {
        Row: {
          body: string
          channel: string
          created_at: string
          error_message: string | null
          id: string
          property_id: string
          recipient_email: string | null
          recipient_phone: string | null
          reservation_id: string | null
          scheduled_at: string
          sent_at: string | null
          status: string
          subject: string
          template_id: string | null
        }
        Insert: {
          body?: string
          channel?: string
          created_at?: string
          error_message?: string | null
          id?: string
          property_id: string
          recipient_email?: string | null
          recipient_phone?: string | null
          reservation_id?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          subject?: string
          template_id?: string | null
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          error_message?: string | null
          id?: string
          property_id?: string
          recipient_email?: string | null
          recipient_phone?: string | null
          reservation_id?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          subject?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rolos_message_queue_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_message_queue_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_message_queue_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_message_queue_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "rolos_message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_message_templates: {
        Row: {
          body: string
          channel: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          property_id: string
          send_offset_hours: number
          subject: string
          trigger_event: string
          updated_at: string
        }
        Insert: {
          body?: string
          channel?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          property_id: string
          send_offset_hours?: number
          subject?: string
          trigger_event: string
          updated_at?: string
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          property_id?: string
          send_offset_hours?: number
          subject?: string
          trigger_event?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_message_templates_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_message_templates_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_message_templates_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_night_audit_log: {
        Row: {
          audit_date: string
          charges_posted: number | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          folios_closed: number | null
          id: string
          property_id: string
          revenue_total: number | null
          rooms_rolled: number | null
          started_at: string
          status: string
          tasks_json: Json | null
          tax_posted: number | null
        }
        Insert: {
          audit_date: string
          charges_posted?: number | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          folios_closed?: number | null
          id?: string
          property_id: string
          revenue_total?: number | null
          rooms_rolled?: number | null
          started_at?: string
          status?: string
          tasks_json?: Json | null
          tax_posted?: number | null
        }
        Update: {
          audit_date?: string
          charges_posted?: number | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          folios_closed?: number | null
          id?: string
          property_id?: string
          revenue_total?: number | null
          rooms_rolled?: number | null
          started_at?: string
          status?: string
          tasks_json?: Json | null
          tax_posted?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rolos_night_audit_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_night_audit_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_night_audit_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_payment_allocations: {
        Row: {
          amount: number
          created_at: string
          id: string
          payment_id: string
          transaction_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          payment_id: string
          transaction_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          payment_id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "rolos_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_payment_allocations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "rolos_folio_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: string
          folio_id: string
          gateway_transaction_id: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          paid_at: string | null
          property_id: string
          reference: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          currency?: string
          folio_id: string
          gateway_transaction_id?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_at?: string | null
          property_id: string
          reference?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          folio_id?: string
          gateway_transaction_id?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_at?: string | null
          property_id?: string
          reference?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_payments_folio_id_fkey"
            columns: ["folio_id"]
            isOneToOne: false
            referencedRelation: "rolos_folios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_payments_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_payments_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_payments_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_policies: {
        Row: {
          created_at: string | null
          id: string
          is_ai_generated: boolean | null
          last_evaluated_at: string | null
          policy_type: string
          property_id: string
          rule: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_ai_generated?: boolean | null
          last_evaluated_at?: string | null
          policy_type: string
          property_id: string
          rule: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_ai_generated?: boolean | null
          last_evaluated_at?: string | null
          policy_type?: string
          property_id?: string
          rule?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rolos_policies_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_policies_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_policies_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_pricing_rules: {
        Row: {
          adjustments: Json
          conditions: Json
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          is_active: boolean
          name: string
          priority: number
          property_id: string
          rule_type: Database["public"]["Enums"]["pricing_rule_type"]
          start_date: string | null
          updated_at: string
        }
        Insert: {
          adjustments?: Json
          conditions?: Json
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          name: string
          priority?: number
          property_id: string
          rule_type: Database["public"]["Enums"]["pricing_rule_type"]
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          adjustments?: Json
          conditions?: Json
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          name?: string
          priority?: number
          property_id?: string
          rule_type?: Database["public"]["Enums"]["pricing_rule_type"]
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_pricing_rules_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_pricing_rules_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_pricing_rules_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_rate_plan_room_types: {
        Row: {
          created_at: string | null
          id: string
          rate_plan_id: string
          room_type_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          rate_plan_id: string
          room_type_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          rate_plan_id?: string
          room_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_rate_plan_room_types_rate_plan_id_fkey"
            columns: ["rate_plan_id"]
            isOneToOne: false
            referencedRelation: "rolos_rate_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_rate_plan_room_types_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "rolos_room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_rate_plan_stop_sell: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          id: string
          property_id: string
          rate_plan_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date: string
          id?: string
          property_id: string
          rate_plan_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          property_id?: string
          rate_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_rate_plan_stop_sell_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_rate_plan_stop_sell_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_rate_plan_stop_sell_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_rate_plan_stop_sell_rate_plan_id_fkey"
            columns: ["rate_plan_id"]
            isOneToOne: false
            referencedRelation: "rolos_rate_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_rate_plans: {
        Row: {
          adult_1_rate: number | null
          adult_2_rate: number | null
          base_rate: number | null
          child_rate: number | null
          closed_to_arrival: boolean[] | null
          closed_to_departure: boolean[] | null
          code: string | null
          created_at: string | null
          deposit_amount: number | null
          deposit_percentage: number | null
          description: string | null
          id: string
          infant_rate: number | null
          is_active: boolean | null
          is_tax_inclusive: boolean | null
          max_stay: number | null
          min_stay: number | null
          name: string
          pricing_model: string
          property_id: string
          requires_deposit: boolean | null
          teen_rate: number | null
          updated_at: string | null
        }
        Insert: {
          adult_1_rate?: number | null
          adult_2_rate?: number | null
          base_rate?: number | null
          child_rate?: number | null
          closed_to_arrival?: boolean[] | null
          closed_to_departure?: boolean[] | null
          code?: string | null
          created_at?: string | null
          deposit_amount?: number | null
          deposit_percentage?: number | null
          description?: string | null
          id?: string
          infant_rate?: number | null
          is_active?: boolean | null
          is_tax_inclusive?: boolean | null
          max_stay?: number | null
          min_stay?: number | null
          name: string
          pricing_model?: string
          property_id: string
          requires_deposit?: boolean | null
          teen_rate?: number | null
          updated_at?: string | null
        }
        Update: {
          adult_1_rate?: number | null
          adult_2_rate?: number | null
          base_rate?: number | null
          child_rate?: number | null
          closed_to_arrival?: boolean[] | null
          closed_to_departure?: boolean[] | null
          code?: string | null
          created_at?: string | null
          deposit_amount?: number | null
          deposit_percentage?: number | null
          description?: string | null
          id?: string
          infant_rate?: number | null
          is_active?: boolean | null
          is_tax_inclusive?: boolean | null
          max_stay?: number | null
          min_stay?: number | null
          name?: string
          pricing_model?: string
          property_id?: string
          requires_deposit?: boolean | null
          teen_rate?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rolos_rate_plans_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_rate_plans_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_rate_plans_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_rate_prices: {
        Row: {
          base_rate: number
          created_at: string | null
          extra_adult_rate: number | null
          extra_child_rate: number | null
          id: string
          room_type_id: string
          season_id: string
          updated_at: string | null
        }
        Insert: {
          base_rate: number
          created_at?: string | null
          extra_adult_rate?: number | null
          extra_child_rate?: number | null
          id?: string
          room_type_id: string
          season_id: string
          updated_at?: string | null
        }
        Update: {
          base_rate?: number
          created_at?: string | null
          extra_adult_rate?: number | null
          extra_child_rate?: number | null
          id?: string
          room_type_id?: string
          season_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rolos_rate_prices_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "rolos_room_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_rate_prices_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "rolos_rate_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_rate_seasons: {
        Row: {
          created_at: string | null
          day_of_week_multipliers: Json | null
          end_date: string
          id: string
          is_peak: boolean | null
          min_stay_override: number | null
          name: string
          rate_plan_id: string
          start_date: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          day_of_week_multipliers?: Json | null
          end_date: string
          id?: string
          is_peak?: boolean | null
          min_stay_override?: number | null
          name: string
          rate_plan_id: string
          start_date: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          day_of_week_multipliers?: Json | null
          end_date?: string
          id?: string
          is_peak?: boolean | null
          min_stay_override?: number | null
          name?: string
          rate_plan_id?: string
          start_date?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rolos_rate_seasons_rate_plan_id_fkey"
            columns: ["rate_plan_id"]
            isOneToOne: false
            referencedRelation: "rolos_rate_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_rate_strategies: {
        Row: {
          adjustment_type: string
          adjustment_value: number
          booking_window_from: string | null
          booking_window_to: string | null
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          is_active: boolean
          max_occupancy: number | null
          min_occupancy: number | null
          name: string
          only_on_arrival: boolean
          priority: number
          property_id: string
          rate_plan_id: string | null
          room_type_id: string | null
          season_id: string | null
          start_date: string
          updated_at: string
          weekdays: number[]
        }
        Insert: {
          adjustment_type?: string
          adjustment_value?: number
          booking_window_from?: string | null
          booking_window_to?: string | null
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          is_active?: boolean
          max_occupancy?: number | null
          min_occupancy?: number | null
          name: string
          only_on_arrival?: boolean
          priority?: number
          property_id: string
          rate_plan_id?: string | null
          room_type_id?: string | null
          season_id?: string | null
          start_date: string
          updated_at?: string
          weekdays?: number[]
        }
        Update: {
          adjustment_type?: string
          adjustment_value?: number
          booking_window_from?: string | null
          booking_window_to?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          is_active?: boolean
          max_occupancy?: number | null
          min_occupancy?: number | null
          name?: string
          only_on_arrival?: boolean
          priority?: number
          property_id?: string
          rate_plan_id?: string | null
          room_type_id?: string | null
          season_id?: string | null
          start_date?: string
          updated_at?: string
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "rolos_rate_strategies_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_rate_strategies_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_rate_strategies_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_rate_strategies_rate_plan_id_fkey"
            columns: ["rate_plan_id"]
            isOneToOne: false
            referencedRelation: "rolos_rate_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_rate_strategies_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "rolos_room_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_rate_strategies_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "rolos_rate_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_refunds: {
        Row: {
          amount: number
          approved_by: string | null
          created_at: string
          gateway_refund_id: string | null
          id: string
          payment_id: string
          processed_at: string | null
          property_id: string
          reason: string
          status: Database["public"]["Enums"]["refund_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          approved_by?: string | null
          created_at?: string
          gateway_refund_id?: string | null
          id?: string
          payment_id: string
          processed_at?: string | null
          property_id: string
          reason: string
          status?: Database["public"]["Enums"]["refund_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_by?: string | null
          created_at?: string
          gateway_refund_id?: string | null
          id?: string
          payment_id?: string
          processed_at?: string | null
          property_id?: string
          reason?: string
          status?: Database["public"]["Enums"]["refund_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "rolos_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_refunds_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_refunds_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_refunds_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_reservation_rooms: {
        Row: {
          adults: number
          children: number
          created_at: string
          id: string
          infants: number
          rate_charged: number | null
          reservation_id: string
          room_id: string | null
          room_type_id: string | null
          teens: number
          updated_at: string
        }
        Insert: {
          adults?: number
          children?: number
          created_at?: string
          id?: string
          infants?: number
          rate_charged?: number | null
          reservation_id: string
          room_id?: string | null
          room_type_id?: string | null
          teens?: number
          updated_at?: string
        }
        Update: {
          adults?: number
          children?: number
          created_at?: string
          id?: string
          infants?: number
          rate_charged?: number | null
          reservation_id?: string
          room_id?: string | null
          room_type_id?: string | null
          teens?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_reservation_rooms_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "rolos_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_reservation_rooms_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rolos_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_reservation_rooms_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "rolos_room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_reservation_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          new_status: Database["public"]["Enums"]["rolos_reservation_status"]
          old_status:
            | Database["public"]["Enums"]["rolos_reservation_status"]
            | null
          reason: string | null
          reservation_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status: Database["public"]["Enums"]["rolos_reservation_status"]
          old_status?:
            | Database["public"]["Enums"]["rolos_reservation_status"]
            | null
          reason?: string | null
          reservation_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status?: Database["public"]["Enums"]["rolos_reservation_status"]
          old_status?:
            | Database["public"]["Enums"]["rolos_reservation_status"]
            | null
          reason?: string | null
          reservation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_reservation_status_history_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "rolos_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_reservations: {
        Row: {
          booking_id: string | null
          check_in: string
          check_out: string
          confirmation_number: string
          created_at: string
          created_by: string | null
          currency: string
          guest_email: string | null
          guest_id: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          notes: string | null
          property_id: string
          source: string | null
          special_requests: string | null
          status: Database["public"]["Enums"]["rolos_reservation_status"]
          total_amount: number
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          check_in: string
          check_out: string
          confirmation_number: string
          created_at?: string
          created_by?: string | null
          currency?: string
          guest_email?: string | null
          guest_id?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          notes?: string | null
          property_id: string
          source?: string | null
          special_requests?: string | null
          status?: Database["public"]["Enums"]["rolos_reservation_status"]
          total_amount?: number
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          check_in?: string
          check_out?: string
          confirmation_number?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          guest_email?: string | null
          guest_id?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          notes?: string | null
          property_id?: string
          source?: string | null
          special_requests?: string | null
          status?: Database["public"]["Enums"]["rolos_reservation_status"]
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_reservations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_reservations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings_decrypted"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_reservations_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "rolos_guest_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_reservations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_reservations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_reservations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_room_types: {
        Row: {
          amenities: Json | null
          base_occupancy: number | null
          code: string | null
          created_at: string | null
          default_rate: number | null
          description: string | null
          id: string
          images: Json | null
          is_active: boolean | null
          linked_overview_id: string | null
          max_occupancy: number | null
          name: string
          property_id: string
          updated_at: string | null
        }
        Insert: {
          amenities?: Json | null
          base_occupancy?: number | null
          code?: string | null
          created_at?: string | null
          default_rate?: number | null
          description?: string | null
          id?: string
          images?: Json | null
          is_active?: boolean | null
          linked_overview_id?: string | null
          max_occupancy?: number | null
          name: string
          property_id: string
          updated_at?: string | null
        }
        Update: {
          amenities?: Json | null
          base_occupancy?: number | null
          code?: string | null
          created_at?: string | null
          default_rate?: number | null
          description?: string | null
          id?: string
          images?: Json | null
          is_active?: boolean | null
          linked_overview_id?: string | null
          max_occupancy?: number | null
          name?: string
          property_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rolos_room_types_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_room_types_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_room_types_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_rooms: {
        Row: {
          amenities: Json | null
          bed_configuration: Json | null
          created_at: string | null
          floor: number | null
          id: string
          max_occupancy: number | null
          notes: string | null
          property_id: string
          room_name: string | null
          room_number: string
          room_type_id: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          amenities?: Json | null
          bed_configuration?: Json | null
          created_at?: string | null
          floor?: number | null
          id?: string
          max_occupancy?: number | null
          notes?: string | null
          property_id: string
          room_name?: string | null
          room_number: string
          room_type_id?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          amenities?: Json | null
          bed_configuration?: Json | null
          created_at?: string | null
          floor?: number | null
          id?: string
          max_occupancy?: number | null
          notes?: string | null
          property_id?: string
          room_name?: string | null
          room_number?: string
          room_type_id?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rolos_rooms_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_rooms_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_rooms_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_rooms_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "rolos_room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_staff_activity_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          property_id: string
          staff_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          property_id: string
          staff_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          property_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_staff_activity_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_staff_activity_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_staff_activity_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_staff_activity_log_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "property_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_staff_shifts: {
        Row: {
          created_at: string
          created_by: string | null
          end_time: string
          id: string
          notes: string | null
          property_id: string
          shift_type: Database["public"]["Enums"]["shift_type"]
          staff_id: string
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_time: string
          id?: string
          notes?: string | null
          property_id: string
          shift_type?: Database["public"]["Enums"]["shift_type"]
          staff_id: string
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_time?: string
          id?: string
          notes?: string | null
          property_id?: string
          shift_type?: Database["public"]["Enums"]["shift_type"]
          staff_id?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_staff_shifts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_staff_shifts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_staff_shifts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_staff_shifts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "property_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_tax_rules: {
        Row: {
          applies_to: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          property_id: string
          rate: number
          updated_at: string
        }
        Insert: {
          applies_to?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          property_id: string
          rate: number
          updated_at?: string
        }
        Update: {
          applies_to?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          property_id?: string
          rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_tax_rules_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_tax_rules_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_tax_rules_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_ui_configs: {
        Row: {
          component_type: string
          config: Json
          created_at: string | null
          experience_engine_enabled: boolean | null
          id: string
          is_active: boolean | null
          property_id: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          component_type: string
          config?: Json
          created_at?: string | null
          experience_engine_enabled?: boolean | null
          id?: string
          is_active?: boolean | null
          property_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          component_type?: string
          config?: Json
          created_at?: string | null
          experience_engine_enabled?: boolean | null
          id?: string
          is_active?: boolean | null
          property_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rolos_ui_configs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_ui_configs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_ui_configs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_waitlist: {
        Row: {
          booked_at: string | null
          created_at: string
          end_date: string
          guest_email: string
          guest_id: string | null
          guest_name: string
          guest_phone: string | null
          id: string
          notes: string | null
          notified_at: string | null
          property_id: string
          room_type_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["waitlist_status"]
          updated_at: string
        }
        Insert: {
          booked_at?: string | null
          created_at?: string
          end_date: string
          guest_email: string
          guest_id?: string | null
          guest_name: string
          guest_phone?: string | null
          id?: string
          notes?: string | null
          notified_at?: string | null
          property_id: string
          room_type_id?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["waitlist_status"]
          updated_at?: string
        }
        Update: {
          booked_at?: string | null
          created_at?: string
          end_date?: string
          guest_email?: string
          guest_id?: string | null
          guest_name?: string
          guest_phone?: string | null
          id?: string
          notes?: string | null
          notified_at?: string | null
          property_id?: string
          room_type_id?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["waitlist_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_waitlist_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "rolos_guest_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_waitlist_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_waitlist_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_waitlist_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_waitlist_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "rolos_room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_webhook_logs: {
        Row: {
          attempts: number | null
          created_at: string | null
          delivered_at: string | null
          error_message: string | null
          event: string
          id: string
          max_attempts: number | null
          payload: Json | null
          property_id: string
          response_body: string | null
          response_status: number | null
          status: string | null
          subscription_id: string | null
        }
        Insert: {
          attempts?: number | null
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          event: string
          id?: string
          max_attempts?: number | null
          payload?: Json | null
          property_id: string
          response_body?: string | null
          response_status?: number | null
          status?: string | null
          subscription_id?: string | null
        }
        Update: {
          attempts?: number | null
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          event?: string
          id?: string
          max_attempts?: number | null
          payload?: Json | null
          property_id?: string
          response_body?: string | null
          response_status?: number | null
          status?: string | null
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rolos_webhook_logs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_webhook_logs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_webhook_logs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_webhook_logs_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "rolos_webhook_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_webhook_subscriptions: {
        Row: {
          created_at: string | null
          events: string[]
          id: string
          is_active: boolean | null
          property_id: string
          secret: string
          updated_at: string | null
          url: string
        }
        Insert: {
          created_at?: string | null
          events?: string[]
          id?: string
          is_active?: boolean | null
          property_id: string
          secret: string
          updated_at?: string | null
          url: string
        }
        Update: {
          created_at?: string | null
          events?: string[]
          id?: string
          is_active?: boolean | null
          property_id?: string
          secret?: string
          updated_at?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_webhook_subscriptions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_webhook_subscriptions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_webhook_subscriptions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_yield_rules: {
        Row: {
          adjustment_percent: number
          condition: Json
          created_at: string
          id: string
          is_active: boolean
          name: string
          priority: number
          property_id: string
          rule_type: string
          updated_at: string
        }
        Insert: {
          adjustment_percent?: number
          condition?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          priority?: number
          property_id: string
          rule_type?: string
          updated_at?: string
        }
        Update: {
          adjustment_percent?: number
          condition?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          priority?: number
          property_id?: string
          rule_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_yield_rules_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_yield_rules_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_yield_rules_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      ru_locations: {
        Row: {
          country: string
          currency_iso: string | null
          currency_ru_id: number | null
          id: number
          last_synced_at: string
          name: string
        }
        Insert: {
          country: string
          currency_iso?: string | null
          currency_ru_id?: number | null
          id: number
          last_synced_at?: string
          name: string
        }
        Update: {
          country?: string
          currency_iso?: string | null
          currency_ru_id?: number | null
          id?: number
          last_synced_at?: string
          name?: string
        }
        Relationships: []
      }
      ru_notifications: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          processed: boolean | null
          property_id: string | null
          raw_xml: string | null
          ru_property_id: string | null
          ru_reservation_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          processed?: boolean | null
          property_id?: string | null
          raw_xml?: string | null
          ru_property_id?: string | null
          ru_reservation_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          processed?: boolean | null
          property_id?: string | null
          raw_xml?: string | null
          ru_property_id?: string | null
          ru_reservation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ru_notifications_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "ru_notifications_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ru_notifications_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      ru_owner_accounts: {
        Row: {
          company_details_sent: boolean
          created_at: string
          id: string
          owner_email: string
          ru_login_email: string | null
          ru_login_url: string | null
          ru_owner_id: string | null
          ru_user_id: string | null
          updated_at: string
        }
        Insert: {
          company_details_sent?: boolean
          created_at?: string
          id?: string
          owner_email: string
          ru_login_email?: string | null
          ru_login_url?: string | null
          ru_owner_id?: string | null
          ru_user_id?: string | null
          updated_at?: string
        }
        Update: {
          company_details_sent?: boolean
          created_at?: string
          id?: string
          owner_email?: string
          ru_login_email?: string | null
          ru_login_url?: string | null
          ru_owner_id?: string | null
          ru_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sales_rep_bank_details: {
        Row: {
          account_holder: string
          account_number_encrypted: string | null
          account_number_masked: string | null
          account_type: string | null
          bank_name: string
          branch_code: string | null
          created_at: string | null
          id: string
          is_verified: boolean | null
          rep_id: string
          swift_code: string | null
          updated_at: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          account_holder: string
          account_number_encrypted?: string | null
          account_number_masked?: string | null
          account_type?: string | null
          bank_name: string
          branch_code?: string | null
          created_at?: string | null
          id?: string
          is_verified?: boolean | null
          rep_id: string
          swift_code?: string | null
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          account_holder?: string
          account_number_encrypted?: string | null
          account_number_masked?: string | null
          account_type?: string | null
          bank_name?: string
          branch_code?: string | null
          created_at?: string | null
          id?: string
          is_verified?: boolean | null
          rep_id?: string
          swift_code?: string | null
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_rep_bank_details_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: true
            referencedRelation: "sales_reps"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_reps: {
        Row: {
          commission_tier: Database["public"]["Enums"]["commission_tier"]
          created_at: string
          display_name: string
          email: string
          id: string
          is_active: boolean
          notes: string | null
          phone: string | null
          quarterly_target: number | null
          rep_code: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          commission_tier?: Database["public"]["Enums"]["commission_tier"]
          created_at?: string
          display_name: string
          email: string
          id?: string
          is_active?: boolean
          notes?: string | null
          phone?: string | null
          quarterly_target?: number | null
          rep_code: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          commission_tier?: Database["public"]["Enums"]["commission_tier"]
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          phone?: string | null
          quarterly_target?: number | null
          rep_code?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_reps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
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
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
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
      test_logs: {
        Row: {
          assertions: Json
          category: string
          created_at: string | null
          duration_ms: number | null
          error_message: string | null
          error_stack: string | null
          id: string
          request_data: Json | null
          response_data: Json | null
          run_id: string | null
          scenario_id: string
          scenario_name: string
          status: string
        }
        Insert: {
          assertions?: Json
          category: string
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          error_stack?: string | null
          id?: string
          request_data?: Json | null
          response_data?: Json | null
          run_id?: string | null
          scenario_id: string
          scenario_name: string
          status: string
        }
        Update: {
          assertions?: Json
          category?: string
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          error_stack?: string | null
          id?: string
          request_data?: Json | null
          response_data?: Json | null
          run_id?: string | null
          scenario_id?: string
          scenario_name?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_logs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "test_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      test_runs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          feature_target: string
          id: string
          name: string
          scenarios: Json
          started_at: string | null
          status: string
          summary: Json | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          feature_target: string
          id?: string
          name: string
          scenarios?: Json
          started_at?: string | null
          status?: string
          summary?: Json | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          feature_target?: string
          id?: string
          name?: string
          scenarios?: Json
          started_at?: string | null
          status?: string
          summary?: Json | null
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
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
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
      dw_booking_pipeline: {
        Row: {
          avg_value: number | null
          booking_count: number | null
          earliest_arrival: string | null
          latest_departure: string | null
          property_id: string | null
          status: string | null
          total_value: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
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
      dw_channel_performance: {
        Row: {
          avg_booking_value: number | null
          booking_count: number | null
          cancellation_rate_pct: number | null
          cancellations: number | null
          channel: string | null
          gross_revenue: number | null
          property_id: string | null
          total_commission: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
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
      dw_daily_revenue: {
        Row: {
          avg_booking_value: number | null
          booking_count: number | null
          gross_revenue: number | null
          net_revenue: number | null
          property_id: string | null
          stay_date: string | null
          total_commission: number | null
          unique_guests: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
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
      dw_guest_ltv: {
        Row: {
          avg_stay_value: number | null
          first_stay: string | null
          guest_email: string | null
          guest_name: string | null
          last_stay: string | null
          lifetime_value: number | null
          property_id: string | null
          total_stays: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
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
      dw_monthly_occupancy: {
        Row: {
          avg_adr: number | null
          avg_occupancy_pct: number | null
          avg_revpar: number | null
          days_in_period: number | null
          month: string | null
          property_id: string | null
          total_revenue: number | null
          total_rooms_sold: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rolos_daily_metrics_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_daily_metrics_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_daily_metrics_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      dw_portfolio_kpis: {
        Row: {
          avg_adr_30d: number | null
          avg_occupancy_30d: number | null
          city: string | null
          country: string | null
          last_30d_bookings: number | null
          last_30d_revenue: number | null
          property_id: string | null
          property_name: string | null
          upcoming_arrivals: number | null
          upcoming_value: number | null
        }
        Relationships: []
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
          brand_font_color: string | null
          brand_logo_url: string | null
          brand_override_enabled: boolean | null
          brand_primary_color: string | null
          brand_secondary_color: string | null
          city: string | null
          collections: Json | null
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
          brand_font_color?: string | null
          brand_logo_url?: string | null
          brand_override_enabled?: boolean | null
          brand_primary_color?: string | null
          brand_secondary_color?: string | null
          city?: string | null
          collections?: Json | null
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
          brand_font_color?: string | null
          brand_logo_url?: string | null
          brand_override_enabled?: boolean | null
          brand_primary_color?: string | null
          brand_secondary_color?: string | null
          city?: string | null
          collections?: Json | null
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
      attribute_portfolio_share: {
        Args: { _booking_id: string }
        Returns: undefined
      }
      can_access_channel_property: {
        Args: { _property_id: string; _user_id: string }
        Returns: boolean
      }
      can_access_property: {
        Args: { _property_id: string; _user_id: string }
        Returns: boolean
      }
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
      generate_portfolio_slug: {
        Args: { portfolio_id: string; portfolio_name: string }
        Returns: string
      }
      generate_property_slug: {
        Args: { property_id: string; property_name: string }
        Returns: string
      }
      get_booking_encryption_key: { Args: never; Returns: string }
      get_latest_cache_activity: {
        Args: never
        Returns: {
          external_system: string
          latest_fetched_at: string
        }[]
      }
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
      is_linked_owner: {
        Args: { _property_id: string; _user_id: string }
        Returns: boolean
      }
      is_property_active: { Args: { prop_id: string }; Returns: boolean }
      is_property_owner: {
        Args: { _property_id: string; _user_id: string }
        Returns: boolean
      }
      search_audit_logs: {
        Args: {
          date_from?: string
          date_to?: string
          result_limit?: number
          result_offset?: number
          search_text?: string
          source_filter?: string
        }
        Returns: {
          action_type: string
          change_summary: string
          changed_fields: string[]
          correlation_id: string
          created_at: string
          edge_function_name: string
          id: string
          immutable_hash: string
          ip_address: string
          is_sensitive: boolean
          metadata: Json
          new_values: Json
          old_values: Json
          property_id: string
          record_id: string
          redacted_fields: string[]
          request_origin: string
          session_id: string
          table_name: string
          total_count: number
          user_agent: string
          user_email: string
          user_id: string
          user_role: string
        }[]
      }
      trigger_daily_health_report: { Args: never; Returns: undefined }
      trigger_system_health_check: { Args: never; Returns: undefined }
      user_can_access_portfolio: {
        Args: { _portfolio_id: string; _user_id: string }
        Returns: boolean
      }
      user_can_access_property_via_portfolio: {
        Args: { _property_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "user"
        | "dev"
        | "fearless_leader"
        | "sales_rep"
        | "guest"
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
      billing_strategy:
        | "default"
        | "widget"
        | "rolos_pms"
        | "portfolio_aggregator"
        | "enterprise_white_label"
        | "volume_tiered"
        | "payment_facilitator"
      channel_connection_status: "active" | "paused" | "error" | "disconnected"
      channel_name:
        | "booking_com"
        | "airbnb"
        | "expedia"
        | "agoda"
        | "google_hotels"
        | "manual"
      channel_reservation_status:
        | "pending"
        | "processed"
        | "failed"
        | "duplicate"
      channel_sync_status: "success" | "partial" | "failed"
      channel_sync_type:
        | "push_inventory"
        | "pull_reservations"
        | "push_rates"
        | "full_sync"
      commission_entry_status: "pending" | "approved" | "paid" | "clawed_back"
      commission_report_status:
        | "draft"
        | "pending_approval"
        | "approved"
        | "paid"
      commission_tier: "base" | "accelerated" | "elite"
      component_type: "pms" | "internal" | "external" | "infrastructure"
      dev_task_priority: "low" | "medium" | "high" | "critical"
      dev_task_status: "new" | "started" | "testing" | "completed"
      event_status:
        | "inquiry"
        | "tentative"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "cancelled"
      group_booking_status: "inquiry" | "tentative" | "confirmed" | "cancelled"
      health_status: "healthy" | "degraded" | "failed" | "unknown"
      help_impact_level: "critical" | "warning" | "info"
      invoice_status: "draft" | "issued" | "paid" | "overdue" | "cancelled"
      lead_source:
        | "cold_call"
        | "referral"
        | "event"
        | "inbound"
        | "partner"
        | "social_media"
        | "existing_client"
        | "other"
      payment_method:
        | "cash"
        | "card"
        | "bank_transfer"
        | "online"
        | "voucher"
        | "other"
      payment_status:
        | "pending"
        | "completed"
        | "failed"
        | "refunded"
        | "partially_refunded"
      pms_integration_status:
        | "coming_soon"
        | "in_development"
        | "parked"
        | "in_testing"
        | "deployed"
      pms_staff_role:
        | "property_owner"
        | "general_manager"
        | "front_desk"
        | "housekeeping"
        | "maintenance"
        | "accountant"
        | "auditor"
        | "agent"
      portfolio_share_attr_status:
        | "pending"
        | "invoiced"
        | "paid"
        | "waived"
        | "disputed"
      portfolio_share_basis:
        | "gross_total"
        | "net_accommodation"
        | "net_after_rl_fees"
      portfolio_share_invoice_status:
        | "draft"
        | "sent"
        | "paid"
        | "overdue"
        | "cancelled"
      portfolio_share_origin: "portfolio_link" | "cross_property_site"
      pricing_rule_type:
        | "occupancy_based"
        | "lead_time"
        | "day_of_week"
        | "seasonal"
        | "demand"
        | "manual_override"
      referral_status: "pending" | "qualified" | "converted" | "churned"
      refund_status: "pending" | "approved" | "processed" | "rejected"
      rolos_reservation_status:
        | "pending"
        | "confirmed"
        | "checked_in"
        | "checked_out"
        | "cancelled"
        | "no_show"
      shift_type: "morning" | "afternoon" | "night" | "full_day" | "custom"
      waitlist_status:
        | "waiting"
        | "notified"
        | "booked"
        | "expired"
        | "cancelled"
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
      app_role: [
        "admin",
        "user",
        "dev",
        "fearless_leader",
        "sales_rep",
        "guest",
      ],
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
      billing_strategy: [
        "default",
        "widget",
        "rolos_pms",
        "portfolio_aggregator",
        "enterprise_white_label",
        "volume_tiered",
        "payment_facilitator",
      ],
      channel_connection_status: ["active", "paused", "error", "disconnected"],
      channel_name: [
        "booking_com",
        "airbnb",
        "expedia",
        "agoda",
        "google_hotels",
        "manual",
      ],
      channel_reservation_status: [
        "pending",
        "processed",
        "failed",
        "duplicate",
      ],
      channel_sync_status: ["success", "partial", "failed"],
      channel_sync_type: [
        "push_inventory",
        "pull_reservations",
        "push_rates",
        "full_sync",
      ],
      commission_entry_status: ["pending", "approved", "paid", "clawed_back"],
      commission_report_status: [
        "draft",
        "pending_approval",
        "approved",
        "paid",
      ],
      commission_tier: ["base", "accelerated", "elite"],
      component_type: ["pms", "internal", "external", "infrastructure"],
      dev_task_priority: ["low", "medium", "high", "critical"],
      dev_task_status: ["new", "started", "testing", "completed"],
      event_status: [
        "inquiry",
        "tentative",
        "confirmed",
        "in_progress",
        "completed",
        "cancelled",
      ],
      group_booking_status: ["inquiry", "tentative", "confirmed", "cancelled"],
      health_status: ["healthy", "degraded", "failed", "unknown"],
      help_impact_level: ["critical", "warning", "info"],
      invoice_status: ["draft", "issued", "paid", "overdue", "cancelled"],
      lead_source: [
        "cold_call",
        "referral",
        "event",
        "inbound",
        "partner",
        "social_media",
        "existing_client",
        "other",
      ],
      payment_method: [
        "cash",
        "card",
        "bank_transfer",
        "online",
        "voucher",
        "other",
      ],
      payment_status: [
        "pending",
        "completed",
        "failed",
        "refunded",
        "partially_refunded",
      ],
      pms_integration_status: [
        "coming_soon",
        "in_development",
        "parked",
        "in_testing",
        "deployed",
      ],
      pms_staff_role: [
        "property_owner",
        "general_manager",
        "front_desk",
        "housekeeping",
        "maintenance",
        "accountant",
        "auditor",
        "agent",
      ],
      portfolio_share_attr_status: [
        "pending",
        "invoiced",
        "paid",
        "waived",
        "disputed",
      ],
      portfolio_share_basis: [
        "gross_total",
        "net_accommodation",
        "net_after_rl_fees",
      ],
      portfolio_share_invoice_status: [
        "draft",
        "sent",
        "paid",
        "overdue",
        "cancelled",
      ],
      portfolio_share_origin: ["portfolio_link", "cross_property_site"],
      pricing_rule_type: [
        "occupancy_based",
        "lead_time",
        "day_of_week",
        "seasonal",
        "demand",
        "manual_override",
      ],
      referral_status: ["pending", "qualified", "converted", "churned"],
      refund_status: ["pending", "approved", "processed", "rejected"],
      rolos_reservation_status: [
        "pending",
        "confirmed",
        "checked_in",
        "checked_out",
        "cancelled",
        "no_show",
      ],
      shift_type: ["morning", "afternoon", "night", "full_day", "custom"],
      waitlist_status: [
        "waiting",
        "notified",
        "booked",
        "expired",
        "cancelled",
      ],
    },
  },
} as const
