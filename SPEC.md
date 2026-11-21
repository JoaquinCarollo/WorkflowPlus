# WorkFlowPlus Functional Specification

## Purpose

WorkFlowPlus is a multi-tenant SaaS application for organizations to organize employees and assign work with explainable AI-assisted recommendations.

## Actors

| Actor              | Capabilities                                                                      |
| ------------------ | --------------------------------------------------------------------------------- |
| Organization owner | Creates the organization, manages members, settings, and billing.                 |
| Manager            | Manages employees, skills, availability, tasks, assignments, and recommendations. |
| Employee           | Updates availability, views assigned work, and updates task status.               |
| AI coordinator     | Produces assignment proposals by combining specialist assessments.                |

## MVP functional scope

1. Organization authentication and onboarding with Supabase Auth. Employee access is invitation-only through an emailed code that the employee can reuse on every sign-in; employees do not register or use email/password to sign in.
2. Member, role, skill, category, and availability management.
3. Task creation with category, priority, deadline, required skills, and estimated effort.
4. Assignment workflow with workload visibility.
5. AI recommendation workflow that evaluates profile fit, availability/load, urgency, and output quality.
6. Explainable recommendation history, human approval, and audit events.

## Tenant security

- An organization is the data boundary.
- All organization-owned rows contain `organization_id`.
- PostgreSQL Row Level Security verifies active membership through `organization_members`.
- The API derives the authenticated user from a verified Supabase JWT and never trusts a client-supplied organization identity alone.
- Organization switching must require a membership check. Elevated roles are enforced in API policy checks and database policies where applicable.
- Employee access codes are cryptographically generated in the API, stored only as hashes, delivered through the configured transactional email provider, and reusable on every sign-in until the organization owner deletes the employee account.
- Organization registration requires a company name, email, password, and organization type. A deterministic completeness specialist returns missing field identifiers before account creation; the brief description is optional.

## Recommendation pipeline

1. Coordinator receives a task and a candidate set limited to its organization.
2. Profile specialist scores role and skill fit.
3. Availability specialist scores capacity and conflicting assignments.
4. Priority specialist scores deadline risk and task urgency.
5. Coordinator ranks candidates and records factors plus model/version metadata.
6. Quality reviewer validates completeness, tenant scope, unsupported claims, and confidence before publication.
7. A manager approves or rejects a recommendation; the decision is auditable.

## Non-functional requirements

- React + TypeScript frontend, Node.js + TypeScript API, PostgreSQL through Supabase.
- Mobile-first responsive layout and accessible interactive elements.
- No database service key in the frontend bundle.
- Feature delivery must pass `npm run check`.
