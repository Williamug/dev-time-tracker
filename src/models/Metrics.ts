import * as vscode from 'vscode';
import { IMetricsCollector } from './IMetricsCollector';

export interface CodeMetrics {
  lines: {
    added: number;
    removed: number;
    total: number;
  };
  files: {
    modified: number;
    created: number;
    deleted: number;
  };
  fileTypes: Record<string, number>; // { '.ts': 125, '.js': 80 }
  complexity: {
    max: number;
    average: number;
  };
}

export interface ProductivityMetrics {
  focusTime: number; // in minutes
  distractedTime: number;
  productiveHours: Record<string, number>; // { '09': 45, '10': 30, ... }
  dailyGoals: {
    target: number;
    current: number;
    streak: number;
  };
}

export interface ProjectMetrics {
  currentProject: string;
  projects: Record<string, {
    timeSpent: number;
    lastActive: Date;
    fileTypes: Record<string, number>;
  }>;
}

export interface HealthMetrics {
  lastBreak: Date;
  breakReminders: boolean;
  typingStats: {
    speed: number; // WPM
    accuracy: number; // %
    heatmap: Record<string, number>; // Hourly typing density
  };
  postureReminders: boolean;
  eyeStrainReminders: boolean;
}

export interface CodeQualityMetrics {
  lintErrors: number;
  testCoverage: number; // %
  testPassRate: number; // %
  codeReviewTime: number; // in minutes
  techDebt: number; // 1-10 scale
}

export interface MetricsPayload {
  timestamp: Date;
  sessionId: string;
  userId: string;
  code: CodeMetrics;
  productivity: ProductivityMetrics;
  project: ProjectMetrics;
  health: HealthMetrics;
  quality: CodeQualityMetrics;
  environment: {
    os: string;
    vscodeVersion: string;
    extensionVersion: string;
  };
}

export class MetricsCollector implements IMetricsCollector {
  protected static instance: MetricsCollector;
  protected metrics: Partial<MetricsPayload> = {};
  protected updateListeners: Array<(metrics: Partial<MetricsPayload>) => void> = [];

  // Implement IMetricsCollector interface methods
  recordEdit(filePath: string, data: { language: string; lineCount: number; charCount: number; changes: number; timestamp: number; }): void {
    // Default implementation does nothing
  }

  recordView(filePath: string, data: { language: string; lineCount: number; charCount: number; timestamp: number; }): void {
    // Default implementation does nothing
  }

  recordFileOperation(operation: 'create' | 'delete' | 'rename', filePath: string, oldPath?: string): void {
    // Default implementation does nothing
  }

  updateFromBackend(remoteMetrics: Partial<MetricsPayload>): void {
    // Default implementation does nothing
  }

  protected isPaused: boolean = false;
  protected lastActiveTime: Date | null = null;
  protected totalPausedTime: number = 0;
  protected pauseStartTime: number | null = null;

  protected constructor() {
    this.initializeMetrics();
  }

  public static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  // Get metrics without resetting
  public peekMetrics(): Partial<MetricsPayload> {
    return { ...this.metrics };
  }

  // Record a document change
  public recordChange(filePath: string, data: { language: string; changes: number; timestamp: number }): void {
    if (!this.metrics.code) return;
    
    // Initialize fileTypes if needed
    if (!this.metrics.code.fileTypes) {
      this.metrics.code = { ...this.metrics.code, fileTypes: {} };
    }
    
    // Update file type count
    const ext = filePath.split('.').pop() || '';
    if (ext) {
      const fileTypes = { ...this.metrics.code.fileTypes };
      fileTypes[`.${ext}`] = (fileTypes[`.${ext}`] || 0) + 1;
      this.metrics.code = { ...this.metrics.code, fileTypes };
    }
    
    // Update modified files count
    if (!this.metrics.code.files) {
      this.metrics.code = { ...this.metrics.code, files: { modified: 0, created: 0, deleted: 0 } };
    }
    
    const files = { ...this.metrics.code.files };
    files.modified = (files.modified || 0) + 1;
    this.metrics.code = { ...this.metrics.code, files };
    
    this.notifyListeners();
  }

  // Clear collected metrics without sending
  public clearMetrics(): void {
    this.initializeMetrics();
    this.totalPausedTime = 0;
    this.pauseStartTime = null;
    this.lastActiveTime = null;
  }

  public pauseTracking(): void {
    if (!this.isPaused) {
      this.isPaused = true;
      this.pauseStartTime = Date.now();
      console.log('Metrics tracking paused');
    }
  }

  public resumeTracking(): void {
    if (this.isPaused && this.pauseStartTime) {
      this.isPaused = false;
      const pauseDuration = Date.now() - this.pauseStartTime;
      this.totalPausedTime += pauseDuration;
      this.pauseStartTime = null;
      this.lastActiveTime = new Date();
      console.log(`Metrics tracking resumed after ${pauseDuration}ms pause`);
    }
  }

  protected initializeMetrics() {
    this.metrics = {
      timestamp: new Date(),
      sessionId: vscode.env.sessionId,
      userId: vscode.env.machineId,
      environment: {
        os: process.platform,
        vscodeVersion: vscode.version,
        extensionVersion: vscode.extensions.getExtension('williamug.dev-time-tracker')?.packageJSON?.version || '0.0.0'
      },
      code: this.getInitialCodeMetrics(),
      productivity: this.getInitialProductivityMetrics(),
      project: this.getInitialProjectMetrics(),
      health: this.getInitialHealthMetrics(),
      quality: this.getInitialQualityMetrics()
    };
    this.notifyListeners();
  }

  // ... (Helper methods for initializing metrics)
  
  public updateMetrics(updates: Partial<MetricsPayload>) {
    this.metrics = { ...this.metrics, ...updates, timestamp: new Date() };
    this.notifyListeners();
  }

  public getMetrics(): Partial<MetricsPayload> {
    return { ...this.metrics };
  }

  public addUpdateListener(listener: (metrics: Partial<MetricsPayload>) => void) {
    this.updateListeners.push(listener);
  }

  protected notifyListeners() {
    this.updateListeners.forEach(listener => listener(this.getMetrics()));
  }

  protected generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  public getInitialCodeMetrics(): CodeMetrics {
    return {
      lines: { added: 0, removed: 0, total: 0 },
      files: { modified: 0, created: 0, deleted: 0 },
      fileTypes: {},
      complexity: { max: 0, average: 0 }
    };
  }

  public getInitialProductivityMetrics(): ProductivityMetrics {
    return {
      focusTime: 0,
      distractedTime: 0,
      productiveHours: {},
      dailyGoals: { target: 240, current: 0, streak: 0 } // 4 hours default target
    };
  }

  public getInitialProjectMetrics(): ProjectMetrics {
    return {
      currentProject: '',
      projects: {}
    };
  }

  public getInitialHealthMetrics(): HealthMetrics {
    return {
      lastBreak: new Date(),
      breakReminders: true,
      typingStats: { speed: 0, accuracy: 100, heatmap: {} },
      postureReminders: true,
      eyeStrainReminders: true
    };
  }

  public getInitialQualityMetrics(): CodeQualityMetrics {
    return {
      lintErrors: 0,
      testCoverage: 0,
      testPassRate: 0,
      codeReviewTime: 0,
      techDebt: 0
    };
  }
}
