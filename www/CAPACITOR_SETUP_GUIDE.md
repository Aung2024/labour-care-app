# Capacitor Setup Guide - PWA to Native Apps

## 📱 Overview

This guide will help you wrap your PWA (Progressive Web App) into native Android and iOS apps using **Capacitor**.

**Key Point:** ✅ **YES, you can update code after wrapping!** Capacitor allows you to:
- Update web code without rebuilding the app (using OTA updates or app store updates)
- Push updates through app stores
- Use Capacitor Live Reload for development

---

## 🎯 Pre-Wrapping Checklist

Before wrapping your app, ensure:

- [x] ✅ All security features working
- [x] ✅ PWA fully functional
- [x] ✅ iOS/Safari compatibility tested
- [x] ✅ All features tested and working
- [ ] ⚠️ **Firebase configuration** - May need adjustments for native apps
- [ ] ⚠️ **Deep linking** - Configure URL schemes
- [ ] ⚠️ **App icons and splash screens** - Prepare assets
- [ ] ⚠️ **App permissions** - Camera, storage, etc. (if needed)

---

## 📦 Step 1: Install Capacitor

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- Android Studio (for Android)
- Xcode (for iOS, macOS only)

### Installation

```bash
# Navigate to your project directory
cd /Users/user/Downloads/labour-care-app

# Install Capacitor CLI globally
npm install -g @capacitor/cli

# Install Capacitor core and plugins
npm install @capacitor/core @capacitor/cli
npm install @capacitor/android @capacitor/ios

# Initialize Capacitor
npx cap init
```

**During initialization, you'll be asked:**
- **App name:** `Labour Care App` or `MCH Care App`
- **App ID:** `com.jhpiego.labourcare` (or your preferred reverse domain)
- **Web directory:** `./` (current directory)

---

## 🔧 Step 2: Configure Capacitor

### Update `capacitor.config.json`

```json
{
  "appId": "com.jhpiego.labourcare",
  "appName": "Labour Care App",
  "webDir": ".",
  "bundledWebRuntime": false,
  "server": {
    "androidScheme": "https",
    "iosScheme": "https",
    "hostname": "labour-care.netlify.app",
    "allowNavigation": [
      "https://labour-care.netlify.app",
      "https://*.firebaseapp.com",
      "https://*.googleapis.com"
    ]
  },
  "plugins": {
    "SplashScreen": {
      "launchShowDuration": 2000,
      "launchAutoHide": true,
      "backgroundColor": "#10b981",
      "androidSplashResourceName": "splash",
      "androidScaleType": "CENTER_CROP",
      "showSpinner": false
    }
  }
}
```

---

## 🤖 Step 3: Add Android Platform

```bash
# Add Android platform
npx cap add android

# Sync web assets to native project
npx cap sync android

# Open in Android Studio
npx cap open android
```

### Android Configuration

1. **Update `android/app/build.gradle`:**
   - Set `minSdkVersion` to 22 (Android 5.1+)
   - Set `targetSdkVersion` to 33 or 34
   - Set `compileSdkVersion` to 34

2. **Update `AndroidManifest.xml`:**
   - Add internet permission (usually already there)
   - Configure deep linking if needed

3. **Add App Icons:**
   - Place icons in `android/app/src/main/res/mipmap-*/`
   - Use Android Asset Studio or generate icons

4. **Configure Firebase:**
   - Download `google-services.json` from Firebase Console
   - Place in `android/app/`

---

## 🍎 Step 4: Add iOS Platform

```bash
# Add iOS platform
npx cap add ios

# Sync web assets to native project
npx cap sync ios

# Open in Xcode
npx cap open ios
```

### iOS Configuration

1. **Update `ios/App/App/Info.plist`:**
   - Add app permissions (camera, photo library, etc. if needed)
   - Configure URL schemes

2. **Add App Icons:**
   - Use Xcode Asset Catalog
   - Generate icons for all required sizes

3. **Configure Firebase:**
   - Download `GoogleService-Info.plist` from Firebase Console
   - Add to Xcode project

