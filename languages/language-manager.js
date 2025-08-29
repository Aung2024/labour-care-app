/**
 * Language Manager for Labour Care App
 * Handles multi-language support (English and Myanmar)
 */

class LanguageManager {
  constructor() {
    this.currentLanguage = localStorage.getItem('preferredLanguage') || 'en';
    this.translations = {};
    this.isInitialized = false;
    this.init();
  }

  async init() {
    try {
      await this.loadLanguage(this.currentLanguage);
      this.createLanguageSwitcher();
      this.applyLanguage();
      this.isInitialized = true;
      console.log(`🌍 Language Manager initialized with: ${this.currentLanguage}`);
    } catch (error) {
      console.error('❌ Failed to initialize Language Manager:', error);
      // Fallback to English
      this.currentLanguage = 'en';
      await this.loadLanguage('en');
    }
  }

  async loadLanguage(lang) {
    try {
      const response = await fetch(`languages/${lang}.json`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      this.translations = await response.json();
      console.log(`✅ Language loaded: ${lang}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to load language ${lang}:`, error);
      
      // Fallback to English if not already trying English
      if (lang !== 'en') {
        console.log('🔄 Falling back to English...');
        return await this.loadLanguage('en');
      }
      return false;
    }
  }

  createLanguageSwitcher() {
    // Remove existing switcher if it exists
    const existingSwitcher = document.querySelector('.language-switcher');
    if (existingSwitcher) {
      existingSwitcher.remove();
    }

    // Create language switcher HTML
    const switcher = document.createElement('div');
    switcher.className = 'language-switcher';
    switcher.innerHTML = `
      <div class="language-switcher-container">
        <button class="lang-btn ${this.currentLanguage === 'en' ? 'active' : ''}" 
                onclick="languageManager.switchLanguage('en')" 
                title="Switch to English">
          🇺🇸 English
        </button>
        <button class="lang-btn ${this.currentLanguage === 'my' ? 'active' : ''}" 
                onclick="languageManager.switchLanguage('my')" 
                title="မြန်မာဘာသာသို့ ပြောင်းရန်">
          🇲🇲 မြန်မာ
        </button>
      </div>
    `;

    // Insert into header
    const headerRight = document.querySelector('.header-right');
    if (headerRight) {
      headerRight.insertBefore(switcher, headerRight.firstChild);
    } else {
      // Fallback: insert at the beginning of the body
      document.body.insertBefore(switcher, document.body.firstChild);
    }
  }

  async switchLanguage(lang) {
    if (lang === this.currentLanguage) return;
    
    console.log(`🔄 Switching language from ${this.currentLanguage} to ${lang}`);
    
    try {
      const success = await this.loadLanguage(lang);
      if (success) {
        this.currentLanguage = lang;
        localStorage.setItem('preferredLanguage', lang);
        
        // Update document language attribute
        document.documentElement.lang = lang;
        document.documentElement.setAttribute('data-lang', lang);
        
        this.applyLanguage();
        this.updateSwitcherUI();
        
        // Trigger custom event for other components
        window.dispatchEvent(new CustomEvent('languageChanged', { 
          detail: { language: lang } 
        }));
        
        console.log(`✅ Language switched to: ${lang}`);
      }
    } catch (error) {
      console.error(`❌ Failed to switch language to ${lang}:`, error);
    }
  }

  updateSwitcherUI() {
    const buttons = document.querySelectorAll('.lang-btn');
    buttons.forEach(btn => {
      btn.classList.remove('active');
      if (btn.textContent.includes(this.currentLanguage === 'en' ? 'English' : 'မြန်မာ')) {
        btn.classList.add('active');
      }
    });
  }

  applyLanguage() {
    if (!this.translations || Object.keys(this.translations).length === 0) {
      console.warn('⚠️ No translations available');
      return;
    }

    // Apply translations to all elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const key = element.getAttribute('data-i18n');
      if (this.translations[key]) {
        element.textContent = this.translations[key];
      } else {
        console.warn(`⚠️ Translation key not found: ${key}`);
      }
    });

    // Apply to placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
      const key = element.getAttribute('data-i18n-placeholder');
      if (this.translations[key]) {
        element.placeholder = this.translations[key];
      }
    });

    // Apply to titles
    document.querySelectorAll('[data-i18n-title]').forEach(element => {
      const key = element.getAttribute('data-i18n-title');
      if (this.translations[key]) {
        element.title = this.translations[key];
      }
    });

    // Apply to alt text for images
    document.querySelectorAll('[data-i18n-alt]').forEach(element => {
      const key = element.getAttribute('data-i18n-alt');
      if (this.translations[key]) {
        element.alt = this.translations[key];
      }
    });

    // Apply to form labels
    document.querySelectorAll('label[data-i18n]').forEach(label => {
      const key = label.getAttribute('data-i18n');
      if (this.translations[key]) {
        label.textContent = this.translations[key];
      }
    });

    // Apply to button text
    document.querySelectorAll('button[data-i18n]').forEach(button => {
      const key = button.getAttribute('data-i18n');
      if (this.translations[key]) {
        button.textContent = this.translations[key];
      }
    });

    // Apply to table headers
    document.querySelectorAll('th[data-i18n]').forEach(header => {
      const key = header.getAttribute('data-i18n');
      if (this.translations[key]) {
        header.textContent = this.translations[key];
      }
    });

    // Apply to modal content
    document.querySelectorAll('[data-i18n-modal]').forEach(element => {
      const key = element.getAttribute('data-i18n-modal');
      if (this.translations[key]) {
        element.textContent = this.translations[key];
      }
    });

    console.log(`✅ Language applied: ${this.currentLanguage}`);
  }

  // Get translation for a specific key
  t(key, fallback = null) {
    if (!this.translations) {
      console.warn('⚠️ Translations not loaded yet');
      return fallback || key;
    }

    // Handle nested keys (e.g., "formLabels.enterPatientName")
    const keys = key.split('.');
    let value = this.translations;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        console.warn(`⚠️ Translation key not found: ${key}`);
        return fallback || key;
      }
    }

    return value || fallback || key;
  }

  // Get translation with interpolation
  tInterpolate(key, params = {}) {
    let text = this.t(key);
    
    // Replace placeholders like {{paramName}}
    Object.keys(params).forEach(param => {
      const placeholder = new RegExp(`{{${param}}}`, 'g');
      text = text.replace(placeholder, params[param]);
    });
    
    return text;
  }

  // Get current language
  getCurrentLanguage() {
    return this.currentLanguage;
  }

  // Check if language is loaded
  isLanguageLoaded() {
    return this.isInitialized && Object.keys(this.translations).length > 0;
  }

  // Get all available languages
  getAvailableLanguages() {
    return ['en', 'my'];
  }

  // Get language display name
  getLanguageDisplayName(lang) {
    const names = {
      'en': 'English',
      'my': 'မြန်မာ'
    };
    return names[lang] || lang;
  }

  // Force refresh all translations
  refreshTranslations() {
    this.applyLanguage();
  }

  // Update specific element
  updateElement(element, key) {
    if (element && key && this.translations[key]) {
      element.textContent = this.translations[key];
    }
  }

  // Batch update multiple elements
  updateElements(updates) {
    updates.forEach(({ element, key }) => {
      this.updateElement(element, key);
    });
  }
}

// Initialize language manager when DOM is ready
let languageManager;

document.addEventListener('DOMContentLoaded', function() {
  languageManager = new LanguageManager();
});

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LanguageManager;
}
