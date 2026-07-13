// Список отслеживаемых параметров тела.
// key   — идентификатор для хранения
// label — подпись в интерфейсе
// unit  — единица измерения
// emoji — иконка
const METRICS = [
  { key: 'weight',    label: 'Вес',          unit: 'кг', emoji: '⚖️' },
  { key: 'chest',     label: 'Грудь',        unit: 'см', emoji: '👚' },
  { key: 'underbust', label: 'Под грудью',   unit: 'см', emoji: '📏' },
  { key: 'waist',     label: 'Талия',        unit: 'см', emoji: '⏳' },
  { key: 'belly',     label: 'Живот',        unit: 'см', emoji: '🫃' },
  { key: 'hips',      label: 'Бёдра',        unit: 'см', emoji: '🍑' },
  { key: 'thighL',    label: 'Бедро левое',  unit: 'см', emoji: '🦵' },
  { key: 'thighR',    label: 'Бедро правое', unit: 'см', emoji: '🦵' },
];

const METRIC_BY_KEY = Object.fromEntries(METRICS.map(m => [m.key, m]));
