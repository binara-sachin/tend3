CREATE VIRTUAL TABLE nodes_fts USING fts5(id UNINDEXED, title, notes);

CREATE TRIGGER nodes_fts_ai AFTER INSERT ON nodes BEGIN
  INSERT INTO nodes_fts(id, title, notes) VALUES (new.id, new.title, new.notes);
END;

CREATE TRIGGER nodes_fts_ad AFTER DELETE ON nodes BEGIN
  DELETE FROM nodes_fts WHERE id = old.id;
END;

CREATE TRIGGER nodes_fts_au AFTER UPDATE ON nodes BEGIN
  DELETE FROM nodes_fts WHERE id = old.id;
  INSERT INTO nodes_fts(id, title, notes) VALUES (new.id, new.title, new.notes);
END;
