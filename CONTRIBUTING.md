# Contributing to Stateful CSS

Thank you for your interest in contributing to Stateful CSS! We welcome contributions of all kinds — bug reports, feature requests, documentation improvements, and code changes.

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

## Table of Contents

- [Getting Started](#getting-started)
- [Prerequisites](#prerequisites)
- [Setting Up the Project](#setting-up-the-project)
- [Development Workflow](#development-workflow)
- [Submitting a Contribution](#submitting-a-contribution)
- [Coding Guidelines](#coding-guidelines)
- [Reporting Issues](#reporting-issues)
- [License](#license)

## Getting Started

This project is a monorepo managed with [Turborepo](https://turborepo.dev/) and [pnpm](https://pnpm.io/). It contains multiple apps and packages under the `apps/` and `packages/` directories.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 24
- [pnpm](https://pnpm.io/) >=10 (managed via `packageManager` field)

## Setting Up the Project

1. **Fork** the repository and clone your fork:

```bash
git clone https://github.com/statefulcss/statefulcss.git
cd statefulcss
```

2. **Install dependencies:**

```bash
pnpm install
```

3. **Build all packages:**

```bash
turbo build
```

4. **Start the development server:**

```bash
turbo dev
```

You can target a specific package or app using a filter:

```bash
turbo dev --filter=stylelint-plugin
```

## Development Workflow

1. Create a new branch from `main`:

```bash
git checkout -b feat/my-feature
```

2. Make your changes.

3. Run linting and type checks:

```bash
turbo lint
turbo check-types
```

4. Format your code:

```bash
pnpm format
```

5. Commit your changes with a clear, descriptive commit message. We recommend following the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
feat(stylelint): add new rule for stateful selectors
fix(docs): fix typo in getting started page
docs: update contributing guide
```

6. Push your branch and open a Pull Request.

## Submitting a Contribution

### Pull Requests

- Open your PR against the `main` branch.
- Provide a clear description of **what** the PR does and **why**.
- Link any related issues (e.g., `Closes #42`).
- Keep PRs focused — one feature or fix per PR.
- Ensure all CI checks pass before requesting a review.

### Code Review

All submissions require review before merging. Maintainers may request changes, ask questions, or suggest improvements. Please be responsive to feedback.

## Coding Guidelines

- **TypeScript** is used throughout the project. Ensure your code is properly typed.
- **Prettier** is used for formatting. Run `pnpm format` before committing.
- **ESLint** is used for linting. Ensure `turbo lint` passes with no warnings.
- Write clear, self-documenting code and add comments where intent isn't obvious.
- Add or update tests when applicable.

## Reporting Issues

If you find a bug or have a feature request, please [open an issue](https://github.com/statefulcss/statefulcss/issues) and include:

- A clear and descriptive title.
- Steps to reproduce the issue (for bugs).
- Expected vs. actual behavior.
- Your environment (OS, Node.js version, browser, etc.).
- Any relevant logs or screenshots.

## License

By contributing to this project, you agree that your contributions will be licensed under the [MIT License](LICENSE), with the exception of `apps/docs`, which has its own license. Please review the `LICENSE` file for details.
