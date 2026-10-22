-- Run once in a dedicated Supabase project. Rerunnable; no client database access.
-- gen_random_uuid() is built into PostgreSQL 13+.
create table if not exists products (
 id uuid primary key default gen_random_uuid(), url text not null, name text not null,
 store text not null default '', cat text not null default 'Sin categoría', room text not null default '',
 img text, variant text not null default '', quantity integer not null default 1 check(quantity between 1 and 999),
 status text not null default 'interested' check(status in ('interested','chosen','purchased','discarded')),
 favorite boolean not null default false, price_cents bigint check(price_cents >= 0), currency text not null default 'EUR' check(currency='EUR'),
 price_kind text not null default 'unknown' check(price_kind in ('exact','from','manual','unknown')),
 price_source text, availability text not null default 'unknown', checked_at timestamptz, attempted_at timestamptz,
 refresh_error text, purchased_cents bigint check(purchased_cents>=0), version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- Additive, rerunnable migration preserves existing IDs and related history.
alter table products add column if not exists image_locked boolean not null default false;
alter table products add column if not exists store_id text;
alter table products add column if not exists product_id text;
alter table products add column if not exists variant_id text;
alter table products add column if not exists identity_key text;
update products set identity_key='url:'||md5(url) where identity_key is null;
alter table products alter column identity_key set not null;
alter table products drop constraint if exists products_url_key;
create unique index if not exists products_identity_key on products(identity_key);
create index if not exists products_url_lookup on products(url);
create table if not exists import_candidates (id uuid primary key, value jsonb not null, expires_at timestamptz not null);
create index if not exists import_expiry on import_candidates(expires_at);
create table if not exists store_health (id text primary key, value jsonb not null);
create table if not exists comments (
 id uuid primary key default gen_random_uuid(), product_id uuid not null references products on delete cascade,
 text text not null check(length(text) between 1 and 4000), author text not null default 'Yo', created_at timestamptz not null default now()
);
create table if not exists price_history (
 id uuid primary key default gen_random_uuid(), product_id uuid not null references products on delete cascade,
 price_cents bigint not null check(price_cents>=0), currency text not null default 'EUR', kind text not null,
 source text not null, observed_at timestamptz not null default now(), observation_key text not null,
 unique(product_id,observation_key)
);
create table if not exists admin_sessions (token_hash text primary key, expires_at timestamptz not null);
create table if not exists rate_limits (key text primary key, count integer not null, resets_at timestamptz not null);
create table if not exists leases (key text primary key, expires_at timestamptz not null);
create table if not exists search_cache (key text primary key, value jsonb not null, expires_at timestamptz not null);
create index if not exists history_product_time on price_history(product_id,observed_at desc);
create index if not exists comments_product on comments(product_id);

create or replace function take_rate(p_key text,p_limit integer,p_seconds integer) returns boolean language plpgsql as $$
declare n integer;
begin
 delete from rate_limits where resets_at < now() - interval '1 day';
 insert into rate_limits as r values(p_key,1,now()+make_interval(secs=>p_seconds))
 on conflict(key) do update set count=case when r.resets_at<=now() then 1 else r.count+1 end,
 resets_at=case when r.resets_at<=now() then excluded.resets_at else r.resets_at end returning count into n;
 return n<=p_limit;
end $$;
create or replace function acquire_lease(p_key text,p_seconds integer) returns boolean language plpgsql as $$
declare k text;
begin
 insert into leases as l values(p_key,now()+make_interval(secs=>p_seconds)) on conflict(key) do update
 set expires_at=excluded.expires_at where l.expires_at<=now() returning key into k;
 return k is not null;
end $$;
create or replace function save_product(p_data jsonb,p_id uuid default null,p_version integer default null) returns jsonb language plpgsql as $$
declare r products; old products;
begin
 if p_id is null then
 insert into products(url,name,store,cat,room,img,variant,quantity,status,favorite,price_cents,price_kind,price_source,purchased_cents,identity_key,store_id,product_id,variant_id,checked_at,availability,image_locked)
 values(p_data->>'url',p_data->>'name',p_data->>'store',p_data->>'cat',p_data->>'room',p_data->>'img',p_data->>'variant',
 (p_data->>'quantity')::integer,p_data->>'status',(p_data->>'favorite')::boolean,(p_data->>'price_cents')::bigint,
 p_data->>'price_kind',case when p_data->>'price_kind'='manual' then 'manual' else p_data->>'price_source' end,(p_data->>'purchased_cents')::bigint,
 coalesce(p_data->>'identity_key','url:'||md5(p_data->>'url')),p_data->>'store_id',p_data->>'product_id',p_data->>'variant_id',
 (p_data->>'checked_at')::timestamptz,coalesce(p_data->>'availability','unknown'),coalesce((p_data->>'image_locked')::boolean,false))
 on conflict(identity_key) do nothing returning * into r;
 if r.id is null then select * into r from products where identity_key=coalesce(p_data->>'identity_key','url:'||md5(p_data->>'url')); return to_jsonb(r); end if;
 else
 select * into old from products where id=p_id for update;
 if old.id is null then raise exception 'NOT_FOUND'; end if;
 if old.version is distinct from p_version then raise exception 'VERSION_CONFLICT'; end if;
 update products set image_locked=coalesce((p_data->>'image_locked')::boolean,old.image_locked),img=p_data->>'img',name=p_data->>'name',cat=p_data->>'cat',room=p_data->>'room',variant=p_data->>'variant',
 quantity=(p_data->>'quantity')::integer,status=p_data->>'status',favorite=(p_data->>'favorite')::boolean,
 price_cents=case when (p_data->>'manual_changed')::boolean then (p_data->>'price_cents')::bigint else old.price_cents end,
 price_kind=case when (p_data->>'manual_changed')::boolean then p_data->>'price_kind' else old.price_kind end,
 price_source=case when (p_data->>'manual_changed')::boolean then 'manual' else old.price_source end,
 purchased_cents=(p_data->>'purchased_cents')::bigint,version=version+1,updated_at=now() where id=p_id returning * into r;
 end if;
 if p_id is null and r.price_cents is not null and r.price_kind in ('exact','from') and r.checked_at is not null then
 insert into price_history(product_id,price_cents,kind,source,observed_at,observation_key)
 values(r.id,r.price_cents,r.price_kind,r.price_source,r.checked_at,'import:'||r.id) on conflict do nothing;
 end if;
 if r.price_kind='manual' and r.price_cents is not null and (p_id is null or old.price_cents is distinct from r.price_cents or old.price_kind<>'manual') then
 insert into price_history(product_id,price_cents,kind,source,observation_key) values(r.id,r.price_cents,'manual','manual','manual:'||r.version);
 end if;
 return to_jsonb(r);
end $$;
create or replace function capture_price(p_id uuid,p_version integer,p_data jsonb,p_key text) returns jsonb language plpgsql as $$
declare r products;
begin
 select * into r from products where id=p_id for update;
 if r.id is null then raise exception 'NOT_FOUND'; end if;
 if r.version is distinct from p_version then return to_jsonb(r); end if;
 if p_data->>'error' is not null then
 update products set attempted_at=now(),refresh_error=p_data->>'error' where id=p_id returning * into r;
 return to_jsonb(r);
 end if;
 insert into price_history(product_id,price_cents,kind,source,observation_key)
 values(p_id,(p_data->>'price_cents')::bigint,p_data->>'price_kind',p_data->>'price_source',p_key) on conflict do nothing;
 update products set price_cents=(p_data->>'price_cents')::bigint,price_kind=p_data->>'price_kind',price_source=p_data->>'price_source',
 availability=p_data->>'availability',variant=case when variant='' then coalesce(p_data->>'variant','') else variant end,img=case when image_locked then img else coalesce(p_data->>'img',img) end,checked_at=now(),attempted_at=now(),refresh_error=null,
 version=version+1,updated_at=now() where id=p_id returning * into r;
 return to_jsonb(r);
end $$;
-- No anon/authenticated access. APIs use the server-only service role.
do $$ declare t text; begin
 foreach t in array array['products','comments','price_history','admin_sessions','rate_limits','leases','search_cache','import_candidates','store_health'] loop
 execute format('alter table %I enable row level security',t);
 execute format('revoke all on table %I from public',t);
 end loop;
end $$;
revoke execute on function take_rate(text,integer,integer), acquire_lease(text,integer), save_product(jsonb,uuid,integer), capture_price(uuid,integer,jsonb,text) from public;
-- Supabase provides these roles; this block also permits isolated PostgreSQL tests.
do $$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then
 grant usage on schema public to service_role;
 grant all on products,comments,price_history,admin_sessions,rate_limits,leases,search_cache,import_candidates,store_health to service_role;
 grant execute on function take_rate(text,integer,integer),acquire_lease(text,integer),save_product(jsonb,uuid,integer),capture_price(uuid,integer,jsonb,text) to service_role;
 revoke all on products,comments,price_history,admin_sessions,rate_limits,leases,search_cache,import_candidates,store_health from anon,authenticated;
 revoke execute on function take_rate(text,integer,integer),acquire_lease(text,integer),save_product(jsonb,uuid,integer),capture_price(uuid,integer,jsonb,text) from anon,authenticated;
 end if;
end $$;
