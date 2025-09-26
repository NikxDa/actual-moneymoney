# Upstream Sync Process

This document describes how to sync with the upstream repository [NikxDa/actual-moneymoney](https://github.com/NikxDa/actual-moneymoney).

## Overview

This fork maintains compatibility with upstream while adding significant enhancements. We sync with upstream quarterly to incorporate bug fixes and improvements.

## Quick Sync

Use the provided script for automated syncing:

```bash
./scripts/sync-upstream.sh
```

## Manual Sync Process

### 1. Fetch Upstream Changes

```bash
git fetch upstream
```

### 2. Review Changes

```bash
# See what's new in upstream
git log --oneline develop..upstream/main

# See detailed changes
git diff develop..upstream/main
```

### 3. Merge Changes

```bash
git checkout develop
git merge upstream/main --no-ff -m "chore: sync with upstream $(date +%Y-%m-%d)"
```

### 4. Resolve Conflicts (if any)

If there are merge conflicts:
1. Resolve conflicts in your editor
2. `git add <resolved-files>`
3. `git commit` (don't use `-m` to keep the merge message)

### 5. Test Changes

```bash
npm test
npm run build
npm run lint:eslint
```

### 6. Push Changes

```bash
git push origin develop
```

## Sync Strategy

### What We Sync
- ✅ Bug fixes
- ✅ Security updates
- ✅ Dependency updates
- ✅ Documentation improvements
- ✅ Performance improvements

### What We Don't Sync
- ❌ Breaking API changes (we maintain our enhanced API)
- ❌ Feature removals (we keep our enhancements)
- ❌ Configuration changes that conflict with our improvements

### Conflict Resolution

When conflicts occur:

1. **Package.json conflicts**: Prefer our enhanced dependencies but update versions
2. **Configuration conflicts**: Keep our enhanced config options
3. **API conflicts**: Maintain our enhanced API surface
4. **Test conflicts**: Keep our comprehensive test suite

## Quarterly Sync Schedule

- **Q1**: January 15th
- **Q2**: April 15th  
- **Q3**: July 15th
- **Q4**: October 15th

## Emergency Syncs

For critical security updates, sync immediately:

```bash
git fetch upstream
git checkout develop
git merge upstream/main --no-ff -m "security: sync critical upstream fixes"
npm test && npm run build
git push origin develop
```

## Contributing Back

If we develop fixes that would benefit upstream:

1. Create a clean branch from upstream/main
2. Cherry-pick or re-implement our fixes
3. Submit PR to upstream
4. Document the contribution in our changelog

## Monitoring Upstream

- Watch the upstream repository for releases
- Monitor upstream issues for relevant bug reports
- Check upstream PRs for improvements we might want to adopt

## Troubleshooting

### Sync Conflicts
If sync creates too many conflicts, consider:
1. Rebasing our changes on a clean upstream branch
2. Cherry-picking specific upstream commits
3. Creating a new integration branch

### Lost Changes
If our changes are lost during sync:
1. Check `git reflog` for lost commits
2. Use `git cherry-pick` to restore specific changes
3. Create a backup branch before major syncs

## Contact

For questions about the sync process, open an issue in this repository.
