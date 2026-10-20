-- Tracks which live hour/kr milestones and overtime crossing have already
-- been push-notified, so the new scheduled push-tick function (which runs
-- independently of whether anyone has the app open) can tell a genuinely
-- NEW crossing apart from one it already sent a notification for. Additive,
-- defaults match "nothing notified yet" for every existing user.
ALTER TABLE wage_settings ADD COLUMN live_hour_milestone INTEGER NOT NULL DEFAULT 0;
ALTER TABLE wage_settings ADD COLUMN live_kr_milestone INTEGER NOT NULL DEFAULT 0;
ALTER TABLE wage_settings ADD COLUMN live_overtime_notified BOOLEAN NOT NULL DEFAULT false;
