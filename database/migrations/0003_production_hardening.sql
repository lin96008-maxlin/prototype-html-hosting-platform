alter table users
  add column if not exists session_version integer not null default 1;

do $$ begin
  alter table users
    add constraint users_session_version_positive check (session_version > 0);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table users
    add constraint users_storage_quota_minimum check (storage_quota_bytes >= 5242880);
exception when duplicate_object then null;
end $$;

alter table projects
  add column if not exists preview_status text not null default 'pending',
  add column if not exists preview_error text;

update projects
   set preview_status = case when preview_path is null then 'failed' else 'ready' end
 where preview_status = 'pending';

do $$ begin
  alter table projects
    add constraint projects_preview_status_valid
    check (preview_status in ('pending', 'ready', 'failed'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table projects
    add constraint projects_share_version_positive check (share_version > 0);
exception when duplicate_object then null;
end $$;

alter table project_visits alter column user_id drop not null;
alter table project_visits add column if not exists visitor_key text;
alter table project_visits drop constraint if exists project_visits_user_id_fkey;
alter table project_visits
  add constraint project_visits_user_id_fkey
  foreign key (user_id) references users(id) on delete set null;

do $$ begin
  alter table project_visits
    add constraint project_visits_actor_present
    check (user_id is not null or visitor_key is not null);
exception when duplicate_object then null;
end $$;

create table if not exists share_password_attempts (
  id bigint generated always as identity primary key,
  project_id uuid not null references projects(id) on delete cascade,
  ip_address inet,
  success boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists share_password_attempts_lookup_idx
  on share_password_attempts(project_id, ip_address, created_at desc);
