# Dev Time Tracker

A VS Code extension that tracks your development time, provides productivity insights, and helps maintain healthy coding habits.

## Features

### Time Tracking
- Automatic tracking of coding sessions
- Real-time status bar updates
- Daily/weekly/monthly statistics
- Project-based time tracking

### Productivity Insights
- Most productive hours analysis
- Coding streak tracking
- Git integration for commit statistics
- Code metrics (lines added/removed, file types)

### Health & Wellness
- Break reminders to prevent burnout
- Eye strain prevention notifications
- Posture reminders
- Customizable work/break intervals

### Rich Notifications
- Card-style notifications with animations
- Configurable sound alerts
- Progress bars for timed notifications
- Multiple action buttons
- Accessible design

## Requirements

- Visual Studio Code 1.75.0 or higher
- Node.js 16.x or higher
- Git (for commit statistics)

## Extension Settings

### Time Tracking
<!-- "devTimeTracker.apiUrl": "https://your-api-url.com", -->
Access analytics dashboard at https://dev-time-tracker.vercel.app/
```json
"devTimeTracker.apiToken": "your-api-token",
"devTimeTracker.trackingInterval": 60000,
"devTimeTracker.idleTimeout": 300000
```

### Notification Settings
```json
"devTimeTracker.notifications.enabled": true,
"devTimeTracker.notifications.sounds": true,
"devTimeTracker.notifications.volume": 0.5,
"devTimeTracker.notifications.position": "top-right"
```

### Health Reminders
```json
"devTimeTracker.health.breakReminderInterval": 3600000,
"devTimeTracker.health.eyeStrainReminderInterval": 1800000,
"devTimeTracker.health.postureReminderInterval": 2700000,
"devTimeTracker.health.breakDuration": 300000
```

## Usage

### Basic Commands
- `Dev Time Tracker: Start/Stop Tracking` - Toggle time tracking
- `Dev Time Tracker: Show Dashboard` - Open the analytics dashboard
- `Dev Time Tracker: Configure` - Open extension settings

### Status Bar Items
- Activity indicator (green when active, gray when idle)
- Current session duration
- Today's total coding time
- Pomodoro timer (if enabled)

### Notification System
The notification system provides rich, interactive alerts:

1. **Visual Feedback**
   - Color-coded by type (info, success, warning, error)
   - Smooth animations for entry/exit
   - Progress bars for time-based notifications

2. **Audio Feedback**
   - Distinct sounds for different notification types
   - Customizable volume and enable/disable
   - Synthesized sounds (no external files needed)

3. **Interactive Elements**
   - Primary and secondary action buttons
   - Dismiss button
   - Progress indicators

## Known Issues
- Audio notifications may be affected by system sound settings
- Some metrics require Git repository initialization
- Webview-based dashboard may have performance impact on older machines

## Release Notes

### 1.0.0
Initial release with core time tracking features

### 1.1.0
- Added health and wellness reminders
- Implemented rich notification system
- Added status bar integration
- Git integration for commit statistics

### 1.2.0
- Added Pomodoro timer
- Enhanced notification animations
- Improved audio feedback
- Added project switching detection

---

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
