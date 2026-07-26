# 07 — Default `<Paywall>` component

**What to build:** A thin, unstyled default component built on `usePaywall`, so a developer who doesn't want to build custom gating UI can drop it straight into an app. From a developer's perspective: wrap gated content in `<Paywall resource={...}>...</Paywall>` and get a pay button when access isn't granted, or the children when it is — zero custom wiring required.

**Blocked by:** 06 — React hook (usePaywall).

**Status:** ready-for-agent

- [ ] `<Paywall>` component exported from the `/react` entry point, built on `usePaywall`
- [ ] Renders a pay button (wired to the hook's pay action) when access is not granted
- [ ] Renders its children when access is granted (permanent or timed-and-not-expired)
- [ ] No bundled styling system — minimal, unstyled markup only, per the spec's out-of-scope note
- [ ] The hook itself remains independently exported and usable without the component, for developers building custom UI — matches spec user story 3
