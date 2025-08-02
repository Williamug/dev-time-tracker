import * as vscode from 'vscode';
import { MetricsPayload, CodeMetrics, ProjectMetrics, HealthMetrics, ProductivityMetrics, CodeQualityMetrics } from './Metrics';
import { IMetricsCollector } from './IMetricsCollector';

export class ExtendedMetricsCollector implements IMetricsCollector {
  private static instance: ExtendedMetricsCollector;
  private baseCollector: IMetricsCollector;
  private initialized: boolean = false;

  private constructor(baseCollector: IMetricsCollector) {
    this.baseCollector = baseCollector;
    this.initialized = true;
  }

  public static getInstance(baseCollector: IMetricsCollector): ExtendedMetricsCollector {
    if (!ExtendedMetricsCollector.instance) {
      ExtendedMetricsCollector.instance = new ExtendedMetricsCollector(baseCollector);
    }
    return ExtendedMetricsCollector.instance;
  }

  // Delegate all base collector methods
  public getMetrics(): Partial<MetricsPayload> {
    return this.baseCollector.getMetrics();
  }

  public updateMetrics(updates: Partial<MetricsPayload>): void {
    this.baseCollector.updateMetrics(updates);
  }

  public addUpdateListener(listener: (metrics: Partial<MetricsPayload>) => void): void {
    this.baseCollector.addUpdateListener(listener);
  }

  // Implement IMetricsCollector methods with proper type safety
  public getInitialCodeMetrics(): CodeMetrics {
    return this.baseCollector.getInitialCodeMetrics();
  }

  public getInitialProjectMetrics(): ProjectMetrics {
    return this.baseCollector.getInitialProjectMetrics();
  }

  public getInitialHealthMetrics(): HealthMetrics {
    return this.baseCollector.getInitialHealthMetrics();
  }

  public getInitialProductivityMetrics(): ProductivityMetrics {
    return this.baseCollector.getInitialProductivityMetrics();
  }

  public getInitialQualityMetrics(): CodeQualityMetrics {
    return this.baseCollector.getInitialQualityMetrics();
  }

  public recordEdit(filePath: string, data: {
    language: string;
    lineCount: number;
    charCount: number;
    changes: number;
    timestamp: number;
  }): void {
    if (!this.initialized) return;
    
    const metrics = this.getMetrics();
    const fileExtension = filePath.split('.').pop() || '';
    
    // Initialize metrics if needed
    if (!metrics.code) {
      metrics.code = this.getInitialCodeMetrics();
    }
    
    // Update file type metrics
    if (fileExtension && metrics.code) {
      metrics.code.fileTypes[fileExtension] = (metrics.code.fileTypes[fileExtension] || 0) + 1;
      metrics.code.files.modified = (metrics.code.files.modified || 0) + 1;
      
      // Update line counts
      metrics.code.lines = metrics.code.lines || { added: 0, removed: 0, total: 0 };
      metrics.code.lines.added = (metrics.code.lines.added || 0) + data.changes;
      metrics.code.lines.total = (metrics.code.lines.total || 0) + data.changes;
      
      this.updateMetrics(metrics);
    }
  }

  public recordView(filePath: string, data: {
    language: string;
    lineCount: number;
    charCount: number;
    timestamp: number;
  }) {
    // Track file views in project metrics
    const metrics = this.getMetrics();
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
    const projectName = workspaceFolder?.name || 'Unknown';
    
    if (!metrics.project) {
      metrics.project = this.getInitialProjectMetrics();
    }
    
    // Initialize project if it doesn't exist
    if (!metrics.project.projects[projectName]) {
      metrics.project.projects[projectName] = {
        timeSpent: 0,
        lastActive: new Date(),
        fileTypes: {}
      };
    }
    
    // Update project metrics
    const project = metrics.project.projects[projectName];
    project.lastActive = new Date();
    project.fileTypes[data.language] = (project.fileTypes[data.language] || 0) + 1;
    
    this.updateMetrics(metrics);
  }

  public recordFileOperation(operation: 'create' | 'delete' | 'rename', filePath: string, oldPath?: string) {
    const metrics = this.getMetrics();
    
    if (!metrics.code) {
      metrics.code = this.getInitialCodeMetrics();
    }
    
    switch (operation) {
      case 'create':
        metrics.code.files.created = (metrics.code.files.created || 0) + 1;
        break;
      case 'delete':
        metrics.code.files.deleted = (metrics.code.files.deleted || 0) + 1;
        break;
      case 'rename':
        // For renames, we just treat as a delete + create for now
        metrics.code.files.deleted = (metrics.code.files.deleted || 0) + 1;
        metrics.code.files.created = (metrics.code.files.created || 0) + 1;
        break;
    }
    
    this.updateMetrics(metrics);
  }

  public updateFromBackend(remoteMetrics: Partial<MetricsPayload>) {
    const currentMetrics = this.getMetrics();
    this.updateMetrics({
      ...currentMetrics,
      ...remoteMetrics,
      timestamp: new Date()
    });
  }

  // Implement missing methods from IMetricsCollector
  public peekMetrics(): Partial<MetricsPayload> {
    return this.baseCollector.getMetrics();
  }

  public recordChange(filePath: string, data: { 
    language: string; 
    changes: number; 
    timestamp: number 
  }): void {
    if (!this.initialized) return;
    
    const metrics = this.getMetrics();
    const fileExtension = filePath.split('.').pop() || '';
    
    // Initialize metrics if needed
    if (!metrics.code) {
      metrics.code = this.getInitialCodeMetrics();
    }
    
    // Update file type metrics
    if (fileExtension && metrics.code) {
      metrics.code.fileTypes = metrics.code.fileTypes || {};
      metrics.code.fileTypes[fileExtension] = (metrics.code.fileTypes[fileExtension] || 0) + 1;
      
      // Initialize files if needed
      if (!metrics.code.files) {
        metrics.code.files = { modified: 0, created: 0, deleted: 0 };
      }
      
      // Update modified files count
      metrics.code.files.modified = (metrics.code.files.modified || 0) + 1;
      
      this.updateMetrics(metrics);
    }
  }

  public clearMetrics(): void {
    // Reset to initial state
    const initialMetrics: Partial<MetricsPayload> = {
      code: this.getInitialCodeMetrics(),
      productivity: this.getInitialProductivityMetrics(),
      project: this.getInitialProjectMetrics(),
      health: this.getInitialHealthMetrics(),
      quality: this.getInitialQualityMetrics(),
      timestamp: new Date()
    };
    
    this.updateMetrics(initialMetrics);
  }

  public pauseTracking(): void {
    if (typeof this.baseCollector.pauseTracking === 'function') {
      this.baseCollector.pauseTracking();
    }
  }

  public resumeTracking(): void {
    if (typeof this.baseCollector.resumeTracking === 'function') {
      this.baseCollector.resumeTracking();
    }
  }
}

// Note: The ExtendedMetricsCollector should be instantiated with a base collector
// Example usage in your application:
// const baseCollector = MetricsCollector.getInstance();
// const extendedCollector = ExtendedMetricsCollector.getInstance(baseCollector);
