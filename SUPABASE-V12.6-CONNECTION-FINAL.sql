-- TDM Manufacturing V12.6 - FINAL SUPABASE CONNECTION / STORAGE SETUP
-- Run once in Supabase SQL Editor.
-- Safe to re-run. Uses the existing public schema and tdm-media bucket.
-- Admin account used by the current website: technicaldemoses@gmail.com

-- 1) Product fields used by admin-store.html
alter table if exists public.products add column if not exists slug text;
alter table if exists public.products add column if not exists sku text;
alter table if exists public.products add column if not exists category text;
alter table if exists public.products add column if not exists price numeric(14,2);
alter table if exists public.products add column if not exists currency text default '₦';
alter table if exists public.products add column if not exists stock_quantity integer default 0;
alter table if exists public.products add column if not exists image_url text default '';
alter table if exists public.products add column if not exists short_description text;
alter table if exists public.products add column if not exists description text;
alter table if exists public.products add column if not exists status text default 'draft';
alter table if exists public.products add column if not exists media_urls jsonb not null default '[]'::jsonb;
alter table if exists public.products add column if not exists created_at timestamptz not null default now();
alter table if exists public.products add column if not exists updated_at timestamptz not null default now();

-- 2) Product image records used by the catalog/database design.
create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  image_url text not null,
  alt_text text,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists product_images_product_id_idx on public.product_images(product_id, sort_order);

-- 3) Public catalog read + admin product management.
alter table if exists public.products enable row level security;
drop policy if exists "products_public_published_read" on public.products;
create policy "products_public_published_read" on public.products for select
using (status = 'published' or (auth.jwt()->>'email')='technicaldemoses@gmail.com');
drop policy if exists "products_admin_all" on public.products;
create policy "products_admin_all" on public.products for all to authenticated
using ((auth.jwt()->>'email')='technicaldemoses@gmail.com')
with check ((auth.jwt()->>'email')='technicaldemoses@gmail.com');

alter table if exists public.product_images enable row level security;
drop policy if exists "product_images_public_read" on public.product_images;
create policy "product_images_public_read" on public.product_images for select
using (true);
drop policy if exists "product_images_admin_all" on public.product_images;
create policy "product_images_admin_all" on public.product_images for all to authenticated
using ((auth.jwt()->>'email')='technicaldemoses@gmail.com')
with check ((auth.jwt()->>'email')='technicaldemoses@gmail.com');

-- 4) Storage bucket used by the website.
insert into storage.buckets(id,name,public)
values ('tdm-media','tdm-media',true)
on conflict (id) do update set public=true;

-- Anyone can display published/public media. Only the TDM admin can write/delete
-- store/products/promotions files. Customers can write only to their own profiles/<uid>/ folder.
drop policy if exists "tdm_media_public_read" on storage.objects;
create policy "tdm_media_public_read" on storage.objects for select
using (bucket_id='tdm-media');

drop policy if exists "tdm_media_admin_insert" on storage.objects;
create policy "tdm_media_admin_insert" on storage.objects for insert to authenticated
with check (bucket_id='tdm-media' and (auth.jwt()->>'email')='technicaldemoses@gmail.com');

drop policy if exists "tdm_media_admin_update" on storage.objects;
create policy "tdm_media_admin_update" on storage.objects for update to authenticated
using (bucket_id='tdm-media' and (auth.jwt()->>'email')='technicaldemoses@gmail.com')
with check (bucket_id='tdm-media' and (auth.jwt()->>'email')='technicaldemoses@gmail.com');

drop policy if exists "tdm_media_admin_delete" on storage.objects;
create policy "tdm_media_admin_delete" on storage.objects for delete to authenticated
using (bucket_id='tdm-media' and (auth.jwt()->>'email')='technicaldemoses@gmail.com');

drop policy if exists "tdm_media_customer_profile_insert" on storage.objects;
create policy "tdm_media_customer_profile_insert" on storage.objects for insert to authenticated
with check (bucket_id='tdm-media' and (storage.foldername(name))[1]='profiles' and (storage.foldername(name))[2]=auth.uid()::text);

drop policy if exists "tdm_media_customer_profile_update" on storage.objects;
create policy "tdm_media_customer_profile_update" on storage.objects for update to authenticated
using (bucket_id='tdm-media' and (storage.foldername(name))[1]='profiles' and (storage.foldername(name))[2]=auth.uid()::text)
with check (bucket_id='tdm-media' and (storage.foldername(name))[1]='profiles' and (storage.foldername(name))[2]=auth.uid()::text);

drop policy if exists "tdm_media_customer_profile_delete" on storage.objects;
create policy "tdm_media_customer_profile_delete" on storage.objects for delete to authenticated
using (bucket_id='tdm-media' and (storage.foldername(name))[1]='profiles' and (storage.foldername(name))[2]=auth.uid()::text);

-- 5) Ensure the home banner table used by admin-media.html exists.
create table if not exists public.home_banners (
  id integer primary key default 1 check(id=1),
  mode text not null default 'auto',
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
insert into public.home_banners(id,mode,active) values(1,'auto',true)
on conflict(id) do nothing;
alter table public.home_banners enable row level security;
drop policy if exists "home_banners_public_read" on public.home_banners;
create policy "home_banners_public_read" on public.home_banners for select using(active=true);
drop policy if exists "home_banners_admin_write" on public.home_banners;
create policy "home_banners_admin_write" on public.home_banners for all to authenticated
using ((auth.jwt()->>'email')='technicaldemoses@gmail.com')
with check ((auth.jwt()->>'email')='technicaldemoses@gmail.com');

-- 6) Useful indexes for the growing store.
create index if not exists products_status_created_at_idx on public.products(status, created_at desc);
create index if not exists products_slug_idx on public.products(slug);

-- 7) Verification: run and confirm these return rows.
select 'products' as object, count(*)::bigint as rows from public.products
union all select 'product_images', count(*) from public.product_images
union all select 'home_banners', count(*) from public.home_banners;

select id,name,public from storage.buckets where id='tdm-media';

select policyname, cmd
from pg_policies
where schemaname='storage' and tablename='objects'
  and policyname like 'tdm_media_%'
order by policyname;
