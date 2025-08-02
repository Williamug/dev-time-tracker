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
const axios_1 = require("axios");
const ExtendedMetricsCollector_1 = require("../models/ExtendedMetricsCollector");
const Metrics_1 = require("../models/Metrics");
class MetricsService {
    static instance;
    metrics = new Map();
    metricsCollector;
    baseCollector;
    disposables = [];
    syncInterval = null;
    lastSyncTime = null;
    backendService = null;
    apiUrl = null;
    apiToken = null;
    isSyncing = false;
    lastSyncError = null;
    consecutiveFailures = 0;
    static MAX_RETRY_ATTEMPTS = 3;
    static RETRY_DELAY_MS = 5000;
    static SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
    static MIN_SYNC_INTERVAL = 30000; // 30 seconds minimum between syncs
    static MAX_BATCH_SIZE = 100; // Maximum number of events per batch
    static RATE_LIMIT_WINDOW_MS = 60000; // 1 minute rate limit window
    static RATE_LIMIT_MAX_REQUESTS = 30; // Max requests per window
    static IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes of inactivity
    // Rate limiting state
    requestTimestamps = [];
    pendingMetrics = [];
    lastSyncAttempt = 0;
    isRateLimited = false;
    rateLimitResetTime = 0;
    // Idle tracking
    lastActivityTime = Date.now();
    isIdle = false;
    idleTimer = null;
    isTrackingPaused = false;
    constructor(backendService) {
        this.metrics = new Map();
        // Initialize base metrics collector
        this.baseCollector = Metrics_1.MetricsCollector.getInstance();
        // Wrap with extended collector for additional functionality
        this.metricsCollector = ExtendedMetricsCollector_1.ExtendedMetricsCollector.getInstance(this.baseCollector);
        if (backendService) {
            this.backendService = backendService;
        }
        this.initialize();
    }
    static getInstance(backendService) {
        if (!MetricsService.instance) {
            MetricsService.instance = new MetricsService(backendService);
        }
        else if (backendService) {
            // Update backend service reference if provided
            MetricsService.instance.backendService = backendService;
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
            this.handleActivity();
            this.handleDocumentChange(e);
        }));
        // Track user activity
        this.disposables.push(vscode.window.onDidChangeActiveTextEditor(() => this.handleActivity()), vscode.window.onDidChangeTextEditorSelection(() => this.handleActivity()), vscode.window.onDidChangeWindowState(state => {
            if (state.focused) {
                this.handleActivity();
            }
        }));
        // Start idle checker
        this.startIdleChecker();
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
    syncTimeout = null;
    scheduleSync() {
        // Clear any pending sync
        if (this.syncTimeout) {
            clearTimeout(this.syncTimeout);
        }
        // Schedule a new sync with a small debounce delay
        this.syncTimeout = setTimeout(() => {
            this.syncWithBackend().catch(error => {
                console.error('Error during scheduled sync:', error);
            });
        }, 5000); // 5 second debounce
    }
    async forceSync() {
        try {
            if (this.syncTimeout) {
                clearTimeout(this.syncTimeout);
                this.syncTimeout = null;
            }
            await this.syncWithBackend(true);
            return { success: true };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error during sync';
            console.error('[Metrics] Force sync failed:', error);
            vscode.window.showErrorMessage(`Failed to sync metrics: ${errorMessage}`, { modal: false });
            return {
                success: false,
                error: errorMessage
            };
        }
    }
    handleEditorChange(editor) {
        if (!editor || !this.metricsCollector) {
            return;
        }
        try {
            const document = editor.document;
            const filePath = document.uri.fsPath;
            const languageId = document.languageId;
            const lineCount = document.lineCount;
            const charCount = document.getText().length;
            this.metricsCollector.recordView(filePath, {
                language: languageId,
                lineCount,
                charCount,
                timestamp: Date.now()
            });
            this.scheduleSync();
        }
        catch (error) {
            console.error('Error handling editor change:', error);
        }
    }
    // Handle document change events with batching support
    handleDocumentChange(change) {
        if (!this.metricsCollector)
            return;
        try {
            const document = change.document;
            const filePath = document.uri.fsPath;
            const languageId = document.languageId;
            const contentChanges = change.contentChanges;
            // Skip if no actual changes
            if (contentChanges.length === 0)
                return;
            // Record the change
            this.metricsCollector.recordChange(filePath, {
                language: languageId,
                changes: contentChanges.length,
                timestamp: Date.now()
            });
            // Get current metrics without resetting
            const metrics = this.metricsCollector.peekMetrics();
            // If we're approaching batch size, trigger a sync
            if (this.pendingMetrics.length + 1 >= MetricsService.MAX_BATCH_SIZE) {
                this.syncWithBackend().catch(error => {
                    console.error('Error during scheduled sync:', error);
                });
            }
            else {
                // Otherwise, schedule a delayed sync
                this.scheduleSync();
            }
        }
        catch (error) {
            console.error('Error handling document change:', error);
            // Even if there's an error, try to schedule a sync to avoid losing data
            this.scheduleSync();
        }
    }
    handleFilesCreated(files) {
        if (!this.metricsCollector)
            return;
        files.forEach(file => {
            this.metricsCollector.recordFileOperation('create', file.fsPath);
        });
        this.scheduleSync();
    }
    handleFilesDeleted(files) {
        if (!this.metricsCollector)
            return;
        files.forEach(file => {
            this.metricsCollector.recordFileOperation('delete', file.fsPath);
        });
        this.scheduleSync();
    }
    handleFilesRenamed(files) {
        if (!this.metricsCollector)
            return;
        files.forEach(({ oldUri, newUri }) => {
            this.metricsCollector.recordFileOperation('rename', newUri.fsPath, oldUri.fsPath);
        });
        this.scheduleSync();
    }
    async processBatch(force = false) {
        if (this.pendingMetrics.length === 0)
            return true;
        const batch = [...this.pendingMetrics];
        let success = false;
        let lastError = null;
        console.log(`[Metrics] Processing batch of ${batch.length} metrics...`);
        // Apply rate limiting
        this.updateRateLimitCounter();
        // Send with retry logic
        for (let attempt = 1; attempt <= MetricsService.MAX_RETRY_ATTEMPTS; attempt++) {
            try {
                // Check rate limit before each attempt
                if (this.isRateLimited) {
                    const remainingMs = this.rateLimitResetTime - Date.now();
                    if (remainingMs > 0) {
                        await new Promise(resolve => setTimeout(resolve, remainingMs + 1000));
                    }
                    this.isRateLimited = false;
                }
                await this.backendService.sendEvent('metrics_batch', { events: batch });
                // On success, remove processed metrics from pending
                this.pendingMetrics = this.pendingMetrics.filter(m => !batch.some(b => b.batchId === m.batchId));
                success = true;
                this.consecutiveFailures = 0;
                this.lastSyncError = null;
                this.lastSyncTime = new Date();
                console.log(`[Metrics] Successfully synced batch of ${batch.length} events`);
                // Show success notification only for forced syncs or after failures
                if (force || attempt > 1) {
                    vscode.window.showInformationMessage(`Synced ${batch.length} metrics to server`, { modal: false });
                }
                break;
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                const errorMessage = lastError.message;
                // Check for rate limit headers if available
                if ((0, axios_1.isAxiosError)(error) && error.response) {
                    if (error.response.headers?.['x-ratelimit-remaining'] === '0') {
                        const resetTime = parseInt(String(error.response.headers['x-ratelimit-reset'] || '0')) * 1000;
                        this.handleRateLimit(resetTime);
                    }
                    else if (error.response.status === 429) {
                        // Standard 429 Too Many Requests
                        const retryAfter = parseInt(String(error.response.headers['retry-after'] || '60')) * 1000;
                        this.handleRateLimit(Date.now() + retryAfter);
                    }
                }
                console.error(`[Metrics] Batch sync attempt ${attempt} failed:`, errorMessage);
                if (attempt < MetricsService.MAX_RETRY_ATTEMPTS) {
                    // Wait before retry with exponential backoff
                    const delay = MetricsService.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
                    console.log(`[Metrics] Retrying batch in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        if (!success && lastError) {
            console.error('[Metrics] All batch sync attempts failed');
            this.consecutiveFailures++;
            this.lastSyncError = {
                error: lastError,
                timestamp: Date.now()
            };
            // Show error notification for first few failures
            if (this.consecutiveFailures <= 3) {
                vscode.window.showErrorMessage(`Failed to sync metrics: ${lastError.message}`, { modal: false });
            }
        }
        return success;
    }
    updateRateLimitCounter() {
        const now = Date.now();
        // Remove timestamps older than the rate limit window
        this.requestTimestamps = this.requestTimestamps.filter(timestamp => now - timestamp < MetricsService.RATE_LIMIT_WINDOW_MS);
        // Check if we've exceeded the rate limit
        if (this.requestTimestamps.length >= MetricsService.RATE_LIMIT_MAX_REQUESTS) {
            const oldestRequest = this.requestTimestamps[0];
            const timeUntilReset = (oldestRequest + MetricsService.RATE_LIMIT_WINDOW_MS) - now;
            this.handleRateLimit(now + timeUntilReset);
            return;
        }
        // Add current request timestamp
        this.requestTimestamps.push(now);
    }
    handleRateLimit(resetTime) {
        this.isRateLimited = true;
        this.rateLimitResetTime = resetTime;
        const remainingMs = resetTime - Date.now();
        console.warn(`[Metrics] Rate limited - resuming at ${new Date(resetTime).toISOString()}`);
        // Show a warning to the user if we're significantly rate limited
        if (remainingMs > 30000) { // Only show for rate limits > 30 seconds
            vscode.window.showWarningMessage(`Metrics sync rate limited. Will resume in ${Math.ceil(remainingMs / 1000)} seconds.`, { modal: false });
        }
        // Schedule a retry after the rate limit resets
        setTimeout(() => {
            this.isRateLimited = false;
            this.syncWithBackend().catch(console.error);
        }, remainingMs + 1000);
    }
    async syncWithBackend(force = false) {
        // Skip if already syncing
        if (this.isSyncing) {
            console.log('[Metrics] Sync already in progress');
            return;
        }
        // Skip if no backend service
        if (!this.backendService) {
            console.log('[Metrics] Backend service not available');
            return;
        }
        // Check rate limiting
        if (this.isRateLimited) {
            if (Date.now() < this.rateLimitResetTime) {
                const remainingMs = this.rateLimitResetTime - Date.now();
                console.log(`[Metrics] Rate limited - waiting ${remainingMs}ms before next request`);
                // Schedule a retry after rate limit resets
                setTimeout(() => this.syncWithBackend(force), remainingMs + 1000);
                return;
            }
            this.isRateLimited = false;
        }
        // Apply minimum sync interval (except for forced syncs)
        const now = Date.now();
        if (!force && now - this.lastSyncAttempt < MetricsService.MIN_SYNC_INTERVAL) {
            console.log('[Metrics] Sync skipped - minimum sync interval not reached');
            return;
        }
        this.lastSyncAttempt = now;
        try {
            this.isSyncing = true;
            // Get current metrics and reset the collector
            const metrics = this.metricsCollector.getMetrics();
            // Skip if no meaningful data to sync (unless forced)
            if (!this.hasMeaningfulData(metrics) && !force) {
                console.log('[Metrics] No meaningful data to sync');
                return;
            }
            // Create a batch item with metadata
            const batchItem = {
                ...metrics,
                environment: this.getEnvironmentInfo(),
                timestamp: new Date().toISOString(),
                sessionId: vscode.env.sessionId,
                machineId: vscode.env.machineId,
                batchId: Date.now().toString(36) + Math.random().toString(36).substring(2)
            };
            // Add to pending metrics
            this.pendingMetrics.push(batchItem);
            // Process the batch if we've reached the batch size or this is a forced sync
            if (force || this.pendingMetrics.length >= MetricsService.MAX_BATCH_SIZE) {
                await this.processBatch(force);
            }
            else {
                // Schedule a delayed sync to ensure we don't lose data
                this.scheduleSync();
            }
        }
        catch (error) {
            const errorObj = error instanceof Error ? error : new Error(String(error));
            const errorMessage = errorObj.message;
            this.consecutiveFailures++;
            this.lastSyncError = {
                error: errorObj,
                timestamp: Date.now()
            };
            console.error('[Metrics] Sync failed:', error);
            // Only show error notification for forced syncs or first few failures
            if (force || this.consecutiveFailures <= 3) {
                const message = this.isRateLimited
                    ? 'Metrics sync rate limited. Will retry automatically.'
                    : `Failed to sync metrics: ${errorMessage}`;
                vscode.window.showErrorMessage(message, { modal: false });
            }
            // Schedule a retry with exponential backoff if not rate limited
            if (!this.isRateLimited) {
                const backoffTime = Math.min(MetricsService.RETRY_DELAY_MS * Math.pow(2, this.consecutiveFailures - 1), 5 * 60 * 1000 // Max 5 minutes
                );
                console.log(`[Metrics] Scheduling retry in ${backoffTime}ms`);
                setTimeout(() => this.syncWithBackend(force), backoffTime);
            }
        }
        finally {
            this.isSyncing = false;
        }
        // Apply exponential backoff for retries
        if (this.consecutiveFailures > 0 && !force) {
            const backoffTime = Math.min(MetricsService.RETRY_DELAY_MS * Math.pow(2, this.consecutiveFailures - 1), 5 * 60 * 1000 // Max 5 minutes
            );
            if (Date.now() - (this.lastSyncError?.timestamp || 0) < backoffTime) {
                console.log(`[Metrics] Sync delayed - waiting for backoff period (${backoffTime}ms)`);
                return;
            }
        }
        this.isSyncing = true;
        let success = false;
        try {
            // Get current metrics and reset the collector
            const metrics = this.metricsCollector.getMetrics();
            // Skip if no meaningful data to sync
            if (!this.hasMeaningfulData(metrics) && !force) {
                console.log('[Metrics] No meaningful data to sync');
                return;
            }
            // Add metadata
            const payload = {
                ...metrics,
                environment: this.getEnvironmentInfo(),
                timestamp: new Date().toISOString(),
                sessionId: vscode.env.sessionId,
                machineId: vscode.env.machineId
            };
            console.log('[Metrics] Syncing metrics with backend...');
            // Send with retry logic
            for (let attempt = 1; attempt <= MetricsService.MAX_RETRY_ATTEMPTS; attempt++) {
                try {
                    await this.backendService.sendEvent('metrics_update', payload);
                    success = true;
                    this.consecutiveFailures = 0;
                    this.lastSyncError = null;
                    this.lastSyncTime = new Date();
                    console.log('[Metrics] Successfully synced with backend');
                    // Show success notification only for forced syncs or after failures
                    if (force || attempt > 1) {
                        vscode.window.showInformationMessage('Metrics synced successfully', { modal: false });
                    }
                    break;
                }
                catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    console.error(`[Metrics] Sync attempt ${attempt} failed:`, errorMessage);
                    if (attempt < MetricsService.MAX_RETRY_ATTEMPTS) {
                        // Wait before retry with exponential backoff
                        const delay = MetricsService.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
                        console.log(`[Metrics] Retrying in ${delay}ms...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                    else {
                        throw error; // Re-throw after last attempt
                    }
                }
            }
        }
        catch (error) {
            this.consecutiveFailures++;
            this.lastSyncError = {
                error: error instanceof Error ? error : new Error(String(error)),
                timestamp: Date.now()
            };
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('[Metrics] All sync attempts failed:', error);
            // Only show error notification for forced syncs or first few failures
            if (force || this.consecutiveFailures <= 3) {
                vscode.window.showErrorMessage(`Failed to sync metrics: ${errorMessage}`, 'Retry Now', 'Dismiss').then(selection => {
                    if (selection === 'Retry Now') {
                        this.forceSync();
                    }
                });
            }
            throw error; // Re-throw to be caught by forceSync if needed
        }
        finally {
            this.isSyncing = false;
            // Schedule next sync if not forced
            if (!force) {
                setTimeout(() => this.syncWithBackend(), MetricsService.SYNC_INTERVAL_MS);
            }
        }
    }
    hasMeaningfulData(metrics) {
        // Check if there's any meaningful data to sync
        return ((metrics.code?.lines?.added ?? 0) > 0 ||
            (metrics.code?.lines?.removed ?? 0) > 0 ||
            (metrics.code?.files?.modified ?? 0) > 0 ||
            (metrics.code?.files?.created ?? 0) > 0 ||
            (metrics.code?.files?.deleted ?? 0) > 0 ||
            (metrics.productivity?.focusTime ?? 0) > 0);
    }
    getEnvironmentInfo() {
        return {
            os: process.platform,
            vscodeVersion: vscode.version,
            extensionVersion: vscode.extensions.getExtension('your-extension-id')?.packageJSON.version || 'unknown',
            isVirtualWorkspace: vscode.workspace.workspaceFolders?.some(folder => folder.uri.scheme !== 'file') ?? false,
            workspaceCount: vscode.workspace.workspaceFolders?.length ?? 0,
            isTrusted: vscode.workspace.isTrusted,
            remoteName: vscode.env.remoteName,
            appName: vscode.env.appName,
            appHost: vscode.env.appHost
        };
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
        this.lastActivityTime = Date.now();
        if (this.isIdle) {
            this.isIdle = false;
            this.isTrackingPaused = false;
            this.metricsCollector.resumeTracking();
            console.log('Resumed tracking after idle period');
        }
        this.resetIdleTimer();
    }
    startIdleChecker() {
        this.resetIdleTimer();
    }
    resetIdleTimer() {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
        }
        this.idleTimer = setTimeout(() => this.handleIdleState(), MetricsService.IDLE_TIMEOUT_MS);
    }
    handleIdleState() {
        if (!this.isIdle) {
            this.isIdle = true;
            this.isTrackingPaused = true;
            this.metricsCollector.pauseTracking();
            console.log('Paused tracking due to inactivity');
        }
    }
    // Event Handlers
    // Note: The primary handleDocumentChange implementation is at the top of the file
    // and includes batching support for better performance and reliability
    dispose() {
        // Clean up resources
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        // Do one final sync before disposing
        this.syncWithBackend().catch(console.error);
        this.clearTimers();
    }
    clearTimers() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }
    }
}
exports.MetricsService = MetricsService;
//# sourceMappingURL=MetricsService.js.map