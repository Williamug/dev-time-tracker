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

## Extension Settings

### Time Tracking
<!-- "devTimeTracker.apiUrl": "https://your-api-url.com", -->
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
