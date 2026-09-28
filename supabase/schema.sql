-- =====================================================================
-- 춘해보건대학교 학사 성과지표 대시보드 - Supabase 스키마 + 권한(RLS)
-- 사용법: Supabase 대시보드 > SQL Editor > New query 에 전체 붙여넣고 [Run]
-- 여러 번 실행해도 안전하도록 작성되어 있습니다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) 테이블
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text unique not null,              -- 로그인 아이디 (이메일 @ 앞부분)
  display_name text,
  role         text not null default 'user' check (role in ('admin', 'user')),
  created_at   timestamptz not null default now()
);

create table if not exists public.categories (       -- 지표 항목 (입학률, 취업률 ...)
  key              text primary key check (key ~ '^[a-z0-9_]+$'),
  name             text not null,
  unit             text not null default '%',
  target           numeric,                          -- 기본 목표값
  higher_is_better boolean not null default true,    -- 중도탈락률처럼 낮을수록 좋으면 false
  color            text not null default '#2563eb',
  description      text,
  sort_order       int not null default 0
);

create table if not exists public.assignments (      -- 계정별 담당 항목
  user_id      uuid references public.profiles(id) on delete cascade,
  category_key text references public.categories(key) on delete cascade on update cascade,
  primary key (user_id, category_key)
);

create table if not exists public.metrics (          -- 실제 수치
  id           bigint generated always as identity primary key,
  category_key text not null references public.categories(key) on delete cascade on update cascade,
  year         int  not null check (year between 2000 and 2100),
  department   text not null default '전체',
  value        numeric not null,
  target       numeric,                              -- 비우면 항목의 기본 목표 사용
  updated_by   uuid references public.profiles(id) on delete set null,
  updated_at   timestamptz not null default now(),
  unique (category_key, year, department)
);

-- ---------------------------------------------------------------------
-- 2) 권한 확인 함수
-- ---------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.can_edit(cat text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.assignments where user_id = auth.uid() and category_key = cat
  );
$$;

-- ---------------------------------------------------------------------
-- 3) 트리거: 계정 생성 시 프로필 자동 생성 / 수정자·수정시각 자동 기록
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name)
  values (new.id,
          split_part(new.email, '@', 1),
          coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 이 스크립트 실행 전에 이미 만든 계정이 있다면 프로필 보정
insert into public.profiles (id, username, display_name)
select id, split_part(email, '@', 1), split_part(email, '@', 1) from auth.users
on conflict (id) do nothing;

create or replace function public.stamp_metric() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists metrics_stamp on public.metrics;
create trigger metrics_stamp
  before insert or update on public.metrics
  for each row execute function public.stamp_metric();

-- ---------------------------------------------------------------------
-- 4) Row Level Security (실제 보안은 여기서 결정됩니다)
--    - 로그인한 사용자: 전체 열람 가능
--    - 수치(metrics) 수정: 관리자 또는 해당 항목 담당자만
--    - 항목/역할/담당 지정: 관리자만
-- ---------------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.categories  enable row level security;
alter table public.assignments enable row level security;
alter table public.metrics     enable row level security;

grant usage on schema public to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.categories, public.assignments, public.metrics to authenticated;
grant execute on function public.is_admin(), public.can_edit(text) to anon, authenticated;

-- profiles
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (true);
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- categories
drop policy if exists categories_read on public.categories;
create policy categories_read on public.categories for select to authenticated using (true);
drop policy if exists categories_admin_insert on public.categories;
create policy categories_admin_insert on public.categories for insert to authenticated with check (public.is_admin());
drop policy if exists categories_admin_update on public.categories;
create policy categories_admin_update on public.categories for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists categories_admin_delete on public.categories;
create policy categories_admin_delete on public.categories for delete to authenticated using (public.is_admin());

-- assignments
drop policy if exists assignments_read on public.assignments;
create policy assignments_read on public.assignments for select to authenticated using (true);
drop policy if exists assignments_admin_insert on public.assignments;
create policy assignments_admin_insert on public.assignments for insert to authenticated with check (public.is_admin());
drop policy if exists assignments_admin_update on public.assignments;
create policy assignments_admin_update on public.assignments for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists assignments_admin_delete on public.assignments;
create policy assignments_admin_delete on public.assignments for delete to authenticated using (public.is_admin());

-- metrics
drop policy if exists metrics_read on public.metrics;
create policy metrics_read on public.metrics for select to authenticated using (true);
drop policy if exists metrics_insert on public.metrics;
create policy metrics_insert on public.metrics for insert to authenticated with check (public.can_edit(category_key));
drop policy if exists metrics_update on public.metrics;
create policy metrics_update on public.metrics for update to authenticated
  using (public.can_edit(category_key)) with check (public.can_edit(category_key));
