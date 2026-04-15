# Gemfile Upgrade

A VS Code extension that shows inline upgrade suggestions for Ruby Gemfiles and offers quick actions to update version constraints.

Get it on the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=fdebijl.gemfile-upgrade).

## Features

- **Inline decorations** on gem lines with `~>` (pessimistic) constraints, showing the latest available version within the allowed range — color-coded by severity:
  - Blue: major upgrade available
  - Yellow: minor upgrade available
  - Green: patch upgrade available
- **Quick actions** (Ctrl+.) on any gem line:
  - For `~> A` constraints: do minor upgrade (`~> A.B`) or patch upgrade (`~> A.B.C`) within range
  - For `~> A.B` constraints: do minor upgrade (`~> A.B'`) or patch upgrade (`~> A.B.C`) within range, or major upgrade (`~> X`) if a newer major exists
  - For `~> A.B.C` constraints: do patch upgrade (`~> A.B.C'`) within range, or minor (`~> A.B'`) / major (`~> X`) upgrade if newer versions exist
  - For non-pessimistic or no-version gems: do major, minor, or patch upgrade to the latest version on RubyGems
  - Open homepage / Open changelog for any gem
- **Compound constraints** (`'~> 7.0', '>= 7.0.4'`) are handled by intersecting both ranges
- **Command palette** commands:
  - `Gemfile Upgrade: Toggle showing available updates`
  - `Gemfile Upgrade: Pin all gems to latest major`
  - `Gemfile Upgrade: Pin all gems to latest minor`
  - `Gemfile Upgrade: Pin all gems to latest patch`
  - `Gemfile Upgrade: Pin all gems to locked version (Gemfile.lock)`
- **Gemfile.lock support** — the lockfile command reads the resolved versions from `Gemfile.lock` in the same directory and sets each gem's constraint to `~> <locked version>`
- **Non-default source blocks** — gems declared inside `source 'url' do ... end` blocks are looked up on RubyGems.org; if not found (e.g. private registries), they are silently skipped
- **Local gems** (those with a `path:` argument) are automatically ignored

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

## Philosophy

You may ask: why specify version constraints in the Gemfile at all, rather than letting `Gemfile.lock` handle everything?

While this will certainly work in a lot of scenarios, in my view, leaning on the lockfile and `bundle update` does have serious downsides:
- The lockfile is not made to be human readable and certainly not edited. Only having the version in here makes it hard to find and harder to edit, requiring `bundle update` with various flags to get the desired effect
- Diffs in the lockfile can be extensive, making changes there easy to miss, and hard to review
- The lockfile contains a lot of other information that is not relevant for determining the version of a direct dependency, making it noisy for humans and harder to extract this information
- The Gemfile is upstream of the lockfile (the boss of the lockfile, if you will) and should be more authoritative than the lockfile in all aspects, not less

Upgrades to gems are not made harder by having the Gemfile be authoritative, instead they are made easier because you can wholy ignore the lockfile and make a one-line code change instead.
This doubly applies when you have a robot (such a Dependabot or Renovate) touching your Gemfile and making PRs with version updates, as you can easily review the change and merge it without worrying about the lockfile at all.
Having automated dependency updates in place eliminates the biggest concern one might have with specifying version constraints in the Gemfile, which is that you might forget to update them and end up with outdated dependencies. With a good automated update strategy, you can be confident that your Gemfile is always up to date, and the lockfile will just be a reflection of that.

This leaves us with the question of what kind of version constraints to specify in the Gemfile, the answer I would put forward for that is pessimistic constraints. These still allow bundler to efficiently resolve peer dependencies, while giving an acceptable level of guarantee that dependencies won't break on you. In most cases a constraint up to the minor (`~> A.B`) is appropriate, but for critical dependencies like Rails, pinning to the patch (`~> A.B.C`) makes sense.

Essentially, you should view this extension as a tool to help you maintain a healthy and up-to-date Gemfile with clear version constraints, while still giving you the flexibility to choose how you want to manage your dependencies. It provides visibility into available updates and makes it easy to apply them, without forcing you into a specific workflow or strategy - although it makes a great sidekick for an automated update strategy.

## Credits

This extension was heavily inspired by [package-json-upgrade](https://github.com/pgsandstrom/package-json-upgrade) by pgsandstrom. The decoration rendering, cache state machine, and overall UX pattern are adapted from that project.
