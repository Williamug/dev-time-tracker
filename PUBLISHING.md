# Publishing Guide

This guide explains how to publish the Dev Time Tracker extension to both VS Code Marketplace and Open VSX Registry.

## Prerequisites

### 1. VS Code Marketplace (Microsoft)

1. Create a Microsoft/Azure account if you don't have one
2. Go to [Azure DevOps](https://dev.azure.com/)
3. Create a Personal Access Token (PAT):
   - Click on User Settings (top right) → Personal Access Tokens
   - Create new token with these settings:
     - **Organization**: All accessible organizations
     - **Scopes**: Select "Marketplace" → "Manage"
   - Copy the token (you won't see it again!)

### 2. Open VSX Registry (Eclipse Foundation)

1. Go to [Open VSX Registry](https://open-vsx.org/)
2. Sign in with GitHub
3. Generate an access token:
   - Click on your profile → Access Tokens
   - Create new token
   - Copy the token

## Setup Secrets

### For GitHub Actions (Automated Publishing)

Add these secrets to your GitHub repository:
1. Go to your repository → Settings → Secrets and variables → Actions
2. Add these secrets:
   - `VSCE_PAT`: Your VS Code Marketplace Personal Access Token
   - `OVSX_PAT`: Your Open VSX Registry Access Token

### For Local Publishing

Store your tokens securely:

```bash
# VS Code Marketplace
vsce login <publisher-name>
# Enter your PAT when prompted

# Open VSX Registry
npx ovsx publish -p <your-token>
```

Or set environment variables:

```bash
export VSCE_PAT="your-vscode-marketplace-token"
export OVSX_PAT="your-openvsx-token"
```

## Publishing Methods

### Method 1: Automated (via GitHub Actions)

The extension automatically publishes when you create a GitHub release:

1. **Update version in `package.json`**:
   ```bash
   npm version patch  # or minor, or major
   ```

2. **Commit and push**:
   ```bash
   git add .
   git commit -m "Release v2.0.1"
   git push
   ```

3. **Create a GitHub release**:
   - Go to your repository → Releases → Draft a new release
   - Create a new tag (e.g., `v2.0.1`)
   - Generate release notes
   - Publish release

4. **Monitor the workflow**:
   - Go to Actions tab to see the publishing progress
   - The extension will be published to both marketplaces automatically

### Method 2: Manual Publishing

#### Install required tools:

```bash
cd dev-time-tracker
npm install
```

#### Publish to both registries:

```bash
# Publish to both VS Code Marketplace and Open VSX
npm run publish:all
```

#### Or publish individually:

```bash
# VS Code Marketplace only
npm run publish:vsce

# Open VSX Registry only
npm run publish:ovsx
```

#### Just create the package (without publishing):

```bash
npm run package
```

This creates a `.vsix` file you can manually upload to marketplaces.

## Verification

### VS Code Marketplace
- URL: https://marketplace.visualstudio.com/items?itemName=WilliamAsaba.dev-time-tracker
- Usually takes 5-10 minutes to appear

### Open VSX Registry
- URL: https://open-vsx.org/extension/WilliamAsaba/dev-time-tracker
- Usually appears within minutes

## Supported Platforms

### VS Code Marketplace (Microsoft)
- ✅ Visual Studio Code
- ✅ Visual Studio Code Insiders
- ✅ GitHub Codespaces

### Open VSX Registry (Eclipse)
- ✅ VSCodium
- ✅ Eclipse Theia
- ✅ Gitpod
- ✅ Code-Server
- ✅ Eclipse Che

## Troubleshooting

### "Publisher not found" error
- Make sure you've created a publisher account
- Verify the publisher name in `package.json` matches your account

### "Invalid Personal Access Token"
- Regenerate the token with correct permissions
- Update the token in GitHub Secrets or environment variables

### "Extension already published"
- Update the version number in `package.json`
- Use semantic versioning: `major.minor.patch`

### Open VSX specific: "Namespace not found"
- You need to request a namespace on Open VSX
- Go to https://github.com/eclipse/openvsx/wiki/Namespace-Access
- Request access to your publisher namespace

## Version Management

Follow semantic versioning:

```bash
# Bug fixes and small changes
npm version patch  # 2.0.0 → 2.0.1

# New features (backward compatible)
npm version minor  # 2.0.0 → 2.1.0

# Breaking changes
npm version major  # 2.0.0 → 3.0.0
```

## Best Practices

1. **Test before publishing**: Always test the extension locally
2. **Update changelog**: Document changes in CHANGELOG.md
3. **Version consistency**: Keep version numbers in sync
4. **Release notes**: Write clear release notes for each version
5. **Screenshots**: Keep marketplace screenshots up to date
6. **README**: Ensure README.md is comprehensive and current

## Links

- [VS Code Publishing Guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Open VSX Publishing Guide](https://github.com/eclipse/openvsx/wiki/Publishing-Extensions)
- [vsce CLI Documentation](https://github.com/microsoft/vscode-vsce)
- [ovsx CLI Documentation](https://github.com/eclipse/openvsx/wiki/Publishing-Extensions#using-the-cli)
