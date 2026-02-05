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
  technical: string[];
}

interface Feature {
  name: string;
  description: string;
  enabled: boolean;
  isPremium: boolean;
}

export class WhatsNewService {
  private static readonly STORAGE_KEY = 'devTimeTracker.lastShownVersion';
  private static readonly SHOW_ON_UPDATE_KEY = 'devTimeTracker.showWhatsNewOnUpdate';

  // Hardcoded release data - update this with each release
  private static readonly RELEASES: ParsedRelease[] = [
    {
      version: '2.1.8',
      date: '2026-02-03',
      added: [
        'Full changelog display in News tab - all versions shown inline',
        'Auto-show What\'s New on updates (enabled by default, user can disable)',
        'Cyan color theme throughout the interface'
      ],
      changed: [
        'Removed toggle switches from Overview tab for cleaner interface',
        'Updated primary color from blue to cyan (#06b6d4)',
        'Improved What\'s New page layout and styling'
      ],
      fixed: [],
      deprecated: [],
      removed: [
        'Feature toggle switches from Overview page',
        '"View Full Changelog" button (changelog now inline)'
      ],
      security: [],
      technical: []
    },
    {
      version: '2.1.7',
      date: '2026-01-20',
      added: [
        'Premium feature badges in What\'s New interface',
        'Tabbed navigation for Overview, News, and License sections'
      ],
      changed: [
        'Enhanced What\'s New page with better categorization',
        'Improved visual design with modern styling'
      ],
      fixed: [
        'Extension activation timing issues',
        'Command registration reliability'
      ],
      deprecated: [],
      removed: [],
      security: [],
      technical: []
    },
    {
      version: '2.1.6',
      date: '2025-12-20',
      added: [
        'Health reminder system with customizable intervals',
        'Break time suggestions based on coding duration'
      ],
      changed: [
        'Improved dashboard analytics performance',
        'Enhanced session tracking accuracy'
      ],
      fixed: [
        'Idle detection edge cases',
        'Time tracking precision issues'
      ],
      deprecated: [],
      removed: [],
      security: [],
      technical: []
    }
  ];

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
    const showOnUpdate = this.context.globalState.get(WhatsNewService.SHOW_ON_UPDATE_KEY, true);

