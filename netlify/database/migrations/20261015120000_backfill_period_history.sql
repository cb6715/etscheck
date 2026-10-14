-- Opsamler reel allerede-arbejdet tid fra Smart Arbejdsapp for den
-- igangværende lønperiode (21/9-), så Vagtløn ikke starter fra 0.
-- Timerne er aflæst direkte fra Smart Arbejdsapps Statistik-side (dag-for-dag
-- grafen) og genberegnet med den samme lønmotor som resten af appen bruger,
-- inkl. den korte-uge-overarbejdsregel (uge 5/10 havde kun 4 rigtige
-- arbejdsdage pga. sygedagen 9/10, så den bruger 30t-grænsen, ikke 37t).
-- 9/10 og 14/10 er registreret som sygedage (ikke arbejdet), jf. brugerens
-- egen rettelse -- ikke som almindelige arbejdsdage.
UPDATE wage_settings SET pay_period_start = '2026-09-21' WHERE pay_period_start <> '2026-09-21';

-- Clears out anything that might already be there (e.g. a test tjek-ind
-- while trying the freshly-deployed app) so the backfill below starts from
-- a clean, non-duplicated slate -- there's nothing of real value to lose
-- yet, this app has only existed for a few minutes.
DELETE FROM work_sessions WHERE user_id = (SELECT id FROM users ORDER BY id ASC LIMIT 1);

INSERT INTO work_sessions (user_id, check_in_at, check_out_at, paid_seconds, gross_amount, net_amount, is_sick_day, is_manual_entry)
SELECT u.id, v.check_in_at::timestamp, v.check_out_at::timestamp, v.paid_seconds, v.gross_amount, v.net_amount, v.is_sick_day, false
FROM (VALUES
  ('2026-09-21 04:30:00.000'::timestamp, '2026-09-21 14:12:00.000'::timestamp, 33120, 1380.0000, 1263.8259, false),
  ('2026-09-22 04:30:00.000'::timestamp, '2026-09-22 13:42:00.000'::timestamp, 31320, 1305.0000, 1195.1397, false),
  ('2026-09-23 04:30:00.000'::timestamp, '2026-09-23 14:00:00.000'::timestamp, 32400, 1350.0000, 1236.3514, false),
  ('2026-09-24 04:30:00.000'::timestamp, '2026-09-24 13:24:00.000'::timestamp, 30240, 1287.0000, 1178.7680, false),
  ('2026-09-25 04:30:00.000'::timestamp, '2026-09-25 09:06:00.000'::timestamp, 16560, 1104.0000, 666.5667, false),
  ('2026-09-28 04:30:00.000'::timestamp, '2026-09-28 14:30:00.000'::timestamp, 34200, 1425.0000, 730.8210, false),
  ('2026-09-29 04:30:00.000'::timestamp, '2026-09-29 08:00:00.000'::timestamp, 12600, 525.0000, 269.2499, false),
  ('2026-09-30 04:30:00.000'::timestamp, '2026-09-30 14:48:00.000'::timestamp, 35280, 1470.0000, 753.8996, false),
  ('2026-10-01 04:30:00.000'::timestamp, '2026-10-01 09:54:00.000'::timestamp, 19440, 810.0000, 415.4141, false),
  ('2026-10-02 04:30:00.000'::timestamp, '2026-10-02 14:18:00.000'::timestamp, 33480, 1575.0000, 808.1713, false),
  ('2026-10-05 04:30:00.000'::timestamp, '2026-10-05 14:12:00.000'::timestamp, 33120, 1380.0000, 707.7425, false),
  ('2026-10-06 04:30:00.000'::timestamp, '2026-10-06 12:24:00.000'::timestamp, 26640, 1110.0000, 569.2711, false),
  ('2026-10-07 04:30:00.000'::timestamp, '2026-10-07 14:36:00.000'::timestamp, 34560, 1440.0000, 738.5139, false),
  ('2026-10-08 04:30:00.000'::timestamp, '2026-10-08 13:18:00.000'::timestamp, 29880, 1785.0000, 916.7148, false),
  ('2026-10-09 04:30:00.000'::timestamp, '2026-10-09 13:30:00.000'::timestamp, 30600, 1122.0000, 575.0669, true),
  ('2026-10-12 04:30:00.000'::timestamp, '2026-10-12 12:48:00.000'::timestamp, 28080, 1287.0000, 660.3209, false),
  ('2026-10-13 04:30:00.000'::timestamp, '2026-10-13 12:30:00.000'::timestamp, 27000, 1242.0000, 637.2424, false),
  ('2026-10-14 04:30:00.000'::timestamp, '2026-10-14 14:00:00.000'::timestamp, 32400, 1188.0000, 608.8944, true)
) AS v(check_in_at, check_out_at, paid_seconds, gross_amount, net_amount, is_sick_day)
CROSS JOIN (SELECT id FROM users ORDER BY id ASC LIMIT 1) AS u;
