/**
 * Bilingual Messages Utility
 * v3.0.0 - Internationalization support for CLI messages
 *
 * Supports English (en) and Turkish (tr) messages.
 * Language is detected from LANG environment variable or can be set explicitly.
 */

// Message codes and their translations
const messages = {
  // CLI Help Messages
  'cli.help.usage': {
    en: 'Usage',
    tr: 'Kullanım',
  },
  'cli.help.options': {
    en: 'Options',
    tr: 'Seçenekler',
  },
  'cli.help.examples': {
    en: 'Examples',
    tr: 'Örnekler',
  },
  'cli.help.description': {
    en: 'Description',
    tr: 'Açıklama',
  },

  // Analysis Messages
  'analysis.start': {
    en: 'Starting analysis...',
    tr: 'Analiz başlatılıyor...',
  },
  'analysis.complete': {
    en: 'Analysis complete',
    tr: 'Analiz tamamlandı',
  },
  'analysis.files_found': {
    en: 'Files found',
    tr: 'Dosya bulundu',
  },
  'analysis.total_tokens': {
    en: 'Total tokens',
    tr: 'Toplam token',
  },
  'analysis.method_count': {
    en: 'Methods found',
    tr: 'Method bulundu',
  },
  'analysis.no_files': {
    en: 'No files found to analyze',
    tr: 'Analiz edilecek dosya bulunamadı',
  },

  // Export Messages
  'export.success': {
    en: 'Export successful',
    tr: 'Dışa aktarma başarılı',
  },
  'export.copied': {
    en: 'Copied to clipboard',
    tr: 'Panoya kopyalandı',
  },
  'export.saved': {
    en: 'Saved to file',
    tr: 'Dosyaya kaydedildi',
  },
  'export.failed': {
    en: 'Export failed',
    tr: 'Dışa aktarma başarısız',
  },

  // Error Messages
  'error.file_not_found': {
    en: 'File not found',
    tr: 'Dosya bulunamadı',
  },
  'error.permission_denied': {
    en: 'Permission denied',
    tr: 'İzin reddedildi',
  },
  'error.invalid_format': {
    en: 'Invalid format',
    tr: 'Geçersiz format',
  },
  'error.missing_param': {
    en: 'Missing required parameter',
    tr: 'Gerekli parametre eksik',
  },
  'error.unsupported_lang': {
    en: 'Unsupported language',
    tr: 'Desteklenmeyen dil',
  },
  'error.git_not_found': {
    en: 'Git repository not found',
    tr: 'Git deposu bulunamadı',
  },
  'error.tiktoken_unavailable': {
    en: 'tiktoken not available, using estimation mode',
    tr: 'tiktoken mevcut değil, tahmin modu kullanılıyor',
  },

  // Success Messages
  'success.server_started': {
    en: 'API server started',
    tr: 'API sunucusu başlatıldı',
  },
  'success.server_stopped': {
    en: 'API server stopped',
    tr: 'API sunucusu durduruldu',
  },
  'success.cache_cleared': {
    en: 'Cache cleared successfully',
    tr: 'Önbellek başarıyla temizlendi',
  },
  'success.config_saved': {
    en: 'Configuration saved',
    tr: 'Yapılandırma kaydedildi',
  },

  // Warning Messages
  'warning.large_project': {
    en: 'Large project detected, analysis may take longer',
    tr: 'Büyük proje tespit edildi, analiz daha uzun sürebilir',
  },
  'warning.token_limit': {
    en: 'Token limit exceeded, some files may be excluded',
    tr: 'Token limiti aşıldı, bazı dosyalar hariç tutulabilir',
  },
  'warning.no_methods': {
    en: 'No methods found in the specified files',
    tr: 'Belirtilen dosyalarda method bulunamadı',
  },

  // Info Messages
  'info.watch_mode': {
    en: 'Watching for file changes...',
    tr: 'Dosya değişiklikleri izleniyor...',
  },
  'info.press_exit': {
    en: 'Press Ctrl+C to exit',
    tr: 'Çıkmak için Ctrl+C tuşlarına basın',
  },
  'info.using_cache': {
    en: 'Using cached results',
    tr: 'Önbelleğe alınmış sonuçlar kullanılıyor',
  },
  'info.checking_updates': {
    en: 'Checking for updates...',
    tr: 'Güncellemeler kontrol ediliyor...',
  },

  // Git Integration Messages
  'git.no_changes': {
    en: 'No changes detected',
    tr: 'Değişiklik tespit edilmedi',
  },
  'git.changes_found': {
    en: 'Changes found in {count} files',
    tr: '{count} dosyada değişiklik bulundu',
  },
  'git.branch_switch': {
    en: 'Switched to branch',
    tr: 'Branch değiştirildi',
  },

  // API Messages
  'api.listening': {
    en: 'Listening on',
    tr: 'Dinleniyor',
  },
  'api.docs_available': {
    en: 'API documentation available at',
    tr: 'API dokümantasyonu şu adreste mevcut',
  },
  'api.auth_required': {
    en: 'Authentication required',
    tr: 'Kimlik doğrulama gerekli',
  },

  // Progress Messages
  'progress.scanning': {
    en: 'Scanning files...',
    tr: 'Dosyalar taranıyor...',
  },
  'progress.analyzing': {
    en: 'Analyzing tokens...',
    tr: "Token'lar analiz ediliyor...",
  },
  'progress.generating': {
    en: 'Generating report...',
    tr: 'Rapor oluşturuluyor...',
  },
  'progress.uploading': {
    en: 'Uploading...',
    tr: 'Yükleniyor...',
  },

  // Configuration Messages
  'config.created': {
    en: 'Configuration file created',
    tr: 'Yapılandırma dosyası oluşturuldu',
  },
  'config.updated': {
    en: 'Configuration updated',
    tr: 'Yapılandırma güncellendi',
  },
  'config.not_found': {
    en: 'Configuration file not found, using defaults',
    tr: 'Yapılandırma dosyası bulunamadı, varsayılanlar kullanılıyor',
  },

  // Plugin Messages
  'plugin.loaded': {
    en: 'Plugin loaded',
    tr: 'Plugin yüklendi',
  },
  'plugin.not_found': {
    en: 'Plugin not found',
    tr: 'Plugin bulunamadı',
  },
  'plugin.error': {
    en: 'Plugin error',
    tr: 'Plugin hatası',
  },
};

