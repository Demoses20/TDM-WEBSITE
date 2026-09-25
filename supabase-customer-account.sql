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


-- TDM V12 storefront, front-board and checkout/shipping additions.
-- Run this block once in Supabase SQL Editor.

alter table if exists public.products add column if not exists media_urls jsonb not null default '[]'::jsonb;

create table if not exists public.home_banners (
  id integer primary key default 1 check (id=1),
  mode text not null default 'auto' check (mode in ('auto','custom')),
  kicker text,
  title text,
  description text,
  media_url text,
  cta_text text default 'View Store',
  cta_url text default 'product.html',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.home_banners(id,mode,active) values(1,'auto',true) on conflict(id) do nothing;

create table if not exists public.shipping_settings (
  id integer primary key default 1 check (id=1),
  base_fee numeric(14,2) not null default 0,
  per_km_fee numeric(14,2) not null default 0,
  packaging_fee numeric(14,2) not null default 0,
  clearance_fee numeric(14,2) not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.shipping_settings(id) values(1) on conflict(id) do nothing;

alter table if exists public."Orders" add column if not exists product_id text;
alter table if exists public."Orders" add column if not exists shipping_address text;
alter table if exists public."Orders" add column if not exists shipping_city text;
alter table if exists public."Orders" add column if not exists shipping_state text;
alter table if exists public."Orders" add column if not exists shipping_country text default 'Nigeria';
alter table if exists public."Orders" add column if not exists shipping_distance_km numeric(10,2) default 0;
alter table if exists public."Orders" add column if not exists transportation_fee numeric(14,2) default 0;
alter table if exists public."Orders" add column if not exists packaging_fee numeric(14,2) default 0;
alter table if exists public."Orders" add column if not exists clearance_fee numeric(14,2) default 0;
alter table if exists public."Orders" add column if not exists shipping_fee numeric(14,2) default 0;
alter table if exists public."Orders" add column if not exists checkout_total numeric(14,2);
alter table if exists public."Orders" add column if not exists customer_name text;
alter table if exists public."Orders" add column if not exists customer_phone text;
alter table if exists public."Orders" add column if not exists tracking_number text;
alter table if exists public."Orders" add column if not exists payment_status text default 'unpaid';

alter table public.home_banners enable row level security;
alter table public.shipping_settings enable row level security;

drop policy if exists "home_banners_public_read" on public.home_banners;
create policy "home_banners_public_read" on public.home_banners for select using (active = true);
drop policy if exists "home_banners_admin_write" on public.home_banners;
create policy "home_banners_admin_write" on public.home_banners for all to authenticated using ((auth.jwt()->>'email') = 'technicaldemoses@gmail.com') with check ((auth.jwt()->>'email') = 'technicaldemoses@gmail.com');

drop policy if exists "shipping_settings_public_read" on public.shipping_settings;
create policy "shipping_settings_public_read" on public.shipping_settings for select using (true);
drop policy if exists "shipping_settings_admin_write" on public.shipping_settings;
create policy "shipping_settings_admin_write" on public.shipping_settings for all to authenticated using ((auth.jwt()->>'email') = 'technicaldemoses@gmail.com') with check ((auth.jwt()->>'email') = 'technicaldemoses@gmail.com');

drop policy if exists "orders_customer_insert" on public."Orders";
create policy "orders_customer_insert" on public."Orders" for insert to authenticated with check (auth.uid() = user_id);

-- Admin can read/update orders and products through the dashboard.
drop policy if exists "orders_admin_all" on public."Orders";
create policy "orders_admin_all" on public."Orders" for all to authenticated using ((auth.jwt()->>'email') = 'technicaldemoses@gmail.com') with check ((auth.jwt()->>'email') = 'technicaldemoses@gmail.com');

-- Allow the existing customer-facing product catalog to read media_urls.
-- Storage bucket for product media (create it manually if it already exists; this statement is safe to run only when permitted by your project):
insert into storage.buckets (id,name,public) values ('tdm-media','tdm-media',true) on conflict (id) do update set public=true;

drop policy if exists "tdm_media_public_read" on storage.objects;
create policy "tdm_media_public_read" on storage.objects for select using (bucket_id='tdm-media');
drop policy if exists "tdm_media_admin_insert" on storage.objects;
create policy "tdm_media_admin_insert" on storage.objects for insert to authenticated with check (bucket_id='tdm-media' and (auth.jwt()->>'email')='technicaldemoses@gmail.com');
drop policy if exists "tdm_media_admin_update" on storage.objects;
create policy "tdm_media_admin_update" on storage.objects for update to authenticated using (bucket_id='tdm-media' and (auth.jwt()->>'email')='technicaldemoses@gmail.com') with check (bucket_id='tdm-media' and (auth.jwt()->>'email')='technicaldemoses@gmail.com');


create table if not exists public.shipping_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  match_text text not null,
  base_fee numeric(14,2) not null default 0,
  per_km_fee numeric(14,2) not null default 0,
  clearance_fee numeric(14,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.shipping_zones enable row level security;
drop policy if exists "shipping_zones_public_read" on public.shipping_zones;
create policy "shipping_zones_public_read" on public.shipping_zones for select using (active=true);
drop policy if exists "shipping_zones_admin_write" on public.shipping_zones;
create policy "shipping_zones_admin_write" on public.shipping_zones for all to authenticated using ((auth.jwt()->>'email')='technicaldemoses@gmail.com') with check ((auth.jwt()->>'email')='technicaldemoses@gmail.com');

-- TDM Manufacturing V12.2 customer notification + profile fix
-- Run once in Supabase SQL Editor. Safe to run more than once.

-- 1) Customer notifications table
create table if not exists public.customer_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null default 'account',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.customer_notifications enable row level security;

drop policy if exists "customer_notifications_select" on public.customer_notifications;
create policy "customer_notifications_select"
on public.customer_notifications for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "customer_notifications_update" on public.customer_notifications;
create policy "customer_notifications_update"
on public.customer_notifications for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- 2) Let authenticated customers upload profile pictures only into their own folder.
-- The bucket is public so the saved avatar URL can be displayed by the app.
insert into storage.buckets (id, name, public)
values ('tdm-media', 'tdm-media', true)
on conflict (id) do update set public = true;

drop policy if exists "tdm_media_customer_profile_insert" on storage.objects;
create policy "tdm_media_customer_profile_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'tdm-media'
  and (storage.foldername(name))[1] = 'profiles'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "tdm_media_customer_profile_update" on storage.objects;
create policy "tdm_media_customer_profile_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'tdm-media'
  and (storage.foldername(name))[1] = 'profiles'
  and (storage.foldername(name))[2] = auth.uid()::text
)
with check (
  bucket_id = 'tdm-media'
  and (storage.foldername(name))[1] = 'profiles'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "tdm_media_customer_profile_delete" on storage.objects;
create policy "tdm_media_customer_profile_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'tdm-media'
  and (storage.foldername(name))[1] = 'profiles'
  and (storage.foldername(name))[2] = auth.uid()::text
);

