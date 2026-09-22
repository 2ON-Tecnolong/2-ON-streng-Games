create table if not exists app_state (
  id smallint primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists app_snapshots (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  data jsonb not null
);
