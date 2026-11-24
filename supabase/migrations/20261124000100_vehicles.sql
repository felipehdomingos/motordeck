begin;

create table if not exists public.mesquiatti_vehicles (
  slug text primary key check (slug ~ '^local-[a-z0-9-]{1,60}$'),
  details jsonb not null check (jsonb_typeof(details) = 'object'),
  draft boolean not null default true,
  images text[] not null default '{}' check (cardinality(images) <= 12),
  photo_count integer generated always as (cardinality(images)) stored,
  created_at timestamptz not null default now()
);

alter table public.mesquiatti_vehicles enable row level security;
revoke all on public.mesquiatti_vehicles from public, anon, authenticated;
grant select, insert, update, delete on public.mesquiatti_vehicles to service_role;

create or replace view public.mesquiatti_vehicle_photos with (security_invoker = true) as
select v.slug, p.position, p.image
from public.mesquiatti_vehicles v
cross join lateral unnest(v.images) with ordinality as p(image, position)
where not v.draft and v.details->>'status' <> 'Vendido';

revoke all on public.mesquiatti_vehicle_photos from public, anon, authenticated;
grant select on public.mesquiatti_vehicle_photos to service_role;

notify pgrst, 'reload schema';
commit;
