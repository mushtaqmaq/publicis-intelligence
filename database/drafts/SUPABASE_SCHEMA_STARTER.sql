-- Publicis Intelligence Global Trends - starter schema
-- Date: 2026-11-22. Intended for a NEW, isolated Supabase project.
-- REVIEW IN A LOCAL DATABASE FIRST. Do NOT apply to the existing Neon database.
-- Create a migration with your installed Supabase CLI (inspect --help first).
-- This is a secure foundation; client/editor write workflows should use
-- explicitly authorized server endpoints and additional policies after review.

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  email text not null,
  display_name text,
  department text not null default 'research',
  role text not null default 'viewer' check (role in ('viewer','researcher','editor','lead','admin')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists profiles_org_idx on public.profiles(organization_id);

create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  kind text not null check (kind in ('gdelt','rss','youtube','manual','licensed')),
  name text not null,
  config_public jsonb not null default '{}'::jsonb,
  rights_status text not null default 'link_only' check (rights_status in ('link_only','licensed','editorial')),
  enabled boolean not null default false,
  refresh_minutes integer not null default 120 check (refresh_minutes between 15 and 10080),
  last_success_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.source_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete cascade,
  job_key text not null,
  status text not null default 'pending' check (status in ('pending','running','success','partial','error')),
  started_at timestamptz,
  finished_at timestamptz,
  seen_count integer not null default 0,
  inserted_count integer not null default 0,
  error_code text,
  cursor_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_id, job_key)
);
create index if not exists source_runs_recent_idx on public.source_runs(source_id, created_at desc);

create table if not exists public.signals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  source_id uuid not null references public.sources(id),
  external_id text,
  canonical_url text not null,
  title text not null,
  summary text,
  language text,
  published_at timestamptz,
  observed_at timestamptz not null default now(),
  publisher_country text,
  about_countries text[] not null default '{}',
  category_hints text[] not null default '{}',
  metrics jsonb not null default '{}'::jsonb,
  source_metadata jsonb not null default '{}'::jsonb,
  content_hash text,
  rights_status text not null default 'link_only' check (rights_status in ('link_only','licensed','editorial')),
  editorial_state text not null default 'draft' check (editorial_state in ('draft','approved','hidden')),
  created_at timestamptz not null default now()
);
create unique index if not exists signals_source_external_uidx on public.signals(source_id, external_id)
  where external_id is not null;
create unique index if not exists signals_source_url_uidx on public.signals(source_id, canonical_url);
create index if not exists signals_org_published_idx on public.signals(organization_id, published_at desc);
create index if not exists signals_recent_idx on public.signals(observed_at desc);