    if (this.isNewerVersion(currentVersion, lastShownVersion)) {
      if (showOnUpdate) {
        await this.showWhatsNew();
      }
      await this.setLastShownVersion(currentVersion);
    }
  }

  /**
   * Show the "What's New" panel
   */
  public async showWhatsNew(): Promise<void> {
    const currentVersion = this.getCurrentVersion();
    const releaseData = this.getReleaseData(currentVersion);

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
          case 'toggleShowOnUpdate':
            await this.context.globalState.update(WhatsNewService.SHOW_ON_UPDATE_KEY, message.value);
            break;
          case 'tryPremium':
            vscode.env.openExternal(vscode.Uri.parse(''));
            break;
          case 'openChangelog':
            const changelogPath = vscode.Uri.file(this.context.extensionPath + '/CHANGELOG.md');
            vscode.commands.executeCommand('markdown.showPreview', changelogPath);
            break;
          case 'openDocs':
            vscode.env.openExternal(vscode.Uri.parse(''));
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

  private getReleaseData(version: string): ParsedRelease | null {
    return WhatsNewService.RELEASES.find(r => r.version === version) || null;
  }

  private getAllReleases(): ParsedRelease[] {
    return WhatsNewService.RELEASES;
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

  private parseAllReleases(): ParsedRelease[] {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders || [];
      const workspaceChangelogs = workspaceFolders
        .map(folder => path.join(folder.uri.fsPath, 'CHANGELOG.md'));

      const possiblePaths = [
        path.join(this.context.extensionPath, 'CHANGELOG.md'),
        path.join(__dirname, '..', '..', 'CHANGELOG.md'),
        path.join(process.cwd(), 'CHANGELOG.md'),
        ...workspaceChangelogs
      ];

      let content = '';

      for (const testPath of possiblePaths) {
        if (fs.existsSync(testPath)) {
          content = fs.readFileSync(testPath, 'utf8');
          break;
        }
      }

      if (!content) {
        return [];
      }

      const releases: ParsedRelease[] = [];
      const lines = content.split('\n');

      // Find all version headers
      for (let i = 0; i < lines.length; i++) {
        const versionMatch = lines[i].match(/^## \[([^\]]+)\]/);
        if (versionMatch) {
          const version = versionMatch[1];
          const release = this.extractVersionData(content, version);
          if (release) {
            releases.push(release);
          }
        }
      }

      return releases;
    } catch (error) {
      console.error('Error parsing all releases:', error);
      return [];
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
      security: [],
      technical: []
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
    const showOnUpdate = this.context.globalState.get(WhatsNewService.SHOW_ON_UPDATE_KEY, true);

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>What's new in Dev Time Tracker v${version}</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 0;
            line-height: 1.6;
        }

        .header {
            background: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            padding: 30px 40px 0 40px;
        }

        .header-title {
            font-size: 28px;
            font-weight: 400;
            color: var(--vscode-foreground);
            margin-bottom: 20px;
        }

        .tabs {
            display: flex;
            gap: 0;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .tab {
            padding: 12px 20px;
            background: transparent;
            border: none;
            color: var(--vscode-foreground);
            cursor: pointer;
            font-size: 14px;
            position: relative;
            transition: all 0.2s ease;
            opacity: 0.7;
        }

        .tab:hover {
            opacity: 1;
            background: var(--vscode-list-hoverBackground);
        }

        .tab.active {
            opacity: 1;
        }

        .tab.active::after {
            content: '';
            position: absolute;
            bottom: -1px;
            left: 0;
            right: 0;
            height: 2px;
            background: #06b6d4;
        }

        .tab-count {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 11px;
            margin-left: 6px;
            font-weight: 600;
        }

        .content {
            padding: 40px;
            max-width: 900px;
        }

        .tab-content {
            display: none;
        }

        .tab-content.active {
            display: block;
            animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* Overview Tab Styles */
        .feature-grid {
            display: grid;
            gap: 20px;
            margin-top: 30px;
        }

        .feature-card {
            background: var(--vscode-list-inactiveSelectionBackground);
            border-radius: 6px;
            padding: 20px;
            border-left: 3px solid #06b6d4;
            transition: all 0.2s ease;
        }

        .feature-card:hover {
            background: var(--vscode-list-hoverBackground);
            transform: translateX(4px);
        }

        .feature-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 10px;
        }

        .feature-title {
            font-size: 16px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }

        .feature-description {
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
            line-height: 1.5;
        }

        .premium-badge {
            background: #06b6d4;
            color: white;
            padding: 3px 10px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        /* News Tab Styles */
        .version-section {
            margin-bottom: 40px;
        }

        .version-header {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-bottom: 20px;
        }

        .version-badge {
            background: #06b6d4;
            color: white;
            padding: 6px 14px;
            border-radius: 4px;
            font-weight: 600;
            font-size: 13px;
        }

        .version-date {
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
        }

        .change-category {
            margin-bottom: 25px;
        }

        .category-title {
            font-size: 15px;
            font-weight: 600;
            color: var(--vscode-foreground);
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .category-badge {
            background: #06b6d4;
            color: white;
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 10px;
            text-transform: uppercase;
            font-weight: 600;
        }

        .change-list {
            list-style: none;
            padding: 0;
        }

        .change-list li {
            padding: 10px 14px;
            margin-bottom: 6px;
            background: var(--vscode-list-inactiveSelectionBackground);
            border-radius: 4px;
            border-left: 2px solid #06b6d4;
            font-size: 13px;
            line-height: 1.5;
        }

        .change-list li::before {
            content: '•';
            color: #06b6d4;
            font-weight: bold;
            display: inline-block;
            width: 1em;
            margin-right: 8px;
        }

        /* License Tab Styles */
        .license-section {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
            margin-top: 30px;
        }

        .license-column h3 {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 20px;
            color: var(--vscode-foreground);
        }

        .feature-list {
            list-style: none;
            padding: 0;
        }

        .feature-list li {
            padding: 10px 0;
            border-bottom: 1px solid var(--vscode-panel-border);
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .feature-list li::before {
            content: '✓';
            color: #4caf50;
            font-weight: bold;
            font-size: 16px;
        }

        .feature-list li.premium::before {
            content: '⭐';
        }

        .cta-button {
            background: #06b6d4;
            color: white;
            border: none;
            padding: 14px 28px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            margin-top: 20px;
            transition: all 0.2s ease;
        }

        .cta-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }

        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid var(--vscode-panel-border);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .show-on-update {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 13px;
            color: var(--vscode-foreground);
        }

        .checkbox {
            width: 18px;
            height: 18px;
            cursor: pointer;
        }

        .footer-links {
            display: flex;
            gap: 15px;
        }

        .footer-link {
            color: #06b6d4;
            text-decoration: none;
            font-size: 13px;
        }

        .footer-link:hover {
            text-decoration: underline;
        }

        .intro-text {
            color: var(--vscode-descriptionForeground);
            font-size: 14px;
            line-height: 1.6;
            margin-bottom: 10px;
        }

        .highlight {
            color: #06b6d4;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1 class="header-title">What's new in Dev Time Tracker v${version}</h1>
        <div class="tabs">
            <button class="tab active" onclick="switchTab('overview')">OVERVIEW</button>
            <button class="tab" onclick="switchTab('news')">
                NEWS
                <span class="tab-count">1</span>
            </button>
            <button class="tab" onclick="switchTab('license')">
                LICENSE
                <span class="tab-count">1</span>
            </button>
        </div>
    </div>

    <div class="content">
        <!-- OVERVIEW TAB -->
        <div id="overview-tab" class="tab-content active">
            <p class="intro-text">
                <strong>Dev Time Tracker</strong> is a comprehensive productivity companion for developers that automatically tracks your coding time, monitors your health, and provides powerful analytics through a beautiful web dashboard.
            </p>
            <p class="intro-text">
                Stay focused, maintain healthy work habits, and gain insights into your development patterns with ease.
            </p>

            <div class="feature-grid">
                ${this.renderFeatureCards()}
            </div>
        </div>

        <!-- NEWS TAB -->
        <div id="news-tab" class="tab-content">
            ${this.renderFullChangelog()}
        </div>

        <!-- LICENSE TAB -->
        <div id="license-tab" class="tab-content">
            <p class="intro-text">Premium features not active.</p>

            <div class="license-section">
                <div class="license-column">
                    <h3>FREE</h3>
                    <ul class="feature-list">
                        <li>Automatic Time Tracking</li>
                        <li>Real-time Activity Monitor</li>
                        <li>File & Language Statistics</li>
                        <li>Session Timer</li>
                        <li>Basic Health Reminders</li>
                        <li>Pomodoro Timer</li>
                        <li>Today's Summary</li>
                        <li>Code Metrics</li>
                        <li>Git Integration</li>
                    </ul>
                </div>

                <div class="license-column">
                    <h3>PREMIUM <button class="cta-button" onclick="tryPremium()">BUY ⚡</button></h3>
                    <ul class="feature-list">
                        <li class="premium">Advanced Analytics Dashboard</li>
                        <li class="premium">Team Collaboration</li>
                        <li class="premium">Custom Reports</li>
                        <li class="premium">Project Time Tracking</li>
                        <li class="premium">Advanced Health Metrics</li>
                        <li class="premium">Custom Reminders</li>
                        <li class="premium">Productivity Insights</li>
                        <li class="premium">Export Data</li>
                        <li class="premium">Priority Support</li>
                    </ul>
                </div>
            </div>

            <div class="footer" style="margin-top: 30px;">
                <div class="show-on-update">
                    <input type="checkbox" id="show-updates" class="checkbox" ${showOnUpdate ? 'checked' : ''} onchange="toggleShowOnUpdate(this.checked)">
                    <label for="show-updates">Show What's New after Update.</label>
                </div>
            </div>
        </div>

        <!-- Common Footer -->
        <div class="footer">
            <div class="footer-links">
                <a href="#" class="footer-link" onclick="openDashboard()">View Dashboard</a>
                <a href="#" class="footer-link" onclick="openSettings()">Settings</a>
                <a href="#" class="footer-link" onclick="openSupport()">Get Support</a>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function switchTab(tabName) {
            // Hide all tabs
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.querySelectorAll('.tab').forEach(tab => {
                tab.classList.remove('active');
            });

            // Show selected tab
            document.getElementById(tabName + '-tab').classList.add('active');
            event.target.classList.add('active');
        }

        function openDashboard() {
            vscode.postMessage({ command: 'openDashboard' });
        }

        function openSettings() {
            vscode.postMessage({ command: 'openSettings' });
        }

        function openChangelog() {
            vscode.postMessage({ command: 'openChangelog' });
        }

        function openDocs() {
            vscode.postMessage({ command: 'openDocs' });
        }

        function openSupport() {
            vscode.postMessage({ command: 'openSupport' });
        }

        function tryPremium() {
            vscode.postMessage({ command: 'tryPremium' });
        }

        function toggleShowOnUpdate(checked) {
            vscode.postMessage({ command: 'toggleShowOnUpdate', value: checked });
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

  private renderFeatureCards(): string {
    const features: Feature[] = [
      {
        name: 'Automatic Time Tracking',
        description: 'Track your coding time automatically across all projects',
        enabled: true,
        isPremium: false
      },
      {
        name: 'Activity Monitoring',
        description: 'Monitor keystrokes, mouse clicks, and code changes',
        enabled: true,
        isPremium: false
      },
      {
        name: 'Session Management',
        description: 'Manage coding sessions with idle detection',
        enabled: true,
        isPremium: false
      },
      {
        name: 'Dashboard Analytics',
        description: 'View detailed analytics and insights on your dashboard',
        enabled: true,
        isPremium: false
      },
      {
        name: 'Health Reminders',
        description: 'Get reminders to take breaks and maintain good posture',
        enabled: false,
        isPremium: true
      },
      {
        name: 'Team Collaboration',
        description: 'Share time tracking data with your team',
        enabled: false,
        isPremium: true
      },
      {
        name: 'Advanced Reports',
        description: 'Generate detailed reports and export data',
        enabled: false,
        isPremium: true
      },
      {
        name: 'AI Insights',
        description: 'Get AI-powered insights on your coding patterns',
        enabled: false,
        isPremium: true
      }
    ];

    return features.map(feature => `
      <div class="feature-card ${feature.isPremium ? 'premium' : ''}">
        <div class="feature-header">
          <h3 class="feature-title">${feature.name}</h3>
          ${feature.isPremium ? '<span class="premium-badge">PREMIUM</span>' : ''}
        </div>
        <p class="feature-description">${feature.description}</p>
      </div>
    `).join('');
  }

  private renderNewsTab(release: ParsedRelease | null): string {
    if (!release) {
      return this.renderDefaultNews();
    }

    const categories = [
      { key: 'added', title: 'New Features', badge: 'NEW', color: '#4caf50' },
      { key: 'changed', title: 'Improvements', badge: 'IMPROVED', color: '#2196f3' },
      { key: 'fixed', title: 'Bug Fixes', badge: 'FIXED', color: '#ff9800' },
      { key: 'security', title: 'Security Updates', badge: 'SECURITY', color: '#f44336' },
      { key: 'removed', title: 'Removed', badge: 'REMOVED', color: '#9e9e9e' }
    ];

    let newsHtml = '';

    for (const category of categories) {
      const items = release[category.key as keyof ParsedRelease] as string[];
      if (items && items.length > 0) {
        newsHtml += this.renderChangeCategory(category.title, category.badge, category.color, items);
      }
    }

    return newsHtml || this.renderDefaultNews();
  }

  private renderFullChangelog(): string {
    const releases = this.getAllReleases();

    if (releases.length === 0) {
      return this.renderDefaultNews();
    }    const categories = [
      { key: 'added', title: 'New Features', badge: 'NEW', color: '#06b6d4' },
      { key: 'changed', title: 'Improvements', badge: 'IMPROVED', color: '#06b6d4' },
      { key: 'fixed', title: 'Bug Fixes', badge: 'FIXED', color: '#f59e0b' },
      { key: 'security', title: 'Security Updates', badge: 'SECURITY', color: '#ef4444' },
      { key: 'removed', title: 'Removed', badge: 'REMOVED', color: '#9ca3af' }
    ];

    let html = '';

    for (const release of releases) {
      let releaseHtml = '';

      for (const category of categories) {
        const items = release[category.key as keyof ParsedRelease] as string[];
        if (items && items.length > 0) {
          releaseHtml += this.renderChangeCategory(category.title, category.badge, category.color, items);
        }
      }

      if (releaseHtml) {
        html += '<div class="version-section"><div class="version-header"><span class="version-badge">v' + release.version + '</span><span class="version-date">' + release.date + '</span></div>' + releaseHtml + '</div>';
      }
    }

    return html || this.renderDefaultNews();
  }  private renderDefaultNews(): string {
    return '<div class="default-news"><div class="news-icon">🎉</div><h3>Thank you for updating!</h3><p>This version includes general improvements and bug fixes to enhance your experience.</p><div class="news-actions"><button class="news-button" onclick="openChangelog()"><span>📝</span> View Full Changelog</button><button class="news-button secondary" onclick="openDocs()"><span>📚</span> Read Documentation</button></div></div>';
  }

  private renderChangeCategory(title: string, badge: string, color: string, items: string[]): string {
    return '<div class="news-category"><div class="category-header"><span class="category-badge" style="background-color: ' + color + ';">' + badge + '</span><h3 class="category-title">' + title + '</h3></div><ul class="category-items">' + items.map((item: string) => '<li>' + item + '</li>').join('') + '</ul></div>';
  }
}
