// Отрисовка графика метрики с линией тренда (линейная регрессия).
let chartInstance = null;

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// entries: [{ date, values }]  metricKey: строка
// Возвращает { reg, stats } для показа бейджа тренда и статистики.
function renderChart(canvas, entries, metricKey) {
  const metric = METRIC_BY_KEY[metricKey];

  // Собираем точки, где метрика заполнена.
  const points = entries
    .filter(e => e.values[metricKey] != null && !Number.isNaN(e.values[metricKey]))
    .map(e => ({ x: new Date(e.date + 'T00:00:00').getTime(), y: Number(e.values[metricKey]) }))
    .sort((a, b) => a.x - b.x);

  const reg = linearRegression(points);
  const stats = seriesStats(points);

  // Линия тренда — две точки на краях диапазона.
  let trendData = [];
  if (reg.valid && points.length >= 2) {
    const x0 = points[0].x, x1 = points[points.length - 1].x;
    trendData = [
      { x: x0, y: reg.slope * x0 + reg.intercept },
      { x: x1, y: reg.slope * x1 + reg.intercept },
    ];
  }

  const accent = cssVar('--accent') || '#3390ec';
  const hint = cssVar('--hint') || '#7d8b99';
  const grid = 'rgba(125,139,153,0.15)';

  const data = {
    datasets: [
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
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'nearest', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => new Date(items[0].parsed.x).toLocaleDateString('ru-RU'),
          label: (item) => {
            if (item.dataset.label === 'Тренд') return null;
            return `${item.parsed.y} ${metric.unit}`;
          },
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
  chartInstance = new Chart(canvas, { type: 'line', data, options });

  return { reg, stats, metric };
}
