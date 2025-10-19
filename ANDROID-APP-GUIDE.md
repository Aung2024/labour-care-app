# Creating Android App with Google Bubblewrap

## 🎯 Overview

Google Bubblewrap converts your PWA into a native Android app (APK/AAB) that can be:
- Uploaded to Google Play Store
- Installed directly on Android devices
- Distributed to your team

---

## 📋 Prerequisites

### 1. **Install Required Software**

#### A. Node.js (Required)
```bash
# Check if installed
node --version
npm --version

# If not installed, download from: https://nodejs.org/
# Install LTS version (v18 or higher)
```

#### B. Java Development Kit (JDK 11+)
```bash
# Check if installed
java -version

# If not installed:
# Windows/Mac: Download from https://adoptium.net/
# macOS: brew install openjdk@11
# Linux: sudo apt install openjdk-11-jdk
```

#### C. Android SDK (Required for signing)
```bash
# Option 1: Install Android Studio (Recommended)
# Download from: https://developer.android.com/studio

# Option 2: Install just SDK command-line tools
# Download from: https://developer.android.com/studio#command-tools
```

---

## 🚀 Step-by-Step Process

### Step 1: Install Bubblewrap CLI

```bash
# Install globally
npm install -g @bubblewrap/cli

# Verify installation
bubblewrap --version
```

### Step 2: Initialize Bubblewrap

Navigate to your project folder and initialize:

```bash
cd /Users/user/Downloads/labour-care-app

# Initialize (this will ask questions)
bubblewrap init --manifest=https://your-domain.com/manifest.json
```

**Questions it will ask:**
1. **Domain:** Your app URL (e.g., `your-domain.com`)
2. **Name:** Maternal & Child Health Care System
3. **Package ID:** `com.jhpiego.mchcare` (or your preferred ID)
4. **Host:** Your domain without https://
5. **Start URL:** `/index.html`
6. **Display:** `standalone`
7. **Launcher Name:** MCH Care
8. **Theme Color:** `#10b981`
9. **Background Color:** `#ffffff`
10. **Icon URL:** `https://your-domain.com/icons/icon-512.png`

### Step 3: Generate Signing Key

You need a key to sign your app:

```bash
# Generate a new keystore
bubblewrap keygen

# This will create:
# - android.keystore (keep this safe!)
# - Password will be set during generation
```

**⚠️ IMPORTANT:** 
- Save the keystore file and password securely
- You'll need the same key for all future updates
- If you lose it, you can't update the app on Play Store

### Step 4: Build the Android App

```bash
# Build APK (for testing)
bubblewrap build

# Build AAB (for Play Store)
bubblewrap build --androidBuildTarget=aab
```

**Output:**
- APK: `app-release-signed.apk` (for testing/direct install)
- AAB: `app-release-bundle.aab` (for Google Play Store)

---

## 📦 What Gets Generated

After building, you'll have:

```
labour-care-app/
├── twa-manifest.json          # TWA configuration
├── android.keystore           # Signing key (KEEP SAFE!)
├── app-release-signed.apk     # Installable APK
└── app-release-bundle.aab     # Play Store upload file
```

---

## 🧪 Testing the APK

### Method 1: Install on Physical Device

1. **Enable USB Debugging** on your Android phone:
   - Settings → About Phone → Tap "Build number" 7 times
   - Settings → Developer Options → Enable "USB Debugging"

2. **Connect phone via USB**

3. **Install APK:**
```bash
# Using ADB (Android Debug Bridge)
adb install app-release-signed.apk

# Or transfer APK to phone and install manually
```

### Method 2: Using Android Emulator

1. **Open Android Studio**
2. **Tools → AVD Manager → Create Virtual Device**
3. **Drag and drop APK to emulator**

---

## 📱 Uploading to Google Play Store

### Step 1: Prepare Assets

You need these assets for Play Store:

1. **App Icon** (512x512 PNG, no alpha)
   - Create from your icon: `/icons/icon-512.png`
   - Must have no transparency

2. **Feature Graphic** (1024x500 PNG)
   - Banner image for store listing
   - Should showcase your app

3. **Screenshots** (minimum 2)
   - Phone: 320x3840 to 1080x7680
   - Tablet: 1200x1920 to 2048x3072
   - Take screenshots of your app in use

4. **Privacy Policy URL** (Required)
   - Must have a public URL with privacy policy
   - Example: `https://your-domain.com/privacy-policy.html`

### Step 2: Create Play Console Account

1. Go to: https://play.google.com/console
2. Create developer account ($25 one-time fee)
3. Provide required information

### Step 3: Create New App

1. **Click "Create App"**
2. **Fill in details:**
   - App name: Maternal & Child Health Care System
   - Default language: English
   - App or game: App
   - Free or paid: Free (or as needed)
   - Declarations: Accept

3. **Set up app:**
   - App content rating questionnaire
   - Target audience and content
   - Privacy policy URL
   - Data safety form

### Step 4: Upload AAB

