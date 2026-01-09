# Labour Care App - Development Workflow

## How Changes Flow from Code to Android App

```
┌─────────────────────────────────────────────────────────────────┐
│                         DEVELOPER'S WORK                         │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │  Edit Web Files         │
                    │  (HTML, JS, CSS)        │
                    │                         │
                    │  • index.html           │
                    │  • home.html            │
                    │  • js/firebase.js       │
                    │  • etc.                 │
                    └─────────────────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │  Run: ./quick-sync.sh   │
                    │                         │
                    │  This copies files to:  │
                    │  www/ folder            │
                    └─────────────────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │  npx cap sync android   │
                    │                         │
                    │  Copies www/ to:        │
                    │  android/app/src/main/  │
                    │  assets/public/         │
                    └─────────────────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │  Build APK              │
                    │  ./gradlew assembleDebug│
                    │                         │
                    │  Creates:               │
                    │  app-debug.apk          │
                    └─────────────────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │  Install on Device      │
                    │                         │
                    │  Android app now shows  │
                    │  your changes! ✅       │
                    └─────────────────────────┘
```

---

## Git Collaboration Flow

```
┌──────────────────┐                    ┌──────────────────┐
│   Developer 1    │                    │   Developer 2    │
│   (You)          │                    │   (Co-worker)    │
└──────────────────┘                    └──────────────────┘
         │                                       │
         │ 1. Make changes                       │
         │    Edit index.html                    │
         ▼                                       │
    git commit                                   │
         │                                       │
         │ 2. Push to GitHub                     │
         ▼                                       │
    git push origin security-features            │
         │                                       │
         │                                       │
         │              GitHub                   │
         │         (security-features            │
         │              branch)                  │
         │                  │                    │
         │                  │                    │
         │                  │ 3. Pull changes    │
         │                  │                    ▼
         │                  │         git pull origin security-features
         │                  │                    │
         │                  │                    │ 4. Sync to Android
         │                  │                    ▼
         │                  │              ./quick-sync.sh
         │                  │                    │
         │                  │                    │ 5. Build & test
         │                  │                    ▼
         │                  │         cd android && ./gradlew assembleDebug
         │                  │                    │
         │                  │                    │ 6. Make more changes
         │                  │                    ▼
         │                  │              git commit & push
         │                  │                    │
         │ 7. Pull their    │ ◄──────────────────┘
         │    changes       │
         ▼                  │
    git pull origin security-features
         │
         │ 8. Sync & continue
         ▼
    ./quick-sync.sh
```

---

## What Gets Synced Where

```
┌─────────────────────────────────────────────────────────────────┐
│                      PROJECT STRUCTURE                           │
└─────────────────────────────────────────────────────────────────┘

labour-care-app/
│
├── 📝 index.html, home.html, etc.    ← EDIT THESE (source files)
├── 📁 js/                             ← EDIT THESE (source files)
├── 📁 css/                            ← EDIT THESE (source files)
│
├── 📦 www/                            ← AUTO-GENERATED (don't edit)
│   ├── index.html                     ← Copy of source
│   ├── js/                            ← Copy of source
│   └── css/                           ← Copy of source
│
└── 📱 android/
    └── app/src/main/assets/public/    ← AUTO-GENERATED (don't edit)
        ├── index.html                 ← Copy from www/
        ├── js/                        ← Copy from www/
        └── css/                       ← Copy from www/

┌─────────────────────────────────────────────────────────────────┐
│  RULE: Always edit source files in root, never in www/ or       │
│        android/app/src/main/assets/public/                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## When to Run What

### Scenario 1: You just pulled changes from GitHub
```bash
git pull origin security-features
./quick-sync.sh              # ← MUST DO THIS
```
**Why?** Git only updates source files, not www/ or Android assets

---

### Scenario 2: You edited index.html
```bash
# Edit index.html
./quick-sync.sh              # ← Sync to Android
cd android && ./gradlew assembleDebug  # ← Build APK
```
**Why?** Changes to source files don't automatically appear in Android

---

### Scenario 3: You edited Android-specific files (AndroidManifest.xml)
```bash
# Edit android/app/src/main/AndroidManifest.xml
cd android && ./gradlew assembleDebug  # ← Just rebuild
```
**Why?** Android files don't need syncing

---

### Scenario 4: Starting your work day
```bash
git pull origin security-features
./quick-sync.sh
```
**Why?** Get latest changes and sync them to Android

---

### Scenario 5: Ready to share your work
```bash
./sync-and-build.sh          # ← Pull, sync, build
git add .
git commit -m "Added login validation"
git push origin security-features
```
**Why?** Test everything works before pushing

---

## Quick Commands Cheat Sheet

| What you want to do | Command |
|---------------------|---------|
| Get latest code | `git pull origin security-features` |
| Sync web → Android | `./quick-sync.sh` |
| Build APK | `cd android && ./gradlew assembleDebug` |
| Do everything | `./sync-and-build.sh` |
| Save your work | `git add . && git commit -m "message"` |
| Share your work | `git push origin security-features` |
| Check what changed | `git status` |
| See commit history | `git log --oneline` |

---

## Important Reminders

⚠️ **The Android app is NOT automatically updated when you:**
- Pull from GitHub
- Edit HTML/JS/CSS files
- Switch branches

✅ **You MUST run `./quick-sync.sh` to update Android after:**
- Pulling changes
- Editing web files
- Switching branches

✅ **Both developers see the same code when:**
- Both pull from the same branch
- Both run `./quick-sync.sh`
- Both build the APK

---

## Testing Your Setup

Run this test to verify everything works:

```bash
# 1. Pull latest
git pull origin security-features

# 2. Sync
./quick-sync.sh

# 3. Build
cd android && ./gradlew assembleDebug && cd ..

# 4. Check APK exists
ls -lh android/app/build/outputs/apk/debug/app-debug.apk

# If you see the APK file, you're all set! ✅
```

