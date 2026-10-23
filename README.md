# Stateful CSS

Stateful CSS is a CSS methodology in which styles follow state: the markup says what state a component is in, and the CSS reads it. A Stylelint plugin turns its principles into checks.

Read the documentation at [statefulcss.com](https://statefulcss.com/docs/).

## Packages

| Package                                                        | What it is                                                           | Status         |
| -------------------------------------------------------------- | -------------------------------------------------------------------- | -------------- |
| [`@statefulcss/stylelint-plugin`](./packages/stylelint-plugin) | The Stylelint rules, with the `recommended` and `compatible` configs | In development |
| [`statefulcss`](./packages/cli)                                | Command line tools                                                   | Published      |

The repository also holds the website and its documentation in [`apps/web`](./apps/web), and the shared ESLint and TypeScript configurations in [`packages/eslint-config`](./packages/eslint-config) and [`packages/tsconfig`](./packages/tsconfig).

## Development

You need Node.js 24.21 or newer (the exact version is in [`.nvmrc`](./.nvmrc)) and [pnpm](https://pnpm.io/installation). Any recent pnpm works: it downloads and runs the version pinned in the `packageManager` field of `package.json`.

```bash
pnpm install
pnpm build
```

| Command             | What it does                                |
| ------------------- | ------------------------------------------- |
| `pnpm dev`          | Starts the website and watches the packages |
| `pnpm build`        | Builds every package and the website        |
| `pnpm lint`         | Lints every package and the website         |
| `pnpm check-types`  | Type-checks every package and the website   |
| `pnpm test`         | Runs the unit tests                         |
| `pnpm format:check` | Checks formatting with Prettier             |

To run a command for one package, add a [Turborepo filter](https://turborepo.dev/docs/crafting-your-repository/running-tasks#using-filters), for example `pnpm test --filter=@statefulcss/stylelint-plugin`.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the workflow, the commit format and changesets. Everyone taking part follows the [Code of Conduct](./CODE_OF_CONDUCT.md). To report a vulnerability privately, see [SECURITY.md](./SECURITY.md).

## Licensing

This is a multi-license repository.

- The repository root and packages are MIT-licensed unless a package says otherwise.
- `apps/web`, the website, is source-available and all rights reserved, including its code, design and content. It is not MIT-licensed. Code examples on the website are free to use under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
- See each package or app `LICENSE` file for the authoritative license terms.

Maintained by [Human Interface Studio](https://humaninterface.studio).
