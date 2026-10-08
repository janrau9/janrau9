-- Elevator mode: which glossary terms visitors asked about, per day. Only term ids from
-- content/glossary.yaml (or 'none'), never what anyone typed.
CREATE TABLE elevator_terms (
  day TEXT NOT NULL,
  term TEXT NOT NULL,
  asks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, term)
);

-- Tailored links also record an 'elevator' event (the visitor used elevator mode). SQLite
-- can't change a CHECK constraint, so the events table is rebuilt with the new type.
PRAGMA defer_foreign_keys = true;
CREATE TABLE events_new (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  slug    TEXT NOT NULL REFERENCES applications (slug) ON DELETE CASCADE,
  type    TEXT NOT NULL CHECK (type IN ('open', 'human', 'fit_viewed', 'cv_download', 'case_click', 'elevator')),
  ts      INTEGER NOT NULL,              -- Unix seconds
  scanner INTEGER NOT NULL DEFAULT 0,    -- 1 = server suspects a link scanner (opens only)
  reason  TEXT                           -- why: 'agent', 'network' or 'too-fast'
);
INSERT INTO events_new (id, slug, type, ts, scanner, reason) SELECT id, slug, type, ts, scanner, reason FROM events;
DROP TABLE events;
ALTER TABLE events_new RENAME TO events;
CREATE INDEX events_by_slug ON events (slug, type, ts);
