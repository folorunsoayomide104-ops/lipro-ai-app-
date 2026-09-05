create table if not exists user_settings (
  user_id text primary key,
  nvidia_api_key text,
  updated_at timestamptz not null default now()
);
