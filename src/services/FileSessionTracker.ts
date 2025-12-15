import * as vscode from 'vscode';
import { EventBuffer } from '../buffer';
import { DiffService } from './DiffService';

interface FileSession {
  filePath: string;
  language: string;
  startTime: Date;
  lastActivityTime: Date;
  lastCheckpointTime: Date;
  accumulatedDurationSeconds: number; // Track actual active time in current checkpoint period
  metrics: {
    keystrokes: number;
    linesAdded: number;
    linesRemoved: number;
    clicks: number;
  };
  checkpointCount: number;
}

export class FileSessionTracker {
  private activeSessions: Map<string, FileSession> = new Map();
  private idleCheckTimer?: NodeJS.Timeout;
  private checkpointTimer?: NodeJS.Timeout;

  // Configuration
  private readonly idleTimeoutMs = 10 * 1000; // 10 seconds idle = pause timer
  private readonly sessionEndTimeoutMs = 5 * 60 * 1000; // 5 minutes idle = session end
  private readonly checkpointIntervalMs = 5 * 60 * 1000; // 5 minutes between checkpoints
  private readonly idleCheckIntervalMs = 1 * 1000; // Check for idle sessions every second
  private readonly MAX_SESSIONS = 50; // Prevent memory leak

  constructor(
    private buffer: EventBuffer,
    private diffService: DiffService | null
  ) {
  }

  start() {
    // Periodically check for idle sessions
    this.idleCheckTimer = setInterval(() => {
      this.checkIdleSessions();
    }, this.idleCheckIntervalMs);

    // Periodically checkpoint all active sessions
    this.checkpointTimer = setInterval(() => {
      this.checkpointAllSessions();
    }, this.checkpointIntervalMs);
  }

  /**
   * Record activity for a file (called by EventListener)
   */
  recordActivity(
    filePath: string,
    language: string,
    activityData: {
      keystrokes?: number;
      linesAdded?: number;
      linesRemoved?: number;
      clicks?: number;
    }
  ) {
    const now = new Date();
    let session = this.activeSessions.get(filePath);

    if (!session) {
      // Enforce session limit to prevent memory leak
      if (this.activeSessions.size >= this.MAX_SESSIONS) {
        const oldestSession = this.findOldestIdleSession();
        if (oldestSession) {
          this.endSession(oldestSession);
        }
      }

      // Start new session
      session = {
        filePath,
        language,
        startTime: now,
        lastActivityTime: now,
        lastCheckpointTime: now,
        accumulatedDurationSeconds: 0,
        metrics: {
          keystrokes: 0,
          linesAdded: 0,
          linesRemoved: 0,
          clicks: 0
        },
        checkpointCount: 0
      };
      this.activeSessions.set(filePath, session);
    } else {
      // Update accumulated duration (time since last activity)
      const timeSinceLastActivity = (now.getTime() - session.lastActivityTime.getTime()) / 1000;

      // Only accumulate time if activity was recent (within 10 second idle timeout)
      // This ensures we only count active coding time, not idle time
      if (timeSinceLastActivity < this.idleTimeoutMs / 1000) {
        session.accumulatedDurationSeconds += timeSinceLastActivity;
      }
      // If more than 10 seconds have passed, duration pauses (we don't accumulate)
    }

    // Update metrics
    session.metrics.keystrokes += activityData.keystrokes || 0;
    session.metrics.linesAdded += activityData.linesAdded || 0;
    session.metrics.linesRemoved += activityData.linesRemoved || 0;
    session.metrics.clicks += activityData.clicks || 0;
    session.lastActivityTime = now;

    // Check if checkpoint needed (every 5 minutes)
    const timeSinceCheckpoint = now.getTime() - session.lastCheckpointTime.getTime();
    if (timeSinceCheckpoint >= this.checkpointIntervalMs) {
      this.checkpointSession(filePath, false); // false = not final
    }
  }

  /**
   * Explicitly end a session (e.g., when file closes or user switches files)
   */
  endSession(filePath: string) {
    const session = this.activeSessions.get(filePath);
    if (!session) return;

    this.checkpointSession(filePath, true); // true = final checkpoint
    this.activeSessions.delete(filePath);
  }

