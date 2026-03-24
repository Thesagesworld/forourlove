-- Supabase schema helpers
-- Asegúrate de ejecutar esto en tu proyecto Supabase (SQL Editor o migraciones).

-- Extension necesaria para uuid_generate_v4()
create extension if not exists "uuid-ossp";

create table moods (
  id uuid default uuid_generate_v4() primary key,
  pair_code text,
  sender text,
  img text,
  label text,
  mini_message text,
  created_at timestamp default now()
);

create table stickers (
  id uuid default uuid_generate_v4() primary key,
  pair_code text,
  img text,
  label text,
  mini text,
  created_at timestamp default now()
);

alter table moods enable row level security;
alter table stickers enable row level security;

create policy "allow all moods"
on moods for all using (true) with check (true);

create policy "allow all stickers"
on stickers for all using (true) with check (true);
