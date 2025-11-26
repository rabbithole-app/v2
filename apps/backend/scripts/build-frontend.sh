#!/bin/bash
set -e

# Navigate to workspace root
cd /workspace
echo "🔨 Building frontend..."

# Check workspace is writable
if [ ! -w "/workspace" ]; then
  echo "❌ /workspace is not writable"
  exit 1
fi

# Build 403 error page styles (dependency)
cd apps/rabbithole
npx tailwindcss -i ./src/styles.403.css -o ../../tmp/styles.403.css --minify 2>/dev/null || echo "⚠️ styles.403.css not found (skipping)"

# Use rspack directly for fast build
echo "⚡ Building with rspack..."
export NODE_ENV=production
npx rspack build --node-env=production

# Return to workspace root
cd /workspace

# Verify build output
if [ ! -d "dist/apps/rabbithole/browser" ]; then
  echo "❌ Build failed: dist/apps/rabbithole/browser not found"
  exit 1
fi

if [ ! -f "dist/apps/rabbithole/browser/index.html" ]; then
  echo "❌ Build failed: index.html not found"
  exit 1
fi

echo "✅ Build completed successfully"

# Copy files to apps/backend/dist for dfx
cd /app
DEST_PATH="dist"
BUILD_PATH="/workspace/dist/apps/rabbithole/browser"

# Remove existing directory
rm -rf "$DEST_PATH"

# Copy files
echo "📦 Copying files to apps/backend/dist..."
cp -r "$BUILD_PATH" "$DEST_PATH"

echo "✅ Files ready for dfx"
exit 0
