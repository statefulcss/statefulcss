<a id="top"></a>

<div align="center">
  <a href="https://statefulcss.com/">
    <img src="https://avatars.githubusercontent.com/u/195493678?s=150" alt="Stateful CSS Logo" width="150" height="150" />
  </a>
  <h1>Stateful CSS</h1>
  <p>
    CSS framework for building maintainable design systems and styling stateful components with modern, semantic, native web platform features.
  </p>
  <p>
    <a href="https://www.statefulcss.com">Website</a>
    &middot;
    <a href="https://github.com/statefulcss/statefulcss/issues/new?template=bug_report.md">Report Bug</a>
    &middot;
    <a href="https://github.com/statefulcss/statefulcss/issues/new?template=feature_request.md">Request Feature</a>
  </p>
</div>

<details>
<summary>Table of Contents</summary>

- [About the Project](#about-the-project)
  - [Supported CSS and Web Platform Features](#supported-css-and-web-platform-features)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Usage](#usage)
- [Packages](#packages)
- [License](#license)
- [Maintainers](#maintainers)

</details>

## About the Project

## Getting Started

Stateful CSS is a CSS framework designed to help developers build maintainable design systems and style stateful components using modern, semantic, and native web platform features. It leverages the latest CSS capabilities to provide a robust foundation for styling web applications.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Prerequisites

Stateful CSS requires a modern web browser that supports the latest CSS features, including:

- Cascade Layers
- Custom Properties
- Container Queries

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Installation

Stateful CSS can be installed via npm. Run the following command in your terminal:

```bash
# npm package manager
npm install @statefulcss/core

# pnpm package manager
pnpm add @statefulcss/core

# yarn package manager
yarn add @statefulcss/core

# bun package manager
bun add @statefulcss/core
```

You can also install specific packages as needed:

```bash
npm install @statefulcss/reset
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Usage

To use Stateful CSS in your project, you can import the core styles and any additional packages you need. Here’s a basic example:

```css
@import '@statefulcss/core';
```

Alternatively, you can import specific packages as needed:

```css
@import '@statefulcss/reset';
```

```css
@import '@statefulcss/typography';
```

```css
@import '@statefulcss/spacing';
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Packages

| Package                                          | Description                                      |
| ------------------------------------------------ | ------------------------------------------------ |
| [@statefulcss/core](./packages/core)             | Foundational styles and utilities.               |
| [@statefulcss/reset](./packages/reset)           | Reset provides a consistent baseline for styles. |
| [@statefulcss/typography](./packages/typography) | Typography styles for text and fonts.            |
| [@statefulcss/spacing](./packages/spacing)       | Utilities for margins and paddings.              |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Contributing

You can see the [Contributing Guide](CONTRIBUTING.md) for more information on how to contribute to Stateful CSS.
Also please read the [Code of Conduct](CODE_OF_CONDUCT.md) to understand how we expect all contributors to behave.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## License

Stateful CSS is licensed under the [MIT License](LICENSE)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Maintainers

Stateful CSS is developed and maintained by [Ömer Balyali](https://github.com/omerbalyali) and
[Human Interface Studio](https://humaninterface.studio).

<p align="right">(<a href="#readme-top">back to top</a>)</p>
