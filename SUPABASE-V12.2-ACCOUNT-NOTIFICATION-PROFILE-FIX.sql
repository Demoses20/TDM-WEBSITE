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
