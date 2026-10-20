-- closePayPeriod had no guard against a double-tap or slow-network retry
-- of "Luk lønperiode" inserting two snapshot rows for the same period —
-- unlike checkIn/checkOut, which already rely on exactly this kind of
-- unique index to make a duplicate request a no-op instead of a
-- duplicate write. This closes that gap the same way.
CREATE UNIQUE INDEX IF NOT EXISTS pay_period_history_unique_period
  ON pay_period_history (user_id, period_start, period_end);
