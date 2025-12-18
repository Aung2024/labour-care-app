# Git Branching & Netlify Deployment Guide

## 🌿 Creating a New Branch for Security Updates

### Step 1: Check Current Status

```bash
# Navigate to your project
cd /Users/user/Downloads/labour-care-app

# Check current branch (should be 'main' or 'master')
git branch

# Check if you have uncommitted changes
git status
```

### Step 2: Commit Current Changes (if any)

If you have uncommitted changes, commit them first:

```bash
# Add all changes
git add .

# Commit with descriptive message
git commit -m "feat: Add security features - session management, password policy, audit logging"
```

### Step 3: Create and Switch to New Branch

```bash
# Create new branch from current state
git checkout -b security-features

# Or if you prefer a different name:
# git checkout -b feature/security-phase1
# git checkout -b develop
```

### Step 4: Push Branch to Remote

```bash
# Push the new branch to GitHub/GitLab
git push -u origin security-features
```

---

## 🚀 Netlify Deployment Options

Netlify offers **two main ways** to test branches:

### Option 1: Deploy Preview (Recommended for Testing) ⭐

**What it is**: Automatic preview deployments for every branch/PR  
**Best for**: Testing before merging  
**Cost**: Free  
**URL**: Unique URL per branch/PR (e.g., `security-features--your-site.netlify.app`)

#### Setup Steps:

1. **Enable Deploy Previews** (usually enabled by default):
   - Go to Netlify Dashboard
   - Select your site
   - Go to **Site settings** → **Build & deploy** → **Deploy contexts**
   - Ensure **Deploy previews** is enabled

2. **Create Pull Request** (if using GitHub/GitLab):
   ```bash
   # Push your branch
   git push -u origin security-features
   
   # Then create a PR on GitHub/GitLab
   # Netlify will automatically create a preview deploy
   ```

3. **Or Push Branch Directly** (if PR not needed):
   - Just push the branch: `git push -u origin security-features`
   - Netlify will create a deploy preview automatically
   - Check Netlify Dashboard → **Deploys** tab
   - You'll see a deploy for `security-features` branch

4. **Access Preview URL**:
   - Go to Netlify Dashboard → **Deploys**
   - Find the deploy for `security-features` branch
   - Click on it to see the preview URL
   - URL format: `security-features--your-site-name.netlify.app`

#### Advantages:
- ✅ Automatic (no manual setup)
- ✅ Free
- ✅ Isolated from production
- ✅ Easy to share with team
- ✅ Can test multiple branches simultaneously

---

### Option 2: Branch Deploy (Separate Site)

**What it is**: Deploy a specific branch to a separate Netlify site  
**Best for**: Long-term testing environments  
**Cost**: Free (if within limits)  
**URL**: Custom subdomain or separate domain

#### Setup Steps:

1. **Create New Netlify Site**:
   - Go to Netlify Dashboard
   - Click **Add new site** → **Import an existing project**
   - Connect to your Git repository
   - Select branch: `security-features`
   - Configure build settings (same as main site)
   - Deploy

2. **Or Use Netlify CLI**:
   ```bash
   # Install Netlify CLI
   npm install -g netlify-cli
   
   # Login
   netlify login
   
   # Initialize (if not already done)
   netlify init
   
   # Deploy to new site
   netlify deploy --prod --branch security-features
   ```

#### Advantages:
- ✅ Completely separate from production
- ✅ Can have custom domain
- ✅ Good for staging environment

---

## 📋 Recommended Workflow

### For Testing Security Features:

**Option 1: Deploy Preview (Easiest)** ⭐

```bash
# 1. Create branch
git checkout -b security-features

# 2. Make sure all changes are committed
git add .
git commit -m "feat: Security features implementation"

# 3. Push branch
git push -u origin security-features

# 4. Netlify automatically creates preview deploy
# 5. Check Netlify Dashboard for preview URL
```

**Option 2: Create Pull Request**

```bash
# 1. Create branch and push (same as above)
git checkout -b security-features
git push -u origin security-features

# 2. Create PR on GitHub/GitLab
# - Go to your repository
# - Click "New Pull Request"
# - Select: main ← security-features
# - Create PR

# 3. Netlify automatically creates preview deploy for PR
# 4. Preview URL will be in PR comments (if Netlify bot is enabled)
```

---

## 🔧 Netlify Configuration

### Configure Build Settings

If you need different build settings for the branch, you can use `netlify.toml`:

```toml
# netlify.toml

[build]
  publish = "dist"  # or your build output directory
  command = "npm run build"  # or your build command

# Production branch settings
[context.production]
  command = "npm run build"

# Branch deploy settings (for security-features branch)
[context.branch-deploy]
  command = "npm run build"

# Deploy preview settings
[context.deploy-preview]
  command = "npm run build"
```

### Environment Variables

If you need different environment variables for testing:

