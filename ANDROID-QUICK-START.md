# Android App - Quick Start Commands

## 🚀 One-Time Setup

```bash
# 1. Install Bubblewrap
npm install -g @bubblewrap/cli

# 2. Initialize (run from project folder)
cd /Users/user/Downloads/labour-care-app
bubblewrap init --manifest=https://your-domain.com/manifest.json

# 3. Generate signing key
bubblewrap keygen
```

**⚠️ Save your keystore password securely!**

---

## 📦 Build Commands

```bash
# Build APK (for testing on devices)
bubblewrap build

# Build AAB (for Google Play Store)
bubblewrap build --androidBuildTarget=aab
```

---

## 🔄 Update Process

```bash
# 1. Edit twa-manifest.json (increment version)
# 2. Build new version
bubblewrap build --androidBuildTarget=aab

# 3. Upload to Play Store
```

---

## 🧪 Testing

```bash
# Install on connected Android device
adb install app-release-signed.apk

# Or share APK file and install manually
```

---

## 📱 Output Files

- **APK:** `app-release-signed.apk` → Install on device
- **AAB:** `app-release-bundle.aab` → Upload to Play Store
- **Keystore:** `android.keystore` → Keep secret!

---

## ⚡ Quick Checklist

Before building:
- [ ] PWA deployed to HTTPS server
- [ ] Manifest and icons accessible online
- [ ] Privacy policy URL ready
- [ ] Version number incremented

---

## 🆘 Common Commands

```bash
# Check Bubblewrap version
bubblewrap --version

# Update Bubblewrap
npm update -g @bubblewrap/cli

# Get SHA256 fingerprint
keytool -list -v -keystore android.keystore -alias android

# Check connected devices
adb devices

# Uninstall app from device
adb uninstall com.jhpiego.mchcare
```

---

**Full Guide:** See `ANDROID-APP-GUIDE.md`

