# Dawn Reader agent workflow

The current project phase is **cloud-first exploration**. Read
[`docs/development-workflow.md`](docs/development-workflow.md) before changing
the product.

- Treat the local checkout as a patch-staging surface, not the default runtime
  or acceptance environment.
- Do not start a local development server, Simulator, or local browser QA by
  default. Do not make local test/build results the delivery gate.
- For small, reversible Web changes, use a short-lived `codex/*` branch and PR,
  make GitHub Actions the primary test/build/security gate, merge when green,
  then deploy that exact `main` SHA to the current Sites development
  environment and perform a focused cloud smoke check.
- Give extra review and an explicit migration/rollback plan to changes that
  affect durable data, migrations, authentication, permissions, deletion,
  sync, external writes, dependencies/runtime, or overlapping parallel work.
- A Sites-required local build/package step is allowed as transport plumbing;
  it is not acceptance evidence and should not expand into local manual QA.
- iOS work is an explicit exception until cloud macOS CI/TestFlight exists.
  Do not claim iPhone/iPad parity from Web cloud checks.
- Keep facts distinct: pushed code, green CI, saved Sites version, deployed
  version, cloud smoke check, and real-user acceptance are separate states.
- Never force-push shared branches. Preserve unrelated and untracked user work.
