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
exports.ExtendedMetricsCollector = void 0;
const vscode = __importStar(require("vscode"));
class ExtendedMetricsCollector {
    static instance;
    baseCollector;
    initialized = false;
    constructor(baseCollector) {
        this.baseCollector = baseCollector;
        this.initialized = true;
    }
    static getInstance(baseCollector) {
        if (!ExtendedMetricsCollector.instance) {
            ExtendedMetricsCollector.instance = new ExtendedMetricsCollector(baseCollector);
        }
        return ExtendedMetricsCollector.instance;
    }
    // Delegate all base collector methods
    getMetrics() {
        return this.baseCollector.getMetrics();
    }
    updateMetrics(updates) {
        this.baseCollector.updateMetrics(updates);
    }
    addUpdateListener(listener) {
        this.baseCollector.addUpdateListener(listener);
    }
    // Implement IMetricsCollector methods with proper type safety
    getInitialCodeMetrics() {
        return this.baseCollector.getInitialCodeMetrics();
    }
    getInitialProjectMetrics() {
        return this.baseCollector.getInitialProjectMetrics();
    }
    getInitialHealthMetrics() {
        return this.baseCollector.getInitialHealthMetrics();
    }
    getInitialProductivityMetrics() {
        return this.baseCollector.getInitialProductivityMetrics();
    }
    getInitialQualityMetrics() {
        return this.baseCollector.getInitialQualityMetrics();
    }
    recordEdit(filePath, data) {
        if (!this.initialized)
            return;
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
    recordView(filePath, data) {
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
    recordFileOperation(operation, filePath, oldPath) {
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
    updateFromBackend(remoteMetrics) {
        const currentMetrics = this.getMetrics();
        this.updateMetrics({
            ...currentMetrics,
            ...remoteMetrics,
            timestamp: new Date()
        });
    }
    // Implement missing methods from IMetricsCollector
    peekMetrics() {
        return this.baseCollector.getMetrics();
    }
    recordChange(filePath, data) {
        if (!this.initialized)
            return;
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
    clearMetrics() {
        // Reset to initial state
        const initialMetrics = {
            code: this.getInitialCodeMetrics(),
            productivity: this.getInitialProductivityMetrics(),
            project: this.getInitialProjectMetrics(),
            health: this.getInitialHealthMetrics(),
            quality: this.getInitialQualityMetrics(),
            timestamp: new Date()
        };
        this.updateMetrics(initialMetrics);
    }
    pauseTracking() {
        if (typeof this.baseCollector.pauseTracking === 'function') {
            this.baseCollector.pauseTracking();
        }
    }
    resumeTracking() {
        if (typeof this.baseCollector.resumeTracking === 'function') {
            this.baseCollector.resumeTracking();
        }
    }
}
exports.ExtendedMetricsCollector = ExtendedMetricsCollector;
// Note: The ExtendedMetricsCollector should be instantiated with a base collector
// Example usage in your application:
// const baseCollector = MetricsCollector.getInstance();
// const extendedCollector = ExtendedMetricsCollector.getInstance(baseCollector);
//# sourceMappingURL=ExtendedMetricsCollector.js.map