// Отрисовка графика метрики с линией тренда (линейная регрессия).
// Для веса дополнительно рисуется линия цели и продолжение тренда до цели.
// range: 'days' | 'weeks' | 'months' | 'all' — масштаб/агрегация по времени.
let chartInstance = null;

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Агрегация точек под выбранный масштаб.
// days   — последние 30 дней, сырые точки;
// all    — все точки без изменений;
// weeks  — среднее по неделям (точка = середина недели);
// months — среднее по месяцам (точка = середина месяца).
function aggregatePoints(points, mode) {
  if (!points.length) return points;
  if (mode === 'days') {
    const lastX = points[points.length - 1].x;
    return points.filter(p => lastX - p.x <= 30 * MS_PER_DAY);
  }
  if (mode === 'weeks' || mode === 'months') {
    const groups = new Map();
    for (const p of points) {
      const d = new Date(p.x);
      let key, cx;
      if (mode === 'weeks') {
        const dow = (d.getDay() + 6) % 7; // 0 = понедельник
        const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow);
        key = monday.getTime();
        cx = key + 3.5 * MS_PER_DAY;      // середина недели
      } else {
        key = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
        cx = new Date(d.getFullYear(), d.getMonth(), 15).getTime(); // середина месяца
      }
      if (!groups.has(key)) groups.set(key, { sum: 0, c: 0, cx });
      const g = groups.get(key);
      g.sum += p.y; g.c++;
    }
    return [...groups.values()]
      .sort((a, b) => a.cx - b.cx)
      .map(g => ({ x: g.cx, y: g.sum / g.c }));
  }
  return points; // 'all'
}

// Линия «коридора» снижения веса: прямая из стартовой точки с постоянным
// темпом rate (кг/нед). Отсекается целевым весом (не ниже target) и видимым
// диапазоном [vMin, vMax] — поэтому корректна в любом масштабе графика.
function corridorLine(startX, startWeight, target, rate, vMin, vMax) {
  const total = startWeight - target; // сколько нужно сбросить
  if (total <= 0 || rate <= 0) return [];
  const xReach = startX + (total / rate) * MS_PER_WEEK; // когда достигнет цели
  const xL = Math.max(startX, vMin);
  const xR = Math.min(vMax, xReach);
  if (xR <= xL) return [];
  const yAt = (x) => Math.max(target, startWeight - rate * (x - startX) / MS_PER_WEEK);
  return [{ x: xL, y: yAt(xL) }, { x: xR, y: yAt(xR) }];
}

