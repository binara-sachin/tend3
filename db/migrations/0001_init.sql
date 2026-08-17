CREATE TABLE nodes (
  id                    TEXT PRIMARY KEY,           -- UUIDv7
  parent_id             TEXT REFERENCES nodes(id),  -- NULL only for roots
  type                  TEXT NOT NULL CHECK (type IN ('project','heading','todo')),
  title                 TEXT NOT NULL DEFAULT '',
  notes                 TEXT NOT NULL DEFAULT '',   -- markdown
  sort_key              TEXT NOT NULL,              -- fractional index, scoped to parent
  when_date             TEXT,                       -- ISO 8601 date, no time component
  deadline              TEXT,                       -- ISO 8601 date, no time component
  completed_at          TEXT,                       -- todos only
  deleted_at            TEXT,
  is_system             INTEGER NOT NULL DEFAULT 0, -- Inbox only
  open_descendant_count INTEGER NOT NULL DEFAULT 0, -- projects only; see spec 3.4
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  UNIQUE (parent_id, sort_key)
);

CREATE INDEX idx_nodes_parent   ON nodes(parent_id, sort_key);
CREATE INDEX idx_nodes_when     ON nodes(when_date)  WHERE when_date  IS NOT NULL;
CREATE INDEX idx_nodes_deadline ON nodes(deadline)   WHERE deadline   IS NOT NULL;
CREATE INDEX idx_nodes_done     ON nodes(completed_at) WHERE completed_at IS NOT NULL;
CREATE INDEX idx_nodes_trash    ON nodes(deleted_at)   WHERE deleted_at   IS NOT NULL;
