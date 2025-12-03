"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const sessionManager_1 = require("./sessionManager");
const buffer_1 = require("./buffer");
const eventListener_1 = require("./eventListener");
const statusBarManager_1 = require("./statusBarManager");
const MetricsService_1 = require("./services/MetricsService");
const GitService_1 = require("./services/GitService");
const HealthService_1 = require("./services/HealthService");
const BackendService_1 = require("./services/BackendService");
const CustomReminderService_1 = require("./services/CustomReminderService");
const DiffService_1 = require("./services/DiffService");
const manageCustomReminders_1 = require("./commands/manageCustomReminders");
// Track user activity state
let lastActivityTime = Date.now();
const INACTIVITY_THRESHOLD = 300000; // 5 minutes (production)
let activityCheckInterval = null;
let statusBarManager = null;
let diffService = null;
let eventBuffer = null;
let lastActivityLog = 0; // Throttle activity logs
// Update activity status based on user interaction
function updateActivityStatus() {
    if (!statusBarManager)
        return;
    const now = Date.now();
    const isActive = now - lastActivityTime < INACTIVITY_THRESHOLD;
    console.log(`[Activity] ${isActive ? 'Active' : 'Idle'} (Last activity: ${new Date(lastActivityTime).toLocaleTimeString()}, ${Math.floor((now - lastActivityTime) / 1000)}s ago)`);
    statusBarManager.updateActivityStatus(isActive);
}
// Track user activity
function trackUserActivity(reason) {
    const now = Date.now();
    const oldTime = lastActivityTime;
    lastActivityTime = now;
    // Only log activity every 5 seconds to reduce noise
    if (now - lastActivityLog > 5000) {
        const timeSinceLastActivity = lastActivityTime - oldTime;
        console.log(`[Activity] Activity detected (${reason}) | Time since last: ${timeSinceLastActivity}ms | New lastActivityTime: ${new Date(lastActivityTime).toLocaleTimeString()}`);
        lastActivityLog = now;
    }
    updateActivityStatus();
}
async function activate(ctx) {
    console.log('[Extension] Activating Dev Time Tracker...');
    console.log('[Extension] Extension context:', ctx);
    console.log('[Extension] Extension path:', ctx.extensionPath);
    // Log available commands for debugging
    const availableCommands = await vscode.commands.getCommands(true);
    console.log('[Extension] Available commands:', availableCommands.filter((cmd) => cmd.startsWith('devtimetracker.')));
    const cfg = vscode.workspace.getConfiguration('devtimetracker');
    const apiUrl = cfg.get('apiUrl');
    const apiToken = cfg.get('apiToken');
    console.log('[Extension] Configuration loaded:', { hasApiUrl: !!apiUrl, hasApiToken: !!apiToken });
    // Initialize services with backend support
    let backendService = null;
    let metricsService = null;
    let gitService = null;
    let healthService = null;
    let customReminderService = null;
    // Register health reminder commands FIRST (before HealthService creates status bar items)
    console.log('[Extension] Registering health reminder commands...');
    ctx.subscriptions.push(vscode.commands.registerCommand('devtimetracker.start202020Timer', async () => {
        await healthService?.start202020Timer();
    }), vscode.commands.registerCommand('devtimetracker.acknowledgePosture', () => {
        vscode.window.showInformationMessage('✓ Posture checked! Keep sitting up straight.');
    }), vscode.commands.registerCommand('devtimetracker.acknowledgeEyeStrain', async () => {
        await healthService?.start202020Timer();
    }), vscode.commands.registerCommand('devtimetracker.startBreak', () => {
        vscode.window.showInformationMessage('💪 Taking a break! Stand up, stretch, and rest your eyes.');
    }), vscode.commands.registerCommand('devtimetracker.breakReminder', () => {
        // Placeholder for status bar click
    }), vscode.commands.registerCommand('devtimetracker.postureReminder', () => {
        // Placeholder for status bar click
    }), vscode.commands.registerCommand('devtimetracker.eyeStrainReminder', () => {
        // Placeholder for status bar click
    }));
    console.log('[Extension] Health reminder commands registered');
    // Initialize backend service FIRST if configured (so other services can use it)
    console.log('[Extension] Checking backend configuration...', { apiUrl, apiToken: apiToken ? '***' + apiToken.slice(-8) : 'none' });
    if (apiUrl) {
        console.log('[Extension] API URL found, initializing BackendService...');
        try {
            backendService = BackendService_1.BackendService.getInstance();
            console.log('[Extension] BackendService instance created, initializing...');
            const initialized = await backendService.initialize();
            if (initialized) {
                console.log('[Backend] ✅ Successfully connected to backend service at', apiUrl);
                vscode.window.showInformationMessage(`✅ Connected to backend: ${apiUrl}`);
            }
        }
        catch (error) {
            console.error('[Backend] ❌ Error initializing backend service:', error);
            vscode.window.showWarningMessage(`❌ Failed to connect to backend: ${error}`);
        }
    }
    else {
        console.log('[Extension] ⚠️  No API URL configured - backend service disabled');
        vscode.window.showWarningMessage('Dev Time Tracker: No API URL configured. Backend features disabled.');
    }
    // Initialize HealthService (it may use backend if available)
    console.log('[Extension] ===== STARTING HEALTH SERVICE INITIALIZATION =====');
    try {
        // Initialize HealthService
        console.log('[Extension] Creating HealthService instance...');
        healthService = HealthService_1.HealthService.getInstance(backendService || undefined, ctx);
        console.log('[Extension] ✓ HealthService instance created');
        // Verify HealthStatusBar instance
        if (!healthService.healthStatusBar) {
            console.error('[Extension] ✗ HealthStatusBar instance is null/undefined!');
        }
        else {
            console.log('[Extension] ✓ HealthStatusBar instance found');
            // Try to force show status bar items
            const types = ['break', 'posture', 'eyeStrain'];
            for (const type of types) {
                try {
                    console.log(`[Extension] Attempting to show ${type} status bar item...`);
                    // Use type assertion to access the methods
                    const statusBar = healthService.healthStatusBar;
                    const methodName = `show${type.charAt(0).toUpperCase() + type.slice(1)}Reminder`;
                    if (typeof statusBar[methodName] === 'function') {
                        statusBar[methodName](1);
                        console.log(`[Extension] ✓ ${type} status bar item shown`);
                    }
                    else {
                        console.error(`[Extension] ✗ Method ${methodName} not found on HealthStatusBar`);
                    }
                }
                catch (error) {
                    console.error(`[Extension] ✗ Error showing ${type} status bar item:`, error);
                }
            }
        }
    }
    catch (error) {
        console.error('[Extension] Error initializing HealthService:', error);
    }
    // Initialize other services with backend (if available)
    if (backendService) {
        console.log('[Extension] Initializing services with backend support...');
        // Register configuration change listener
        let configChangeTimeout = null;
        vscode.workspace.onDidChangeConfiguration(async (e) => {
            if (e.affectsConfiguration('devtimetracker.apiUrl') || e.affectsConfiguration('devtimetracker.apiToken')) {
                // Only reinitialize if API connection settings changed
                console.log('[Backend] API connection settings changed, reinitializing...');
                await backendService?.initialize();
            }
            else if (e.affectsConfiguration('devtimetracker.tracking.enableDiffCapture')) {
                // Handle diff tracking toggle
                const cfg = vscode.workspace.getConfiguration('devtimetracker');
                const enableDiffCapture = cfg.get('tracking.enableDiffCapture', true);
                if (enableDiffCapture) {
                    // Enable diff tracking
                    if (!diffService) {
                        diffService = new DiffService_1.DiffService();
                        diffService.start();
                        eventBuffer?.setDiffService(diffService);
                        console.log('[Extension] DiffService enabled via settings');
                    }
                }
                else {
                    // Disable diff tracking
                    if (diffService) {
                        diffService.dispose();
                        diffService = null;
                        eventBuffer?.setDiffService(null);
                        console.log('[Extension] DiffService disabled via settings');
                    }
                }
            }
            else if (e.affectsConfiguration('devtimetracker')) {
                // Push settings TO backend after a short delay (debounce)
                if (configChangeTimeout) {
                    clearTimeout(configChangeTimeout);
                }
                configChangeTimeout = setTimeout(async () => {
                    console.log('[Backend] Settings changed, pushing to backend...');
                    try {
                        const config = vscode.workspace.getConfiguration('devtimetracker');
                        const settingsKeys = ['pomodoro', 'health', 'metrics'];
                        for (const key of settingsKeys) {
                            const section = config.get(key);
                            if (section && typeof section === 'object') {
                                for (const [subKey, value] of Object.entries(section)) {
                                    await backendService?.updateExtensionSetting(`${key}.${subKey}`, value);
                                }
                            }
                        }
                        console.log('[Backend] Settings pushed successfully');
                    }
                    catch (error) {
                        console.error('[Backend] Failed to push settings:', error);
                    }
                }, 1000); // 1 second debounce
            }
        });
        // Initialize services with backend support
        metricsService = MetricsService_1.MetricsService.getInstance(backendService);
        gitService = GitService_1.GitService.getInstance(backendService);
        // Initialize custom reminders with metrics integration
        if (metricsService) {
            customReminderService = CustomReminderService_1.CustomReminderService.getInstance(ctx, metricsService);
        }
    }
    else {
        console.log('[Extension] Initializing services WITHOUT backend support...');
        metricsService = MetricsService_1.MetricsService.getInstance(undefined);
        gitService = GitService_1.GitService.getInstance(undefined);
    }
    // Register showStatus command BEFORE StatusBarManager (so it exists when status bar items are created)
    ctx.subscriptions.push(vscode.commands.registerCommand('devtimetracker.showStatus', () => {
        if (!statusBarManager) {
            vscode.window.showInformationMessage('Dev Time Tracker is not initialized yet');
            return;
        }
        const sessionTime = statusBarManager.getSessionTime();
        const todayTime = statusBarManager.getTodayTime();
        const metrics = MetricsService_1.MetricsService.getInstance().getMetrics();
        // Build status message
        let message = `Session: ${sessionTime} | Today: ${todayTime}`;
        if (metrics.code) {
            const linesAdded = metrics.code.lines?.added || 0;
            const linesRemoved = metrics.code.lines?.removed || 0;
            const fileTypes = Object.keys(metrics.code.fileTypes || {}).length;
            message += ` | Lines: +${linesAdded}/-${linesRemoved} | Files: ${fileTypes} types`;
        }
        vscode.window.showInformationMessage(message);
    }));
    // Initialize status bar manager as a singleton
    statusBarManager = statusBarManager_1.StatusBarManager.getInstance(ctx);
    // Trigger initial activity to start the session
    if (statusBarManager) {
        statusBarManager.updateActivityStatus(true);
        console.log('[Extension] Initial activity status set to active');
        // Start activity check interval
        activityCheckInterval = setInterval(() => {
            updateActivityStatus();
        }, 1000); // Check every second
        console.log('[Extension] Activity check interval started');
    }
    // Initialize session manager
    const sessionManager = new sessionManager_1.SessionManager(apiUrl || '', apiToken || '', ctx);
    const sessionId = await sessionManager.startSession();
    // Initialize diff service (conditionally based on settings)
    const enableDiffCapture = cfg.get('tracking.enableDiffCapture', true);
    if (enableDiffCapture) {
        diffService = new DiffService_1.DiffService();
        diffService.start();
        console.log('[Extension] DiffService initialized (enabled)');
    }
    else {
        console.log('[Extension] DiffService disabled by user settings');
    }
    // Initialize event buffer and listener with diff service
    eventBuffer = new buffer_1.EventBuffer(apiUrl || '', apiToken || '', sessionId, diffService);
    const listener = new eventListener_1.EventListener(ctx, eventBuffer, sessionId);
    listener.start();
    // Start the event buffer
    eventBuffer.start();
    // Set up activity tracking
    const activityEvents = [
        // Editor events - Track typing and content changes
        vscode.window.onDidChangeActiveTextEditor((e) => {
            console.log('[Activity] Active editor changed:', e?.document.uri.fsPath);
            trackUserActivity('editor changed');
        }),
        vscode.workspace.onDidChangeTextDocument((e) => {
            if (e.contentChanges.length > 0) {
                trackUserActivity('document changed');
            }
        }),
        // Selection changes - detect mouse clicks and keyboard navigation
        vscode.window.onDidChangeTextEditorSelection((e) => {
            trackUserActivity('selection changed');
        }),
        // Visible ranges changed - detect scrolling
        vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
            trackUserActivity('scrolling');
        }),
        // Terminal events
        vscode.window.onDidChangeTerminalState(() => {
            trackUserActivity('terminal state changed');
        }),
        vscode.window.onDidOpenTerminal(() => {
            trackUserActivity('terminal opened');
        }),
        vscode.window.onDidCloseTerminal(() => {
            trackUserActivity('terminal closed');
        }),
        // Window events
        vscode.window.onDidChangeWindowState((e) => {
            if (e.focused) {
                trackUserActivity('window focus changed');
            }
        }),
        // Workspace events
        vscode.workspace.onDidOpenTextDocument(() => {
            trackUserActivity('document opened');
        }),
        vscode.workspace.onDidCloseTextDocument(() => {
            trackUserActivity('document closed');
        }),
        vscode.workspace.onDidSaveTextDocument(() => {
            trackUserActivity('document saved');
        }),
        // View column changes - detect panel/sidebar interactions
        vscode.window.onDidChangeTextEditorViewColumn(() => {
            trackUserActivity('view column changed');
        })
    ];
    // Add activity event listeners to subscriptions
    activityEvents.forEach(disposable => ctx.subscriptions.push(disposable));
    // Clean up on deactivation
    ctx.subscriptions.push({
        dispose: () => {
            if (activityCheckInterval) {
                clearInterval(activityCheckInterval);
            }
            sessionManager_1.SessionManager.endSession();
            MetricsService_1.MetricsService.getInstance().dispose();
            HealthService_1.HealthService.getInstance().dispose();
        }
    });
    // Register other commands
    const disposables = [];
    // 2. Toggle Pomodoro command
    disposables.push(vscode.commands.registerCommand('devtimetracker.togglePomodoro', () => {
        statusBarManager?.togglePomodoro();
    }));
    // 2b. Test notifications command (for debugging)
    disposables.push(vscode.commands.registerCommand('devtimetracker.testNotifications', async () => {
        vscode.window.showInformationMessage('Testing notifications - this should appear in bottom-right corner', 'OK');
        console.log('[Extension] Test notification sent');
        // Also test backend connection
        if (backendService) {
            try {
                await backendService.sendEvent('test', { message: 'Test from extension' });
                vscode.window.showInformationMessage('✓ Backend connection working!');
            }
            catch (error) {
                vscode.window.showErrorMessage(`✗ Backend connection failed: ${error}`);
            }
        }
        else {
            vscode.window.showWarningMessage('Backend service not initialized');
        }
    }));
    // Health reminder commands already registered at the top of activate()
    // 2c. Toggle diff capture command
    disposables.push(vscode.commands.registerCommand('devtimetracker.toggleDiffCapture', async () => {
        const cfg = vscode.workspace.getConfiguration('devtimetracker');
        const currentValue = cfg.get('tracking.enableDiffCapture', true);
        const newValue = !currentValue;
        await cfg.update('tracking.enableDiffCapture', newValue, vscode.ConfigurationTarget.Global);
        // Restart or stop DiffService based on new value
        if (newValue) {
            // Enable diff tracking
            if (!diffService) {
                diffService = new DiffService_1.DiffService();
                diffService.start();
                eventBuffer?.setDiffService(diffService);
            }
            vscode.window.showInformationMessage('✓ Code diff tracking enabled');
        }
        else {
            // Disable diff tracking
            if (diffService) {
                diffService.dispose();
                diffService = null;
                eventBuffer?.setDiffService(null);
            }
            vscode.window.showInformationMessage('Code diff tracking disabled (line counts only)');
        }
    }));
    // 3. Add custom reminder command
    disposables.push(vscode.commands.registerCommand('devtimetracker.addCustomReminder', async () => {
        const customReminderService = CustomReminderService_1.CustomReminderService.getInstance(ctx);
        if (!customReminderService) {
            const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
            statusBarItem.text = '$(error) Reminder service not available';
            statusBarItem.show();
            setTimeout(() => statusBarItem.dispose(), 5000);
            return;
        }
        // Show status bar message instead of popup
        const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
        statusBarItem.text = '$(error) Reminder creation not available';
        statusBarItem.tooltip = 'This feature requires popup dialogs which are disabled in this version.';
        statusBarItem.show();
        // Auto-hide after 5 seconds
        setTimeout(() => statusBarItem.dispose(), 5000);
        return;
    }));
    // Register all disposables with the extension context
    disposables.forEach(disposable => ctx.subscriptions.push(disposable));
    // Register custom reminder commands
    (0, manageCustomReminders_1.registerCustomReminderCommands)(ctx);
    // Initial update of activity status
    updateActivityStatus();
    // Log successful activation
    console.log('[Extension] Dev Time Tracker activated successfully');
    // Return the public API if needed
    return {
    // Add any public API methods here
    };
}
async function deactivate() {
    console.log('[Extension] Deactivating Dev Time Tracker');
    // Clear activity check interval
    if (activityCheckInterval) {
        clearInterval(activityCheckInterval);
        activityCheckInterval = null;
    }
    // Dispose of services
    MetricsService_1.MetricsService.getInstance().dispose();
    HealthService_1.HealthService.getInstance().dispose();
    CustomReminderService_1.CustomReminderService.getInstance().dispose();
    if (diffService) {
        diffService.dispose();
        diffService = null;
    }
    // End current session
    await sessionManager_1.SessionManager.endSession();
}
//# sourceMappingURL=extension.js.map