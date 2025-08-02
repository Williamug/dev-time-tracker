import { MetricsPayload, CodeMetrics, ProjectMetrics, HealthMetrics, ProductivityMetrics, CodeQualityMetrics } from './Metrics';

export interface IMetricsCollector {
  // Core metrics methods
  getMetrics(): Partial<MetricsPayload>;
  peekMetrics(): Partial<MetricsPayload>; // Get metrics without resetting
  updateMetrics(updates: Partial<MetricsPayload>): void;
  addUpdateListener(listener: (metrics: Partial<MetricsPayload>) => void): void;
  
  // Event recording methods
  recordEdit(filePath: string, data: {
    language: string;
    lineCount: number;
    charCount: number;
    changes: number;
    timestamp: number;
  }): void;
  
  recordChange(filePath: string, data: {
    language: string;
    changes: number;
    timestamp: number;
  }): void;
  
  recordView(filePath: string, data: {
    language: string;
    lineCount: number;
    charCount: number;
    timestamp: number;
  }): void;
  
  recordFileOperation(operation: 'create' | 'delete' | 'rename', filePath: string, oldPath?: string): void;
  updateFromBackend(remoteMetrics: Partial<MetricsPayload>): void;
  
  // Helper methods for metrics initialization
  getInitialCodeMetrics(): CodeMetrics;
  getInitialProjectMetrics(): ProjectMetrics;
  getInitialHealthMetrics(): HealthMetrics;
  getInitialProductivityMetrics(): ProductivityMetrics;
  getInitialQualityMetrics(): CodeQualityMetrics;
  
  // Batch processing support
  clearMetrics(): void; // Clear collected metrics without sending
  
  // Idle state management
  pauseTracking(): void; // Pause metrics collection
  resumeTracking(): void; // Resume metrics collection
}
