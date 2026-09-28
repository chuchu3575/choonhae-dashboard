// =============================================================
// 데이터 계층: Supabase 모드 / 데모(localStorage) 모드
// 두 저장소는 같은 함수 이름을 제공하므로 app.js는 모드를 신경 쓰지 않습니다.
// =============================================================
(function () {
  'use strict';
  const CFG = window.APP_CONFIG || {};

  function toEmail(id) {
    id = String(id || '').trim();
    return id.includes('@') ? id : `${id}@${CFG.LOGIN_EMAIL_DOMAIN || 'dashboard.local'}`;
  }

  // ---------- 예시(시드) 데이터: supabase/schema.sql 과 동일한 규칙 ----------
  // 주의: 수치는 화면 확인용 가상 데이터입니다. 실제 공시 자료(대학알리미 등)로 교체하세요.
  const SEED_CATEGORIES = [
    { key: 'admission',  name: '신입생 충원율',     unit: '%', target: 97,  higher_is_better: true,  color: '#2563eb', sort_order: 1, description: '모집(입학)정원 대비 입학자 비율' },
    { key: 'enrollment', name: '재학생 충원율',     unit: '%', target: 97,  higher_is_better: true,  color: '#0891b2', sort_order: 2, description: '편제정원 대비 재학생 비율' },
    { key: 'employment', name: '취업률',            unit: '%', target: 80,  higher_is_better: true,  color: '#16a34a', sort_order: 3, description: '졸업자(진학·입대 등 제외) 중 취업자 비율' },
    { key: 'retention',  name: '유지취업률',        unit: '%', target: 82,  higher_is_better: true,  color: '#65a30d', sort_order: 4, description: '취업 후 일정 기간 취업 상태를 유지한 비율' },
    { key: 'license',    name: '국가시험 합격률',   unit: '%', target: 92,  higher_is_better: true,  color: '#0d9488', sort_order: 5, description: '보건의료 면허 국가시험(간호사·물리치료사·치과위생사 등) 응시자 대비 합격자 비율' },
    { key: 'dropout',    name: '중도탈락률',        unit: '%', target: 5,   higher_is_better: false, color: '#dc2626', sort_order: 6, description: '재적학생 중 중도탈락 학생 비율 (낮을수록 좋음)' },
    { key: 'faculty',    name: '전임교원 확보율',   unit: '%', target: 65,  higher_is_better: true,  color: '#9333ea', sort_order: 7, description: '법정 교원 정원 대비 전임교원 비율' },
  ];
  // [학과, 가상 편차, 국가시험 대상 여부]
  const SEED_DEPTS = [
    ['간호학부', 4.0, true], ['물리치료학과', 5.0, true], ['치위생과', 3.0, true], ['작업치료과', 2.0, true],
    ['응급구조과', 2.5, true], ['방사선과', 3.0, true], ['언어치료과', 0.5, true], ['유아교육과', -1.0, false],
    ['보건행정과', 0.0, false], ['요가과', -2.5, false], ['안경광학과', 1.0, true], ['사회복지케어과', -1.5, false],
    ['산림조경비즈니스과', -3.0, false], ['웰니스문화관광과', -3.5, false], ['평생교육상담과', -2.0, false],
    ['글로벌케어과', -4.0, false], ['글로벌뷰티과', -2.5, false],
  ];
  const SEED_PARAMS = { admission: [94, 0.8, 1.0], enrollment: [92, 1.0, 1.0], employment: [77, 1.2, 1.3], retention: [79, 0.9, 0.8], license: [88, 0.9, 0.9], dropout: [7.0, -0.45, -0.4], faculty: [58, 1.8, 0.9] };

  function seedMetrics() {
    const out = []; let id = 1;
    SEED_CATEGORIES.forEach((c, ci) => {
      const [base, slope, spread] = SEED_PARAMS[c.key];
      for (let y = 2021; y <= 2025; y++) {
        SEED_DEPTS.forEach(([d, off, lic], di) => {
          if (c.key === 'license' && !lic) return;
          const noise = ((((y * 7 + (di + 1) * 3 + (ci + 1) * 5) % 5) - 2) * 0.4);
          const v = Math.round(Math.min(100, Math.max(0, base + (y - 2021) * slope + off * spread + noise)) * 10) / 10;
          out.push({ id: id++, category_key: c.key, year: y, department: d, value: v, target: null, updated_by: null, updated_at: '2025-09-01T00:00:00Z' });
        });
      }
    });
    return out;
  }

  function seedDemo() {
    return {
      categories: SEED_CATEGORIES.map(c => ({ ...c })),
      metrics: seedMetrics(),
      users: [
        { id: 'u-admin', username: 'admin',      password: 'admin1234', display_name: '시스템 관리자',     role: 'admin' },
        { id: 'u-adm',   username: 'admission',  password: '1234',      display_name: '입학처 담당',       role: 'user' },
        { id: 'u-emp',   username: 'employment', password: '1234',      display_name: '취업지원센터 담당', role: 'user' },
        { id: 'u-aca',   username: 'academic',   password: '1234',      display_name: '교무처 담당',       role: 'user' },
        { id: 'u-view',  username: 'viewer',     password: '1234',      display_name: '열람 전용',         role: 'user' },
      ],
      assignments: [
        { user_id: 'u-adm', category_key: 'admission' },
        { user_id: 'u-adm', category_key: 'enrollment' },
        { user_id: 'u-emp', category_key: 'employment' },
        { user_id: 'u-emp', category_key: 'retention' },
        { user_id: 'u-aca', category_key: 'license' },
        { user_id: 'u-aca', category_key: 'dropout' },
        { user_id: 'u-aca', category_key: 'faculty' },
      ],
    };
  }

  // =============================================================
  // 데모 저장소 (localStorage) - 체험용. 보안 없음.
  // =============================================================
  const DEMO_KEY = 'chu_dash_demo_v2';
  const DEMO_SESSION = 'college_dash_demo_session';
  const DENY = '이 작업을 할 권한이 없습니다.';

  class DemoStore {
    constructor() { this.mode = 'demo'; }
    async init() { if (!localStorage.getItem(DEMO_KEY)) this._save(seedDemo()); }
    _db() { return JSON.parse(localStorage.getItem(DEMO_KEY)); }
    _save(db) { localStorage.setItem(DEMO_KEY, JSON.stringify(db)); }
    _uid() { return sessionStorage.getItem(DEMO_SESSION); }
    _me(db) { const u = db.users.find(x => x.id === this._uid()); if (!u) throw new Error('로그인이 필요합니다.'); return u; }
    _isAdmin(db) { return this._me(db).role === 'admin'; }
    _canEdit(db, cat) { const me = this._me(db); return me.role === 'admin' || db.assignments.some(a => a.user_id === me.id && a.category_key === cat); }
    _session(db, u) {
      return { id: u.id, username: u.username, display_name: u.display_name, role: u.role,
        assignments: db.assignments.filter(a => a.user_id === u.id).map(a => a.category_key) };
    }

    async getSession() { const db = this._db(); const u = db.users.find(x => x.id === this._uid()); return u ? this._session(db, u) : null; }
    async signIn(id, pw) {
      const db = this._db(); const u = db.users.find(x => x.username === String(id).trim());
      if (!u || u.password !== pw) throw new Error('아이디 또는 비밀번호가 올바르지 않습니다.');
      sessionStorage.setItem(DEMO_SESSION, u.id); return this._session(db, u);
    }
    async signOut() { sessionStorage.removeItem(DEMO_SESSION); }
    async changePassword(pw) { const db = this._db(); this._me(db).password = pw; this._save(db); }

    async listCategories() { return this._db().categories.sort((a, b) => a.sort_order - b.sort_order); }
    async listMetrics() { return this._db().metrics; }
    async listProfiles() { this._me(this._db()); return this._db().users.map(({ password, ...u }) => u); }
    async listAssignments() { return this._db().assignments; }

    async upsertMetric(m) {
      const db = this._db();
      if (!this._canEdit(db, m.category_key)) throw new Error(DENY);
      const dup = db.metrics.find(x => x.category_key === m.category_key && x.year === m.year && x.department === m.department && x.id !== m.id);
      if (dup) throw new Error('같은 연도·학과 데이터가 이미 있습니다.');
      const stamp = { updated_by: this._uid(), updated_at: new Date().toISOString() };
      if (m.id) {
        const row = db.metrics.find(x => x.id === m.id);
        if (!row || !this._canEdit(db, row.category_key)) throw new Error(DENY);
        Object.assign(row, { year: m.year, department: m.department, value: m.value, target: m.target }, stamp);
      } else {
        const id = Math.max(0, ...db.metrics.map(x => x.id)) + 1;
        db.metrics.push({ id, category_key: m.category_key, year: m.year, department: m.department, value: m.value, target: m.target, ...stamp });
      }
      this._save(db);
    }
    async deleteMetric(id) {
      const db = this._db(); const row = db.metrics.find(x => x.id === id);
      if (!row || !this._canEdit(db, row.category_key)) throw new Error(DENY);
      db.metrics = db.metrics.filter(x => x.id !== id); this._save(db);
    }
    async setRole(uid, role) {
      const db = this._db(); if (!this._isAdmin(db)) throw new Error(DENY);
      db.users.find(u => u.id === uid).role = role; this._save(db);
    }
    async setAssignment(uid, key, on) {
      const db = this._db(); if (!this._isAdmin(db)) throw new Error(DENY);
      db.assignments = db.assignments.filter(a => !(a.user_id === uid && a.category_key === key));
      if (on) db.assignments.push({ user_id: uid, category_key: key });
      this._save(db);
    }
    async upsertCategory(c) {
      const db = this._db(); if (!this._isAdmin(db)) throw new Error(DENY);
      const ex = db.categories.find(x => x.key === c.key);
      if (ex) Object.assign(ex, c); else db.categories.push({ ...c });
      this._save(db);
    }
    async deleteCategory(key) {
      const db = this._db(); if (!this._isAdmin(db)) throw new Error(DENY);
      db.categories = db.categories.filter(c => c.key !== key);
      db.metrics = db.metrics.filter(m => m.category_key !== key);
      db.assignments = db.assignments.filter(a => a.category_key !== key);
      this._save(db);
    }
    async createUser({ username, display_name, password }) {
      const db = this._db(); if (!this._isAdmin(db)) throw new Error(DENY);
      if (db.users.some(u => u.username === username)) throw new Error('이미 있는 아이디입니다.');
      db.users.push({ id: 'u-' + Date.now(), username, display_name: display_name || username, password, role: 'user' });
      this._save(db);
    }
    async resetDemo() { this._save(seedDemo()); sessionStorage.removeItem(DEMO_SESSION); }
  }

  // =============================================================
  // Supabase 저장소 - 실제 운영용. 권한은 DB의 RLS 정책이 최종 검사합니다.
  // =============================================================
  class SupabaseStore {
    constructor() {
      this.mode = 'supabase';
      this.sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    }
    async init() {}
    _err(error) {
      if (!error) return;
      if (error.code === '23505') throw new Error('같은 키(연도·학과 등)의 데이터가 이미 있습니다.');
      if (error.code === '42501') throw new Error(DENY);
      throw new Error(error.message);
    }
    async _all(table, order) {
      let from = 0, out = [];
      for (;;) {
        const { data, error } = await this.sb.from(table).select('*').order(order).range(from, from + 999);
        this._err(error); out = out.concat(data);
        if (data.length < 1000) break; from += 1000;
      }
      return out;
    }
    async _load(user) {
      const { data: p, error } = await this.sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
      this._err(error);
      if (!p) throw new Error('프로필이 없습니다. schema.sql을 실행했는지 확인하세요.');
      const { data: a } = await this.sb.from('assignments').select('category_key').eq('user_id', user.id);
      return { ...p, assignments: (a || []).map(x => x.category_key) };
    }
    async getSession() {
      const { data: { session } } = await this.sb.auth.getSession();
      return session ? this._load(session.user) : null;
    }
    async signIn(id, pw) {
      const { data, error } = await this.sb.auth.signInWithPassword({ email: toEmail(id), password: pw });
      if (error) throw new Error('아이디 또는 비밀번호가 올바르지 않습니다.');
      return this._load(data.user);
    }
    async signOut() { await this.sb.auth.signOut(); }
    async changePassword(pw) { const { error } = await this.sb.auth.updateUser({ password: pw }); this._err(error); }

    async listCategories() { return this._all('categories', 'sort_order'); }
    async listMetrics() { return this._all('metrics', 'id'); }
    async listProfiles() { return this._all('profiles', 'username'); }
    async listAssignments() { return this._all('assignments', 'user_id'); }

    async upsertMetric(m) {
      const row = { category_key: m.category_key, year: m.year, department: m.department, value: m.value, target: m.target };
      const q = m.id ? this.sb.from('metrics').update(row).eq('id', m.id).select()
                     : this.sb.from('metrics').insert(row).select();
      const { data, error } = await q; this._err(error);
      if (!data || !data.length) throw new Error(DENY); // RLS로 걸러지면 0행이 반환됨
    }
    async deleteMetric(id) {
      const { data, error } = await this.sb.from('metrics').delete().eq('id', id).select(); this._err(error);
      if (!data || !data.length) throw new Error(DENY);
    }
    async setRole(uid, role) {
      const { data, error } = await this.sb.from('profiles').update({ role }).eq('id', uid).select(); this._err(error);
      if (!data || !data.length) throw new Error(DENY);
    }
    async setAssignment(uid, key, on) {
      const q = on ? this.sb.from('assignments').upsert({ user_id: uid, category_key: key }, { ignoreDuplicates: true })
                   : this.sb.from('assignments').delete().match({ user_id: uid, category_key: key });
      const { error } = await q; this._err(error);
    }
    async upsertCategory(c) {
      const { data, error } = await this.sb.from('categories').upsert(c, { onConflict: 'key' }).select(); this._err(error);
      if (!data || !data.length) throw new Error(DENY);
    }
    async deleteCategory(key) {
      const { data, error } = await this.sb.from('categories').delete().eq('key', key).select(); this._err(error);
      if (!data || !data.length) throw new Error(DENY);
    }
    async createUser() { throw new Error('Supabase 모드에서는 Supabase 대시보드에서 계정을 만드세요.'); }
  }

  window.createStore = function () {
    const useSupabase = CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase;
    return useSupabase ? new SupabaseStore() : new DemoStore();
  };
})();
