import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface ParsedRelease {
  version: string;
  date: string;
  added: string[];
  changed: string[];
  deprecated: string[];
  removed: string[];
  fixed: string[];
  security: string[];
}

export class WhatsNewService {
  private static readonly STORAGE_KEY = 'devTimeTracker.lastShownVersion';
  private context: vscode.ExtensionContext;
  private panel?: vscode.WebviewPanel;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Check if we should show the "What's New" notification
   */
  public async checkAndShowWhatsNew(): Promise<void> {
    const currentVersion = this.getCurrentVersion();
    const lastShownVersion = this.getLastShownVersion();

    if (this.isNewerVersion(currentVersion, lastShownVersion)) {
      await this.showWhatsNew();
      await this.setLastShownVersion(currentVersion);
    }
  }

  /**
   * Show the "What's New" panel
   */
  public async showWhatsNew(): Promise<void> {
    const currentVersion = this.getCurrentVersion();
    const releaseData = this.parseChangelog(currentVersion);

    this.panel = vscode.window.createWebviewPanel(
      'devTimeTrackerWhatsNew',
      `What's New in Dev Time Tracker ${currentVersion}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    this.panel.webview.html = this.getWhatsNewHtml(currentVersion, releaseData);

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      async message => {
        switch (message.command) {
          case 'openDashboard':
            vscode.commands.executeCommand('devtimetracker.openDashboard');
            break;
          case 'openSettings':
            vscode.commands.executeCommand('devtimetracker.openSettings');
            break;
          case 'writeOpenVSXReview':
            vscode.env.openExternal(vscode.Uri.parse('https://open-vsx.org/extension/WilliamAsaba/dev-time-tracker'));
            break;
          case 'writeMarketplaceReview':
            vscode.env.openExternal(vscode.Uri.parse('https://marketplace.visualstudio.com/items?itemName=WilliamAsaba.dev-time-tracker&ssr=false#review-details'));
            break;
          case 'close':
            this.panel?.dispose();
            break;
        }
      }
    );
  }

  private getCurrentVersion(): string {
    try {
      const extension = vscode.extensions.getExtension('WilliamAsaba.dev-time-tracker');
      return extension?.packageJSON?.version || '2.1.2';
    } catch (error) {
      return '2.1.2';
    }
  }

  private getLastShownVersion(): string {
    return this.context.globalState.get(WhatsNewService.STORAGE_KEY, '0.0.0');
  }

  private async setLastShownVersion(version: string): Promise<void> {
    await this.context.globalState.update(WhatsNewService.STORAGE_KEY, version);
  }

  private isNewerVersion(current: string, last: string): boolean {
    const currentParts = current.split('.').map(Number);
    const lastParts = last.split('.').map(Number);

    for (let i = 0; i < Math.max(currentParts.length, lastParts.length); i++) {
      const currentPart = currentParts[i] || 0;
      const lastPart = lastParts[i] || 0;

      if (currentPart > lastPart) {
        return true;
      } else if (currentPart < lastPart) {
        return false;
      }
    }
    return false;
  }

  private parseChangelog(version: string): ParsedRelease | null {
    try {
      // Try multiple possible paths for the changelog
      // Dynamically get all workspace roots for dev environments
      const workspaceFolders = vscode.workspace.workspaceFolders || [];
      console.log('Workspace folders:', workspaceFolders.map(f => f.uri.fsPath));
      const workspaceChangelogs = workspaceFolders
        .map(folder => path.join(folder.uri.fsPath, 'CHANGELOG.md'));

      const possiblePaths = [
        path.join(this.context.extensionPath, 'CHANGELOG.md'),
        path.join(__dirname, '..', '..', 'CHANGELOG.md'),
        path.join(process.cwd(), 'CHANGELOG.md'),
        ...workspaceChangelogs
      ];

      let changelogPath = '';
      let content = '';

      for (const testPath of possiblePaths) {
        console.log('Testing changelog path:', testPath);
        if (fs.existsSync(testPath)) {
          changelogPath = testPath;
          content = fs.readFileSync(testPath, 'utf8');
          console.log('Found changelog at:', changelogPath, 'Length:', content.length);
          break;
        }
      }

      if (!content) {
        console.log('No changelog found in any of the tested paths');
        return null;
      }

      console.log('Looking for version:', version);

      const result = this.extractVersionData(content, version);
      console.log('Parsed release data:', result);
      return result;
    } catch (error) {
      console.error('Error parsing changelog:', error);
      return null;
    }
  }

  private extractVersionData(content: string, version: string): ParsedRelease | null {
    const lines = content.split('\n');
    const versionRegex = new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\]`);
    console.log('Version regex:', versionRegex);

    let startIndex = -1;
    let endIndex = -1;

    // Find version section
    for (let i = 0; i < lines.length; i++) {
      if (versionRegex.test(lines[i])) {
        console.log('Found version at line:', i, lines[i]);
        startIndex = i;
        break;
      }
    }

    if (startIndex === -1) {
      console.log('Version not found in changelog');
      // Let's see what versions are available
      console.log('Available versions:');
      for (let i = 0; i < Math.min(lines.length, 20); i++) {
        if (lines[i].startsWith('## [')) {
          console.log(lines[i]);
        }
      }
      return null;
    }

    // Find end of this version section (next version or end of file)
    for (let i = startIndex + 1; i < lines.length; i++) {
      if (lines[i].match(/^## \[/)) {
        endIndex = i;
        break;
      }
    }

    if (endIndex === -1) endIndex = lines.length;

    const versionLines = lines.slice(startIndex, endIndex);
    const dateMatch = versionLines[0].match(/- (\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : 'Recent';

    const release: ParsedRelease = {
      version,
      date,
      added: [],
      changed: [],
      deprecated: [],
      removed: [],
      fixed: [],
      security: []
    };

    let currentSection: keyof ParsedRelease | null = null;
    let currentItem = '';

    for (let i = 1; i < versionLines.length; i++) {
      const line = versionLines[i].trim();

      if (line.startsWith('### Added')) {
        if (currentItem && currentSection) this.addItemToSection(release, currentSection, currentItem);
        currentSection = 'added';
        currentItem = '';
      }
      else if (line.startsWith('### Changed') || line.startsWith('### Improved')) {
        if (currentItem && currentSection) this.addItemToSection(release, currentSection, currentItem);
        currentSection = 'changed';
        currentItem = '';
      }
      else if (line.startsWith('### Deprecated')) {
        if (currentItem && currentSection) this.addItemToSection(release, currentSection, currentItem);
        currentSection = 'deprecated';
        currentItem = '';
      }
      else if (line.startsWith('### Removed')) {
        if (currentItem && currentSection) this.addItemToSection(release, currentSection, currentItem);
        currentSection = 'removed';
        currentItem = '';
      }
      else if (line.startsWith('### Fixed')) {
        if (currentItem && currentSection) this.addItemToSection(release, currentSection, currentItem);
        currentSection = 'fixed';
        currentItem = '';
      }
      else if (line.startsWith('### Security')) {
        if (currentItem && currentSection) this.addItemToSection(release, currentSection, currentItem);
        currentSection = 'security';
        currentItem = '';
      }
      else if (line.startsWith('### Technical') || line.startsWith('### Backend')) {
        if (currentItem && currentSection) this.addItemToSection(release, currentSection, currentItem);
        currentSection = 'changed'; // Technical and Backend improvements go to changed
        currentItem = '';
      }
      else if (line.startsWith('- **') || line.startsWith('- ')) {
        // Save previous item if exists
        if (currentItem && currentSection) {
          this.addItemToSection(release, currentSection, currentItem);
        }

        // Start new item
        if (line.startsWith('- **')) {
          currentItem = line.replace(/^- \*\*([^*]+)\*\*:\s*/, '$1: ');
        } else {
          currentItem = line.replace(/^- /, '');
        }
      }
      else if (line.startsWith('  - ') && currentItem) {
        // Handle sub-bullet points
        const subItem = line.replace(/^  - /, '');
        currentItem += ` • ${subItem}`;
      }
      else if (line && currentItem && !line.startsWith('###')) {
        // Continue current item description
        currentItem += ` ${line}`;
      }
    }

    // Add the last item
    if (currentItem && currentSection) {
      this.addItemToSection(release, currentSection, currentItem);
    }

    return release;
  }

  private addItemToSection(release: ParsedRelease, section: keyof ParsedRelease, item: string): void {
    if (Array.isArray(release[section]) && item.trim()) {
      (release[section] as string[]).push(item.trim());
    }
  }

  private getWhatsNewHtml(version: string, releaseData: ParsedRelease | null): string {
    const logoUri = vscode.Uri.file(
      path.join(this.context.extensionPath, 'images', 'logo.png')
    );
    const logoPath = this.panel?.webview.asWebviewUri(logoUri).toString() || '';

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>What's New</title>
    <style>
        body {
            font-family: var(--vscode-font-family, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 20px;
            line-height: 1.6;
        }

        .container {
            max-width: 800px;
            margin: 0 auto;
        }

        .header {
            display: flex;
            align-items: center;
            margin-bottom: 20px;
        }

        .logo {
            width: 64px;
            height: 64px;
            margin-right: 20px;
            border-radius: 8px;
        }

        .header-text h1 {
            margin: 0;
            font-size: 28px;
            color: var(--vscode-foreground);
            font-weight: 600;
        }

        .header-text .subtitle {
            margin: 5px 0 0 0;
            color: var(--vscode-descriptionForeground);
            font-size: 16px;
        }

        .description {
            margin: 20px 0 30px 0;
            color: var(--vscode-foreground);
            font-size: 14px;
            line-height: 1.5;
        }

        .version-header {
            display: flex;
            align-items: center;
            margin: 30px 0 20px 0;
        }

        .version-badge {
            background: #00bcd4;
            color: white;
            padding: 8px 16px;
            border-radius: 4px;
            font-weight: 600;
            font-size: 14px;
            margin-right: 15px;
        }

        .version-date {
            color: var(--vscode-descriptionForeground);
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .section {
            margin-bottom: 25px;
        }

        .section-header {
            display: flex;
            align-items: center;
            margin-bottom: 15px;
        }

        .section-badge {
            background: #00bcd4;
            color: white;
            padding: 4px 8px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: 600;
            margin-right: 10px;
            text-transform: uppercase;
        }

        .section-title {
            color: var(--vscode-foreground);
            font-size: 16px;
            font-weight: 600;
            margin: 0;
        }

        .items-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }

        .items-list li {
            margin-bottom: 8px;
            padding: 12px 16px;
            background: var(--vscode-list-hoverBackground);
            border-radius: 6px;
            border-left: 3px solid #00bcd4;
            font-size: 14px;
            transition: all 0.2s ease;
            color: var(--vscode-foreground);
        }

        .items-list li:hover {
            background: #00bcd4;
            color: white;
            transform: translateX(4px);
        }        .no-changes {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            text-align: center;
            padding: 40px 20px;
        }

        .actions {
            display: flex;
            gap: 12px;
            justify-content: center;
            margin-top: 40px;
            padding-top: 30px;
            border-top: 1px solid var(--vscode-widget-border);
        }

        .button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 12px 24px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: background-color 0.2s;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }

        .button:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .button.secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .button.secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        .support-section {
            margin-top: 40px;
            padding: 20px;
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 8px;
            text-align: center;
        }

        .support-section h3 {
            margin: 0 0 10px 0;
            color: var(--vscode-foreground);
            font-size: 18px;
        }

        .support-section p {
            margin: 0 0 15px 0;
            color: var(--vscode-descriptionForeground);
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <img src="${logoPath}" alt="Dev Time Tracker" class="logo" />
            <div class="header-text">
                <h1>Dev Time Tracker</h1>
                <div class="subtitle">Transform your coding sessions into actionable insights</div>
            </div>
        </div>

        <div class="description">
            <strong>Dev Time Tracker</strong> is a comprehensive productivity companion for developers that automatically tracks your coding time, monitors your health, and provides powerful analytics through a beautiful web dashboard. Stay focused, maintain healthy work habits, and gain insights into your development patterns with ease.
        </div>

        <div class="version-header">
            <div class="version-badge">${version}</div>
            <div class="version-date">${releaseData?.date || 'Recent'}</div>
        </div>

        ${releaseData ? this.renderReleaseData(releaseData) : `
        <div class="section">
            <div class="section-header">
                <div class="section-badge">NEW</div>
                <h3 class="section-title">Latest Updates</h3>
            </div>
           <div class="no-changes">
           🎉 Thank you for keeping Dev Time Tracker up to date! This update includes general improvements and bug fixes.
           </div>
        </div>
        `}

        <div class="support-section">
            <h3>Show Your Support ❤️</h3>
            <p>If you find <strong>Dev Time Tracker</strong> useful, please consider supporting the project by leaving a review:</p>
            <div style="display: flex; gap: 10px; justify-content: center;">
                <button class="button secondary" onclick="writeOpenVSXReview()">✍️ Write a Review on Open VSX</button>
                <button class="button secondary" onclick="writeMarketplaceReview()">✍️ Write a Review on Marketplace</button>
            </div>
        </div>

        <div class="actions">
            <button class="button" onclick="openDashboard()">View Dashboard</button>
            <button class="button secondary" onclick="openSettings()">Settings</button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function openDashboard() {
            vscode.postMessage({ command: 'openDashboard' });
        }

        function openSettings() {
            vscode.postMessage({ command: 'openSettings' });
        }

        function close() {
            vscode.postMessage({ command: 'close' });
        }

        function writeOpenVSXReview() {
            vscode.postMessage({ command: 'writeOpenVSXReview' });
        }

        function writeMarketplaceReview() {
            vscode.postMessage({ command: 'writeMarketplaceReview' });
        }
    </script>
</body>
</html>`;
  }

  private renderReleaseData(release: ParsedRelease): string {
    const sections = [
      { key: 'fixed', title: 'Bug Fixes', badge: 'FIXED', icon: '🔧' },
      { key: 'changed', title: 'Improvements', badge: 'IMPROVED', icon: '🚀' },
      { key: 'added', title: 'New Features', badge: 'NEW', icon: '✨' },
      { key: 'removed', title: 'Removed', badge: 'REMOVED', icon: '🗑️' },
      { key: 'security', title: 'Security', badge: 'SECURITY', icon: '🔒' }
    ];

    let html = '';

    for (const section of sections) {
      const items = release[section.key as keyof ParsedRelease] as string[];
      if (items && items.length > 0) {
        html += `
        <div class="section">
            <div class="section-header">
                <div class="section-badge">${section.badge}</div>
                <h3 class="section-title">${section.icon} ${section.title}</h3>
            </div>
            <ul class="items-list">
                ${items.map(item => `<li>${item}</li>`).join('')}
            </ul>
        </div>`;
      }
    }

    return html || `
    <div class="no-changes">
        <p>🎉 Thank you for keeping Dev Time Tracker up to date!</p>
        <p>This update includes general improvements and bug fixes.</p>
    </div>`;
  }
}
