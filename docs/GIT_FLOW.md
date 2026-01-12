# Git Flow & Branching Strategy

This project follows the **Git Flow** branching model.

## Branch Overview

- **`main`**: The production-ready branch. Contains stable, released code.
- **`develop`**: The integration branch for features. This is the default branch for development.
- **`feature/*`**: Feature branches branched off `develop`.
- **`release/*`**: Release branches branched off `develop` for final testing before merging to `main`.
- **`hotfix/*`**: Hotfix branches branched off `main` for critical production fixes.

## Workflow

### 1. Start a New Feature

1.  Checkout `develop` and pull latest changes:
    ```bash
    git checkout develop
    git pull origin develop
    ```
2.  Create a feature branch:
    ```bash
    git checkout -b feature/my-new-feature
    ```

### 2. Finish a Feature

1.  Merge into `develop` via Pull Request (recommended) or locally:
    ```bash
    git checkout develop
    git merge feature/my-new-feature
    ```
2.  Delete the feature branch.

### 3. Release

1.  Create release branch from `develop`:
    ```bash
    git checkout -b release/v1.0.0 develop
    ```
2.  Test and fix bugs on `release/v1.0.0`.
3.  Merge to `main` and tag:
    ```bash
    git checkout main
    git merge release/v1.0.0
    git tag -a v1.0.0 -m "Release v1.0.0"
    ```
4.  Back-merge to `develop`:
    ```bash
    git checkout develop
    git merge release/v1.0.0
    ```

### 4. Hotfix

1.  Create hotfix branch from `main`:
    ```bash
    git checkout -b hotfix/critical-bug main
    ```
2.  Fix and commit.
3.  Merge to `main` and `develop`.
