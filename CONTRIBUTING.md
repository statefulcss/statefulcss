# Contributing to Stateful CSS

Thank you for your interest in contributing to Stateful CSS! We welcome contributions of all kinds — bug reports, feature requests, documentation improvements, and code changes.

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md) before participating. To report a security vulnerability, follow the [Security Policy](SECURITY.md) instead of opening a public issue.

## Table of Contents

- [Getting Started](#getting-started)
- [Prerequisites](#prerequisites)
- [Setting Up the Project](#setting-up-the-project)
- [Development Workflow](#development-workflow)
- [Submitting a Contribution](#submitting-a-contribution)
- [Coding Guidelines](#coding-guidelines)
- [Reporting Issues](#reporting-issues)
- [License and Contribution Terms](#license-and-contribution-terms)

## Getting Started

This project is a monorepo managed with [Turborepo](https://turborepo.dev/) and [pnpm](https://pnpm.io/):

- `apps/web` — the [statefulcss.com](https://statefulcss.com) website and documentation
- `packages/cli` — the `statefulcss` command line tool
- `packages/stylelint-plugin` — the `@statefulcss/stylelint-plugin` Stylelint plugin
- `packages/core` — `@statefulcss/core`, the model of a stylesheet the plugin and other tools read
- `packages/config` — `@statefulcss/config`, which finds, loads and checks `statefulcss.config.json`
- `packages/eslint-config`, `packages/tsconfig` — shared internal configuration

## Prerequisites

- [Node.js](https://nodejs.org/) 24.21 or newer — the exact version is in [`.nvmrc`](.nvmrc), so `nvm use` or `fnm use` picks it up
- [pnpm](https://pnpm.io/installation) — install it any way you like; pnpm downloads and runs the version pinned in the `packageManager` field of `package.json`

These versions apply to working on this repository. The published packages support older Node.js versions; see each package's `engines` field.

## Setting Up the Project

1. **Fork** the repository on GitHub, then clone your fork and add the original repository as `upstream`:

```bash
git clone https://github.com/<your-username>/statefulcss.git
cd statefulcss
git remote add upstream https://github.com/statefulcss/statefulcss.git
```

2. **Install dependencies.** This also installs the Git hooks that format, lint, and check commit messages:

```bash
pnpm install
```

3. **Build all packages:**

```bash
pnpm build
```

4. **Start the development servers:**

```bash
pnpm dev
```

You can target a specific package or app with a [Turborepo filter](https://turborepo.dev/docs/crafting-your-repository/running-tasks#using-filters):

```bash
pnpm dev --filter=web
pnpm test --filter=@statefulcss/stylelint-plugin
```

## Development Workflow

1. Create a new branch from an up-to-date `main`:

```bash
git switch main
git pull upstream main
git switch -c feat/my-feature
```

2. Make your changes.

3. Run the same checks as CI:

```bash
pnpm format:check
pnpm lint
pnpm check-types
pnpm test
pnpm build
```

For website changes, also run the browser tests against a production build. The first run needs the Chromium browser (`pnpm --filter web exec playwright install chromium`):

```bash
pnpm build --filter=web
pnpm --filter web test:e2e
```

4. Format your code with `pnpm format` if needed.

5. Commit your changes. We use the [Conventional Commits](https://www.conventionalcommits.org/) specification with a required scope, checked by a commit hook.

Use the package or repo area as the scope:

- `web` for `apps/web`
- `cli` for `packages/cli`
- `stylelint` for `packages/stylelint-plugin`
- `config` for `packages/config`
- `core` for `packages/core`
- `eslint-config` for `packages/eslint-config`
- `tsconfig` for `packages/tsconfig`
- `repo` for repo-wide changes such as CI, release tooling, root config, docs, or housekeeping

```
feat(stylelint): add new rule for stateful selectors
fix(web): fix typo in getting started page
docs(repo): document npm release workflow
```

6. If your change affects a published package (`statefulcss` or `@statefulcss/stylelint-plugin`), add a changeset describing it:

```bash
pnpm changeset
```

7. Push the branch to your fork and open a Pull Request against `main`.

## Submitting a Contribution

### Pull Requests

- Open your PR against the `main` branch.
- Give the PR a Conventional Commits title, such as `fix(web): fix typo in getting started page`. Small PRs are squash-merged, so the title becomes the commit message on `main`; a CI check enforces this.
- Provide a clear description of **what** the PR does and **why**.
- Link any related issues (e.g., `Closes #42`).
- Keep PRs focused — one feature or fix per PR.
- Ensure all CI checks pass before requesting a review.

PRs from forks run the full test suite, but not the website preview deployment, which needs repository secrets. A maintainer can deploy a preview after reviewing your changes.

### Code Review

All submissions require review before merging. Maintainers may request changes, ask questions, or suggest improvements. Please be responsive to feedback.

## Coding Guidelines

- **TypeScript** is used throughout the project. Ensure your code is properly typed.
- **Prettier** is used for formatting. Run `pnpm format` before committing.
- **ESLint** is used for linting. Ensure `pnpm lint` passes with no warnings.
- Write clear, self-documenting code and add comments where intent isn't obvious.
- Add or update tests when applicable.

## Reporting Issues

If you find a bug or have a feature request, please [open an issue](https://github.com/statefulcss/statefulcss/issues) and include:

- A clear and descriptive title.
- Steps to reproduce the issue (for bugs).
- Expected vs. actual behavior.
- Your environment (OS, Node.js version, browser, etc.).
- Any relevant logs or screenshots.

## License and Contribution Terms

By submitting a contribution, you confirm that it is your own work, or that you otherwise have the right to submit it under these terms.

- **Packages and repository tooling** (everything except `apps/web`): your contributions are licensed under the [MIT License](LICENSE), the same license as the code you are contributing to.
- **Website and documentation** (`apps/web`): this directory is not open source; see [`apps/web/LICENSE`](apps/web/LICENSE). By contributing to it, you grant Ömer Balyalı (Human Interface Studio) a non-exclusive, perpetual, irrevocable, worldwide, royalty-free right to use, reproduce, modify, publish, and distribute your contribution, to sublicense these rights, and to relicense the contribution, including under the terms that apply to `apps/web`. You keep the right to use your own contribution elsewhere. Code examples you contribute to the documentation are published under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), like all code examples on the website.
