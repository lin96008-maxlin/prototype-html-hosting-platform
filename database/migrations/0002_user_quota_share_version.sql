alter table users
  add column if not exists storage_quota_bytes bigint not null default 10737418240;

alter table projects
  add column if not exists share_version integer not null default 1;
