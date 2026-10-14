-- Opretter din konto automatisk ved deploy, så du ikke selv skal taste
-- noget ind. Lønindstillingerne matcher det, der allerede er valideret i
-- Smart Arbejdsapp (150 kr/time, 37t/60% overarbejde, pause 12:00-12:30,
-- 5.100 kr skattefradrag, 8% AM-bidrag, 44% skat, 0,6822 kr/t ATP,
-- 132 kr/t sygeløn) — alt sammen rettes frit under Indstillinger i appen.
INSERT INTO users (name, email)
VALUES ('Cornelius', 'cornelius@neurix.dk')
ON CONFLICT (email) DO NOTHING;

INSERT INTO wage_settings (user_id, hourly_rate, overtime_threshold_hours, overtime_bonus_pct, night_supplement, night_start_hour, night_end_hour, break_start_minutes, break_end_minutes, monthly_tax_deduction, am_bidrag_pct, tax_rate_pct, atp_rate_per_hour, sick_pay_hourly_rate, advance_amount, pay_period_start, pay_period_end)
SELECT id, 150, 37, 0.6, 25, 17, 5, 720, 750, 5100, 0.08, 0.44, 0.6822, 132, 0, '2026-10-01', '2026-10-31'
FROM users WHERE email = 'cornelius@neurix.dk'
ON CONFLICT (user_id) DO NOTHING;
