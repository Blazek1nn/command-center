# Contributing to Command Center

Thanks for considering a contribution. This project is small, opinionated, and moves fast — read this once before opening a PR.

## Ground rules

1. **Open an issue first** for anything bigger than a typo or one-line fix. We'd rather discuss the approach than reject the PR.
2. **One concern per PR.** Bug fix, refactor, and feature in the same PR will be sent back.
3. **No new dependencies without justification.** Mention why a smaller alternative or in-tree implementation won't work.
4. **English in code, comments, and commit messages.** Issues and discussions can be in English or Portuguese.
5. **By submitting a contribution, you agree to the [CLA](./CLA.md).** Your PR will be blocked until the CLA bot confirms acceptance (once we wire it up).

## Development setup

```bash
git clone https://github.com/<org>/command-center.git
cd command-center
just dev          # spawns backend (8000) + frontend (3000)
```

See [README.md](./README.md) for full prerequisites.

## Before opening a PR

```bash
just lint         # ruff + eslint + tsc --noEmit
just test         # pytest + vitest (when frontend tests land)
just typecheck    # mypy + tsc strict
```

All three must be green. CI will block otherwise.

## Commit messages

Format: `<area>: <imperative summary>`

Examples:
- `dispatcher: stop swallowing task exceptions`
- `chat-ui: dedupe SSE events on reconnect`
- `docs: clarify mcp.json headless allow-list`

Body is optional. If included, explain *why*, not *what* — the diff already shows what.

## What gets merged fast

- Bug fixes with a reproduction in the issue
- Test coverage for existing behavior
- Documentation that fixes a real onboarding pain
- Performance improvements with before/after numbers

## What gets pushed back

- New features without an open issue + design discussion
- Refactors "for cleanliness" without a concrete win
- Dependency upgrades that aren't security-driven, without testing
- "Improvements" to working prompts in `prompts/manager.md` or `prompts/employee.md` without a benchmark showing the new prompt is better

## Reporting security issues

**Do not open a public issue for security problems.** See [SECURITY.md](./SECURITY.md) for the disclosure process.

## License

By contributing, you agree your work is released under the [Apache 2.0 License](./LICENSE).
