alter table public.subscription_invoices drop constraint if exists subscription_invoices_kind_check;
alter table public.subscription_invoices
  add constraint subscription_invoices_kind_check
  check (invoice_kind in ('activation','renewal','once_off'));