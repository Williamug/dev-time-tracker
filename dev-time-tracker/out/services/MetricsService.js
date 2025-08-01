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
exports.MetricsService = void 0;
const vscode = __importStar(require("vscode"));
const Metrics_1 = require("../models/Metrics");
class MetricsService {
    static instance;
    metricsCollector = Metrics_1.MetricsCollector.getInstance();
    disposables = [];
    syncInterval = null;
    lastSyncTime = null;
    apiUrl = null;
    apiToken = null;
    isSyncing = false;
    constructor() {
        this.initialize();
    }
    static getInstance() {
        if (!MetricsService.instance) {
            MetricsService.instance = new MetricsService();
        }
        return MetricsService.instance;
    }
    initialize() {
        this.loadConfig();
        this.setupEventListeners();
        this.startSyncInterval();
    }
    getDefaultCodeMetrics() {
        return {
            lines: { added: 0, removed: 0, total: 0 },
            files: { modified: 0, created: 0, deleted: 0 },
            fileTypes: {},
            complexity: { max: 0, average: 0 }
        };
    }
    loadConfig() {
        const config = vscode.workspace.getConfiguration('devtimetracker');
        this.apiUrl = config.get('apiUrl') || null;
        this.apiToken = config.get('apiToken') || null;
        // Listen for config changes
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('devtimetracker')) {
                this.loadConfig();
            }
        });
    }
    setupEventListeners() {
        // Document changes
        this.disposables.push(vscode.workspace.onDidChangeTextDocument(e => {
            this.handleDocumentChange(e);
        }));
        // File operations
        this.disposables.push(vscode.workspace.onDidCreateFiles(e => {
            this.handleFilesCreated(e.files);
        }), vscode.workspace.onDidDeleteFiles(e => {
            this.handleFilesDeleted(e.files);
        }), vscode.workspace.onDidRenameFiles(e => {
            this.handleFilesRenamed(e.files);
        }));
        // Editor events
        this.disposables.push(vscode.window.onDidChangeActiveTextEditor(e => {
            if (e) {
                this.handleEditorChange(e);
            }
        }));
    }
    startSyncInterval() {
        // Sync every 5 minutes
        this.syncInterval = setInterval(() => {
            this.syncWithBackend();
        }, 5 * 60 * 1000);
    }
    async syncWithBackend() {
        if (this.isSyncing || !this.apiUrl || !this.apiToken) {
            return;
        }
        this.isSyncing = true;
        try {
            const metrics = this.metricsCollector.getMetrics();
            const response = await fetch(`${this.apiUrl}/api/metrics`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiToken}`
                },
                body: JSON.stringify(metrics)
            });
            if (response.ok) {
                this.lastSyncTime = new Date();
                console.log('[Metrics] Successfully synced with backend');
            }
            else {
                console.error('[Metrics] Failed to sync with backend:', await response.text());
            }
        }
        catch (error) {
            console.error('[Metrics] Error syncing with backend:', error);
        }
        finally {
            this.isSyncing = false;
        }
    }
    // Event Handlers
    handleDocumentChange(e) {
        // Track lines changed, complexity, etc.
        const changes = e.contentChanges;
        const metrics = this.metricsCollector.getMetrics();
        // Initialize code metrics if not present
        if (!metrics.code) {
            this.metricsCollector.updateMetrics({
                code: this.getDefaultCodeMetrics()
            });
            return;
        }
        // Create a copy of metrics to work with
        const updatedMetrics = { ...metrics.code };
        // Update line metrics
        changes.forEach(change => {
            const addedLines = change.text.split('\n').length - 1;
            const removedLines = change.range.end.line - change.range.start.line + 1;
            updatedMetrics.lines.added += Math.max(0, addedLines - 1);
            updatedMetrics.lines.removed += removedLines;
            updatedMetrics.lines.total = updatedMetrics.lines.added - updatedMetrics.lines.removed;
        });
        // Update file type metrics
        const fileExtension = e.document.fileName.split('.').pop() || '';
        if (fileExtension) {
            updatedMetrics.fileTypes[fileExtension] = (updatedMetrics.fileTypes[fileExtension] || 0) + 1;
        }
        // Update modified files count
        updatedMetrics.files.modified += 1;
        this.metricsCollector.updateMetrics({
            code: updatedMetrics
        });
    }
    handleEditorChange(editor) {
        // Track project and file changes
        const document = editor.document;
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        const projectName = workspaceFolder?.name || 'Unknown';
        this.metricsCollector.updateMetrics({
            project: {
                currentProject: projectName,
                projects: {
                    [projectName]: {
                        timeSpent: 0, // Will be updated by timer
                        lastActive: new Date(),
                        fileTypes: { [document.languageId]: 1 }
                    }
                }
            }
        });
    }
    handleFilesCreated(files) {
        const metrics = this.metricsCollector.getMetrics();
        if (!metrics.code)
            return;
        metrics.code.files.created += files.length;
        this.metricsCollector.updateMetrics(metrics);
    }
    handleFilesDeleted(files) {
        const metrics = this.metricsCollector.getMetrics();
        if (!metrics.code)
            return;
        metrics.code.files.deleted += files.length;
        this.metricsCollector.updateMetrics(metrics);
    }
    handleFilesRenamed(files) {
        // Track file renames
        const metrics = this.metricsCollector.getMetrics();
        if (!metrics.code)
            return;
        metrics.code.files.modified += files.length;
        this.metricsCollector.updateMetrics(metrics);
    }
    // Public API
    getMetrics() {
        return this.metricsCollector.getMetrics();
    }
    handleActivity() {
        const metrics = this.metricsCollector.getMetrics();
        if (!metrics.productivity)
            return;
        // Update focus time (in seconds)
        const now = new Date();
        const lastUpdate = metrics.timestamp || now;
        const secondsActive = Math.floor((now.getTime() - lastUpdate.getTime()) / 1000);
        // Update productive hours (current hour)
        const currentHour = now.getHours().toString().padStart(2, '0');
        this.metricsCollector.updateMetrics({
            timestamp: now,
            productivity: {
                ...metrics.productivity,
                focusTime: (metrics.productivity.focusTime || 0) + secondsActive,
                productiveHours: {
                    ...metrics.productivity.productiveHours,
                    [currentHour]: (metrics.productivity.productiveHours?.[currentHour] || 0) + secondsActive
                }
            }
        });
    }
    async forceSync() {
        await this.syncWithBackend();
        return !this.isSyncing;
    }
    dispose() {
        // Clean up resources
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        // Do one final sync before disposing
        this.syncWithBackend().catch(console.error);
    }
}
exports.MetricsService = MetricsService;
//# sourceMappingURL=MetricsService.js.map