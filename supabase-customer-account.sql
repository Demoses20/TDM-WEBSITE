-- TDM customer account expansion
-- Uses the existing auth.users UUID as the customer id.

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Delivery',
  address text not null,
  city text, state text, country text default 'Nigeria',
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.saved_payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  method_type text not null,
  display_name text not null,
  provider_reference text,
  last4 text,
  metadata jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.affiliates (
  user_id uuid primary key references auth.users(id) on delete cascade,
  affiliate_code text unique not null,
  status text not null default 'active',
  reward_balance numeric(14,2) not null default 0,
  lifetime_rewards numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.affiliate_products (
  id uuid primary key default gen_random_uuid(),
  product_id text not null,
  product_name text not null,
  commission_rate numeric(6,2) not null default 5,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.affiliate_withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(14,2) not null check(amount > 0),
  payout_method text not null,
  payout_account jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.customer_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null default 'account',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Optional order tracking number. Run this once if Orders already exists.
alter table if exists public."Orders" add column if not exists tracking_number text;
alter table if exists public."Orders" add column if not exists payment_status text default 'unpaid';

-- RLS
alter table public.customer_addresses enable row level security;
alter table public.saved_payment_methods enable row level security;
alter table public.affiliates enable row level security;
alter table public.affiliate_products enable row level security;
alter table public.affiliate_withdrawals enable row level security;
alter table public.customer_notifications enable row level security;

-- Customer-owned policies. Drop/recreate makes this script rerunnable.
drop policy if exists "customer_addresses_select" on public.customer_addresses;
create policy "customer_addresses_select" on public.customer_addresses for select to authenticated using (auth.uid() = user_id);
drop policy if exists "customer_addresses_insert" on public.customer_addresses;
create policy "customer_addresses_insert" on public.customer_addresses for insert to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "customer_addresses_update" on public.customer_addresses;
create policy "customer_addresses_update" on public.customer_addresses for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "customer_addresses_delete" on public.customer_addresses;
create policy "customer_addresses_delete" on public.customer_addresses for delete to authenticated using (auth.uid() = user_id);
drop policy if exists "saved_payment_methods_select" on public.saved_payment_methods;
create policy "saved_payment_methods_select" on public.saved_payment_methods for select to authenticated using (auth.uid() = user_id);
drop policy if exists "saved_payment_methods_insert" on public.saved_payment_methods;
create policy "saved_payment_methods_insert" on public.saved_payment_methods for insert to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "saved_payment_methods_update" on public.saved_payment_methods;
create policy "saved_payment_methods_update" on public.saved_payment_methods for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "saved_payment_methods_delete" on public.saved_payment_methods;
create policy "saved_payment_methods_delete" on public.saved_payment_methods for delete to authenticated using (auth.uid() = user_id);
drop policy if exists "affiliates_select" on public.affiliates;
create policy "affiliates_select" on public.affiliates for select to authenticated using (auth.uid() = user_id);
drop policy if exists "affiliates_insert" on public.affiliates;
create policy "affiliates_insert" on public.affiliates for insert to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "affiliates_update" on public.affiliates;
create policy "affiliates_update" on public.affiliates for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "affiliate_withdrawals_select" on public.affiliate_withdrawals;
create policy "affiliate_withdrawals_select" on public.affiliate_withdrawals for select to authenticated using (auth.uid() = user_id);
drop policy if exists "affiliate_withdrawals_insert" on public.affiliate_withdrawals;
create policy "affiliate_withdrawals_insert" on public.affiliate_withdrawals for insert to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "customer_notifications_select" on public.customer_notifications;
create policy "customer_notifications_select" on public.customer_notifications for select to authenticated using (auth.uid() = user_id);
drop policy if exists "customer_notifications_update" on public.customer_notifications;
create policy "customer_notifications_update" on public.customer_notifications for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Affiliate product catalog is public to authenticated customers.
drop policy if exists "affiliate_products_select" on public.affiliate_products;
create policy "affiliate_products_select" on public.affiliate_products for select to authenticated using (active = true);

-- Never store raw card numbers or CVV. Save only provider/token references and masked details.