1. Go to Netlify Dashboard
2. **Site settings** → **Environment variables**
3. Add variables for specific contexts:
   - **Production**: Main branch only
   - **Deploy previews**: All branches/PRs
   - **Branch deploys**: Specific branches

---

## 🧪 Testing Workflow

### Step-by-Step Testing Process:

1. **Create Branch**:
   ```bash
   git checkout -b security-features
   git push -u origin security-features
   ```

2. **Wait for Netlify Deploy**:
   - Check Netlify Dashboard
   - Wait for deploy to complete (usually 1-2 minutes)

3. **Get Preview URL**:
   - Netlify Dashboard → **Deploys** → Find `security-features` deploy
   - Copy preview URL

4. **Test Security Features**:
   - Open preview URL in browser
   - Test session timeout
   - Test password policy
   - Test account lockout
   - Check audit logs in Firestore

5. **Share with Team**:
   - Share preview URL for testing
   - Collect feedback

6. **Merge to Main** (when ready):
   ```bash
   # Switch back to main
   git checkout main
   
   # Merge security-features branch
   git merge security-features
   
   # Push to main (triggers production deploy)
   git push origin main
   ```

---

## 🔍 Verify Netlify Setup

### Check if Deploy Previews are Enabled:

1. Netlify Dashboard → Your Site
2. **Site settings** → **Build & deploy** → **Deploy contexts**
3. Should see:
   - ✅ **Production branch**: `main` (or `master`)
   - ✅ **Deploy previews**: Enabled
   - ✅ **Branch deploys**: Enabled (optional)

### Check Build Settings:

1. **Site settings** → **Build & deploy** → **Build settings**
2. Verify:
   - **Build command**: Correct (e.g., `npm run build` or leave empty for static site)
   - **Publish directory**: Correct (e.g., `.` for root, or `dist` for built files)

---

## 🚨 Troubleshooting

### Issue: No Deploy Preview Created

**Solutions**:
1. Check if branch was pushed: `git push -u origin security-features`
2. Check Netlify Dashboard → **Deploys** tab
3. Check **Site settings** → **Build & deploy** → **Deploy contexts** → Ensure "Deploy previews" is enabled
4. Manually trigger deploy: Netlify Dashboard → **Deploys** → **Trigger deploy** → Select branch

### Issue: Build Fails on Branch

**Solutions**:
1. Check build logs in Netlify Dashboard
2. Verify build command works locally: `npm run build` (or your build command)
3. Check for environment variables needed
4. Verify `netlify.toml` configuration

### Issue: Preview URL Not Working

**Solutions**:
1. Wait a few minutes for DNS propagation
2. Check if deploy completed successfully (green checkmark)
3. Try clearing browser cache
4. Check browser console for errors

### Issue: Can't See Branch in Netlify

**Solutions**:
1. Ensure branch is pushed to remote: `git push -u origin security-features`
2. Refresh Netlify Dashboard
3. Check **Deploys** tab (not just Production)
4. Use **Deploy contexts** to see all branches

---

## 📊 Branch Management Best Practices

### Branch Naming Conventions:

- `feature/security-phase1` - Feature branches
- `security-features` - Descriptive name
- `develop` - Development branch
- `test/security` - Testing branch

### Keep Main Branch Stable:

```bash
# Always test on branch first
git checkout -b security-features
# ... make changes and test ...

# Only merge to main when stable
git checkout main
git merge security-features
```

### Clean Up Old Branches:

```bash
# Delete local branch (after merging)
git branch -d security-features

# Delete remote branch
git push origin --delete security-features
```

---

## 🎯 Quick Reference Commands

```bash
# Create and switch to new branch
git checkout -b security-features

# Commit changes
git add .
git commit -m "feat: Security features"

# Push branch to remote
git push -u origin security-features

# Switch back to main
git checkout main

# Merge branch to main
git merge security-features

# Push main (triggers production deploy)
git push origin main

# Delete branch (after merging)
git branch -d security-features
git push origin --delete security-features
```

---

## ✅ Checklist

Before testing on Netlify:

- [ ] All changes committed to branch
- [ ] Branch pushed to remote repository
- [ ] Netlify connected to your Git repository
- [ ] Deploy previews enabled in Netlify
- [ ] Build settings configured correctly
- [ ] Environment variables set (if needed)
- [ ] Firestore rules deployed (already done ✅)

After deployment:

- [ ] Preview URL accessible
- [ ] Site loads correctly
- [ ] Security features work
- [ ] No console errors
- [ ] Ready for testing

---

## 🎉 Summary

**For your use case (testing security features):**

1. **Create branch**: `git checkout -b security-features`
2. **Push branch**: `git push -u origin security-features`
3. **Netlify automatically creates preview deploy** (no extra setup needed!)
4. **Get preview URL** from Netlify Dashboard
5. **Test on preview URL**
6. **Merge to main** when ready: `git checkout main && git merge security-features`

**You DON'T need to create a separate Netlify site** - deploy previews are free and automatic! 🎉

---

**Last Updated**: [Current Date]  
**Status**: Ready to Use

