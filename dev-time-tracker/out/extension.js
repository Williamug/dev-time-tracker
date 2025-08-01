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
// Track user activity state
let lastActivityTime = Date.now();
const INACTIVITY_THRESHOLD = 5000; // 5 seconds for testing (change to 300000 for 5 minutes in production)
let activityCheckInterval = null;
let statusBarManager = null;
// Update activity status based on user interaction
function updateActivityStatus() {
    if (!statusBarManager)
        return;
    const now = Date.now();
    const isActive = now - lastActivityTime < INACTIVITY_THRESHOLD;
    console.log(`[Activity] ${isActive ? 'Active' : 'Idle'} (${new Date(lastActivityTime).toLocaleTimeString()})`);
    statusBarManager.updateActivityStatus(isActive);
}
// Track user activity
function trackUserActivity(reason) {
    const oldTime = lastActivityTime;
    lastActivityTime = Date.now();
    console.log(`[Activity] Activity detected (${reason}) - Last: ${new Date(oldTime).toLocaleTimeString()}, Now: ${new Date(lastActivityTime).toLocaleTimeString()}`);
    updateActivityStatus();
}
async function activate(ctx) {
    console.log('[Extension] Activating Dev Time Tracker...');
    const cfg = vscode.workspace.getConfiguration('devtimetracker');
    const apiUrl = cfg.get('apiUrl');
    const apiToken = cfg.get('apiToken');
    console.log('[Extension] Configuration loaded:', { hasApiUrl: !!apiUrl, hasApiToken: !!apiToken });
    // Initialize services
    const metricsService = MetricsService_1.MetricsService.getInstance();
    const gitService = GitService_1.GitService.getInstance();
    const healthService = HealthService_1.HealthService.getInstance();
    // Initialize status bar manager
    statusBarManager = statusBarManager_1.StatusBarManager.getInstance(ctx);
    if (!statusBarManager) {
        console.error('[Extension] Failed to initialize StatusBarManager');
        return;
    }
    try {
        // Initialize session manager and event buffer only if API URL is provided
        if (apiUrl) {
            const sessionManager = new sessionManager_1.SessionManager(apiUrl, apiToken || '', ctx);
            const sessionId = await sessionManager.startSession();
            const eventBuffer = new buffer_1.EventBuffer(apiUrl, apiToken || '', sessionId);
            eventBuffer.start();
            ctx.subscriptions.push({ dispose: () => eventBuffer.stop() });
            const listener = new eventListener_1.EventListener(ctx, eventBuffer, sessionId);
            listener.start();
            console.log('[Extension] Backend integration initialized');
        }
        else {
            console.log('[Extension] Running in local mode - no backend integration');
        }
    }
    catch (error) {
        console.error('[Extension] Error initializing backend integration:', error);
        vscode.window.showWarningMessage('Dev Time Tracker: Running in local mode - backend integration disabled');
    }
    // Set up event listeners for user activity
    console.log('[Extension] Setting up activity listeners...');
    // Forward activity events to metrics service
    const metrics = MetricsService_1.MetricsService.getInstance();
    const trackActivity = (type) => {
        console.log(`[Activity] ${type}`);
        metrics.handleActivity();
    };
    const activityEvents = [
        // Editor events
        vscode.window.onDidChangeActiveTextEditor((e) => {
            console.log('[Activity] Active editor changed:', e?.document.uri.fsPath);
            trackUserActivity('editor change');
        }),
        vscode.window.onDidChangeTextEditorSelection((e) => {
            console.log('[Activity] Text selection changed in:', e.textEditor.document.uri.fsPath);
            trackUserActivity('selection change');
        }),
        vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
            console.log('[Activity] Visible ranges changed in:', e.textEditor.document.uri.fsPath);
            trackUserActivity('visible ranges change');
        }),
        vscode.workspace.onDidChangeTextDocument((e) => {
            console.log('[Activity] Document changed:', e.document.uri.fsPath);
            trackUserActivity('document change');
        }),
        // Window focus events
        vscode.window.onDidChangeWindowState((e) => {
            console.log(`[Activity] Window focus changed: ${e.focused ? 'focused' : 'unfocused'}`);
            if (e.focused)
                trackUserActivity('window focus');
        }),
        // Terminal events
        vscode.window.onDidChangeActiveTerminal((terminal) => {
            console.log('[Activity] Active terminal changed:', terminal?.name);
            trackUserActivity('terminal change');
        }),
        // Debug events
        vscode.debug.onDidStartDebugSession(() => {
            console.log('[Activity] Debug session started');
            trackUserActivity('debug session start');
        }),
        // File system events
        vscode.workspace.onDidCreateFiles((e) => {
            console.log('[Activity] Files created:', e.files.map(f => f.fsPath));
            trackUserActivity('file created');
        }),
        // Status bar click command
        vscode.commands.registerCommand('devtimetracker.forceActive', () => {
            console.log('[Activity] Manual activation triggered');
            trackUserActivity('manual activation');
        })
    ];
    // Add activity event listeners to subscriptions
    activityEvents.forEach(disposable => ctx.subscriptions.push(disposable));
    console.log('[Extension] Activity listeners registered');
    // Initial activity check
    trackUserActivity('initial activation');
    // Update activity status more frequently for better responsiveness
    activityCheckInterval = setInterval(() => {
        updateActivityStatus();
    }, 1000); // Check every second
    ctx.subscriptions.push(new vscode.Disposable(() => {
        activityEvents.forEach(disposable => disposable.dispose());
        if (statusBarManager) {
            statusBarManager.dispose();
        }
        // Clean up services
        MetricsService_1.MetricsService.getInstance().dispose();
        GitService_1.GitService.getInstance().dispose();
        HealthService_1.HealthService.getInstance().dispose();
    }));
    // Register commands
    const showStatus = vscode.commands.registerCommand('devtimetracker.showStatus', () => {
        if (!statusBarManager)
            return;
        const sessionTime = statusBarManager.getSessionTime();
        const todayTime = statusBarManager.getTodayTime();
        const metrics = MetricsService_1.MetricsService.getInstance().getMetrics();
        let message = `Current Session: ${sessionTime}\n` +
            `Today's Total: ${todayTime}`;
        if (metrics.code) {
            message += `\n\nCode Metrics:`;
            message += `\n- Lines: +${metrics.code.lines.added}/-${metrics.code.lines.removed}`;
            message += `\n- Files: ${Object.keys(metrics.code.fileTypes).length} types`;
        }
        if (metrics.project?.currentProject) {
            message += `\n\nCurrent Project: ${metrics.project.currentProject}`;
        }
        vscode.window.showInformationMessage(message);
    });
    ctx.subscriptions.push(showStatus);
    const togglePomodoro = vscode.commands.registerCommand('devtimetracker.togglePomodoro', () => {
        statusBarManager?.togglePomodoro();
    });
    ctx.subscriptions.push(togglePomodoro);
    // Initial update of activity status
    updateActivityStatus();
}
async function deactivate() {
    await sessionManager_1.SessionManager.endSession();
}
//# sourceMappingURL=extension.js.map