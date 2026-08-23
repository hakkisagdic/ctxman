# Changelog

All notable changes to Ctxman are documented on this page.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

For the complete changelog, see [CHANGELOG.md](https://github.com/hakkisagdic/ctxman/blob/main/CHANGELOG.md) on GitHub.

## [3.0.0] - 2024-08-20

### Added

- **Plugin Architecture**: Modular, extensible system for languages and exporters
- **Git Integration**: Analyze changed files, diff analysis, author tracking
- **Watch Mode**: Real-time file monitoring and auto-analysis
- **REST API**: HTTP server with 6 endpoints for programmatic access
- **Caching System**: Intelligent cache for 5-10x faster repeated analyses
- **Parallel Processing**: Multi-core utilization for large codebases
- **TOON Format**: 40-50% token reduction for LLM optimization
- **Interactive Wizard**: User-friendly guided setup (default mode)
- **TypeScript Definitions**: Full type support for programmatic API

### Changed

- Complete rewrite with modular architecture
- Improved performance with caching and parallel processing
- Enhanced error handling and user feedback
- Better documentation and examples

### Fixed

- Memory usage issues with large files
- Token counting accuracy for multi-byte characters
- File watching reliability on network drives

## [2.3.7] - 2024-07-15

### Added

- LLM optimization features
- Token budgeting tools
- Context window management

### Changed

- Improved token counting accuracy
- Better error messages

## [2.3.0] - 2024-06-01

### Added

- Method-level token analysis
- GitIngest format support
- Multiple output formats

### Changed

- Refactored core analysis engine
- Improved performance

## [2.0.0] - 2024-04-01

### Added

- Multi-language support (14+ languages)
- AST-based analysis
- Tiktoken integration for exact token counting

### Changed

- Major architecture redesign
- Breaking API changes

## [1.0.0] - 2024-01-01

### Added

- Initial release
- Basic token counting
- File analysis
- Markdown output

---

## Version History

| Version | Date       | Highlights                                                 |
| ------- | ---------- | ---------------------------------------------------------- |
| 3.0.0   | 2024-08-20 | Plugin architecture, Git integration, REST API, Watch mode |
| 2.3.7   | 2024-07-15 | LLM optimization, token budgeting                          |
| 2.3.0   | 2024-06-01 | Method-level analysis, GitIngest format                    |
| 2.0.0   | 2024-04-01 | Multi-language support, AST analysis                       |
| 1.0.0   | 2024-01-01 | Initial release                                            |

## Upgrading

### From 2.x to 3.0

Version 3.0 includes breaking changes:

1. **CLI Changes**: The wizard mode is now default. Use `--cli` for non-interactive mode
2. **API Changes**: Programmatic API has been redesigned
3. **Configuration**: Some configuration options have changed

Migration guide coming soon.

## Roadmap

### Upcoming Features

- **Plugin Marketplace**: Discover and share plugins
- **Cloud Sync**: Sync configurations across devices
- **Team Features**: Shared configurations and analysis
- **VS Code Extension**: Native IDE integration
- **Performance Dashboard**: Visual performance metrics

### Contributing

We welcome contributions! See the [Contributing Guide](https://github.com/hakkisagdic/ctxman/blob/main/CONTRIBUTING.md) to get started.

### Support

- **Documentation**: [Getting Started](/getting-started)
- **Issues**: [GitHub Issues](https://github.com/hakkisagdic/ctxman/issues)
- **Discussions**: [GitHub Discussions](https://github.com/hakkisagdic/ctxman/discussions)
