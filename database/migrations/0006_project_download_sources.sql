alter table projects
  add column if not exists source_kind text,
  add column if not exists source_name text;

update projects
   set source_kind = coalesce(source_kind, 'folder'),
       source_name = coalesce(source_name, name || '.zip');

alter table projects
  alter column source_kind set not null,
  alter column source_name set not null;

alter table projects drop constraint if exists projects_source_kind_valid;

alter table projects
  add constraint projects_source_kind_valid
    check (source_kind in ('html', 'zip', 'rar', 'folder'));
