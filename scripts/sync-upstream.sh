#!/bin/bash
# Script to sync with upstream changes
# Usage: ./scripts/sync-upstream.sh

set -e

echo "🔄 Syncing with upstream repository..."

# Cleanup function to remove upstream remote if it was added by this script
cleanup() {
    if git remote get-url upstream >/dev/null 2>&1; then
        echo "🧹 Cleaning up temporary upstream remote..."
        git remote remove upstream
    fi
}

# Set up cleanup on script exit
trap cleanup EXIT

# Check if upstream remote exists, if not add it temporarily
if ! git remote get-url upstream >/dev/null 2>&1; then
    echo "📡 Adding temporary upstream remote..."
    git remote add upstream https://github.com/NikxDa/actual-moneymoney.git
    echo "✅ Upstream remote added (will be removed when script exits)"
fi

# Fetch latest changes from upstream
echo "📥 Fetching upstream changes..."
git fetch upstream

# Check if there are any changes to sync
if git merge-base --is-ancestor upstream/main develop; then
    echo "✅ Develop is already up to date with upstream"
    exit 0
fi

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
