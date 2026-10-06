-- What happened to each link. No IP addresses, no user agents, no cookies: only
-- what happened, when, and whether the server suspected a scanner (and why).
CREATE TABLE events (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  slug    TEXT NOT NULL REFERENCES applications (slug) ON DELETE CASCADE,
  type    TEXT NOT NULL CHECK (type IN ('open', 'human', 'fit_viewed', 'cv_download', 'case_click')),
  ts      INTEGER NOT NULL,              -- Unix seconds
  scanner INTEGER NOT NULL DEFAULT 0,    -- 1 = server suspects a link scanner (opens only)
  reason  TEXT                           -- why: 'agent', 'network' or 'too-fast'
);
CREATE INDEX events_by_slug ON events (slug, type, ts);
