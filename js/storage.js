// Слой хранения. В Telegram использует CloudStorage (данные в аккаунте
// пользователя, синхронизируются между устройствами). Вне Telegram —
// localStorage, чтобы можно было разрабатывать и тестировать в браузере.
//
// Модель данных: каждый замер — отдельный ключ вида "bt_YYYYMMDD",
// значение — JSON объекта метрик, например {"weight":60.5,"waist":70}.
// CloudStorage допускает до 1024 ключей по 4096 байт — этого с запасом
// хватает: один ключ на дату.

const KEY_PREFIX = 'bt_';
const GOAL_KEY = 'cfg_goal';

function dateToKey(dateStr) {
  return KEY_PREFIX + dateStr.replace(/-/g, ''); // 2026-07-13 -> bt_20260713
}
function keyToDate(key) {
  const d = key.slice(KEY_PREFIX.length); // 20260713
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

const tgCloud = (() => {
  const cs = window.Telegram?.WebApp?.CloudStorage;
  // CloudStorage появился в Bot API 6.9
  const ok = cs && window.Telegram.WebApp.isVersionAtLeast?.('6.9');
  return ok ? cs : null;
})();

// ---- CloudStorage, обёрнутый в промисы ----
const cloud = {
  getKeys() {
    return new Promise((res, rej) =>
      tgCloud.getKeys((err, keys) => (err ? rej(err) : res(keys || []))));
  },
  getItems(keys) {
    return new Promise((res, rej) =>
      tgCloud.getItems(keys, (err, obj) => (err ? rej(err) : res(obj || {}))));
  },
  setItem(key, value) {
    return new Promise((res, rej) =>
      tgCloud.setItem(key, value, (err) => (err ? rej(err) : res())));
  },
  removeItem(key) {
    return new Promise((res, rej) =>
      tgCloud.removeItem(key, (err) => (err ? rej(err) : res())));
  },
};

// ---- localStorage fallback ----
const local = {
  async getKeys() {
    return Object.keys(localStorage).filter(k => k.startsWith(KEY_PREFIX));
  },
  async getItems(keys) {
    const out = {};
    for (const k of keys) out[k] = localStorage.getItem(k) ?? '';
    return out;
  },
  async setItem(key, value) { localStorage.setItem(key, value); },
  async removeItem(key) { localStorage.removeItem(key); },
};

const backend = tgCloud ? cloud : local;
const Store = {
  usingCloud: !!tgCloud,

  // Возвращает массив { date, values } отсортированный по дате (по возрастанию).
  async getAllEntries() {
    const keys = (await backend.getKeys()).filter(k => k.startsWith(KEY_PREFIX));
    if (!keys.length) return [];
    const items = await backend.getItems(keys);
    const entries = [];
    for (const key of keys) {
      try {
        const values = JSON.parse(items[key]);
        if (values && typeof values === 'object') {
          entries.push({ date: keyToDate(key), values });
        }
      } catch (_) { /* пропускаем битые записи */ }
    }
    entries.sort((a, b) => a.date.localeCompare(b.date));
    return entries;
  },

  // Сохраняет/перезаписывает замер за дату. values — объект { metricKey: number }.
  async saveEntry(date, values) {
    await backend.setItem(dateToKey(date), JSON.stringify(values));
  },

  async deleteEntry(date) {
    await backend.removeItem(dateToKey(date));
  },

  // ===== Цель по весу =====
  // Хранится под отдельным ключом cfg_goal (не начинается с bt_, поэтому
  // не попадает в getAllEntries). Объект:
  // { height, startWeight, targetWeight, stages, targetDate, eventName }
  async getGoal() {
    const obj = await backend.getItems([GOAL_KEY]);
    const raw = obj[GOAL_KEY];
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (_) { return null; }
  },

  async saveGoal(goal) {
    await backend.setItem(GOAL_KEY, JSON.stringify(goal));
  },

  async clearGoal() {
    await backend.removeItem(GOAL_KEY);
  },
};
