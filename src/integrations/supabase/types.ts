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
      background_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          dedupe_key: string | null
          id: string
          job_type: string
          last_error: string | null
          max_attempts: number
          payload: Json
          run_after: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          job_type: string
          last_error?: string | null
          max_attempts?: number
          payload?: Json
          run_after?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          job_type?: string
          last_error?: string | null
          max_attempts?: number
          payload?: Json
          run_after?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      billing_config_change_log: {
        Row: {
          after_snapshot: Json
          before_snapshot: Json
          change_type: string
          changed_by: string | null
          created_at: string
          id: string
          invoice_id: string | null
          new_monthly_fee: number | null
          notes: string | null
          notification_status: string
          owner_id: string | null
          plan_effective_date: string | null
          portfolio_id: string | null
          previous_monthly_fee: number | null
          property_id: string | null
          requires_credit_note: boolean
          setup_delta: number
          setup_delta_lines: Json
          updated_at: string
        }
        Insert: {
          after_snapshot?: Json
          before_snapshot?: Json
          change_type?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          new_monthly_fee?: number | null
          notes?: string | null
          notification_status?: string
          owner_id?: string | null
          plan_effective_date?: string | null
          portfolio_id?: string | null
          previous_monthly_fee?: number | null
          property_id?: string | null
          requires_credit_note?: boolean
          setup_delta?: number
          setup_delta_lines?: Json
          updated_at?: string
        }
        Update: {
          after_snapshot?: Json
          before_snapshot?: Json
          change_type?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          new_monthly_fee?: number | null
          notes?: string | null
          notification_status?: string
          owner_id?: string | null
          plan_effective_date?: string | null
          portfolio_id?: string | null
          previous_monthly_fee?: number | null
          property_id?: string | null
          requires_credit_note?: boolean
          setup_delta?: number
          setup_delta_lines?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_config_change_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "subscription_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_config_change_log_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "property_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_config_change_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "billing_config_change_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_config_change_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_global_defaults: {
        Row: {
          branding_addon_allowed: boolean | null
          branding_addon_billing_mode: string | null
          branding_addon_monthly_fee: number | null
          branding_addon_setup_fee: number | null
          byo_gateway_monthly_fee: number | null
          channel_manager_per_unit_fee: number | null
          company_address: string | null
          company_legal_name: string | null
          default_commission_rate: number | null
          default_subscription_fee: number | null
          default_transaction_fee: number | null
          enterprise_custom_fee: number | null
          fee_margin_map_json: Json
          free_period_days_default: number
          id: string
          invoice_due_days: number
          invoice_footer_note: string | null
          is_preset: boolean
          listing_commission_rate: number | null
          notes: string | null
          pms_commission_rate: number | null
          portfolio_aggregator_billing_mode: string | null
          portfolio_aggregator_monthly_default: number | null
          portfolio_aggregator_setup_default: number | null
          preset_description: string | null
          preset_name: string | null
          pricelabs_monthly_fee: number | null
          pricelabs_setup_fee: number | null
          referral_clawback_days: number | null
          referral_first_year_rate: number | null
          referral_residual_months: number | null
          referral_residual_rate: number | null
          sales_rep_tier_criteria_json: Json | null
          sort_order: number
          strategy: string
          tier_pricing_json: Json | null
          updated_at: string | null
          updated_by: string | null
          vat_enabled: boolean
          vat_number: string | null
          vat_rate: number
          white_label_billing_mode: string | null
          white_label_monthly_fee: number | null
          white_label_setup_fee: number | null
          widget_flat_commission_rate: number | null
        }
        Insert: {
          branding_addon_allowed?: boolean | null
          branding_addon_billing_mode?: string | null
          branding_addon_monthly_fee?: number | null
          branding_addon_setup_fee?: number | null
          byo_gateway_monthly_fee?: number | null
          channel_manager_per_unit_fee?: number | null
          company_address?: string | null
          company_legal_name?: string | null
          default_commission_rate?: number | null
          default_subscription_fee?: number | null
          default_transaction_fee?: number | null
          enterprise_custom_fee?: number | null
          fee_margin_map_json?: Json
          free_period_days_default?: number
          id?: string
          invoice_due_days?: number
          invoice_footer_note?: string | null
          is_preset?: boolean
          listing_commission_rate?: number | null
          notes?: string | null
          pms_commission_rate?: number | null
          portfolio_aggregator_billing_mode?: string | null
          portfolio_aggregator_monthly_default?: number | null
          portfolio_aggregator_setup_default?: number | null
          preset_description?: string | null
          preset_name?: string | null
          pricelabs_monthly_fee?: number | null
          pricelabs_setup_fee?: number | null
          referral_clawback_days?: number | null
          referral_first_year_rate?: number | null
          referral_residual_months?: number | null
          referral_residual_rate?: number | null
          sales_rep_tier_criteria_json?: Json | null
          sort_order?: number
          strategy: string
          tier_pricing_json?: Json | null
          updated_at?: string | null
          updated_by?: string | null
          vat_enabled?: boolean
          vat_number?: string | null
          vat_rate?: number
          white_label_billing_mode?: string | null
          white_label_monthly_fee?: number | null
          white_label_setup_fee?: number | null
          widget_flat_commission_rate?: number | null
        }
        Update: {
          branding_addon_allowed?: boolean | null
          branding_addon_billing_mode?: string | null
          branding_addon_monthly_fee?: number | null
          branding_addon_setup_fee?: number | null
          byo_gateway_monthly_fee?: number | null
          channel_manager_per_unit_fee?: number | null
          company_address?: string | null
          company_legal_name?: string | null
          default_commission_rate?: number | null
          default_subscription_fee?: number | null
          default_transaction_fee?: number | null
          enterprise_custom_fee?: number | null
          fee_margin_map_json?: Json
          free_period_days_default?: number
          id?: string
          invoice_due_days?: number
          invoice_footer_note?: string | null
          is_preset?: boolean
          listing_commission_rate?: number | null
          notes?: string | null
          pms_commission_rate?: number | null
          portfolio_aggregator_billing_mode?: string | null
          portfolio_aggregator_monthly_default?: number | null
          portfolio_aggregator_setup_default?: number | null
          preset_description?: string | null
          preset_name?: string | null
          pricelabs_monthly_fee?: number | null
          pricelabs_setup_fee?: number | null
          referral_clawback_days?: number | null
          referral_first_year_rate?: number | null
          referral_residual_months?: number | null
          referral_residual_rate?: number | null
          sales_rep_tier_criteria_json?: Json | null
          sort_order?: number
          strategy?: string
          tier_pricing_json?: Json | null
          updated_at?: string | null
          updated_by?: string | null
          vat_enabled?: boolean
          vat_number?: string | null
          vat_rate?: number
          white_label_billing_mode?: string | null
          white_label_monthly_fee?: number | null
          white_label_setup_fee?: number | null
          widget_flat_commission_rate?: number | null
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
      booking_reference_counters: {
        Row: {
          created_at: string
          last_seq: number
          property_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          last_seq?: number
          property_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          last_seq?: number
          property_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_reference_counters_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "booking_reference_counters_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_reference_counters_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
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
          agent_account_id: string | null
          ai_metadata: Json | null
          amount_paid: number
          amount_paid_source: string | null
          balance_due: number
          booker_email: string | null
          booker_id: string | null
          booker_is_guest: boolean
          booker_name: string | null
          booker_phone: string | null
          booking_channel: string | null
          booking_made_by: string | null
          calculated_commission: number | null
          cancellation_reason: string | null
          cancellation_reason_category: string | null
          channel_listing_id: string | null
          charges_breakdown: Json | null
          check_in_date: string
          check_out_date: string
          children: number | null
          comm_channel: string | null
          commission_calculated_at: string | null
          commission_rate_applied: number | null
          commission_type: string | null
          company_account_id: string | null
          created_at: string | null
          credit_held: number
          deposit_amount: number
          deposit_due_date: string | null
          external_reservation_id: string | null
          guest_company: string | null
          guest_email: string
          guest_email_encrypted: string | null
          guest_first_name: string | null
          guest_last_name: string | null
          guest_name: string
          guest_name_encrypted: string | null
          guest_nationality: string | null
          guest_phone: string | null
          guest_phone_encrypted: string | null
          hold_expires_at: string | null
          hold_released_at: string | null
          id: string
          infants: number | null
          integration_type: string | null
          internal_notes: string | null
          invoice_to_address: string | null
          invoice_to_name: string | null
          invoice_to_vat: string | null
          is_trade: boolean
          last_modified_at: string | null
          lead_created_at: string | null
          market_segment: string | null
          modification_notes: Json | null
          modified_by: string | null
          origin_portfolio_id: string | null
          origin_property_id: string | null
          origin_type: string | null
          origin_url: string | null
          overbook_override_at: string | null
          overbook_override_by: string | null
          overbook_override_reason: string | null
          paid_at: string | null
          payment_intent_id: string | null
          payment_method: string | null
          payment_reference: string | null
          payment_status: string | null
          pets: number | null
          property_id: string
          rate_type_id: string | null
          requires_intervention: boolean | null
          reservation_hold: boolean
          rol_ref_kind: string | null
          rol_ref_origin: string | null
          rol_reference: string | null
          rol_reference_legacy: string | null
          rolos_check_in_time: string | null
          rolos_check_out_time: string | null
          rolos_folio_id: string | null
          rolos_guest_id: string | null
          rolos_rate_plan_id: string | null
          rolos_room_ids: string[] | null
          room_type_id: string | null
          rooms: Json | null
          second_guest_email: string | null
          second_guest_name: string | null
          second_guest_phone: string | null
          source_account_id: string | null
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
          agent_account_id?: string | null
          ai_metadata?: Json | null
          amount_paid?: number
          amount_paid_source?: string | null
          balance_due?: number
          booker_email?: string | null
          booker_id?: string | null
          booker_is_guest?: boolean
          booker_name?: string | null
          booker_phone?: string | null
          booking_channel?: string | null
          booking_made_by?: string | null
          calculated_commission?: number | null
          cancellation_reason?: string | null
          cancellation_reason_category?: string | null
          channel_listing_id?: string | null
          charges_breakdown?: Json | null
          check_in_date: string
          check_out_date: string
          children?: number | null
          comm_channel?: string | null
          commission_calculated_at?: string | null
          commission_rate_applied?: number | null
          commission_type?: string | null
          company_account_id?: string | null
          created_at?: string | null
          credit_held?: number
          deposit_amount?: number
          deposit_due_date?: string | null
          external_reservation_id?: string | null
          guest_company?: string | null
          guest_email: string
          guest_email_encrypted?: string | null
          guest_first_name?: string | null
          guest_last_name?: string | null
          guest_name: string
          guest_name_encrypted?: string | null
          guest_nationality?: string | null
          guest_phone?: string | null
          guest_phone_encrypted?: string | null
          hold_expires_at?: string | null
          hold_released_at?: string | null
          id?: string
          infants?: number | null
          integration_type?: string | null
          internal_notes?: string | null
          invoice_to_address?: string | null
          invoice_to_name?: string | null
          invoice_to_vat?: string | null
          is_trade?: boolean
          last_modified_at?: string | null
          lead_created_at?: string | null
          market_segment?: string | null
          modification_notes?: Json | null
          modified_by?: string | null
          origin_portfolio_id?: string | null
          origin_property_id?: string | null
          origin_type?: string | null
          origin_url?: string | null
          overbook_override_at?: string | null
          overbook_override_by?: string | null
          overbook_override_reason?: string | null
          paid_at?: string | null
          payment_intent_id?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          pets?: number | null
          property_id: string
          rate_type_id?: string | null
          requires_intervention?: boolean | null
          reservation_hold?: boolean
          rol_ref_kind?: string | null
          rol_ref_origin?: string | null
          rol_reference?: string | null
          rol_reference_legacy?: string | null
          rolos_check_in_time?: string | null
          rolos_check_out_time?: string | null
          rolos_folio_id?: string | null
          rolos_guest_id?: string | null
          rolos_rate_plan_id?: string | null
          rolos_room_ids?: string[] | null
          room_type_id?: string | null
          rooms?: Json | null
          second_guest_email?: string | null
          second_guest_name?: string | null
          second_guest_phone?: string | null
          source_account_id?: string | null
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
          agent_account_id?: string | null
          ai_metadata?: Json | null
          amount_paid?: number
          amount_paid_source?: string | null
          balance_due?: number
          booker_email?: string | null
          booker_id?: string | null
          booker_is_guest?: boolean
          booker_name?: string | null
          booker_phone?: string | null
          booking_channel?: string | null
          booking_made_by?: string | null
          calculated_commission?: number | null
          cancellation_reason?: string | null
          cancellation_reason_category?: string | null
          channel_listing_id?: string | null
          charges_breakdown?: Json | null
          check_in_date?: string
          check_out_date?: string
          children?: number | null
          comm_channel?: string | null
          commission_calculated_at?: string | null
          commission_rate_applied?: number | null
          commission_type?: string | null
          company_account_id?: string | null
          created_at?: string | null
          credit_held?: number
          deposit_amount?: number
          deposit_due_date?: string | null
          external_reservation_id?: string | null
          guest_company?: string | null
          guest_email?: string
          guest_email_encrypted?: string | null
          guest_first_name?: string | null
          guest_last_name?: string | null
          guest_name?: string
          guest_name_encrypted?: string | null
          guest_nationality?: string | null
          guest_phone?: string | null
          guest_phone_encrypted?: string | null
          hold_expires_at?: string | null
          hold_released_at?: string | null
          id?: string
          infants?: number | null
          integration_type?: string | null
          internal_notes?: string | null
          invoice_to_address?: string | null
          invoice_to_name?: string | null
          invoice_to_vat?: string | null
          is_trade?: boolean
          last_modified_at?: string | null
          lead_created_at?: string | null
          market_segment?: string | null
          modification_notes?: Json | null
          modified_by?: string | null
          origin_portfolio_id?: string | null
          origin_property_id?: string | null
          origin_type?: string | null
          origin_url?: string | null
          overbook_override_at?: string | null
          overbook_override_by?: string | null
          overbook_override_reason?: string | null
          paid_at?: string | null
          payment_intent_id?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          pets?: number | null
          property_id?: string
          rate_type_id?: string | null
          requires_intervention?: boolean | null
          reservation_hold?: boolean
          rol_ref_kind?: string | null
          rol_ref_origin?: string | null
          rol_reference?: string | null
          rol_reference_legacy?: string | null
          rolos_check_in_time?: string | null
          rolos_check_out_time?: string | null
          rolos_folio_id?: string | null
          rolos_guest_id?: string | null
          rolos_rate_plan_id?: string | null
          rolos_room_ids?: string[] | null
          room_type_id?: string | null
          rooms?: Json | null
          second_guest_email?: string | null
          second_guest_name?: string | null
          second_guest_phone?: string | null
          source_account_id?: string | null
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
            foreignKeyName: "bookings_agent_account_id_fkey"
            columns: ["agent_account_id"]
            isOneToOne: false
            referencedRelation: "crm_account_stats"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "bookings_agent_account_id_fkey"
            columns: ["agent_account_id"]
            isOneToOne: false
            referencedRelation: "crm_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_booker_id_fkey"
            columns: ["booker_id"]
            isOneToOne: false
            referencedRelation: "crm_bookers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_company_account_id_fkey"
            columns: ["company_account_id"]
            isOneToOne: false
            referencedRelation: "crm_account_stats"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "bookings_company_account_id_fkey"
            columns: ["company_account_id"]
            isOneToOne: false
            referencedRelation: "crm_accounts"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "bookings_source_account_id_fkey"
            columns: ["source_account_id"]
            isOneToOne: false
            referencedRelation: "crm_account_stats"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "bookings_source_account_id_fkey"
            columns: ["source_account_id"]
            isOneToOne: false
            referencedRelation: "crm_accounts"
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
      channel_booking_events: {
        Row: {
          action: string
          booking_id: string | null
          channel_listing_id: string | null
          channel_owner_id: string | null
          channel_reservation_id: string | null
          created_at: string
          details: Json
          direction: string
          id: string
          outcome: string
          property_id: string | null
          reason: string | null
          source: string | null
          summary: string | null
          trace_id: string | null
          unit_id: string | null
        }
        Insert: {
          action: string
          booking_id?: string | null
          channel_listing_id?: string | null
          channel_owner_id?: string | null
          channel_reservation_id?: string | null
          created_at?: string
          details?: Json
          direction?: string
          id?: string
          outcome?: string
          property_id?: string | null
          reason?: string | null
          source?: string | null
          summary?: string | null
          trace_id?: string | null
          unit_id?: string | null
        }
        Update: {
          action?: string
          booking_id?: string | null
          channel_listing_id?: string | null
          channel_owner_id?: string | null
          channel_reservation_id?: string | null
          created_at?: string
          details?: Json
          direction?: string
          id?: string
          outcome?: string
          property_id?: string | null
          reason?: string | null
          source?: string | null
          summary?: string | null
          trace_id?: string | null
          unit_id?: string | null
        }
        Relationships: []
      }
      channel_price_coverage_status: {
        Row: {
          channel: string
          channel_listing_id: string | null
          channel_priced_days: number | null
          channel_seasons: number | null
          channel_zero_priced_days: number | null
          created_at: string
          details: Json
          error_message: string | null
          expected_days: number | null
          first_gap_date: string | null
          gap_summary: string | null
          id: string
          last_audit_at: string
          last_repush_at: string | null
          local_unpriced_days: number | null
          property_id: string
          repush_attempts: number
          room_type_id: string | null
          unit_name: string | null
          updated_at: string
          verdict: string
          window_from: string | null
          window_to: string | null
        }
        Insert: {
          channel?: string
          channel_listing_id?: string | null
          channel_priced_days?: number | null
          channel_seasons?: number | null
          channel_zero_priced_days?: number | null
          created_at?: string
          details?: Json
          error_message?: string | null
          expected_days?: number | null
          first_gap_date?: string | null
          gap_summary?: string | null
          id?: string
          last_audit_at?: string
          last_repush_at?: string | null
          local_unpriced_days?: number | null
          property_id: string
          repush_attempts?: number
          room_type_id?: string | null
          unit_name?: string | null
          updated_at?: string
          verdict?: string
          window_from?: string | null
          window_to?: string | null
        }
        Update: {
          channel?: string
          channel_listing_id?: string | null
          channel_priced_days?: number | null
          channel_seasons?: number | null
          channel_zero_priced_days?: number | null
          created_at?: string
          details?: Json
          error_message?: string | null
          expected_days?: number | null
          first_gap_date?: string | null
          gap_summary?: string | null
          id?: string
          last_audit_at?: string
          last_repush_at?: string | null
          local_unpriced_days?: number | null
          property_id?: string
          repush_attempts?: number
          room_type_id?: string | null
          unit_name?: string | null
          updated_at?: string
          verdict?: string
          window_from?: string | null
          window_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_price_coverage_status_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "channel_price_coverage_status_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_price_coverage_status_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_reconciliation_runs: {
        Row: {
          alert_error: string | null
          alert_recipients: string[]
          alert_sent: boolean
          channel_listing_count: number
          created_at: string
          duplicate_count: number
          error_account_count: number
          findings: Json
          has_disparity: boolean
          id: string
          local_billable_listings: number
          orphan_count: number
          ran_at: string
          run_error: string | null
          stale_count: number
          trigger: string
        }
        Insert: {
          alert_error?: string | null
          alert_recipients?: string[]
          alert_sent?: boolean
          channel_listing_count?: number
          created_at?: string
          duplicate_count?: number
          error_account_count?: number
          findings?: Json
          has_disparity?: boolean
          id?: string
          local_billable_listings?: number
          orphan_count?: number
          ran_at?: string
          run_error?: string | null
          stale_count?: number
          trigger?: string
        }
        Update: {
          alert_error?: string | null
          alert_recipients?: string[]
          alert_sent?: boolean
          channel_listing_count?: number
          created_at?: string
          duplicate_count?: number
          error_account_count?: number
          findings?: Json
          has_disparity?: boolean
          id?: string
          local_billable_listings?: number
          orphan_count?: number
          ran_at?: string
          run_error?: string | null
          stale_count?: number
          trigger?: string
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
      commission_reference_counters: {
        Row: {
          id: string
          last_value: number
          scope_key: string
          updated_at: string
        }
        Insert: {
          id?: string
          last_value?: number
          scope_key: string
          updated_at?: string
        }
        Update: {
          id?: string
          last_value?: number
          scope_key?: string
          updated_at?: string
        }
        Relationships: []
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
          kind: string
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
          kind?: string
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
          kind?: string
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
      crm_accounts: {
        Row: {
          account_type: Database["public"]["Enums"]["crm_account_type"]
          address_line1: string | null
          address_line2: string | null
          city: string | null
          contact_first_name: string | null
          contact_last_name: string | null
          contact_title: string | null
          country: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          default_commission_rate: number | null
          email: string | null
          id: string
          is_active: boolean
          is_credit_account: boolean
          name: string
          notes: string | null
          payment_terms_days: number | null
          phone: string | null
          portfolio_id: string | null
          postal_code: string | null
          property_id: string | null
          registration_number: string | null
          tags: string[] | null
          updated_at: string
          vat_number: string | null
          website: string | null
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["crm_account_type"]
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          contact_first_name?: string | null
          contact_last_name?: string | null
          contact_title?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          default_commission_rate?: number | null
          email?: string | null
          id?: string
          is_active?: boolean
          is_credit_account?: boolean
          name: string
          notes?: string | null
          payment_terms_days?: number | null
          phone?: string | null
          portfolio_id?: string | null
          postal_code?: string | null
          property_id?: string | null
          registration_number?: string | null
          tags?: string[] | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Update: {
          account_type?: Database["public"]["Enums"]["crm_account_type"]
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          contact_first_name?: string | null
          contact_last_name?: string | null
          contact_title?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          default_commission_rate?: number | null
          email?: string | null
          id?: string
          is_active?: boolean
          is_credit_account?: boolean
          name?: string
          notes?: string | null
          payment_terms_days?: number | null
          phone?: string | null
          portfolio_id?: string | null
          postal_code?: string | null
          property_id?: string | null
          registration_number?: string | null
          tags?: string[] | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_accounts_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "property_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_accounts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "crm_accounts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_accounts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_bookers: {
        Row: {
          account_id: string | null
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          portfolio_id: string | null
          property_id: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          portfolio_id?: string | null
          property_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          portfolio_id?: string | null
          property_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_bookers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "crm_account_stats"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "crm_bookers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "crm_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_bookers_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "property_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_bookers_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "crm_bookers_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_bookers_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
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
          burn_source: string
          cash_balance_usd: number | null
          cash_balance_zar: number | null
          created_at: string | null
          created_by: string | null
          eur_rate: number | null
          exchange_rate: number | null
          id: string
          metric_date: string
          monthly_burn_usd: number | null
          monthly_burn_zar: number | null
          monthly_revenue_usd: number | null
          monthly_revenue_zar: number | null
          notes: string | null
          runway_months: number | null
          updated_at: string | null
        }
        Insert: {
          burn_source?: string
          cash_balance_usd?: number | null
          cash_balance_zar?: number | null
          created_at?: string | null
          created_by?: string | null
          eur_rate?: number | null
          exchange_rate?: number | null
          id?: string
          metric_date: string
          monthly_burn_usd?: number | null
          monthly_burn_zar?: number | null
          monthly_revenue_usd?: number | null
          monthly_revenue_zar?: number | null
          notes?: string | null
          runway_months?: number | null
          updated_at?: string | null
        }
        Update: {
          burn_source?: string
          cash_balance_usd?: number | null
          cash_balance_zar?: number | null
          created_at?: string | null
          created_by?: string | null
          eur_rate?: number | null
          exchange_rate?: number | null
          id?: string
          metric_date?: string
          monthly_burn_usd?: number | null
          monthly_burn_zar?: number | null
          monthly_revenue_usd?: number | null
          monthly_revenue_zar?: number | null
          notes?: string | null
          runway_months?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      gateway_billing_configs: {
        Row: {
          base_percentage: number
          created_at: string
          created_by: string | null
          currency: string
          effective_from: string
          fixed_fee_per_txn: number | null
          id: string
          is_active: boolean
          model: string
          monthly_platform_fee: number | null
          name: string
          notes: string | null
          passthrough_markup_percentage: number | null
          updated_at: string
          version: number
          volume_tiers: Json
        }
        Insert: {
          base_percentage?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from?: string
          fixed_fee_per_txn?: number | null
          id?: string
          is_active?: boolean
          model?: string
          monthly_platform_fee?: number | null
          name: string
          notes?: string | null
          passthrough_markup_percentage?: number | null
          updated_at?: string
          version?: number
          volume_tiers?: Json
        }
        Update: {
          base_percentage?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from?: string
          fixed_fee_per_txn?: number | null
          id?: string
          is_active?: boolean
          model?: string
          monthly_platform_fee?: number | null
          name?: string
          notes?: string | null
          passthrough_markup_percentage?: number | null
          updated_at?: string
          version?: number
          volume_tiers?: Json
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
          ru_image_tags: Json
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
          ru_image_tags?: Json
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
          ru_image_tags?: Json
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
          cost_eur: number | null
          cost_usd: number
          cost_zar: number | null
          created_at: string | null
          created_by: string | null
          description: string
          document_name: string | null
          document_path: string | null
          document_size: number | null
          document_type: string | null
          due_date: string | null
          id: string
          invoice_date: string | null
          is_paid: boolean | null
          notes: string | null
          paid_at: string | null
          receipt_number: string | null
          source_currency: string
          updated_at: string | null
          vendor: string | null
        }
        Insert: {
          billing_type: string
          category?: string | null
          cost_eur?: number | null
          cost_usd: number
          cost_zar?: number | null
          created_at?: string | null
          created_by?: string | null
          description: string
          document_name?: string | null
          document_path?: string | null
          document_size?: number | null
          document_type?: string | null
          due_date?: string | null
          id?: string
          invoice_date?: string | null
          is_paid?: boolean | null
          notes?: string | null
          paid_at?: string | null
          receipt_number?: string | null
          source_currency?: string
          updated_at?: string | null
          vendor?: string | null
        }
        Update: {
          billing_type?: string
          category?: string | null
          cost_eur?: number | null
          cost_usd?: number
          cost_zar?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string
          document_name?: string | null
          document_path?: string | null
          document_size?: number | null
          document_type?: string | null
          due_date?: string | null
          id?: string
          invoice_date?: string | null
          is_paid?: boolean | null
          notes?: string | null
          paid_at?: string | null
          receipt_number?: string | null
          source_currency?: string
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
          rol_reference: string | null
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
          rol_reference?: string | null
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
          rol_reference?: string | null
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
      itinerary_reference_counters: {
        Row: {
          created_at: string
          last_seq: number
          scope: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          last_seq?: number
          scope: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          last_seq?: number
          scope?: string
          updated_at?: string
        }
        Relationships: []
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
          ru_destination_id: number | null
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
          ru_destination_id?: number | null
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
          ru_destination_id?: number | null
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
      nb_import_runs: {
        Row: {
          created_at: string
          created_by: string | null
          errors: Json
          file_bytes: number | null
          file_name: string | null
          future_stays: number
          id: string
          max_arrival: string | null
          min_arrival: string | null
          mode: string
          property_id: string
          skipped: Json
          summary: Json
          unmapped_rooms: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          errors?: Json
          file_bytes?: number | null
          file_name?: string | null
          future_stays?: number
          id?: string
          max_arrival?: string | null
          min_arrival?: string | null
          mode?: string
          property_id: string
          skipped?: Json
          summary?: Json
          unmapped_rooms?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          errors?: Json
          file_bytes?: number | null
          file_name?: string | null
          future_stays?: number
          id?: string
          max_arrival?: string | null
          min_arrival?: string | null
          mode?: string
          property_id?: string
          skipped?: Json
          summary?: Json
          unmapped_rooms?: string[]
          updated_at?: string
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
      owner_integrations: {
        Row: {
          access_token: string | null
          config: Json
          created_at: string
          enabled: boolean
          id: string
          last_error: string | null
          last_sync_at: string | null
          owner_id: string
          portal_id: string | null
          refresh_token: string | null
          service: string
          sync_status: string
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          owner_id: string
          portal_id?: string | null
          refresh_token?: string | null
          service: string
          sync_status?: string
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          owner_id?: string
          portal_id?: string | null
          refresh_token?: string | null
          service?: string
          sync_status?: string
          updated_at?: string
        }
        Relationships: []
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
          credential_source: string | null
          currency: string | null
          gateway_response: Json | null
          id: string
          m_payment_id: string | null
          merchant_id: string | null
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
          credential_source?: string | null
          currency?: string | null
          gateway_response?: Json | null
          id?: string
          m_payment_id?: string | null
          merchant_id?: string | null
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
          credential_source?: string | null
          currency?: string | null
          gateway_response?: Json | null
          id?: string
          m_payment_id?: string | null
          merchant_id?: string | null
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
      payout_reference_counters: {
        Row: {
          id: string
          last_value: number
          scope_key: string
          updated_at: string
        }
        Insert: {
          id?: string
          last_value?: number
          scope_key: string
          updated_at?: string
        }
        Update: {
          id?: string
          last_value?: number
          scope_key?: string
          updated_at?: string
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
      portfolio_billing_configs: {
        Row: {
          auto_charge_failures: number
          billing_anchor_day: number | null
          billing_enabled: boolean
          billing_start_date: string | null
          billing_strategy: Database["public"]["Enums"]["billing_strategy"]
          billing_switched_off_at: string | null
          branding_addon_billing_mode: string | null
          branding_addon_enabled: boolean | null
          branding_addon_monthly_fee: number | null
          branding_addon_setup_fee: number | null
          byo_gateway_monthly_fee: number | null
          cancel_at_period_end: boolean
          cancel_effective_date: string | null
          cancelled_at: string | null
          channel_manager_enabled: boolean | null
          channel_manager_per_unit_fee: number | null
          cloudflare_custom_hostname_id: string | null
          commission_rate: number | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          custom_domain_error: string | null
          custom_overrides: Json | null
          engagement_date: string | null
          enterprise_custom_fee: number | null
          free_period_days: number | null
          gateway_billing_config_id: string | null
          gateway_fixed_fee_override: number | null
          gateway_percentage_override: number | null
          id: string
          last_auto_charge_at: string | null
          last_auto_charge_error: string | null
          last_auto_charge_status: string | null
          last_invoice_id: string | null
          linked_contract_id: string | null
          listing_commission_rate: number | null
          mandate_amount: number | null
          mandate_cancelled_at: string | null
          mandate_created_at: string | null
          mandate_requires_reauth: boolean
          mandate_status: string | null
          mandate_token: string | null
          payment_facilitator_enabled: boolean | null
          payment_model: string | null
          pending_effective_date: string | null
          pending_model_json: Json | null
          pending_monthly_fee: number | null
          plan_change_reason: string | null
          plan_changed_at: string | null
          pms_commission_rate: number | null
          portfolio_id: string
          previous_subscription_fee: number | null
          pricelabs_allowed: boolean
          pricelabs_monthly_fee: number | null
          pricelabs_setup_fee: number | null
          room_count_override: number | null
          subscription_fee_monthly: number | null
          subscription_reset_pending: boolean
          subscription_started_on: string | null
          subscription_status: string
          suspended_at: string | null
          tier_pricing_json: Json | null
          transaction_fee_percentage: number | null
          updated_at: string
          volume_tier_json: Json | null
          white_label_allowed: boolean | null
          white_label_billing_mode: string | null
          white_label_domain: string | null
          white_label_domain_last_error: string | null
          white_label_domain_status: string
          white_label_domain_verified_at: string | null
          white_label_monthly_fee: number | null
          white_label_setup_fee: number | null
          widget_flat_commission_rate: number | null
        }
        Insert: {
          auto_charge_failures?: number
          billing_anchor_day?: number | null
          billing_enabled?: boolean
          billing_start_date?: string | null
          billing_strategy?: Database["public"]["Enums"]["billing_strategy"]
          billing_switched_off_at?: string | null
          branding_addon_billing_mode?: string | null
          branding_addon_enabled?: boolean | null
          branding_addon_monthly_fee?: number | null
          branding_addon_setup_fee?: number | null
          byo_gateway_monthly_fee?: number | null
          cancel_at_period_end?: boolean
          cancel_effective_date?: string | null
          cancelled_at?: string | null
          channel_manager_enabled?: boolean | null
          channel_manager_per_unit_fee?: number | null
          cloudflare_custom_hostname_id?: string | null
          commission_rate?: number | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          custom_domain_error?: string | null
          custom_overrides?: Json | null
          engagement_date?: string | null
          enterprise_custom_fee?: number | null
          free_period_days?: number | null
          gateway_billing_config_id?: string | null
          gateway_fixed_fee_override?: number | null
          gateway_percentage_override?: number | null
          id?: string
          last_auto_charge_at?: string | null
          last_auto_charge_error?: string | null
          last_auto_charge_status?: string | null
          last_invoice_id?: string | null
          linked_contract_id?: string | null
          listing_commission_rate?: number | null
          mandate_amount?: number | null
          mandate_cancelled_at?: string | null
          mandate_created_at?: string | null
          mandate_requires_reauth?: boolean
          mandate_status?: string | null
          mandate_token?: string | null
          payment_facilitator_enabled?: boolean | null
          payment_model?: string | null
          pending_effective_date?: string | null
          pending_model_json?: Json | null
          pending_monthly_fee?: number | null
          plan_change_reason?: string | null
          plan_changed_at?: string | null
          pms_commission_rate?: number | null
          portfolio_id: string
          previous_subscription_fee?: number | null
          pricelabs_allowed?: boolean
          pricelabs_monthly_fee?: number | null
          pricelabs_setup_fee?: number | null
          room_count_override?: number | null
          subscription_fee_monthly?: number | null
          subscription_reset_pending?: boolean
          subscription_started_on?: string | null
          subscription_status?: string
          suspended_at?: string | null
          tier_pricing_json?: Json | null
          transaction_fee_percentage?: number | null
          updated_at?: string
          volume_tier_json?: Json | null
          white_label_allowed?: boolean | null
          white_label_billing_mode?: string | null
          white_label_domain?: string | null
          white_label_domain_last_error?: string | null
          white_label_domain_status?: string
          white_label_domain_verified_at?: string | null
          white_label_monthly_fee?: number | null
          white_label_setup_fee?: number | null
          widget_flat_commission_rate?: number | null
        }
        Update: {
          auto_charge_failures?: number
          billing_anchor_day?: number | null
          billing_enabled?: boolean
          billing_start_date?: string | null
          billing_strategy?: Database["public"]["Enums"]["billing_strategy"]
          billing_switched_off_at?: string | null
          branding_addon_billing_mode?: string | null
          branding_addon_enabled?: boolean | null
          branding_addon_monthly_fee?: number | null
          branding_addon_setup_fee?: number | null
          byo_gateway_monthly_fee?: number | null
          cancel_at_period_end?: boolean
          cancel_effective_date?: string | null
          cancelled_at?: string | null
          channel_manager_enabled?: boolean | null
          channel_manager_per_unit_fee?: number | null
          cloudflare_custom_hostname_id?: string | null
          commission_rate?: number | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          custom_domain_error?: string | null
          custom_overrides?: Json | null
          engagement_date?: string | null
          enterprise_custom_fee?: number | null
          free_period_days?: number | null
          gateway_billing_config_id?: string | null
          gateway_fixed_fee_override?: number | null
          gateway_percentage_override?: number | null
          id?: string
          last_auto_charge_at?: string | null
          last_auto_charge_error?: string | null
          last_auto_charge_status?: string | null
          last_invoice_id?: string | null
          linked_contract_id?: string | null
          listing_commission_rate?: number | null
          mandate_amount?: number | null
          mandate_cancelled_at?: string | null
          mandate_created_at?: string | null
          mandate_requires_reauth?: boolean
          mandate_status?: string | null
          mandate_token?: string | null
          payment_facilitator_enabled?: boolean | null
          payment_model?: string | null
          pending_effective_date?: string | null
          pending_model_json?: Json | null
          pending_monthly_fee?: number | null
          plan_change_reason?: string | null
          plan_changed_at?: string | null
          pms_commission_rate?: number | null
          portfolio_id?: string
          previous_subscription_fee?: number | null
          pricelabs_allowed?: boolean
          pricelabs_monthly_fee?: number | null
          pricelabs_setup_fee?: number | null
          room_count_override?: number | null
          subscription_fee_monthly?: number | null
          subscription_reset_pending?: boolean
          subscription_started_on?: string | null
          subscription_status?: string
          suspended_at?: string | null
          tier_pricing_json?: Json | null
          transaction_fee_percentage?: number | null
          updated_at?: string
          volume_tier_json?: Json | null
          white_label_allowed?: boolean | null
          white_label_billing_mode?: string | null
          white_label_domain?: string | null
          white_label_domain_last_error?: string | null
          white_label_domain_status?: string
          white_label_domain_verified_at?: string | null
          white_label_monthly_fee?: number | null
          white_label_setup_fee?: number | null
          widget_flat_commission_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_billing_configs_gateway_billing_config_id_fkey"
            columns: ["gateway_billing_config_id"]
            isOneToOne: false
            referencedRelation: "gateway_billing_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_billing_configs_linked_contract_id_fkey"
            columns: ["linked_contract_id"]
            isOneToOne: false
            referencedRelation: "contract_template_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_billing_configs_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: true
            referencedRelation: "property_portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_payment_configs: {
        Row: {
          allow_custom_payment_provider: boolean
          created_at: string
          credentials: Json
          id: string
          payment_mode: string
          payment_providers: string[]
          portfolio_id: string
          updated_at: string
        }
        Insert: {
          allow_custom_payment_provider?: boolean
          created_at?: string
          credentials?: Json
          id?: string
          payment_mode?: string
          payment_providers?: string[]
          portfolio_id: string
          updated_at?: string
        }
        Update: {
          allow_custom_payment_provider?: boolean
          created_at?: string
          credentials?: Json
          id?: string
          payment_mode?: string
          payment_providers?: string[]
          portfolio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_payment_configs_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: true
            referencedRelation: "property_portfolios"
            referencedColumns: ["id"]
          },
        ]
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
      pricelabs_price_suggestions: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          applied_price: number | null
          created_at: string
          current_price: number | null
          date: string
          demand_signal: string | null
          id: string
          listing_id: string | null
          max_price: number | null
          min_price: number | null
          occupancy: number | null
          property_id: string
          pulled_at: string
          rate_plan_id: string | null
          raw: Json | null
          room_type_id: string | null
          suggested_price: number
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          applied_price?: number | null
          created_at?: string
          current_price?: number | null
          date: string
          demand_signal?: string | null
          id?: string
          listing_id?: string | null
          max_price?: number | null
          min_price?: number | null
          occupancy?: number | null
          property_id: string
          pulled_at?: string
          rate_plan_id?: string | null
          raw?: Json | null
          room_type_id?: string | null
          suggested_price: number
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          applied_price?: number | null
          created_at?: string
          current_price?: number | null
          date?: string
          demand_signal?: string | null
          id?: string
          listing_id?: string | null
          max_price?: number | null
          min_price?: number | null
          occupancy?: number | null
          property_id?: string
          pulled_at?: string
          rate_plan_id?: string | null
          raw?: Json | null
          room_type_id?: string | null
          suggested_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricelabs_price_suggestions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "pricelabs_price_suggestions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricelabs_price_suggestions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricelabs_price_suggestions_rate_plan_id_fkey"
            columns: ["rate_plan_id"]
            isOneToOne: false
            referencedRelation: "rolos_rate_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricelabs_price_suggestions_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "rolos_room_types"
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
          cancellation_master_mode: string
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
          is_reports_client: boolean
          is_rol_property: boolean | null
          is_sandbox: boolean
          is_test_property: boolean
          is_trading: boolean
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
          payment_mode: string
          payment_provider: string | null
          payment_provider_override: boolean
          payment_providers: string[] | null
          permanently_deleted_at: string | null
          pms_managed_fields: string[] | null
          pms_readiness: string | null
          pms_sync_status: string | null
          post_stay_survey_enabled: boolean
          postal_code: string | null
          price_per_night: number
          pricelabs_config: Json
          property_type: string
          property_url: string | null
          rate_resolution_mode: string
          ref_code: string | null
          refund_auto_approve_cap: number
          refund_auto_approve_enabled: boolean
          rentalsunited_building_id: string | null
          rentalsunited_property_id: string | null
          reports_client_archived_at: string | null
          review_sentiment: Json | null
          ru_archived: boolean
          ru_archived_at: string | null
          ru_hold_reason: string | null
          ru_hold_set_at: string | null
          ru_hold_set_by: string | null
          ru_image_tags: Json
          ru_listings_expected_units: number | null
          ru_listings_unmatched: Json
          ru_listings_verified_at: string | null
          ru_listings_verified_owner: string | null
          ru_listings_verified_units: number | null
          ru_location_id: number | null
          ru_push_enabled: boolean
          separate_kitchen: boolean
          short_description: string | null
          show_on_website: boolean | null
          siteminder_property_code: string | null
          slug: string | null
          timezone: string
          toilets: number | null
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
          cancellation_master_mode?: string
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
          is_reports_client?: boolean
          is_rol_property?: boolean | null
          is_sandbox?: boolean
          is_test_property?: boolean
          is_trading?: boolean
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
          payment_mode?: string
          payment_provider?: string | null
          payment_provider_override?: boolean
          payment_providers?: string[] | null
          permanently_deleted_at?: string | null
          pms_managed_fields?: string[] | null
          pms_readiness?: string | null
          pms_sync_status?: string | null
          post_stay_survey_enabled?: boolean
          postal_code?: string | null
          price_per_night: number
          pricelabs_config?: Json
          property_type: string
          property_url?: string | null
          rate_resolution_mode?: string
          ref_code?: string | null
          refund_auto_approve_cap?: number
          refund_auto_approve_enabled?: boolean
          rentalsunited_building_id?: string | null
          rentalsunited_property_id?: string | null
          reports_client_archived_at?: string | null
          review_sentiment?: Json | null
          ru_archived?: boolean
          ru_archived_at?: string | null
          ru_hold_reason?: string | null
          ru_hold_set_at?: string | null
          ru_hold_set_by?: string | null
          ru_image_tags?: Json
          ru_listings_expected_units?: number | null
          ru_listings_unmatched?: Json
          ru_listings_verified_at?: string | null
          ru_listings_verified_owner?: string | null
          ru_listings_verified_units?: number | null
          ru_location_id?: number | null
          ru_push_enabled?: boolean
          separate_kitchen?: boolean
          short_description?: string | null
          show_on_website?: boolean | null
          siteminder_property_code?: string | null
          slug?: string | null
          timezone?: string
          toilets?: number | null
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
          cancellation_master_mode?: string
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
          is_reports_client?: boolean
          is_rol_property?: boolean | null
          is_sandbox?: boolean
          is_test_property?: boolean
          is_trading?: boolean
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
          payment_mode?: string
          payment_provider?: string | null
          payment_provider_override?: boolean
          payment_providers?: string[] | null
          permanently_deleted_at?: string | null
          pms_managed_fields?: string[] | null
          pms_readiness?: string | null
          pms_sync_status?: string | null
          post_stay_survey_enabled?: boolean
          postal_code?: string | null
          price_per_night?: number
          pricelabs_config?: Json
          property_type?: string
          property_url?: string | null
          rate_resolution_mode?: string
          ref_code?: string | null
          refund_auto_approve_cap?: number
          refund_auto_approve_enabled?: boolean
          rentalsunited_building_id?: string | null
          rentalsunited_property_id?: string | null
          reports_client_archived_at?: string | null
          review_sentiment?: Json | null
          ru_archived?: boolean
          ru_archived_at?: string | null
          ru_hold_reason?: string | null
          ru_hold_set_at?: string | null
          ru_hold_set_by?: string | null
          ru_image_tags?: Json
          ru_listings_expected_units?: number | null
          ru_listings_unmatched?: Json
          ru_listings_verified_at?: string | null
          ru_listings_verified_owner?: string | null
          ru_listings_verified_units?: number | null
          ru_location_id?: number | null
          ru_push_enabled?: boolean
          separate_kitchen?: boolean
          short_description?: string | null
          show_on_website?: boolean | null
          siteminder_property_code?: string | null
          slug?: string | null
          timezone?: string
          toilets?: number | null
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
          available_units: number | null
          blocked_at: string | null
          blocked_by: string | null
          blocked_by_label: string | null
          blocked_reason: string | null
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
          available_units?: number | null
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_by_label?: string | null
          blocked_reason?: string | null
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
          available_units?: number | null
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_by_label?: string | null
          blocked_reason?: string | null
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
          auto_charge_failures: number
          billing_anchor_day: number | null
          billing_enabled: boolean
          billing_start_date: string | null
          billing_strategy: Database["public"]["Enums"]["billing_strategy"]
          billing_switched_off_at: string | null
          branding_addon_billing_mode: string | null
          branding_addon_enabled: boolean | null
          branding_addon_monthly_fee: number | null
          branding_addon_setup_fee: number | null
          byo_gateway_monthly_fee: number | null
          cancel_at_period_end: boolean
          cancel_effective_date: string | null
          cancelled_at: string | null
          channel_manager_enabled: boolean | null
          channel_manager_per_unit_fee: number | null
          cloudflare_custom_hostname_id: string | null
          commission_rate: number | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          custom_domain_error: string | null
          custom_overrides: Json | null
          engagement_date: string | null
          enterprise_custom_fee: number | null
          free_period_days: number | null
          gateway_billing_config_id: string | null
          gateway_fixed_fee_override: number | null
          gateway_percentage_override: number | null
          id: string
          last_auto_charge_at: string | null
          last_auto_charge_error: string | null
          last_auto_charge_status: string | null
          last_invoice_id: string | null
          linked_contract_id: string | null
          listing_commission_rate: number | null
          mandate_amount: number | null
          mandate_cancelled_at: string | null
          mandate_created_at: string | null
          mandate_requires_reauth: boolean
          mandate_status: string | null
          mandate_token: string | null
          owner_id: string | null
          payment_facilitator_enabled: boolean | null
          payment_model: string | null
          pending_effective_date: string | null
          pending_model_json: Json | null
          pending_monthly_fee: number | null
          plan_change_reason: string | null
          plan_changed_at: string | null
          pms_commission_rate: number | null
          previous_subscription_fee: number | null
          pricelabs_allowed: boolean
          pricelabs_monthly_fee: number | null
          pricelabs_setup_fee: number | null
          property_id: string
          room_count_override: number | null
          subscription_fee_monthly: number | null
          subscription_reset_pending: boolean
          subscription_started_on: string | null
          subscription_status: string
          suspended_at: string | null
          tier_pricing_json: Json | null
          tier_scope: string | null
          transaction_fee_percentage: number | null
          updated_at: string | null
          volume_tier_json: Json | null
          white_label_allowed: boolean | null
          white_label_billing_mode: string | null
          white_label_domain: string | null
          white_label_domain_last_error: string | null
          white_label_domain_status: string
          white_label_domain_verified_at: string | null
          white_label_monthly_fee: number | null
          white_label_setup_fee: number | null
          widget_flat_commission_rate: number | null
        }
        Insert: {
          auto_charge_failures?: number
          billing_anchor_day?: number | null
          billing_enabled?: boolean
          billing_start_date?: string | null
          billing_strategy?: Database["public"]["Enums"]["billing_strategy"]
          billing_switched_off_at?: string | null
          branding_addon_billing_mode?: string | null
          branding_addon_enabled?: boolean | null
          branding_addon_monthly_fee?: number | null
          branding_addon_setup_fee?: number | null
          byo_gateway_monthly_fee?: number | null
          cancel_at_period_end?: boolean
          cancel_effective_date?: string | null
          cancelled_at?: string | null
          channel_manager_enabled?: boolean | null
          channel_manager_per_unit_fee?: number | null
          cloudflare_custom_hostname_id?: string | null
          commission_rate?: number | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          custom_domain_error?: string | null
          custom_overrides?: Json | null
          engagement_date?: string | null
          enterprise_custom_fee?: number | null
          free_period_days?: number | null
          gateway_billing_config_id?: string | null
          gateway_fixed_fee_override?: number | null
          gateway_percentage_override?: number | null
          id?: string
          last_auto_charge_at?: string | null
          last_auto_charge_error?: string | null
          last_auto_charge_status?: string | null
          last_invoice_id?: string | null
          linked_contract_id?: string | null
          listing_commission_rate?: number | null
          mandate_amount?: number | null
          mandate_cancelled_at?: string | null
          mandate_created_at?: string | null
          mandate_requires_reauth?: boolean
          mandate_status?: string | null
          mandate_token?: string | null
          owner_id?: string | null
          payment_facilitator_enabled?: boolean | null
          payment_model?: string | null
          pending_effective_date?: string | null
          pending_model_json?: Json | null
          pending_monthly_fee?: number | null
          plan_change_reason?: string | null
          plan_changed_at?: string | null
          pms_commission_rate?: number | null
          previous_subscription_fee?: number | null
          pricelabs_allowed?: boolean
          pricelabs_monthly_fee?: number | null
          pricelabs_setup_fee?: number | null
          property_id: string
          room_count_override?: number | null
          subscription_fee_monthly?: number | null
          subscription_reset_pending?: boolean
          subscription_started_on?: string | null
          subscription_status?: string
          suspended_at?: string | null
          tier_pricing_json?: Json | null
          tier_scope?: string | null
          transaction_fee_percentage?: number | null
          updated_at?: string | null
          volume_tier_json?: Json | null
          white_label_allowed?: boolean | null
          white_label_billing_mode?: string | null
          white_label_domain?: string | null
          white_label_domain_last_error?: string | null
          white_label_domain_status?: string
          white_label_domain_verified_at?: string | null
          white_label_monthly_fee?: number | null
          white_label_setup_fee?: number | null
          widget_flat_commission_rate?: number | null
        }
        Update: {
          auto_charge_failures?: number
          billing_anchor_day?: number | null
          billing_enabled?: boolean
          billing_start_date?: string | null
          billing_strategy?: Database["public"]["Enums"]["billing_strategy"]
          billing_switched_off_at?: string | null
          branding_addon_billing_mode?: string | null
          branding_addon_enabled?: boolean | null
          branding_addon_monthly_fee?: number | null
          branding_addon_setup_fee?: number | null
          byo_gateway_monthly_fee?: number | null
          cancel_at_period_end?: boolean
          cancel_effective_date?: string | null
          cancelled_at?: string | null
          channel_manager_enabled?: boolean | null
          channel_manager_per_unit_fee?: number | null
          cloudflare_custom_hostname_id?: string | null
          commission_rate?: number | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          custom_domain_error?: string | null
          custom_overrides?: Json | null
          engagement_date?: string | null
          enterprise_custom_fee?: number | null
          free_period_days?: number | null
          gateway_billing_config_id?: string | null
          gateway_fixed_fee_override?: number | null
          gateway_percentage_override?: number | null
          id?: string
          last_auto_charge_at?: string | null
          last_auto_charge_error?: string | null
          last_auto_charge_status?: string | null
          last_invoice_id?: string | null
          linked_contract_id?: string | null
          listing_commission_rate?: number | null
          mandate_amount?: number | null
          mandate_cancelled_at?: string | null
          mandate_created_at?: string | null
          mandate_requires_reauth?: boolean
          mandate_status?: string | null
          mandate_token?: string | null
          owner_id?: string | null
          payment_facilitator_enabled?: boolean | null
          payment_model?: string | null
          pending_effective_date?: string | null
          pending_model_json?: Json | null
          pending_monthly_fee?: number | null
          plan_change_reason?: string | null
          plan_changed_at?: string | null
          pms_commission_rate?: number | null
          previous_subscription_fee?: number | null
          pricelabs_allowed?: boolean
          pricelabs_monthly_fee?: number | null
          pricelabs_setup_fee?: number | null
          property_id?: string
          room_count_override?: number | null
          subscription_fee_monthly?: number | null
          subscription_reset_pending?: boolean
          subscription_started_on?: string | null
          subscription_status?: string
          suspended_at?: string | null
          tier_pricing_json?: Json | null
          tier_scope?: string | null
          transaction_fee_percentage?: number | null
          updated_at?: string | null
          volume_tier_json?: Json | null
          white_label_allowed?: boolean | null
          white_label_billing_mode?: string | null
          white_label_domain?: string | null
          white_label_domain_last_error?: string | null
          white_label_domain_status?: string
          white_label_domain_verified_at?: string | null
          white_label_monthly_fee?: number | null
          white_label_setup_fee?: number | null
          widget_flat_commission_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "property_billing_configs_gateway_billing_config_id_fkey"
            columns: ["gateway_billing_config_id"]
            isOneToOne: false
            referencedRelation: "gateway_billing_configs"
            referencedColumns: ["id"]
          },
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
      property_channel_step_status: {
        Row: {
          blocker_summary: string | null
          created_at: string
          details: Json | null
          input_fingerprint: string | null
          last_checked_at: string | null
          passed_at: string | null
          property_id: string
          source: string | null
          stale_at: string | null
          status: string
          step_key: string
          updated_at: string
        }
        Insert: {
          blocker_summary?: string | null
          created_at?: string
          details?: Json | null
          input_fingerprint?: string | null
          last_checked_at?: string | null
          passed_at?: string | null
          property_id: string
          source?: string | null
          stale_at?: string | null
          status: string
          step_key: string
          updated_at?: string
        }
        Update: {
          blocker_summary?: string | null
          created_at?: string
          details?: Json | null
          input_fingerprint?: string | null
          last_checked_at?: string | null
          passed_at?: string | null
          property_id?: string
          source?: string | null
          stale_at?: string | null
          status?: string
          step_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_channel_step_status_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "property_channel_step_status_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_channel_step_status_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
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
          guests_included: number | null
          id: string
          internal_code: string | null
          is_active: boolean | null
          is_included_in_rate: boolean
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
          revenue_stream: string
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
          guests_included?: number | null
          id?: string
          internal_code?: string | null
          is_active?: boolean | null
          is_included_in_rate?: boolean
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
          revenue_stream?: string
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
          guests_included?: number | null
          id?: string
          internal_code?: string | null
          is_active?: boolean | null
          is_included_in_rate?: boolean
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
          revenue_stream?: string
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
      property_contact_details: {
        Row: {
          created_at: string
          email: string | null
          hours: string | null
          id: string
          is_public: boolean
          name: string | null
          phone: string | null
          property_id: string
          role: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          hours?: string | null
          id?: string
          is_public?: boolean
          name?: string | null
          phone?: string | null
          property_id: string
          role: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          hours?: string | null
          id?: string
          is_public?: boolean
          name?: string | null
          phone?: string | null
          property_id?: string
          role?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_contact_details_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "property_contact_details_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_contact_details_property_id_fkey"
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
      property_partner_offers: {
        Row: {
          created_at: string
          current_redemptions: number
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          max_redemptions: number | null
          min_nights: number | null
          partner_contact: string | null
          partner_name: string
          partner_url: string | null
          property_id: string
          redemption_code: string | null
          redemption_instructions: string | null
          title: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          current_redemptions?: number
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          max_redemptions?: number | null
          min_nights?: number | null
          partner_contact?: string | null
          partner_name: string
          partner_url?: string | null
          property_id: string
          redemption_code?: string | null
          redemption_instructions?: string | null
          title: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          current_redemptions?: number
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          max_redemptions?: number | null
          min_nights?: number | null
          partner_contact?: string | null
          partner_name?: string
          partner_url?: string | null
          property_id?: string
          redemption_code?: string | null
          redemption_instructions?: string | null
          title?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_partner_offers_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "property_partner_offers_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_partner_offers_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_payout_statement_lines: {
        Row: {
          booking_id: string | null
          check_in_date: string | null
          check_out_date: string | null
          commission_amount: number
          commission_rate: number
          commission_type: string | null
          created_at: string
          description: string | null
          fee_amount: number
          gross_amount: number
          guest_name: string | null
          id: string
          is_recoverable: boolean
          line_date: string | null
          line_kind: string
          metadata: Json
          net_amount: number
          payment_transaction_id: string | null
          property_id: string | null
          property_name: string | null
          rol_reference: string | null
          settlement_route: string | null
          source_id: string | null
          source_kind: string | null
          statement_id: string
        }
        Insert: {
          booking_id?: string | null
          check_in_date?: string | null
          check_out_date?: string | null
          commission_amount?: number
          commission_rate?: number
          commission_type?: string | null
          created_at?: string
          description?: string | null
          fee_amount?: number
          gross_amount?: number
          guest_name?: string | null
          id?: string
          is_recoverable?: boolean
          line_date?: string | null
          line_kind: string
          metadata?: Json
          net_amount?: number
          payment_transaction_id?: string | null
          property_id?: string | null
          property_name?: string | null
          rol_reference?: string | null
          settlement_route?: string | null
          source_id?: string | null
          source_kind?: string | null
          statement_id: string
        }
        Update: {
          booking_id?: string | null
          check_in_date?: string | null
          check_out_date?: string | null
          commission_amount?: number
          commission_rate?: number
          commission_type?: string | null
          created_at?: string
          description?: string | null
          fee_amount?: number
          gross_amount?: number
          guest_name?: string | null
          id?: string
          is_recoverable?: boolean
          line_date?: string | null
          line_kind?: string
          metadata?: Json
          net_amount?: number
          payment_transaction_id?: string | null
          property_id?: string | null
          property_name?: string | null
          rol_reference?: string | null
          settlement_route?: string | null
          source_id?: string | null
          source_kind?: string | null
          statement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_payout_statement_lines_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_payout_statement_lines_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings_decrypted"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_payout_statement_lines_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_payout_statement_lines_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "property_payout_statement_lines_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_payout_statement_lines_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_payout_statement_lines_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "property_payout_statements"
            referencedColumns: ["id"]
          },
        ]
      }
      property_payout_statement_payments: {
        Row: {
          account_number_masked: string | null
          account_type: string | null
          amount: number
          bank_name: string | null
          beneficiary_name: string | null
          branch_code: string | null
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          paid_at: string | null
          payment_reference: string
          property_id: string | null
          statement_id: string
          status: string
          updated_at: string
        }
        Insert: {
          account_number_masked?: string | null
          account_type?: string | null
          amount?: number
          bank_name?: string | null
          beneficiary_name?: string | null
          branch_code?: string | null
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          paid_at?: string | null
          payment_reference: string
          property_id?: string | null
          statement_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_number_masked?: string | null
          account_type?: string | null
          amount?: number
          bank_name?: string | null
          beneficiary_name?: string | null
          branch_code?: string | null
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          paid_at?: string | null
          payment_reference?: string
          property_id?: string | null
          statement_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_payout_statement_payments_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "property_payout_statement_payments_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_payout_statement_payments_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_payout_statement_payments_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "property_payout_statements"
            referencedColumns: ["id"]
          },
        ]
      }
      property_payout_statements: {
        Row: {
          adjustments: number
          amount_held: number
          bank_payment_reference: string | null
          booking_count: number
          byo_commission: number
          byo_gross: number
          carry_forward: number
          created_at: string
          created_by: string | null
          currency: string
          emailed_at: string | null
          finalised_at: string | null
          finalised_by: string | null
          gross_amount: number
          group_kind: string
          group_name: string
          id: string
          invoice_pdf_path: string | null
          invoice_reference: string | null
          invoice_subtotal: number
          invoice_total: number
          invoice_vat: number
          net_payable: number
          notes: string | null
          opening_balance: number
          ota_commission: number
          other_recoveries: number
          owner_email: string | null
          paid_at: string | null
          paid_by: string | null
          payment_reference: string | null
          payout_mode: string
          period_end: string
          period_start: string
          portfolio_id: string | null
          property_id: string | null
          recurring_fees: number
          rol_commission: number
          rol_gross: number
          statement_pdf_path: string | null
          statement_reference: string | null
          status: string
          transaction_fees: number
          updated_at: string
          vat_rate: number
        }
        Insert: {
          adjustments?: number
          amount_held?: number
          bank_payment_reference?: string | null
          booking_count?: number
          byo_commission?: number
          byo_gross?: number
          carry_forward?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          emailed_at?: string | null
          finalised_at?: string | null
          finalised_by?: string | null
          gross_amount?: number
          group_kind: string
          group_name: string
          id?: string
          invoice_pdf_path?: string | null
          invoice_reference?: string | null
          invoice_subtotal?: number
          invoice_total?: number
          invoice_vat?: number
          net_payable?: number
          notes?: string | null
          opening_balance?: number
          ota_commission?: number
          other_recoveries?: number
          owner_email?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_reference?: string | null
          payout_mode?: string
          period_end: string
          period_start: string
          portfolio_id?: string | null
          property_id?: string | null
          recurring_fees?: number
          rol_commission?: number
          rol_gross?: number
          statement_pdf_path?: string | null
          statement_reference?: string | null
          status?: string
          transaction_fees?: number
          updated_at?: string
          vat_rate?: number
        }
        Update: {
          adjustments?: number
          amount_held?: number
          bank_payment_reference?: string | null
          booking_count?: number
          byo_commission?: number
          byo_gross?: number
          carry_forward?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          emailed_at?: string | null
          finalised_at?: string | null
          finalised_by?: string | null
          gross_amount?: number
          group_kind?: string
          group_name?: string
          id?: string
          invoice_pdf_path?: string | null
          invoice_reference?: string | null
          invoice_subtotal?: number
          invoice_total?: number
          invoice_vat?: number
          net_payable?: number
          notes?: string | null
          opening_balance?: number
          ota_commission?: number
          other_recoveries?: number
          owner_email?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_reference?: string | null
          payout_mode?: string
          period_end?: string
          period_start?: string
          portfolio_id?: string | null
          property_id?: string | null
          recurring_fees?: number
          rol_commission?: number
          rol_gross?: number
          statement_pdf_path?: string | null
          statement_reference?: string | null
          status?: string
          transaction_fees?: number
          updated_at?: string
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "property_payout_statements_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "property_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_payout_statements_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "property_payout_statements_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_payout_statements_property_id_fkey"
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
          aggregator_activated_at: string | null
          aggregator_billing_mode: string
          aggregator_monthly_fee: number | null
          aggregator_setup_fee: number | null
          cloudflare_custom_hostname_id: string | null
          created_at: string | null
          custom_domain_error: string | null
          id: string
          metadata: Json | null
          name: string
          owner_email: string | null
          owner_id: string | null
          parent_portfolio_id: string | null
          payout_mode: string
          pricelabs_monthly_fee: number | null
          slug: string | null
          updated_at: string | null
          white_label_domain: string | null
          white_label_domain_last_error: string | null
          white_label_domain_status: string
          white_label_domain_verified_at: string | null
        }
        Insert: {
          aggregator_activated_at?: string | null
          aggregator_billing_mode?: string
          aggregator_monthly_fee?: number | null
          aggregator_setup_fee?: number | null
          cloudflare_custom_hostname_id?: string | null
          created_at?: string | null
          custom_domain_error?: string | null
          id?: string
          metadata?: Json | null
          name: string
          owner_email?: string | null
          owner_id?: string | null
          parent_portfolio_id?: string | null
          payout_mode?: string
          pricelabs_monthly_fee?: number | null
          slug?: string | null
          updated_at?: string | null
          white_label_domain?: string | null
          white_label_domain_last_error?: string | null
          white_label_domain_status?: string
          white_label_domain_verified_at?: string | null
        }
        Update: {
          aggregator_activated_at?: string | null
          aggregator_billing_mode?: string
          aggregator_monthly_fee?: number | null
          aggregator_setup_fee?: number | null
          cloudflare_custom_hostname_id?: string | null
          created_at?: string | null
          custom_domain_error?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          owner_email?: string | null
          owner_id?: string | null
          parent_portfolio_id?: string | null
          payout_mode?: string
          pricelabs_monthly_fee?: number | null
          slug?: string | null
          updated_at?: string | null
          white_label_domain?: string | null
          white_label_domain_last_error?: string | null
          white_label_domain_status?: string
          white_label_domain_verified_at?: string | null
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
          first_year_rate_override: number | null
          id: string
          lead_notes: string | null
          lead_source: Database["public"]["Enums"]["lead_source"]
          override_notes: string | null
          property_id: string
          referral_date: string
          rep_id: string
          residual_months_override: number | null
          residual_rate_override: number | null
          status: Database["public"]["Enums"]["referral_status"]
          updated_at: string
        }
        Insert: {
          clawback_until?: string | null
          converted_at?: string | null
          created_at?: string
          first_year_rate_override?: number | null
          id?: string
          lead_notes?: string | null
          lead_source?: Database["public"]["Enums"]["lead_source"]
          override_notes?: string | null
          property_id: string
          referral_date?: string
          rep_id: string
          residual_months_override?: number | null
          residual_rate_override?: number | null
          status?: Database["public"]["Enums"]["referral_status"]
          updated_at?: string
        }
        Update: {
          clawback_until?: string | null
          converted_at?: string | null
          created_at?: string
          first_year_rate_override?: number | null
          id?: string
          lead_notes?: string | null
          lead_source?: Database["public"]["Enums"]["lead_source"]
          override_notes?: string | null
          property_id?: string
          referral_date?: string
          rep_id?: string
          residual_months_override?: number | null
          residual_rate_override?: number | null
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
      property_report_settings: {
        Row: {
          brand_primary: string | null
          brand_secondary: string | null
          brand_source: string
          cover_artwork_url: string | null
          created_at: string
          default_source_type: string
          historical_baseline: Json
          nightsbridge_column_map: Json | null
          property_id: string
          report_logo_url: string | null
          room_count: number
          special_report_set: string | null
          updated_at: string
        }
        Insert: {
          brand_primary?: string | null
          brand_secondary?: string | null
          brand_source?: string
          cover_artwork_url?: string | null
          created_at?: string
          default_source_type?: string
          historical_baseline?: Json
          nightsbridge_column_map?: Json | null
          property_id: string
          report_logo_url?: string | null
          room_count?: number
          special_report_set?: string | null
          updated_at?: string
        }
        Update: {
          brand_primary?: string | null
          brand_secondary?: string | null
          brand_source?: string
          cover_artwork_url?: string | null
          created_at?: string
          default_source_type?: string
          historical_baseline?: Json
          nightsbridge_column_map?: Json | null
          property_id?: string
          report_logo_url?: string | null
          room_count?: number
          special_report_set?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_report_settings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "property_report_settings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_report_settings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "public_properties"
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
          applicable_rate_plan_ids: string[] | null
          applicable_room_ids: string[] | null
          audience: string
          book_from: string | null
          book_until: string | null
          cancellation_policy_id: string | null
          category: string
          created_at: string | null
          created_by: string | null
          currency: string | null
          deal_type: string
          description: string | null
          discount_percent: number | null
          dow_mask: string[] | null
          fixed_amount: number | null
          fixed_price: number | null
          id: string
          images: Json | null
          included_items: Json | null
          is_active: boolean | null
          is_public: boolean | null
          is_stackable: boolean
          lead_days_max: number | null
          lead_days_min: number | null
          lead_hours_max: number | null
          max_age: number | null
          max_stay: number | null
          min_age: number | null
          min_stay: number | null
          name: string
          price_pointing: string | null
          priority: number
          property_id: string
          rounding_mode: string | null
          sort_order: number | null
          special_type: string
          stay_date_ranges: Json
          terms: string | null
          updated_at: string | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          age_label?: string | null
          age_restricted?: boolean | null
          applicable_rate_plan_ids?: string[] | null
          applicable_room_ids?: string[] | null
          audience?: string
          book_from?: string | null
          book_until?: string | null
          cancellation_policy_id?: string | null
          category?: string
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          deal_type?: string
          description?: string | null
          discount_percent?: number | null
          dow_mask?: string[] | null
          fixed_amount?: number | null
          fixed_price?: number | null
          id?: string
          images?: Json | null
          included_items?: Json | null
          is_active?: boolean | null
          is_public?: boolean | null
          is_stackable?: boolean
          lead_days_max?: number | null
          lead_days_min?: number | null
          lead_hours_max?: number | null
          max_age?: number | null
          max_stay?: number | null
          min_age?: number | null
          min_stay?: number | null
          name: string
          price_pointing?: string | null
          priority?: number
          property_id: string
          rounding_mode?: string | null
          sort_order?: number | null
          special_type?: string
          stay_date_ranges?: Json
          terms?: string | null
          updated_at?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          age_label?: string | null
          age_restricted?: boolean | null
          applicable_rate_plan_ids?: string[] | null
          applicable_room_ids?: string[] | null
          audience?: string
          book_from?: string | null
          book_until?: string | null
          cancellation_policy_id?: string | null
          category?: string
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          deal_type?: string
          description?: string | null
          discount_percent?: number | null
          dow_mask?: string[] | null
          fixed_amount?: number | null
          fixed_price?: number | null
          id?: string
          images?: Json | null
          included_items?: Json | null
          is_active?: boolean | null
          is_public?: boolean | null
          is_stackable?: boolean
          lead_days_max?: number | null
          lead_days_min?: number | null
          lead_hours_max?: number | null
          max_age?: number | null
          max_stay?: number | null
          min_age?: number | null
          min_stay?: number | null
          name?: string
          price_pointing?: string | null
          priority?: number
          property_id?: string
          rounding_mode?: string | null
          sort_order?: number | null
          special_type?: string
          stay_date_ranges?: Json
          terms?: string | null
          updated_at?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_specials_cancellation_policy_id_fkey"
            columns: ["cancellation_policy_id"]
            isOneToOne: false
            referencedRelation: "rolos_reservation_policies"
            referencedColumns: ["id"]
          },
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
          description: string | null
          id: string
          line_kind: string
          notes: string | null
          period_end: string
          period_start: string
          property_id: string | null
          rate_applied: number
          rate_source: string | null
          referral_id: string | null
          referral_started_on: string | null
          rep_id: string
          report_id: string | null
          revenue_breakdown: Json
          status: Database["public"]["Enums"]["commission_entry_status"]
          updated_at: string
        }
        Insert: {
          amount?: number
          base_revenue?: number
          clawback_reason?: string | null
          commission_type: string
          created_at?: string
          description?: string | null
          id?: string
          line_kind?: string
          notes?: string | null
          period_end: string
          period_start: string
          property_id?: string | null
          rate_applied: number
          rate_source?: string | null
          referral_id?: string | null
          referral_started_on?: string | null
          rep_id: string
          report_id?: string | null
          revenue_breakdown?: Json
          status?: Database["public"]["Enums"]["commission_entry_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          base_revenue?: number
          clawback_reason?: string | null
          commission_type?: string
          created_at?: string
          description?: string | null
          id?: string
          line_kind?: string
          notes?: string | null
          period_end?: string
          period_start?: string
          property_id?: string | null
          rate_applied?: number
          rate_source?: string | null
          referral_id?: string | null
          referral_started_on?: string | null
          rep_id?: string
          report_id?: string | null
          revenue_breakdown?: Json
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
          {
            foreignKeyName: "rep_commission_entries_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "rep_commission_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      rep_commission_reports: {
        Row: {
          adjustments_total: number
          approved_at: string | null
          approved_by: string | null
          bank_snapshot: Json
          emailed_at: string | null
          emailed_to: string | null
          finalized_at: string | null
          finalized_by: string | null
          generated_at: string
          gross_commission: number
          id: string
          net_payable: number
          notes: string | null
          paid_at: string | null
          paid_reference: string | null
          period_end: string | null
          period_month: string
          period_start: string | null
          property_count: number
          rep_id: string
          statement_reference: string | null
          status: Database["public"]["Enums"]["commission_report_status"]
          tax_snapshot: Json
          terms_snapshot: Json
          total_amount: number
          total_entries: number
          total_revenue: number
          vat_amount: number
          void_reason: string | null
        }
        Insert: {
          adjustments_total?: number
          approved_at?: string | null
          approved_by?: string | null
          bank_snapshot?: Json
          emailed_at?: string | null
          emailed_to?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          generated_at?: string
          gross_commission?: number
          id?: string
          net_payable?: number
          notes?: string | null
          paid_at?: string | null
          paid_reference?: string | null
          period_end?: string | null
          period_month: string
          period_start?: string | null
          property_count?: number
          rep_id: string
          statement_reference?: string | null
          status?: Database["public"]["Enums"]["commission_report_status"]
          tax_snapshot?: Json
          terms_snapshot?: Json
          total_amount?: number
          total_entries?: number
          total_revenue?: number
          vat_amount?: number
          void_reason?: string | null
        }
        Update: {
          adjustments_total?: number
          approved_at?: string | null
          approved_by?: string | null
          bank_snapshot?: Json
          emailed_at?: string | null
          emailed_to?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          generated_at?: string
          gross_commission?: number
          id?: string
          net_payable?: number
          notes?: string | null
          paid_at?: string | null
          paid_reference?: string | null
          period_end?: string | null
          period_month?: string
          period_start?: string | null
          property_count?: number
          rep_id?: string
          statement_reference?: string | null
          status?: Database["public"]["Enums"]["commission_report_status"]
          tax_snapshot?: Json
          terms_snapshot?: Json
          total_amount?: number
          total_entries?: number
          total_revenue?: number
          vat_amount?: number
          void_reason?: string | null
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
      rep_contracts: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          rep_id: string
          sent_at: string | null
          signature_data: Json | null
          signed_at: string | null
          signed_html: string | null
          signed_pdf_url: string | null
          signer_email: string | null
          signer_name: string | null
          signing_token: string
          status: string
          template_version_id: string | null
          terms_snapshot: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          rep_id: string
          sent_at?: string | null
          signature_data?: Json | null
          signed_at?: string | null
          signed_html?: string | null
          signed_pdf_url?: string | null
          signer_email?: string | null
          signer_name?: string | null
          signing_token?: string
          status?: string
          template_version_id?: string | null
          terms_snapshot?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          rep_id?: string
          sent_at?: string | null
          signature_data?: Json | null
          signed_at?: string | null
          signed_html?: string | null
          signed_pdf_url?: string | null
          signer_email?: string | null
          signer_name?: string | null
          signing_token?: string
          status?: string
          template_version_id?: string | null
          terms_snapshot?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rep_contracts_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "sales_reps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_contracts_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "contract_template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      report_additional_inputs: {
        Row: {
          comp_rns_by_month: Json
          created_at: string
          dinner_by_month: Json
          free_commentary: string | null
          min_stay_notes: string | null
          promotions_notes: string | null
          rate_override_notes: string | null
          room0_by_month: Json
          run_id: string
          updated_at: string
        }
        Insert: {
          comp_rns_by_month?: Json
          created_at?: string
          dinner_by_month?: Json
          free_commentary?: string | null
          min_stay_notes?: string | null
          promotions_notes?: string | null
          rate_override_notes?: string | null
          room0_by_month?: Json
          run_id: string
          updated_at?: string
        }
        Update: {
          comp_rns_by_month?: Json
          created_at?: string
          dinner_by_month?: Json
          free_commentary?: string | null
          min_stay_notes?: string | null
          promotions_notes?: string | null
          rate_override_notes?: string | null
          room0_by_month?: Json
          run_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_additional_inputs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: true
            referencedRelation: "report_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      report_insights: {
        Row: {
          chart_recommendation: string | null
          created_at: string
          experimental: Json
          experimental_error: string | null
          experimental_generated_at: string | null
          experimental_provider: string | null
          flags: Json
          generated_at: string | null
          generated_by: string | null
          include_narrative: boolean
          narrative: string | null
          narrative_final: string | null
          provider: string | null
          run_id: string
          selections: Json
          slides_considered: Json
          suggestions: Json
          updated_at: string
        }
        Insert: {
          chart_recommendation?: string | null
          created_at?: string
          experimental?: Json
          experimental_error?: string | null
          experimental_generated_at?: string | null
          experimental_provider?: string | null
          flags?: Json
          generated_at?: string | null
          generated_by?: string | null
          include_narrative?: boolean
          narrative?: string | null
          narrative_final?: string | null
          provider?: string | null
          run_id: string
          selections?: Json
          slides_considered?: Json
          suggestions?: Json
          updated_at?: string
        }
        Update: {
          chart_recommendation?: string | null
          created_at?: string
          experimental?: Json
          experimental_error?: string | null
          experimental_generated_at?: string | null
          experimental_provider?: string | null
          flags?: Json
          generated_at?: string | null
          generated_by?: string | null
          include_narrative?: boolean
          narrative?: string | null
          narrative_final?: string | null
          provider?: string | null
          run_id?: string
          selections?: Json
          slides_considered?: Json
          suggestions?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_insights_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: true
            referencedRelation: "report_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      report_media: {
        Row: {
          byte_size: number | null
          caption: string | null
          content_type: string | null
          created_at: string
          created_by: string | null
          id: string
          run_id: string
          section_title: string | null
          slot_key: string
          sort_order: number
          storage_path: string
          updated_at: string
        }
        Insert: {
          byte_size?: number | null
          caption?: string | null
          content_type?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          run_id: string
          section_title?: string | null
          slot_key: string
          sort_order?: number
          storage_path: string
          updated_at?: string
        }
        Update: {
          byte_size?: number | null
          caption?: string | null
          content_type?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          run_id?: string
          section_title?: string | null
          slot_key?: string
          sort_order?: number
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_media_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "report_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      report_media_slots: {
        Row: {
          created_at: string
          created_by: string | null
          hint: string | null
          id: string
          layout: string
          run_id: string
          section: string
          slot_key: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          hint?: string | null
          id?: string
          layout?: string
          run_id: string
          section?: string
          slot_key: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          hint?: string | null
          id?: string
          layout?: string
          run_id?: string
          section?: string
          slot_key?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_media_slots_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "report_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      report_run_events: {
        Row: {
          actor_id: string | null
          created_at: string
          detail: Json
          event_type: string
          id: string
          message: string | null
          run_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          detail?: Json
          event_type: string
          id?: string
          message?: string | null
          run_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          detail?: Json
          event_type?: string
          id?: string
          message?: string | null
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_run_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "report_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      report_runs: {
        Row: {
          as_of_date: string
          baseline_locked: boolean
          baseline_source: string
          build_stage: string
          cadence: string
          created_at: string
          created_by: string | null
          draft_generated_at: string | null
          draft_report_path: string | null
          error_message: string | null
          excel_generated_at: string | null
          excel_path: string | null
          id: string
          imported_baseline: Json | null
          page_order: Json | null
          previous_run_id: string | null
          prior_report_declined: boolean
          processing_note: string | null
          property_id: string
          report_month: string | null
          source_type: string
          special_report_set: string | null
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          as_of_date: string
          baseline_locked?: boolean
          baseline_source?: string
          build_stage?: string
          cadence?: string
          created_at?: string
          created_by?: string | null
          draft_generated_at?: string | null
          draft_report_path?: string | null
          error_message?: string | null
          excel_generated_at?: string | null
          excel_path?: string | null
          id?: string
          imported_baseline?: Json | null
          page_order?: Json | null
          previous_run_id?: string | null
          prior_report_declined?: boolean
          processing_note?: string | null
          property_id: string
          report_month?: string | null
          source_type?: string
          special_report_set?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          as_of_date?: string
          baseline_locked?: boolean
          baseline_source?: string
          build_stage?: string
          cadence?: string
          created_at?: string
          created_by?: string | null
          draft_generated_at?: string | null
          draft_report_path?: string | null
          error_message?: string | null
          excel_generated_at?: string | null
          excel_path?: string | null
          id?: string
          imported_baseline?: Json | null
          page_order?: Json | null
          previous_run_id?: string | null
          prior_report_declined?: boolean
          processing_note?: string | null
          property_id?: string
          report_month?: string | null
          source_type?: string
          special_report_set?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_runs_previous_run_id_fkey"
            columns: ["previous_run_id"]
            isOneToOne: false
            referencedRelation: "report_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_runs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "report_runs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_runs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      report_snapshots: {
        Row: {
          additional_revenue: Json
          adr: Json
          capacity_days: Json
          created_at: string
          last_year_actual: Json
          last_year_room_nights: Json
          months: Json
          non_sellable: Json
          occupancy: Json
          otb_revenue: Json
          previous_otb_revenue: Json
          previous_room_nights: Json
          room_count: number | null
          room_nights: Json
          run_id: string
          source_breakdown: Json
          totals: Json
          updated_at: string
        }
        Insert: {
          additional_revenue?: Json
          adr?: Json
          capacity_days?: Json
          created_at?: string
          last_year_actual?: Json
          last_year_room_nights?: Json
          months?: Json
          non_sellable?: Json
          occupancy?: Json
          otb_revenue?: Json
          previous_otb_revenue?: Json
          previous_room_nights?: Json
          room_count?: number | null
          room_nights?: Json
          run_id: string
          source_breakdown?: Json
          totals?: Json
          updated_at?: string
        }
        Update: {
          additional_revenue?: Json
          adr?: Json
          capacity_days?: Json
          created_at?: string
          last_year_actual?: Json
          last_year_room_nights?: Json
          months?: Json
          non_sellable?: Json
          occupancy?: Json
          otb_revenue?: Json
          previous_otb_revenue?: Json
          previous_room_nights?: Json
          room_count?: number | null
          room_nights?: Json
          run_id?: string
          source_breakdown?: Json
          totals?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_snapshots_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: true
            referencedRelation: "report_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      report_source_files: {
        Row: {
          applied_mapping: Json | null
          byte_size: number | null
          created_at: string
          detected_mapping: Json | null
          file_hash: string | null
          file_role: string
          id: string
          original_filename: string
          parse_errors: Json | null
          parse_note: string | null
          parse_status: string
          parsed_ok: boolean | null
          row_count: number | null
          run_id: string
          sheet_used: string | null
          storage_path: string
          updated_at: string
        }
        Insert: {
          applied_mapping?: Json | null
          byte_size?: number | null
          created_at?: string
          detected_mapping?: Json | null
          file_hash?: string | null
          file_role?: string
          id?: string
          original_filename: string
          parse_errors?: Json | null
          parse_note?: string | null
          parse_status?: string
          parsed_ok?: boolean | null
          row_count?: number | null
          run_id: string
          sheet_used?: string | null
          storage_path: string
          updated_at?: string
        }
        Update: {
          applied_mapping?: Json | null
          byte_size?: number | null
          created_at?: string
          detected_mapping?: Json | null
          file_hash?: string | null
          file_role?: string
          id?: string
          original_filename?: string
          parse_errors?: Json | null
          parse_note?: string | null
          parse_status?: string
          parsed_ok?: boolean | null
          row_count?: number | null
          run_id?: string
          sheet_used?: string | null
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_source_files_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "report_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      report_special_reports: {
        Row: {
          created_at: string
          generated_at: string
          id: string
          payload: Json
          report_key: string
          run_id: string
          storage_path: string | null
          title: string
          updated_at: string
          warnings: Json
        }
        Insert: {
          created_at?: string
          generated_at?: string
          id?: string
          payload?: Json
          report_key: string
          run_id: string
          storage_path?: string | null
          title: string
          updated_at?: string
          warnings?: Json
        }
        Update: {
          created_at?: string
          generated_at?: string
          id?: string
          payload?: Json
          report_key?: string
          run_id?: string
          storage_path?: string | null
          title?: string
          updated_at?: string
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "report_special_reports_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "report_runs"
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
      rol_contributions: {
        Row: {
          amount: number
          amount_zar: number
          contribution_date: string
          contributor_key: string
          contributor_name: string
          created_at: string
          created_by: string | null
          document_name: string | null
          document_path: string | null
          document_size: number | null
          document_type: string | null
          id: string
          method: string | null
          notes: string | null
          reference: string | null
          source_currency: string
          updated_at: string
        }
        Insert: {
          amount: number
          amount_zar: number
          contribution_date?: string
          contributor_key: string
          contributor_name: string
          created_at?: string
          created_by?: string | null
          document_name?: string | null
          document_path?: string | null
          document_size?: number | null
          document_type?: string | null
          id?: string
          method?: string | null
          notes?: string | null
          reference?: string | null
          source_currency?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          amount_zar?: number
          contribution_date?: string
          contributor_key?: string
          contributor_name?: string
          created_at?: string
          created_by?: string | null
          document_name?: string | null
          document_path?: string | null
          document_size?: number | null
          document_type?: string | null
          id?: string
          method?: string | null
          notes?: string | null
          reference?: string | null
          source_currency?: string
          updated_at?: string
        }
        Relationships: []
      }
      rol_cost_share_config: {
        Row: {
          commissioned_at: string | null
          commissioning_complete: boolean
          created_at: string
          id: string
          partner_pct: number
          roomsonline_pct: number
          singleton: boolean
          split_active: boolean
          statement_fx_usd_zar: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          commissioned_at?: string | null
          commissioning_complete?: boolean
          created_at?: string
          id?: string
          partner_pct?: number
          roomsonline_pct?: number
          singleton?: boolean
          split_active?: boolean
          statement_fx_usd_zar?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          commissioned_at?: string | null
          commissioning_complete?: boolean
          created_at?: string
          id?: string
          partner_pct?: number
          roomsonline_pct?: number
          singleton?: boolean
          split_active?: boolean
          statement_fx_usd_zar?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      rol_document_counters: {
        Row: {
          created_at: string
          last_value: number
          scope_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          last_value?: number
          scope_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          last_value?: number
          scope_key?: string
          updated_at?: string
        }
        Relationships: []
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
      rol_property_invoice_lines: {
        Row: {
          amount: number
          booking_id: string | null
          check_in_date: string | null
          check_out_date: string | null
          commission_type: string | null
          created_at: string
          description: string | null
          gross_amount: number
          guest_name: string | null
          id: string
          invoice_id: string
          is_waived: boolean
          line_date: string | null
          line_kind: string
          property_id: string | null
          property_name: string | null
          quantity: number
          rate: number
          rol_reference: string | null
          settlement_route: string | null
          source_id: string | null
          source_kind: string | null
        }
        Insert: {
          amount?: number
          booking_id?: string | null
          check_in_date?: string | null
          check_out_date?: string | null
          commission_type?: string | null
          created_at?: string
          description?: string | null
          gross_amount?: number
          guest_name?: string | null
          id?: string
          invoice_id: string
          is_waived?: boolean
          line_date?: string | null
          line_kind?: string
          property_id?: string | null
          property_name?: string | null
          quantity?: number
          rate?: number
          rol_reference?: string | null
          settlement_route?: string | null
          source_id?: string | null
          source_kind?: string | null
        }
        Update: {
          amount?: number
          booking_id?: string | null
          check_in_date?: string | null
          check_out_date?: string | null
          commission_type?: string | null
          created_at?: string
          description?: string | null
          gross_amount?: number
          guest_name?: string | null
          id?: string
          invoice_id?: string
          is_waived?: boolean
          line_date?: string | null
          line_kind?: string
          property_id?: string | null
          property_name?: string | null
          quantity?: number
          rate?: number
          rol_reference?: string | null
          settlement_route?: string | null
          source_id?: string | null
          source_kind?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rol_property_invoice_lines_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rol_property_invoice_lines_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings_decrypted"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rol_property_invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "rol_property_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rol_property_invoice_lines_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rol_property_invoice_lines_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rol_property_invoice_lines_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      rol_property_invoices: {
        Row: {
          adjustment_total: number
          amount_paid: number
          bill_to_address: string | null
          bill_to_email: string | null
          bill_to_name: string | null
          booking_count: number
          charge_total: number
          commission_total: number
          created_at: string
          created_by: string | null
          currency: string
          due_date: string | null
          emailed_at: string | null
          group_code: string | null
          group_kind: string
          group_name: string
          id: string
          invoice_reference: string | null
          issued_at: string | null
          issued_by: string | null
          notes: string | null
          paid_at: string | null
          paid_by: string | null
          pay_token: string | null
          payment_reference: string | null
          payment_transaction_id: string | null
          pdf_path: string | null
          period_end: string
          period_start: string
          portfolio_id: string | null
          property_id: string | null
          recurring_total: number
          status: string
          subtotal: number
          total: number
          updated_at: string
          vat_amount: number
          vat_rate: number
          vat_snapshot: Json
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          adjustment_total?: number
          amount_paid?: number
          bill_to_address?: string | null
          bill_to_email?: string | null
          bill_to_name?: string | null
          booking_count?: number
          charge_total?: number
          commission_total?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string | null
          emailed_at?: string | null
          group_code?: string | null
          group_kind?: string
          group_name: string
          id?: string
          invoice_reference?: string | null
          issued_at?: string | null
          issued_by?: string | null
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          pay_token?: string | null
          payment_reference?: string | null
          payment_transaction_id?: string | null
          pdf_path?: string | null
          period_end: string
          period_start: string
          portfolio_id?: string | null
          property_id?: string | null
          recurring_total?: number
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
          vat_snapshot?: Json
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          adjustment_total?: number
          amount_paid?: number
          bill_to_address?: string | null
          bill_to_email?: string | null
          bill_to_name?: string | null
          booking_count?: number
          charge_total?: number
          commission_total?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string | null
          emailed_at?: string | null
          group_code?: string | null
          group_kind?: string
          group_name?: string
          id?: string
          invoice_reference?: string | null
          issued_at?: string | null
          issued_by?: string | null
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          pay_token?: string | null
          payment_reference?: string | null
          payment_transaction_id?: string | null
          pdf_path?: string | null
          period_end?: string
          period_start?: string
          portfolio_id?: string | null
          property_id?: string | null
          recurring_total?: number
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
          vat_snapshot?: Json
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rol_property_invoices_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "property_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rol_property_invoices_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rol_property_invoices_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rol_property_invoices_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
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
          revenue_stream: string
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
          revenue_stream?: string
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
          revenue_stream?: string
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
      rolos_booking_room_nights: {
        Row: {
          booking_id: string
          booking_room_id: string
          created_at: string
          id: string
          is_override: boolean
          property_id: string
          rate: number
          rate_plan_id: string | null
          stay_date: string
          updated_at: string
        }
        Insert: {
          booking_id: string
          booking_room_id: string
          created_at?: string
          id?: string
          is_override?: boolean
          property_id: string
          rate?: number
          rate_plan_id?: string | null
          stay_date: string
          updated_at?: string
        }
        Update: {
          booking_id?: string
          booking_room_id?: string
          created_at?: string
          id?: string
          is_override?: boolean
          property_id?: string
          rate?: number
          rate_plan_id?: string | null
          stay_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_booking_room_nights_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_booking_room_nights_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings_decrypted"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_booking_room_nights_booking_room_id_fkey"
            columns: ["booking_room_id"]
            isOneToOne: false
            referencedRelation: "rolos_booking_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_booking_room_nights_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_booking_room_nights_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_booking_room_nights_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_booking_room_nights_rate_plan_id_fkey"
            columns: ["rate_plan_id"]
            isOneToOne: false
            referencedRelation: "rolos_rate_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_booking_rooms: {
        Row: {
          adults: number
          booking_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          children: number | null
          created_at: string | null
          guest_comments: string | null
          id: string
          infants: number
          nightly_rate: number | null
          package_id: string | null
          pets: number
          rate_charged: number
          rate_plan_id: string | null
          room_id: string | null
          room_type_id: string | null
          second_guest_name: string | null
          status: string
          teens: number
        }
        Insert: {
          adults?: number
          booking_id: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          children?: number | null
          created_at?: string | null
          guest_comments?: string | null
          id?: string
          infants?: number
          nightly_rate?: number | null
          package_id?: string | null
          pets?: number
          rate_charged: number
          rate_plan_id?: string | null
          room_id?: string | null
          room_type_id?: string | null
          second_guest_name?: string | null
          status?: string
          teens?: number
        }
        Update: {
          adults?: number
          booking_id?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          children?: number | null
          created_at?: string | null
          guest_comments?: string | null
          id?: string
          infants?: number
          nightly_rate?: number | null
          package_id?: string | null
          pets?: number
          rate_charged?: number
          rate_plan_id?: string | null
          room_id?: string | null
          room_type_id?: string | null
          second_guest_name?: string | null
          status?: string
          teens?: number
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
            foreignKeyName: "rolos_booking_rooms_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "rolos_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_booking_rooms_rate_plan_id_fkey"
            columns: ["rate_plan_id"]
            isOneToOne: false
            referencedRelation: "rolos_rate_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_booking_rooms_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rolos_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_booking_rooms_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "rolos_room_types"
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
      rolos_feedback_requests: {
        Row: {
          assigned_to: string | null
          booking_id: string
          comment: string | null
          created_at: string
          email_error: string | null
          email_sent_at: string | null
          guest_email: string | null
          guest_name: string | null
          guest_profile_id: string | null
          hubspot_synced_at: string | null
          id: string
          property_id: string | null
          rating: number | null
          resolved_at: string | null
          responded_at: string | null
          status: string
          token: string
          updated_at: string
          would_recommend: boolean | null
        }
        Insert: {
          assigned_to?: string | null
          booking_id: string
          comment?: string | null
          created_at?: string
          email_error?: string | null
          email_sent_at?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guest_profile_id?: string | null
          hubspot_synced_at?: string | null
          id?: string
          property_id?: string | null
          rating?: number | null
          resolved_at?: string | null
          responded_at?: string | null
          status?: string
          token: string
          updated_at?: string
          would_recommend?: boolean | null
        }
        Update: {
          assigned_to?: string | null
          booking_id?: string
          comment?: string | null
          created_at?: string
          email_error?: string | null
          email_sent_at?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guest_profile_id?: string | null
          hubspot_synced_at?: string | null
          id?: string
          property_id?: string | null
          rating?: number | null
          resolved_at?: string | null
          responded_at?: string | null
          status?: string
          token?: string
          updated_at?: string
          would_recommend?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "rolos_feedback_requests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_feedback_requests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings_decrypted"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_feedback_requests_guest_profile_id_fkey"
            columns: ["guest_profile_id"]
            isOneToOne: false
            referencedRelation: "rolos_guest_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_feedback_requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_feedback_requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_feedback_requests_property_id_fkey"
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
          revenue_stream: string
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
          revenue_stream?: string
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
          revenue_stream?: string
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
          booking_id: string | null
          closed_at: string | null
          created_at: string | null
          currency: string | null
          group_id: string | null
          guest_name: string | null
          id: string
          property_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          balance?: number | null
          booking_id?: string | null
          closed_at?: string | null
          created_at?: string | null
          currency?: string | null
          group_id?: string | null
          guest_name?: string | null
          id?: string
          property_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          balance?: number | null
          booking_id?: string | null
          closed_at?: string | null
          created_at?: string | null
          currency?: string | null
          group_id?: string | null
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
            foreignKeyName: "rolos_folios_group_fk"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "rolos_groups"
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
          adults: number
          arrival_date: string | null
          block_id: string | null
          booking_id: string | null
          children: number
          created_at: string
          departure_date: string | null
          group_id: string
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          package_id: string | null
          reservation_id: string | null
          room_id: string | null
          room_preference: string | null
          room_type_id: string | null
          special_requests: string | null
          status: string
          updated_at: string
        }
        Insert: {
          adults?: number
          arrival_date?: string | null
          block_id?: string | null
          booking_id?: string | null
          children?: number
          created_at?: string
          departure_date?: string | null
          group_id: string
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          package_id?: string | null
          reservation_id?: string | null
          room_id?: string | null
          room_preference?: string | null
          room_type_id?: string | null
          special_requests?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          adults?: number
          arrival_date?: string | null
          block_id?: string | null
          booking_id?: string | null
          children?: number
          created_at?: string
          departure_date?: string | null
          group_id?: string
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          package_id?: string | null
          reservation_id?: string | null
          room_id?: string | null
          room_preference?: string | null
          room_type_id?: string | null
          special_requests?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_group_reservations_block_fk"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "rolos_group_room_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_group_reservations_booking_fk"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_group_reservations_booking_fk"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings_decrypted"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "rolos_group_reservations_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "rolos_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_group_reservations_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "rolos_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_group_reservations_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rolos_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_group_reservations_room_type_fk"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "rolos_room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_group_room_blocks: {
        Row: {
          attrition_charged: boolean
          blocked_count: number
          created_at: string
          end_date: string
          group_id: string
          id: string
          package_id: string | null
          picked_up_count: number
          property_id: string | null
          rate_override: number | null
          release_date: string | null
          released_at: string | null
          room_type_id: string
          start_date: string
          status: string
        }
        Insert: {
          attrition_charged?: boolean
          blocked_count?: number
          created_at?: string
          end_date: string
          group_id: string
          id?: string
          package_id?: string | null
          picked_up_count?: number
          property_id?: string | null
          rate_override?: number | null
          release_date?: string | null
          released_at?: string | null
          room_type_id: string
          start_date: string
          status?: string
        }
        Update: {
          attrition_charged?: boolean
          blocked_count?: number
          created_at?: string
          end_date?: string
          group_id?: string
          id?: string
          package_id?: string | null
          picked_up_count?: number
          property_id?: string | null
          rate_override?: number | null
          release_date?: string | null
          released_at?: string | null
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
            foreignKeyName: "rolos_group_room_blocks_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "rolos_packages"
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
          billing_mode: string
          check_in_date: string | null
          check_out_date: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contract_ref: string | null
          created_at: string
          created_by: string | null
          cutoff_date: string | null
          deposit_amount: number | null
          group_type: string
          id: string
          master_folio_id: string | null
          name: string
          notes: string | null
          notes_json: Json
          portal_enabled: boolean
          portal_expires_at: string | null
          portal_token: string | null
          property_id: string
          release_date: string | null
          status: Database["public"]["Enums"]["group_booking_status"]
          total_rooms: number
          updated_at: string
        }
        Insert: {
          attrition_rate?: number | null
          billing_mode?: string
          check_in_date?: string | null
          check_out_date?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contract_ref?: string | null
          created_at?: string
          created_by?: string | null
          cutoff_date?: string | null
          deposit_amount?: number | null
          group_type?: string
          id?: string
          master_folio_id?: string | null
          name: string
          notes?: string | null
          notes_json?: Json
          portal_enabled?: boolean
          portal_expires_at?: string | null
          portal_token?: string | null
          property_id: string
          release_date?: string | null
          status?: Database["public"]["Enums"]["group_booking_status"]
          total_rooms?: number
          updated_at?: string
        }
        Update: {
          attrition_rate?: number | null
          billing_mode?: string
          check_in_date?: string | null
          check_out_date?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contract_ref?: string | null
          created_at?: string
          created_by?: string | null
          cutoff_date?: string | null
          deposit_amount?: number | null
          group_type?: string
          id?: string
          master_folio_id?: string | null
          name?: string
          notes?: string | null
          notes_json?: Json
          portal_enabled?: boolean
          portal_expires_at?: string | null
          portal_token?: string | null
          property_id?: string
          release_date?: string | null
          status?: Database["public"]["Enums"]["group_booking_status"]
          total_rooms?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_groups_master_folio_fk"
            columns: ["master_folio_id"]
            isOneToOne: false
            referencedRelation: "rolos_folios"
            referencedColumns: ["id"]
          },
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
      rolos_guest_checkins: {
        Row: {
          accessibility_needs: string | null
          address: string | null
          arrival_time: string | null
          booking_id: string
          completed_at: string | null
          created_at: string
          date_of_birth_encrypted: string | null
          dietary_requirements: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          full_name: string | null
          guest_profile_id: string | null
          hubspot_synced_at: string | null
          id: string
          identity_number_encrypted: string | null
          marketing_consent: boolean
          nationality: string | null
          phone: string | null
          preferences: string | null
          property_id: string | null
          special_occasion: string | null
          submitted_by: string
          submitted_by_user_id: string | null
          token: string | null
          token_expires_at: string | null
          travelling_party: Json
          updated_at: string
          vehicle_registration: string | null
        }
        Insert: {
          accessibility_needs?: string | null
          address?: string | null
          arrival_time?: string | null
          booking_id: string
          completed_at?: string | null
          created_at?: string
          date_of_birth_encrypted?: string | null
          dietary_requirements?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string | null
          guest_profile_id?: string | null
          hubspot_synced_at?: string | null
          id?: string
          identity_number_encrypted?: string | null
          marketing_consent?: boolean
          nationality?: string | null
          phone?: string | null
          preferences?: string | null
          property_id?: string | null
          special_occasion?: string | null
          submitted_by?: string
          submitted_by_user_id?: string | null
          token?: string | null
          token_expires_at?: string | null
          travelling_party?: Json
          updated_at?: string
          vehicle_registration?: string | null
        }
        Update: {
          accessibility_needs?: string | null
          address?: string | null
          arrival_time?: string | null
          booking_id?: string
          completed_at?: string | null
          created_at?: string
          date_of_birth_encrypted?: string | null
          dietary_requirements?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string | null
          guest_profile_id?: string | null
          hubspot_synced_at?: string | null
          id?: string
          identity_number_encrypted?: string | null
          marketing_consent?: boolean
          nationality?: string | null
          phone?: string | null
          preferences?: string | null
          property_id?: string | null
          special_occasion?: string | null
          submitted_by?: string
          submitted_by_user_id?: string | null
          token?: string | null
          token_expires_at?: string | null
          travelling_party?: Json
          updated_at?: string
          vehicle_registration?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rolos_guest_checkins_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_guest_checkins_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings_decrypted"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_guest_checkins_guest_profile_id_fkey"
            columns: ["guest_profile_id"]
            isOneToOne: false
            referencedRelation: "rolos_guest_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_guest_checkins_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_guest_checkins_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_guest_checkins_property_id_fkey"
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
          cancelled_stays: number
          communication_preferences: Json | null
          complaints: Json | null
          created_at: string | null
          date_of_birth: string | null
          email: string | null
          full_name: string
          id: string
          is_archived: boolean
          is_blacklisted: boolean | null
          is_trade: boolean
          last_stay_date: string | null
          nationality: string | null
          normalised_name: string | null
          notes: string | null
          phone: string | null
          preferences: Json | null
          property_id: string
          tags: string[] | null
          total_cancelled_value: number
          total_outstanding: number
          total_received: number
          total_spent: number | null
          total_stays: number | null
          updated_at: string | null
        }
        Insert: {
          address?: Json | null
          cancelled_stays?: number
          communication_preferences?: Json | null
          complaints?: Json | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          full_name: string
          id?: string
          is_archived?: boolean
          is_blacklisted?: boolean | null
          is_trade?: boolean
          last_stay_date?: string | null
          nationality?: string | null
          normalised_name?: string | null
          notes?: string | null
          phone?: string | null
          preferences?: Json | null
          property_id: string
          tags?: string[] | null
          total_cancelled_value?: number
          total_outstanding?: number
          total_received?: number
          total_spent?: number | null
          total_stays?: number | null
          updated_at?: string | null
        }
        Update: {
          address?: Json | null
          cancelled_stays?: number
          communication_preferences?: Json | null
          complaints?: Json | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_archived?: boolean
          is_blacklisted?: boolean | null
          is_trade?: boolean
          last_stay_date?: string | null
          nationality?: string | null
          normalised_name?: string | null
          notes?: string | null
          phone?: string | null
          preferences?: Json | null
          property_id?: string
          tags?: string[] | null
          total_cancelled_value?: number
          total_outstanding?: number
          total_received?: number
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
      rolos_inquiries: {
        Row: {
          adults: number
          assigned_to: string | null
          check_in: string | null
          check_out: string | null
          children: number
          company_name: string | null
          created_at: string
          created_by: string | null
          currency: string
          estimated_value: number | null
          first_response_at: string | null
          guest_country: string | null
          guest_email: string | null
          guest_name: string
          guest_phone: string | null
          hubspot_synced_at: string | null
          id: string
          intake_key_id: string | null
          is_trade: boolean
          linked_booking_id: string | null
          lost_reason: string | null
          notes: string | null
          owner_id: string | null
          portfolio_id: string | null
          property_id: string | null
          source: string
          status: Database["public"]["Enums"]["inquiry_status"]
          updated_at: string
        }
        Insert: {
          adults?: number
          assigned_to?: string | null
          check_in?: string | null
          check_out?: string | null
          children?: number
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          estimated_value?: number | null
          first_response_at?: string | null
          guest_country?: string | null
          guest_email?: string | null
          guest_name: string
          guest_phone?: string | null
          hubspot_synced_at?: string | null
          id?: string
          intake_key_id?: string | null
          is_trade?: boolean
          linked_booking_id?: string | null
          lost_reason?: string | null
          notes?: string | null
          owner_id?: string | null
          portfolio_id?: string | null
          property_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["inquiry_status"]
          updated_at?: string
        }
        Update: {
          adults?: number
          assigned_to?: string | null
          check_in?: string | null
          check_out?: string | null
          children?: number
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          estimated_value?: number | null
          first_response_at?: string | null
          guest_country?: string | null
          guest_email?: string | null
          guest_name?: string
          guest_phone?: string | null
          hubspot_synced_at?: string | null
          id?: string
          intake_key_id?: string | null
          is_trade?: boolean
          linked_booking_id?: string | null
          lost_reason?: string | null
          notes?: string | null
          owner_id?: string | null
          portfolio_id?: string | null
          property_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["inquiry_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_inquiries_intake_key_fkey"
            columns: ["intake_key_id"]
            isOneToOne: false
            referencedRelation: "rolos_inquiry_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_inquiries_linked_booking_id_fkey"
            columns: ["linked_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_inquiries_linked_booking_id_fkey"
            columns: ["linked_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings_decrypted"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_inquiries_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "property_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_inquiries_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_inquiries_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_inquiries_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_inquiry_events: {
        Row: {
          actor_id: string | null
          actor_label: string | null
          created_at: string
          event_type: string
          from_status: Database["public"]["Enums"]["inquiry_status"] | null
          id: string
          inquiry_id: string
          note: string | null
          to_status: Database["public"]["Enums"]["inquiry_status"] | null
        }
        Insert: {
          actor_id?: string | null
          actor_label?: string | null
          created_at?: string
          event_type: string
          from_status?: Database["public"]["Enums"]["inquiry_status"] | null
          id?: string
          inquiry_id: string
          note?: string | null
          to_status?: Database["public"]["Enums"]["inquiry_status"] | null
        }
        Update: {
          actor_id?: string | null
          actor_label?: string | null
          created_at?: string
          event_type?: string
          from_status?: Database["public"]["Enums"]["inquiry_status"] | null
          id?: string
          inquiry_id?: string
          note?: string | null
          to_status?: Database["public"]["Enums"]["inquiry_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "rolos_inquiry_events_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "rolos_inquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_inquiry_keys: {
        Row: {
          allowed_origins: string[]
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          key_public: string
          label: string
          last_used_at: string | null
          portfolio_id: string | null
          property_id: string | null
          request_count: number
          updated_at: string
        }
        Insert: {
          allowed_origins?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          key_public: string
          label?: string
          last_used_at?: string | null
          portfolio_id?: string | null
          property_id?: string | null
          request_count?: number
          updated_at?: string
        }
        Update: {
          allowed_origins?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          key_public?: string
          label?: string
          last_used_at?: string | null
          portfolio_id?: string | null
          property_id?: string | null
          request_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_inquiry_keys_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "property_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_inquiry_keys_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_inquiry_keys_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_inquiry_keys_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
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
          bill_to_account_id: string | null
          bill_to_address: string | null
          bill_to_name: string | null
          bill_to_terms_days: number | null
          bill_to_type: string
          bill_to_vat: string | null
          booking_id: string | null
          channel_key: string | null
          commission_amount: number | null
          commission_rate: number | null
          created_at: string
          created_by: string | null
          document_kind: string
          due_date: string | null
          folio_id: string
          id: string
          invoice_number: string
          invoice_to: string | null
          issued_date: string
          net_payable: number | null
          notes: string | null
          pdf_url: string | null
          property_id: string
          reference: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax_total: number
          total: number
          updated_at: string
        }
        Insert: {
          bill_to_account_id?: string | null
          bill_to_address?: string | null
          bill_to_name?: string | null
          bill_to_terms_days?: number | null
          bill_to_type?: string
          bill_to_vat?: string | null
          booking_id?: string | null
          channel_key?: string | null
          commission_amount?: number | null
          commission_rate?: number | null
          created_at?: string
          created_by?: string | null
          document_kind?: string
          due_date?: string | null
          folio_id: string
          id?: string
          invoice_number: string
          invoice_to?: string | null
          issued_date?: string
          net_payable?: number | null
          notes?: string | null
          pdf_url?: string | null
          property_id: string
          reference?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
        }
        Update: {
          bill_to_account_id?: string | null
          bill_to_address?: string | null
          bill_to_name?: string | null
          bill_to_terms_days?: number | null
          bill_to_type?: string
          bill_to_vat?: string | null
          booking_id?: string | null
          channel_key?: string | null
          commission_amount?: number | null
          commission_rate?: number | null
          created_at?: string
          created_by?: string | null
          document_kind?: string
          due_date?: string | null
          folio_id?: string
          id?: string
          invoice_number?: string
          invoice_to?: string | null
          issued_date?: string
          net_payable?: number | null
          notes?: string | null
          pdf_url?: string | null
          property_id?: string
          reference?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_invoices_bill_to_account_id_fkey"
            columns: ["bill_to_account_id"]
            isOneToOne: false
            referencedRelation: "crm_account_stats"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "rolos_invoices_bill_to_account_id_fkey"
            columns: ["bill_to_account_id"]
            isOneToOne: false
            referencedRelation: "crm_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_invoices_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_invoices_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings_decrypted"
            referencedColumns: ["id"]
          },
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
      rolos_package_components: {
        Row: {
          amount: number
          component_type: string
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_included_in_rate: boolean
          name: string
          package_id: string
          quantity: number
          quantity_basis: string
          revenue_stream: string
          updated_at: string
          value_type: string
        }
        Insert: {
          amount?: number
          component_type?: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_included_in_rate?: boolean
          name: string
          package_id: string
          quantity?: number
          quantity_basis?: string
          revenue_stream?: string
          updated_at?: string
          value_type?: string
        }
        Update: {
          amount?: number
          component_type?: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_included_in_rate?: boolean
          name?: string
          package_id?: string
          quantity?: number
          quantity_basis?: string
          revenue_stream?: string
          updated_at?: string
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_package_components_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "rolos_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      rolos_packages: {
        Row: {
          base_rate_plan_id: string | null
          code: string | null
          created_at: string
          description: string | null
          display_order: number
          id: string
          image_url: string | null
          is_active: boolean
          max_nights: number
          min_nights: number
          name: string
          property_id: string
          sell_standalone: boolean
          updated_at: string
        }
        Insert: {
          base_rate_plan_id?: string | null
          code?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          max_nights?: number
          min_nights?: number
          name: string
          property_id: string
          sell_standalone?: boolean
          updated_at?: string
        }
        Update: {
          base_rate_plan_id?: string | null
          code?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          max_nights?: number
          min_nights?: number
          name?: string
          property_id?: string
          sell_standalone?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_packages_base_rate_plan_id_fkey"
            columns: ["base_rate_plan_id"]
            isOneToOne: false
            referencedRelation: "rolos_rate_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_packages_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_packages_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_packages_property_id_fkey"
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
      rolos_policy_rate_links: {
        Row: {
          channel: string | null
          created_at: string
          id: string
          policy_id: string
          rate_plan_id: string | null
        }
        Insert: {
          channel?: string | null
          created_at?: string
          id?: string
          policy_id: string
          rate_plan_id?: string | null
        }
        Update: {
          channel?: string | null
          created_at?: string
          id?: string
          policy_id?: string
          rate_plan_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rolos_policy_rate_links_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "rolos_reservation_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_policy_rate_links_rate_plan_id_fkey"
            columns: ["rate_plan_id"]
            isOneToOne: false
            referencedRelation: "rolos_rate_plans"
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
          deleted_at: string | null
          differential_type: string
          differential_value: number | null
          id: string
          is_active: boolean
          link_source: string | null
          rate_plan_id: string
          room_type_id: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          differential_type?: string
          differential_value?: number | null
          id?: string
          is_active?: boolean
          link_source?: string | null
          rate_plan_id: string
          room_type_id: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          differential_type?: string
          differential_value?: number | null
          id?: string
          is_active?: boolean
          link_source?: string | null
          rate_plan_id?: string
          room_type_id?: string
          sort_order?: number | null
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
      rolos_rate_plan_season_rates: {
        Row: {
          base_rate: number | null
          created_at: string
          deleted_at: string | null
          derivation_value: number | null
          differential_type: string
          differential_value: number | null
          extra_adult_rate: number | null
          extra_child_rate: number | null
          id: string
          is_active: boolean
          is_pinned: boolean
          legacy_season_id: string | null
          rate_plan_id: string
          room_type_id: string | null
          shared_season_id: string | null
          updated_at: string
        }
        Insert: {
          base_rate?: number | null
          created_at?: string
          deleted_at?: string | null
          derivation_value?: number | null
          differential_type?: string
          differential_value?: number | null
          extra_adult_rate?: number | null
          extra_child_rate?: number | null
          id?: string
          is_active?: boolean
          is_pinned?: boolean
          legacy_season_id?: string | null
          rate_plan_id: string
          room_type_id?: string | null
          shared_season_id?: string | null
          updated_at?: string
        }
        Update: {
          base_rate?: number | null
          created_at?: string
          deleted_at?: string | null
          derivation_value?: number | null
          differential_type?: string
          differential_value?: number | null
          extra_adult_rate?: number | null
          extra_child_rate?: number | null
          id?: string
          is_active?: boolean
          is_pinned?: boolean
          legacy_season_id?: string | null
          rate_plan_id?: string
          room_type_id?: string | null
          shared_season_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_rate_plan_season_rates_legacy_season_id_fkey"
            columns: ["legacy_season_id"]
            isOneToOne: false
            referencedRelation: "rolos_rate_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_rate_plan_season_rates_rate_plan_id_fkey"
            columns: ["rate_plan_id"]
            isOneToOne: false
            referencedRelation: "rolos_rate_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_rate_plan_season_rates_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "rolos_room_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_rate_plan_season_rates_shared_season_id_fkey"
            columns: ["shared_season_id"]
            isOneToOne: false
            referencedRelation: "rolos_shared_seasons"
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
          breakfast_amount: number | null
          breakfast_basis: string | null
          breakfast_charge_id: string | null
          breakfast_included: boolean
          child_rate: number | null
          closed_to_arrival: boolean[] | null
          closed_to_departure: boolean[] | null
          code: string | null
          created_at: string | null
          deleted_at: string | null
          deposit_amount: number | null
          deposit_percentage: number | null
          derivation_rounding: string | null
          derivation_type: string | null
          derivation_value: number | null
          derived_from_plan_id: string | null
          description: string | null
          id: string
          infant_rate: number | null
          is_active: boolean | null
          is_primary_sell: boolean
          is_tax_inclusive: boolean | null
          max_advance_days: number | null
          max_stay: number | null
          min_advance_days: number | null
          min_stay: number | null
          min_stay_authority: string | null
          name: string
          plan_scope: string
          portfolio_id: string | null
          pricing_model: string
          pricing_model_normalised: string | null
          property_id: string
          push_to_channels: boolean
          requires_deposit: boolean | null
          sell_priority: number
          source_of_truth: string | null
          teen_rate: number | null
          updated_at: string | null
        }
        Insert: {
          adult_1_rate?: number | null
          adult_2_rate?: number | null
          base_rate?: number | null
          breakfast_amount?: number | null
          breakfast_basis?: string | null
          breakfast_charge_id?: string | null
          breakfast_included?: boolean
          child_rate?: number | null
          closed_to_arrival?: boolean[] | null
          closed_to_departure?: boolean[] | null
          code?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deposit_amount?: number | null
          deposit_percentage?: number | null
          derivation_rounding?: string | null
          derivation_type?: string | null
          derivation_value?: number | null
          derived_from_plan_id?: string | null
          description?: string | null
          id?: string
          infant_rate?: number | null
          is_active?: boolean | null
          is_primary_sell?: boolean
          is_tax_inclusive?: boolean | null
          max_advance_days?: number | null
          max_stay?: number | null
          min_advance_days?: number | null
          min_stay?: number | null
          min_stay_authority?: string | null
          name: string
          plan_scope?: string
          portfolio_id?: string | null
          pricing_model?: string
          pricing_model_normalised?: string | null
          property_id: string
          push_to_channels?: boolean
          requires_deposit?: boolean | null
          sell_priority?: number
          source_of_truth?: string | null
          teen_rate?: number | null
          updated_at?: string | null
        }
        Update: {
          adult_1_rate?: number | null
          adult_2_rate?: number | null
          base_rate?: number | null
          breakfast_amount?: number | null
          breakfast_basis?: string | null
          breakfast_charge_id?: string | null
          breakfast_included?: boolean
          child_rate?: number | null
          closed_to_arrival?: boolean[] | null
          closed_to_departure?: boolean[] | null
          code?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deposit_amount?: number | null
          deposit_percentage?: number | null
          derivation_rounding?: string | null
          derivation_type?: string | null
          derivation_value?: number | null
          derived_from_plan_id?: string | null
          description?: string | null
          id?: string
          infant_rate?: number | null
          is_active?: boolean | null
          is_primary_sell?: boolean
          is_tax_inclusive?: boolean | null
          max_advance_days?: number | null
          max_stay?: number | null
          min_advance_days?: number | null
          min_stay?: number | null
          min_stay_authority?: string | null
          name?: string
          plan_scope?: string
          portfolio_id?: string | null
          pricing_model?: string
          pricing_model_normalised?: string | null
          property_id?: string
          push_to_channels?: boolean
          requires_deposit?: boolean | null
          sell_priority?: number
          source_of_truth?: string | null
          teen_rate?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rolos_rate_plans_breakfast_charge_id_fkey"
            columns: ["breakfast_charge_id"]
            isOneToOne: false
            referencedRelation: "property_charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_rate_plans_derived_from_plan_id_fkey"
            columns: ["derived_from_plan_id"]
            isOneToOne: false
            referencedRelation: "rolos_rate_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_rate_plans_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "property_portfolios"
            referencedColumns: ["id"]
          },
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
          deleted_at: string | null
          extra_adult_rate: number | null
          extra_child_rate: number | null
          id: string
          is_active: boolean
          room_type_id: string
          season_id: string
          updated_at: string | null
        }
        Insert: {
          base_rate: number
          created_at?: string | null
          deleted_at?: string | null
          extra_adult_rate?: number | null
          extra_child_rate?: number | null
          id?: string
          is_active?: boolean
          room_type_id: string
          season_id: string
          updated_at?: string | null
        }
        Update: {
          base_rate?: number
          created_at?: string | null
          deleted_at?: string | null
          extra_adult_rate?: number | null
          extra_child_rate?: number | null
          id?: string
          is_active?: boolean
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
      rolos_rate_resolution_audit: {
        Row: {
          consumer: string | null
          created_at: string
          currency: string | null
          delta: number | null
          id: string
          legacy_rate: number | null
          legacy_tier: string | null
          notes: Json | null
          property_id: string
          rate_plan_id: string | null
          resolved_rate: number | null
          resolved_tier: string | null
          resolver_version: string
          room_type_id: string | null
          run_id: string
          stay_date: string
          updated_at: string
        }
        Insert: {
          consumer?: string | null
          created_at?: string
          currency?: string | null
          delta?: number | null
          id?: string
          legacy_rate?: number | null
          legacy_tier?: string | null
          notes?: Json | null
          property_id: string
          rate_plan_id?: string | null
          resolved_rate?: number | null
          resolved_tier?: string | null
          resolver_version?: string
          room_type_id?: string | null
          run_id: string
          stay_date: string
          updated_at?: string
        }
        Update: {
          consumer?: string | null
          created_at?: string
          currency?: string | null
          delta?: number | null
          id?: string
          legacy_rate?: number | null
          legacy_tier?: string | null
          notes?: Json | null
          property_id?: string
          rate_plan_id?: string | null
          resolved_rate?: number | null
          resolved_tier?: string | null
          resolver_version?: string
          room_type_id?: string | null
          run_id?: string
          stay_date?: string
          updated_at?: string
        }
        Relationships: []
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
          approved_at: string | null
          approved_by: string | null
          booking_id: string | null
          created_at: string
          entitled_amount: number | null
          gateway: string | null
          gateway_error: string | null
          gateway_refund_id: string | null
          guest_choice: string | null
          guest_choice_at: string | null
          id: string
          internal_notes: string | null
          manual_settlement: boolean
          payment_id: string | null
          payment_transaction_id: string | null
          pf_payment_id: string | null
          processed_at: string | null
          property_id: string
          reason: string
          reason_category: string | null
          rejected_by: string | null
          rejected_reason: string | null
          requested_amount: number | null
          requested_by: string | null
          status: Database["public"]["Enums"]["refund_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          booking_id?: string | null
          created_at?: string
          entitled_amount?: number | null
          gateway?: string | null
          gateway_error?: string | null
          gateway_refund_id?: string | null
          guest_choice?: string | null
          guest_choice_at?: string | null
          id?: string
          internal_notes?: string | null
          manual_settlement?: boolean
          payment_id?: string | null
          payment_transaction_id?: string | null
          pf_payment_id?: string | null
          processed_at?: string | null
          property_id: string
          reason: string
          reason_category?: string | null
          rejected_by?: string | null
          rejected_reason?: string | null
          requested_amount?: number | null
          requested_by?: string | null
          status?: Database["public"]["Enums"]["refund_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          booking_id?: string | null
          created_at?: string
          entitled_amount?: number | null
          gateway?: string | null
          gateway_error?: string | null
          gateway_refund_id?: string | null
          guest_choice?: string | null
          guest_choice_at?: string | null
          id?: string
          internal_notes?: string | null
          manual_settlement?: boolean
          payment_id?: string | null
          payment_transaction_id?: string | null
          pf_payment_id?: string | null
          processed_at?: string | null
          property_id?: string
          reason?: string
          reason_category?: string | null
          rejected_by?: string | null
          rejected_reason?: string | null
          requested_amount?: number | null
          requested_by?: string | null
          status?: Database["public"]["Enums"]["refund_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_refunds_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_refunds_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings_decrypted"
            referencedColumns: ["id"]
          },
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
      rolos_reservation_policies: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          is_master: boolean
          kind: string
          linked_master_id: string | null
          name: string
          property_id: string
          rule: Json
          scope: string
          source_policy_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          is_master?: boolean
          kind?: string
          linked_master_id?: string | null
          name: string
          property_id: string
          rule?: Json
          scope?: string
          source_policy_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          is_master?: boolean
          kind?: string
          linked_master_id?: string | null
          name?: string
          property_id?: string
          rule?: Json
          scope?: string
          source_policy_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_reservation_policies_linked_master_id_fkey"
            columns: ["linked_master_id"]
            isOneToOne: false
            referencedRelation: "rolos_reservation_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_reservation_policies_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_reservation_policies_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_reservation_policies_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_reservation_policies_source_policy_id_fkey"
            columns: ["source_policy_id"]
            isOneToOne: false
            referencedRelation: "rolos_reservation_policies"
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
      rolos_shared_seasons: {
        Row: {
          calendar_season_id: string | null
          created_at: string
          deleted_at: string | null
          end_date: string
          id: string
          is_active: boolean
          is_peak: boolean
          name: string
          portfolio_id: string | null
          property_id: string | null
          source: string
          start_date: string
          updated_at: string
        }
        Insert: {
          calendar_season_id?: string | null
          created_at?: string
          deleted_at?: string | null
          end_date: string
          id?: string
          is_active?: boolean
          is_peak?: boolean
          name: string
          portfolio_id?: string | null
          property_id?: string | null
          source?: string
          start_date: string
          updated_at?: string
        }
        Update: {
          calendar_season_id?: string | null
          created_at?: string
          deleted_at?: string | null
          end_date?: string
          id?: string
          is_active?: boolean
          is_peak?: boolean
          name?: string
          portfolio_id?: string | null
          property_id?: string | null
          source?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolos_shared_seasons_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "property_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_shared_seasons_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "rolos_shared_seasons_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolos_shared_seasons_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
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
      rolos_stay_restrictions: {
        Row: {
          closed_to_arrival: boolean
          closed_to_departure: boolean
          conflict_notes: Json | null
          created_at: string
          end_date: string | null
          has_conflict: boolean
          id: string
          max_stay: number | null
          min_stay: number | null
          property_id: string
          rate_plan_id: string | null
          room_type_id: string | null
          source: string
          source_ref: string | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          closed_to_arrival?: boolean
          closed_to_departure?: boolean
          conflict_notes?: Json | null
          created_at?: string
          end_date?: string | null
          has_conflict?: boolean
          id?: string
          max_stay?: number | null
          min_stay?: number | null
          property_id: string
          rate_plan_id?: string | null
          room_type_id?: string | null
          source: string
          source_ref?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          closed_to_arrival?: boolean
          closed_to_departure?: boolean
          conflict_notes?: Json | null
          created_at?: string
          end_date?: string | null
          has_conflict?: boolean
          id?: string
          max_stay?: number | null
          min_stay?: number | null
          property_id?: string
          rate_plan_id?: string | null
          room_type_id?: string | null
          source?: string
          source_ref?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: []
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
      ru_amenities: {
        Row: {
          category: string | null
          created_at: string
          id: number
          is_active: boolean
          is_recommended: boolean
          name: string
          popular_rank: number | null
          ru_group: string | null
          ru_group_id: number | null
          scope: string
          supports_count: boolean
          synced_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id: number
          is_active?: boolean
          is_recommended?: boolean
          name: string
          popular_rank?: number | null
          ru_group?: string | null
          ru_group_id?: number | null
          scope?: string
          supports_count?: boolean
          synced_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: number
          is_active?: boolean
          is_recommended?: boolean
          name?: string
          popular_rank?: number | null
          ru_group?: string | null
          ru_group_id?: number | null
          scope?: string
          supports_count?: boolean
          synced_at?: string
        }
        Relationships: []
      }
      ru_api_credentials: {
        Row: {
          access_key: string
          created_at: string
          id: string
          key_label: string | null
          login_email: string | null
          ru_owner_id: string
          secret_enc: string | null
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          access_key: string
          created_at?: string
          id?: string
          key_label?: string | null
          login_email?: string | null
          ru_owner_id: string
          secret_enc?: string | null
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          access_key?: string
          created_at?: string
          id?: string
          key_label?: string | null
          login_email?: string | null
          ru_owner_id?: string
          secret_enc?: string | null
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      ru_api_log: {
        Row: {
          action: string
          changed_fields: string[] | null
          created_at: string
          direction: string
          elapsed_ms: number | null
          endpoint: string | null
          error_message: string | null
          error_reason: string | null
          expires_at: string
          fingerprint: string | null
          http_status: number | null
          id: string
          parent_action: string | null
          property_id: string | null
          push_type: string | null
          request_bytes: number | null
          request_xml: string | null
          response_bytes: number | null
          response_id: string | null
          response_xml: string | null
          ru_owner_id: string | null
          ru_property_id: string | null
          ru_user_id: string | null
          status_id: string | null
          status_message: string | null
          success: boolean
          trace_id: string | null
          transport_status: string | null
          unit_id: string | null
        }
        Insert: {
          action: string
          changed_fields?: string[] | null
          created_at?: string
          direction?: string
          elapsed_ms?: number | null
          endpoint?: string | null
          error_message?: string | null
          error_reason?: string | null
          expires_at?: string
          fingerprint?: string | null
          http_status?: number | null
          id?: string
          parent_action?: string | null
          property_id?: string | null
          push_type?: string | null
          request_bytes?: number | null
          request_xml?: string | null
          response_bytes?: number | null
          response_id?: string | null
          response_xml?: string | null
          ru_owner_id?: string | null
          ru_property_id?: string | null
          ru_user_id?: string | null
          status_id?: string | null
          status_message?: string | null
          success?: boolean
          trace_id?: string | null
          transport_status?: string | null
          unit_id?: string | null
        }
        Update: {
          action?: string
          changed_fields?: string[] | null
          created_at?: string
          direction?: string
          elapsed_ms?: number | null
          endpoint?: string | null
          error_message?: string | null
          error_reason?: string | null
          expires_at?: string
          fingerprint?: string | null
          http_status?: number | null
          id?: string
          parent_action?: string | null
          property_id?: string | null
          push_type?: string | null
          request_bytes?: number | null
          request_xml?: string | null
          response_bytes?: number | null
          response_id?: string | null
          response_xml?: string | null
          ru_owner_id?: string | null
          ru_property_id?: string | null
          ru_user_id?: string | null
          status_id?: string | null
          status_message?: string | null
          success?: boolean
          trace_id?: string | null
          transport_status?: string | null
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ru_api_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "ru_api_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ru_api_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      ru_archive_events: {
        Row: {
          actor_email: string | null
          actor_user_id: string | null
          created_at: string
          detail: string | null
          direction: string
          id: string
          listing_count: number
          property_id: string
          property_name: string | null
          reason: string | null
          ru_status: string | null
          unit_count: number
        }
        Insert: {
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          detail?: string | null
          direction: string
          id?: string
          listing_count?: number
          property_id: string
          property_name?: string | null
          reason?: string | null
          ru_status?: string | null
          unit_count?: number
        }
        Update: {
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          detail?: string | null
          direction?: string
          id?: string
          listing_count?: number
          property_id?: string
          property_name?: string | null
          reason?: string | null
          ru_status?: string | null
          unit_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "ru_archive_events_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "ru_archive_events_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ru_archive_events_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      ru_call_queue: {
        Row: {
          action: string
          attempts: number
          claimed_at: string | null
          completed_at: string | null
          created_at: string
          id: string
          last_error: string | null
          max_attempts: number
          method_key: string
          not_before: string
          payload: Json
          priority: number
          property_id: string | null
          result: Json | null
          ru_owner_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          action: string
          attempts?: number
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          method_key: string
          not_before?: string
          payload: Json
          priority?: number
          property_id?: string | null
          result?: Json | null
          ru_owner_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          action?: string
          attempts?: number
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          method_key?: string
          not_before?: string
          payload?: Json
          priority?: number
          property_id?: string | null
          result?: Json | null
          ru_owner_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ru_cert_runs: {
        Row: {
          created_at: string
          failed: number
          finished_at: string | null
          id: string
          passed: number
          property_id: string | null
          ru_property_id: string | null
          started_at: string
          status: string
          steps: Json
          suite: string
          total: number
          triggered_by: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          failed?: number
          finished_at?: string | null
          id?: string
          passed?: number
          property_id?: string | null
          ru_property_id?: string | null
          started_at?: string
          status?: string
          steps?: Json
          suite?: string
          total?: number
          triggered_by?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          failed?: number
          finished_at?: string | null
          id?: string
          passed?: number
          property_id?: string | null
          ru_property_id?: string | null
          started_at?: string
          status?: string
          steps?: Json
          suite?: string
          total?: number
          triggered_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ru_cert_runs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "ru_cert_runs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ru_cert_runs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      ru_channel_creators: {
        Row: {
          channel_key: string
          channel_label: string
          created_at: string
          creator_username: string
          id: string
          is_active: boolean
          notes: string | null
          ru_channel_id: string | null
          updated_at: string
        }
        Insert: {
          channel_key: string
          channel_label: string
          created_at?: string
          creator_username: string
          id?: string
          is_active?: boolean
          notes?: string | null
          ru_channel_id?: string | null
          updated_at?: string
        }
        Update: {
          channel_key?: string
          channel_label?: string
          created_at?: string
          creator_username?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          ru_channel_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ru_currency_state: {
        Row: {
          authored_currency_iso: string | null
          conversion_in_force: boolean
          created_at: string
          decided_at: string
          effective_rate: number | null
          flip_outcome: string | null
          fx_rate: number | null
          id: string
          location_currency_iso: string | null
          margin_pct: number
          owner_scope: string | null
          property_id: string
          published_currency_iso: string | null
          reason: string | null
          ru_location_id: number | null
          ru_reported_currency_iso: string | null
          updated_at: string
          verified_at: string | null
          verified_ru_property_id: number | null
        }
        Insert: {
          authored_currency_iso?: string | null
          conversion_in_force?: boolean
          created_at?: string
          decided_at?: string
          effective_rate?: number | null
          flip_outcome?: string | null
          fx_rate?: number | null
          id?: string
          location_currency_iso?: string | null
          margin_pct?: number
          owner_scope?: string | null
          property_id: string
          published_currency_iso?: string | null
          reason?: string | null
          ru_location_id?: number | null
          ru_reported_currency_iso?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_ru_property_id?: number | null
        }
        Update: {
          authored_currency_iso?: string | null
          conversion_in_force?: boolean
          created_at?: string
          decided_at?: string
          effective_rate?: number | null
          flip_outcome?: string | null
          fx_rate?: number | null
          id?: string
          location_currency_iso?: string | null
          margin_pct?: number
          owner_scope?: string | null
          property_id?: string
          published_currency_iso?: string | null
          reason?: string | null
          ru_location_id?: number | null
          ru_reported_currency_iso?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_ru_property_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ru_currency_state_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "ru_currency_state_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ru_currency_state_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      ru_destinations: {
        Row: {
          created_at: string
          id: string
          is_generic: boolean
          name: string
          ru_destination_id: number
          slug: string
          synced_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_generic?: boolean
          name: string
          ru_destination_id: number
          slug: string
          synced_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_generic?: boolean
          name?: string
          ru_destination_id?: number
          slug?: string
          synced_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ru_discounts: {
        Row: {
          created_at: string
          date_from: string | null
          date_to: string | null
          discount_percent: number
          discount_type: string
          id: string
          is_active: boolean
          property_id: string
          threshold: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          discount_percent: number
          discount_type: string
          id?: string
          is_active?: boolean
          property_id: string
          threshold: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          discount_percent?: number
          discount_type?: string
          id?: string
          is_active?: boolean
          property_id?: string
          threshold?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ru_discounts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "ru_discounts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ru_discounts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      ru_duplicate_repairs: {
        Row: {
          canonical_room_type_id: string | null
          canonical_ru_property_id: string | null
          created_at: string
          id: string
          property_id: string
          resolution: string | null
          status: string
          surplus_ru_property_id: string
          unit_name: string
          updated_at: string
        }
        Insert: {
          canonical_room_type_id?: string | null
          canonical_ru_property_id?: string | null
          created_at?: string
          id?: string
          property_id: string
          resolution?: string | null
          status?: string
          surplus_ru_property_id: string
          unit_name: string
          updated_at?: string
        }
        Update: {
          canonical_room_type_id?: string | null
          canonical_ru_property_id?: string | null
          created_at?: string
          id?: string
          property_id?: string
          resolution?: string | null
          status?: string
          surplus_ru_property_id?: string
          unit_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      ru_fx_rates: {
        Row: {
          base_iso: string
          created_at: string
          fetched_at: string
          id: string
          quote_iso: string
          rate: number
          source: string
        }
        Insert: {
          base_iso: string
          created_at?: string
          fetched_at?: string
          id?: string
          quote_iso: string
          rate: number
          source?: string
        }
        Update: {
          base_iso?: string
          created_at?: string
          fetched_at?: string
          id?: string
          quote_iso?: string
          rate?: number
          source?: string
        }
        Relationships: []
      }
      ru_lnm_repull_queue: {
        Row: {
          attempts: number
          change_types: string[]
          date_from: string | null
          date_to: string | null
          first_seen_at: string
          id: string
          kind: string
          last_change_id: string | null
          last_error: string | null
          notifications: number
          processed_at: string | null
          property_id: string | null
          ru_owner_id: string | null
          ru_property_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          change_types?: string[]
          date_from?: string | null
          date_to?: string | null
          first_seen_at?: string
          id?: string
          kind?: string
          last_change_id?: string | null
          last_error?: string | null
          notifications?: number
          processed_at?: string | null
          property_id?: string | null
          ru_owner_id?: string | null
          ru_property_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          change_types?: string[]
          date_from?: string | null
          date_to?: string | null
          first_seen_at?: string
          id?: string
          kind?: string
          last_change_id?: string | null
          last_error?: string | null
          notifications?: number
          processed_at?: string | null
          property_id?: string | null
          ru_owner_id?: string | null
          ru_property_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ru_location_currency_scope: {
        Row: {
          currency_iso: string | null
          currency_ru_id: number | null
          last_synced_at: string
          location_id: number
          owner_scope: string
          source: string
          verified_at: string | null
        }
        Insert: {
          currency_iso?: string | null
          currency_ru_id?: number | null
          last_synced_at?: string
          location_id: number
          owner_scope: string
          source?: string
          verified_at?: string | null
        }
        Update: {
          currency_iso?: string | null
          currency_ru_id?: number | null
          last_synced_at?: string
          location_id?: number
          owner_scope?: string
          source?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      ru_locations: {
        Row: {
          country: string
          currency_iso: string | null
          currency_ru_id: number | null
          depth: number | null
          id: number
          last_synced_at: string
          location_type_id: number | null
          name: string
          parent_id: number | null
          path: string | null
        }
        Insert: {
          country: string
          currency_iso?: string | null
          currency_ru_id?: number | null
          depth?: number | null
          id: number
          last_synced_at?: string
          location_type_id?: number | null
          name: string
          parent_id?: number | null
          path?: string | null
        }
        Update: {
          country?: string
          currency_iso?: string | null
          currency_ru_id?: number | null
          depth?: number | null
          id?: number
          last_synced_at?: string
          location_type_id?: number | null
          name?: string
          parent_id?: number | null
          path?: string | null
        }
        Relationships: []
      }
      ru_mcq_orders: {
        Row: {
          created_at: string
          id: string
          ordered_at: string
          ordered_by: string | null
          property_id: string | null
          response_preview: string | null
          ru_property_id: string
          ru_status_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          ordered_at?: string
          ordered_by?: string | null
          property_id?: string | null
          response_preview?: string | null
          ru_property_id: string
          ru_status_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          ordered_at?: string
          ordered_by?: string | null
          property_id?: string | null
          response_preview?: string | null
          ru_property_id?: string
          ru_status_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ru_mcq_orders_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "ru_mcq_orders_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ru_mcq_orders_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      ru_method_rate_limits: {
        Row: {
          action: string | null
          created_at: string
          last_called_at: string
          method_key: string
          updated_at: string
        }
        Insert: {
          action?: string | null
          created_at?: string
          last_called_at?: string
          method_key: string
          updated_at?: string
        }
        Update: {
          action?: string | null
          created_at?: string
          last_called_at?: string
          method_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      ru_notifications: {
        Row: {
          attempt_count: number
          created_at: string | null
          error_message: string | null
          event_type: string
          id: string
          last_attempt_at: string | null
          next_attempt_at: string | null
          processed: boolean | null
          property_id: string | null
          raw_xml: string | null
          resolution_state: string
          resolved_owner_id: string | null
          ru_property_id: string | null
          ru_reservation_id: string | null
        }
        Insert: {
          attempt_count?: number
          created_at?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          last_attempt_at?: string | null
          next_attempt_at?: string | null
          processed?: boolean | null
          property_id?: string | null
          raw_xml?: string | null
          resolution_state?: string
          resolved_owner_id?: string | null
          ru_property_id?: string | null
          ru_reservation_id?: string | null
        }
        Update: {
          attempt_count?: number
          created_at?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          last_attempt_at?: string | null
          next_attempt_at?: string | null
          processed?: boolean | null
          property_id?: string | null
          raw_xml?: string | null
          resolution_state?: string
          resolved_owner_id?: string | null
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
          company_details_status: string
          company_filled_at: string | null
          company_payload: Json | null
          company_profile: Json | null
          created_at: string
          id: string
          owner_email: string
          portfolio_id: string | null
          property_id: string | null
          ru_api_access_key: string | null
          ru_api_key_label: string | null
          ru_api_keys_verified_at: string | null
          ru_api_secret_enc: string | null
          ru_login_email: string | null
          ru_login_password_enc: string | null
          ru_login_url: string | null
          ru_owner_id: string | null
          ru_user_id: string | null
          ru_wl_access_token: string | null
          ru_wl_refresh_token: string | null
          ru_wl_token_expires_at: string | null
          ru_wl_token_source: string | null
          scope: string
          updated_at: string
        }
        Insert: {
          company_details_sent?: boolean
          company_details_status?: string
          company_filled_at?: string | null
          company_payload?: Json | null
          company_profile?: Json | null
          created_at?: string
          id?: string
          owner_email: string
          portfolio_id?: string | null
          property_id?: string | null
          ru_api_access_key?: string | null
          ru_api_key_label?: string | null
          ru_api_keys_verified_at?: string | null
          ru_api_secret_enc?: string | null
          ru_login_email?: string | null
          ru_login_password_enc?: string | null
          ru_login_url?: string | null
          ru_owner_id?: string | null
          ru_user_id?: string | null
          ru_wl_access_token?: string | null
          ru_wl_refresh_token?: string | null
          ru_wl_token_expires_at?: string | null
          ru_wl_token_source?: string | null
          scope?: string
          updated_at?: string
        }
        Update: {
          company_details_sent?: boolean
          company_details_status?: string
          company_filled_at?: string | null
          company_payload?: Json | null
          company_profile?: Json | null
          created_at?: string
          id?: string
          owner_email?: string
          portfolio_id?: string | null
          property_id?: string | null
          ru_api_access_key?: string | null
          ru_api_key_label?: string | null
          ru_api_keys_verified_at?: string | null
          ru_api_secret_enc?: string | null
          ru_login_email?: string | null
          ru_login_password_enc?: string | null
          ru_login_url?: string | null
          ru_owner_id?: string | null
          ru_user_id?: string | null
          ru_wl_access_token?: string | null
          ru_wl_refresh_token?: string | null
          ru_wl_token_expires_at?: string | null
          ru_wl_token_source?: string | null
          scope?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ru_owner_accounts_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "property_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ru_owner_accounts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "ru_owner_accounts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ru_owner_accounts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      ru_platform_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      ru_property_types: {
        Row: {
          created_at: string
          is_active: boolean
          name: string
          ru_type_id: number
          slug: string
          synced_at: string
        }
        Insert: {
          created_at?: string
          is_active?: boolean
          name: string
          ru_type_id: number
          slug: string
          synced_at?: string
        }
        Update: {
          created_at?: string
          is_active?: boolean
          name?: string
          ru_type_id?: number
          slug?: string
          synced_at?: string
        }
        Relationships: []
      }
      ru_readiness_snapshots: {
        Row: {
          created_at: string
          groups: Json
          phase_payload: Json | null
          phase_payload_at: string | null
          probed_at: string
          property_id: string
          ru_owner_id: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          groups?: Json
          phase_payload?: Json | null
          phase_payload_at?: string | null
          probed_at?: string
          property_id: string
          ru_owner_id?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          groups?: Json
          phase_payload?: Json | null
          phase_payload_at?: string | null
          probed_at?: string
          property_id?: string
          ru_owner_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ru_readiness_snapshots_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "ru_readiness_snapshots_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ru_readiness_snapshots_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      ru_retired_accounts: {
        Row: {
          created_at: string
          id: string
          portal_email: string | null
          reason: string | null
          retired_at: string
          retired_by: string | null
          ru_owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          portal_email?: string | null
          reason?: string | null
          retired_at?: string
          retired_by?: string | null
          ru_owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          portal_email?: string | null
          reason?: string | null
          retired_at?: string
          retired_by?: string | null
          ru_owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      ru_roster_cache: {
        Row: {
          cache_key: string
          fetched_at: string
          source: string | null
          user_count: number
          users: Json
        }
        Insert: {
          cache_key: string
          fetched_at?: string
          source?: string | null
          user_count?: number
          users?: Json
        }
        Update: {
          cache_key?: string
          fetched_at?: string
          source?: string | null
          user_count?: number
          users?: Json
        }
        Relationships: []
      }
      ru_sync_runs: {
        Row: {
          action: string
          batch_id: string
          created_at: string
          details: Json | null
          elapsed_ms: number | null
          error_code: string | null
          error_message: string | null
          http_status: number | null
          id: string
          property_id: string | null
          ru_property_id: string | null
          success: boolean
          unit_id: string | null
        }
        Insert: {
          action: string
          batch_id?: string
          created_at?: string
          details?: Json | null
          elapsed_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          property_id?: string | null
          ru_property_id?: string | null
          success: boolean
          unit_id?: string | null
        }
        Update: {
          action?: string
          batch_id?: string
          created_at?: string
          details?: Json | null
          elapsed_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          property_id?: string | null
          ru_property_id?: string | null
          success?: boolean
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ru_sync_runs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "ru_sync_runs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ru_sync_runs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
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
          entity_type: string
          id: string
          is_active: boolean
          notes: string | null
          phone: string | null
          quarterly_target: number | null
          rep_code: string
          tax_reference_number: string | null
          tax_status_confirmed_at: string | null
          trading_name: string | null
          updated_at: string
          user_id: string | null
          vat_number: string | null
          vat_registered: boolean
        }
        Insert: {
          commission_tier?: Database["public"]["Enums"]["commission_tier"]
          created_at?: string
          display_name: string
          email: string
          entity_type?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          phone?: string | null
          quarterly_target?: number | null
          rep_code: string
          tax_reference_number?: string | null
          tax_status_confirmed_at?: string | null
          trading_name?: string | null
          updated_at?: string
          user_id?: string | null
          vat_number?: string | null
          vat_registered?: boolean
        }
        Update: {
          commission_tier?: Database["public"]["Enums"]["commission_tier"]
          created_at?: string
          display_name?: string
          email?: string
          entity_type?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          phone?: string | null
          quarterly_target?: number | null
          rep_code?: string
          tax_reference_number?: string | null
          tax_status_confirmed_at?: string | null
          trading_name?: string | null
          updated_at?: string
          user_id?: string | null
          vat_number?: string | null
          vat_registered?: boolean
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
      scoped_admin_properties: {
        Row: {
          created_at: string
          id: string
          property_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          property_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          property_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scoped_admin_properties_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "scoped_admin_properties_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scoped_admin_properties_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_charge_items: {
        Row: {
          amount: number
          created_at: string
          currency: string
          description: string
          id: string
          invoiced_at: string | null
          invoiced_on_invoice_id: string | null
          kind: string
          owner_id: string | null
          portfolio_id: string | null
          property_id: string | null
          status: string
          updated_at: string
          waived_at: string | null
          waived_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          description: string
          id?: string
          invoiced_at?: string | null
          invoiced_on_invoice_id?: string | null
          kind: string
          owner_id?: string | null
          portfolio_id?: string | null
          property_id?: string | null
          status?: string
          updated_at?: string
          waived_at?: string | null
          waived_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          description?: string
          id?: string
          invoiced_at?: string | null
          invoiced_on_invoice_id?: string | null
          kind?: string
          owner_id?: string | null
          portfolio_id?: string | null
          property_id?: string | null
          status?: string
          updated_at?: string
          waived_at?: string | null
          waived_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_charge_items_invoiced_on_invoice_id_fkey"
            columns: ["invoiced_on_invoice_id"]
            isOneToOne: false
            referencedRelation: "subscription_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_charge_items_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "property_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_charge_items_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "subscription_charge_items_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_charge_items_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_invoice_events: {
        Row: {
          created_at: string
          detail: string | null
          event_type: string
          id: string
          invoice_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          event_type: string
          id?: string
          invoice_id?: string | null
          status: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          event_type?: string
          id?: string
          invoice_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_invoice_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "subscription_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_invoices: {
        Row: {
          amount: number
          auto_charged: boolean
          created_at: string
          currency: string
          email_sent_at: string | null
          id: string
          invoice_kind: string
          invoice_number: string | null
          line_items: Json
          mandate_token: string | null
          metadata: Json
          once_off_amount: number
          owner_id: string | null
          paid_at: string | null
          payfast_payment_id: string | null
          payfast_token: string
          pdf_url: string | null
          period_end: string
          period_start: string
          portfolio_id: string | null
          property_id: string | null
          reminder_count: number
          status: string
          subscription_amount: number
          updated_at: string
        }
        Insert: {
          amount: number
          auto_charged?: boolean
          created_at?: string
          currency?: string
          email_sent_at?: string | null
          id?: string
          invoice_kind?: string
          invoice_number?: string | null
          line_items?: Json
          mandate_token?: string | null
          metadata?: Json
          once_off_amount?: number
          owner_id?: string | null
          paid_at?: string | null
          payfast_payment_id?: string | null
          payfast_token?: string
          pdf_url?: string | null
          period_end: string
          period_start: string
          portfolio_id?: string | null
          property_id?: string | null
          reminder_count?: number
          status?: string
          subscription_amount?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          auto_charged?: boolean
          created_at?: string
          currency?: string
          email_sent_at?: string | null
          id?: string
          invoice_kind?: string
          invoice_number?: string | null
          line_items?: Json
          mandate_token?: string | null
          metadata?: Json
          once_off_amount?: number
          owner_id?: string | null
          paid_at?: string | null
          payfast_payment_id?: string | null
          payfast_token?: string
          pdf_url?: string | null
          period_end?: string
          period_start?: string
          portfolio_id?: string | null
          property_id?: string | null
          reminder_count?: number
          status?: string
          subscription_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_invoices_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_invoices_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "property_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_invoices_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "subscription_invoices_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_invoices_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
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
      verification_requests: {
        Row: {
          booking_reference: string | null
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          max_age: number | null
          min_age: number | null
          property_id: string | null
          status: string
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          booking_reference?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          max_age?: number | null
          min_age?: number | null
          property_id?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          booking_reference?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          max_age?: number | null
          min_age?: number | null
          property_id?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "dw_portfolio_kpis"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "verification_requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "public_properties"
            referencedColumns: ["id"]
          },
        ]
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
      crm_account_stats: {
        Row: {
          account_id: string | null
          booking_count: number | null
          last_booking_date: string | null
          room_nights: number | null
          total_revenue: number | null
        }
        Relationships: []
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
      public_pricing_defaults: {
        Row: {
          branding_addon_monthly_fee: number | null
          byo_gateway_monthly_fee: number | null
          default_commission_rate: number | null
          pricelabs_monthly_fee: number | null
          strategy: string | null
          tier_pricing_json: Json | null
          white_label_monthly_fee: number | null
          widget_flat_commission_rate: number | null
        }
        Insert: {
          branding_addon_monthly_fee?: number | null
          byo_gateway_monthly_fee?: number | null
          default_commission_rate?: number | null
          pricelabs_monthly_fee?: number | null
          strategy?: string | null
          tier_pricing_json?: Json | null
          white_label_monthly_fee?: number | null
          widget_flat_commission_rate?: number | null
        }
        Update: {
          branding_addon_monthly_fee?: number | null
          byo_gateway_monthly_fee?: number | null
          default_commission_rate?: number | null
          pricelabs_monthly_fee?: number | null
          strategy?: string | null
          tier_pricing_json?: Json | null
          white_label_monthly_fee?: number | null
          widget_flat_commission_rate?: number | null
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
      rolos_v_effective_rates: {
        Row: {
          currency: string | null
          property_id: string | null
          rate: number | null
          rate_plan_id: string | null
          resolved_at: string | null
          resolver_version: string | null
          room_type_id: string | null
          stay_date: string | null
          tier: string | null
        }
        Relationships: []
      }
      rolos_v_rate_plan_season_prices: {
        Row: {
          base_rate: number | null
          extra_adult_rate: number | null
          extra_child_rate: number | null
          origin: string | null
          room_type_id: string | null
          season_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_subscription_adjustment: {
        Args: {
          _amount: number
          _description: string
          _portfolio_id: string
          _property_id: string
        }
        Returns: string
      }
      admin_scope_allows: {
        Args: { _property_id: string; _user_id: string }
        Returns: boolean
      }
      assert_room_line_bookable: {
        Args: {
          _booking_id: string
          _guests: number
          _line_id: string
          _line_status: string
          _room_id: string
          _room_type_id: string
        }
        Returns: undefined
      }
      attribute_portfolio_share: {
        Args: { _booking_id: string }
        Returns: undefined
      }
      booking_status_is_live: { Args: { _status: string }; Returns: boolean }
      can_access_channel_property: {
        Args: { _property_id: string; _user_id: string }
        Returns: boolean
      }
      can_access_crm_scope: {
        Args: { _portfolio_id: string; _property_id: string; _user_id: string }
        Returns: boolean
      }
      can_access_property: {
        Args: { _property_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_cost_share: { Args: never; Returns: boolean }
      can_view_rol_pulse: { Args: { user_id: string }; Returns: boolean }
      can_write_property_image: { Args: { _name: string }; Returns: boolean }
      cancel_subscription_by_token: {
        Args: { _token: string }
        Returns: boolean
      }
      consume_onboarding_token: { Args: { _token: string }; Returns: boolean }
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
      format_rol_booking_reference: {
        Args: { _code: string; _seq: number }
        Returns: string
      }
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
      get_rol_property_invoice_by_token: {
        Args: { _token: string }
        Returns: {
          adjustment_total: number
          amount_paid: number
          bill_to_name: string
          booking_count: number
          charge_total: number
          commission_total: number
          currency: string
          due_date: string
          group_name: string
          id: string
          invoice_reference: string
          lines: Json
          period_end: string
          period_start: string
          recurring_total: number
          status: string
          subtotal: number
          total: number
          vat_amount: number
          vat_rate: number
        }[]
      }
      get_ru_cron_jobs: {
        Args: never
        Returns: {
          active: boolean
          jobname: string
          last_run_at: string
          last_status: string
          schedule: string
        }[]
      }
      get_subscription_invoice_by_token: {
        Args: { _token: string }
        Returns: {
          amount: number
          currency: string
          entity_name: string
          id: string
          invoice_kind: string
          line_items: Json
          once_off_amount: number
          period_end: string
          period_start: string
          portfolio_id: string
          property_id: string
          status: string
          subscription_amount: number
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
      has_reports_access: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_cost_share_owner: { Args: never; Returns: boolean }
      is_linked_owner: {
        Args: { _property_id: string; _user_id: string }
        Returns: boolean
      }
      is_payout_admin: { Args: { _user_id: string }; Returns: boolean }
      is_property_active: { Args: { prop_id: string }; Returns: boolean }
      is_property_owner: {
        Args: { _property_id: string; _user_id: string }
        Returns: boolean
      }
      is_scoped_admin: { Args: { _user_id: string }; Returns: boolean }
      manages_any_property: { Args: { _user_id: string }; Returns: boolean }
      next_commission_statement_reference: {
        Args: { _period_month: string; _rep_code: string }
        Returns: string
      }
      next_payout_reference: {
        Args: { _group_code: string; _kind: string; _period: string }
        Returns: string
      }
      next_rol_booking_reference: {
        Args: { _kind: string; _origin: string; _property_id: string }
        Returns: string
      }
      next_rol_document_reference: {
        Args: { _doc: string; _party_code: string; _period: string }
        Returns: string
      }
      next_rol_itinerary_reference: { Args: never; Returns: string }
      nextval_subscription_invoice_number: { Args: never; Returns: number }
      rebuild_guest_stats: { Args: { _guest_ids?: string[] }; Returns: number }
      resolve_property_owner_uuid: {
        Args: { _property_id: string }
        Returns: string
      }
      rol_origin_code: {
        Args: {
          _booking_channel: string
          _integration_type: string
          _origin_type: string
        }
        Returns: string
      }
      rol_party_code: {
        Args: { _portfolio_id: string; _property_id: string }
        Returns: string
      }
      rol_reference_kind: { Args: { _origin_code: string }; Returns: string }
      rolos_adjust_booked_inventory: {
        Args: {
          _delta: number
          _end_date: string
          _property_id: string
          _room_type_id: string
          _start_date: string
        }
        Returns: undefined
      }
      rolos_apply_block_inventory: {
        Args: {
          _delta: number
          _end_date: string
          _property_id: string
          _room_type_id: string
          _start_date: string
        }
        Returns: undefined
      }
      rolos_convert_block_to_booked: {
        Args: {
          _end_date: string
          _property_id: string
          _room_type_id: string
          _start_date: string
          _units: number
        }
        Returns: undefined
      }
      rolos_hold_block_inventory: {
        Args: {
          _end_date: string
          _property_id: string
          _room_type_id: string
          _start_date: string
          _units: number
        }
        Returns: number
      }
      rolos_room_type_capacity: {
        Args: { _property_id: string; _room_type_id: string }
        Returns: number
      }
      ru_api_log_endpoint_stats: {
        Args: { _hours?: number }
        Returns: {
          action: string
          avg_ms: number
          deferred: number
          direction: string
          failed: number
          last_at: string
          ok: number
          p95_ms: number
          req_bytes: number
          res_bytes: number
          total: number
        }[]
      }
      ru_api_log_facets: {
        Args: { _days?: number }
        Returns: {
          count: number
          kind: string
          value: string
        }[]
      }
      ru_api_log_traffic_pulse: {
        Args: never
        Returns: {
          calls: number
          deferred: number
          failed: number
          inbound: number
          ok: number
          p50_ms: number
          p95_ms: number
          req_bytes: number
          res_bytes: number
          window_minutes: number
        }[]
      }
      ru_claim_queued_call: {
        Args: never
        Returns: {
          action: string
          attempts: number
          claimed_at: string | null
          completed_at: string | null
          created_at: string
          id: string
          last_error: string | null
          max_attempts: number
          method_key: string
          not_before: string
          payload: Json
          priority: number
          property_id: string | null
          result: Json | null
          ru_owner_id: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "ru_call_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      ru_claim_rate_slot: {
        Args: { _action: string; _method_key: string; _window_seconds: number }
        Returns: {
          granted: boolean
          wait_ms: number
        }[]
      }
      ru_enqueue_call: {
        Args: {
          _action: string
          _delay_ms?: number
          _method_key: string
          _payload: Json
          _priority?: number
          _property_id?: string
          _ru_owner_id?: string
        }
        Returns: string
      }
      ru_push_gate_status: {
        Args: { _property_id: string }
        Returns: {
          last_called_at: string
          section: string
          wait_seconds: number
        }[]
      }
      ru_queue_lnm_repull: {
        Args: {
          _change_id?: string
          _change_type?: string
          _date_from?: string
          _date_to?: string
          _kind: string
          _property_id?: string
          _ru_owner_id?: string
          _ru_property_id: string
        }
        Returns: string
      }
      scoped_admin_can_access_portfolio: {
        Args: { _portfolio_id: string; _user_id: string }
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
      suggest_property_ref_code: { Args: { _name: string }; Returns: string }
      sync_portfolio_payment_config: {
        Args: { _portfolio_id: string; _property_id?: string }
        Returns: undefined
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
      validate_onboarding_token: {
        Args: { _token: string }
        Returns: {
          expires_at: string
          id: string
          owner_email: string
          property_id: string
          used_at: string
        }[]
      }
      waive_subscription_charge: {
        Args: { _charge_id: string; _note?: string }
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
        | "void"
      commission_tier: "base" | "accelerated" | "elite"
      component_type: "pms" | "internal" | "external" | "infrastructure"
      crm_account_type: "company" | "travel_agent" | "tour_operator" | "source"
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
      inquiry_status:
        | "new"
        | "contacted"
        | "quoted"
        | "provisional"
        | "confirmed"
        | "lost"
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
      refund_status:
        | "pending"
        | "approved"
        | "processed"
        | "rejected"
        | "failed"
        | "awaiting_guest_choice"
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
        "void",
      ],
      commission_tier: ["base", "accelerated", "elite"],
      component_type: ["pms", "internal", "external", "infrastructure"],
      crm_account_type: ["company", "travel_agent", "tour_operator", "source"],
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
      inquiry_status: [
        "new",
        "contacted",
        "quoted",
        "provisional",
        "confirmed",
        "lost",
      ],
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
      refund_status: [
        "pending",
        "approved",
        "processed",
        "rejected",
        "failed",
        "awaiting_guest_choice",
      ],
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
