# GitIngest Integration Version Tracking

This document tracks the version of GitIngest format that ctxman implements.

## Current Implementation

**GitIngest Version Reference**: v0.3.1 (2025-07-31)
**Source Repository**: https://github.com/coderamp-labs/gitingest
**Implementation Date**: October 13, 2025
**Source Snapshot**: `docs/coderamp-labs-gitingest-8a5edab282632443.txt`

## Format Specification

Context-manager implements the GitIngest digest format with the following structure:

```
Directory: [project-name]
Files analyzed: [count]

Estimated tokens: [token-count]
Directory structure:
└── project/
    ├── src/
    │   └── file.js
    └── README.md


================================================
FILE: [relative-path]
================================================
[file content]
```

## Implementation Details

### Key Files

- **GitIngestFormatter class**: `ctxman.js` (lines 16-174)
- **CLI flag**: `--gitingest` or `-g`
- **Output file**: `digest.txt` (in project root)

### Features Implemented

- ✅ Summary header with project info
- ✅ File count statistics
- ✅ Token count estimation (formatted as k/M)
- ✅ Tree structure visualization
- ✅ File contents with separators
- ✅ Files sorted by token count (largest first)

### Differences from GitIngest Python

1. **No Git Repository Detection**: We work with local directories only
2. **No Branch/Commit Info**: We don't track git metadata
3. **Simpler Header**: Only shows directory name and file count
4. **JavaScript Implementation**: Pure JS, no Python dependency
5. **Integration**: Works with existing ctxman filters

## Version History

| Date       | GitIngest Version | Notes                                            |
| ---------- | ----------------- | ------------------------------------------------ |
| 2025-10-13 | v0.3.1            | Initial implementation based on GitIngest format |

## Future Updates

To update the GitIngest format implementation:

1. Download latest GitIngest source using gitingest tool
2. Save snapshot to `docs/` folder with hash suffix
3. Review changes in `src/gitingest/output_formatter.py`
4. Update `GitIngestFormatter` class accordingly
5. Update this document with new version info
6. Run tests to ensure compatibility

## References

- GitIngest Repository: https://github.com/coderamp-labs/gitingest
- GitIngest PyPI: https://pypi.org/project/gitingest/
- Output Formatter Source: `src/gitingest/output_formatter.py` in snapshot
