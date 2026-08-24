-- Han Mobile — Supabase 스키마
--
-- 적용 방법: Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여넣고 Run.
--
-- ⚠ 아래 RLS 정책은 "익명 사용자에게 전체 읽기/쓰기를 허용"한다.
--   실습용 미니어처 주차장을 전제로 한 설정이다.
--   외부에 공개되는 환경이라면 반드시 "인증 사용자만" 절로 바꿔야 한다 (파일 하단 참고).

-- ── 테이블 ──────────────────────────────────────────────────────

create table if not exists public.vehicles (
  id               uuid        primary key default gen_random_uuid(),

  car_number       text        not null,
  vehicle_id       text        not null default 'A',
  max_capacity_mws numeric     not null,          -- 최대 용량 (mW·s = mJ)
  battery_pct      numeric     not null default 0,-- 현재 잔량 (%)
  power_mw         numeric     not null default 0,-- 실측 충전 전력 (mW)

  zone             text,                          -- 'A1' ~ 'C6', 미배정이면 null
  status           text        not null default 'waiting',

  entry_at         timestamptz not null,
  exit_at          timestamptz not null,
  departed_at      timestamptz,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint vehicles_battery_range check (battery_pct >= 0 and battery_pct <= 100),
  constraint vehicles_capacity_positive check (max_capacity_mws > 0),
  constraint vehicles_status_valid
    check (status in ('waiting', 'charging', 'done', 'departed')),
  constraint vehicles_zone_valid
    check (zone is null or zone ~ '^[A-C][1-6]$'),
  constraint vehicles_exit_after_entry check (exit_at > entry_at)
);

comment on table  public.vehicles is '18구역 무선충전 주차장의 입차 차량';
comment on column public.vehicles.max_capacity_mws is '아두이노 Vehicle.maxCapacity_mWs 와 같은 값';
comment on column public.vehicles.power_mw is 'INA219 실측 전력. 충전 중이 아니면 0';

-- 한 구역에 두 대가 들어가지 않도록. 출차한 차는 제약에서 빠진다.
create unique index if not exists vehicles_active_zone_uniq
  on public.vehicles (zone)
  where status <> 'departed' and zone is not null;

create index if not exists vehicles_status_idx on public.vehicles (status);
create index if not exists vehicles_entry_at_idx on public.vehicles (entry_at);

-- ── updated_at 자동 갱신 ────────────────────────────────────────

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists vehicles_touch_updated_at on public.vehicles;
create trigger vehicles_touch_updated_at
  before update on public.vehicles
  for each row execute function public.touch_updated_at();

-- ── Realtime (나중에 supabase-js 로 전환할 때 필요) ──────────────

alter table public.vehicles replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'vehicles'
  ) then
    alter publication supabase_realtime add table public.vehicles;
  end if;
end
$$;

-- ── RLS ─────────────────────────────────────────────────────────

alter table public.vehicles enable row level security;

drop policy if exists vehicles_anon_all on public.vehicles;

-- [실습용] 익명 키로 전체 접근 허용
create policy vehicles_anon_all
  on public.vehicles
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- [운영용으로 바꿀 때]
--   위 정책을 지우고 아래처럼 로그인 사용자만 허용한다.
--   앱 쪽에도 로그인 화면을 붙여야 한다.
--
--   drop policy vehicles_anon_all on public.vehicles;
--
--   create policy vehicles_authenticated_all
--     on public.vehicles for all to authenticated
--     using (true) with check (true);
