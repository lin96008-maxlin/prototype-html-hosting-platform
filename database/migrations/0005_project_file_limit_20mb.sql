alter table projects drop constraint if exists projects_file_size_check;
alter table projects drop constraint if exists projects_file_size_limit;

alter table projects
  add constraint projects_file_size_limit
  check (file_size > 0 and file_size <= 20971520);
