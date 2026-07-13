// Отрисовка графика метрики с линией тренда (линейная регрессия).
// Для веса дополнительно рисуется линия цели и продолжение тренда до цели.
let chartInstance = null;

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// entries: [{ date, values }]  metricKey: строка  goal: объект цели | null
// Возвращает { reg, stats } для показа бейджа тренда и статистики.
function renderChart(canvas, entries, metricKey, goal) {
  const metric = METRIC_BY_KEY[metricKey];

  // Собираем точки, где метрика заполнена.
  const points = entries
    .filter(e => e.values[metricKey] != null && !Number.isNaN(e.values[metricKey]))
    .map(e => ({ x: new Date(e.date + 'T00:00:00').getTime(), y: Number(e.values[metricKey]) }))
    .sort((a, b) => a.x - b.x);

  const reg = linearRegression(points);
  const stats = seriesStats(points);

  const accent = cssVar('--accent') || '#3390ec';
  const hint = cssVar('--hint') || '#7d8b99';
  const grid = 'rgba(125,139,153,0.15)';
  const goalColor = '#e5737b';

  // Цель по весу: горизонтальная линия + продолжение тренда до цели.
  const isWeightGoal = metricKey === 'weight' && goal && goal.targetWeight != null && points.length >= 1;
  let projX = points.length ? points[points.length - 1].x : 0; // до какого x тянуть ось
  let goalLine = [], projLine = [];

  if (isWeightGoal) {
    const target = goal.targetWeight;
    const lastX = points[points.length - 1].x;
    const lastY = points[points.length - 1].y;
    const proj = projectToTarget(reg, lastX, lastY, target);

    if (proj && proj.dateMs && proj.dateMs > lastX) {
      // Не тянем прогноз дальше, чем на год вперёд.
      projX = Math.min(proj.dateMs, lastX + 365 * MS_PER_DAY);
      projLine = [
        { x: lastX, y: reg.slope * lastX + reg.intercept },
        { x: projX, y: reg.slope * projX + reg.intercept },
      ];
    }
    const x0 = points[0].x;
    goalLine = [{ x: x0, y: target }, { x: projX, y: target }];
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
      pointRadius: 4,
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
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'nearest', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        filter: (item) => item.dataset.label === METRIC_BY_KEY[metricKey].label,
        callbacks: {
          title: (items) => new Date(items[0].parsed.x).toLocaleDateString('ru-RU'),
          label: (item) => `${item.parsed.y} ${metric.unit}`,
        },
      },
    },
    scales: {
      x: {
        type: 'linear',
        grid: { color: grid },
        ticks: {
          color: hint,
          maxRotation: 0,
          autoSkipPadding: 20,
          callback: (v) => new Date(v).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
        },
      },
      y: {
        grid: { color: grid },
        ticks: { color: hint },
      },
    },
  };

  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(canvas, { type: 'line', data: { datasets }, options });

  return { reg, stats, metric };
}
