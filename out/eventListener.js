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
exports.EventListener = void 0;
const vscode = __importStar(require("vscode"));
class EventListener {
    context;
    buffer;
    sessionId;
    disposables = [];
    typingTimer;
    typingDebounceMs = 1000; // 1 second debounce for typing events
    // Track metrics during typing session
    currentSessionKeystrokes = 0;
    currentSessionLinesAdded = 0;
    currentSessionLinesRemoved = 0;
    constructor(context, buffer, sessionId) {
        this.context = context;
        this.buffer = buffer;
        this.sessionId = sessionId;
    }
    start() {
        console.log('[EventListener] Starting event listeners');
        // Track typing events with debouncing
        this.disposables.push(vscode.workspace.onDidChangeTextDocument((event) => {
            if (event.contentChanges.length > 0) {
                // Calculate metrics from content changes
                event.contentChanges.forEach(change => {
                    // Count keystrokes (characters added)
                    if (change.text.length > 0) {
                        this.currentSessionKeystrokes += change.text.length;
                    }
                    // Count lines added/removed
                    const oldLineCount = change.rangeLength > 0 ?
                        (change.range.end.line - change.range.start.line + 1) : 0;
                    const newLineCount = change.text.split('\n').length;
                    if (newLineCount > oldLineCount) {
                        this.currentSessionLinesAdded += (newLineCount - oldLineCount);
                    }
                    else if (oldLineCount > newLineCount) {
                        this.currentSessionLinesRemoved += (oldLineCount - newLineCount);
                    }
                });
                // Clear existing timer
                if (this.typingTimer) {
                    clearTimeout(this.typingTimer);
                }
                // Set new timer to track typing after user stops
                this.typingTimer = setTimeout(() => {
                    this.buffer.add('typing', {
                        keystrokes: this.currentSessionKeystrokes,
                        lines_added: this.currentSessionLinesAdded,
                        lines_removed: this.currentSessionLinesRemoved
                    });
                    // Reset session metrics
                    this.currentSessionKeystrokes = 0;
                    this.currentSessionLinesAdded = 0;
                    this.currentSessionLinesRemoved = 0;
                }, this.typingDebounceMs);
            }
        }));
        // Track file save events
        this.disposables.push(vscode.workspace.onDidSaveTextDocument((document) => {
            console.log('[EventListener] File saved:', document.fileName);
            this.buffer.add('file_save');
        }));
        // Track file open events
        this.disposables.push(vscode.workspace.onDidOpenTextDocument((document) => {
            // Ignore untitled and output documents
            if (document.uri.scheme === 'file') {
                console.log('[EventListener] File opened:', document.fileName);
                this.buffer.add('file_open');
            }
        }));
        // Track file close events
        this.disposables.push(vscode.workspace.onDidCloseTextDocument((document) => {
            if (document.uri.scheme === 'file') {
                console.log('[EventListener] File closed:', document.fileName);
                this.buffer.add('file_close');
            }
        }));
        // Track active editor changes
        this.disposables.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                console.log('[EventListener] Active editor changed:', editor.document.fileName);
                this.buffer.add('file_open');
            }
        }));
        // Optional: Track mouse movement (be careful with this - can generate many events)
        // Uncomment if you want to track mouse activity
        /*
        let lastMouseMove = 0;
        const mouseMoveThrottle = 5000; // Only track every 5 seconds
    
        this.disposables.push(
          vscode.window.onDidChangeTextEditorSelection(() => {
            const now = Date.now();
            if (now - lastMouseMove > mouseMoveThrottle) {
              lastMouseMove = now;
              this.buffer.add('mousemove');
            }
          })
        );
        */
        console.log('[EventListener] All event listeners registered');
    }
    stop() {
        console.log('[EventListener] Stopping event listeners');
        // Clear typing timer
        if (this.typingTimer) {
            clearTimeout(this.typingTimer);
        }
        // Dispose all event listeners
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
    dispose() {
        this.stop();
    }
}
exports.EventListener = EventListener;
//# sourceMappingURL=eventListener.js.map