1. **Go to "Release" → "Production"**
2. **Click "Create new release"**
3. **Upload `app-release-bundle.aab`**
4. **Add release notes** (what's new)
5. **Review and roll out**

### Step 5: Complete Store Listing

1. **Store settings:**
   - App category: Medical
   - Contact details
   - Privacy policy URL

2. **Main store listing:**
   - Short description (80 chars)
   - Full description (4000 chars max)
   - Screenshots
   - Feature graphic
   - App icon

3. **Submit for review**
   - Review can take 1-7 days
   - You'll be notified via email

---

## 🔄 Updating Your App

When you need to update:

### Step 1: Update PWA
- Make changes to your web app
- Deploy to server

### Step 2: Update Version

Edit `twa-manifest.json`:
```json
{
  "versionCode": 2,  // Increment this
  "versionName": "1.1"  // Update version name
}
```

### Step 3: Rebuild

```bash
# Build new version
bubblewrap build --androidBuildTarget=aab

# This creates new AAB with updated version
```

### Step 4: Upload to Play Store

1. Go to Play Console
2. Create new release
3. Upload new AAB
4. Add release notes
5. Submit for review

---

## 🎨 Customizing Your Android App

### Custom Splash Screen

Edit `twa-manifest.json`:
```json
{
  "backgroundColor": "#ffffff",
  "themeColor": "#10b981",
  "splashScreenFadeOutDuration": 300
}
```

### Custom App Settings

```json
{
  "name": "MCH Care",
  "launcherName": "MCH Care",
  "packageId": "com.jhpiego.mchcare",
  "display": "standalone",
  "orientation": "portrait",
  "startUrl": "/index.html"
}
```

### Digital Asset Links (Important!)

For your app to work, add this file to your web server:

**Create:** `https://your-domain.com/.well-known/assetlinks.json`

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.jhpiego.mchcare",
    "sha256_cert_fingerprints": [
      "YOUR_SHA256_FINGERPRINT_HERE"
    ]
  }
}]
```

**Get your SHA256 fingerprint:**
```bash
keytool -list -v -keystore android.keystore -alias android
```

---

## 🔧 Troubleshooting

### Problem: Bubblewrap command not found
```bash
# Reinstall globally
npm install -g @bubblewrap/cli

# Check npm global path
npm config get prefix

# Add to PATH if needed
```

### Problem: Build fails - SDK not found
```bash
# Set Android SDK path
export ANDROID_SDK_ROOT=/path/to/android/sdk

# Or add to ~/.bashrc or ~/.zshrc
echo 'export ANDROID_SDK_ROOT=/path/to/android/sdk' >> ~/.bashrc
```

### Problem: Signing failed
```bash
# Regenerate keystore
bubblewrap keygen --force

# Make sure to use same keystore for updates!
```

### Problem: App won't verify domain
- Check `assetlinks.json` is accessible
- Verify SHA256 fingerprint matches
- Make sure file is served over HTTPS
- Check package name matches exactly

---

## 📊 Alternative: Quick Build Script

Create a file `build-android.sh`:

```bash
#!/bin/bash

echo "🚀 Building Android App..."

# Update version (manual - edit twa-manifest.json first)
echo "📝 Make sure you updated version in twa-manifest.json!"
read -p "Press enter to continue..."

# Build APK for testing
echo "📦 Building APK..."
bubblewrap build

# Build AAB for Play Store
echo "📦 Building AAB..."
bubblewrap build --androidBuildTarget=aab

echo "✅ Build complete!"
echo "📱 APK: app-release-signed.apk (for testing)"
echo "🏪 AAB: app-release-bundle.aab (for Play Store)"
```

Make it executable:
```bash
chmod +x build-android.sh
./build-android.sh
```

---

## 📝 Checklist Before Upload

- [ ] PWA is live and accessible via HTTPS
- [ ] Manifest.json is accessible and valid
- [ ] Icons exist and are correct size (192px, 512px)
- [ ] Service worker is working
- [ ] App tested in Chrome (installable)
- [ ] Privacy policy page created
- [ ] Screenshots taken (phone and tablet)
- [ ] Feature graphic created (1024x500)
- [ ] App icon prepared (512x512, no alpha)
- [ ] assetlinks.json uploaded to server
- [ ] App built and signed successfully
- [ ] APK tested on physical device
- [ ] Play Console account created
- [ ] All store listing information prepared

---

## 💡 Best Practices

1. **Version Control:**
   - Keep `twa-manifest.json` in git
   - **DON'T** commit `android.keystore` (security risk)
   - Add to `.gitignore`: `*.keystore`, `*.apk`, `*.aab`

2. **Backup Keystore:**
   - Save `android.keystore` to secure location
   - Document the password securely
   - You can't recover if lost!

3. **Testing:**
   - Always test APK before uploading AAB
   - Test on different Android versions
   - Check offline functionality

4. **Updates:**
   - Increment `versionCode` for every release
   - Update `versionName` (e.g., 1.0 → 1.1)
   - Write clear release notes

5. **Store Optimization:**
   - Use keywords in description
   - High-quality screenshots
   - Respond to user reviews
   - Regular updates show active development

---

## 🌐 Additional Resources

- **Bubblewrap Docs:** https://github.com/GoogleChromeLabs/bubblewrap
- **TWA Guide:** https://developer.chrome.com/docs/android/trusted-web-activity/
- **Play Console:** https://play.google.com/console
- **Android Studio:** https://developer.android.com/studio

---

## 🆘 Getting Help

1. **Bubblewrap Issues:** https://github.com/GoogleChromeLabs/bubblewrap/issues
2. **Play Console Support:** https://support.google.com/googleplay/android-developer
3. **Stack Overflow:** Tag with `trusted-web-activity` or `bubblewrap`

---

## 🎉 Success Indicators

Your Android app is ready when:
- ✅ APK installs on Android device
- ✅ App opens and works correctly
- ✅ PWA content loads properly
- ✅ Offline functionality works
- ✅ App icon appears correct
- ✅ Splash screen shows
- ✅ No browser UI visible

---

**Note:** The resulting app is a "Trusted Web Activity" (TWA) - it's your PWA wrapped in a native Android shell. It loads your web app but appears as a native app with no browser UI.

**Estimated Time:**
- First-time setup: 2-3 hours
- Building app: 5-10 minutes
- Play Store review: 1-7 days

Good luck with your Android app! 🚀

