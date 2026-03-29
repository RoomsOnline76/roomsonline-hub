

# Sales Rep / Referral Partner System Enhancement

## Overview

Five interconnected changes to create a complete referral partner lifecycle: role assignment, banking details, contract agreement, and commission inclusion in the payments report.

## 1. Add `sales_rep` Role to the System

**Database**: Add `sales_rep` to the `app_role` enum via migration.

**Access Requests** (`AdminAccessRequests.tsx`): Currently the approve dropdown only offers "admin" and "user". Add a third option: "Sales Rep / Referral Partner" which assigns the `sales_rep` role and auto-creates a `sales_reps` record linked to the user.

**AddUserModal** (`AddUserModal.tsx`): Extend the `role` prop to accept `"sales_rep"`. When this role is selected, skip the PMS system selection and instead show commission tier selection (Base/Accelerated/Elite) and rep code field.

## 2. Banking Details for Sales Reps

**Database**: Create `sales_rep_bank_details` table (mirrors `property_bank_details` structure):
- `id`, `rep_id` (FK → sales_reps), `bank_name`, `branch_code`, `account_holder`, `account_number_encrypted`, `account_number_masked`, `account_type`, `swift_code`, `is_verified`, `verified_at`, `verified_by`, `created_at`, `updated_at`
- RLS: admins/devs/fearless_leader can read/write; the rep's own `user_id` can read their own record

**UI** (`AdminSalesReps.tsx`): Add a "Banking" section to each rep card (or the edit dialog) with fields for bank name, branch code, account holder, account number, account type. Account number is masked on display, editable only by admin+.

## 3. Sales Rep / Referral Partner Agreement Contract

**Database**: Insert a new `contract_templates` row — "Referral Partner Agreement" — with a first version containing:
- **Section 1**: Parties (ROL + Partner details with `{{rep_name}}`, `{{rep_email}}`, `{{rep_code}}`)
- **Section 2**: Referral Scope — Partner refers properties to ROL; ROL manages onboarding
- **Section 3**: Commission Terms — Uses the existing tier structure:
  - `{{commission_tier_label}}` (Base/Accelerated/Elite)
  - `{{first_year_rate}}` — first year commission %
  - `{{residual_rate}}` — residual commission %
  - `{{residual_duration}}` — months of residual
  - `{{clawback_period}}` — days (default 90)
- **Section 4**: Payment Terms — Monthly, 14-day payment cycle, banking details on file
- **Section 5**: Clawback Clause — If referred property churns within `{{clawback_period}}` days
- **Section 6**: Confidentiality + Non-Compete
- **Section 7**: Term + Termination (12-month initial, 30-day notice)

**Admin Contracts page** (`AdminContracts.tsx`): When issuing a contract, if the recipient type is "Sales Rep", pre-populate variables from `sales_reps` record and commission tier rates.

## 4. Commission Payouts in Payments Report

**AdminPayments.tsx**: Add a "Commission Payouts" tab/section that:
- Fetches `rep_commission_reports` where `status = 'approved'` (ready to pay)
- Shows rep name, period, total amount, banking status (verified/unverified)
- Allows fearless_leader to mark as paid (updates status to 'paid' + sets `paid_at`)
- Summary card at top showing total commissions due this month

This surfaces commission obligations alongside property payment transactions so the fearless leader sees all outgoing payments in one place.

## 5. Link Sales Rep User to Their Dashboard

When a user with `sales_rep` role logs in, they should see a "My Referrals" section in their dashboard showing their referred properties, commission status, and banking details. This is a lighter future enhancement — the immediate priority is admin-side management.

## Technical Details

### Migration SQL
```sql
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sales_rep';

CREATE TABLE public.sales_rep_bank_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id uuid REFERENCES public.sales_reps(id) ON DELETE CASCADE NOT NULL UNIQUE,
  bank_name text NOT NULL,
  branch_code text,
  account_holder text NOT NULL,
  account_number_encrypted bytea,
  account_number_masked text,
  account_type text DEFAULT 'cheque',
  swift_code text,
  is_verified boolean DEFAULT false,
  verified_at timestamptz,
  verified_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.sales_rep_bank_details ENABLE ROW LEVEL SECURITY;

-- Admin/dev/FL full access
CREATE POLICY "Admins manage rep banking" ON public.sales_rep_bank_details
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev') OR has_role(auth.uid(), 'fearless_leader'));

-- Rep can view own banking
CREATE POLICY "Rep views own banking" ON public.sales_rep_bank_details
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sales_reps WHERE id = rep_id AND user_id = auth.uid()
  ));
```

### Contract template insert (via insert tool, not migration)
Insert into `contract_templates` + `contract_template_versions` with the referral partner agreement content and variables schema.

## Files

| Action | File |
|--------|------|
| Migration | Add `sales_rep` to `app_role` enum, create `sales_rep_bank_details` table |
| DB Insert | New "Referral Partner Agreement" contract template + v1 content |
| Modify | `src/pages/AdminAccessRequests.tsx` — add "Sales Rep" approve option |
| Modify | `src/components/AddUserModal.tsx` — support `sales_rep` role with tier/code fields |
| Modify | `src/pages/AdminSalesReps.tsx` — add banking details section to rep cards/edit |
| Create | `src/hooks/useRepBankDetails.ts` — CRUD hook for rep banking |
| Modify | `src/pages/AdminPayments.tsx` — add Commission Payouts section |
| Modify | `src/pages/AdminContracts.tsx` — support issuing referral partner agreements |

