CREATE TABLE command_log (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  command    TEXT NOT NULL,   -- command type name
  payload    TEXT NOT NULL,   -- JSON
  applied_at TEXT NOT NULL
);
