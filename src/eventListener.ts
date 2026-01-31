import * as vscode from 'vscode';
import { EventBuffer } from './buffer';
import { FileSessionTracker } from './services/FileSessionTracker';

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
    private sessionId: string,
    private fileSessionTracker?: FileSessionTracker
  ) {}

  start() {
    // Track typing events with debouncing
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.contentChanges.length > 0) {
          // Immediately mark activity for status bar idle detection
          const editor = vscode.window.activeTextEditor;
          if (editor && this.fileSessionTracker) {
            this.fileSessionTracker.markActivity(
              editor.document.uri.fsPath,
              editor.document.languageId
            );
          }

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
            const editor = vscode.window.activeTextEditor;
            if (editor && this.fileSessionTracker) {
              // Feed metrics to FileSessionTracker instead of directly to buffer
              this.fileSessionTracker.recordActivity(
                editor.document.uri.fsPath,
                editor.document.languageId,
                {
                  keystrokes: this.currentSessionKeystrokes,
                  linesAdded: this.currentSessionLinesAdded,
                  linesRemoved: this.currentSessionLinesRemoved
                }
              );
            }

            // Reset session metrics
            this.currentSessionKeystrokes = 0;
            this.currentSessionLinesAdded = 0;
            this.currentSessionLinesRemoved = 0;
          }, this.typingDebounceMs);
        }
      })
    );

    // Track selection changes (cursor movement, clicks, keyboard navigation)
    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection((event) => {
        const editor = event.textEditor;
        if (editor && this.fileSessionTracker) {
          // Mark activity immediately for responsive idle/active status
          this.fileSessionTracker.markActivity(
            editor.document.uri.fsPath,
            editor.document.languageId
          );
        }
      })
    );

    // Track file switches to end sessions
    if (this.fileSessionTracker) {
      let previousFile: string | undefined;

      this.disposables.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
          if (previousFile && previousFile !== editor?.document.uri.fsPath) {
            // User switched files, end the previous session
            this.fileSessionTracker?.endSession(previousFile);
          }
          previousFile = editor?.document.uri.fsPath;
        })
      );

      // Track file closures
      this.disposables.push(
        vscode.workspace.onDidCloseTextDocument((document) => {
          this.fileSessionTracker?.endSession(document.uri.fsPath);
        })
      );
    }
  }

  stop() {

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
