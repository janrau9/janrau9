-- One row per job application. The slug is the private link: /for/<slug>.
CREATE TABLE applications (
  slug         TEXT PRIMARY KEY,
  company      TEXT NOT NULL,
  role         TEXT NOT NULL,
  source_url   TEXT,
  post_hash    TEXT NOT NULL UNIQUE,  -- SHA-256 of the normalised post text; catches duplicates
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'applied', 'interview', 'rejected', 'offer', 'no_reply', 'withdrawn')),
  created_at   INTEGER NOT NULL,      -- Unix seconds
  published_at INTEGER
);

-- The tailoring itself. cv_version is the git commit of cv.yaml it was written against.
CREATE TABLE variants (
  slug         TEXT PRIMARY KEY REFERENCES applications (slug) ON DELETE CASCADE,
  variant_json TEXT NOT NULL,
  cv_version   TEXT NOT NULL
);
