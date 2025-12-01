# Change Log

All notable changes to the "dev-time-tracker" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

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

### Changed
- Improved reminder messages with better emoji and clearer instructions
- Configuration change handler now properly clears status bar items when reminders are disabled
- Better logging for debugging health reminder states

## [1.5.0] - 2025-11-30

### Added
- Initial release with time tracking, health reminders, and backend integration
- Pomodoro timer functionality
- Custom reminder system
- Metrics collection and analytics
- Git integration
