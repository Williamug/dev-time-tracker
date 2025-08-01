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
exports.GitService = void 0;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const Metrics_1 = require("../models/Metrics");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class GitService {
    static instance;
    metricsCollector = Metrics_1.MetricsCollector.getInstance();
    disposables = [];
    isEnabled = true;
    lastCommitHash = null;
    constructor() {
        this.initialize();
    }
    static getInstance() {
        if (!GitService.instance) {
            GitService.instance = new GitService();
        }
        return GitService.instance;
    }
    async initialize() {
        // Check if Git is installed and accessible
        try {
            await this.checkGitInstallation();
            this.setupEventListeners();
            this.startPolling();
        }
        catch (error) {
            console.warn('[GitService] Git is not available:', error);
            this.isEnabled = false;
        }
    }
    async checkGitInstallation() {
        try {
            await execAsync('git --version');
            return true;
        }
        catch (error) {
            throw new Error('Git is not installed or not in PATH');
        }
    }
    setupEventListeners() {
        // Watch for repository changes
        this.disposables.push(vscode.workspace.onDidSaveTextDocument(() => {
            this.checkForNewCommits().catch(console.error);
        }), vscode.workspace.onDidChangeWorkspaceFolders(() => {
            this.checkForNewCommits().catch(console.error);
        }));
    }
    startPolling(interval = 30000) {
        // Check for new commits periodically
        setInterval(() => {
            this.checkForNewCommits().catch(console.error);
        }, interval);
    }
    async checkForNewCommits() {
        if (!this.isEnabled)
            return;
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders)
                return;
            for (const folder of workspaceFolders) {
                const repoPath = folder.uri.fsPath;
                const commits = await this.getRecentCommits(repoPath);
                if (commits.length > 0 && commits[0].hash !== this.lastCommitHash) {
                    this.lastCommitHash = commits[0].hash;
                    this.updateMetrics(commits[0]);
                }
            }
        }
        catch (error) {
            console.error('[GitService] Error checking for new commits:', error);
        }
    }
    async getRecentCommits(repoPath, limit = 1) {
        try {
            // Get commit details including changed files
            const { stdout } = await execAsync(`git -C "${repoPath}" log --pretty=format:'%H|%an|%ad|%s' --numstat -n ${limit} --date=iso`);
            return this.parseGitLog(stdout);
        }
        catch (error) {
            console.error(`[GitService] Error getting commits for ${repoPath}:`, error);
            return [];
        }
    }
    parseGitLog(log) {
        const commits = [];
        const lines = log.trim().split('\n');
        let currentCommit = {};
        let parsingFiles = false;
        const changedFiles = [];
        let added = 0;
        let deleted = 0;
        for (const line of lines) {
            if (line.includes('|') && !parsingFiles) {
                // This is a commit header line
                const [hash, author, date, ...messageParts] = line.split('|');
                currentCommit = {
                    hash: hash.trim(),
                    author: author.trim(),
                    date: date.trim(),
                    message: messageParts.join('|').trim(),
                    changes: {
                        added: 0,
                        deleted: 0,
                        files: []
                    }
                };
                parsingFiles = true;
            }
            else if (line.trim() === '' && parsingFiles) {
                // Empty line after file changes
                if (currentCommit.hash) {
                    commits.push({
                        ...currentCommit,
                        changes: {
                            added,
                            deleted,
                            files: changedFiles
                        }
                    });
                }
                parsingFiles = false;
                added = 0;
                deleted = 0;
                changedFiles.length = 0;
            }
            else if (parsingFiles && line.trim() !== '') {
                // This is a file change line
                const [add, del, file] = line.trim().split(/\s+/);
                if (file) {
                    added += parseInt(add, 10) || 0;
                    deleted += parseInt(del, 10) || 0;
                    changedFiles.push(file);
                }
            }
        }
        return commits;
    }
    updateMetrics(commit) {
        const metrics = this.metricsCollector.getMetrics();
        // Update code metrics
        if (metrics.code) {
            this.metricsCollector.updateMetrics({
                code: {
                    ...metrics.code,
                    lines: {
                        ...metrics.code.lines,
                        added: (metrics.code.lines.added || 0) + commit.changes.added,
                        removed: (metrics.code.lines.removed || 0) + commit.changes.deleted,
                        total: (metrics.code.lines.total || 0) + commit.changes.added - commit.changes.deleted
                    },
                    files: {
                        ...metrics.code.files,
                        modified: (metrics.code.files.modified || 0) + commit.changes.files.length
                    }
                }
            });
        }
    }
    dispose() {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
    async getCurrentBranch(repoPath) {
        try {
            const { stdout } = await execAsync(`git -C "${repoPath}" rev-parse --abbrev-ref HEAD`);
            return stdout.trim();
        }
        catch (error) {
            console.error('[GitService] Error getting current branch:', error);
            return null;
        }
    }
}
exports.GitService = GitService;
//# sourceMappingURL=GitService.js.map