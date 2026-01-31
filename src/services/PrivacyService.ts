import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as path from 'path';

/**
 * Privacy levels for data protection
 */
export enum PrivacyLevel {
  /** Strip paths to basename only, hash project names (default) */
  PARTIAL = 'partial',
  /** Hash everything - file paths and project names (maximum privacy) */
  STRICT = 'strict',
  /** Future: Full encryption (not yet implemented) */
  FULL = 'full'
}

/**
 * Service for handling privacy-sensitive data sanitization
 *
 * Privacy Levels:
 * - PARTIAL: Strips paths, keeps filename, hashes projects
 * - STRICT: Hashes everything (filenames + projects) - RECOMMENDED
 * - FULL: Future encryption support
 */
export class PrivacyService {
  private static instance: PrivacyService;
  private privacyLevel: PrivacyLevel = PrivacyLevel.STRICT; // Default to maximum privacy

  private constructor() {
    this.loadSettings();
  }

  public static getInstance(): PrivacyService {
    if (!PrivacyService.instance) {
      PrivacyService.instance = new PrivacyService();
    }
    return PrivacyService.instance;
  }

  /**
   * Load privacy settings from VS Code configuration
   */
  private loadSettings(): void {
    const config = vscode.workspace.getConfiguration('devtimetracker');
    const level = config.get<string>('privacy.level', 'strict');

    // Support partial, strict, or full
    if (level === 'partial') {
      this.privacyLevel = PrivacyLevel.PARTIAL;
    } else if (level === 'full') {
      this.privacyLevel = PrivacyLevel.FULL;
    } else {
      // Default to STRICT for maximum privacy
      this.privacyLevel = PrivacyLevel.STRICT;
    }
  }

  /**
   * Update privacy level setting
   */
  public setPrivacyLevel(level: PrivacyLevel): void {
    this.privacyLevel = level;
  }

  /**
   * Get current privacy level
   */
  public getPrivacyLevel(): PrivacyLevel {
    return this.privacyLevel;
  }

  /**
   * Sanitize file path based on privacy level
   *
   * Examples:
   * - STRICT: "/home/user/client-acme/payment.php" → "file_8f4a3b2c" (hashed)
   * - PARTIAL: "/home/user/client-acme/payment.php" → "payment.php"
   * - FULL: (Future) Encrypted path
   *
   * @param filePath - Full absolute file path
   * @returns Sanitized file path
   */
  public sanitizeFilePath(filePath: string): string {
    if (!filePath) {
      return '';
    }

    switch (this.privacyLevel) {
      case PrivacyLevel.STRICT:
        // Hash the entire file path for maximum privacy
        return this.hashFilePath(filePath);

      case PrivacyLevel.PARTIAL:
        // Return only the filename (no directory structure)
        return path.basename(filePath);

      case PrivacyLevel.FULL:
        // Future: Implement encryption
        // For now, fall back to STRICT
        return this.hashFilePath(filePath);

      default:
        return this.hashFilePath(filePath);
    }
  }

  /**
   * Sanitize project name based on privacy level
   *
   * Examples:
   * - PARTIAL: "client-acme-backend" → "project_8f4a3b2c1d5e..."
   * - FULL: (Future) Encrypted name
   *
   * @param projectName - Original project name
   * @returns Sanitized project name
   */
  public sanitizeProjectName(projectName: string): string {
    if (!projectName) {
      return 'Unknown Project';
    }

    // Always hash project names for privacy
    switch (this.privacyLevel) {
      case PrivacyLevel.PARTIAL:
        return this.hashProjectName(projectName);

      case PrivacyLevel.FULL:
        // Future: Implement encryption
        // For now, fall back to PARTIAL
        return this.hashProjectName(projectName);

      default:
        return this.hashProjectName(projectName);
    }
  }

  /**
   * Hash project name using SHA-256
   * Format: "project_<first 16 chars of hash>"
   *
   * @param projectName - Original project name
   * @returns Hashed project identifier
   */
  private hashProjectName(projectName: string): string {
    const hash = crypto
      .createHash('sha256')
      .update(projectName)
      .digest('hex')
      .substring(0, 16); // Take first 16 characters for readability

    return `project_${hash}`;
  }

  /**
   * Hash file path using SHA-256
   * Format: "file_<first 16 chars of hash>.<extension>"
   *
   * Preserves file extension for analytics while hiding sensitive filename
   *
   * @param filePath - Original file path
   * @returns Hashed file identifier with extension
   */
  private hashFilePath(filePath: string): string {
    const ext = path.extname(filePath); // Preserve extension (.php, .js, etc.)
    const hash = crypto
      .createHash('sha256')
      .update(filePath)
      .digest('hex')
      .substring(0, 16);

    return ext ? `file_${hash}${ext}` : `file_${hash}`;
  }

  /**
   * Check if a file path appears to contain sensitive information
   * Used for additional warnings/validation
   *
   * @param filePath - File path to check
   * @returns True if path contains potentially sensitive patterns
   */
  public containsSensitivePatterns(filePath: string): boolean {
    const sensitivePatterns = [
      /\/home\/[^/]+\//i,           // Home directory
      /\/Users\/[^/]+\//i,          // macOS home
      /C:\\Users\\[^\\]+\\/i,       // Windows home
      /client-/i,                   // Client projects
      /\bsecret\b/i,                // Secrets
      /\bpassword\b/i,              // Passwords
      /\bprivate\b/i,               // Private
      /\bconfidential\b/i,          // Confidential
      /\bpayment\b/i,               // Payment related
      /\bbilling\b/i,               // Billing
    ];

    return sensitivePatterns.some(pattern => pattern.test(filePath));
  }

  /**
   * Get a privacy report for debugging/transparency
   * Shows what data would be sent vs what's actually sent
   */
  public getPrivacyReport(originalPath: string, originalProject: string): {
    level: string;
    original: { path: string; project: string };
    sanitized: { path: string; project: string };
    protections: string[];
  } {
    const sanitizedPath = this.sanitizeFilePath(originalPath);
    const sanitizedProject = this.sanitizeProjectName(originalProject);

    const protections: string[] = [];

    if (originalPath !== sanitizedPath) {
      protections.push('File path stripped to basename');
    }

    if (originalProject !== sanitizedProject) {
      protections.push('Project name hashed');
    }

    if (this.containsSensitivePatterns(originalPath)) {
      protections.push('Sensitive patterns detected and removed');
    }

    return {
      level: this.privacyLevel,
      original: {
        path: originalPath,
        project: originalProject
      },
      sanitized: {
        path: sanitizedPath,
        project: sanitizedProject
      },
      protections
    };
  }
}
