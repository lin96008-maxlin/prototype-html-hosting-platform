alter table projects
  add column if not exists share_password_encrypted text;
