# Labour Care App - Developer Setup Guide

## Quick Start

### Prerequisites
- GitHub account with access to this repository
- Git installed
- Node.js (v14+)
- Android Studio
- Android device or emulator

---

## Initial Setup (One-time)

### 1. Clone Repository
```bash
git clone https://github.com/Aung2024/labour-care-app.git
cd labour-care-app
git checkout security-features
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Set Up Android
```bash
mkdir -p www
./quick-sync.sh  # Copies web files and syncs to Android
```

### 4. Open in Android Studio
1. Open Android Studio
2. File → Open → Select the `android` folder
3. Wait for Gradle sync

### 5. Run the App
- Click the green Run button (▶️) in Android Studio
- Or via terminal: `cd android && ./gradlew assembleDebug`

---

## Daily Workflow

### Starting Your Work Session
```bash
# Pull latest changes
git pull origin security-features

# Sync web to Android
./quick-sync.sh
```

### After Making Changes to Web Files (HTML/JS/CSS)
```bash
# Sync and build everything
./sync-and-build.sh

# Or do it manually:
./quick-sync.sh
cd android && ./gradlew assembleDebug
```

### Committing Your Changes
```bash
git add .
git commit -m "Description of changes"
git pull origin security-features  # Get latest first
git push origin security-features
```

---

## Helper Scripts

### `./quick-sync.sh`
Copies web files to `www/` and syncs to Android. Use after editing HTML/JS/CSS.

### `./sync-and-build.sh`
Does everything: pull, sync, and build APK. Use when starting work or after major changes.

---

## Important Notes

⚠️ **Always run `./quick-sync.sh` after:**
- Pulling changes from GitHub
- Editing any web file (HTML, JS, CSS)
- Switching branches

⚠️ **The Android app will NOT update automatically** when you edit web files. You must sync!

✅ **Web app changes apply to both:**
- Web version (when deployed)
- Android app (after running sync)

---

## Troubleshooting

### App shows old content
```bash
./quick-sync.sh
cd android && ./gradlew clean && ./gradlew assembleDebug
```

### Permission denied on scripts
```bash
chmod +x quick-sync.sh sync-and-build.sh
```

### Merge conflicts
```bash
git status  # See conflicting files
# Edit files to resolve conflicts
git add <filename>
git commit -m "Resolved conflict"
git push origin security-features
```

### Firebase not loading
- Check that `www/js/firebase.js` exists
- Run `./quick-sync.sh` again
- Clear app data on device

---

## Project Structure

```
labour-care-app/
├── index.html, home.html, login.html, etc.  ← Edit these (web files)
├── js/                                       ← JavaScript files
├── css/                                      ← Stylesheets
├── www/                                      ← Copy of web files (auto-generated)
├── android/                                  ← Android project (don't edit directly)
├── quick-sync.sh                             ← Helper script
├── sync-and-build.sh                         ← Helper script
└── capacitor.config.json                     ← Capacitor config
```

**Important:** Edit files in the root, NOT in `www/` or `android/app/src/main/assets/public/`

---

## Testing

### On Physical Device
1. Enable Developer Options (tap Build Number 7 times)
2. Enable USB Debugging
3. Connect via USB
4. Run from Android Studio

### On Emulator
1. Tools → Device Manager → Create Device
2. Select device and system image
3. Run from Android Studio

### Installing APK Manually
```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Git Best Practices

### Before Starting Work
```bash
git pull origin security-features
```

### Committing Often
```bash
git add .
git commit -m "Clear description of what changed"
git push origin security-features
```

### Creating Feature Branches (Optional)
```bash
git checkout -b feature-name
# Make changes
git push origin feature-name
# Create Pull Request on GitHub
```

---

## Contact

If you encounter issues, contact the project lead or check:
- GitHub Issues: https://github.com/Aung2024/labour-care-app/issues
- Project documentation in the repository

---

## Quick Reference

| Task | Command |
|------|---------|
| Pull latest | `git pull origin security-features` |
| Sync web to Android | `./quick-sync.sh` |
| Build APK | `cd android && ./gradlew assembleDebug` |
| Full sync + build | `./sync-and-build.sh` |
| Check branch | `git branch` |
| See changes | `git status` |
| Commit | `git add . && git commit -m "message"` |
| Push | `git push origin security-features` |