create table if not exists public.trends (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  title text not null,
  description text,
  category text not null default 'other',
  status text not null default 'emerging' check (status in ('emerging','rising','peaking','stable','declining','unknown')),
  editorial_state text not null default 'draft' check (editorial_state in ('draft','approved','hidden')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  momentum_score numeric(5,2) check (momentum_score between 0 and 100),
  confidence_score numeric(5,2) check (confidence_score between 0 and 100),
  score_version text,
  generated_summary jsonb,
  created_at timestamptz not null default now()
);
create index if not exists trends_org_last_seen_idx on public.trends(organization_id, last_seen_at desc);
create index if not exists trends_org_score_idx on public.trends(organization_id, momentum_score desc);

create table if not exists public.trend_signals (
  trend_id uuid not null references public.trends(id) on delete cascade,
  signal_id uuid not null references public.signals(id) on delete cascade,
  evidence_weight numeric(5,2) not null default 1,
  primary key (trend_id, signal_id)
);

create table if not exists public.trend_snapshots (
  id uuid primary key default gen_random_uuid(),
  trend_id uuid not null references public.trends(id) on delete cascade,
  measured_at timestamptz not null default now(),
  momentum_score numeric(5,2) check (momentum_score between 0 and 100),
  confidence_score numeric(5,2) check (confidence_score between 0 and 100),
  score_version text not null,
  input_metrics jsonb not null default '{}'::jsonb
);
create index if not exists trend_snapshots_history_idx on public.trend_snapshots(trend_id, measured_at desc);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  industry text,
  markets text[] not null default '{}',
  objectives jsonb not null default '{}'::jsonb,
  safety_rules jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.client_members (
  client_id uuid not null references public.clients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  access_role text not null default 'viewer' check (access_role in ('viewer','editor','lead')),
  primary key (client_id, user_id)
);

create table if not exists public.client_trends (
  client_id uuid not null references public.clients(id) on delete cascade,
  trend_id uuid not null references public.trends(id) on delete cascade,
  relevance_score numeric(5,2) check (relevance_score between 0 and 100),
  rationale jsonb not null default '{}'::jsonb,
  reviewed_at timestamptz,
  primary key(client_id, trend_id)
);

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  owner_id uuid not null references auth.users(id),
  title text not null,
  visibility text not null default 'personal' check (visibility in ('personal','organization','client')),
  client_id uuid references public.clients(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((visibility = 'client' and client_id is not null)
      or (visibility <> 'client' and client_id is null))
);

create table if not exists public.board_items (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  trend_id uuid not null references public.trends(id) on delete cascade,
  sort_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  unique(board_id, trend_id)
);

create table if not exists public.briefs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  author_id uuid not null references auth.users(id),
  client_id uuid references public.clients(id),
  title text not null,
  trend_ids uuid[] not null default '{}',
  content jsonb not null default '{}'::jsonb,
  evidence_ids uuid[] not null default '{}',
  generation_metadata jsonb not null default '{}'::jsonb,
  review_status text not null default 'draft' check (review_status in ('draft','pending','approved','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  cadence text not null default 'daily' check (cadence in ('daily','weekly','manual')),
  enabled boolean not null default false,
  last_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  actor_id uuid references auth.users(id),
  action text not null,
  subject_type text,
  subject_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists audit_events_org_recent_idx on public.audit_events(organization_id, occurred_at desc);

-- Enable RLS on every API-exposed table. Policies below begin deny-by-default.
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.sources enable row level security;
alter table public.source_runs enable row level security;
alter table public.signals enable row level security;
alter table public.trends enable row level security;
alter table public.trend_signals enable row level security;
alter table public.trend_snapshots enable row level security;
alter table public.clients enable row level security;
alter table public.client_members enable row level security;
alter table public.client_trends enable row level security;
alter table public.boards enable row level security;
alter table public.board_items enable row level security;
alter table public.briefs enable row level security;
alter table public.alerts enable row level security;
alter table public.audit_events enable row level security;

-- The user can only see their own trusted profile. There is deliberately NO
-- UPDATE, INSERT or DELETE policy on profiles. Server-side admin provisions it.
create policy profile_read_self on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));

create policy organization_member_read on public.organizations for select to authenticated
  using (exists (select 1 from public.profiles p
    where p.user_id = (select auth.uid()) and p.active and p.organization_id = organizations.id));

-- All internal trends/signals are org-scoped, but unapproved material is editor/admin only.
create policy signals_read_org_approved on public.signals for select to authenticated
  using (exists (select 1 from public.profiles p
    where p.user_id = (select auth.uid()) and p.active and p.organization_id = signals.organization_id
      and (signals.editorial_state = 'approved' or p.role in ('editor','admin'))));

create policy trends_read_org_approved on public.trends for select to authenticated
  using (exists (select 1 from public.profiles p
    where p.user_id = (select auth.uid()) and p.active and p.organization_id = trends.organization_id
      and (trends.editorial_state = 'approved' or p.role in ('editor','admin'))));

create policy trend_signals_read_visible on public.trend_signals for select to authenticated
  using (exists (select 1 from public.trends t where t.id = trend_signals.trend_id)
     and exists (select 1 from public.signals s where s.id = trend_signals.signal_id));

create policy trend_snapshots_read_visible on public.trend_snapshots for select to authenticated
  using (exists (select 1 from public.trends t where t.id = trend_snapshots.trend_id));

-- Sensitive source settings and run records are only visible to active admins.
create policy sources_admin_read on public.sources for select to authenticated
  using (exists (select 1 from public.profiles p
    where p.user_id = (select auth.uid()) and p.active and p.role = 'admin'
      and p.organization_id = sources.organization_id));

create policy source_runs_admin_read on public.source_runs for select to authenticated
  using (exists (select 1 from public.sources s where s.id = source_runs.source_id));

-- Client membership may be inspected by its own member. Admin workflows use
-- authenticated server-side endpoints, not broad client mutations.
create policy client_member_read_self on public.client_members for select to authenticated
  using (user_id = (select auth.uid()));

create policy clients_read_members_and_admins on public.clients for select to authenticated
  using (exists (select 1 from public.profiles p
    where p.user_id = (select auth.uid()) and p.active and p.organization_id = clients.organization_id
      and (p.role = 'admin' or exists
        (select 1 from public.client_members cm
         where cm.client_id = clients.id and cm.user_id = (select auth.uid())))));

create policy client_trends_read_visible on public.client_trends for select to authenticated
  using (exists (select 1 from public.clients c where c.id = client_trends.client_id)
     and exists (select 1 from public.trends t where t.id = client_trends.trend_id));

-- MVP: users can create personal boards only. Shared/client boards are created
-- by an authorized server handler after checking department/client rights.
create policy boards_read_own on public.boards for select to authenticated
  using (owner_id = (select auth.uid()) and exists
    (select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.active and p.organization_id = boards.organization_id));
create policy boards_insert_personal on public.boards for insert to authenticated
  with check (owner_id = (select auth.uid()) and visibility = 'personal' and client_id is null
    and exists (select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.active and p.organization_id = boards.organization_id));
create policy boards_update_own_personal on public.boards for update to authenticated
  using (owner_id = (select auth.uid()) and visibility = 'personal')
  with check (owner_id = (select auth.uid()) and visibility = 'personal' and client_id is null);

create policy board_items_read_own_board on public.board_items for select to authenticated
  using (exists (select 1 from public.boards b where b.id = board_items.board_id));
create policy board_items_insert_own_board on public.board_items for insert to authenticated
  with check (exists (select 1 from public.boards b join public.trends t
    on t.id = board_items.trend_id and t.organization_id = b.organization_id
    where b.id = board_items.board_id and b.owner_id = (select auth.uid())
      and b.visibility = 'personal'));
create policy board_items_delete_own_board on public.board_items for delete to authenticated
  using (exists (select 1 from public.boards b where b.id = board_items.board_id
    and b.owner_id = (select auth.uid()) and b.visibility = 'personal'));

-- Briefs and alerts are personal in the MVP; server-side client sharing later.
create policy briefs_read_own on public.briefs for select to authenticated
  using (author_id = (select auth.uid()) and exists
    (select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.active and p.organization_id = briefs.organization_id));
create policy alerts_read_own on public.alerts for select to authenticated
  using (owner_id = (select auth.uid()) and exists
    (select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.active and p.organization_id = alerts.organization_id));

create policy audits_admin_read on public.audit_events for select to authenticated
  using (exists (select 1 from public.profiles p
    where p.user_id = (select auth.uid()) and p.active and p.role = 'admin'
      and p.organization_id = audit_events.organization_id));

-- Explicit DATA API grants are separate from RLS. Mutations of source/trend/
-- client/admin tables remain service-only until approved secure write policies.
revoke all on public.organizations, public.profiles, public.sources,
  public.source_runs, public.signals, public.trends, public.trend_signals,
  public.trend_snapshots, public.clients, public.client_members,
  public.client_trends, public.boards, public.board_items,
  public.briefs, public.alerts, public.audit_events from anon;

grant select on public.organizations, public.profiles, public.sources,
  public.source_runs, public.signals, public.trends, public.trend_signals,
  public.trend_snapshots, public.clients, public.client_members,
  public.client_trends, public.boards, public.board_items,
  public.briefs, public.alerts, public.audit_events to authenticated;
grant insert, update on public.boards to authenticated;
grant insert, delete on public.board_items to authenticated;

-- Next steps BEFORE production:
-- 1. Create test users and org/role/client grants using trusted admin connection.
-- 2. Add safe, authorized server-side write endpoints for reviewer/client workflows.
-- 3. Verify client membership, tenant ID and trend ID consistency in endpoints.
-- 4. Add audit and retention implementation, storage bucket policies and indexes as needed.
-- 5. Run Supabase advisors, explicit anon/nonmember/inactive cross-client RLS tests.
