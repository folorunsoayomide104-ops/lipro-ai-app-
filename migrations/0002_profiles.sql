create table if not exists profiles (
  user_id text primary key,
  full_name text not null,
  matric text unique,
  school text,
  department text,
  role text not null default 'student',
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on profiles (role);
create index if not exists profiles_school_idx on profiles (school);
