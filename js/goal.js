// Логика цели по весу: прогресс, этапы, прогноз.

// Точки веса из замеров, отсортированные по времени: [{ x(ms), y(kg) }].
function weightPoints(entries) {
  return entries
    .filter(e => e.values.weight != null && !Number.isNaN(e.values.weight))
    .map(e => ({ x: new Date(e.date + 'T00:00:00').getTime(), y: Number(e.values.weight) }))
    .sort((a, b) => a.x - b.x);
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Считает всё для дашборда цели.
// Возвращает { hasData, hasGoal, ... }.
function computeGoalProgress(entries, goal) {
  const pts = weightPoints(entries);
  const out = { hasData: pts.length > 0, hasGoal: !!goal, points: pts };
  if (!pts.length) return out;

  const current = pts[pts.length - 1].y;
  out.current = current;
  out.lastDateMs = pts[pts.length - 1].x;

  // Регрессия и текущий недельный темп.
  const reg = linearRegression(pts);
  out.reg = reg;
  out.perWeek = reg.valid ? reg.slope * MS_PER_WEEK : 0;

  // ИМТ (нужен рост из цели).
  if (goal && goal.height) {
    out.bmi = bmi(current, goal.height);
    out.bmiCat = bmiCategory(out.bmi);
  }

  // Изменения за периоды (по фактическим данным).
  out.changes = {
    d7: changeOverDays(pts, 7),
    d30: changeOverDays(pts, 30),
    d90: changeOverDays(pts, 90),
    all: { change: current - pts[0].y, full: true },
  };

  if (!goal) return out;

  const start = goal.startWeight != null ? goal.startWeight : pts[0].y;
  const target = goal.targetWeight;
  const stages = Math.max(1, goal.stages || 8);
  out.start = start;
  out.target = target;
  out.stages = stages;

  const losing = start > target;           // цель — похудеть
  out.losing = losing;
  const total = Math.abs(start - target);  // сколько всего нужно пройти
  out.total = total;

  // Пройдено в «нужном» направлении.
  const done = losing ? (start - current) : (current - start);
  out.doneAmount = done;
  out.progress = total > 0 ? clamp(done / total, 0, 1) : 0;
  out.remaining = Math.max(0, Math.abs(current - target)); // до цели
  out.reachedGoal = losing ? current <= target : current >= target;

  // Этапы.
  const perStage = total / stages;
  out.perStage = perStage;
  out.completedStages = clamp(Math.floor((out.progress * total) / perStage), 0, stages);
  out.currentStage = Math.min(out.completedStages + 1, stages);

  // Прогноз достижения цели по тренду.
  out.projection = projectToTarget(reg, out.lastDateMs, current, target);

  // Прогноз на дату события (если задана).
  if (goal.targetDate) {
    const dMs = new Date(goal.targetDate + 'T00:00:00').getTime();
    out.eventDateMs = dMs;
    out.eventName = goal.eventName || null;
    out.eventPredicted = predictWeightAt(reg, dMs);
    out.eventDaysLeft = Math.round((dMs - Date.now()) / MS_PER_DAY);
  }

  return out;
}

// ===== Журнал веса =====
// Для каждой даты с весом считает скользящее среднее (трейлинг 7 дней)
// и недельный темп (по линрегрессии за трейлинг 14 дней).
function weightSeriesStats(entries) {
  const pts = entries
    .filter(e => e.values.weight != null && !Number.isNaN(e.values.weight))
    .map(e => ({ x: new Date(e.date + 'T00:00:00').getTime(), y: Number(e.values.weight), date: e.date }))
    .sort((a, b) => a.x - b.x);

  const byDate = {};
  for (let i = 0; i < pts.length; i++) {
    const x = pts[i].x;

    // Скользящее среднее: все замеры за последние 7 дней включительно.
    let sum = 0, c = 0;
    for (let j = i; j >= 0 && (x - pts[j].x) <= 7 * MS_PER_DAY; j--) { sum += pts[j].y; c++; }
    const avg = sum / c;

    // Недельный темп: регрессия по окну последних 14 дней.
    const win = [];
    for (let j = i; j >= 0 && (x - pts[j].x) <= 14 * MS_PER_DAY; j--) win.push(pts[j]);
    let rate = null;
    if (win.length >= 2) {
      const reg = linearRegression(win);
      if (reg.valid) rate = reg.slope * MS_PER_WEEK;
    }

    byDate[pts[i].date] = { avg, rate };
  }
  return byDate;
}

// Собирает строки журнала (все даты, новые сверху) с весом, средним,
// темпом, ИМТ и списком сантиметровых замеров.
function buildJournal(entries, goal) {
  const height = goal && goal.height;
  const stats = weightSeriesStats(entries);

  return [...entries]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(e => {
      const w = e.values.weight != null ? Number(e.values.weight) : null;
      const s = stats[e.date];
      const cm = METRICS
        .filter(m => m.key !== 'weight' && e.values[m.key] != null)
        .map(m => ({ emoji: m.emoji, unit: m.unit, val: e.values[m.key] }));
      return {
        date: e.date,
        weight: w,
        avg: s ? s.avg : null,
        rate: s ? s.rate : null,
        bmi: (w != null && height) ? bmi(w, height) : null,
        cm,
      };
    });
}
