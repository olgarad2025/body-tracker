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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ===== Функции для целей по весу =====

// Индекс массы тела. weightKg — кг, heightCm — см.
function bmi(weightKg, heightCm) {
  if (!heightCm || heightCm <= 0) return null;
  const m = heightCm / 100;
  return weightKg / (m * m);
}

// Категория ИМТ (ВОЗ) + класс для цвета.
function bmiCategory(value) {
  if (value == null) return { label: '—', cls: 'flat' };
  if (value < 18.5) return { label: 'недостаток', cls: 'down' };
  if (value < 25)   return { label: 'норма', cls: 'good' };
  if (value < 30)   return { label: 'избыток', cls: 'up' };
  return { label: 'ожирение', cls: 'up' };
}

// Значение ряда, ближайшее по времени к targetX (в мс). Нужно для «изменение
// за 7/30/90 дней»: сравниваем текущий вес с весом ~N дней назад.
function nearestValueAt(points, targetX) {
  if (!points.length) return null;
  let best = points[0], bestD = Math.abs(points[0].x - targetX);
  for (const p of points) {
    const d = Math.abs(p.x - targetX);
    if (d < bestD) { best = p; bestD = d; }
  }
  return best.y;
}

// Изменение за последние N дней: (текущее значение) − (значение N дней назад).
// Возвращает null, если истории слишком мало, чтобы покрыть окно.
function changeOverDays(points, days) {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  const first = points[0];
  const spanDays = (last.x - first.x) / MS_PER_DAY;
  const targetX = last.x - days * MS_PER_DAY;
  // Если данных меньше, чем окно, берём самый ранний доступный замер,
  // но помечаем, что окно неполное (для «За всё время» это не важно).
  const past = targetX < first.x ? first.y : nearestValueAt(points, targetX);
  return { change: last.y - past, full: spanDays >= days };
}

// Прогноз достижения целевого значения по линии тренда.
// reg — результат linearRegression; lastX — время последнего замера (мс);
// targetY — целевой вес. Возвращает { reached } | { days, dateMs } | null.
function projectToTarget(reg, lastX, lastY, targetY) {
  if (!reg.valid || reg.slope === 0) return null;
  const movingToward = (targetY < lastY && reg.slope < 0) || (targetY > lastY && reg.slope > 0);
  if (Math.abs(lastY - targetY) < 0.05) return { reached: true };
  if (!movingToward) return { away: true };
  const xTarget = (targetY - reg.intercept) / reg.slope;
  const days = (xTarget - lastX) / MS_PER_DAY;
  if (days <= 0) return { reached: true };
  return { days: Math.round(days), dateMs: xTarget };
}

// Прогноз веса на конкретную дату по линии тренда.
function predictWeightAt(reg, dateMs) {
  if (!reg.valid) return null;
  return reg.slope * dateMs + reg.intercept;
}
