-- Fixed, well-known Inbox node (spec 3.5). This id must match db/constants.ts INBOX_ID.
INSERT INTO nodes (
  id, parent_id, type, title, notes, sort_key,
  when_date, deadline, completed_at, deleted_at,
  is_system, open_descendant_count, created_at, updated_at
) VALUES (
  '00000000-0000-7000-8000-000000000000', NULL, 'project', 'Inbox', '', 'a0',
  NULL, NULL, NULL, NULL,
  1, 0, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'
);