drop policy if exists metrics_delete on public.metrics;
create policy metrics_delete on public.metrics for delete to authenticated using (public.can_edit(category_key));

-- ---------------------------------------------------------------------
-- 5) 예시 데이터 (필요 없으면 이 블록은 실행하지 않아도 됩니다)
--    춘해보건대학교 17개 학과 기준. 수치는 화면 확인용 "가상 데이터"입니다.
--    실제 운영 전에는 아래 명령으로 지우고 실제 공시 자료를 입력하세요:
--      delete from public.metrics;
-- ---------------------------------------------------------------------
insert into public.categories (key, name, unit, target, higher_is_better, color, sort_order, description) values
  ('admission',  '신입생 충원율',   '%', 97, true,  '#2563eb', 1, '모집(입학)정원 대비 입학자 비율'),
  ('enrollment', '재학생 충원율',   '%', 97, true,  '#0891b2', 2, '편제정원 대비 재학생 비율'),
  ('employment', '취업률',          '%', 80, true,  '#16a34a', 3, '졸업자(진학·입대 등 제외) 중 취업자 비율'),
  ('retention',  '유지취업률',      '%', 82, true,  '#65a30d', 4, '취업 후 일정 기간 취업 상태를 유지한 비율'),
  ('license',    '국가시험 합격률', '%', 92, true,  '#0d9488', 5, '보건의료 면허 국가시험(간호사·물리치료사·치과위생사 등) 응시자 대비 합격자 비율'),
  ('dropout',    '중도탈락률',      '%', 5,  false, '#dc2626', 6, '재적학생 중 중도탈락 학생 비율 (낮을수록 좋음)'),
  ('faculty',    '전임교원 확보율', '%', 65, true,  '#9333ea', 7, '법정 교원 정원 대비 전임교원 비율')
on conflict (key) do nothing;

insert into public.metrics (category_key, year, department, value)
select c.key, y, d.name,
       round(least(100, greatest(0,
         c.base + (y - 2021) * c.slope + d.off * c.spread + (((y * 7 + d.idx * 3 + c.idx * 5) % 5) - 2) * 0.4
       ))::numeric, 1)
from (values ('admission', 1, 94.0, 0.8, 1.0), ('enrollment', 2, 92.0, 1.0, 1.0), ('employment', 3, 77.0, 1.2, 1.3),
             ('retention', 4, 79.0, 0.9, 0.8), ('license', 5, 88.0, 0.9, 0.9), ('dropout', 6, 7.0, -0.45, -0.4),
             ('faculty', 7, 58.0, 1.8, 0.9))
     as c(key, idx, base, slope, spread)
cross join generate_series(2021, 2025) as y
cross join (values
     ('간호학부', 1, 4.0, true), ('물리치료학과', 2, 5.0, true), ('치위생과', 3, 3.0, true), ('작업치료과', 4, 2.0, true),
     ('응급구조과', 5, 2.5, true), ('방사선과', 6, 3.0, true), ('언어치료과', 7, 0.5, true), ('유아교육과', 8, -1.0, false),
     ('보건행정과', 9, 0.0, false), ('요가과', 10, -2.5, false), ('안경광학과', 11, 1.0, true), ('사회복지케어과', 12, -1.5, false),
     ('산림조경비즈니스과', 13, -3.0, false), ('웰니스문화관광과', 14, -3.5, false), ('평생교육상담과', 15, -2.0, false),
     ('글로벌케어과', 16, -4.0, false), ('글로벌뷰티과', 17, -2.5, false))
     as d(name, idx, off, lic)
where c.key <> 'license' or d.lic   -- 국가시험은 면허 대상 학과만
on conflict (category_key, year, department) do nothing;

-- ---------------------------------------------------------------------
-- 6) 계정을 만든 뒤 실행할 것 (README 3단계 참고)
-- ---------------------------------------------------------------------
-- 최초 관리자 지정 (아이디가 admin 인 계정):
--   update public.profiles set role = 'admin', display_name = '시스템 관리자' where username = 'admin';
-- 이후 담당 지정은 웹앱의 [관리자] 탭에서 체크박스로 하면 됩니다.

-- ---------------------------------------------------------------------
-- [선택] 로그인 없이 누구나 대시보드 "열람"만 허용하려면 아래 주석을 풀고 실행하세요.
--        그리고 js/config.js 의 REQUIRE_LOGIN_TO_VIEW 를 false 로 바꾸세요.
--        (수정 권한은 여전히 로그인 + 담당자만 가능합니다)
-- ---------------------------------------------------------------------
-- grant select on public.categories, public.metrics to anon;
-- drop policy if exists categories_public_read on public.categories;
-- create policy categories_public_read on public.categories for select to anon using (true);
-- drop policy if exists metrics_public_read on public.metrics;
-- create policy metrics_public_read on public.metrics for select to anon using (true);
