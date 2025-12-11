# Terminal Activity Tracking

## Overview
The Dev Time Tracker extension now supports tracking time spent in VS Code's integrated terminal, giving you a complete picture of your development activities.

## Features

✅ **Automatic terminal activity detection**
- Tracks when you switch to/from the terminal
- Monitors terminal state changes
- Records terminal session durations

⚠️ **Privacy & Security (Important Limitations)**
- **Does NOT capture terminal commands or output** (VS Code API restriction for security)
- **Does NOT log keystrokes in terminal** (protected by VS Code)
- Only tracks **focus time** and **session duration**

## How It Works

### What Gets Tracked

1. **Terminal Focus Time**: Duration when a terminal is active
2. **Terminal Sessions**: Each time you activate a terminal, a session starts
3. **Terminal Names**: Which terminal you're using (e.g., "zsh", "bash", "powershell")
4. **Inactivity Detection**: Sessions end after 3 seconds of inactivity

### What Does NOT Get Tracked

❌ Terminal input (commands you type)
❌ Terminal output (command results)
❌ Environment variables
❌ Shell history
❌ File operations in terminal

## Data Storage

Terminal activities are stored as coding activities with:
- `file_path`: `terminal://terminal-name`
- `language`: `terminal`
- `event_type`: `typing`
- `metadata.activity_type`: `terminal`
- `metadata.terminal_name`: Actual terminal name

## Configuration

Enable/disable terminal tracking in VS Code settings:

```json
{
  "devtimetracker.tracking.enableTerminalTracking": true
}
```

Or via UI:
1. Open Settings (Ctrl/Cmd + ,)
2. Search for "Dev Time Tracker"
3. Toggle "Enable Terminal Tracking"

## Backend Support

Terminal activities appear in your dashboard alongside regular coding activities:
- Counted in total coding time
- Shown in activity timeline
- Included in project statistics
- Filtered by `language: terminal`

## Example Activity Record

```json
{
  "event_type": "typing",
  "duration": 120,
  "file_path": "terminal://zsh",
  "language": "terminal",
  "project_name": "my-project",
  "metadata": {
    "activity_type": "terminal",
    "terminal_name": "zsh"
  }
}
```

## Use Cases

**When terminal tracking is useful:**
- Running long-running commands (builds, tests, servers)
- Debugging via terminal
- Git operations via CLI
- Package installation
- SSH sessions
- Database queries

**When you might disable it:**
- You primarily use GUI tools
- You want to track only direct code editing
- You prefer separate terminal time tracking

## Performance Impact

- **Minimal**: Only tracks state changes (no polling)
- **Memory**: ~1KB per terminal session
- **CPU**: Negligible (event-driven, not interval-based)

## Privacy

Terminal tracking respects your privacy:
- No command history is captured
- No sensitive data is logged
- Only session metadata is stored
- You can disable it anytime without data loss

## Troubleshooting

**Terminal activity not showing up?**
1. Check settings: `devtimetracker.tracking.enableTerminalTracking` must be `true`
2. Ensure you're using VS Code integrated terminal (not external)
3. Activity requires at least 1 second of focus time
4. Check extension logs: View → Output → Dev Time Tracker

**Want to exclude terminal from metrics?**
1. Set `enableTerminalTracking: false` in settings
2. Or filter by `language != 'terminal'` in backend queries

## Future Enhancements

Potential improvements (if VS Code API permits):
- Detect specific terminal types (integrated, task, debug)
- Track terminal process names (running programs)
- Distinguish between SSH and local terminals
- Terminal multiplexer detection (tmux, screen)

---

**Note**: Terminal command capture would require a custom shell integration or terminal wrapper, which is beyond the scope of this extension and raises significant security/privacy concerns.
