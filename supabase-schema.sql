create extension if not exists pgcrypto;

create table if not exists public.developer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null,
  title text not null,
  location text,
  timezone text,
  hourly_rate text,
  availability text default 'Available',
  bio text default '',
  skills text[] default '{}',
  portfolio_focus text,
  created_at timestamptz not null default now()
);

create table if not exists public.client_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company text not null,
  title text not null,
  summary text not null,
  budget text,
  timeline text,
  remote text default 'Remote',
  status text default 'Open',
  skills text[] default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.developer_services (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  developer_name text not null,
  title text not null,
  summary text not null,
  stack text[] default '{}',
  starting_at text,
  delivery text,
  created_at timestamptz not null default now()
);

alter table public.developer_profiles enable row level security;
alter table public.client_projects enable row level security;
alter table public.developer_services enable row level security;

create policy "public read developer profiles"
on public.developer_profiles
for select
to anon, authenticated
using (true);

create policy "owners insert developer profiles"
on public.developer_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "owners update developer profiles"
on public.developer_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "owners delete developer profiles"
on public.developer_profiles
for delete
to authenticated
using (auth.uid() = user_id);

create policy "public read projects"
on public.client_projects
for select
to anon, authenticated
using (true);

create policy "owners insert projects"
on public.client_projects
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "owners update projects"
on public.client_projects
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "owners delete projects"
on public.client_projects
for delete
to authenticated
using (auth.uid() = user_id);

create policy "public read services"
on public.developer_services
for select
to anon, authenticated
using (true);

create policy "owners insert services"
on public.developer_services
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "owners update services"
on public.developer_services
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "owners delete services"
on public.developer_services
for delete
to authenticated
using (auth.uid() = user_id);
