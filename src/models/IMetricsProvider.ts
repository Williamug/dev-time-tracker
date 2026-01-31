/**
 * Provides access to various metrics that can be used by other services
 * like the CustomReminderService to create intelligent reminders.
 */
export interface IMetricsProvider {
  /**
   * Gets the current typing statistics
   * @returns Object containing typing speed (WPM) and accuracy percentage
   */
  getTypingStats(): { speed: number; accuracy: number };

  /**
   * Gets the duration of the current coding session in seconds
   */
  getCurrentSessionDuration(): number;

  /**
   * Gets the language ID of the currently active document
   * @returns Language ID string (e.g., 'typescript', 'javascript') or undefined if no document is active
   */
  getActiveDocumentLanguage(): string | undefined;
}

/**
 * Default implementation of IMetricsProvider that returns neutral/default values
 */
export class DefaultMetricsProvider implements IMetricsProvider {
  getTypingStats() {
    return { speed: 0, accuracy: 100 };
  }

  getCurrentSessionDuration() {
    return 0;
  }

  getActiveDocumentLanguage() {
    return undefined;
  }
}
