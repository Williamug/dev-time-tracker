// Mock vscode API for testing
const vscode = {
  // Mock ExtensionContext
  ExtensionContext: class {
    subscriptions = [];
    workspaceState = {
      get: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };
    globalState = {
      get: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };
  },
  
  // Mock window
  window: {
    activeTextEditor: null,
    onDidChangeActiveTextEditor: jest.fn(),
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showErrorMessage: jest.fn(),
  },
  
  // Mock commands
  commands: {
    registerCommand: jest.fn(),
    executeCommand: jest.fn(),
  },
  
  // Mock workspace
  workspace: {
    onDidSaveTextDocument: jest.fn(),
    onDidChangeTextDocument: jest.fn(),
    onDidOpenTextDocument: jest.fn(),
    onDidCloseTextDocument: jest.fn(),
  },
  
  // Mock StatusBarItem
  StatusBarItem: class {
    text = '';
    tooltip = '';
    command = '';
    show = jest.fn();
    hide = jest.fn();
  },
  
  // Mock StatusBarAlignment
  StatusBarAlignment: {
    Left: 1,
    Right: 2,
  },
  
  // Mock EventEmitter
  EventEmitter: class {
    event = jest.fn();
    fire = jest.fn();
    dispose = jest.fn();
  },
  
  // Mock Disposable
  Disposable: class {
    static from() {
      return new this();
    }
    constructor() {}
    dispose() {}
  },
};

module.exports = vscode;
