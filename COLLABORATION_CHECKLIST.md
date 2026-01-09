# Collaboration Setup Checklist

## For You (Repository Owner)

### ☐ Step 1: Push the helper scripts
```bash
cd /Users/user/Downloads/labour-care-app
git push origin security-features
```

### ☐ Step 2: Add your co-worker on GitHub
1. Go to: https://github.com/Aung2024/labour-care-app/settings/access
2. Click **"Add people"**
3. Enter their GitHub username or email
4. Select **"Write"** permission
5. Click **"Add [username] to this repository"**

### ☐ Step 3: Send them the setup instructions
Share the `SETUP_GUIDE.md` file or send them this link after they accept the invitation:
```
https://github.com/Aung2024/labour-care-app/blob/security-features/SETUP_GUIDE.md
```

---

## For Your Co-Worker

### ☐ Step 1: Accept GitHub invitation
Check email for invitation to `labour-care-app` repository

### ☐ Step 2: Install prerequisites
- [ ] Git: https://git-scm.com/downloads
- [ ] Node.js: https://nodejs.org/ (LTS version)
- [ ] Android Studio: https://developer.android.com/studio

### ☐ Step 3: Clone and setup
```bash
git clone https://github.com/Aung2024/labour-care-app.git
cd labour-care-app
git checkout security-features
npm install
./quick-sync.sh
```

### ☐ Step 4: Open in Android Studio
1. Launch Android Studio
2. File → Open
3. Select the `android` folder
4. Wait for Gradle sync

### ☐ Step 5: Test the build
```bash
cd android
./gradlew assembleDebug
```

### ☐ Step 6: Verify everything works
- [ ] App builds successfully
- [ ] Can run on device/emulator
- [ ] Can see login page
- [ ] Firebase loads (check console logs)

---

## Daily Workflow Reminder

### Every morning:
```bash
git pull origin security-features
./quick-sync.sh
```

### After making changes:
```bash
./sync-and-build.sh
git add .
git commit -m "Description"
git push origin security-features
```

---

## Common Issues

### "Permission denied" on scripts
```bash
chmod +x quick-sync.sh sync-and-build.sh
```

### "fatal: could not read Username"
```bash
# Configure Git
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"

# Use SSH instead of HTTPS (optional)
git remote set-url origin git@github.com:Aung2024/labour-care-app.git
```

### App not updating after changes
```bash
./quick-sync.sh
cd android && ./gradlew clean && ./gradlew assembleDebug
```

---

## Key Points to Remember

✅ **Web changes need syncing**: Always run `./quick-sync.sh` after editing HTML/JS/CSS

✅ **Pull before push**: Always `git pull` before `git push` to avoid conflicts

✅ **Communicate**: Let each other know what you're working on to avoid conflicts

✅ **Test before committing**: Build and test the app before pushing changes

✅ **Commit often**: Small, frequent commits are better than large ones

---

## File Locations

| File | Purpose |
|------|---------|
| `SETUP_GUIDE.md` | Complete setup instructions |
| `quick-sync.sh` | Sync web files to Android |
| `sync-and-build.sh` | Pull, sync, and build APK |
| `android/app/build/outputs/apk/debug/app-debug.apk` | Built APK |

---

## Support

If issues arise:
1. Check `SETUP_GUIDE.md` troubleshooting section
2. Check Android Studio's Build output
3. Check browser console (for web version)
4. Check `adb logcat` (for Android issues)
5. Contact project lead

