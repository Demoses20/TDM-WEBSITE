-- TDM Manufacturing V12.4 FINAL FIX
-- Run this whole file once in Supabase SQL Editor.
-- Safe to rerun where possible. This migration fixes customer profile/address saves,
-- checkout customer_id errors, notifications, media storage, shipping, and affiliate tracking.

-- 1. Customer profile columns and RLS
alter table if exists public."Customers" add column if not exists home_address text;
alter table if exists public."Customers" add column if not exists delivery_address text;
alter table if exists public."Customers" add column if not exists avatar_url text;
alter table if exists public."Customers" add column if not exists updated_at timestamptz default now();
alter table if exists public."Orders" add column if not exists user_id uuid;
alter table if exists public."Orders" add column if not exists customer_id uuid;
alter table if exists public."Orders" add column if not exists affiliate_code text;

-- Existing Orders rows must not block the migration. New customer checkout will fill both IDs.
-- If customer_id is currently NOT NULL, the app now supplies it from auth.uid().
create index if not exists orders_customer_id_idx on public."Orders"(customer_id);

alter table if exists public."Customers" enable row level security;
drop policy if exists "customers_self_select" on public."Customers";
create policy "customers_self_select" on public."Customers" for select to authenticated using (auth.uid() = id);
drop policy if exists "customers_self_insert" on public."Customers";
create policy "customers_self_insert" on public."Customers" for insert to authenticated with check (auth.uid() = id);
drop policy if exists "customers_self_update" on public."Customers";
create policy "customers_self_update" on public."Customers" for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "customers_admin_all" on public."Customers";
create policy "customers_admin_all" on public."Customers" for all to authenticated using ((auth.jwt()->>'email')='technicaldemoses@gmail.com') with check ((auth.jwt()->>'email')='technicaldemoses@gmail.com');

-- 2. Saved customer addresses (the checkout screenshot showed this table missing)
create table if not exists public.customer_addresses (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 label text not null default 'Delivery', address text not null,
 city text, state text, country text default 'Nigeria',
 is_default boolean not null default false, created_at timestamptz not null default now()
);
alter table public.customer_addresses enable row level security;
drop policy if exists "customer_addresses_select" on public.customer_addresses;
create policy "customer_addresses_select" on public.customer_addresses for select to authenticated using(auth.uid()=user_id);
drop policy if exists "customer_addresses_insert" on public.customer_addresses;
create policy "customer_addresses_insert" on public.customer_addresses for insert to authenticated with check(auth.uid()=user_id);
drop policy if exists "customer_addresses_update" on public.customer_addresses;
create policy "customer_addresses_update" on public.customer_addresses for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists "customer_addresses_delete" on public.customer_addresses;
create policy "customer_addresses_delete" on public.customer_addresses for delete to authenticated using(auth.uid()=user_id);

-- 3. Notifications
create table if not exists public.customer_notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 title text not null, message text not null, type text not null default 'account',
 is_read boolean not null default false, created_at timestamptz not null default now()
);
alter table public.customer_notifications enable row level security;
drop policy if exists "customer_notifications_select" on public.customer_notifications;
create policy "customer_notifications_select" on public.customer_notifications for select to authenticated using(auth.uid()=user_id);
drop policy if exists "customer_notifications_update" on public.customer_notifications;
create policy "customer_notifications_update" on public.customer_notifications for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);

create or replace function public.tdm_order_customer_notification()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='INSERT' and new.user_id is not null then
   insert into public.customer_notifications(user_id,title,message,type) values(new.user_id,'Order received','Your order has been received by TDM Manufacturing.','order');
 elsif tg_op='UPDATE' and new.user_id is not null then
   if coalesce(new.status,'') is distinct from coalesce(old.status,'') then
     insert into public.customer_notifications(user_id,title,message,type) values(new.user_id,'Order status updated','Your order is now '||coalesce(new.status,'Updated')||'.','order');
   end if;
   if coalesce(new.payment_status,'') is distinct from coalesce(old.payment_status,'') then
     insert into public.customer_notifications(user_id,title,message,type) values(new.user_id,'Payment status updated','Your payment status is now '||coalesce(new.payment_status,'Updated')||'.','payment');
   end if;
 end if; return new;
