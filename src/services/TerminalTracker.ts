import * as vscode from 'vscode';
import { EventBuffer } from '../buffer';

/**
 * Tracks terminal activity in VS Code.
 *
 * LIMITATIONS:
 * - VS Code API does NOT expose terminal input (commands typed) for security reasons
 * - We can only track: terminal focus time, creation/closure events, and approximate activity
 * - Cannot capture actual commands, keystrokes, or terminal output
 */
export class TerminalTracker {
  private disposables: vscode.Disposable[] = [];
  private activeTerminal?: vscode.Terminal;
  private terminalStartTime?: Date;
  private activityTimer?: NodeJS.Timeout;
  private readonly inactivityThresholdMs = 3000; // 3 seconds of inactivity
  private lastActivityTime?: Date;

  constructor(
    private buffer: EventBuffer,
    private fileSessionTracker?: any // Optional: for status bar updates
  ) {}

  start() {

    // Track when terminal becomes active
    this.disposables.push(
      vscode.window.onDidChangeActiveTerminal((terminal) => {
        if (terminal) {
          this.onTerminalActivated(terminal);
        } else {
          this.onTerminalDeactivated();
        }
      })
    );

    // Track terminal state changes (opened, closed, etc.)
    this.disposables.push(
      vscode.window.onDidChangeTerminalState((terminal) => {
        // Record activity when terminal state changes (user interaction indicator)
        this.recordTerminalActivity();
      })
    );

    // Track terminal creation
    this.disposables.push(
      vscode.window.onDidOpenTerminal((terminal) => {
        this.onTerminalActivated(terminal);
      })
    );

    // Track terminal closure
    this.disposables.push(
      vscode.window.onDidCloseTerminal((terminal) => {
        if (this.activeTerminal === terminal) {
          this.onTerminalDeactivated();
        }
      })
    );

    // If there's already an active terminal, start tracking it
    if (vscode.window.activeTerminal) {
      this.onTerminalActivated(vscode.window.activeTerminal);
    }
  }

  private onTerminalActivated(terminal: vscode.Terminal) {
    // End previous terminal session if switching
    if (this.activeTerminal && this.activeTerminal !== terminal) {
      this.endTerminalSession();
    }

    this.activeTerminal = terminal;
    this.terminalStartTime = new Date();
    this.lastActivityTime = new Date();

    // Start activity monitoring
    this.startActivityMonitoring();
  }

  private onTerminalDeactivated() {
    if (this.activeTerminal) {
      this.endTerminalSession();
    }
  }

  private startActivityMonitoring() {
    // Clear existing timer
    if (this.activityTimer) {
      clearInterval(this.activityTimer);
    }

    // Check for activity every second
    this.activityTimer = setInterval(() => {
      if (!this.lastActivityTime || !this.terminalStartTime) {
        return;
      }

      const now = new Date();
      const timeSinceLastActivity = now.getTime() - this.lastActivityTime.getTime();

      // If inactive for too long, end the session
      if (timeSinceLastActivity >= this.inactivityThresholdMs) {
        this.endTerminalSession();
      }
    }, 1000);
  }

  private recordTerminalActivity() {
    this.lastActivityTime = new Date();

    // Update FileSessionTracker status if available (for status bar)
    if (this.fileSessionTracker && typeof this.fileSessionTracker.recordActivity === 'function') {
      // Notify that there's terminal activity (keeps status as "Active")
      // This is a workaround since we track terminal separately
    }
  }

  private endTerminalSession() {
    if (!this.activeTerminal || !this.terminalStartTime) {
      return;
    }

    const endTime = new Date();
    const durationSeconds = Math.floor((endTime.getTime() - this.terminalStartTime.getTime()) / 1000);

    // Only record if session was at least 1 second
    if (durationSeconds >= 1) {

      // Send terminal activity to buffer
      this.buffer.add('terminal_activity', {
        terminal_name: this.activeTerminal.name,
        duration_seconds: durationSeconds,
        // Note: We cannot capture actual commands due to VS Code API limitations
      });
    }

    // Clear state
    this.activeTerminal = undefined;
    this.terminalStartTime = undefined;
    this.lastActivityTime = undefined;

    if (this.activityTimer) {
      clearInterval(this.activityTimer);
      this.activityTimer = undefined;
    }
  }

  /**
   * Manually record activity (can be called from external activity detectors)
   */
  public notifyActivity() {
    if (vscode.window.activeTerminal) {
      this.recordTerminalActivity();
    }
  }

  stop() {

    // End current session
    this.endTerminalSession();

    // Clear timer
    if (this.activityTimer) {
      clearInterval(this.activityTimer);
      this.activityTimer = undefined;
    }

    // Dispose event listeners
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }

  dispose() {
    this.stop();
  }
}
