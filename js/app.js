// =============================================================
// 화면(UI) 로직
// =============================================================
(function () {
  'use strict';
  const CFG = window.APP_CONFIG || {};
  const S = {
    store: null, user: null, showLogin: false, tab: 'dash',
    categories: [], metrics: [], profiles: [], assignments: [],
    year: null, sel: null, editCat: null, editYear: 'all', charts: {},
  };

  // ---------- 유틸 ----------
  const $ = (s, r = document) => r.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // 정수는 정수로, 아니면 소수점 유지 (96.98 → '97.0' 으로 표시해 목표 97과 구분)
  const fmt = (v, d = 1) => (v == null || isNaN(v)) ? '-' : Number.isInteger(Number(v)) ? String(Number(v)) : Number(v).toFixed(d);
  const main = html => { $('#main').innerHTML = html; };
  function toast(msg, type = 'ok') {
    const t = $('#toast'); t.textContent = msg; t.className = 'show ' + type;
    clearTimeout(t._h); t._h = setTimeout(() => { t.className = ''; }, 2600);
  }
  function hexA(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return `rgba(37,99,235,${a})`;
    const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // ---------- 권한/계산 ----------
  const catByKey = k => S.categories.find(c => c.key === k);
  const isAdmin = () => S.user?.role === 'admin';
  const canEdit = k => !!S.user && (isAdmin() || (S.user.assignments || []).includes(k));
  const years = () => [...new Set(S.metrics.map(m => m.year))].sort((a, b) => a - b);
  const DEPT_ORDER = (CFG.DEPARTMENTS || []).map(d => d[0]);
  const deptGroup = d => (CFG.DEPARTMENTS || []).find(x => x[0] === d)?.[1] || '';
  const deptRank = d => { const i = DEPT_ORDER.indexOf(d); return i < 0 ? 9999 : i; };
  const depts = k => [...new Set(S.metrics.filter(m => m.category_key === k && m.department !== '전체').map(m => m.department))]
    .sort((a, b) => deptRank(a) - deptRank(b) || a.localeCompare(b, 'ko'));
  const findRow = (k, y, d) => S.metrics.find(m => m.category_key === k && m.year === y && m.department === d);
  const tgt = (cat, row) => (row && row.target != null) ? row.target : (cat.target ?? null);

  // '전체' 행이 있으면 그 값을, 없으면 학과 평균을 전체 값으로 사용
  function overall(k, y) {
    const cat = catByKey(k); const rows = S.metrics.filter(m => m.category_key === k && m.year === y);
    if (!rows.length) return null;
    const tot = rows.find(r => r.department === '전체');
    if (tot) return { value: tot.value, target: tgt(cat, tot) };
    const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
    const ts = rows.filter(r => r.target != null).map(r => r.target);
    return { value: avg(rows.map(r => r.value)), target: ts.length ? avg(ts) : tgt(cat, null) };
  }
  function achieve(cat, v, t) {
    if (v == null || t == null || !t) return null;
    return cat.higher_is_better ? v / t * 100 : (v <= 0 ? 150 : t / v * 100);
  }
  function meets(cat, v, t) { if (t == null || v == null) return null; return cat.higher_is_better ? v >= t : v <= t; }
  function roleLabel(u) {
    if (u.role === 'admin') return '관리자';
    const names = (u.assignments || []).map(k => catByKey(k)?.name).filter(Boolean);
    return names.length ? names.join(', ') + ' 담당' : '열람';
  }
  const nameOf = id => { const p = S.profiles.find(x => x.id === id); return p ? (p.display_name || p.username) : ''; };
  function whoWhen(r) {
    if (!r.updated_at) return '-';
    const d = new Date(r.updated_at); const w = nameOf(r.updated_by);
    return `${d.toLocaleDateString('ko-KR')} ${d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}${w ? ' · ' + esc(w) : ''}`;
  }

  // ---------- 데이터 로딩 ----------
  async function loadData() {
    const [cats, mets] = await Promise.all([S.store.listCategories(), S.store.listMetrics()]);
    S.categories = cats.map(c => ({ ...c, target: c.target == null ? null : Number(c.target), sort_order: Number(c.sort_order || 0) }));
    S.metrics = mets.map(m => ({ ...m, year: Number(m.year), value: Number(m.value), target: m.target == null ? null : Number(m.target) }));
    if (S.user) {
      try {
        [S.profiles, S.assignments] = await Promise.all([S.store.listProfiles(), S.store.listAssignments()]);
        const me = S.profiles.find(p => p.id === S.user.id);
        if (me) S.user.role = me.role;
        S.user.assignments = S.assignments.filter(a => a.user_id === S.user.id).map(a => a.category_key);
      } catch (e) { S.profiles = []; S.assignments = []; }
    } else { S.profiles = []; S.assignments = []; }
    const ys = years();
    if (!S.year || !ys.includes(S.year)) S.year = ys[ys.length - 1] ?? new Date().getFullYear();
    if (!S.sel || !catByKey(S.sel)) S.sel = S.categories[0]?.key;
  }

  // ---------- 렌더링 ----------
  function destroyCharts() { Object.values(S.charts).forEach(c => c?.destroy()); S.charts = {}; }

  function renderHeader() {
    $('#schoolName').textContent = CFG.SCHOOL_NAME || '전문대학교';
    $('#schoolTagline').textContent = CFG.SCHOOL_TAGLINE || '학사 성과 지표 대시보드';
    document.title = `${CFG.SCHOOL_NAME || ''} 학사 성과 지표 대시보드`;
    const tabs = [['dash', '대시보드']];
    if (S.user) { tabs.push(['edit', '데이터 관리']); if (isAdmin()) tabs.push(['admin', '관리자']); tabs.push(['me', '내 계정']); }
    if (!tabs.some(t => t[0] === S.tab)) S.tab = 'dash';
    $('#tabs').innerHTML = S.showLogin ? '' : tabs.map(([k, l]) => `<button class="tab ${S.tab === k ? 'active' : ''}" data-tab="${k}">${l}</button>`).join('');
    $('#userBox').innerHTML = S.user
      ? `<span class="who"><b>${esc(S.user.display_name || S.user.username)}</b><span class="role role-${esc(S.user.role)}">${esc(roleLabel(S.user))}</span></span><button class="btn ghost sm" id="logoutBtn">로그아웃</button>`
      : (S.showLogin ? '' : `<button class="btn sm" id="loginBtn">로그인</button>`);
  }

  function render() {
    renderHeader();
    $('#demoBanner').classList.toggle('hidden', S.store.mode !== 'demo');
    destroyCharts();
    if (S.showLogin) return renderLogin();
    ({ dash: renderDash, edit: renderEdit, admin: renderAdmin, me: renderMe })[S.tab]();
  }

  // ----- 로그인 -----
  function renderLogin() {
    const demo = S.store.mode === 'demo' ? `
      <div class="demo-accounts"><b>데모 계정</b> (클릭하면 자동 입력)
        <button type="button" data-fill="admin|admin1234">admin / admin1234 <span>관리자</span></button>
        <button type="button" data-fill="admission|1234">admission / 1234 <span>충원율 담당</span></button>
        <button type="button" data-fill="employment|1234">employment / 1234 <span>취업률 담당</span></button>
        <button type="button" data-fill="academic|1234">academic / 1234 <span>국시·중도탈락·교원 담당</span></button>
        <button type="button" data-fill="viewer|1234">viewer / 1234 <span>열람 전용</span></button>
      </div>` : '';
    main(`<div class="login-wrap"><form class="login-card" id="loginForm">
      <div class="login-logo">▦</div>
      <h2>${esc(CFG.SCHOOL_NAME)}</h2><p class="muted">${esc(CFG.SCHOOL_TAGLINE || '학사 성과 지표 대시보드')}</p>
      <label>아이디<input name="uid" autocomplete="username" required autofocus></label>
      <label>비밀번호<input name="upw" type="password" autocomplete="current-password" required></label>
      <div class="err" id="loginErr"></div>
      <button class="btn block" type="submit">로그인</button>
      ${CFG.REQUIRE_LOGIN_TO_VIEW ? '' : '<button type="button" class="btn ghost block" id="cancelLogin">로그인 없이 보기</button>'}
      ${demo}
    </form></div>`);
  }

  // ----- 대시보드 -----
  function kpiCard(cat) {
    const cur = overall(cat.key, S.year), prev = overall(cat.key, S.year - 1);
    const v = cur?.value, t = cur?.target, unit = cat.unit || '';
    const a = cur ? achieve(cat, v, t) : null, ok = cur ? meets(cat, v, t) : null;
    const pct = v == null ? 0 : unit === '%' ? Math.max(0, Math.min(100, v)) : Math.max(0, Math.min(100, a ?? 0));
    let delta = '<span class="muted">전년 자료 없음</span>';
    if (cur && prev) {
      const d = v - prev.value, good = cat.higher_is_better ? d >= 0 : d <= 0;
      delta = `<span class="delta ${Math.abs(d) < 0.05 ? 'flat' : good ? 'good' : 'bad'}">${d > 0.05 ? '▲' : d < -0.05 ? '▼' : '■'} ${fmt(Math.abs(d))}${unit === '%' ? '%p' : esc(unit)} <small>전년 대비</small></span>`;
    }
    return `<article class="kpi ${S.sel === cat.key ? 'selected' : ''}" data-cat="${esc(cat.key)}" style="--c:${esc(cat.color || '#2563eb')}" title="클릭하면 아래 상세 그래프가 바뀝니다">
      <header><span class="kpi-name">${esc(cat.name)}</span>${canEdit(cat.key) ? '<span class="chip">✎ 편집 권한</span>' : ''}</header>
      <div class="kpi-body">
        <div class="ring" style="--p:${pct}"><div><b>${fmt(v)}</b><small>${esc(unit)}</small></div></div>
        <div class="kpi-meta">
          ${delta}
          <div>목표 ${fmt(t)}${esc(unit)} ${cat.higher_is_better ? '이상' : '이하'} ${ok == null ? '' : ok ? '<span class="tag ok">달성</span>' : '<span class="tag no">미달</span>'}</div>
          <div class="bar" title="막대: 현재 값 / 세로선: 목표"><i style="width:${unit === '%' ? pct : Math.min(100, a ?? 0)}%"></i>${unit === '%' && t != null ? `<b class="mark" style="left:${Math.max(0, Math.min(100, t))}%"></b>` : ''}</div>
          <small class="muted">목표 대비 ${fmt(a, 1)}%</small>
        </div>
      </div></article>`;
  }

  function heatmap(cat) {
    const ys = years(), ds = depts(cat.key);
    if (!ds.length) return '<p class="muted">학과별 데이터가 없습니다.</p>';
    const cell = (d, y) => {
      const r = findRow(cat.key, y, d);
      if (!r) return '<td class="hm empty">-</td>';
      const a = achieve(cat, r.value, tgt(cat, r));
      const hue = a == null ? 215 : Math.max(0, Math.min(130, (a - 80) / 25 * 130));
      return `<td class="hm" style="background:hsl(${hue} 70% ${a == null ? 93 : 84}%)" title="${esc(d)} ${y}년: ${fmt(r.value)}${esc(cat.unit)} (목표 대비 ${fmt(a, 0)}%)">${fmt(r.value)}</td>`;
    };
    return `<div class="hm-wrap"><table class="heat"><thead><tr><th>학과</th>${ys.map(y => `<th class="${y === S.year ? 'cur' : ''}">${y}</th>`).join('')}</tr></thead>
      <tbody>${ds.map((d, i) => { const g = deptGroup(d), newG = g && g !== deptGroup(ds[i - 1]);
        return `${newG ? `<tr class="grp"><td colspan="${ys.length + 1}">${esc(g)}</td></tr>` : ''}<tr><th>${esc(d)}</th>${ys.map(y => cell(d, y)).join('')}</tr>`; }).join('')}</tbody></table>
      <div class="legend-scale"><span>목표 미달</span><i></i><span>목표 초과</span></div></div>`;
  }

  function lastUpdated() {
    const r = S.metrics.filter(m => m.updated_at).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0];
    return r ? `최근 데이터 수정: ${whoWhen(r)} (${esc(catByKey(r.category_key)?.name || '')})` : '';
  }

  function renderDash() {
    if (!S.categories.length) { main('<div class="empty-state"><h2>등록된 지표 항목이 없습니다</h2><p class="muted">관리자 탭에서 항목을 추가하세요.</p></div>'); return; }
    const cat = catByKey(S.sel), ys = years();
    const manyDepts = depts(cat.key).length > 8;
    main(`
      <div class="toolbar">
        <div><h1>성과 지표 한눈에 보기</h1><p class="muted">카드를 클릭하면 아래 상세 그래프가 해당 항목으로 바뀝니다.</p></div>
        <div class="toolbar-r">
          <label class="inline">기준 연도 <select id="yearSel">${ys.map(y => `<option ${y === S.year ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
          <button class="btn ghost sm" id="csvBtn">CSV 다운로드</button>
        </div>
      </div>
      <section class="kpi-grid">${S.categories.map(kpiCard).join('')}</section>
      <section class="detail-head" style="--c:${esc(cat.color)}">
        <span class="dot"></span><h2>${esc(cat.name)}</h2><span class="muted">${esc(cat.description || '')}</span>
        ${canEdit(cat.key) ? `<button class="btn sm" data-goedit="${esc(cat.key)}">✎ 이 항목 데이터 수정</button>` : ''}
      </section>
      <section class="grid2">
        <div class="panel"><h3>연도별 추이</h3><p class="hint">범례의 학과명을 누르면 학과별 선을 켜고 끌 수 있습니다.</p><div class="chart-box ${manyDepts ? 'tall' : ''}"><canvas id="trendChart"></canvas></div></div>
        <div class="panel"><h3>${S.year}년 학과별 비교</h3><p class="hint">초록: 목표 달성 · 주황: 목표 미달 · 점선: 목표</p><div class="chart-box ${manyDepts ? 'tall' : ''}"><canvas id="deptChart"></canvas></div></div>
      </section>
      <section class="grid2">
        <div class="panel"><h3>${S.year}년 전체 항목 목표 달성도</h3><p class="hint">점선(100%) 바깥쪽이면 목표 달성입니다.</p><div class="chart-box"><canvas id="radarChart"></canvas></div></div>
        <div class="panel"><h3>학과 × 연도 히트맵</h3><p class="hint">초록에 가까울수록 목표 대비 양호합니다.</p>${heatmap(cat)}</div>
      </section>
      <p class="foot muted">${lastUpdated()}</p>`);
    drawCharts(cat);
  }

  function baseOpts(unit) {
    return {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmt(c.parsed.y)}${unit}` } } },
      scales: { y: { ticks: { callback: v => v + unit }, grid: { color: '#eef2f7' } }, x: { grid: { display: false } } },
    };
  }

  function drawCharts(cat) {
    if (!window.Chart) { toast('차트 라이브러리를 불러오지 못했습니다 (인터넷 연결 확인).', 'err'); return; }
    Chart.defaults.font.family = "'Pretendard', system-ui, 'Malgun Gothic', sans-serif";
    Chart.defaults.color = '#475569';
    const ys = years(), unit = cat.unit || '', ds = depts(cat.key);
    const ov = ys.map(y => overall(cat.key, y));
    const palette = ['#64748b', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#84cc16', '#f97316', '#06b6d4'];

    S.charts.trend = new Chart($('#trendChart'), {
      type: 'line',
      data: { labels: ys, datasets: [
        { label: '전체', data: ov.map(o => o ? +o.value.toFixed(1) : null), borderColor: cat.color, backgroundColor: hexA(cat.color, 0.12), fill: true, tension: 0.3, borderWidth: 3, pointRadius: 4 },
        { label: '목표', data: ov.map(o => o?.target ?? null), borderColor: '#94a3b8', borderDash: [6, 4], pointRadius: 0, fill: false },
        ...ds.map((d, i) => ({ label: d, data: ys.map(y => findRow(cat.key, y, d)?.value ?? null), borderColor: palette[i % palette.length], backgroundColor: palette[i % palette.length], borderWidth: 1.5, pointRadius: 2, tension: 0.3, hidden: true })),
      ] },
      options: baseOpts(unit),
    });

    const rows = ds.map(d => findRow(cat.key, S.year, d));
    const dOpts = baseOpts(unit); dOpts.plugins.legend = { display: false };
    dOpts.scales.x.ticks = { autoSkip: false, maxRotation: 60, minRotation: 45, font: { size: 11 } };
    const vals = rows.filter(Boolean).flatMap(r => [r.value, tgt(cat, r)]).filter(v => v != null);
    if (vals.length) dOpts.scales.y.min = Math.max(0, Math.floor((Math.min(...vals) - 8) / 10) * 10); // 차이가 잘 보이도록 축 확대
    S.charts.dept = new Chart($('#deptChart'), {
      data: { labels: ds, datasets: [
        { type: 'bar', label: `${S.year}년`, data: rows.map(r => r?.value ?? null), borderRadius: 6, maxBarThickness: 48,
          backgroundColor: rows.map(r => !r ? '#cbd5e1' : meets(cat, r.value, tgt(cat, r)) === false ? '#fb923c' : '#22c55e') },
        { type: 'line', label: '목표', data: rows.map(r => r ? tgt(cat, r) : null), borderColor: '#475569', borderDash: [6, 4], pointRadius: 0, fill: false },
      ] },
      options: dOpts,
    });

    const ach = S.categories.map(c => { const o = overall(c.key, S.year); const a = o ? achieve(c, o.value, o.target) : null; return a == null ? null : Math.min(130, +a.toFixed(1)); });
    S.charts.radar = new Chart($('#radarChart'), {
      type: 'radar',
      data: { labels: S.categories.map(c => c.name), datasets: [
        { label: '목표 달성도', data: ach, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,.18)', pointBackgroundColor: S.categories.map(c => c.color), pointRadius: 5, borderWidth: 2 },
        { label: '목표 (100%)', data: S.categories.map(() => 100), borderColor: '#94a3b8', borderDash: [5, 4], pointRadius: 0, fill: false, borderWidth: 1.5 },
      ] },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmt(c.parsed.r)}%` } } },
        scales: { r: { suggestedMin: 60, suggestedMax: 120, ticks: { callback: v => v + '%', backdropColor: 'transparent' }, pointLabels: { font: { size: 12, weight: '600' } } } } },
    });
  }

  function downloadCsv() {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['항목', '항목키', '연도', '학과', '값', '단위', '목표'].map(q).join(',')];
    S.metrics.slice().sort((a, b) => a.category_key.localeCompare(b.category_key) || a.year - b.year || a.department.localeCompare(b.department, 'ko'))
      .forEach(m => { const c = catByKey(m.category_key) || {}; lines.push([c.name, m.category_key, m.year, m.department, m.value, c.unit, tgt(c, m)].map(q).join(',')); });
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `성과지표_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ----- 데이터 관리 -----
  function renderEdit() {
    const cats = S.categories.filter(c => canEdit(c.key));
    if (!cats.length) {
      main(`<div class="empty-state"><h2>편집 권한이 있는 항목이 없습니다</h2><p class="muted">대시보드 열람은 가능합니다. 수정이 필요하면 관리자에게 담당 항목 지정을 요청하세요.</p></div>`);
      return;
    }
    if (!S.editCat || !canEdit(S.editCat)) S.editCat = cats[0].key;
    const cat = catByKey(S.editCat), ys = years();
    const rows = S.metrics.filter(m => m.category_key === cat.key && (S.editYear === 'all' || m.year === Number(S.editYear)))
      .sort((a, b) => b.year - a.year || a.department.localeCompare(b.department, 'ko'));
    const input = (n, v, extra = '') => `<input name="${n}" value="${esc(v ?? '')}" ${extra}>`;
    main(`
      <div class="toolbar"><div><h1>데이터 관리</h1><p class="muted">내가 담당하는 항목만 표시됩니다. 값을 고친 뒤 해당 행의 [저장]을 누르세요.</p></div></div>
      <div class="pills">${cats.map(c => `<button class="pill ${c.key === cat.key ? 'active' : ''}" data-editcat="${esc(c.key)}" style="--c:${esc(c.color)}">${esc(c.name)}</button>`).join('')}</div>
      <div class="panel">
        <div class="panel-head">
          <h3>${esc(cat.name)} <small class="muted">단위 ${esc(cat.unit)} · 기본 목표 ${fmt(cat.target)}${esc(cat.unit)} ${cat.higher_is_better ? '이상' : '이하'}</small></h3>
          <label class="inline">연도 <select id="editYearSel"><option value="all">전체</option>${ys.map(y => `<option ${String(y) === String(S.editYear) ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
        </div>
        <div class="table-scroll"><table class="grid-table">
          <thead><tr><th style="width:110px">연도</th><th>학과</th><th style="width:130px">값 (${esc(cat.unit)})</th><th style="width:150px">목표 <small>(비우면 기본값)</small></th><th>최근 수정</th><th></th></tr></thead>
          <tbody>
            <tr class="new-row" data-id="">
              <td>${input('year', S.year, 'type="number" min="2000" max="2100"')}</td>
              <td>${input('department', '', 'placeholder="학과명 (전체 값은 \'전체\')" list="deptList"')}</td>
              <td>${input('value', '', 'type="number" step="0.1"')}</td>
              <td>${input('target', '', 'type="number" step="0.1"')}</td>
              <td class="muted small">새 데이터</td>
              <td class="actions"><button class="btn sm" data-save>+ 추가</button></td>
            </tr>
            ${rows.map(r => `<tr data-id="${r.id}">
              <td>${input('year', r.year, 'type="number" min="2000" max="2100"')}</td>
              <td>${input('department', r.department, 'list="deptList"')}</td>
              <td>${input('value', r.value, 'type="number" step="0.1"')}</td>
              <td>${input('target', r.target, 'type="number" step="0.1"')}</td>
              <td class="muted small">${whoWhen(r)}</td>
              <td class="actions"><button class="btn sm" data-save>저장</button><button class="btn sm ghost danger" data-del>삭제</button></td>
            </tr>`).join('')}
          </tbody>
        </table></div>
        ${rows.length ? '' : '<p class="muted">표시할 데이터가 없습니다.</p>'}
        <datalist id="deptList">${['전체', ...depts(cat.key)].map(d => `<option value="${esc(d)}">`).join('')}</datalist>
        <div class="info">학과를 <code>전체</code>로 입력한 행이 있으면 대시보드의 전체 값으로 그 값을 사용하고, 없으면 학과 평균으로 계산합니다.</div>
      </div>`);
  }

  async function saveMetricRow(tr) {
    const g = n => tr.querySelector(`[name="${n}"]`).value.trim();
    const year = parseInt(g('year'), 10), department = g('department') || '전체', value = g('value'), target = g('target');
    if (!(year >= 2000 && year <= 2100)) throw new Error('연도를 올바르게 입력하세요.');
    if (value === '' || isNaN(Number(value))) throw new Error('값을 숫자로 입력하세요.');
    if (target !== '' && isNaN(Number(target))) throw new Error('목표를 숫자로 입력하세요.');
    const isNew = !tr.dataset.id;
    await S.store.upsertMetric({ id: isNew ? null : Number(tr.dataset.id), category_key: S.editCat, year, department, value: Number(value), target: target === '' ? null : Number(target) });
    await loadData(); render(); toast(isNew ? '추가되었습니다.' : '저장되었습니다.');
  }

  // ----- 관리자 -----
  function renderAdmin() {
    if (!isAdmin()) { S.tab = 'dash'; return render(); }
    const cats = S.categories, users = S.profiles.slice().sort((a, b) => (a.role === 'admin' ? -1 : 0) - (b.role === 'admin' ? -1 : 0) || a.username.localeCompare(b.username));
    const has = (u, k) => S.assignments.some(a => a.user_id === u.id && a.category_key === k);
    const createInfo = S.store.mode === 'demo'
      ? `<div class="form-row" id="addUserForm">
           <label>아이디<input name="nu_id" placeholder="예: dropout"></label>
           <label>이름<input name="nu_name" placeholder="예: 학생지원팀"></label>
           <label>비밀번호<input name="nu_pw" type="password"></label>
           <button class="btn sm" id="addUserBtn">계정 추가</button>
         </div>`
      : `<div class="info"><b>새 계정 추가 방법</b><br>
           Supabase 대시보드 → Authentication → Users → <b>Add user</b> → Create new user<br>
           이메일: <code>아이디@${esc(CFG.LOGIN_EMAIL_DOMAIN)}</code> · 비밀번호 입력 · <b>Auto Confirm User</b> 체크 → 생성하면 이 목록에 자동으로 나타납니다. (새로고침)</div>`;
    main(`
      <div class="toolbar"><div><h1>관리자</h1><p class="muted">계정별 역할과 담당 항목을 지정합니다. 체크하는 즉시 저장됩니다.</p></div></div>
      <div class="panel">
        <h3>계정 · 담당 지정</h3><p class="hint">체크된 항목만 해당 계정이 수정할 수 있습니다. 관리자는 모든 항목을 수정할 수 있습니다.</p>
        <div class="table-scroll"><table class="grid-table">
          <thead><tr><th>아이디</th><th>이름</th><th>역할</th>${cats.map(c => `<th class="c"><span class="dot-sm" style="background:${esc(c.color)}"></span>${esc(c.name)}</th>`).join('')}</tr></thead>
          <tbody>${users.map(u => `<tr>
            <td><b>${esc(u.username)}</b></td><td>${esc(u.display_name)}</td>
            <td><select data-role="${esc(u.id)}" ${u.id === S.user.id ? 'disabled title="본인 역할은 변경할 수 없습니다"' : ''}>
              <option value="user" ${u.role !== 'admin' ? 'selected' : ''}>일반</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>관리자</option></select></td>
            ${cats.map(c => `<td class="c"><input type="checkbox" data-assign="${esc(u.id)}|${esc(c.key)}" ${u.role === 'admin' ? 'checked disabled' : has(u, c.key) ? 'checked' : ''}></td>`).join('')}
          </tr>`).join('')}</tbody>
        </table></div>
        ${createInfo}
      </div>
      <div class="panel">
        <h3>지표 항목 관리</h3><p class="hint">새 지표(예: 장학금 수혜율, 교육비 환원율, 자격증 취득률)를 추가하면 대시보드 카드와 그래프가 자동으로 생깁니다. 키는 영문 소문자/숫자/_ 만 가능합니다.</p>
        <div class="table-scroll"><table class="grid-table cat-table">
          <thead><tr><th>키</th><th>이름</th><th>단위</th><th>기본 목표</th><th class="c">높을수록 좋음</th><th>색</th><th>순서</th><th>설명</th><th></th></tr></thead>
          <tbody>
            ${cats.map(c => catRow(c)).join('')}
            ${catRow({ key: '', name: '', unit: '%', target: '', higher_is_better: true, color: '#0ea5e9', sort_order: cats.length + 1, description: '' }, true)}
          </tbody>
        </table></div>
      </div>`);
  }
  function catRow(c, isNew = false) {
    return `<tr data-key="${esc(c.key)}" class="${isNew ? 'new-row' : ''}">
      <td>${isNew ? '<input name="key" placeholder="scholarship">' : `<code>${esc(c.key)}</code>`}</td>
      <td><input name="name" value="${esc(c.name)}" placeholder="${isNew ? '장학금 수혜율' : ''}"></td>
      <td><input name="unit" value="${esc(c.unit)}" style="width:60px;min-width:60px"></td>
      <td><input name="target" type="number" step="0.1" value="${esc(c.target ?? '')}"></td>
      <td class="c"><input name="hib" type="checkbox" ${c.higher_is_better ? 'checked' : ''}></td>
      <td><input name="color" type="color" value="${esc(c.color || '#2563eb')}" class="color"></td>
      <td><input name="sort_order" type="number" value="${esc(c.sort_order)}" style="width:64px;min-width:64px"></td>
      <td><input name="description" value="${esc(c.description || '')}"></td>
      <td class="actions">${isNew ? '<button class="btn sm" data-catsave>+ 추가</button>' : '<button class="btn sm" data-catsave>저장</button><button class="btn sm ghost danger" data-catdel>삭제</button>'}</td>
    </tr>`;
  }
  async function saveCatRow(tr) {
    const g = n => tr.querySelector(`[name="${n}"]`);
    const key = tr.dataset.key || g('key').value.trim();
    if (!/^[a-z0-9_]+$/.test(key)) throw new Error('키는 영문 소문자, 숫자, _ 만 사용할 수 있습니다.');
    if (!tr.dataset.key && catByKey(key)) throw new Error('이미 있는 키입니다.');
    const name = g('name').value.trim(); if (!name) throw new Error('이름을 입력하세요.');
    const t = g('target').value.trim();
    await S.store.upsertCategory({ key, name, unit: g('unit').value.trim(), target: t === '' ? null : Number(t),
      higher_is_better: g('hib').checked, color: g('color').value, sort_order: Number(g('sort_order').value || 0), description: g('description').value.trim() });
    await loadData(); render(); toast('항목이 저장되었습니다.');
  }

  // ----- 내 계정 -----
  function renderMe() {
    const u = S.user;
    const chips = (u.assignments || []).map(k => catByKey(k)).filter(Boolean).map(c => `<span class="pill active static" style="--c:${esc(c.color)}">${esc(c.name)}</span>`).join(' ');
    main(`
      <div class="toolbar"><div><h1>내 계정</h1></div></div>
      <div class="grid2">
        <div class="panel"><h3>계정 정보</h3>
          <table class="grid-table kv">
            <tr><th>아이디</th><td>${esc(u.username)}</td></tr>
            <tr><th>이름</th><td>${esc(u.display_name)}</td></tr>
            <tr><th>역할</th><td>${u.role === 'admin' ? '관리자 (모든 항목 수정 + 계정/항목 관리)' : '일반'}</td></tr>
            <tr><th>담당 항목</th><td>${u.role === 'admin' ? '전체' : chips || '<span class="muted">없음 (열람만 가능)</span>'}</td></tr>
          </table>
        </div>
        <div class="panel"><h3>비밀번호 변경</h3>
          <form id="pwForm" class="form-col">
            <label>새 비밀번호<input type="password" name="pw1" minlength="8" required autocomplete="new-password"></label>
            <label>새 비밀번호 확인<input type="password" name="pw2" minlength="8" required autocomplete="new-password"></label>
            <button class="btn" type="submit">변경</button>
          </form>
        </div>
      </div>
      ${S.store.mode === 'demo' ? '<div class="panel"><h3>데모 데이터 초기화</h3><p class="hint">예시 데이터와 데모 계정을 처음 상태로 되돌립니다.</p><button class="btn ghost danger" id="resetDemo">초기화</button></div>' : ''}`);
  }

  // ---------- 이벤트 ----------
  async function guard(btn, fn) {
    if (btn) btn.disabled = true;
    try { await fn(); } catch (err) { toast(err.message || String(err), 'err'); } finally { if (btn && document.body.contains(btn)) btn.disabled = false; }
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('button, .kpi'); if (!t) return;
    if (t.dataset.tab) { S.tab = t.dataset.tab; render(); return; }
    if (t.id === 'loginBtn') { S.showLogin = true; render(); return; }
    if (t.id === 'cancelLogin') { S.showLogin = false; render(); return; }
    if (t.id === 'logoutBtn') return guard(t, async () => {
      await S.store.signOut(); S.user = null; S.tab = 'dash'; S.showLogin = !!CFG.REQUIRE_LOGIN_TO_VIEW;
      if (!S.showLogin) await loadData();
      render(); toast('로그아웃되었습니다.');
    });
    if (t.dataset.fill) { const [id, pw] = t.dataset.fill.split('|'); $('#loginForm [name=uid]').value = id; $('#loginForm [name=upw]').value = pw; return; }
    if (t.classList.contains('kpi')) { S.sel = t.dataset.cat; render(); return; }
    if (t.dataset.goedit) { S.tab = 'edit'; S.editCat = t.dataset.goedit; render(); return; }
    if (t.id === 'csvBtn') { downloadCsv(); return; }
    if (t.dataset.editcat) { S.editCat = t.dataset.editcat; render(); return; }
    if (t.hasAttribute('data-save')) return guard(t, () => saveMetricRow(t.closest('tr')));
    if (t.hasAttribute('data-del')) return guard(t, async () => {
      if (!confirm('이 데이터를 삭제할까요?')) return;
      await S.store.deleteMetric(Number(t.closest('tr').dataset.id)); await loadData(); render(); toast('삭제되었습니다.');
    });
    if (t.hasAttribute('data-catsave')) return guard(t, () => saveCatRow(t.closest('tr')));
    if (t.hasAttribute('data-catdel')) return guard(t, async () => {
      const key = t.closest('tr').dataset.key;
      if (!confirm(`'${catByKey(key)?.name}' 항목과 그 항목의 모든 데이터가 삭제됩니다. 계속할까요?`)) return;
      await S.store.deleteCategory(key); await loadData(); render(); toast('항목이 삭제되었습니다.');
    });
    if (t.id === 'addUserBtn') return guard(t, async () => {
      const f = $('#addUserForm'); const id = f.querySelector('[name=nu_id]').value.trim();
      const name = f.querySelector('[name=nu_name]').value.trim(), pw = f.querySelector('[name=nu_pw]').value;
      if (!/^[a-zA-Z0-9_.-]+$/.test(id)) throw new Error('아이디는 영문/숫자로 입력하세요.');
      if (pw.length < 4) throw new Error('비밀번호를 입력하세요.');
      await S.store.createUser({ username: id, display_name: name, password: pw }); await loadData(); render(); toast('계정이 추가되었습니다. 담당 항목을 체크하세요.');
    });
    if (t.id === 'resetDemo') return guard(t, async () => {
      if (!confirm('데모 데이터를 초기화할까요?')) return;
      await S.store.resetDemo(); S.user = null; S.showLogin = !!CFG.REQUIRE_LOGIN_TO_VIEW; S.tab = 'dash'; await loadData(); render(); toast('초기화되었습니다.');
    });
  });

  document.addEventListener('change', async e => {
    const t = e.target;
    if (t.id === 'yearSel') { S.year = Number(t.value); render(); return; }
    if (t.id === 'editYearSel') { S.editYear = t.value; render(); return; }
    if (t.dataset.role) return guard(null, async () => {
      try { await S.store.setRole(t.dataset.role, t.value); toast('역할이 변경되었습니다.'); }
      finally { await loadData(); render(); }
    });
    if (t.dataset.assign) return guard(null, async () => {
      const [uid, key] = t.dataset.assign.split('|');
      try { await S.store.setAssignment(uid, key, t.checked); toast(t.checked ? '담당이 지정되었습니다.' : '담당이 해제되었습니다.'); }
      finally { await loadData(); render(); }
    });
  });

  document.addEventListener('submit', e => {
    const f = e.target;
    if (f.getAttribute('id') === 'loginForm') {
      e.preventDefault();
      const btn = f.querySelector('button[type=submit]'); btn.disabled = true; $('#loginErr').textContent = '';
      (async () => {
        try {
          S.user = await S.store.signIn(f.querySelector('[name=uid]').value, f.querySelector('[name=upw]').value);
        } catch (err) { $('#loginErr').textContent = err.message; btn.disabled = false; return; }
        S.showLogin = false; S.tab = 'dash';
        try { await loadData(); } catch (err) { toast(err.message, 'err'); }
        render(); toast(`${S.user.display_name || S.user.username}님, 환영합니다.`);
      })();
    }
    if (f.getAttribute('id') === 'pwForm') {
      e.preventDefault();
      const p1 = f.querySelector('[name=pw1]').value, p2 = f.querySelector('[name=pw2]').value;
      if (p1 !== p2) { toast('두 비밀번호가 다릅니다.', 'err'); return; }
      guard(f.querySelector('button'), async () => { await S.store.changePassword(p1); f.reset(); toast('비밀번호가 변경되었습니다.'); });
    }
  });

  // ---------- 시작 ----------
  async function boot() {
    S.store = window.createStore();
    try {
      await S.store.init();
      S.user = await S.store.getSession();
      if (!S.user && CFG.REQUIRE_LOGIN_TO_VIEW) { S.showLogin = true; render(); return; }
      await loadData(); render();
    } catch (err) {
      console.error(err);
      main(`<div class="empty-state"><h2>데이터를 불러오지 못했습니다</h2><p class="muted">${esc(err.message)}</p><p class="muted">config.js의 Supabase 설정과 schema.sql 실행 여부를 확인하세요.</p></div>`);
    }
  }
  boot();
})();
