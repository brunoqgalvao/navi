# Changelog

All notable changes to Navi will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial open source release
- Multi-agent coordination system with native UI
- Live preview panel for URLs, files, and markdown
- Git integration with worktree management
- Skills system for extensibility
- Extensions system for sidebar panels
- Message widgets for custom inline renderers
- OAuth integrations (Gmail, Google Sheets, Slack, Linear, Notion, GitHub)
- Multi-session agent spawning
- Resource monitor (CPU, Memory)
- Kanban board for task management
- Session hierarchy viewer
- Background process manager
- Terminal/PTY integration
- File browser with syntax highlighting
- Dashboard with project overview

### Changed
- Migrated to Svelte 5 runes syntax throughout
- Upgraded to Tauri v2
- Improved WebSocket handling for real-time updates
- Enhanced error handling and user feedback

### Deprecated
- E2B Cloud Execution (replaced by Navi Cloud)
- Experimental Agents (superseded by multi-session system)
- Self-Healing Builds (removed as premature optimization)
- Channels feature (removed from roadmap)
- Plugins system (redundant with Skills)

### Fixed
- Git worktree creation and switching
- PTY session persistence
- WebSocket reconnection handling
- OAuth token storage encryption
- File reference resolution
- Agent session state management

### Security
- API keys now stored in-memory only (never logged)
- OAuth tokens encrypted in database
- Added input validation for file operations
- Improved error message sanitization

## [1.8.1] - 2025-01-12

### Added
- Landing page with email capture
- GitHub links in footer and hero
- Update manifest generation for releases

### Fixed
- GitHub repository URLs updated to match actual repo
- Contact method placeholder in Code of Conduct

## [1.8.0] - 2025-01-10

### Added
- Multi-agent system with session hierarchy
- Native UI for browser, coding, and runner agents
- Agent tree visualization
- Session manager service
- Multi-session MCP tools

### Changed
- Refactored agent spawning to use claude-agent-sdk
- Improved agent lifecycle management

## [1.7.0] - 2025-01-08

### Added
- Kanban board extension
- Task drag-and-drop
- Task filtering and search

### Fixed
- Kanban state persistence
- Task ordering issues

## [1.6.0] - 2025-01-05

### Added
- Resource monitor component
- CPU and memory tracking
- Performance metrics dashboard

### Changed
- Optimized render performance for large message lists
- Improved virtualization for file browser

## [1.5.0] - 2025-01-03

### Added
- OAuth integration system
- Gmail, Google Sheets, Slack, Linear, Notion, GitHub
- Encrypted credential storage
- Integration settings panel

### Fixed
- OAuth callback handling
- Token refresh flow

## [1.4.0] - 2024-12-20

### Added
- Skills system documentation
- Skill auto-discovery
- SKILL.md frontmatter parsing

### Changed
- Migrated skills to file-based discovery
- Improved skill loading performance

## [1.3.0] - 2024-12-15

### Added
- Message widgets system
- Mermaid diagram rendering
- Stock chart widget
- Media display widget
- Copyable text widget
- Generative UI (genui) widget

### Fixed
- Widget loading and initialization
- Markdown code block parsing

## [1.2.0] - 2024-12-10

### Added
- Preview panel
- URL rendering
- File preview with syntax highlighting
- Markdown rendering
- Image display

### Changed
- Improved panel switching performance
- Better preview error handling

## [1.1.0] - 2024-12-05

### Added
- Git integration
- Branch management
- Worktree support
- Commit history
- Status monitoring

### Fixed
- Git command execution in PTY
- Repository path resolution

## [1.0.0] - 2024-12-01

### Added
- Initial release
- Claude Code integration
- Chat interface
- File browser
- Terminal integration
- Session management
- Project management

---

## Versioning Scheme

- **Major (X.0.0):** Breaking changes, major features
- **Minor (x.X.0):** New features, backward compatible
- **Patch (x.x.X):** Bug fixes, minor improvements

## Release Schedule

We aim for regular releases with:
- Weekly patch releases for bug fixes
- Monthly minor releases for new features
- Major releases as needed for large changes

## Support

For release-specific issues, please check GitHub Discussions or open an issue.
