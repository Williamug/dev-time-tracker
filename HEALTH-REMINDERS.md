# Health Reminders Configuration

This document outlines the configuration options for the health reminders in the Dev Time Tracker extension.

## Break Reminders

- **breakReminderInterval**: `number` (default: `3600`)
  - Time in seconds between break reminders (0 to disable)
  - Example: `1800` for 30 minutes, `3600` for 1 hour

- **breakReminderEnabled**: `boolean` (default: `true`)
  - Enable/disable break reminders

- **breakSnoozeDuration**: `number` (default: `900`)
  - Time in seconds to snooze break reminders
  - Example: `600` for 10 minutes

- **breakNotificationType**: `string` (default: `"warning"`)
  - Type of notification to show for break reminders
  - Options: `"info"`, `"warning"`, `"error"`, `"none"`

- **breakEnableSound**: `boolean` (default: `true`)
  - Enable sound for break reminders

## Posture Reminders

- **postureReminderInterval**: `number` (default: `1800`)
  - Time in seconds between posture reminders (0 to disable)
  - Example: `1800` for 30 minutes

- **postureReminderEnabled**: `boolean` (default: `true`)
  - Enable/disable posture check reminders

- **postureSnoozeDuration**: `number` (default: `900`)
  - Time in seconds to snooze posture reminders
  - Example: `1200` for 20 minutes

- **postureNotificationType**: `string` (default: `"info"`)
  - Type of notification to show for posture reminders
  - Options: `"info"`, `"warning"`, `"error"`, `"none"`

- **postureEnableSound**: `boolean` (default: `true`)
  - Enable sound for posture reminders

## Eye Strain Prevention

- **eyeStrainInterval**: `number` (default: `1200`)
  - Time in seconds between eye strain prevention reminders (0 to disable)
  - Example: `1200` for 20 minutes

- **eyeStrainEnabled**: `boolean` (default: `true`)
  - Enable/disable eye strain prevention reminders

- **eyeStrainSnoozeDuration**: `number` (default: `600`)
  - Time in seconds to snooze eye strain reminders
  - Example: `600` for 10 minutes

- **eyeStrainNotificationType**: `string` (default: `"info"`)
  - Type of notification to show for eye strain reminders
  - Options: `"info"`, `"warning"`, `"error"`, `"none"`

- **eyeStrainEnableSound**: `boolean` (default: `true`)
  - Enable sound for eye strain reminders

## Example Configuration

```json
{
  "devtimetracker.health": {
    "breakReminderInterval": 3600,
    "breakSnoozeDuration": 600,
    "breakNotificationType": "warning",
    "breakEnableSound": true,
    
    "postureReminderInterval": 1800,
    "postureSnoozeDuration": 900,
    "postureNotificationType": "info",
    "postureEnableSound": true,
    
    "eyeStrainInterval": 1200,
    "eyeStrainSnoozeDuration": 600,
    "eyeStrainNotificationType": "info",
    "eyeStrainEnableSound": true
  }
}
```

## Features

- **Snooze**: Temporarily pause reminders for a configurable duration
- **Disable for Today**: Pause all reminders until midnight
- **Custom Notifications**: Choose different notification types and sounds
- **Detailed Messages**: Helpful tips and suggestions in each reminder
- **Status Bar Integration**: Quick access to timers and status

## Tips

- Set different intervals for different types of reminders based on your workflow
- Use the "Disable for Today" option during meetings or focused work sessions
- Customize notification types to prioritize different types of reminders
- Adjust snooze durations to match your work rhythm
