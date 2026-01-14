# Contributing to Navi

First off, thanks for considering contributing to Navi! It's people like you that make Navi such a great tool.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Coding Standards](#coding-standards)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues. When you create a bug report, include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples to demonstrate the steps**
- **Describe the behavior you observed and what you expected**
- **Include environment details** (OS, Navi version, etc.)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- **Use a clear and descriptive title**
- **Provide a detailed description of the suggested enhancement**
- **Explain why this enhancement would be useful**
- **List some examples of how this feature would be used**
- **Include mockups or screenshots if applicable**

### Pull Requests

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Development Setup

### Prerequisites

- **Bun** - Fast JavaScript runtime and package manager
- **Node.js** (for some tools) - v18+ recommended
- **Rust** - For Tauri desktop app builds
- **macOS** or **Linux** - Windows support is planned

### Installation

```bash
# Clone the repository
git clone https://github.com/brunoqgalvao/navi.git
cd navi

# Install dependencies
bun install

# Install Tauri CLI (for desktop builds)
bun install --global @tauri-apps/cli
```

### Running Development Servers

```bash
# From root directory
bun run dev:all

# Or from packages/navi-app
cd packages/navi-app
bun run dev:all

# Run as desktop app (Tauri)
bun run tauri:dev
```

### Type Checking

```bash
# Type check the entire codebase
bun run --cwd packages/navi-app check
```

### Building

```bash
# Build web app
bun run --cwd packages/navi-app build

# Build desktop app
./scripts/build-app.sh
```

## Coding Standards

### TypeScript

- Use **TypeScript** for all new code
- Enable strict mode in `tsconfig.json`
- Avoid `any` types - use proper type definitions or `unknown`
- Use interfaces for public APIs, types for internal
- Prefer `const` over `let`

### Svelte

- Use **Svelte 5** runes syntax (`$state`, `$derived`, `$effect`)
- Keep components small and focused
- Use TypeScript for component props
- Document complex logic with comments

### File Organization

Follow the established patterns:

```
src/lib/features/{feature}/
├── api.ts              # Backend API client
├── types.ts            # TypeScript interfaces
├── stores.ts           # Svelte stores (optional)
├── index.ts            # Public exports
└── components/
    ├── FeaturePanel.svelte
    └── FeatureModal.svelte
```

### Naming Conventions

- **Files:** `kebab-case` for components, `camelCase` for utilities
- **Components:** `PascalCase` (e.g., `ChatInput.svelte`)
- **Functions/Variables:** `camelCase`
- **Constants:** `UPPER_SNAKE_CASE`
- **Types/Interfaces:** `PascalCase`

### Code Style

- **Indentation:** 2 spaces (no tabs)
- **Quotes:** Single quotes for strings, double quotes for JSX
- **Semicolons:** Required
- **Max line length:** 100 characters (soft limit)

## Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation changes
- `style` - Code style changes (formatting, etc.)
- `refactor` - Code refactoring
- `perf` - Performance improvements
- `test` - Adding or updating tests
- `chore` - Build process or tooling changes

### Examples

```
feat(chat): add support for inline images

fix(git): resolve branch switching bug on macOS

docs(readme): update installation instructions

refactor(sessions): simplify session state management
```

## Pull Request Process

### Before Submitting

1. **Run type checking:** `bun run check`
2. **Test your changes** thoroughly
3. **Update documentation** if needed
4. **Add tests** for new features or bug fixes
5. **Ensure all commits** follow the commit message convention

### PR Description

Include:

- **Description** of what changed and why
- **Screenshots** for UI changes (before/after)
- **Related issues** using `fixes #123` or `refs #123`
- **Breaking changes** clearly marked
- **Testing steps** for reviewers

### Review Process

- All PRs require at least one approval
- Address review feedback promptly
- Keep PRs focused and reasonably sized
- Squash commits if needed before merge

## Architecture

### Key Concepts

- **Extensions:** Sidebar panels (Files, Git, Terminal, etc.)
- **Skills:** Claude capability extensions (`.claude/skills/`)
- **Agents:** AI personas for specialized tasks (`.claude/agents/`)
- **Message Widgets:** Inline chat renderers (code, media, tools)
- **Features:** Self-contained modules (`src/lib/features/*/`)

See [CLAUDE.md](CLAUDE.md) for detailed architecture documentation.

## Getting Help

- **Documentation:** Check [docs/](docs/) and [CLAUDE.md](CLAUDE.md)
- **Issues:** Search or create [GitHub Issues](../../issues)
- **Discussions:** Use [GitHub Discussions](../../discussions) for questions

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

Thanks again for contributing! 🚀
