#!/bin/bash

# Labour Care App - Quick Sync Script
# Use this after making changes to web files (HTML, JS, CSS)

set -e  # Exit on error

echo "🔄 Quick sync: Web → Android"
echo ""

# Copy web assets to www
echo "📋 Copying web assets..."
rsync -av --exclude='android' --exclude='node_modules' --exclude='.git' --exclude='www' --exclude='*.sh' . www/

# Sync to Android
echo "🔄 Syncing to Android..."
npx cap sync android

echo ""
echo "✅ Sync complete! Now rebuild in Android Studio or run:"
echo "   cd android && ./gradlew assembleDebug"

