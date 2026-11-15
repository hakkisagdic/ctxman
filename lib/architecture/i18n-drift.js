/**
 * Flatten a nested dictionary object into dot-delimited keys (`a.b.c`).
 *
 * @param {Record<string, any>} obj
 * @param {string} [prefix='']
 * @returns {Set<string>}
 */
function flattenKeys(obj, prefix = '') {
  const keys = new Set();
  if (!obj || typeof obj !== 'object') return keys;

  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const nested of flattenKeys(v, fullKey)) {
        keys.add(nested);
      }
    } else {
      keys.add(fullKey);
    }
  }
  return keys;
}

/**
 * Compare localization dictionaries (e.g. `en`, `tr`) and detect missing or extra
 * translation keys across locales (`F7-4`: Multi-Locale i18n Key Parity Checker).
 *
 * @param {Record<string, Record<string, any>>} locales - Map of locale code to translation object
 * @param {object} [options]
 * @param {string} [options.baseLocale='en'] - Reference locale code
 * @returns {object}
 */
export function checkI18nDrift(locales = {}, options = {}) {
  const localeNames = Object.keys(locales || {});
  const baseLocale =
    options.baseLocale && locales[options.baseLocale] ? options.baseLocale : localeNames[0] || 'en';

  const baseKeys = flattenKeys(locales[baseLocale] || {});
  const missingByLocale = {};
  const extraByLocale = {};
  let totalMissing = 0;

  for (const loc of localeNames) {
    if (loc === baseLocale) continue;
    const targetKeys = flattenKeys(locales[loc] || {});
    const missing = [...baseKeys].filter((k) => !targetKeys.has(k));
    const extra = [...targetKeys].filter((k) => !baseKeys.has(k));
    missingByLocale[loc] = missing;
    extraByLocale[loc] = extra;
    totalMissing += missing.length;
  }

  return {
    baseLocale,
    locales: localeNames,
    baseKeyCount: baseKeys.size,
    inSync: totalMissing === 0,
    totalMissing,
    missingByLocale,
    extraByLocale,
  };
}