  /**
   * End all active sessions (e.g., on extension deactivation)
   */
  endAllSessions() {
    for (const filePath of this.activeSessions.keys()) {
      this.endSession(filePath);
    }
  }

  /**
   * Check for idle sessions and end them
   */
  private checkIdleSessions() {
    const now = new Date().getTime();
    const idleSessions: string[] = [];

    for (const [filePath, session] of this.activeSessions.entries()) {
      const idleTime = now - session.lastActivityTime.getTime();
      if (idleTime >= this.sessionEndTimeoutMs) {
        idleSessions.push(filePath);
      }
    }

    if (idleSessions.length > 0) {
      idleSessions.forEach(filePath => this.endSession(filePath));
    }
  }

  /**
   * Checkpoint all active sessions
   */
  private checkpointAllSessions() {
    const now = new Date().getTime();

    for (const [filePath, session] of this.activeSessions.entries()) {
      const timeSinceCheckpoint = now - session.lastCheckpointTime.getTime();

      // Only checkpoint if there's been activity and it's time
      if (timeSinceCheckpoint >= this.checkpointIntervalMs &&
          (session.metrics.keystrokes > 0 || session.metrics.clicks > 0)) {
        this.checkpointSession(filePath, false);
      }
    }
  }

  /**
   * Create a checkpoint for a session and send to buffer
   */
  private checkpointSession(filePath: string, isFinal: boolean) {
    const session = this.activeSessions.get(filePath);
    if (!session) return;

    // Skip if no activity since last checkpoint
    if (session.metrics.keystrokes === 0 &&
        session.metrics.linesAdded === 0 &&
        session.metrics.linesRemoved === 0 &&
        session.metrics.clicks === 0) {
      return;
    }

    // Use accumulated duration (actual active time) instead of total session time
    const durationSeconds = Math.max(1, Math.round(session.accumulatedDurationSeconds));

    // Send activity to buffer with explicit duration
    this.buffer.add('typing', {
      keystrokes: session.metrics.keystrokes,
      lines_added: session.metrics.linesAdded,
      lines_removed: session.metrics.linesRemoved,
      clicks: session.metrics.clicks,
      duration_seconds: durationSeconds
    });

    // Reset metrics AND duration for next checkpoint period (but keep session alive)
    if (!isFinal) {
      session.metrics.keystrokes = 0;
      session.metrics.linesAdded = 0;
      session.metrics.linesRemoved = 0;
      session.metrics.clicks = 0;
      session.accumulatedDurationSeconds = 0; // Reset duration for next checkpoint
      session.lastCheckpointTime = new Date();
      session.checkpointCount++;
    }
  }

  /**
   * Handle file switch - end session for old file, prepare for new file
   */
  onFileSwitch(oldFilePath: string | null, newFilePath: string) {
    if (oldFilePath && oldFilePath !== newFilePath) {
      this.endSession(oldFilePath);
    }
    // New session will be created automatically on first activity
  }

  /**
   * Get active session count (for debugging/monitoring)
   */
  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }

  /**
   * Check if there's been recent activity (within idle timeout)
   * Used by status bar to determine active/idle status
   */
  hasRecentActivity(): boolean {
    const now = new Date().getTime();

    for (const session of this.activeSessions.values()) {
      const timeSinceActivity = now - session.lastActivityTime.getTime();

      if (timeSinceActivity < this.idleTimeoutMs) {
        return true;
      }
    }

    return false;
  }

  /**
   * Find the oldest idle session for removal when limit is reached
   */
  private findOldestIdleSession(): string | null {
    let oldestPath: string | null = null;
    let oldestTime = Infinity;

    for (const [filePath, session] of this.activeSessions.entries()) {
      if (session.lastActivityTime.getTime() < oldestTime) {
        oldestTime = session.lastActivityTime.getTime();
        oldestPath = filePath;
      }
    }

    return oldestPath;
  }

  stop() {
    if (this.idleCheckTimer) clearInterval(this.idleCheckTimer);
    if (this.checkpointTimer) clearInterval(this.checkpointTimer);
    this.endAllSessions();
  }
}
