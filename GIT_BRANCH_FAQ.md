# Git Branch FAQ

## 🌿 Your Questions Answered

### Q1: Is my local folder the same as the security-features branch?

**Answer**: **Yes!** 

If you're currently on the `security-features` branch locally, your folder contains the code from that branch.

**Check your current branch**:
```bash
git branch
# Should show: * security-features
```

**What this means**:
- ✅ Your local folder = `security-features` branch code
- ✅ When you edit files, you're editing the `security-features` branch
- ✅ When you commit, you're committing to `security-features` branch

---

### Q2: How do I roll back to main branch?

**Answer**: **Just switch branches - no need to download!**

**Option 1: Switch to Main Branch** (Recommended)
```bash
# Switch to main branch
git checkout main

# Your folder now contains main branch code
# All security-features changes are "hidden" (but still in Git)
```

**Option 2: Create a New Folder** (If you want both)
```bash
# Clone repository again in different folder
cd /Users/user/Downloads
git clone https://github.com/Aung2024/labour-care-app.git labour-care-app-main
cd labour-care-app-main
git checkout main
```

**Option 3: Stash Changes** (If you have uncommitted changes)
```bash
# Save current changes temporarily
git stash

# Switch to main
git checkout main

# Later, switch back and restore changes
git checkout security-features
git stash pop
```

---

## 🔄 Common Git Branch Operations

### Switch Between Branches

```bash
# Switch to main
git checkout main

# Switch back to security-features
git checkout security-features

# Create and switch to new branch
git checkout -b new-branch-name
```

### See What Branch You're On

```bash
git branch
# * indicates current branch

git status
# Shows current branch at top
```

### See All Branches (Local + Remote)

```bash
git branch -a
# Shows all branches
```

---

## 📁 Understanding Your Local Folder

### Current State

**If you're on `security-features` branch**:
- Your folder contains: Security features code
- Files include: `js/session-manager.js`, `js/password-policy.js`, etc.
- `firestore.rules` includes: New security collections

**If you switch to `main` branch**:
- Your folder contains: Original code (before security features)
- Files do NOT include: New security JS files
- `firestore.rules` does NOT include: Security collections

### Important Notes

1. **One folder = One branch at a time**
   - When you switch branches, files change
   - Git manages this automatically

2. **Uncommitted changes**
   - If you have uncommitted changes, Git will warn you
   - You can: commit, stash, or discard them

3. **Remote vs Local**
   - Local branch: What's in your folder
   - Remote branch: What's on GitHub
   - They can be different!

---

## 🎯 Recommended Workflow

### For Testing Security Features

1. **Stay on `security-features` branch**:
   ```bash
   git checkout security-features
   ```

2. **Make changes and test**

3. **Commit changes**:
   ```bash
   git add .
   git commit -m "fix: Account lockout debugging"
   git push
   ```

### For Working on Main Branch

1. **Switch to main**:
   ```bash
   git checkout main
   ```

2. **Your folder now has main branch code**

3. **Make changes, commit, push**

### For Merging Security Features to Main

1. **Switch to main**:
   ```bash
   git checkout main
   ```

2. **Merge security-features**:
   ```bash
   git merge security-features
   ```

3. **Push to main**:
   ```bash
   git push origin main
   ```

---

## 🔍 Quick Reference

```bash
# Check current branch
git branch

# Switch to main
git checkout main

# Switch to security-features
git checkout security-features

# See what changed between branches
git diff main..security-features

# See commit history
git log --oneline

# See remote branches
git branch -r
```

---

## ⚠️ Important Notes

1. **Uncommitted Changes**:
   - If you have uncommitted changes, Git won't let you switch branches
   - Options: commit, stash, or discard

2. **File Conflicts**:
   - If same file changed in both branches, Git will show conflict
   - Resolve conflicts before switching

3. **Remote Sync**:
   - Local changes don't automatically sync to remote
   - Use `git push` to sync

---

## ✅ Summary

- **Your local folder = Current branch code** ✅
- **To roll back to main = `git checkout main`** ✅
- **No need to download - Git manages everything** ✅
- **You can switch branches anytime** ✅

---

**Your folder is like a chameleon - it changes based on which branch you're on!** 🦎