end; $$;
drop trigger if exists tdm_order_customer_notification on public."Orders";
create trigger tdm_order_customer_notification after insert or update of status,payment_status on public."Orders" for each row execute function public.tdm_order_customer_notification();

-- 4. Shipping settings/zones
create table if not exists public.shipping_settings(
 id integer primary key default 1 check(id=1), base_fee numeric(14,2) not null default 0,
 per_km_fee numeric(14,2) not null default 0, packaging_fee numeric(14,2) not null default 0,
 clearance_fee numeric(14,2) not null default 0, updated_at timestamptz not null default now()
);
insert into public.shipping_settings(id) values(1) on conflict(id) do nothing;
alter table public.shipping_settings enable row level security;
drop policy if exists "shipping_settings_public_read" on public.shipping_settings;
create policy "shipping_settings_public_read" on public.shipping_settings for select using(true);
drop policy if exists "shipping_settings_admin_write" on public.shipping_settings;
create policy "shipping_settings_admin_write" on public.shipping_settings for all to authenticated using((auth.jwt()->>'email')='technicaldemoses@gmail.com') with check((auth.jwt()->>'email')='technicaldemoses@gmail.com');

create table if not exists public.shipping_zones(
 id uuid primary key default gen_random_uuid(), name text not null, match_text text not null,
 base_fee numeric(14,2) not null default 0, per_km_fee numeric(14,2) not null default 0,
 clearance_fee numeric(14,2) not null default 0, active boolean not null default true, created_at timestamptz not null default now()
);
alter table public.shipping_zones enable row level security;
drop policy if exists "shipping_zones_public_read" on public.shipping_zones;
create policy "shipping_zones_public_read" on public.shipping_zones for select using(active=true);
drop policy if exists "shipping_zones_admin_write" on public.shipping_zones;
create policy "shipping_zones_admin_write" on public.shipping_zones for all to authenticated using((auth.jwt()->>'email')='technicaldemoses@gmail.com') with check((auth.jwt()->>'email')='technicaldemoses@gmail.com');

-- 5. Order fields and customer insert policy
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
drop policy if exists "orders_customer_insert" on public."Orders";
create policy "orders_customer_insert" on public."Orders" for insert to authenticated with check(auth.uid()=user_id and auth.uid()=customer_id);
drop policy if exists "orders_customer_select" on public."Orders";
create policy "orders_customer_select" on public."Orders" for select to authenticated using(auth.uid()=user_id or (auth.jwt()->>'email')='technicaldemoses@gmail.com');
drop policy if exists "orders_admin_all" on public."Orders";
create policy "orders_admin_all" on public."Orders" for all to authenticated using((auth.jwt()->>'email')='technicaldemoses@gmail.com') with check((auth.jwt()->>'email')='technicaldemoses@gmail.com');

-- 6. Storage for product/banner/profile media
insert into storage.buckets(id,name,public) values('tdm-media','tdm-media',true) on conflict(id) do update set public=true;
drop policy if exists "tdm_media_public_read" on storage.objects;
create policy "tdm_media_public_read" on storage.objects for select using(bucket_id='tdm-media');
drop policy if exists "tdm_media_admin_insert" on storage.objects;
create policy "tdm_media_admin_insert" on storage.objects for insert to authenticated with check(bucket_id='tdm-media' and (auth.jwt()->>'email')='technicaldemoses@gmail.com');
drop policy if exists "tdm_media_admin_update" on storage.objects;
create policy "tdm_media_admin_update" on storage.objects for update to authenticated using(bucket_id='tdm-media' and (auth.jwt()->>'email')='technicaldemoses@gmail.com') with check(bucket_id='tdm-media' and (auth.jwt()->>'email')='technicaldemoses@gmail.com');
drop policy if exists "tdm_media_admin_delete" on storage.objects;
create policy "tdm_media_admin_delete" on storage.objects for delete to authenticated using(bucket_id='tdm-media' and (auth.jwt()->>'email')='technicaldemoses@gmail.com');

