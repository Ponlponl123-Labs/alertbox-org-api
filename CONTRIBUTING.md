# Contributing to Alertbox API

Thanks for contributing to the Alertbox API!

---

## Development Guidelines

1. **Runtime**: Use `bun`. Do not commit npm or yarn lockfiles.
2. **Type Safety**: Keep all types in `src/types/*.types.ts` and re-export via `src/types/index.ts`. All endpoints and schemas must use TypeBox validation.
3. **Database Changes**: Always update `prisma/schema.prisma` and test with `bun x prisma generate` before submitting PRs.
4. **Security**: Ensure all external webhook endpoints use timing-safe HMAC validation via `src/utils/signature.ts`.

---

## Pre-PR Checklist

Make sure all checks pass before opening your pull request:

```bash
# 1. Generate Prisma Client
bun x prisma generate

# 2. Strict Typecheck
bun x tsc --noEmit

# 3. Unit Tests
bun test

# 4. Compile Check
bun run build
```

---

## Submitting Pull Requests

1. Fork the repo and create your branch (`feature/my-feature` or `fix/issue-description`).
2. Commit your changes with clear messages.
3. Open a Pull Request against `main`.
4. Ensure the GitHub Actions CI pipeline passes.
