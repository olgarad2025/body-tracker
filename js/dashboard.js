// Экран «Отчёт» — дашборд цели по весу в стиле трекера похудения.

function fmt1(n) { return (Math.round(n * 10) / 10).toFixed(1); }
function ruDateLong(ms) {
  return new Date(ms).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Полукруговой индикатор прогресса (0..1).
function gaugeSVG(progress) {
  const r = 90, len = Math.PI * r;
  const off = len * (1 - clamp(progress, 0, 1));
  return `
  <svg viewBox="0 0 200 116" class="gauge" preserveAspectRatio="xMidYMin meet">
    <defs>
      <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#ff7043"/>
        <stop offset="0.5" stop-color="#ffca28"/>
        <stop offset="1" stop-color="#66bb6a"/>
      </linearGradient>
    </defs>
    <path d="M10,100 A90,90 0 0 1 190,100" fill="none"
          stroke="var(--gauge-bg)" stroke-width="14" stroke-linecap="round"/>
    <path d="M10,100 A90,90 0 0 1 190,100" fill="none"
          stroke="url(#gaugeGrad)" stroke-width="14" stroke-linecap="round"
          stroke-dasharray="${len.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/>
  </svg>`;
}

function stageDots(completed, total) {
  let s = '';
  for (let i = 0; i < total; i++) s += `<span class="dot ${i < completed ? 'done' : ''}"></span>`;
  return `<div class="stage-dots">${s}</div>`;
}

function tile(label, val, cls) {
  return `<div class="trend-tile ${cls}"><div class="tv">${val}</div><div class="tl">${label}</div></div>`;
}
function changeTile(label, c) {
  if (!c) return tile(label, '—', 'flat');
  const v = c.change, abs = Math.abs(v);
  if (abs < 0.05) return tile(label, '0', 'flat');
  const arrow = v < 0 ? '↓' : '↑';
  return tile(label, `${arrow} ${fmt1(abs)}`, v < 0 ? 'down' : 'up');
}

// Главная функция отрисовки. Кнопки помечены data-action для делегирования в app.js.
function renderDashboard(container, entries, goal) {
  const p = computeGoalProgress(entries, goal);

  if (!p.hasData) {
    container.innerHTML = `
      <div class="card empty-card">
        <div class="empty">Пока нет данных о весе.<br>Добавь первый замер на вкладке «➕ Замер».</div>
      </div>`;
    return;
  }

  if (!p.hasGoal) {
    container.innerHTML = `
      <div class="card goal-cta">
        <div class="cta-weight">${fmt1(p.current)} <span>кг</span></div>
        <div class="cta-sub">Текущий вес</div>
        <p class="hint" style="text-align:center">Поставь цель по весу — и приложение покажет прогресс,
           этапы и прогноз, когда ты её достигнешь.</p>
        <button class="btn-primary" data-action="set-goal">🎯 Поставить цель</button>
      </div>
      ${trendsCard(p)}`;
    return;
  }

  const pct = Math.round(p.progress * 100);

  // ---- Карточка прогресса ----
  const progressCard = `
    <div class="card">
      <div class="card-head">
        <h2>Динамика веса</h2>
        <button class="icon-btn" data-action="edit-goal" title="Настроить цель">⚙️</button>
      </div>
      <div class="gauge-wrap">
        ${gaugeSVG(p.progress)}
        <div class="gauge-center">
          <div class="gauge-stage">Этап ${p.currentStage}</div>
          <div class="gauge-weight">${fmt1(p.current)}</div>
          <div class="gauge-unit">кг</div>
        </div>
      </div>
      <div class="prog-row">
        <div><div class="pv">${fmt1(p.start)}</div><div class="pl">Старт</div></div>
        <div><div class="pv">${pct}%</div><div class="pl">Завершено</div></div>
        <div><div class="pv">${fmt1(p.target)}</div><div class="pl">Цель</div></div>
      </div>
      ${stageDots(p.completedStages, p.stages)}
      <div class="stage-caption">Пройдено этапов: ${p.completedStages} из ${p.stages}
        · осталось ${fmt1(p.remaining)} кг</div>
    </div>`;

  // ---- Прогноз достижения цели ----
  let forecastCard = '';
  if (p.reachedGoal) {
    forecastCard = `<div class="card forecast reached">🎉 Цель достигнута! Так держать.</div>`;
  } else if (p.projection && p.projection.days) {
    forecastCard = `
      <div class="card forecast">
        <div class="fc-line">При текущем темпе <b>${fmt1(Math.abs(p.perWeek))} кг/нед</b></div>
        <div class="fc-big">цель через ${p.projection.days} дн.</div>
        <div class="fc-line">ориентировочно <b>${ruDateLong(p.projection.dateMs)}</b></div>
      </div>`;
  } else {
    forecastCard = `
      <div class="card forecast">
        <div class="fc-line">Тренд пока не ведёт к цели. Добавляй замеры регулярно —
          прогноз появится, когда наметится динамика.</div>
      </div>`;
  }

  // ---- Прогноз на дату события ----
  let eventCard = '';
  if (p.eventDateMs && p.eventPredicted != null) {
    const diffToGoal = p.eventPredicted - p.target;
    const near = Math.abs(diffToGoal) < 0.5;
    eventCard = `
      <div class="card event">
        <div class="ev-head">${p.eventName ? p.eventName + ' · ' : ''}${ruDateLong(p.eventDateMs)}</div>
        <div class="ev-big">${fmt1(p.eventPredicted)} <span>кг</span></div>
        <div class="ev-sub">прогноз к этой дате${p.eventDaysLeft >= 0 ? ` · осталось ${p.eventDaysLeft} дн.` : ''}</div>
        <div class="ev-note ${near ? 'good' : (diffToGoal > 0 ? 'up' : 'down')}">
          ${near ? '≈ на уровне цели' : (diffToGoal > 0
            ? `на ${fmt1(diffToGoal)} кг выше цели`
            : `на ${fmt1(-diffToGoal)} кг ниже цели`)}
        </div>
      </div>`;
  }

  // ---- ИМТ ----
  let bmiCard = '';
  if (p.bmi != null) {
    bmiCard = `
      <div class="card bmi">
        <div class="bmi-val">${p.bmi.toFixed(1)}</div>
        <div class="bmi-info">
          <div class="bmi-cat trend-${p.bmiCat.cls}">${p.bmiCat.label}</div>
          <div class="bmi-lbl">Индекс массы тела</div>
        </div>
      </div>`;
  }

  container.innerHTML = progressCard + forecastCard + eventCard + trendsCard(p) + bmiCard;
}

function trendsCard(p) {
  const c = p.changes;
  return `
    <div class="card">
      <div class="card-head"><h2>Тренды веса</h2></div>
      <div class="trend-tiles">
        ${changeTile('7 дней', c.d7)}
        ${changeTile('30 дней', c.d30)}
        ${changeTile('90 дней', c.d90)}
        ${changeTile('Всё время', c.all)}
      </div>
    </div>`;
}
