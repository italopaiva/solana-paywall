# 01 — Project scaffolding

**What to build:** The package skeleton that every later ticket builds on: a single npm package with two entry points — a framework-agnostic core at the package root, and a `/react` entry point that will re-export the core plus the hook and component built in later tickets. TypeScript configured, Vitest wired up as the test runner, and a build set up that produces both entry points correctly.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Package builds and produces two resolvable entry points: the root (core) and `/react`
- [ ] A placeholder export from each entry point can be imported and used from a consuming TypeScript file (proves the package shape actually resolves, not just that the build succeeds)
- [ ] `pnpm test` (or equivalent) runs Vitest successfully against a trivial placeholder test
- [ ] TypeScript strict mode on, no `any` per project conventions
