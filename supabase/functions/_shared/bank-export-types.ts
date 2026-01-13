// Bank Export System Types - Phase 1 & 2

export type LedgerSourceType = 'booking' | 'adjustment' | 'refund' | 'fee';
export type LedgerStatus = 'pending' | 'eligible' | 'locked' | 'exported' | 'reversed';
export type BatchStatus = 'draft' | 'awaiting_signoff' | 'approved' | 'exported' | 'failed' | 'cancelled';
export type BankProvider = 'standard_bank' | 'absa' | 'fnb' | 'nedbank';
export type ExportLineStatus = 'pending' | 'submitted' | 'confirmed' | 'failed' | 'reversed';
export type SignoffRole = 'fearless_leader' | 'dev';

export interface LedgerEntry {
  id: string;
  source_type: LedgerSourceType;
  source_id: string;
  property_id: string;
  gross_amount: number;
  commission_amount: number;
  net_amount: number;
  commission_rate: number;
  currency: string;
  status: LedgerStatus;
  eligible_at: string | null;
  escrow_release_date: string | null;
  export_batch_id: string | null;
  exported_at: string | null;
  reverses_ledger_id: string | null;
  reversal_reason: string | null;
  created_at: string;
  updated_at: string;
  idempotency_key: string;
  immutable_hash: string;
}

export interface ExportBatch {
  id: string;
  batch_reference: string;
  batch_sequence: number;
  bank_provider: BankProvider;
  export_format: string;
  total_records: number;
  total_amount: number;
  status: BatchStatus;
  created_by: string;
  created_at: string;
  exported_at: string | null;
  exported_by: string | null;
  export_file_url: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  updated_at: string;
}

export interface ExportLine {
  id: string;
  batch_id: string;
  property_id: string;
  beneficiary_name: string;
  bank_name: string;
  branch_code: string;
  account_number_encrypted: string;
  account_number_masked: string;
  amount: number;
  currency: string;
  payment_reference: string;
  ledger_ids: string[];
  ledger_count: number;
  status: ExportLineStatus;
  failure_reason: string | null;
  failure_code: string | null;
  created_at: string;
}

export interface FinancialSignoff {
  id: string;
  batch_id: string;
  user_id: string;
  user_email: string;
  user_role: SignoffRole;
  signed_at: string;
  ip_address: string;
  ip_hash: string;
  user_agent: string | null;
  signature_hash: string;
  acknowledgment_text: string;
}

export interface PropertyBankDetails {
  id: string;
  property_id: string;
  bank_name: string;
  branch_code: string;
  account_holder: string;
  account_number_encrypted: string;
  account_number_masked: string;
  account_type: string | null;
  swift_code: string | null;
  is_verified: boolean;
  verified_at: string | null;
  verified_by: string | null;
  verification_method: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// API Request/Response Types
export type BankExportAction = 
  | 'create_ledger_entry'
  | 'check_eligibility'
  | 'promote_to_eligible'
  | 'get_ledger_summary'
  | 'get_eligible_entries'
  | 'health_check'
  // Phase 2 actions
  | 'create_batch'
  | 'get_batches'
  | 'get_batch_details'
  | 'validate_batch'
  | 'submit_signoff'
  | 'generate_csv'
  | 'cancel_batch';

export interface BankExportRequest {
  action: BankExportAction;
  booking_id?: string;
  ledger_id?: string;
  property_id?: string;
  batch_id?: string;
  bank_provider?: BankProvider;
  property_ids?: string[];
  acknowledgment_text?: string;
  reason?: string;
  status?: BatchStatus;
  filters?: {
    status?: LedgerStatus;
    property_id?: string;
    date_from?: string;
    date_to?: string;
  };
}

export interface BankExportResponse<T = unknown> {
  success: boolean;
  data: T | null;
  error: {
    code: string;
    message: string;
    details?: unknown;
  } | null;
  source: 'bank_export';
  fetched_at: string;
  action: string;
}

// Eligibility Result
export interface EligibilityResult {
  is_eligible: boolean;
  failed_rules: string[];
  passed_rules: string[];
  eligible_amount: number;
  ledger_id: string;
}

// Ledger Summary for Dashboard
export interface LedgerSummary {
  total_pending: number;
  total_pending_amount: number;
  total_eligible: number;
  total_eligible_amount: number;
  total_exported: number;
  total_exported_amount: number;
  by_property: Array<{
    property_id: string;
    property_name: string;
    pending_count: number;
    pending_amount: number;
    eligible_count: number;
    eligible_amount: number;
  }>;
}

// Booking type for ledger creation
export interface BookingForLedger {
  id: string;
  property_id: string;
  total_price: number;
  calculated_commission: number | null;
  commission_rate_applied: number | null;
  check_out_date: string;
  status: string;
  payment_status: string | null;
}

// Batch Validation Result
export interface BatchValidationResult {
  batch_id: string;
  is_valid: boolean;
  errors: string[];
  warnings: string[];
  total_amount: number;
  record_count: number;
}

// Batch Details Response
export interface BatchDetailsResponse {
  batch: ExportBatch & {
    profiles?: { email: string; full_name: string };
  };
  lines: (ExportLine & { properties?: { name: string } })[];
  signoffs: FinancialSignoff[];
  has_dev_signoff: boolean;
  has_fl_signoff: boolean;
}

// CSV Generation Response
export interface CSVGenerationResponse {
  csv_content: string;
  filename: string;
  total_amount: number;
  record_count: number;
}

// Create Batch Response
export interface CreateBatchResponse {
  batch: ExportBatch;
  lines: ExportLine[];
  skipped_properties: Array<{ property_id: string; reason: string }>;
}
