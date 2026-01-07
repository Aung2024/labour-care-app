# Using Cursor IDE for Labour Care App Development

## What is Cursor?

Cursor is an AI-powered code editor (based on VS Code) that can help you:
- Understand code faster
- Write code with AI assistance
- Debug issues by asking the AI
- Navigate large codebases easily

---

## Initial Setup for Your Co-Worker

### Step 1: Install Cursor
1. Go to https://cursor.sh
2. Download for your operating system (Mac/Windows/Linux)
3. Install and open Cursor

### Step 2: Clone the Repository in Cursor
**Option A: Using Cursor's UI**
1. Open Cursor
2. Click "Clone Git Repository" on the welcome screen
3. Enter: `https://github.com/Aung2024/labour-care-app.git`
4. Choose a folder to save it
5. Open the cloned folder

**Option B: Using Terminal**
1. Open Terminal (outside Cursor or inside Cursor's terminal)
2. Run:
```bash
cd ~/Documents  # or wherever you want the project
git clone https://github.com/Aung2024/labour-care-app.git
cd labour-care-app
git checkout security-features
```
3. Open Cursor → File → Open Folder → Select `labour-care-app`

### Step 3: Install Dependencies
Open Cursor's terminal (`Ctrl+`` or `Cmd+``) and run:
```bash
npm install
```

### Step 4: Initial Sync
```bash
./quick-sync.sh
```

---

## Using Cursor AI Effectively

### Quick Commands

| Shortcut | What it does |
|----------|--------------|
| `Cmd+K` / `Ctrl+K` | AI command bar - edit code with AI |
| `Cmd+L` / `Ctrl+L` | AI chat - ask questions about code |
| `Cmd+Shift+L` / `Ctrl+Shift+L` | Add selected code to chat |
| `Cmd+I` / `Ctrl+I` | Inline AI edit |

### Example Prompts to Use

**Understanding the codebase:**
- "Explain how authentication works in this app"
- "What does the smartFirestoreQuery function do?"
- "How is patient data stored and retrieved?"
- "Where is the login logic implemented?"

**Making changes:**
- "Add phone number validation to patient registration"
- "Fix this error: [paste error message]"
- "Add a loading spinner while data is fetching"
- "Make this function use async/await instead of callbacks"

**Debugging:**
- "Why might this query return empty results?"
- "What could cause the app to be slow on Android?"
- "Help me fix: Cannot read property 'x' of undefined"

**Android-specific:**
- "How do I sync web changes to the Android app?"
- "How do I build a debug APK?"
- "What's the difference between www/ and android/app/src/main/assets/public/?"

---

## Cursor Workflow for This Project

### Starting Your Work Session

1. **Open Cursor** and open the project folder
2. **Open terminal** (`Ctrl+`` or `Cmd+``)
3. **Pull latest changes:**
```bash
git pull origin security-features
./quick-sync.sh
```

### Making Changes to Web Files

1. **Edit files** (index.html, js/*.js, css/*.css, etc.)
2. **Use AI to help:** Press `Cmd+K` and describe what you want to change
3. **Sync to Android:**
```bash
./quick-sync.sh
```
4. **Build and test:**
```bash
cd android && ./gradlew assembleDebug && cd ..
```

### Committing Changes

**Option A: Using Cursor's Git UI (easier)**
1. Click the Source Control icon in the left sidebar (branch icon)
2. See changed files
3. Click "+" to stage files
4. Type a commit message
5. Click "✓" to commit
6. Click "..." → Push to push to GitHub

**Option B: Using Terminal**
```bash
git add .
git commit -m "Your commit message"
git pull origin security-features  # Get any new changes
git push origin security-features
```

---

## Project Structure Overview

Ask Cursor AI "Explain the project structure" or refer to this:

```
labour-care-app/
├── 📄 index.html          ← App entry point (router)
├── 📄 home.html           ← Main dashboard
├── 📄 login.html          ← Login page
├── 📄 patient-enhanced.html ← Patient registration
├── 📄 list.html           ← Patient list
├── 📄 antenatal-form.html ← ANC form
├── 📄 labour-form.html    ← Labour form
├── 📄 postnatal-form.html ← Postnatal form
│
├── 📁 js/                 ← JavaScript files
│   ├── firebase.js        ← Firebase config & smart query
│   ├── auth-guard.js      ← Authentication protection
│   ├── session-manager.js ← Session timeout handling
│   ├── rbac-manager.js    ← Role-based access control
│   ├── duplicate-detector.js ← Patient duplicate detection
│   ├── clinical-validator.js ← Clinical data validation
│   ├── data-masking.js    ← Sensitive data masking
│   └── data-linkage.js    ← Cross-form data linking
│
├── 📁 css/                ← Stylesheets
│
├── 📁 www/                ← AUTO-GENERATED (don't edit!)
│
├── 📁 android/            ← Android project
│   └── app/src/main/assets/public/  ← AUTO-GENERATED
│
├── 📜 quick-sync.sh       ← Sync web → Android
├── 📜 sync-and-build.sh   ← Full sync + build
└── 📄 capacitor.config.json ← Capacitor config
```

**Important:** Only edit files in the root folder (not in www/ or android/app/src/main/assets/public/)

---

## Common Tasks with Cursor

### Task 1: Fix a Bug

1. Open the file with the bug
2. Select the problematic code
3. Press `Cmd+L` (Mac) or `Ctrl+L` (Windows)
4. Describe the bug: "This code causes [error]. Fix it."
5. Review the AI's suggestion
6. Accept or modify the change
7. Sync and test:
```bash
./quick-sync.sh
cd android && ./gradlew assembleDebug
```

### Task 2: Add a New Feature

1. Press `Cmd+L` to open AI chat
2. Describe what you want: "Add a feature that [description]"
3. AI will suggest where and how to add it
4. Follow the AI's guidance
5. Sync and test

### Task 3: Understand Existing Code

1. Open the file you want to understand
2. Select the code section
3. Press `Cmd+L`
4. Ask: "Explain what this code does"
5. AI will explain the code

### Task 4: Find Where Something is Implemented

1. Press `Cmd+L`
2. Ask: "Where is [feature] implemented?"
3. AI will search the codebase and point you to the right files

---

## Cursor + Android Studio

While Cursor is great for editing code, you'll still need **Android Studio** for:
- Running the app on a device/emulator
- Debugging Android-specific issues
- Building release APKs
- Using Android-specific tools

**Workflow:**
1. Edit code in **Cursor**
2. Sync using **Cursor's terminal** (`./quick-sync.sh`)
3. Build/Run in **Android Studio** (or use terminal: `./gradlew assembleDebug`)

---

## Syncing Changes - Step by Step

Every time you edit web files (HTML, JS, CSS), you need to sync:

```bash
# 1. Make sure you're in the project root
cd ~/Documents/labour-care-app  # or wherever your project is

# 2. Sync web files to Android
./quick-sync.sh

# 3. Build the APK
cd android && ./gradlew assembleDebug && cd ..

# 4. APK is ready at:
# android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Troubleshooting in Cursor

### "command not found: npm"
Install Node.js from https://nodejs.org/

### "permission denied: ./quick-sync.sh"
```bash
chmod +x quick-sync.sh sync-and-build.sh
```

### Cursor can't find files
1. Make sure you opened the correct folder (labour-care-app)
2. Wait for Cursor to finish indexing (see progress in bottom status bar)
3. Try: Cmd+Shift+P → "Reload Window"

### Git authentication issues
```bash
# Set up your Git identity
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

### AI not understanding the code
1. Make sure the file is saved
2. Try selecting specific code before asking
3. Be more specific in your question
4. Provide context: "In this Firebase app, how do I..."

---

## Best Practices

### 1. Pull before you start
Always start your session with:
```bash
git pull origin security-features
./quick-sync.sh
```

### 2. Sync after editing
Always run `./quick-sync.sh` after editing web files

### 3. Commit often
Small, frequent commits are better than large ones

### 4. Use descriptive commit messages
- ❌ "Fixed stuff"
- ✅ "Fixed duplicate detection not working for exact name matches"

### 5. Test before pushing
Build and test the app before pushing your changes

### 6. Communicate with your teammate
Let each other know what you're working on to avoid conflicts

---

## Quick Reference

```
┌─────────────────────────────────────────────────────────┐
│                 CURSOR QUICK REFERENCE                  │
├─────────────────────────────────────────────────────────┤
│ Open AI Chat:     Cmd+L (Mac) / Ctrl+L (Windows)       │
│ AI Edit Code:     Cmd+K (Mac) / Ctrl+K (Windows)       │
│ Open Terminal:    Ctrl+` (backtick)                    │
│ Search Files:     Cmd+P (Mac) / Ctrl+P (Windows)       │
│ Search in Files:  Cmd+Shift+F / Ctrl+Shift+F           │
│ Git Panel:        Click branch icon in sidebar         │
├─────────────────────────────────────────────────────────┤
│                   GIT COMMANDS                          │
│ Pull changes:     git pull origin security-features    │
│ Sync to Android:  ./quick-sync.sh                      │
│ Build APK:        cd android && ./gradlew assembleDebug│
│ Commit:           git add . && git commit -m "message" │
│ Push:             git push origin security-features    │
└─────────────────────────────────────────────────────────┘
```

---

## Getting Help

1. **Ask Cursor AI** - It knows this codebase!
2. **Read the documentation** - SETUP_GUIDE.md, WORKFLOW_DIAGRAM.md
3. **Check the terminal output** - Errors are usually descriptive
4. **Contact your teammate** - You're working together!

---

## Summary

1. **Cursor** = Your main code editor with AI assistance
2. **Terminal in Cursor** = Run sync and build commands
3. **Android Studio** = Run the app on device/emulator
4. **Git** = Share code with your teammate
5. **./quick-sync.sh** = The magic command that updates Android

Happy coding! 🚀

