-- M1 0001: feature flags (launch-behind-flags strategy).
-- Full domain migrations (profiles, org, economy, clan, wars, seasons) land in M2/M4+.
-- This table is the runtime source of truth; env FEATURE_* values are build fallbacks only.

create table if not exists public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  description text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.feature_flags (key, enabled, description) values
  ('PHASE_1_CORE', true, 'Core adventure + learning platform'),
  ('PHASE_2_ADAPTIVE', false, 'Adaptive learning + social play'),
  ('PHASE_2_REWARDED_ADS', false, 'Rewarded ads (flag OFF until provider eligibility confirmed)'),
  ('PHASE_3_CLAN_WARS', false, 'Cross-batch clan wars'),
  ('PHASE_3_SEASONS', false, 'Seasons + live events')
on conflict (key) do update set
  enabled = excluded.enabled,
  description = excluded.description;
