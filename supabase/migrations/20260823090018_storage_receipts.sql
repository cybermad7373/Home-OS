-- 018 — Receipt storage
-- Source: docs/13-SETUP-RUNBOOK.md section 3.3, SEC-05.
--
-- Object paths are always {house_id}/{filename}, which is what makes the
-- policies below possible: the first path segment is the tenant, so the same
-- is_house_member check that guards every table guards every file.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts', 'receipts', false,
  5242880,                                    -- SEC-05: 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chore-photos', 'chore-photos', false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "house members read receipts" on storage.objects;
drop policy if exists "house members write receipts" on storage.objects;
drop policy if exists "house members read chore photos" on storage.objects;
drop policy if exists "house members write chore photos" on storage.objects;

create policy "house members read receipts" on storage.objects
  for select using (
    bucket_id = 'receipts'
    and is_house_member(((storage.foldername(name))[1])::uuid)
  );

create policy "house members write receipts" on storage.objects
  for insert with check (
    bucket_id = 'receipts'
    and is_house_member(((storage.foldername(name))[1])::uuid)
  );

create policy "house members read chore photos" on storage.objects
  for select using (
    bucket_id = 'chore-photos'
    and is_house_member(((storage.foldername(name))[1])::uuid)
  );

create policy "house members write chore photos" on storage.objects
  for insert with check (
    bucket_id = 'chore-photos'
    and is_house_member(((storage.foldername(name))[1])::uuid)
  );
