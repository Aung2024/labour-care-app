#!/bin/bash

# Labour Care App - Sync and Build Script
# This script syncs web assets to Android and builds the APK

set -e  # Exit on error

echo "🔄 Starting sync and build process..."
echo ""

# Step 1: Pull latest changes
echo "📥 Step 1: Pulling latest changes from GitHub..."
git pull origin security-features
echo "✅ Pull complete"
echo ""

# Step 2: Copy web assets to www
echo "📋 Step 2: Copying web assets to www folder..."
rsync -av --exclude='android' --exclude='node_modules' --exclude='.git' --exclude='www' --exclude='sync-and-build.sh' . www/
echo "✅ Copy complete"
echo ""

# Step 3: Sync to Android
echo "🔄 Step 3: Syncing to Android..."
npx cap sync android
echo "✅ Sync complete"
echo ""

# Step 4: Build APK
echo "🔨 Step 4: Building debug APK..."
cd android
./gradlew assembleDebug
cd ..
echo "✅ Build complete"
echo ""

echo "🎉 All done! APK location:"
echo "   android/app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo "To install on connected device:"
echo "   adb install -r android/app/build/outputs/apk/debug/app-debug.apk"

