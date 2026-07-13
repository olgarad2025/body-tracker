// ===== Инициализация Telegram Web App =====
const tg = window.Telegram?.WebApp;

function applyTheme() {
  if (!tg) return;
  const p = tg.themeParams || {};
  const root = document.documentElement.style;
  const set = (v, val) => val && root.setProperty(v, val);
  set('--bg', p.bg_color);
  set('--secondary-bg', p.secondary_bg_color || p.bg_color);
  set('--text', p.text_color);
  set('--hint', p.hint_color);
  set('--link', p.link_color);
  set('--button', p.button_color);
  set('--button-text', p.button_text_color);
  set('--accent', p.button_color);
}

function haptic(type = 'light') {
  try { tg?.HapticFeedback?.impactOccurred(type); } catch (_) {}
}
function hapticNotify(type = 'success') {
  try { tg?.HapticFeedback?.notificationOccurred(type); } catch (_) {}
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2200);
}

// ===== Состояние =====
let entries = [];
let activeMetric = METRICS[0].key;

// ===== Экран «Добавить замер» =====
function todayStr() {
  const d = new Date();
  const tzoff = d.getTimezoneOffset() * 60000;
  return new Date(d - tzoff).toISOString().slice(0, 10);
}

function buildAddForm() {
  document.getElementById('entry-date').value = todayStr();
  const grid = document.getElementById('metric-inputs');
  grid.innerHTML = '';
  for (const m of METRICS) {
    const label = document.createElement('label');
    label.className = 'metric-input-label';
    label.innerHTML = `
      <span><span class="metric-emoji">${m.emoji}</span> ${m.label}</span>
      <span class="row">
        <input type="number" inputmode="decimal" step="0.1" min="0"
               id="in-${m.key}" placeholder="—" />
        <span class="unit">${m.unit}</span>
      </span>`;
    grid.appendChild(label);
  }
}

// Подставляет в форму уже сохранённые значения за выбранную дату.
function prefillForSelectedDate() {
  const date = document.getElementById('entry-date').value;
  const existing = entries.find(e => e.date === date);
  for (const m of METRICS) {
    const input = document.getElementById('in-' + m.key);
    input.value = existing && existing.values[m.key] != null ? existing.values[m.key] : '';
  }
}

async function saveCurrentEntry() {
  const date = document.getElementById('entry-date').value;
  if (!date) { toast('Укажи дату'); return; }

  const values = {};
  for (const m of METRICS) {
    const raw = document.getElementById('in-' + m.key).value.trim();
    if (raw !== '') {
      const num = Number(raw.replace(',', '.'));
      if (!Number.isNaN(num)) values[m.key] = num;
    }
  }

  if (Object.keys(values).length === 0) {
    toast('Заполни хотя бы одно поле');
    hapticNotify('error');
    return;
  }

  try {
    await Store.saveEntry(date, values);
    hapticNotify('success');
    toast('Замер сохранён ✓');
    await reload();
  } catch (e) {
    toast('Ошибка сохранения');
    hapticNotify('error');
    console.error(e);
  }
}

// ===== Экран «Графики» =====
function buildMetricChips() {
  const wrap = document.getElementById('metric-chips');
  wrap.innerHTML = '';
  for (const m of METRICS) {
    const chip = document.createElement('button');
    chip.className = 'chip' + (m.key === activeMetric ? ' active' : '');
    chip.textContent = `${m.emoji} ${m.label}`;
    chip.onclick = () => {
      activeMetric = m.key;
      haptic('light');
      buildMetricChips();
      renderChartView();
    };
    wrap.appendChild(chip);
  }
}

function renderChartView() {
  const metric = METRIC_BY_KEY[activeMetric];
  document.getElementById('chart-title').textContent = `${metric.emoji} ${metric.label}`;

  const canvas = document.getElementById('chart');
  const { reg, stats } = renderChart(canvas, entries, activeMetric);

  // Бейдж тренда
  const badge = document.getElementById('trend-badge');
  const trend = describeTrend(reg, metric.unit);
  badge.textContent = trend.text;
  badge.className = 'trend-badge trend-' + trend.dir;

  // Статистика
  const row = document.getElementById('stats-row');
  if (!stats) {
    row.innerHTML = `<div class="empty" style="grid-column:1/-1">Нет данных по этому параметру</div>`;
    return;
  }
  const chg = stats.change;
  const chgStr = (chg > 0 ? '+' : '') + (Math.abs(chg) >= 10 ? chg.toFixed(0) : chg.toFixed(1));
  row.innerHTML = `
    <div class="stat"><div class="val">${fmt(stats.last)}</div><div class="lbl">Сейчас, ${metric.unit}</div></div>
    <div class="stat"><div class="val">${chgStr}</div><div class="lbl">Всего, ${metric.unit}</div></div>
    <div class="stat"><div class="val">${fmt(stats.min)}–${fmt(stats.max)}</div><div class="lbl">Мин–макс</div></div>`;
}

