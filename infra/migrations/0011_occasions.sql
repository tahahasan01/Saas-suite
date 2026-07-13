-- ============================================================================
-- Migration 0011 — Occasion calendar (global reference for seasonal forecasting)
-- Regional events with an expected demand uplift. The forecaster looks ~60 days
-- ahead and projects stock needs. Global (not tenant-scoped) reference data.
-- ============================================================================

create table if not exists occasion_calendar (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  event_date    date not null,
  region        text not null default 'PK',
  category_hint text not null default '',
  uplift_pct    int  not null default 30,   -- expected demand increase %
  duration_days int  not null default 3,
  unique (name, event_date, region)
);
create index if not exists occasion_date_idx on occasion_calendar(region, event_date);

grant select on occasion_calendar to app_user;

-- Seed Pakistan events (dates approximate; refine per year).
insert into occasion_calendar (name, event_date, region, category_hint, uplift_pct, duration_days) values
  ('Independence Day', '2026-08-14', 'PK', 'clothing,flags,food', 35, 3),
  ('Back to School',   '2026-09-01', 'PK', 'stationery,uniforms,bags', 45, 14),
  ('Rabi-ul-Awwal',    '2026-08-25', 'PK', 'food,sweets', 25, 12),
  ('Winter Season',    '2026-11-15', 'PK', 'clothing,heaters', 30, 45),
  ('Ramadan',          '2027-02-18', 'PK', 'food,dates,beverages', 50, 30),
  ('Eid-ul-Fitr',      '2027-03-20', 'PK', 'clothing,sweets,gifts', 60, 5)
on conflict (name, event_date, region) do nothing;
