# Maintainers

This document covers maintainer-only workflow notes that do not belong in the public project README.

## Release the workbench

The fork publishes its application from the `workbench` branch of `Mallet-Dev/open-seo`. The inherited `main` branch and upstream version tags identify different source.

Generate notes in a clean checkout of the published workbench revision:

```sh
git switch workbench
git pull --ff-only origin workbench
pnpm release:notes
```

Use `--from <tag>` and `--to <ref>` to select the history range. Choose a new version for the fork, update `package.json` and save the reviewed notes in `release-notes/v<version>.md` before publishing that revision on `workbench`. The inherited package version may already name an upstream tag.

```sh
pnpm release:publish --dry-run
pnpm release:publish
```

The dry run prints the destination. Publishing verifies that the local commit matches the remote workbench branch and rejects an existing tag for any other commit. To prepare a draft with generated notes instead, run `pnpm release:notes --draft <new-version>` from the same checkout.

## OpenCode slash command

For convenience inside OpenCode, use:

```text
/release-notes
```

The command definition lives at `.opencode/command/release-notes.md` and forwards any extra arguments to the same generator script.
