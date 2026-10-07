-- When Janrau last followed up on an application. Resets the follow-up reminders' clock.
ALTER TABLE applications ADD COLUMN followed_up_at INTEGER;