function fmt(n) {
  return Math.abs(n) >= 10 ? (Number.isInteger(n) ? n : n.toFixed(1)) : n.toFixed(1);
}

// ===== Экран «История» =====
function renderHistory() {
  const list = document.getElementById('history-list');
  if (!entries.length) {
    list.innerHTML = `<div class="empty">Пока нет замеров.<br>Добавь первый на вкладке «➕ Замер».</div>`;
    return;
  }
  list.innerHTML = '';
  // Показываем от новых к старым.
  for (const e of [...entries].reverse()) {
    const div = document.createElement('div');
    div.className = 'hist-entry';
    const dateFmt = new Date(e.date + 'T00:00:00').toLocaleDateString('ru-RU', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
    const vals = METRICS
      .filter(m => e.values[m.key] != null)
      .map(m => `<span class="hist-val">${m.emoji} <b>${e.values[m.key]}</b> ${m.unit}</span>`)
      .join('');
    div.innerHTML = `
      <div class="hist-head">
        <span class="hist-date">${dateFmt}</span>
        <button class="hist-del" data-date="${e.date}">Удалить</button>
      </div>
      <div class="hist-values">${vals}</div>`;
    list.appendChild(div);
  }

  list.querySelectorAll('.hist-del').forEach(btn => {
    btn.onclick = () => confirmDelete(btn.dataset.date);
  });
}

function confirmDelete(date) {
  const doDelete = async () => {
    try {
      await Store.deleteEntry(date);
      hapticNotify('success');
      toast('Замер удалён');
      await reload();
    } catch (e) { toast('Ошибка удаления'); console.error(e); }
  };
  if (tg?.showConfirm) {
    tg.showConfirm('Удалить этот замер?', (ok) => ok && doDelete());
  } else if (confirm('Удалить этот замер?')) {
    doDelete();
  }
}

// ===== Навигация по табам =====
function switchView(view) {
  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('active', t.dataset.view === view));
  document.querySelectorAll('.view').forEach(v =>
    v.classList.toggle('active', v.id === 'view-' + view));

  // MainButton (кнопка «Сохранить») нужна только на экране добавления.
  if (tg?.MainButton) {
    if (view === 'add') {
      tg.MainButton.setText('Сохранить замер');
      tg.MainButton.show();
    } else {
      tg.MainButton.hide();
    }
  }

  if (view === 'charts') { buildMetricChips(); renderChartView(); }
  if (view === 'history') renderHistory();
  if (view === 'add') prefillForSelectedDate();
}

// ===== Перезагрузка данных =====
async function reload() {
  entries = await Store.getAllEntries();
  const active = document.querySelector('.view.active')?.id.replace('view-', '') || 'add';
  if (active === 'charts') renderChartView();
  if (active === 'history') renderHistory();
  if (active === 'add') prefillForSelectedDate();
}

// ===== Старт =====
async function init() {
  if (tg) {
    tg.ready();
    tg.expand();
    applyTheme();
    tg.onEvent('themeChanged', () => { applyTheme(); if (chartInstance) renderChartView(); });
    tg.MainButton.setText('Сохранить замер');
    tg.MainButton.onClick(saveCurrentEntry);
    tg.MainButton.show();
  }

  buildAddForm();

  document.getElementById('entry-date').addEventListener('change', prefillForSelectedDate);
  document.querySelectorAll('.tab').forEach(tab =>
    tab.addEventListener('click', () => { haptic('light'); switchView(tab.dataset.view); }));

  try {
    entries = await Store.getAllEntries();
  } catch (e) {
    console.error('Не удалось загрузить данные', e);
    toast('Не удалось загрузить данные');
  }

  prefillForSelectedDate();

  if (!Store.usingCloud) {
    console.warn('CloudStorage недоступен — данные хранятся локально в браузере.');
  }
}

init();
