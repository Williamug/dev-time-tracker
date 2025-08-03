# Dev Time Tracker

Dev Time Tracker is an extension that helps developers track their productivity while coding. It tracks time spent on projects, provides insights into code quality, and offers health-related reminders to maintain a healthy work-life balance.

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
- Git (for commit statistics)

## Backend Integration

The extension can integrate with a backend service for data persistence and synchronization across devices. The backend service provides:

- Session data storage
- Metrics aggregation
- Cross-device synchronization
- Team features (coming soon)

### Backend Configuration

To enable backend integration, add these settings to your VS Code settings (JSON):

<!-- ```json
"devtimetracker.apiUrl": "https://your-api-url.com",
"devtimetracker.apiToken": "your-api-token-here"
``` -->

### Time Tracking

```json
"devtimetracker.trackingInterval": 60000,
"devtimetracker.idleTimeout": 300000,
"devtimetracker.enableOfflineMode": true
```

### Notification Settings

```json
"devtimetracker.notifications.enabled": true,
"devtimetracker.notifications.sounds": true,
"devtimetracker.notifications.volume": 0.5,
"devtimetracker.notifications.position": "statusBar"
```

> **Note:** The notification system now primarily uses the status bar for non-intrusive reminders. Popup notifications are disabled by default.

### Health & Wellness Configuration

#### Break Reminders
```json
"devtimetracker.health.breakReminderEnabled": true,
"devtimetracker.health.breakReminderInterval": 3600,  // in seconds (60 minutes)
"devtimetracker.health.breakReminderType": "info",    // "info" | "warning" | "error" | "none"
"devtimetracker.health.breakEnableSound": true,
"devtimetracker.health.breakSnoozeDuration": 900,     // in seconds (15 minutes)
"devtimetracker.health.breakSnoozeEnabled": true
```

#### Eye Strain Prevention
```json
"devtimetracker.health.eyeStrainEnabled": true,
"devtimetracker.health.eyeStrainInterval": 1200,      // in seconds (20 minutes)
"devtimetracker.health.eyeStrainNotificationType": "warning",  // "info" | "warning" | "error" | "none"
"devtimetracker.health.eyeStrainEnableSound": true,
"devtimetracker.health.eyeStrainSnoozeDuration": 600  // in seconds (10 minutes)
```

#### Posture Reminders
```json
"devtimetracker.health.postureReminderEnabled": true,
"devtimetracker.health.postureReminderInterval": 1800,  // in seconds (30 minutes)
"devtimetracker.health.postureNotificationType": "warning",  // "info" | "warning" | "error" | "none"
"devtimetracker.health.postureEnableSound": true,
"devtimetracker.health.postureSnoozeDuration": 900  // in seconds (15 minutes)
```

#### Notification Sounds
```json
"devtimetracker.health.breakReminderSound": true,
"devtimetracker.health.breakReminderSoundFile": "default",
"devtimetracker.health.breakReminderSoundVolume": 0.5,
"devtimetracker.health.breakSnoozeSound": true,
"devtimetracker.health.breakSnoozeSoundFile": "default",
"devtimetracker.health.breakSnoozeSoundVolume": 0.5,
"devtimetracker.health.eyeStrainNotificationSound": true
```

**Note:** All time intervals are specified in seconds. To convert to minutes, divide by 60 (e.g., 1200 seconds = 20 minutes).

## Troubleshooting

### Health Reminders Not Showing

If health reminders are not appearing in the status bar:

1. **Check Extension Logs**:
   - Open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P)
   - Run "Developer: Open Extension Logs"
   - Look for errors related to HealthService or HealthStatusBar

2. **Verify Configuration**:
   - Ensure health reminders are enabled in settings:
     ```json
     "devtimetracker.health.breakReminderEnabled": true,
     "devtimetracker.health.postureReminderEnabled": true,
     "devtimetracker.health.eyeStrainEnabled": true
     ```

3. **Check Status Bar Space**:
   - The status bar has limited space
   - Try collapsing other status bar items
   - Check if reminders appear when you click the status bar area

### Backend Connection Issues

If you experience issues with the backend connection:

1. **Verify API Configuration**:
   - Check that `devtimetracker.apiUrl` is correctly set
   - Ensure your API token in `devtimetracker.apiToken` is valid

2. **Check Network Connectivity**:
   - Verify you can access the API URL from your machine
   - Check for any firewall or proxy issues

3. **Inspect Console Logs**:
   - Open Developer Tools (Help > Toggle Developer Tools)
   - Check the Console tab for network or authentication errors

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

### Author
William Asaba

Email: [asabawilliam@gmail.com](mailto:asabawilliam@gmail.com)

GitHub: [williamug](https://github.com/williamug)

LinkedIn: [william-asaba](https://www.linkedin.com/in/asaba-william-006aa1106/)



### License
This extension is licensed under the [MIT License](/dev-time-tracker/LICENSE).
