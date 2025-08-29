# 🌍 Multi-Language System for Labour Care App

This directory contains the complete multi-language support system for the Labour Care App, supporting **English** and **Myanmar** languages.

## 📁 File Structure

```
languages/
├── en.json              # English translations
├── my.json              # Myanmar translations  
├── language-manager.js   # Core language management system
├── language-switcher.css # Styling for language switcher
└── README.md            # This documentation file
```

## 🚀 Quick Start

### 1. Include the Language System

Add these files to your HTML pages:

```html
<!-- CSS for language switcher styling -->
<link rel="stylesheet" href="languages/language-switcher.css" />

<!-- JavaScript for language management -->
<script src="languages/language-manager.js"></script>
```

### 2. Add Language Attributes

Use `data-i18n` attributes to mark translatable content:

```html
<!-- Basic text -->
<h1 data-i18n="appTitle">Labour Care Guide</h1>

<!-- Form labels -->
<label data-i18n="patientName">Patient Name</label>

<!-- Placeholders -->
<input data-i18n-placeholder="formLabels.enterPatientName" placeholder="Enter patient name">

<!-- Titles -->
<button data-i18n-title="saveButton" title="Save your progress">Save</button>
```

### 3. Language Switcher

The language switcher automatically appears in the header with two buttons:
- 🇺🇸 **English** - Switch to English
- 🇲🇲 **မြန်မာ** - Switch to Myanmar

## 🔧 How It Works

### Language Manager Class

The `LanguageManager` class handles all language operations:

```javascript
// Access the global instance
const langManager = window.languageManager;

// Get current language
const currentLang = langManager.getCurrentLanguage();

// Get translation for a key
const translatedText = langManager.t('patientName');

// Get translation with interpolation
const message = langManager.tInterpolate('welcomeMessage', { name: 'John' });
```

### Translation Keys

Translation keys can be nested using dot notation:

```json
{
  "formLabels": {
    "enterPatientName": "Enter patient name",
    "enterAge": "Age"
  }
}
```

Access with: `langManager.t('formLabels.enterPatientName')`

### Language Switching

```javascript
// Switch to Myanmar
await languageManager.switchLanguage('my');

// Switch to English
await languageManager.switchLanguage('en');
```

## 📝 Adding New Translations

### 1. Add to English File (`en.json`)

```json
{
  "newSection": "New Section",
  "newField": {
    "label": "New Field Label",
    "placeholder": "Enter new field value"
  }
}
```

### 2. Add to Myanmar File (`my.json`)

```json
{
  "newSection": "အပိုင်းအစအသစ်",
  "newField": {
    "label": "အကွက်အသစ်ခေါင်းစဉ်",
    "placeholder": "အကွက်အသစ်တန်ဖိုးကို ထည့်သွင်းပါ"
  }
}
```

### 3. Use in HTML

```html
<h4 data-i18n="newSection">New Section</h4>
<label data-i18n="newField.label">New Field Label</label>
<input data-i18n-placeholder="newField.placeholder" placeholder="Enter new field value">
```

## 🎨 Styling

### Language Switcher Appearance

The language switcher automatically styles itself with:
- Flag icons for each language
- Hover effects and animations
- Responsive design for mobile devices
- Dark mode support
- High contrast mode support

### Myanmar Font Support

Myanmar text automatically uses appropriate fonts:
- `Myanmar3`
- `Noto Sans Myanmar`
- `Pyidaungsu`
- `Myanmar Text`

## 🔄 Language Persistence

User language preferences are automatically saved to `localStorage` and restored on page reload.

## 📱 Responsive Design

The language switcher adapts to different screen sizes:
- **Desktop**: Full button text with flags
- **Tablet**: Compact buttons
- **Mobile**: Minimal width buttons

## ♿ Accessibility Features

- **Keyboard navigation**: Tab through language buttons
- **Screen reader support**: Proper ARIA labels
- **High contrast mode**: Enhanced borders and colors
- **Reduced motion**: Respects user preferences
- **Focus indicators**: Clear focus states

## 🚨 Error Handling

The system includes robust error handling:
- **Fallback to English** if translations fail to load
- **Console warnings** for missing translation keys
- **Graceful degradation** if language files are corrupted

## 🧪 Testing

Use the `language-test.html` file to test the language system:

```bash
# Open in browser
open language-test.html

# Or serve with Python
python3 -m http.server 8000
# Then visit http://localhost:8000/language-test.html
```

## 🔧 Advanced Usage

### Custom Language Switcher

```javascript
// Create custom language switcher
const customSwitcher = document.createElement('div');
customSwitcher.innerHTML = `
  <button onclick="languageManager.switchLanguage('en')">English</button>
  <button onclick="languageManager.switchLanguage('my')">မြန်မာ</button>
`;
```

### Dynamic Content

```javascript
// Update dynamic content when language changes
window.addEventListener('languageChanged', function(event) {
  const newLang = event.detail.language;
  
  // Update dynamic content
  updateDynamicContent(newLang);
  
  // Re-render components
  renderComponents();
});
```

### Conditional Translations

```javascript
// Show different content based on language
if (languageManager.getCurrentLanguage() === 'my') {
  // Show Myanmar-specific content
  showMyanmarContent();
} else {
  // Show English content
  showEnglishContent();
}
```

## 📚 Translation Guidelines

### 1. **Consistency**: Use consistent terminology across all translations
### 2. **Context**: Provide context for translators in comments
### 3. **Length**: Consider text length differences between languages
### 4. **Cultural**: Adapt content for cultural differences
### 5. **Medical Terms**: Use standard medical terminology

### Example Translation Structure

```json
{
  "medical": {
    "vitalSigns": {
      "bloodPressure": "Blood Pressure",
      "heartRate": "Heart Rate",
      "temperature": "Temperature"
    }
  }
}
```

## 🐛 Troubleshooting

### Common Issues

1. **Translations not loading**
   - Check file paths are correct
   - Verify JSON syntax is valid
   - Check browser console for errors

2. **Language switcher not appearing**
   - Ensure `language-manager.js` is loaded
   - Check for JavaScript errors
   - Verify CSS file is included

3. **Myanmar text not displaying correctly**
   - Check font files are accessible
   - Verify UTF-8 encoding
   - Test with different browsers

### Debug Mode

Enable debug logging:

```javascript
// In browser console
localStorage.setItem('debugLanguage', 'true');
location.reload();
```

## 🔮 Future Enhancements

- [ ] **More Languages**: Add support for additional languages
- [ ] **RTL Support**: Right-to-left language support
- [ ] **Auto-detection**: Detect user's preferred language
- [ ] **Translation Memory**: Cache frequently used translations
- [ ] **Online Translation**: Integration with translation services

## 📞 Support

For issues or questions about the language system:
1. Check the browser console for error messages
2. Review this documentation
3. Test with the `language-test.html` file
4. Check file permissions and paths

---

**Last Updated**: January 2025  
**Version**: 1.0.0  
**Compatibility**: Modern browsers (Chrome 80+, Firefox 75+, Safari 13+)
