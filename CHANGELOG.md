# Change Log

All notable changes to the "dev-time-tracker" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [2.0.7] - 2025-12-13

### Fixed
- **Dependencies**: Fixed missing `combined-stream` and related dependencies causing activation failure in Windsurf editor
  - Added `combined-stream`, `delayed-stream`, `mime-types`, and `mime-db` to package
  - Extension now activates properly in all VS Code-based editors

## [2.0.6] - 2025-12-11

### Added
- **Terminal Activity Tracking**: New feature to track time spent in integrated terminals
  - Monitors terminal focus and activity
  - Records terminal sessions with 3-second idle detection
  - Sends terminal activity data to backend as `terminal_activity` events
  - Added `devtimetracker.tracking.enableTerminalTracking` setting (enabled by default)
  - Note: Due to VS Code API limitations, only tracks terminal focus time, not actual commands (for security)

### Fixed
- **Token Authentication**: Resolved expired API token issue causing activity tracking failure
  - Improved error logging for backend connection issues
  - Better handling of authentication failures
  - Clear error messages when token is invalid

### Changed
- **Session Tracking**: Enhanced FileSessionTracker with instant idle detection (3 seconds)
  - Timer now pauses immediately when inactive
  - More accurate coding time measurement
  - 5-minute checkpoint intervals for activity submission
  - Improved session state management

### Improved
- **Code Quality**: Removed excessive debug logging for cleaner console output
  - Streamlined logs across EventListener, FileSessionTracker, and EventBuffer
  - Kept essential error logging for troubleshooting
  - Better performance with reduced console overhead

## [2.0.4] - 2025-12-11

### Fixed
- **Marketplace Publishing**: Resolved timeout issues during extension publishing
  - Optimized `.vscodeignore` to exclude unnecessary files
  - Reduced package size from 426 files to 162 files (62% reduction)
  - Package size now 1.05MB (down from larger builds)

### Changed
- **Image Handling**: Updated README images to use GitHub URLs for marketplace display
  - Fixed broken image links on VS Code Marketplace
  - Images now properly included in extension package
  - Renamed image files to remove spaces for better URL compatibility

## [1.5.4] - 2025-12-02

### Fixed
- **Settings Persistence**: Fixed issue where Pomodoro settings would revert and not reflect on status bar
  - Status bar now immediately displays new duration values when settings change
  - Fixed hardcoded initial display to use actual config values
  - Settings changes now persist correctly across sessions
  - `updatePomodoroDisplay()` now called when settings change and timer is not running

### Changed
- Improved Pomodoro status bar initialization to respect user-configured work duration from the start

## [1.5.2] - 2025-12-02

### Fixed
- **Settings Persistence**: Fixed issue where Pomodoro settings would revert and not reflect on status bar
  - Status bar now immediately displays new duration values when settings change
  - Fixed hardcoded initial display to use actual config values
  - Settings changes now persist correctly across sessions
  - `updatePomodoroDisplay()` now called when settings change and timer is not running

### Changed
- Improved Pomodoro status bar initialization to respect user-configured work duration from the start

## [1.5.2] - 2025-12-02

### Fixed
- **Pomodoro Settings**: Fixed issue where Pomodoro timer settings wouldn't update without reloading VS Code
  - Added configuration change listener to automatically reload Pomodoro settings
  - Settings now update immediately when changed
  - Option to restart current session with new settings

### Changed
- **Settings UI**: Improved Pomodoro settings for better VS Code UI experience
  - Added rich markdown descriptions with examples
  - Added maximum values for safety
  - Added proper ordering for better organization
  - Shows common duration presets in descriptions

## [1.5.1] - 2025-12-01

### Fixed
- **Health Reminders**: Fixed critical issues where notifications kept appearing even when snoozed or disabled
  - Added proper snooze state checking before showing reminders
  - Added enabled state verification in all reminder check methods
  - Fixed timer intervals (changed from 1 second testing interval to proper 60 second checks)
  - Fixed configuration loading to properly convert seconds to minutes
  - Status bar items now properly hide when reminders are disabled
  - Snooze countdown now displays correctly in status bar
- **Configuration**: Added missing snooze duration settings to package.json
  - `breakSnoozeDuration`: Default 15 minutes (900 seconds)
  - `postureSnoozeDuration`: Default 15 minutes (900 seconds)
  - `eyeStrainSnoozeDuration`: Default 10 minutes (600 seconds)
- **UX Issue**: Changed intrusive modal notifications to non-blocking notifications
  - Notifications now appear in bottom-right corner instead of modal dialogs
  - No longer splits or disrupts the editor layout
  - Users can continue working while notification is displayed

### Changed
- **Notification System**: Redesigned health reminder notifications to be non-disruptive
  - Changed from blocking modal (`modal: true`) to non-blocking notifications
  - Added quick action buttons with icons for better UX
  - Added "Disable reminder" option directly in notification
  - Improved reminder messages with detailed, helpful instructions
- Configuration change handler now properly clears status bar items when reminders are disabled
- Better logging for debugging health reminder states

### Added
- Option to disable specific reminder types directly from the notification
- Quick link to open settings when disabling reminders

## [1.5.0] - 2025-11-30

### Added
- Initial release with time tracking, health reminders, and backend integration
- Pomodoro timer functionality
- Custom reminder system
- Metrics collection and analytics
- Git integration