// entries: [{ date, values }]  metricKey: строка  goal: объект|null  range: строка
// Возвращает { reg, stats } для показа бейджа тренда и статистики.
function renderChart(canvas, entries, metricKey, goal, range) {
  const metric = METRIC_BY_KEY[metricKey];
  range = range || 'all';
  const monthMode = range === 'months';

  const raw = entries
    .filter(e => e.values[metricKey] != null && !Number.isNaN(e.values[metricKey]))
    .map(e => ({ x: new Date(e.date + 'T00:00:00').getTime(), y: Number(e.values[metricKey]) }))
    .sort((a, b) => a.x - b.x);

  const points = aggregatePoints(raw, range);

  const reg = linearRegression(points);
  const stats = seriesStats(points);

  const accent = cssVar('--accent') || '#3390ec';
  const hint = cssVar('--hint') || '#7d8b99';
  const grid = 'rgba(125,139,153,0.15)';
  const goalColor = '#e5737b';

  // Цель по весу: горизонтальная линия + продолжение тренда до цели.
  const isWeightGoal = metricKey === 'weight' && goal && goal.targetWeight != null && points.length >= 1;
  let projX = points.length ? points[points.length - 1].x : 0;
  let goalLine = [], projLine = [], minCorridor = [], maxCorridor = [];
  let xMin, xMax, panMin, panMax; // окно оси X и границы панорамирования

  if (isWeightGoal) {
    const DAY = MS_PER_DAY, WEEK = MS_PER_WEEK;
    const target = goal.targetWeight;
    const rawFirstX = raw[0].x;
    const rawLastX = raw[raw.length - 1].x;
    const lastY = points[points.length - 1].y;

    const startX = goal.startDate
      ? new Date(goal.startDate + 'T00:00:00').getTime()
      : rawFirstX;
    const startWeight = goal.startWeight != null ? goal.startWeight : raw[0].y;
    const minRate = goal.minRate != null ? goal.minRate : 0.5;
    const maxRate = goal.maxRate != null ? goal.maxRate : 1.0;
    const total = startWeight - target;

    // До какого момента строим план: когда медленная (мин) линия дойдёт до цели.
    const goalReachX = total > 0 && minRate > 0
      ? Math.min(startX + (total / minRate) * WEEK, startX + 730 * DAY)
      : rawLastX + 30 * DAY;

    // Самый ранний край: старт цели ИЛИ более ранние замеры (если вес вёлся
    // до постановки цели) — чтобы историю до цели тоже было видно.
    const anchorMin = Math.min(rawFirstX, startX) - 3 * DAY;

    // Окно оси X по масштабу. Будущее показываем всегда, чтобы был виден коридор.
    if (range === 'all') {
      xMin = anchorMin;
      xMax = goalReachX;
    } else if (range === 'months') {
      xMin = anchorMin;
      xMax = Math.min(goalReachX, rawLastX + 182 * DAY);
    } else if (range === 'weeks') {
      xMin = Math.max(anchorMin, rawLastX - 84 * DAY);
      xMax = Math.min(goalReachX, rawLastX + 84 * DAY);
    } else { // days
      xMin = Math.max(anchorMin, rawLastX - 30 * DAY);
      xMax = Math.min(goalReachX, rawLastX + 30 * DAY);
    }

    // Границы панорамирования: назад до самых ранних замеров, вперёд до цели.
    panMin = anchorMin - 7 * DAY;
    panMax = goalReachX + 30 * DAY;

    // Прогноз по фактическому тренду (если он вообще ведёт к цели).
    const proj = projectToTarget(reg, rawLastX, lastY, target);
    if (proj && proj.dateMs && proj.dateMs > rawLastX) {
      projX = Math.min(proj.dateMs, xMax);
      projLine = [
        { x: rawLastX, y: reg.slope * rawLastX + reg.intercept },
        { x: projX, y: reg.slope * projX + reg.intercept },
      ];
    }

    // Линия цели и коридор строятся из стартовой точки до конца окна.
    goalLine = [{ x: startX, y: target }, { x: xMax, y: target }];
    minCorridor = corridorLine(startX, startWeight, target, minRate, startX, xMax);
    maxCorridor = corridorLine(startX, startWeight, target, maxRate, startX, xMax);
  }

  // Границы панорамирования для остальных графиков (без цели) — по данным.
  if (panMin == null && raw.length) {
    panMin = raw[0].x - 7 * MS_PER_DAY;
    panMax = raw[raw.length - 1].x + 7 * MS_PER_DAY;
  }

  // Линия тренда — две точки на краях диапазона данных.
  let trendData = [];
  if (reg.valid && points.length >= 2) {
    const x0 = points[0].x, x1 = points[points.length - 1].x;
    trendData = [
      { x: x0, y: reg.slope * x0 + reg.intercept },
      { x: x1, y: reg.slope * x1 + reg.intercept },
    ];
  }

  const datasets = [
    {
      label: metric.label,
      data: points,
      borderColor: accent,
      backgroundColor: accent,
      borderWidth: 2.5,
      pointRadius: points.length > 40 ? 2 : 4,
      pointHoverRadius: 6,
      tension: 0.25,
      order: 1,
    },
    {
      label: 'Тренд',
      data: trendData,
      borderColor: hint,
      borderWidth: 2,
      borderDash: [6, 6],
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
      order: 2,
    },
  ];

  if (isWeightGoal) {
    datasets.push({
      label: 'Прогноз',
      data: projLine,
      borderColor: goalColor,
      borderWidth: 2,
      borderDash: [2, 4],
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
      order: 3,
    });
    datasets.push({
      label: 'Цель',
      data: goalLine,
      borderColor: goalColor,
      borderWidth: 1.5,
      borderDash: [8, 5],
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
      order: 4,
    });
    const corridorColor = '#66bb6a';
    datasets.push({
      label: 'Мин. темп',
      data: minCorridor,
      borderColor: corridorColor,
      borderWidth: 1.2,
      borderDash: [4, 4],
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
      order: 5,
    });
    datasets.push({
      label: 'Макс. темп',
      data: maxCorridor,
      borderColor: corridorColor,
      borderWidth: 1.2,
      borderDash: [4, 4],
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
      order: 6,
    });
  }

  const fmtTick = (v) => monthMode
    ? new Date(v).toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' })
    : new Date(v).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'nearest', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        filter: (item) => item.dataset.label === metric.label,
        callbacks: {
          title: (items) => monthMode
            ? new Date(items[0].parsed.x).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
            : new Date(items[0].parsed.x).toLocaleDateString('ru-RU'),
          label: (item) => `${Math.round(item.parsed.y * 10) / 10} ${metric.unit}`,
        },
      },
      // Только панорамирование (перетаскивание) по оси X.
      // Pinch/wheel-зум отключён намеренно: он приводил к некорректному
      // масштабу и падению графика. Масштаб меняется кнопками Дни/Недели/…
      zoom: {
        limits: (panMin != null && panMax != null) ? { x: { min: panMin, max: panMax } } : undefined,
        pan: { enabled: true, mode: 'x', threshold: 8 },
        zoom: { wheel: { enabled: false }, pinch: { enabled: false } },
      },
    },
    scales: {
      x: {
        type: 'linear',
        min: xMin,
        max: xMax,
        grid: { color: grid },
        ticks: { color: hint, maxRotation: 0, autoSkipPadding: 20, callback: fmtTick },
      },
      y: {
        grid: { color: grid },
        ticks: { color: hint },
      },
    },
  };

  if (chartInstance) { try { chartInstance.destroy(); } catch (_) {} }
  try {
    chartInstance = new Chart(canvas, { type: 'line', data: { datasets }, options });
  } catch (e) {
    console.error('Ошибка построения графика', e);
    chartInstance = null;
  }

  return { reg, stats, metric };
}
