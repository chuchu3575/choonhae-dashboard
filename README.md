# 춘해보건대학교 학사 성과 지표 대시보드

춘해보건대학교(울산 울주군) 17개 학과의 신입생 충원율, 취업률, 국가시험 합격률, 중도탈락률 같은 지표를 카드, 원형 게이지, 추이 그래프, 학과별 막대, 레이더(목표 달성도), 히트맵으로 보여주는 웹앱입니다.

- **로그인한 사람만** 볼 수 있음 (설정으로 누구나 열람 가능하게 바꿀 수 있음)
- 계정마다 **담당 항목**(예: 입학 담당은 신입생·재학생 충원율)을 지정하면 **그 항목만 수정 가능**
- 관리자는 모든 항목 수정, 계정별 담당 지정, 지표 항목 추가/삭제 가능
- 누가 언제 수정했는지 자동 기록

## 구조

| 구성 | 역할 | 비용 |
|---|---|---|
| GitHub + GitHub Pages | 코드 보관 + 웹사이트 무료 호스팅 | 무료 |
| Supabase | 데이터베이스 + 로그인 + 권한 검사(RLS) | 무료 플랜으로 충분 |

> 왜 Supabase가 필요한가요? 정적 웹사이트(GitHub Pages)만으로는 비밀번호가 코드에 그대로 노출되고, 수정한 데이터가 다른 사람에게 공유되지 않습니다. 권한 검사는 반드시 서버(DB)에서 해야 안전합니다.

```
college-dashboard/
├─ index.html
├─ css/style.css
├─ js/config.js      ← 학교 이름, Supabase 주소/키 입력 (이 파일만 수정)
├─ js/data.js        ← 데이터 저장소 (Supabase / 데모)
├─ js/app.js         ← 화면 로직
└─ supabase/schema.sql ← DB 테이블 + 권한 정책
```

## 0. 먼저 체험하기 (데모 모드)

`index.html`을 더블클릭해 브라우저로 열면 바로 동작합니다. `config.js`에 Supabase 정보가 비어 있으면 데모 모드로 실행됩니다. 데모 모드는 데이터를 이 브라우저에만 저장하며 보안이 없습니다.

| 아이디 | 비밀번호 | 권한 |
|---|---|---|
| admin | admin1234 | 관리자 |
| admission | 1234 | 신입생·재학생 충원율 담당 |
| employment | 1234 | 취업률·유지취업률 담당 |
| academic | 1234 | 국가시험 합격률·중도탈락률·전임교원 확보율 담당 |

> 예시 수치는 화면 확인용 가상 데이터입니다. 실제 운영 시 대학알리미 등 공시 자료로 교체하세요. 학과 목록과 학제(4년제/3년제/2년제) 순서는 `config.js`의 `DEPARTMENTS`에서 바꿀 수 있습니다.
| viewer | 1234 | 열람 전용 |

## 1. Supabase 프로젝트 만들기

1. https://supabase.com 가입 → **New project** (Region: Northeast Asia (Seoul) 권장)
2. 왼쪽 메뉴 **SQL Editor** → New query → `supabase/schema.sql` 내용 전체 붙여넣기 → **Run**
3. **Authentication → Sign In / Providers**(또는 Settings)에서 **Allow new users to sign up 을 끄기** (중요: 아무나 가입하지 못하게)
4. **Project Settings → API** 에서 `Project URL`과 `anon public`(또는 publishable) 키 복사

## 2. config.js 설정

```js
SCHOOL_NAME: '춘해보건대학교',
SUPABASE_URL: 'https://xxxx.supabase.co',
SUPABASE_ANON_KEY: 'eyJ...',
LOGIN_EMAIL_DOMAIN: 'dashboard.local',
REQUIRE_LOGIN_TO_VIEW: true,
```

- anon 키는 공개되어도 되는 키입니다. GitHub에 올라가도 괜찮습니다. 실제 권한은 DB의 RLS 정책이 검사합니다.
- **service_role 키는 절대 넣지 마세요.**

## 3. 계정 만들기와 권한 지정

1. Supabase → **Authentication → Users → Add user → Create new user**
   - Email: `아이디@dashboard.local` (예: `admin@dashboard.local`, `admission@dashboard.local`)
   - Password 입력, **Auto Confirm User 체크**
   - 로그인 화면에서는 `@` 앞의 아이디만 입력하면 됩니다.
   - 비밀번호 찾기 메일까지 쓰고 싶다면 교직원 실제 메일(예: `hong@ch.ac.kr`)로 만들고 `LOGIN_EMAIL_DOMAIN: 'ch.ac.kr'`로 바꾸면 됩니다.
2. SQL Editor에서 최초 관리자 지정:
   ```sql
   update public.profiles set role = 'admin', display_name = '시스템 관리자' where username = 'admin';
   ```
3. 웹앱에 admin으로 로그인 → **관리자** 탭에서 계정별 담당 항목을 체크 (즉시 저장)
   - 이름(표시명) 변경: Supabase → Table Editor → profiles → display_name

## 4. GitHub에 올리고 배포하기

1. GitHub에서 새 저장소 생성 (예: `college-dashboard`)
2. 이 폴더의 파일을 전부 업로드 (**Add file → Upload files**로 드래그해도 됨)
3. 저장소 **Settings → Pages** → Source: `Deploy from a branch`, Branch: `main` / `(root)` → Save
4. 1~2분 뒤 `https://<GitHub아이디>.github.io/college-dashboard/` 로 접속

> 저장소를 Private으로 두고 Pages를 쓰려면 유료 플랜이 필요합니다. Public 저장소여도 데이터는 Supabase에 있고 로그인해야만 보이므로 안전합니다. 원하면 Netlify, Vercel, Cloudflare Pages로도 같은 파일을 그대로 배포할 수 있습니다.

## 5. 사용 방법

- **대시보드**: 기준 연도 선택, 카드 클릭 시 상세 그래프 전환, CSV 다운로드
- **데이터 관리**: 담당 항목만 표시. 연도/학과/값/목표 입력 후 저장. 학과를 `전체`로 입력하면 그 값이 전체 값으로 쓰이고, 없으면 학과 평균으로 계산됩니다.
- **관리자**: 역할(관리자/일반), 담당 항목 체크, 지표 항목 추가(예: 장학금 수혜율, 교육비 환원율, 자격증 취득률)
- **내 계정**: 비밀번호 변경

## 누구나 열람 가능하게 바꾸려면

1. `schema.sql` 맨 아래 **[선택]** 블록의 주석을 풀고 SQL Editor에서 실행
2. `config.js`에서 `REQUIRE_LOGIN_TO_VIEW: false`

이렇게 하면 누구나 대시보드를 볼 수 있고, 수정은 여전히 로그인한 담당자만 가능합니다.

## 보안 요약

- 화면에서 버튼을 숨기는 것은 편의 기능일 뿐이고, 실제 차단은 Supabase RLS 정책이 합니다. 개발자 도구로 요청을 조작해도 담당이 아닌 항목은 수정되지 않습니다.
- `metrics` 수정: `is_admin()` 또는 `assignments`에 해당 항목이 지정된 계정만
- `categories`, `assignments`, `profiles.role` 변경: 관리자만
- 회원가입(Sign up)을 꺼야 외부인이 계정을 만들 수 없습니다.
