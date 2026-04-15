# Gemfile Upgrade

A VS Code extension that shows inline upgrade suggestions for Ruby Gemfiles and offers quick actions to update version constraints.

## Features

- **Inline decorations** on gem lines with `~>` (pessimistic) constraints, showing the latest available version within the allowed range — color-coded by severity:
  - Blue: major upgrade available
  - Yellow: minor upgrade available
  - Green: patch upgrade available
- **Quick actions** (Ctrl+.) on any gem line:
  - For `~> A` constraints: pin to latest minor (`~> A.B`) or latest patch (`~> A.B.C`)
  - For `~> A.B` constraints: bump to latest major (`~> X`) or pin to latest patch (`~> A.B.C`)
  - For `~> A.B.C` constraints: bump to latest major or latest minor
  - For non-pessimistic or no-version gems: pin to latest major, minor, or patch
  - Open homepage / Open changelog for any gem
- **Compound constraints** (`'~> 7.0', '>= 7.0.4'`) are handled by intersecting both ranges
- **Command palette** commands to pin all gems at once:
  - `Gemfile Upgrade: Pin all gems to latest major`
  - `Gemfile Upgrade: Pin all gems to latest minor`
  - `Gemfile Upgrade: Pin all gems to latest patch`
- **Local gems** (those with a `path:` argument) are automatically ignored
- **Toggle** decorations on/off with `Gemfile Upgrade: Toggle showing available updates`

## Settings

| Setting | Default | Description |
|---|---|---|
| `gemfile-upgrade.showUpdatesAtStart` | `true` | Show decorations automatically when a Gemfile is opened |
| `gemfile-upgrade.showOverviewRulerColor` | `true` | Show color indicators on the scrollbar |
| `gemfile-upgrade.openChangelogInEditor` | `true` | Open changelogs in VS Code's Simple Browser instead of an external browser |
| `gemfile-upgrade.decorationString` | `"\t-> %s"` | Customize the decoration text (`%s` = version) |
| `gemfile-upgrade.ignoreGems` | `[]` | Gem names to exclude from decorations (exact match) |
| `gemfile-upgrade.majorUpgradeColorOverwrite` | `""` | Override color for major upgrades (e.g. `#FF0000`) |
| `gemfile-upgrade.minorUpgradeColorOverwrite` | `""` | Override color for minor upgrades |
| `gemfile-upgrade.patchUpgradeColorOverwrite` | `""` | Override color for patch upgrades |
| `gemfile-upgrade.msUntilRowLoading` | `10000` | Milliseconds before showing "Loading..." on unresolved rows |

## Credits

This extension was inspired by [package-json-upgrade](https://github.com/pgsandstrom/package-json-upgrade) by pgsandstrom. The decoration rendering, cache state machine, and overall UX pattern are adapted from that project.
