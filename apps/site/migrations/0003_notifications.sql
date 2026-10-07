-- When Janrau was emailed about each application's first person-like open and first CV
-- download. Setting the column claims the notification, so it goes out once per link.
ALTER TABLE applications ADD COLUMN notified_human_at INTEGER;
ALTER TABLE applications ADD COLUMN notified_cv_at INTEGER;
