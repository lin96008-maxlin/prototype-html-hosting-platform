alter table projects drop constraint if exists projects_file_size_check;
alter table projects drop constraint if exists projects_file_size_limit;
alter table projects drop constraint if exists projects_file_size_positive;

alter table projects
  add constraint projects_file_size_positive
  check (file_size > 0);
