create extension if not exists pgcrypto;
create extension if not exists citext;

do $$ begin
  create type user_role as enum ('user', 'admin', 'super_admin');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type user_status as enum ('active', 'disabled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type platform_event_type as enum ('upload', 'update');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type project_access_type as enum ('public', 'share', 'owner', 'admin');
exception when duplicate_object then null;
end $$;

create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references departments(id) on delete restrict,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists departments_parent_name_unique
  on departments (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), name);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  account citext not null unique,
  password_hash text not null,
  name text not null,
  department_id uuid not null references departments(id) on delete restrict,
  role user_role not null default 'user',
  status user_status not null default 'active',
  must_change_password boolean not null default false,
  temp_password_expires_at timestamptz,
  session_version integer not null default 1 check (session_version > 0),
  storage_quota_bytes bigint not null default 10737418240 check (storage_quota_bytes >= 5242880),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists admin_department_scopes (
  admin_id uuid not null references users(id) on delete cascade,
  department_id uuid not null references departments(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (admin_id, department_id)
);

create table if not exists invitation_codes (
  id uuid primary key default gen_random_uuid(),
  code citext not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references users(id) on delete set null,
  used_by_name text,
  created_by uuid references users(id) on delete set null,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  check (
    (used_at is null and used_by is null and used_by_name is null)
    or (used_at is not null and used_by_name is not null)
  )
);

create table if not exists prototype_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete cascade,
  parent_id uuid references prototype_groups(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists prototype_groups_owner_parent_name_unique
  on prototype_groups (owner_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), name);

create table if not exists business_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  public_code text not null unique,
  share_code text not null unique,
  name text not null,
  owner_id uuid not null references users(id) on delete cascade,
  department_id uuid not null references departments(id) on delete restrict,
  group_id uuid references prototype_groups(id) on delete set null,
  category_id uuid references business_categories(id) on delete set null,
  html_path text not null,
  preview_path text,
  preview_status text not null default 'pending' check (preview_status in ('pending', 'ready', 'failed')),
  preview_error text,
  preview_size bigint not null default 0 check (preview_size >= 0),
  file_size bigint not null check (file_size > 0 and file_size <= 5242880),
  is_public boolean not null default false,
  share_enabled boolean not null default false,
  share_expires_at timestamptz,
  share_password_hash text,
  share_version integer not null default 1 check (share_version > 0),
  visit_count bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists project_visits (
  id bigint generated always as identity primary key,
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  visitor_key text,
  access_type project_access_type not null,
  visited_at timestamptz not null default now(),
  check (user_id is not null or visitor_key is not null)
);

create table if not exists share_password_attempts (
  id bigint generated always as identity primary key,
  project_id uuid not null references projects(id) on delete cascade,
  ip_address inet,
  success boolean not null,
  created_at timestamptz not null default now()
);

create table if not exists login_logs (
  id bigint generated always as identity primary key,
  user_id uuid references users(id) on delete set null,
  account text not null,
  success boolean not null,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists platform_events (
  id bigint generated always as identity primary key,
  event_type platform_event_type not null,
  project_id uuid references projects(id) on delete set null,
  user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists projects_owner_idx on projects(owner_id, updated_at desc);
create index if not exists projects_department_idx on projects(department_id, updated_at desc);
create index if not exists projects_public_idx on projects(is_public, updated_at desc);
create index if not exists project_visits_project_idx on project_visits(project_id, visited_at desc);
create index if not exists project_visits_user_idx on project_visits(user_id, visited_at desc);
create index if not exists share_password_attempts_lookup_idx on share_password_attempts(project_id, ip_address, created_at desc);
create index if not exists login_logs_created_idx on login_logs(created_at desc);
create index if not exists platform_events_created_idx on platform_events(created_at desc);

create or replace function increment_project_visit_count()
returns trigger
language plpgsql
as $$
begin
  update projects set visit_count = visit_count + 1 where id = new.project_id;
  return new;
end;
$$;

drop trigger if exists project_visit_count_trigger on project_visits;
create trigger project_visit_count_trigger
after insert on project_visits
for each row execute function increment_project_visit_count();
