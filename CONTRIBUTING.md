# Contributing to HighFlow

Thank you for your interest in contributing to HighFlow!

## Branching Strategy

This project follows **Git Flow**.

- **`main`**: Production code.
- **`develop`**: Main development branch. All feature branches should be merged here.

Please read [docs/GIT_FLOW.md](docs/GIT_FLOW.md) for detailed instructions on the branching model and workflow.

## Getting Started

1.  Clone the repository.
2.  Switch to the `develop` branch:
    ```bash
    git checkout develop
    ```
3.  Install dependencies:
    ```bash
    pnpm install
    ```
4.  Run development server:
    ```bash
    pnpm dev:all
    ```

## Submitting Changes

1.  Create a feature branch from `develop`:
    ```bash
    git checkout -b feature/your-feature-name develop
    ```
2.  Commit your changes.
3.  Push to origin and create a Pull Request targeting **`develop`**.

## Code Style

- We use Prettier and ESLint.
- Please run `pnpm lint` before submitting.
