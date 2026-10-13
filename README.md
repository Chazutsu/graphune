# Graphune

![Obsidian](https://img.shields.io/badge/Obsidian-%3E%3D1.5.0-blueviolet)
![License](https://img.shields.io/badge/license-MIT-green)

Tune your knowledge. Graphune turns vault headings into a spatial, connected workspace on Obsidian Canvas.

> Since 0.1.2, the Obsidian plugin ID is `graphune`, as required for Community Directory submission.
> Existing settings are imported from the former `obsidian-heptabase` directory on first launch.

[Japanese](docs/README.ja.md)

## Why Graphune?

Graphune lets you extract heading sections from your vault and place them onto Canvas as individual notes. Markdown remains the source of truth while Canvas provides the spatial workspace.

## Features

- **Sidebar heading explorer** — Browse all notes and their heading hierarchy in a right sidebar
- **Debounced search** — Quickly filter notes by title with real-time search
- **Library filters** — Filter by tag and folder, then sort by recency or title without rereading the Vault
- **Drag & drop to Canvas** — Drag any heading onto an open Canvas to create a new note
- **Smart content extraction** — Automatically extracts the full section content, including nested headings
- **Auto file creation** — Creates new files with sanitized names and handles filename collisions
- **Configurable node size** — Set default width and height for new Canvas nodes
- **Configurable output** — Choose an output folder and file name prefix for extracted notes
- **Edge backlink sync** — Keep Markdown backlinks aligned with connections drawn between Canvas file nodes
- **English and Japanese UI** — Follow Obsidian's language or choose a language explicitly
- **Extraction provenance** — Records the source note, heading, Canvas, and extraction time on new concept cards
- **Card context panel** — Shows source, backlinks, and every Canvas containing the current card
- **Canvas-to-article navigation** — Select a file node on Canvas to open it in the sidebar editor
- **Canvas search and focus** — Find cards, text, groups, and links on the current Canvas and zoom to them
- **Canvas selection tools** — Align, distribute, connect, or group selected cards from one toolbar, with synchronized Undo/Redo
- **Fast card capture** — Create a non-overlapping card, then name it immediately in a focused title editor
- **Keyboard accessible** — Full keyboard navigation support

## Installation

### Manual

1. Clone or download this repository
2. Install dependencies and build:
   ```bash
   pnpm install
   pnpm build
   ```
3. Copy `main.js`, `manifest.json`, and `styles.css` (if present) to your vault's plugin directory:
   ```
   <vault>/.obsidian/plugins/graphune/
   ```
4. Restart Obsidian and enable the plugin in Settings > Community Plugins

## Usage

1. Open a Canvas in Obsidian
2. Click the **list-tree** icon in the ribbon (left sidebar) to open the Heading Explorer
3. Browse or search for notes in the explorer panel
4. Expand a note to see its heading hierarchy
5. Drag a heading onto the Canvas — a new note is created with the extracted section content

Select multiple Canvas nodes and open Obsidian's command palette to align or distribute them. Alignment
requires two nodes; equal distribution requires three or more.

Run **Create new card** to place a selected card in the center of the visible Canvas. Cmd/Ctrl +
double-click an empty Canvas area to create one at that point. The new card opens with its title
selected, so typing replaces `Untitled` immediately.

## Settings

| Setting                    | Description                                                                          | Default        |
| -------------------------- | ------------------------------------------------------------------------------------ | -------------- |
| Extracted files folder     | Folder to save extracted heading files. Leave empty to use the source file's folder. | _(empty)_      |
| Default node width         | Width for new Canvas nodes (200–800)                                                 | 400            |
| Default node height        | Height for new Canvas nodes (100–600)                                                | 300            |
| File name prefix           | Prefix for extracted file names                                                      | _(empty)_      |
| Show preview before create | Preview extracted sections before files are created                                  | Off            |
| Quick card default title   | Initial title used for cards created by double-clicking                              | `Untitled`     |
| Enable edge sync           | Write backlinks when file nodes are connected on Canvas                              | On             |
| Default edge color         | Color applied to new edges                                                           | Obsidian default |
| Default edge label         | Label applied to new edges                                                           | _(empty)_      |
| Language                   | Follow Obsidian, or explicitly use English or Japanese                               | System default |

## Development

UI changes must follow the [UX principles](docs/UX_PRINCIPLES.md). Smoothness and visual quality are
release criteria for this plugin.

User-facing copy belongs in `src/i18n/index.ts`, not directly in components. English is the source
catalog and every key must have a Japanese translation. Language changes update open Graphune views
immediately; command and ribbon labels update after Obsidian reloads the plugin.

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS)
- [pnpm](https://pnpm.io/)

### Setup

```bash
pnpm install
```

### Commands

```bash
pnpm dev        # Build in watch mode
pnpm build      # Production build
pnpm test       # Run tests
pnpm lint       # Lint with oxlint
pnpm format     # Auto-format with oxfmt
```

### Device testing in Obsidian

Build the plugin, create a reproducible UX audit vault, and open it in Obsidian:

```bash
pnpm build
pnpm setup:device
pnpm open:device
```

The generated `.dev/ux-audit-vault` enables `graphune`, opens the localized audit Canvas,
and restores the Heading Explorer in a 380 px right sidebar. Its notes cover folders, hierarchical
tags, Japanese text, long titles, dense Canvas content, and empty, search, and filter states. Use the
included audit checklist for light and dark themes, narrow widths, keyboard operation, and
continuous use. For iterative development, keep the vault open and run `pnpm dev`.

Obsidian requires one manual registration on first use: choose **Open folder as vault**, select `.dev/ux-audit-vault`, trust the local vault, and enable **Graphune**. After that, `pnpm open:device` opens it directly.

### Migrating from 0.1.1 or earlier

The Community Directory cannot treat a changed plugin ID as an in-place update. Disable the old
Graphune installation, install or copy 0.1.2 into `.obsidian/plugins/graphune/`, then enable
Graphune again. On first launch, Graphune imports `data.json` from
`.obsidian/plugins/obsidian-heptabase/` only when the new installation has no data of its own.

For a manual or development installation, the following command copies settings and replaces the
enabled plugin ID in `community-plugins.json`:

```bash
pnpm migrate:legacy -- --vault <vault-path>
```

The command keeps the old plugin directory and backs up `community-plugins.json`. Remove the old
directory only after verifying Graphune 0.1.2. Workspace layout entries owned by the old plugin ID
may need to be reopened once; note and Canvas content is unaffected.

## Support

- [Sponsor Graphune on GitHub Sponsors](https://github.com/sponsors/ryo-ebata)
- [Report a bug or request a feature](https://github.com/Chazutsu/graphune/issues)

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md), open an
[issue](https://github.com/Chazutsu/graphune/issues), or submit a pull request.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes and add tests
4. Run `pnpm test && pnpm lint` to verify
5. Submit a pull request

## License

[MIT](LICENSE)

## Acknowledgments

Inspired by [Heptabase](https://heptabase.com/) and its approach to visual knowledge management.
