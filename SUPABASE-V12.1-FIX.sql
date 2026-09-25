-- TDM V12.1 SUPABASE FIX / MIGRATION
-- Project: ctdmpigyhinaqpicbycq
-- Run this whole file once in Supabase SQL Editor.
-- It is safe to re-run because the additions use IF NOT EXISTS.

-- ============================================================
-- 1. Orders: fields required by V12 checkout and order screens
-- ============================================================
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

-- Helpful indexes for a growing order list.
create index if not exists orders_user_id_created_at_idx
  on public."Orders" (user_id, created_at desc);
create index if not exists orders_status_created_at_idx
  on public."Orders" (status, created_at desc);

-- ============================================================
-- 2. Product media: multiple images/videos per product
-- ============================================================
alter table if exists public.products
  add column if not exists media_urls jsonb not null default '[]'::jsonb;

-- ============================================================
-- 3. Home front-board / advertisement
-- ============================================================
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
insert into public.home_banners(id,mode,active)
values (1,'auto',true)
on conflict (id) do nothing;

-- ============================================================
-- 4. Global shipping settings
-- ============================================================
create table if not exists public.shipping_settings (
  id integer primary key default 1 check (id=1),
  base_fee numeric(14,2) not null default 0,
  per_km_fee numeric(14,2) not null default 0,
  packaging_fee numeric(14,2) not null default 0,
  clearance_fee numeric(14,2) not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.shipping_settings(id)
values (1)
on conflict (id) do nothing;

-- ============================================================
-- 5. Address-based shipping zones
-- ============================================================
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
create index if not exists shipping_zones_active_idx
  on public.shipping_zones (active);

-- ============================================================
-- 6. RLS for V12 tables
-- ============================================================
alter table public.home_banners enable row level security;
alter table public.shipping_settings enable row level security;
alter table public.shipping_zones enable row level security;

-- Public customers can read active front-board/shipping configuration.
drop policy if exists "home_banners_public_read" on public.home_banners;
create policy "home_banners_public_read"
on public.home_banners for select
using (active = true);

drop policy if exists "shipping_settings_public_read" on public.shipping_settings;
create policy "shipping_settings_public_read"
on public.shipping_settings for select
using (true);

drop policy if exists "shipping_zones_public_read" on public.shipping_zones;
create policy "shipping_zones_public_read"
on public.shipping_zones for select
using (active = true);

-- TDM admin account.
drop policy if exists "home_banners_admin_write" on public.home_banners;
create policy "home_banners_admin_write"
on public.home_banners for all to authenticated
using ((auth.jwt()->>'email') = 'technicaldemoses@gmail.com')
with check ((auth.jwt()->>'email') = 'technicaldemoses@gmail.com');

drop policy if exists "shipping_settings_admin_write" on public.shipping_settings;
create policy "shipping_settings_admin_write"
on public.shipping_settings for all to authenticated
using ((auth.jwt()->>'email') = 'technicaldemoses@gmail.com')
with check ((auth.jwt()->>'email') = 'technicaldemoses@gmail.com');

drop policy if exists "shipping_zones_admin_write" on public.shipping_zones;
create policy "shipping_zones_admin_write"
on public.shipping_zones for all to authenticated
using ((auth.jwt()->>'email') = 'technicaldemoses@gmail.com')
with check ((auth.jwt()->>'email') = 'technicaldemoses@gmail.com');

-- Customer order creation and admin order management.
drop policy if exists "orders_customer_insert" on public."Orders";
create policy "orders_customer_insert"
on public."Orders" for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "orders_admin_all" on public."Orders";
create policy "orders_admin_all"
on public."Orders" for all to authenticated
using ((auth.jwt()->>'email') = 'technicaldemoses@gmail.com')
with check ((auth.jwt()->>'email') = 'technicaldemoses@gmail.com');

-- ============================================================
-- 7. Public product media storage bucket
-- ============================================================
insert into storage.buckets (id,name,public)
values ('tdm-media','tdm-media',true)
on conflict (id) do update set public=true;

drop policy if exists "tdm_media_public_read" on storage.objects;
create policy "tdm_media_public_read"
on storage.objects for select
using (bucket_id='tdm-media');

drop policy if exists "tdm_media_admin_insert" on storage.objects;
create policy "tdm_media_admin_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id='tdm-media'
  and (auth.jwt()->>'email')='technicaldemoses@gmail.com'
);

drop policy if exists "tdm_media_admin_update" on storage.objects;
create policy "tdm_media_admin_update"
on storage.objects for update to authenticated
using (
  bucket_id='tdm-media'
  and (auth.jwt()->>'email')='technicaldemoses@gmail.com'
)
with check (
  bucket_id='tdm-media'
  and (auth.jwt()->>'email')='technicaldemoses@gmail.com'
);

-- ============================================================
-- 8. Verification: these should return rows after the migration
-- ============================================================
select column_name, data_type
from information_schema.columns
where table_schema='public'
  and table_name='Orders'
  and column_name in (
    'shipping_address','shipping_city','shipping_state','shipping_country',
    'shipping_distance_km','transportation_fee','packaging_fee','clearance_fee',
    'shipping_fee','checkout_total','customer_name','customer_phone',
    'tracking_number','payment_status'
  )
order by column_name;

select table_name
from information_schema.tables
where table_schema='public'
  and table_name in ('home_banners','shipping_settings','shipping_zones')
order by table_name;
