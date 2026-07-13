// Линейная регрессия методом наименьших квадратов.
// points: [{ x, y }] — x в миллисекундах (timestamp), y — значение метрики.
// Возвращает { slope, intercept, valid } где y = slope * x + intercept.
function linearRegression(points) {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: n ? points[0].y : 0, valid: false };

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, valid: false };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept, valid: true };
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

// Описание тренда: направление + скорость изменения за неделю.
// Для веса рост — «плохо» (красный), для остальных — нейтрально по цвету,
// но пользователь сам трактует. Мы просто показываем факт.
function describeTrend(reg, unit) {
  if (!reg.valid) return { text: '—', dir: 'flat' };

  const perWeek = reg.slope * MS_PER_WEEK;
  const abs = Math.abs(perWeek);

  // Порог «стабильно»: меньше 0.05 единицы в неделю считаем плоским трендом.
  if (abs < 0.05) return { text: 'стабильно', dir: 'flat' };

  const arrow = perWeek > 0 ? '↑' : '↓';
  const dir = perWeek > 0 ? 'up' : 'down';
  const val = abs >= 10 ? abs.toFixed(0) : abs.toFixed(1);
  return { text: `${arrow} ${val} ${unit}/нед`, dir };
}

// Статистика по ряду значений: мин, макс, изменение от первого к последнему.
function seriesStats(points) {
  if (!points.length) return null;
  const values = points.map(p => p.y);
  const first = points[0].y;
  const last = points[points.length - 1].y;
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    last,
    change: last - first,
    count: points.length,
  };
}