4. **Signing & Capabilities:**
   - Configure signing in Xcode
   - Add capabilities (Push Notifications, Background Modes, etc.)

---

## 🔄 Step 5: How Updates Work After Wrapping

### Option 1: App Store Updates (Recommended for Major Changes)

**When to use:**
- Major feature additions
- Native plugin changes
- Security updates
- Configuration changes

**Process:**
1. Make code changes in your web app
2. Build and test locally
3. Sync to native: `npx cap sync`
4. Build native apps
5. Submit to App Store / Play Store

**Timeline:** 1-3 days for review

---

### Option 2: Over-The-Air (OTA) Updates (For Web Code Only)

**When to use:**
- Bug fixes
- UI/UX improvements
- Content updates
- Minor feature tweaks

**Tools:**
- **Capacitor Live Updates** (Capacitor's official solution)
- **CodePush** (Microsoft)
- **Appflow** (Ionic's solution)

**Process:**
1. Make web code changes
2. Build web assets
3. Deploy to update server
4. Apps check for updates on launch
5. Users get updates without app store

**Timeline:** Instant (users get update on next app launch)

---

### Option 3: Hybrid Approach (Best Practice)

**Major updates:** App Store
**Minor updates:** OTA

---

## 📝 Step 6: Update Workflow

### Development Workflow

```bash
# 1. Make changes to your web app
# (Edit HTML, CSS, JS files)

# 2. Test in browser
# (Your PWA should still work)

# 3. Sync changes to native apps
npx cap sync

# 4. Test in native apps
npx cap open android  # or ios

# 5. Build and deploy
# (Android: Build APK/AAB in Android Studio)
# (iOS: Archive in Xcode)
```

### After Initial Release

```bash
# For web-only updates (can use OTA):
# 1. Make changes
# 2. Deploy to Netlify (your PWA)
# 3. If using OTA, deploy update package

# For native updates (app store):
# 1. Make changes
# 2. npx cap sync
# 3. Build new version
# 4. Submit to stores
```

---

## ⚙️ Step 7: Important Configurations

### Firebase Configuration for Native Apps

**Android:**
1. Go to Firebase Console → Project Settings
2. Add Android app (package name: `com.jhpiego.labourcare`)
3. Download `google-services.json`
4. Place in `android/app/`

**iOS:**
1. Go to Firebase Console → Project Settings
2. Add iOS app (bundle ID: `com.jhpiego.labourcare`)
3. Download `GoogleService-Info.plist`
4. Add to Xcode project

### Deep Linking Configuration

**Android (`AndroidManifest.xml`):**
```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="labourcare" android:host="app" />
</intent-filter>
```

**iOS (`Info.plist`):**
```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>labourcare</string>
        </array>
    </dict>
</array>
```

---

## 🎨 Step 8: App Assets

### App Icons

**Android:**
- Generate icons for all densities
- Place in `android/app/src/main/res/mipmap-*/`
- Sizes: mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi

**iOS:**
- Use Xcode Asset Catalog
- Generate all required sizes (20pt, 29pt, 40pt, 60pt, etc.)

**Tools:**
- [App Icon Generator](https://www.appicon.co/)
- [IconKitchen](https://icon.kitchen/)
- Android Studio Asset Studio

### Splash Screens

**Android:**
- Create splash screen drawable
- Configure in `styles.xml`

**iOS:**
- Use Xcode Launch Screen
- Or configure in `Info.plist`

---

## 🔒 Step 9: Security Considerations

### For Native Apps

1. **Certificate Pinning** (Optional but recommended)
   - Pin Firebase certificates
   - Prevent man-in-the-middle attacks

2. **Code Obfuscation**
   - Minify JavaScript
   - Obfuscate sensitive code

3. **Root/Jailbreak Detection** (Optional)
   - Detect rooted/jailbroken devices
   - Warn or block access

4. **App Integrity**
   - Verify app signature
   - Prevent tampering

---

## 🧪 Step 10: Testing

### Before Release

1. **Test on Real Devices**
   - Android: Multiple devices, different Android versions
   - iOS: Multiple devices, different iOS versions

2. **Test Offline Functionality**
   - Service worker should work
   - Cached data should load

3. **Test Firebase Features**
   - Authentication
   - Firestore queries
   - Storage (if used)

4. **Test Performance**
   - App startup time
   - Page load times
   - Memory usage

5. **Test Security Features**
   - Authentication
   - Session timeout
   - Data masking
   - Audit logging

---

## 📱 Step 11: Building for Release

### Android

```bash
# 1. Sync latest changes
npx cap sync android

# 2. Open in Android Studio
npx cap open android

# 3. In Android Studio:
#    - Build → Generate Signed Bundle / APK
#    - Choose "Android App Bundle" (recommended)
#    - Sign with your keystore
#    - Upload to Play Store
```

### iOS

```bash
# 1. Sync latest changes
npx cap sync ios

# 2. Open in Xcode
npx cap open ios

# 3. In Xcode:
#    - Select "Any iOS Device" or your device
#    - Product → Archive
#    - Distribute App
#    - Upload to App Store
```

---

## 🔄 Step 12: Update Strategy

### Recommended Update Flow

```
┌─────────────────────────────────────┐
│   Web Code Changes (HTML/JS/CSS)   │
└──────────────┬──────────────────────┘
               │
               ▼
    ┌──────────────────────┐
    │  Deploy to Netlify    │
    │  (PWA still works)    │
    └──────────┬────────────┘
               │
               ▼
    ┌──────────────────────┐
    │  Option A: OTA Update│
    │  (Instant, no store) │
    └──────────┬────────────┘
               │
               ▼
    ┌──────────────────────┐
    │  Users get update    │
    │  on next app launch  │
    └──────────────────────┘

    OR

    ┌──────────────────────┐
    │  Option B: App Store  │
    │  (For major changes)  │
    └──────────┬────────────┘
               │
               ▼
    ┌──────────────────────┐
    │  npx cap sync        │
    │  Build native apps   │
    └──────────┬────────────┘
               │
               ▼
    ┌──────────────────────┐
    │  Submit to stores   │
    │  (1-3 day review)   │
    └──────────────────────┘
```

---

## 🚀 Quick Start Commands

```bash
# Initial Setup
npm install -g @capacitor/cli
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
npx cap init

# Add Platforms
npx cap add android
npx cap add ios

# Sync Changes (after making web code changes)
npx cap sync

# Open in IDEs
npx cap open android
npx cap open ios

# Copy web assets to native
npx cap copy

# Update native dependencies
npx cap update
```

---

## ⚠️ Important Notes

### What Can Be Updated Without App Store

✅ **Can update via OTA:**
- HTML, CSS, JavaScript changes
- UI/UX improvements
- Bug fixes
- Content updates
- Firebase rules (server-side)
- New features (web-based)

❌ **Cannot update via OTA:**
- Native plugin changes
- App permissions
- App configuration (capacitor.config.json changes)
- Native code changes
- App icons/splash screens
- Version number changes

### Best Practices

1. **Keep Web Code Separate**
   - All business logic in web code
   - Minimal native code
   - Easy to update

2. **Version Management**
   - Use semantic versioning
   - Track web version vs native version
   - Document what requires app store update

3. **Testing Strategy**
   - Test PWA first (faster iteration)
   - Test native apps before release
   - Use staging environment

4. **Update Communication**
   - Notify users of major updates
   - Use in-app update prompts
   - Document breaking changes

---

## 📚 Additional Resources

- [Capacitor Documentation](https://capacitorjs.com/docs)
- [Capacitor Live Updates](https://capacitorjs.com/docs/guides/live-updates)
- [Android App Bundle Guide](https://developer.android.com/guide/app-bundle)
- [iOS App Store Guidelines](https://developer.apple.com/app-store/review/guidelines/)

---

## 🎯 Next Steps

1. **Install Capacitor** (Step 1)
2. **Configure** (Step 2)
3. **Add Android** (Step 3)
4. **Add iOS** (Step 4)
5. **Test on devices**
6. **Build and deploy**

---

**Last Updated**: Current Date
**Status**: Ready for Capacitor Wrapping

