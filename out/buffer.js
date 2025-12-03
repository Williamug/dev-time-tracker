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
exports.EventBuffer = void 0;
const vscode = __importStar(require("vscode"));
class EventBuffer {
    apiUrl;
    apiToken;
    sessionId;
    buffer = [];
    timer;
    intervalMs = 30_000; // flush every 30s
    batchSize = 20;
    lastEventTime = Date.now();
    currentFile = '';
    currentLanguage = '';
    projectName = '';
    diffService = null;
    constructor(apiUrl, apiToken, sessionId, diffService) {
        this.apiUrl = apiUrl;
        this.apiToken = apiToken;
        this.sessionId = sessionId;
        // Remove trailing slashes from API URL
        this.apiUrl = apiUrl.replace(/\/+$/, '');
        // Extract project name from workspace
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            this.projectName = workspaceFolder.name;
        }
        this.diffService = diffService || null;
        console.log('[EventBuffer] Initialized with:', {
            apiUrl: this.apiUrl,
            hasToken: !!this.apiToken,
            sessionId: this.sessionId,
            projectName: this.projectName,
            hasDiffService: !!this.diffService
        });
    }
    start() {
        console.log('[EventBuffer] Starting buffer with 30s flush interval');
        this.timer = setInterval(() => this.flush(), this.intervalMs);
        // Update current file info when editor changes
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                this.currentFile = vscode.workspace.asRelativePath(editor.document.uri);
                this.currentLanguage = editor.document.languageId;
            }
        });
        // Flush on document close
        vscode.workspace.onDidCloseTextDocument(() => this.flush());
    }
    add(eventType, extraData) {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const now = Date.now();
        const duration = Math.round((now - this.lastEventTime) / 1000); // seconds
        const startedAt = new Date(now - (duration * 1000)).toISOString();
        const endedAt = new Date(now).toISOString();
        this.lastEventTime = now;
        const filePath = editor.document.uri.fsPath;
        // Get diff data if available
        let diffData = null;
        if (this.diffService && (eventType === 'typing' || eventType === 'file_save')) {
            try {
                diffData = this.diffService.getDiffAndReset(filePath);
            }
            catch (error) {
                console.error('[EventBuffer] Error getting diff data:', error);
                // Continue without diff data
            }
        }
        const activity = {
            event_type: eventType,
            duration: Math.max(1, duration), // at least 1 second
            file_path: vscode.workspace.asRelativePath(editor.document.uri),
            language: editor.document.languageId,
            project_name: this.projectName,
            started_at: startedAt,
            ended_at: endedAt,
            keystrokes: extraData?.keystrokes ?? 0,
            lines_added: diffData?.linesAdded ?? extraData?.lines_added ?? 0,
            lines_removed: diffData?.linesRemoved ?? extraData?.lines_removed ?? 0,
            metadata: {
                session_id: this.sessionId,
                characters_typed: extraData?.keystrokes ?? 0,
                ...(diffData?.diff && { diff: diffData.diff })
            }
        };
        this.buffer.push(activity);
        console.log(`[EventBuffer] Added ${eventType} event. Buffer size: ${this.buffer.length}`, {
            keystrokes: activity.keystrokes,
            lines_added: activity.lines_added,
            lines_removed: activity.lines_removed,
            hasDiff: !!diffData?.diff
        });
        if (this.buffer.length >= this.batchSize) {
            console.log('[EventBuffer] Buffer full, flushing...');
            this.flush();
        }
    }
    async flush() {
        if (!this.buffer.length) {
            console.log('[EventBuffer] Nothing to flush');
            return;
        }
        const batch = this.buffer.splice(0);
        const endpoint = `${this.apiUrl}/api/coding-activities/batch`;
        console.log(`[EventBuffer] Flushing ${batch.length} events to ${endpoint}`);
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${this.apiToken}`
                },
                body: JSON.stringify({ activities: batch })
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            const result = await response.json();
            console.log(`[EventBuffer] Successfully flushed ${batch.length} events:`, result);
            // Show success notification (optional)
            vscode.window.setStatusBarMessage(`✓ Synced ${batch.length} activities`, 3000);
        }
        catch (err) {
            console.error('[EventBuffer] Flush failed:', err);
            // Re-queue events on failure
            this.buffer.unshift(...batch);
            // Show error notification
            vscode.window.showErrorMessage(`Failed to sync activities: ${err}`);
        }
    }
    setDiffService(diffService) {
        this.diffService = diffService;
        console.log('[EventBuffer] DiffService updated:', !!diffService);
    }
    stop() {
        console.log('[EventBuffer] Stopping and flushing remaining events');
        if (this.timer)
            clearInterval(this.timer);
        this.flush();
    }
}
exports.EventBuffer = EventBuffer;
//# sourceMappingURL=buffer.js.map