// Default language (can be overridden)
let currentLanguage = 'en';

/**
 * Detect language from environment
 * @returns {string} Language code ('en' or 'tr')
 */
function detectLanguage() {
  const lang = process.env.LANG || process.env.LANGUAGE || process.env.LC_ALL || '';

  // Check for Turkish
  if (lang.toLowerCase().includes('tr') || lang.toLowerCase().includes('tur')) {
    return 'tr';
  }

  // Default to English
  return 'en';
}

/**
 * Set the current language
 * @param {string} lang - Language code ('en' or 'tr')
 */
export function setLanguage(lang) {
  if (lang === 'en' || lang === 'tr') {
    currentLanguage = lang;
  } else {
    console.warn(`Unsupported language: ${lang}, defaulting to English`);
    currentLanguage = 'en';
  }
}

/**
 * Get the current language
 * @returns {string} Current language code
 */
export function getLanguage() {
  return currentLanguage;
}

/**
 * Get a message by code
 * @param {string} code - Message code (e.g., 'cli.help.usage')
 * @param {object} params - Optional parameters for message interpolation
 * @returns {string} Translated message
 */
export function getMessage(code, params = {}) {
  const message = messages[code];

  if (!message) {
    console.warn(`Message code not found: ${code}`);
    return code;
  }

  let text = message[currentLanguage] || message.en;

  // Interpolate parameters
  for (const [key, value] of Object.entries(params)) {
    text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }

  return text;
}

/**
 * Get all messages for a language
 * @param {string} lang - Language code
 * @returns {object} All messages in the specified language
 */
export function getAllMessages(lang = currentLanguage) {
  const result = {};

  for (const [code, translations] of Object.entries(messages)) {
    result[code] = translations[lang] || translations.en;
  }

  return result;
}

/**
 * Check if a message code exists
 * @param {string} code - Message code
 * @returns {boolean} True if code exists
 */
export function hasMessage(code) {
  return code in messages;
}

/**
 * Get message codes by prefix
 * @param {string} prefix - Message code prefix (e.g., 'error')
 * @returns {string[]} Array of matching message codes
 */
export function getMessagesByPrefix(prefix) {
  return Object.keys(messages).filter((code) => code.startsWith(prefix));
}

/**
 * Format a message with emoji prefix
 * @param {string} code - Message code
 * @param {string} emoji - Emoji to prepend
 * @param {object} params - Optional parameters
 * @returns {string} Formatted message
 */
export function formatMessage(code, emoji = '', params = {}) {
  const message = getMessage(code, params);
  return emoji ? `${emoji} ${message}` : message;
}

// Initialize language on module load
currentLanguage = detectLanguage();

// Export message codes for external use
export const MessageCodes = Object.keys(messages).reduce((acc, code) => {
  acc[code.toUpperCase().replace(/\./g, '_')] = code;
  return acc;
}, {});

export default {
  getMessage,
  getAllMessages,
  setLanguage,
  getLanguage,
  hasMessage,
  getMessagesByPrefix,
  formatMessage,
  MessageCodes,
};
