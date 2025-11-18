-- Create role enum
create type public.app_role as enum ('admin', 'user');

-- Create user_roles table
create table public.user_roles (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade not null,
    role app_role not null,
    unique (user_id, role)
);

-- Enable RLS
alter table public.user_roles enable row level security;

-- Create security definer function to check roles
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  )
$$;

-- RLS policies for user_roles
create policy "Users can view their own roles"
on public.user_roles
for select
to authenticated
using (auth.uid() = user_id);

create policy "Admins can manage all roles"
on public.user_roles
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

-- Create api_keys table for storing integration keys
create table public.api_keys (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    key_name text not null unique,
    key_value text,
    is_required boolean default false,
    description text,
    system_type text,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- Enable RLS
alter table public.api_keys enable row level security;

-- Only admins can view and manage API keys
create policy "Admins can view api keys"
on public.api_keys
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can insert api keys"
on public.api_keys
for insert
to authenticated
with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins can update api keys"
on public.api_keys
for update
to authenticated
using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can delete api keys"
on public.api_keys
for delete
to authenticated
using (public.has_role(auth.uid(), 'admin'));

-- Add trigger for updated_at
create trigger update_api_keys_updated_at
before update on public.api_keys
for each row
execute function public.update_updated_at_column();

-- Insert default required API keys as placeholders
insert into public.api_keys (name, key_name, key_value, is_required, description, system_type) values
('NightsBridge API Key', 'nightsbridge_api_key', 'placeholder_key_nightsbridge', true, 'API key for NightsBridge property management system', 'nightsbridge'),
('Checkfront API Key', 'checkfront_api_key', 'placeholder_key_checkfront', true, 'API key for Checkfront booking system', 'checkfront'),
('Stripe Secret Key', 'stripe_secret_key', 'placeholder_key_stripe', true, 'Secret key for Stripe payment processing', 'stripe'),
('Google Maps API Key', 'google_maps_api_key', 'placeholder_key_google_maps', false, 'API key for Google Maps integration', 'google'),
('SendGrid API Key', 'sendgrid_api_key', 'placeholder_key_sendgrid', false, 'API key for email notifications', 'sendgrid');