-- Customer profile media policies
 drop policy if exists "tdm_media_customer_profile_insert" on storage.objects;
create policy "tdm_media_customer_profile_insert" on storage.objects for insert to authenticated with check(bucket_id='tdm-media' and (storage.foldername(name))[1]='profiles' and (storage.foldername(name))[2]=auth.uid()::text);
drop policy if exists "tdm_media_customer_profile_update" on storage.objects;
create policy "tdm_media_customer_profile_update" on storage.objects for update to authenticated using(bucket_id='tdm-media' and (storage.foldername(name))[1]='profiles' and (storage.foldername(name))[2]=auth.uid()::text) with check(bucket_id='tdm-media' and (storage.foldername(name))[1]='profiles' and (storage.foldername(name))[2]=auth.uid()::text);
drop policy if exists "tdm_media_customer_profile_delete" on storage.objects;
create policy "tdm_media_customer_profile_delete" on storage.objects for delete to authenticated using(bucket_id='tdm-media' and (storage.foldername(name))[1]='profiles' and (storage.foldername(name))[2]=auth.uid()::text);

alter table if exists public.products add column if not exists media_urls jsonb not null default '[]'::jsonb;
create table if not exists public.home_banners(id integer primary key default 1 check(id=1),mode text not null default 'auto' check(mode in('auto','custom')),kicker text,title text,description text,media_url text,cta_text text default 'View Store',cta_url text default 'product.html',active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
insert into public.home_banners(id,mode,active) values(1,'auto',true) on conflict(id) do nothing;
alter table public.home_banners enable row level security;
drop policy if exists "home_banners_public_read" on public.home_banners;
create policy "home_banners_public_read" on public.home_banners for select using(active=true);
drop policy if exists "home_banners_admin_write" on public.home_banners;
create policy "home_banners_admin_write" on public.home_banners for all to authenticated using((auth.jwt()->>'email')='technicaldemoses@gmail.com') with check((auth.jwt()->>'email')='technicaldemoses@gmail.com');

-- 7. Affiliate system
create table if not exists public.affiliates(user_id uuid primary key references auth.users(id) on delete cascade,affiliate_code text unique not null,status text not null default 'active',reward_balance numeric(14,2) not null default 0,lifetime_rewards numeric(14,2) not null default 0,payout_account jsonb not null default '{}'::jsonb,created_at timestamptz not null default now());
create table if not exists public.affiliate_products(id uuid primary key default gen_random_uuid(),product_id text not null,product_name text not null,commission_rate numeric(6,2) not null default 5,active boolean not null default true,created_at timestamptz not null default now());
create table if not exists public.affiliate_clicks(id uuid primary key default gen_random_uuid(),affiliate_user_id uuid references auth.users(id) on delete set null,affiliate_code text not null,product_id text,created_at timestamptz not null default now());
create table if not exists public.affiliate_commissions(id uuid primary key default gen_random_uuid(),affiliate_user_id uuid not null references auth.users(id) on delete cascade,order_id uuid,product_id text,amount numeric(14,2) not null default 0,commission_rate numeric(6,2) not null default 5,status text not null default 'pending',created_at timestamptz not null default now(),paid_at timestamptz);
create table if not exists public.affiliate_withdrawals(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,amount numeric(14,2) not null check(amount>0),payout_method text not null,payout_account jsonb not null default '{}'::jsonb,status text not null default 'pending',created_at timestamptz not null default now());

alter table public.affiliates enable row level security; alter table public.affiliate_products enable row level security; alter table public.affiliate_clicks enable row level security; alter table public.affiliate_commissions enable row level security; alter table public.affiliate_withdrawals enable row level security;
drop policy if exists "affiliates_self" on public.affiliates; create policy "affiliates_self" on public.affiliates for all to authenticated using(auth.uid()=user_id or (auth.jwt()->>'email')='technicaldemoses@gmail.com') with check(auth.uid()=user_id or (auth.jwt()->>'email')='technicaldemoses@gmail.com');
drop policy if exists "affiliate_products_read" on public.affiliate_products; create policy "affiliate_products_read" on public.affiliate_products for select to authenticated using(active=true or (auth.jwt()->>'email')='technicaldemoses@gmail.com');
drop policy if exists "affiliate_products_admin" on public.affiliate_products; create policy "affiliate_products_admin" on public.affiliate_products for all to authenticated using((auth.jwt()->>'email')='technicaldemoses@gmail.com') with check((auth.jwt()->>'email')='technicaldemoses@gmail.com');
drop policy if exists "affiliate_clicks_insert" on public.affiliate_clicks; create policy "affiliate_clicks_insert" on public.affiliate_clicks for insert to authenticated with check(auth.uid()=affiliate_user_id);
drop policy if exists "affiliate_clicks_admin" on public.affiliate_clicks; create policy "affiliate_clicks_admin" on public.affiliate_clicks for select to authenticated using((auth.jwt()->>'email')='technicaldemoses@gmail.com' or auth.uid()=affiliate_user_id);
drop policy if exists "affiliate_commissions_self" on public.affiliate_commissions; create policy "affiliate_commissions_self" on public.affiliate_commissions for select to authenticated using(auth.uid()=affiliate_user_id or (auth.jwt()->>'email')='technicaldemoses@gmail.com');
drop policy if exists "affiliate_commissions_admin" on public.affiliate_commissions; create policy "affiliate_commissions_admin" on public.affiliate_commissions for all to authenticated using((auth.jwt()->>'email')='technicaldemoses@gmail.com') with check((auth.jwt()->>'email')='technicaldemoses@gmail.com');
drop policy if exists "affiliate_withdrawals_self" on public.affiliate_withdrawals; create policy "affiliate_withdrawals_self" on public.affiliate_withdrawals for all to authenticated using(auth.uid()=user_id or (auth.jwt()->>'email')='technicaldemoses@gmail.com') with check(auth.uid()=user_id or (auth.jwt()->>'email')='technicaldemoses@gmail.com');

-- Automatically add every newly published product to the affiliate catalog.
create or replace function public.tdm_sync_affiliate_product() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status='published' then insert into public.affiliate_products(product_id,product_name) values(new.id::text,new.name) on conflict do nothing; end if; return new; end; $$;
drop trigger if exists tdm_sync_affiliate_product on public.products;
create trigger tdm_sync_affiliate_product after insert or update of status,name on public.products for each row execute function public.tdm_sync_affiliate_product();
insert into public.affiliate_products(product_id,product_name) select id::text,name from public.products where status='published' and not exists(select 1 from public.affiliate_products ap where ap.product_id=products.id::text);

-- 8. Commission on paid orders. Admin can mark a commission paid and adjust balance.
create or replace function public.tdm_create_affiliate_commission() returns trigger language plpgsql security definer set search_path=public as $$
declare a uuid; rate numeric; amount numeric;
begin
 if new.payment_status='paid' and coalesce(old.payment_status,'') is distinct from 'paid' and new.affiliate_code is not null then
   select user_id into a from public.affiliates where affiliate_code=new.affiliate_code and status='active' limit 1;
   if a is not null and not exists(select 1 from public.affiliate_commissions where order_id=new.id) then
     select coalesce(commission_rate,5) into rate from public.affiliate_products where product_id=coalesce(new.product_id,'') limit 1;
     amount=coalesce(new.total_amount,0)*coalesce(rate,5)/100;
     insert into public.affiliate_commissions(affiliate_user_id,order_id,product_id,amount,commission_rate) values(a,new.id,new.product_id,amount,coalesce(rate,5));
     update public.affiliates set reward_balance=reward_balance+amount,lifetime_rewards=lifetime_rewards+amount where user_id=a;
   end if;
 end if; return new; end; $$;
drop trigger if exists tdm_create_affiliate_commission on public."Orders";
create trigger tdm_create_affiliate_commission after update of payment_status on public."Orders" for each row execute function public.tdm_create_affiliate_commission();

-- 9. Verification
select table_name from information_schema.tables where table_schema='public' and table_name in('customer_addresses','customer_notifications','shipping_settings','shipping_zones','affiliates','affiliate_products','affiliate_clicks','affiliate_commissions');
select column_name,data_type,is_nullable from information_schema.columns where table_schema='public' and table_name='Orders' and column_name in('user_id','customer_id','shipping_address','shipping_fee','checkout_total','affiliate_code');

-- 10. Reliable checkout RPC
-- This prevents browser-side Orders/RLS/schema mismatches from leaving checkout on "Creating order...".
create or replace function public.tdm_create_customer_order(
  p_items jsonb,
  p_shipping_address text,
  p_shipping_city text,
  p_shipping_state text,
  p_shipping_country text default 'Nigeria',
  p_transportation_fee numeric default 0,
  p_packaging_fee numeric default 0,
  p_clearance_fee numeric default 0,
  p_shipping_fee numeric default 0,
  p_checkout_total numeric default 0,
  p_customer_name text default '',
  p_customer_phone text default '',
  p_affiliate_code text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  new_id text;
  ids jsonb := '[]'::jsonb;
  uid uuid := auth.uid();
  qty integer;
  item_amount numeric;
  item_total numeric;
begin
  if uid is null then raise exception 'You must be signed in to place an order.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Your cart is empty.';
  end if;
  if coalesce(trim(p_shipping_address),'')='' or coalesce(trim(p_shipping_city),'')='' or coalesce(trim(p_shipping_state),'')='' then
    raise exception 'Delivery address, city and state are required.';
  end if;

  -- Make sure the customer profile exists before an order is created.
  insert into public."Customers"(id,full_name,email,phone,delivery_address,updated_at)
  values(uid,coalesce(nullif(trim(p_customer_name),''),'Customer'),coalesce((select email from auth.users where id=uid),''),coalesce(p_customer_phone,''),p_shipping_address,now())
  on conflict(id) do update set
    full_name=excluded.full_name,
    phone=excluded.phone,
    delivery_address=excluded.delivery_address,
    updated_at=now();

  for item in select * from jsonb_array_elements(p_items) loop
    qty := greatest(coalesce((item->>'quantity')::integer,1),1);
    item_amount := coalesce((item->>'item_total')::numeric,0);
    item_total := coalesce((item->>'total_amount')::numeric,item_amount + coalesce(p_shipping_fee,0));

    insert into public."Orders"(
      user_id, customer_id, product_id, product_name, quantity, total_amount,
      status, payment_status, shipping_address, shipping_city, shipping_state,
      shipping_country, shipping_distance_km, transportation_fee, packaging_fee,
      clearance_fee, shipping_fee, checkout_total, customer_name, customer_phone,
      affiliate_code
    ) values (
      uid, uid, nullif(item->>'product_id',''), item->>'product_name', qty, item_total,
      'Confirmed', 'unpaid', p_shipping_address, p_shipping_city, p_shipping_state,
      coalesce(nullif(trim(p_shipping_country),''),'Nigeria'), 0, coalesce(p_transportation_fee,0),
      coalesce(p_packaging_fee,0), coalesce(p_clearance_fee,0), coalesce(p_shipping_fee,0),
      coalesce(p_checkout_total,0), coalesce(p_customer_name,''), coalesce(p_customer_phone,''),
      nullif(p_affiliate_code,'')
    ) returning id::text into new_id;

    ids := ids || jsonb_build_array(new_id);
  end loop;

  return ids;
end;
$$;
revoke all on function public.tdm_create_customer_order(jsonb,text,text,text,text,numeric,numeric,numeric,numeric,numeric,text,text,text) from public;
grant execute on function public.tdm_create_customer_order(jsonb,text,text,text,text,numeric,numeric,numeric,numeric,numeric,text,text,text) to authenticated;

-- Affiliate product IDs must be unique so a product gets one catalog entry.
delete from public.affiliate_products a using public.affiliate_products b where a.product_id=b.product_id and (a.created_at>b.created_at or (a.created_at=b.created_at and a.id>b.id));
create unique index if not exists affiliate_products_product_id_uidx on public.affiliate_products(product_id);
