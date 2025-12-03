import * as vscode from 'vscode';

interface FileDiffState {
  previousContent: string;
  currentContent: string;
  linesAdded: number;
  linesRemoved: number;
  changes: DiffChange[];
}

interface DiffChange {
  type: 'add' | 'remove' | 'modify';
  lineNumber: number;
  content: string;
  oldContent?: string;
}

export class DiffService {
  private fileStates: Map<string, FileDiffState> = new Map();
  private disposables: vscode.Disposable[] = [];

  start() {
    console.log('[DiffService] Starting diff tracking');

    // Initialize current document states
    vscode.workspace.textDocuments.forEach(doc => {
      if (doc.uri.scheme === 'file') {
        this.initializeDocument(doc);
      }
    });

    // Track document changes
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.scheme === 'file' && event.contentChanges.length > 0) {
          this.handleDocumentChange(event);
        }
      })
    );

    // Track document opens
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((doc) => {
        if (doc.uri.scheme === 'file') {
          this.initializeDocument(doc);
        }
      })
    );

    // Clean up on document close
    this.disposables.push(
      vscode.workspace.onDidCloseTextDocument((doc) => {
        this.fileStates.delete(doc.uri.fsPath);
      })
    );
  }

  private initializeDocument(document: vscode.TextDocument) {
    const filePath = document.uri.fsPath;
    const content = document.getText();

    this.fileStates.set(filePath, {
      previousContent: content,
      currentContent: content,
      linesAdded: 0,
      linesRemoved: 0,
      changes: []
    });
  }

  private handleDocumentChange(event: vscode.TextDocumentChangeEvent) {
    const filePath = event.document.uri.fsPath;
    let state = this.fileStates.get(filePath);

    if (!state) {
      this.initializeDocument(event.document);
      state = this.fileStates.get(filePath)!;
    }

    const changes: DiffChange[] = [];
    let linesAdded = 0;
    let linesRemoved = 0;

    event.contentChanges.forEach(change => {
      const oldText = change.rangeLength > 0 ?
        state!.currentContent.substring(
          event.document.offsetAt(change.range.start),
          event.document.offsetAt(change.range.end)
        ) : '';

      const newText = change.text;

      // Count line changes
      const oldLineCount = oldText.split('\n').length - (oldText ? 0 : 1);
      const newLineCount = newText.split('\n').length - (newText ? 0 : 1);

      if (newLineCount > oldLineCount) {
        linesAdded += (newLineCount - oldLineCount);
      } else if (oldLineCount > newLineCount) {
        linesRemoved += (oldLineCount - newLineCount);
      }

      // Track the change
      if (change.rangeLength > 0 && newText.length > 0) {
        // Modification
        changes.push({
          type: 'modify',
          lineNumber: change.range.start.line + 1,
          content: newText,
          oldContent: oldText
        });
      } else if (change.rangeLength > 0) {
        // Deletion
        changes.push({
          type: 'remove',
          lineNumber: change.range.start.line + 1,
          content: oldText
        });
      } else if (newText.length > 0) {
        // Addition
        changes.push({
          type: 'add',
          lineNumber: change.range.start.line + 1,
          content: newText
        });
      }
    });

    // Update state
    state.currentContent = event.document.getText();
    state.linesAdded += linesAdded;
    state.linesRemoved += linesRemoved;
    state.changes.push(...changes);
  }

  /**
   * Get accumulated diff for a file and reset the state
   */
  getDiffAndReset(filePath: string): {
    linesAdded: number;
    linesRemoved: number;
    diff: string;
  } | null {
    const state = this.fileStates.get(filePath);
    if (!state) {
      console.log('[DiffService] No state found for file:', filePath);
      return null;
    }

    // If no line changes at all, return null
    if (state.linesAdded === 0 && state.linesRemoved === 0 && state.changes.length === 0) {
      console.log('[DiffService] No changes at all for file:', filePath);
      return null;
    }

    // Generate unified diff format (may be empty if no detailed changes)
    const diff = state.changes.length > 0 ? this.generateUnifiedDiff(state) : '';

    // Get stats
    const result = {
      linesAdded: state.linesAdded,
      linesRemoved: state.linesRemoved,
      diff
    };

    console.log('[DiffService] Generated diff for:', filePath, {
      linesAdded: result.linesAdded,
      linesRemoved: result.linesRemoved,
      diffLength: diff.length,
      changesCount: state.changes.length,
      hasDetailedChanges: state.changes.length > 0
    });

    // Reset state for next period
    state.previousContent = state.currentContent;
    state.linesAdded = 0;
    state.linesRemoved = 0;
    state.changes = [];

    return result;
  }

  private generateUnifiedDiff(state: FileDiffState): string {
    const lines: string[] = [];

    if (state.changes.length === 0) {
      return '';
    }

    // Group changes by line number for better readability
    const changesByLine = new Map<number, DiffChange[]>();
    state.changes.forEach(change => {
      if (!changesByLine.has(change.lineNumber)) {
        changesByLine.set(change.lineNumber, []);
      }
      changesByLine.get(change.lineNumber)!.push(change);
    });

    // Sort by line number
    const sortedLines = Array.from(changesByLine.keys()).sort((a, b) => a - b);

    const hunks: string[][] = [];
    let currentHunkChanges: string[] = [];
    let currentHunkStart = 0;

    for (const lineNumber of sortedLines) {
      const lineChanges = changesByLine.get(lineNumber)!;

      // Start a new hunk if needed
      if (currentHunkChanges.length === 0 || lineNumber > currentHunkStart + currentHunkChanges.length + 3) {
        if (currentHunkChanges.length > 0) {
          hunks.push(currentHunkChanges);
          currentHunkChanges = [];
        }

        currentHunkStart = lineNumber;
        currentHunkChanges.push(`@@ -${lineNumber},${lineChanges.length} +${lineNumber},${lineChanges.length} @@`);
      }

      // Add the changes
      for (const change of lineChanges) {
        const contentLines = change.content.split('\n').filter(l => l !== '');

        if (change.type === 'add') {
          for (const line of contentLines) {
            currentHunkChanges.push(`+${line}`);
          }
        } else if (change.type === 'remove') {
          for (const line of contentLines) {
            currentHunkChanges.push(`-${line}`);
          }
        } else if (change.type === 'modify') {
          // Show as remove + add
          const oldLines = (change.oldContent || '').split('\n').filter(l => l !== '');
          for (const line of oldLines) {
            currentHunkChanges.push(`-${line}`);
          }
          for (const line of contentLines) {
            currentHunkChanges.push(`+${line}`);
          }
        }
      }
    }

    // Add final hunk
    if (currentHunkChanges.length > 0) {
      hunks.push(currentHunkChanges);
    }

    // Join all hunks with empty lines between them
    return hunks.map(hunk => hunk.join('\n')).join('\n\n');
  }

  /**
   * Get current diff stats without resetting
   */
  getCurrentStats(filePath: string): {
    linesAdded: number;
    linesRemoved: number;
  } | null {
    const state = this.fileStates.get(filePath);
    if (!state) {
      return null;
    }

    return {
      linesAdded: state.linesAdded,
      linesRemoved: state.linesRemoved
    };
  }

  dispose() {
    this.disposables.forEach(d => d.dispose());
    this.fileStates.clear();
  }
}
