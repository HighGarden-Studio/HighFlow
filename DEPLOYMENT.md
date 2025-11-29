# FlowMind Deployment Guide

This guide covers the complete deployment process for FlowMind, including building, code signing, and releasing for all platforms.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Code Signing](#code-signing)
4. [Building](#building)
5. [CI/CD Pipeline](#cicd-pipeline)
6. [Release Process](#release-process)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Tools

- **Node.js**: v20.x or later
- **pnpm**: v9.x or later
- **Git**: Latest version
- **Platform-specific tools**:
  - macOS: Xcode Command Line Tools
  - Windows: Visual Studio Build Tools 2022
  - Linux: build-essential, rpm-build (for RPM packages)

### Accounts & Certificates

- **GitHub account** with repository access
- **Apple Developer Account** (for macOS code signing)
- **Windows Code Signing Certificate** (for Windows builds)
- **Sentry account** (optional, for error tracking)

---

## Environment Setup

### 1. Clone and Install

```bash
git clone https://github.com/flowmind/flowmind-app.git
cd flowmind-app
pnpm install
```

### 2. Environment Variables

Copy the example environment file and configure:

```bash
cp .env.example .env
```

Required variables for deployment:

```env
# Application
NODE_ENV=production
VITE_APP_VERSION=1.0.0

# Error tracking (optional but recommended)
VITE_SENTRY_DSN=https://your-dsn@sentry.io/project

# Feature flags for production
VITE_FEATURE_AI_ASSISTANT=true
VITE_FEATURE_INTEGRATIONS=true
VITE_DEV_TOOLS=false
```

---

## Code Signing

### macOS Code Signing & Notarization

#### 1. Export Certificates

1. Open **Keychain Access**
2. Find your "Developer ID Application" certificate
3. Export as `.p12` file with password

#### 2. Configure Environment

```bash
# Apple ID for notarization
export APPLE_ID="your-apple-id@email.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="XXXXXXXXXX"

# Certificate (base64 encoded)
export CSC_LINK=$(cat certificate.p12 | base64)
export CSC_KEY_PASSWORD="your-certificate-password"
```

#### 3. Generate App-Specific Password

1. Go to [appleid.apple.com](https://appleid.apple.com)
2. Sign in → Security → App-Specific Passwords
3. Generate new password for "FlowMind Notarization"

### Windows Code Signing

#### 1. Obtain Certificate

Purchase a code signing certificate from:
- DigiCert
- Sectigo
- GlobalSign

#### 2. Configure Environment

```bash
# Certificate file path or base64 content
export WIN_CSC_LINK="path/to/certificate.pfx"
export WIN_CSC_KEY_PASSWORD="your-certificate-password"
```

---

## Building

### Development Build

```bash
# Start development server
pnpm dev

# Start Electron in development mode
pnpm dev:electron
```

### Production Build

```bash
# Build Vite app
pnpm build

# Build Electron app for current platform
pnpm electron:build
```

### Platform-Specific Builds

```bash
# macOS (Intel + Apple Silicon)
pnpm electron:build --mac --universal

# Windows (64-bit + 32-bit)
pnpm electron:build --win

# Linux (AppImage, DEB, RPM)
pnpm electron:build --linux
```

### Build Output

Built files are placed in the `dist/` directory:

```
dist/
├── FlowMind-1.0.0-mac-arm64.dmg
├── FlowMind-1.0.0-mac-arm64.zip
├── FlowMind-1.0.0-mac-x64.dmg
├── FlowMind-1.0.0-mac-x64.zip
├── FlowMind-1.0.0-win-x64.exe
├── FlowMind-1.0.0-win-x64.msi
├── FlowMind-1.0.0-linux-x64.AppImage
├── FlowMind-1.0.0-linux-x64.deb
└── FlowMind-1.0.0-linux-x64.rpm
```

---

## CI/CD Pipeline

### GitHub Actions Workflow

The CI/CD pipeline is defined in `.github/workflows/build.yml` and includes:

1. **Lint & Type Check**: Runs on all PRs and pushes
2. **Test**: Runs unit tests with coverage
3. **Build**: Creates platform-specific builds
4. **Release**: Creates GitHub release with artifacts

### Required Secrets

Configure these secrets in GitHub repository settings:

```
# GitHub
GITHUB_TOKEN           # Automatically provided

# Code Coverage
CODECOV_TOKEN          # From codecov.io

# macOS Code Signing
APPLE_CERTIFICATE              # Base64 encoded .p12
APPLE_CERTIFICATE_PASSWORD     # Certificate password
APPLE_KEYCHAIN_PASSWORD        # Temporary keychain password
APPLE_ID                       # Apple ID email
APPLE_APP_SPECIFIC_PASSWORD    # App-specific password
APPLE_TEAM_ID                  # Team ID

# Windows Code Signing
WIN_CERTIFICATE               # Base64 encoded .pfx
WIN_CERTIFICATE_PASSWORD      # Certificate password

# Notifications (optional)
SLACK_WEBHOOK_URL            # Slack notification webhook
```

### Triggering Builds

```bash
# Build on push to main
git push origin main

# Create a release
git tag v1.0.0
git push origin v1.0.0
```

---

## Release Process

### Pre-release Checklist

- [ ] All tests passing
- [ ] TypeScript type check passing
- [ ] Lint rules passing
- [ ] Version number updated in `package.json`
- [ ] CHANGELOG.md updated
- [ ] Feature flags configured for production
- [ ] API keys and credentials secured

### Version Numbering

Follow [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking changes
- **MINOR**: New features (backwards compatible)
- **PATCH**: Bug fixes (backwards compatible)

Pre-release versions:
- `1.0.0-alpha.1`: Alpha release
- `1.0.0-beta.1`: Beta release
- `1.0.0-rc.1`: Release candidate

### Creating a Release

#### 1. Update Version

```bash
# Update package.json version
pnpm version patch  # or minor, major
```

#### 2. Update Changelog

Edit `CHANGELOG.md`:

```markdown
## [1.0.0] - 2024-01-15

### Added
- New feature X
- New feature Y

### Fixed
- Bug fix A
- Bug fix B

### Changed
- Updated dependency Z
```

#### 3. Create Tag and Push

```bash
git add .
git commit -m "chore: release v1.0.0"
git tag v1.0.0
git push origin main --tags
```

#### 4. Monitor Build

1. Go to **Actions** tab in GitHub
2. Monitor the "Build and Release" workflow
3. Verify all jobs complete successfully

#### 5. Verify Release

1. Go to **Releases** in GitHub
2. Download and test installers on each platform
3. Verify auto-update works from previous version

---

## Troubleshooting

### macOS Issues

#### "App is damaged and can't be opened"

```bash
# Remove quarantine attribute
xattr -cr /Applications/FlowMind.app
```

#### Notarization Failed

1. Check Apple Developer account status
2. Verify app-specific password is valid
3. Check entitlements file
4. Review notarization logs:
   ```bash
   xcrun notarytool log <submission-id> --apple-id <email> --team-id <team>
   ```

### Windows Issues

#### "Windows protected your PC"

- Ensure code signing certificate is valid
- Certificate must be EV (Extended Validation) to avoid SmartScreen warning
- Wait 24-48 hours for reputation to build

#### Build Fails with Native Module Error

```bash
# Rebuild native modules
pnpm rebuild
```

### Linux Issues

#### AppImage Won't Launch

```bash
# Make executable
chmod +x FlowMind-1.0.0.AppImage

# Check dependencies
ldd FlowMind-1.0.0.AppImage
```

#### Missing Libraries

```bash
# Ubuntu/Debian
sudo apt-get install libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 libsecret-1-0

# Fedora/RHEL
sudo dnf install gtk3 libnotify nss libXScrnSaver libXtst libsecret
```

### General Issues

#### Build Cache Problems

```bash
# Clear all caches
pnpm store prune
rm -rf node_modules
rm -rf .cache
rm -rf dist
rm -rf dist-electron
pnpm install
```

#### GitHub Actions Timeout

- Increase timeout in workflow file
- Split build jobs by platform
- Use GitHub-hosted larger runners

---

## Security Considerations

### Production Security Checklist

- [ ] All API keys stored securely (not in code)
- [ ] CSP headers enabled
- [ ] Node integration disabled in renderer
- [ ] Context isolation enabled
- [ ] Remote module disabled
- [ ] webSecurity enabled
- [ ] HTTPS enforced for all external requests
- [ ] Input validation on all user inputs
- [ ] Dependencies audited (`pnpm audit`)

### Audit Dependencies

```bash
# Check for vulnerabilities
pnpm audit

# Auto-fix vulnerabilities
pnpm audit --fix
```

---

## Support

For deployment issues:
- Check [GitHub Issues](https://github.com/flowmind/flowmind-app/issues)
- Review [electron-builder documentation](https://www.electron.build/)
- Contact team at support@flowmind.app
