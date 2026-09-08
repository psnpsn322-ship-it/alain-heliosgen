alter table public.generations
  add column if not exists source         text,
  add column if not exists ext_product_id text,
  add column if not exists ext_brief_id   text,
  add column if not exists ext_angle_id   text;

create index if not exists generations_source_idx
  on public.generations (source) where source is not null;
