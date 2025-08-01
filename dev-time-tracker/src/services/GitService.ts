import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { MetricsCollector } from '../models/Metrics';

const execAsync = promisify(exec);

interface GitCommit {
  hash: string;
  author: string;
  date: string;
  message: string;
  changes: {
    added: number;
    deleted: number;
    files: string[];
  };
}

export class GitService {
  private static instance: GitService;
  private metricsCollector = MetricsCollector.getInstance();
  private disposables: vscode.Disposable[] = [];
  private isEnabled = true;
  private lastCommitHash: string | null = null;

  private constructor() {
    this.initialize();
  }

  public static getInstance(): GitService {
    if (!GitService.instance) {
      GitService.instance = new GitService();
    }
    return GitService.instance;
  }

  private async initialize() {
    // Check if Git is installed and accessible
    try {
      await this.checkGitInstallation();
      this.setupEventListeners();
      this.startPolling();
    } catch (error) {
      console.warn('[GitService] Git is not available:', error);
      this.isEnabled = false;
    }
  }

  private async checkGitInstallation(): Promise<boolean> {
    try {
      await execAsync('git --version');
      return true;
    } catch (error) {
      throw new Error('Git is not installed or not in PATH');
    }
  }

  private setupEventListeners() {
    // Watch for repository changes
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument(() => {
        this.checkForNewCommits().catch(console.error);
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.checkForNewCommits().catch(console.error);
      })
    );
  }

  private startPolling(interval = 30000) {
    // Check for new commits periodically
    setInterval(() => {
      this.checkForNewCommits().catch(console.error);
    }, interval);
  }

  public async checkForNewCommits(): Promise<void> {
    if (!this.isEnabled) return;

    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) return;

      for (const folder of workspaceFolders) {
        const repoPath = folder.uri.fsPath;
        const commits = await this.getRecentCommits(repoPath);
        
        if (commits.length > 0 && commits[0].hash !== this.lastCommitHash) {
          this.lastCommitHash = commits[0].hash;
          this.updateMetrics(commits[0]);
        }
      }
    } catch (error) {
      console.error('[GitService] Error checking for new commits:', error);
    }
  }

  private async getRecentCommits(repoPath: string, limit = 1): Promise<GitCommit[]> {
    try {
      // Get commit details including changed files
      const { stdout } = await execAsync(
        `git -C "${repoPath}" log --pretty=format:'%H|%an|%ad|%s' --numstat -n ${limit} --date=iso`
      );

      return this.parseGitLog(stdout);
    } catch (error) {
      console.error(`[GitService] Error getting commits for ${repoPath}:`, error);
      return [];
    }
  }

  private parseGitLog(log: string): GitCommit[] {
    const commits: GitCommit[] = [];
    const lines = log.trim().split('\n');
    let currentCommit: Partial<GitCommit> = {};
    let parsingFiles = false;
    const changedFiles: string[] = [];
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
      } else if (line.trim() === '' && parsingFiles) {
        // Empty line after file changes
        if (currentCommit.hash) {
          commits.push({
            ...currentCommit as GitCommit,
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
      } else if (parsingFiles && line.trim() !== '') {
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

  private updateMetrics(commit: GitCommit) {
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

  public dispose() {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }

  public async getCurrentBranch(repoPath: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync(`git -C "${repoPath}" rev-parse --abbrev-ref HEAD`);
      return stdout.trim();
    } catch (error) {
      console.error('[GitService] Error getting current branch:', error);
      return null;
    }
  }
}
