import * as vscode from 'vscode';
import { CustomReminderService } from '../src/services/CustomReminderService';
import { IMetricsProvider } from '../src/models/IMetricsProvider';

// Mock the metrics provider
class MockMetricsProvider implements IMetricsProvider {
  getTypingStats() {
    return { speed: 50, accuracy: 98 };
  }
  
  getCurrentSessionDuration() {
    return 300; // 5 minutes in seconds
  }
  
  getActiveDocumentLanguage() {
    return 'typescript';
  }
}

describe('CustomReminderService with Metrics Integration', () => {
  let mockContext: vscode.ExtensionContext;
  let mockMetricsProvider: IMetricsProvider;
  
  beforeEach(() => {
    // Reset the singleton instance before each test
    if (CustomReminderService['resetInstance']) {
      CustomReminderService['resetInstance']();
    }
    
    // Create a mock extension context
    mockContext = {
      globalState: {
        get: jest.fn().mockReturnValue([]), // Return empty array for reminders
        update: jest.fn().mockResolvedValue(undefined),
      },
      subscriptions: [],
    } as unknown as vscode.ExtensionContext;
    
    // Create a mock metrics provider
    mockMetricsProvider = new MockMetricsProvider();
  });
  
  afterEach(() => {
    // Clean up after each test
    if (CustomReminderService['resetInstance']) {
      CustomReminderService['resetInstance']();
    }
  });
  
  it('should be created with default metrics provider', () => {
    const service = CustomReminderService.getInstance(mockContext);
    expect(service).toBeInstanceOf(CustomReminderService);
  });
  
  it('should use provided metrics provider', () => {
    const service = CustomReminderService.getInstance(mockContext, mockMetricsProvider);
    
    // Verify the service is using our mock metrics provider
    const typingStats = service.getTypingStats();
    expect(typingStats.speed).toBe(50);
    expect(typingStats.accuracy).toBe(98);
    
    const sessionDuration = service.getCurrentSessionDuration();
    expect(sessionDuration).toBe(300);
    
    const language = service.getActiveDocumentLanguage();
    expect(language).toBe('typescript');
  });
  
  it('should handle missing metrics provider', () => {
    // @ts-ignore - Testing with undefined metrics provider
    const service = CustomReminderService.getInstance(mockContext, undefined);
    
    // Should return default values when no metrics provider is available
    const typingStats = service.getTypingStats();
    expect(typingStats.speed).toBe(0);
    expect(typingStats.accuracy).toBe(100);
    
    const sessionDuration = service.getCurrentSessionDuration();
    expect(sessionDuration).toBe(0);
    
    const language = service.getActiveDocumentLanguage();
    expect(language).toBeUndefined();
  });
});