-- 3) Notify customers when their order is created or its status/payment changes.
create or replace function public.tdm_order_customer_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.user_id is not null then
      insert into public.customer_notifications(user_id,title,message,type)
      values (
        new.user_id,
        'Order received',
        'Your order ' || coalesce(new.id::text,'') || ' has been received by TDM Manufacturing.',
        'order'
      );
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.user_id is not null then
    if coalesce(new.status,'') is distinct from coalesce(old.status,'') then
      insert into public.customer_notifications(user_id,title,message,type)
      values (
        new.user_id,
        'Order status updated',
        'Your order ' || coalesce(new.id::text,'') || ' is now ' || coalesce(new.status,'Updated') || '.',
        'order'
      );
    end if;

    if coalesce(new.payment_status,'') is distinct from coalesce(old.payment_status,'') then
      insert into public.customer_notifications(user_id,title,message,type)
      values (
        new.user_id,
        'Payment status updated',
        'Payment for order ' || coalesce(new.id::text,'') || ' is now ' || coalesce(new.payment_status,'Updated') || '.',
        'payment'
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tdm_order_customer_notification on public."Orders";
create trigger tdm_order_customer_notification
after insert or update of status, payment_status on public."Orders"
for each row execute function public.tdm_order_customer_notification();

-- 4) Enable realtime for the notification table when the publication exists.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'customer_notifications'
    ) then
      execute 'alter publication supabase_realtime add table public.customer_notifications';
    end if;
  end if;
end $$;

-- 4) Give the current customer a test notification only when the table is empty for them.
-- This makes it easy to verify the Notifications page immediately after running the SQL.
-- Remove this INSERT if you do not want the test message.
insert into public.customer_notifications(user_id,title,message,type)
select auth.uid(), 'Notifications enabled', 'Your TDM customer notifications are now connected.', 'account'
where auth.uid() is not null
  and not exists (
    select 1 from public.customer_notifications where user_id = auth.uid()
  );

-- Verification
select table_name
from information_schema.tables
where table_schema='public'
  and table_name='customer_notifications';

select column_name, data_type
from information_schema.columns
where table_schema='public'
  and table_name='customer_notifications'
order by ordinal_position;
