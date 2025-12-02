import * as vscode from 'vscode';
import { EventBuffer } from './buffer';

export class EventListener {
  private disposables: vscode.Disposable[] = [];
  private typingTimer?: NodeJS.Timeout;
  private readonly typingDebounceMs = 1000; // 1 second debounce for typing events

  // Track metrics during typing session
  private currentSessionKeystrokes = 0;
  private currentSessionLinesAdded = 0;
  private currentSessionLinesRemoved = 0;

  constructor(
    private context: vscode.ExtensionContext,
    private buffer: EventBuffer,
    private sessionId: string
  ) {}

  start() {
    console.log('[EventListener] Starting event listeners');

    // Track typing events with debouncing
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
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
            } else if (oldLineCount > newLineCount) {
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
      })
    );

    // Track file save events
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((document) => {
        console.log('[EventListener] File saved:', document.fileName);
        this.buffer.add('file_save');
      })
    );

    // Track file open events
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((document) => {
        // Ignore untitled and output documents
        if (document.uri.scheme === 'file') {
          console.log('[EventListener] File opened:', document.fileName);
          this.buffer.add('file_open');
        }
      })
    );

    // Track file close events
    this.disposables.push(
      vscode.workspace.onDidCloseTextDocument((document) => {
        if (document.uri.scheme === 'file') {
          console.log('[EventListener] File closed:', document.fileName);
          this.buffer.add('file_close');
        }
      })
    );

    // Track active editor changes
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          console.log('[EventListener] Active editor changed:', editor.document.fileName);
          this.buffer.add('file_open');
        }
      })
    );

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
