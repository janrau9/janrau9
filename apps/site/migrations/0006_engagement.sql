-- Engagement: which events belong to one visit, what each did, comments, and which emails
-- went out. Still nothing about who: a visit id lives only in that page's memory, and a
-- reader is a device class plus a hash of the network, never an address.
PRAGMA defer_foreign_keys = true;
CREATE TABLE events_new (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  slug    TEXT NOT NULL REFERENCES applications (slug) ON DELETE CASCADE,
  type    TEXT NOT NULL CHECK (type IN ('open', 'human', 'fit_viewed', 'cv_download', 'case_click', 'elevator', 'visit_end')),
  ts      INTEGER NOT NULL,              -- Unix seconds
  scanner INTEGER NOT NULL DEFAULT 0,    -- 1 = server suspects a link scanner (opens only)
  reason  TEXT,                          -- why: 'agent', 'network' or 'too-fast'
  visit   TEXT,                          -- random per page load, kept in that page's memory only
  detail  TEXT,                          -- case study slug, elevator term ids, or seconds read
  reader  TEXT                           -- on 'human': device class and a hash of the network
);
INSERT INTO events_new (id, slug, type, ts, scanner, reason) SELECT id, slug, type, ts, scanner, reason FROM events;
DROP TABLE events;
ALTER TABLE events_new RENAME TO events;
CREATE INDEX events_by_slug ON events (slug, type, ts);
CREATE INDEX events_by_visit ON events (visit);

-- One summary email per visit; claiming the row first makes it once-only.
CREATE TABLE digests (
  visit   TEXT PRIMARY KEY,
  slug    TEXT NOT NULL REFERENCES applications (slug) ON DELETE CASCADE,
  sent_at INTEGER NOT NULL
);

-- Reminder emails: each reminder once per basis (publishing or the last follow-up).
CREATE TABLE reminder_emails (
  slug    TEXT NOT NULL REFERENCES applications (slug) ON DELETE CASCADE,
  kind    TEXT NOT NULL,
  basis   INTEGER NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (slug, kind, basis)
);

-- Questions and comments left on a tailored page. The contact is optional, used only to reply.
CREATE TABLE comments (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  slug    TEXT NOT NULL REFERENCES applications (slug) ON DELETE CASCADE,
  ts      INTEGER NOT NULL,
  message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 2000),
  contact TEXT CHECK (contact IS NULL OR length(contact) <= 200)
);
CREATE INDEX comments_by_slug ON comments (slug, ts);
