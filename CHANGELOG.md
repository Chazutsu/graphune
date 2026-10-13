# Changelog

All notable changes to Graphune are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
uses Semantic Versioning with an initial `0.1.x` patch-only release policy.

## [Unreleased]

### Changed

- Raised the minimum Obsidian version to 1.8.7 and replaced deprecated workspace and file APIs
  with supported leaf and trash operations.

## [0.1.2] - 2026-10-13

### Changed

- Changed the Obsidian plugin ID from `obsidian-heptabase` to `graphune` for Community Directory
  compatibility ([#3]).

### Added

- Added first-launch legacy settings import and a safe manual migration command that preserves the
  old installation while replacing its enabled-plugin entry ([#3]).
- Documented the one-time reinstall and workspace limitations caused by an Obsidian plugin ID
  change ([#3]).

## [0.1.1] - 2026-10-13

### Added

- GitHub Sponsors and Issue links in the plugin settings, README, and deployment output ([#2]).

### Changed

- Replaced the distillation context selector with an accessible searchable combobox that handles
  duplicate note names, excludes source notes, and bounds rendered results in large vaults ([#1]).

## [0.1.0] - 2026-10-12

### Added

- English and Japanese user interfaces with system-language detection and an explicit language
  setting.
- Catalog coverage tests that require every English message key to have a Japanese translation.
- Automated release validation for versions, distributable assets, checksums, and release notes.
- A heading explorer for browsing and searching note hierarchies from the Obsidian sidebar.
- Tag and folder filters with title and recency sorting.
- Drag-and-drop extraction of heading sections into new Markdown files and Canvas nodes.
- Configurable output folders, file name prefixes, node dimensions, and extraction previews.
- Extraction provenance linking generated cards to their source note, heading, and Canvas.
- A card context panel for source links, backlinks, and Canvas locations.
- Canvas-to-sidebar article navigation and editing.
- Search and focus for cards, text, groups, and links on the active Canvas.
- Canvas selection tools for alignment, distribution, connection, grouping, Undo, and Redo.
- Fast card capture through a command or double-click on an empty Canvas area.
- Edge backlink synchronization for connected Canvas file nodes.
- Keyboard navigation and mobile-compatible layouts.

### Changed

- English is now the source language for user-facing copy and public documentation.
- CI treats linting, formatting, type checking, localization coverage, tests, production builds,
  deploy-contract validation, and visual regression as release gates.
- Adopted Graphune as the public product name.
- Retained the legacy Obsidian plugin ID `obsidian-heptabase` so existing installations and settings
  continue to work.

[Unreleased]: https://github.com/Chazutsu/graphune/compare/0.1.2...HEAD
[0.1.2]: https://github.com/Chazutsu/graphune/compare/0.1.1...0.1.2
[0.1.1]: https://github.com/Chazutsu/graphune/compare/v0.1.0...0.1.1
[0.1.0]: https://github.com/Chazutsu/graphune/releases/tag/v0.1.0
[#1]: https://github.com/Chazutsu/graphune/issues/1
[#2]: https://github.com/Chazutsu/graphune/issues/2
[#3]: https://github.com/Chazutsu/graphune/issues/3
