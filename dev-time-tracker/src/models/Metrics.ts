import * as vscode from 'vscode';

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

export class MetricsCollector {
  private static instance: MetricsCollector;
  private metrics: Partial<MetricsPayload> = {};
  private updateListeners: Array<(metrics: Partial<MetricsPayload>) => void> = [];

  private constructor() {
    this.initializeMetrics();
  }

  public static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  private initializeMetrics() {
    this.metrics = {
      timestamp: new Date(),
      sessionId: this.generateSessionId(),
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

  private notifyListeners() {
    this.updateListeners.forEach(listener => listener(this.getMetrics()));
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getInitialCodeMetrics(): CodeMetrics {
    return {
      lines: { added: 0, removed: 0, total: 0 },
      files: { modified: 0, created: 0, deleted: 0 },
      fileTypes: {},
      complexity: { max: 0, average: 0 }
    };
  }

  private getInitialProductivityMetrics(): ProductivityMetrics {
    return {
      focusTime: 0,
      distractedTime: 0,
      productiveHours: {},
      dailyGoals: { target: 240, current: 0, streak: 0 } // 4 hours default target
    };
  }

  private getInitialProjectMetrics(): ProjectMetrics {
    return {
      currentProject: '',
      projects: {}
    };
  }

  private getInitialHealthMetrics(): HealthMetrics {
    return {
      lastBreak: new Date(),
      breakReminders: true,
      typingStats: { speed: 0, accuracy: 100, heatmap: {} },
      postureReminders: true,
      eyeStrainReminders: true
    };
  }

  private getInitialQualityMetrics(): CodeQualityMetrics {
    return {
      lintErrors: 0,
      testCoverage: 0,
      testPassRate: 0,
      codeReviewTime: 0,
      techDebt: 0
    };
  }
}
