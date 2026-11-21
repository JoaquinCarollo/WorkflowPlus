# WorkFlowPlus: Guide for Agents

## Project conventions

- Use TypeScript strictly; do not use `any`.
- Preserve tenant isolation. Every organization-owned query, API contract, and test must carry and validate `organizationId`.
- The browser uses the Supabase anonymous key only. Service-role credentials stay exclusively in the API environment.
- New database objects require a timestamped migration in `supabase/migrations/`, RLS policies, and tests or documented verification.
- Keep API routes thin; place reusable business rules in `apps/api/src/domain/`.
- Responsive UI is required from the first component: mobile first, with keyboard and accessible labels/states.

## Quality gate

- Run `npm run check` before marking work complete. It runs formatting, linting, type checking, and tests.
- A feature is complete only when its `features.json` entry is `done`, its acceptance criteria are met, and `npm run check` passes.
- If verification fails, make at most 3 focused correction iterations. Record each failure and result in `PROGRESS.md`. After the third failed attempt, stop and document the blocker instead of masking it.

## Agent collaboration model

- The coordinator receives the tenant-scoped task context, asks specialists for structured assessments, resolves conflicts, and produces a recommendation with evidence.
- Specialists never write to production tables directly. They return versioned, explainable results for review.
- Required specialists: employee-profile analysis, availability/workload analysis, priority/deadline analysis, recommendation-quality review, credential verification, organization access policy, and registration completeness.
- Credential verification consumes only provider-produced boolean evidence; it must never receive, log, compare, or persist a password.
- Never include secrets, personal data unnecessary to the task, or cross-tenant records in agent prompts or logs.

## Change workflow

1. Read `SPEC.md`, `features.json`, and `PROGRESS.md` before implementing a feature.
2. Make the smallest correct change and update the relevant feature state.
3. Add or update tests for behavior and tenant boundaries.
4. Run `npm run check`; update `PROGRESS.md` with the verification result.
