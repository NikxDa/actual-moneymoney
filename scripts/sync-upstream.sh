#!/bin/bash
# Script to sync with upstream changes
# Usage: ./scripts/sync-upstream.sh

set -e

echo "🔄 Syncing with upstream repository..."

# Fetch latest changes from upstream
echo "📥 Fetching upstream changes..."
git fetch upstream

# Show what's new in upstream
echo "📊 Upstream changes since last sync:"
git log --oneline develop..upstream/main

# Ask user if they want to merge
echo ""
read -p "Do you want to merge upstream changes into develop? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🔀 Merging upstream changes..."
    git checkout develop
    git merge upstream/main --no-ff -m "chore: sync with upstream $(git rev-parse upstream/main --short)"
    echo "✅ Upstream changes merged successfully!"
    echo "💡 Don't forget to push: git push origin develop"
else
    echo "⏭️ Skipping merge. You can manually merge later with:"
    echo "   git checkout develop"
    echo "   git merge upstream/main"
fi

echo "🎯 Current status:"
git status --short
