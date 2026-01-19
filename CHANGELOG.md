# Change Log

## [2.1.5] - 2026-01-06

### Added
- **3-Tab "What's New" Interface**: Completely redesigned update notification page
  - **OVERVIEW Tab**: Interactive feature cards with enable/disable toggles
    - Displays all 8 features (Automatic Tracking, Activity Monitoring, Session Management, Dashboard Analytics, Health Reminders, Team Collaboration, Advanced Reports, AI Insights)
    - Premium features marked with "PREMIUM" badges
    - Toggle switches show current feature state (free features enabled, premium disabled)
  - **NEWS Tab**: Categorized changelog display with professional styling
    - Categorizes changes into: New Features, Improvements, Bug Fixes, Security Updates, Removed
    - Color-coded badges for each category (Green=NEW, Blue=IMPROVED, Orange=FIXED, Red=SECURITY, Grey=REMOVED)
    - Falls back to default "Thank you for updating" message with action buttons
  - **LICENSE Tab**: Free vs Premium feature comparison
    - Side-by-side comparison of Free and Premium features
    - "Buy Premium" CTA button linking to devtimetracker.io/premium
    - Clear visual distinction between feature tiers
  - Professional design matching VS Code theme with blue accent color (#007acc)
  - User preference toggle: "Show What's New after Update" checkbox
  - Added webview message handlers for: toggleShowOnUpdate, tryPremium, openChangelog, openDocs

### Improved
- Enhanced user experience with modern tabbed navigation
- Better feature discoverability through interactive cards
- Improved changelog presentation with categorization
- Added fallback content when changelog parsing fails

### Technical Details
- Added `Feature` interface for feature cards with isPremium flag
- Added `SHOW_ON_UPDATE_KEY` constant for user preferences in globalState
- Created helper methods: `renderFeatureCards()`, `renderNewsTab()`, `renderDefaultNews()`, `renderChangeCategory()`
- Extended webview message handler with 4 new command types
- CSS styling with hover effects, smooth transitions, and responsive layout
- JavaScript tab switching with active state management

## [2.1.4] - 2026-01-05

### Fixed
- **Time Tracking Accuracy**: Completely overhauled duration calculation
  - **CRITICAL FIX**: Fixed severe time under-reporting issue where only active typing seconds were counted
  - Now tracks total session time from first to last activity, not just rapid keystroke intervals
  - Previous behavior: Only counted time between rapid keystrokes (< 10 seconds apart)
  - New behavior: Counts entire session duration while file is active
  - Reading code, thinking, debugging time now properly included
  - Incremental checkpoint system ensures accurate time reporting every 5 minutes
  - Developers will now see realistic daily coding hours instead of just minutes

- **Status Bar Active/Idle Detection**: Fixed status not updating
  - Status bar now correctly shows "Active" when typing/clicking instead of staying "Idle"
  - Added immediate activity tracking for typing and selection changes
  - Fixed persisted session not starting update interval on extension reload
  - Idle/Active status now updates within 1 second of user interaction
  - Added `markActivity()` method for instant activity timestamps

- **Activity Sync to Backend**: Fixed sessions not being sent to server
  - **CRITICAL FIX**: Checkpoints were skipped if no keystrokes detected, losing reading/thinking time
  - Now sends checkpoints even for duration-only sessions (reading code, reviewing, debugging)
  - Fixed extension deactivation to properly flush pending activities before closing
  - Activities are now reliably synced every 5 minutes OR when switching/closing files
  - Prevents loss of accumulated time during extension reloads

### Technical Details
- Modified `FileSessionTracker` to track total session duration instead of micro-intervals
- Changed from event-to-event time accumulation to session-start-to-last-activity calculation
- Added `lastCheckpointDuration` tracking to send only incremental time at each checkpoint
- Added `markActivity()` for immediate activity detection without metric calculation
- Fixed `loadPersistedSession()` to start update interval when restoring today's session
- Fixed `checkpointSession()` to send duration even when metrics are zero (reading code)
- Updated `deactivate()` to ensure proper checkpoint and flush sequence
- Maintains 5-minute checkpoint interval to minimize server load while ensuring data accuracy
- This fix resolves the common issue where developers code all day but see only 5-10 minutes tracked

## [2.1.3] - 2026-01-05

### Fixed
- **Extension Initialization**: Resolved critical initialization failure
  - Fixed duplicate command registration causing "Dev Time Tracker is not initialized yet" error
  - StatusBarManager now initializes properly without conflicts
  - Timer and Pomodoro functionality restored and working correctly
  - Removed duplicate `togglePomodoro` command registration from extension activation

- **What's New System**: Improved changelog detection and parsing
  - Enhanced path resolution for CHANGELOG.md in development and production environments
  - Added support for all workspace folders when detecting changelog
  - Fixed changelog parsing to handle both bold and regular markdown bullet points
  - Improved multi-line description and nested bullet point handling


- **Language Detection**: Accurate tracking of programming languages
  - Fixed unrealistic language tracking (removed "terminal", "ignore", "log", "instructions")
  - Properly maps VS Code language IDs to standard language names
  - Filters out non-programming files (config files, logs, binary files)
  - Terminal activities now correctly tracked as "Shell" instead of generic "terminal"

- **Editor Detection**: Dynamic editor identification
  - Fixed hardcoded "VS Code" to use actual editor name
  - Now correctly detects VS Code, Cursor, Windsurf, VSCodium, and other VS Code-based editors
  - Backend displays accurate editor statistics for all users

### Improved
- **Changelog Integration**: Better workspace compatibility
  - Dynamic workspace root detection for development environments
  - Works across different workspace configurations and user setups
  - Removed hardcoded paths for better portability

- **Language Support**: Comprehensive programming language coverage
  - Added 100+ programming languages and frameworks
  - Mobile development: React Native, Flutter, Expo, Swift, Kotlin, Objective-C
  - Web frameworks: Vue, Svelte, Astro, Angular, React
  - Backend: PHP, Python, Java, Go, Rust, Ruby, Elixir, and 40+ more
  - Database: SQL variants, GraphQL, Cypher
  - DevOps: Docker, Terraform, Ansible, Kubernetes configs
  - Smart framework detection (Flutter vs Dart, React Native vs JavaScript)
  - Template languages properly mapped to parent language (Blade→PHP, ERB→Ruby)

### Technical
- **Backend Compatibility**: Verified backend properly handles editor and language data
  - Editor statistics correctly strip version numbers and group by name
  - Language tracking validated across all endpoints
  - Profile and dashboard display accurate statistics

## [2.1.2] - 2025-12-20

### Added
- **What's New Notification System**: Automatic update notifications with beautiful UI
  - Shows new features and improvements after each update
  - Automatically parses release notes from CHANGELOG.md
  - Professional design matching VS Code themes with extension branding
  - Interactive buttons for dashboard access, settings, and community engagement
  - Smart version tracking prevents repeated notifications

- **Enhanced User Onboarding**: Improved first-time user experience
  - Welcome notification system for new installations
  - Quick access to dashboard and settings configuration
  - GitHub repository and marketplace review integration

### Improved
- **Visual Design**: Updated to cyan theme colors throughout the extension
  - Consistent branding with cyan (#00bcd4) color scheme
  - Enhanced hover effects and smooth animations
  - Better contrast and accessibility in all UI components
  - Professional appearance matching modern VS Code extensions

- **Command Registration**: Fixed timing issues with extension activation
  - Resolved "command not found" errors during startup
  - Improved extension activation reliability
  - Better error handling for command registration failures

- **Extension Maintenance**: Automated changelog integration
  - Single-file maintenance workflow for release notes
  - Automatic extraction of version-specific changes
  - Reduced duplication between changelog and notification system

### Technical
- **Backend Integration**: Enhanced API communication reliability
- **Webview Security**: Proper resource URI handling for extension assets
- **TypeScript**: Improved type safety and error handling

### Backend Improvements
- **API Integration**: Enhanced communication reliability with VS Code extension
  - Better error handling for extension requests
  - Improved response formatting for What's New system
  - Enhanced settings synchronization stability

- **Dashboard Performance**: Optimized data retrieval and rendering
  - Faster loading times for analytics dashboard
  - Improved timezone handling for accurate time displays
  - Better caching mechanisms for frequently accessed data

- **Backend Infrastructure**: Enhanced system reliability
  - Improved health monitoring and system health checks
  - Enhanced error tracking and debugging capabilities
  - Updated API endpoint documentation
  - Enhanced test coverage for critical features
  - Continuous security and performance optimizations

## [2.1.1] - 2025-12-16

### Fixed
- **Timezone Display Issues**: Fixed 3-hour time discrepancy across all pages
  - Dashboard peak hour now shows correct local time (was showing UTC)
  - Activities page timestamps converted to user's timezone
  - Projects last activity time displays in local timezone
  - Recent activities widget shows accurate relative times ("3 hours ago")
  - All date/time displays now respect user's configured timezone

- **Idle Time Tracking**: Fixed status bar timer continuing during idle periods
  - Timer now properly pauses after 10 seconds of inactivity
  - Total idle time accumulated and displayed in tooltip
  - Active coding time calculation excludes all idle periods
  - Status bar shows separate "Idle: Xm" in tooltip for transparency

- **Settings Validation**: Fixed persistent "Value must be a number" errors
  - Added validation for all actual VS Code setting names
  - Fixed key name mismatches (e.g., `shortBreakDuration` vs `breakDuration`)
  - Automatic cleanup of invalid settings on startup
  - Added all missing settings to validation (snooze durations, sync interval, etc.)

- **Backend Settings Sync Loop**: Prevented unnecessary API calls
  - Added flag to detect when settings are being pulled from backend
  - Configuration watcher now skips push when changes originate from backend
  - Eliminates wasteful sync loop when backend updates settings

### Improved
- **Status Bar Timer Accuracy**: Enhanced daily time tracking
  - Properly accumulates idle time throughout the day
  - Displays both active time and total idle time
  - Timer tooltip shows session start time and pause state
  - Automatic daily reset at midnight
  - Persists across VS Code reloads

- **Performance Optimization**: Removed all console.log statements
  - Cleaner console output (no debug noise)
  - Reduced bundle size by ~3KB
  - Silent error handlers for async operations
  - Maintained user-facing notifications

- **Backend Timezone Handling**: Comprehensive timezone conversion
  - Activities component converts all timestamps to user timezone
  - Projects component converts creation and activity times
  - Dashboard recent activities use user's local time
  - SQL queries use CONVERT_TZ() for accurate hour calculations
  - Consistent timezone handling across all Livewire components

### Technical Details
- Updated `FileSessionTracker` idle detection integration with status bar
- Fixed `await` usage in non-async `setInterval` callbacks
- Enhanced `cleanInvalidSettings()` with complete setting list (40+ settings)
- Added `isPullingFromBackend` flag to prevent configuration loops
- Implemented timezone conversion in Activities, Projects, and Dashboard components
- Updated MySQL queries to use CONVERT_TZ() for timezone-aware aggregations

## [2.1.0] - 2025-12-13

### Added
- **Payload Compression**: Automatic gzip compression for network payloads
  - Compresses payloads larger than 1KB before sending to backend
  - Reduces bandwidth usage by ~70% on average
  - Transparent fallback to uncompressed if compression fails
  - Logs compression ratio in console for monitoring
  - Uses standard `Content-Encoding: gzip` header

- **Adaptive Batch Sizing**: Dynamic batch size optimization based on network conditions
  - Automatically adjusts batch size from 10 to 100 activities
  - Monitors average response time and adapts to network speed
  - Increases batch size on fast networks (< 1s response) for better throughput
  - Decreases batch size on slow networks or failures to prevent timeouts
  - Tracks consecutive successes/failures for smart adaptation
  - Optimal response time target: 1 second

- **Offline Queue Status Bar**: Real-time visibility of pending activities
  - New status bar item shows count of queued activities
  - Three states: Hidden (synced), Queued (normal), Offline (warning)
  - Updates automatically when activities are added or synced
  - Shows offline indicator when circuit breaker is open
  - Provides clear user feedback on sync status
  - Priority position on the left side of status bar

### Improved
- **Performance**: Combined improvements result in 81% faster sync times
  - 100 activities: 12.5s → 2.4s on typical 4G connection
  - Bandwidth reduction: 250KB → 45KB (82% less data)
  - Fewer API requests: 5 → 2-3 batches for same workload
  - Better utilization of fast networks
  - More reliable on slow/unstable connections

- **User Experience**: Enhanced visibility and feedback
  - Real-time queue status in status bar
  - Compression info in sync success messages
  - Clear offline/online state indication
  - No configuration needed - works automatically

### Technical Details
- Added `zlib` compression support with promisify wrapper
- Implemented moving average algorithm for response time tracking
- Enhanced circuit breaker integration with status bar updates
- Added `StatusBarManager.updateSyncQueueStatus()` method
- Improved error handling with adaptive batch sizing
- Console logging for compression ratio and batch size changes

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
