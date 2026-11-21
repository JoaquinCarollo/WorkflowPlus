# Agent Contracts

The API will implement these contracts in `apps/api/src/domain/agents/`. Routes only authenticate, validate input, and call the coordinator.

## Coordinator input

```ts
interface RecommendationRequest {
  organizationId: string;
  taskId: string;
  requestedBy: string;
}
```

The coordinator must validate the requester membership, load only records whose `organization_id` matches the request, and pass a minimised tenant-scoped view to every specialist.

## Specialists

| Specialist                | Input                                                       | Output                                            |
| ------------------------- | ----------------------------------------------------------- | ------------------------------------------------- |
| Employee profile          | Required task skills and candidate role/skills              | Skill and role-fit score with evidence            |
| Availability and workload | Candidate capacity, availability blocks, active assignments | Capacity score and conflicts                      |
| Priority and deadline     | Task priority, due date, effort, task queue                 | Urgency score and scheduling risks                |
| Recommendation quality    | Candidate ranking and all specialist evidence               | Publish/reject decision, confidence, and findings |

Every specialist result must include `organizationId`, `taskId`, `agentVersion`, evidence, and a score. Specialists cannot perform writes. The coordinator is the only component allowed to persist a proposal after the quality reviewer accepts it.

## Persistence and audit

Recommendations are immutable proposals in `ai_recommendations`; a later feature will add a dedicated decision/audit table. Prompts, logs, and persisted rationales must omit unnecessary personal data and must never combine organizations.

## Access specialists

These deterministic specialists are implemented in `apps/api/src/domain/auth/access-agents.ts`; they are not LLM calls.

| Specialist                 | Input                                                          | Output                                                           |
| -------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------- |
| Credential verifier        | Boolean results from Supabase Auth/account lookup              | Whether an account exists and supplied credentials were accepted |
| Organization access policy | Registration or sign-in intent plus credential-verifier result | Allow/deny and an explainable reason                             |
| Registration completeness  | Organization registration form values                          | Required field keys that are missing                             |

Passwords are never sent to an agent, logged, compared by the application, or stored outside Supabase Auth. The verifier only accepts boolean evidence produced by the authentication provider. Public responses for invalid access should remain generic to avoid account enumeration.

The registration-completeness specialist checks only whether company name, email, password, and organization type contain a value. It returns field identifiers, never field values or passwords, so the primary access flow can show the required-field message.

## Employee code access

Employees cannot register or sign in with an email, name, or password. An owner or manager creates an invitation with the employee's first name, last name, email, and position; the form has no id field. The API generates a unique employee id server-side, a cryptographically secure reusable code, stores only its SHA-256 digest in `employee_access_invites`, and sends the original code through the configured transactional email provider. When the employee signs in with the code (`POST /employees/sign-in`), that system-generated id is assigned to the employee session, and the same code can be used again on every later sign-in until the owner deletes the employee account. Code validation and membership creation run server-side with the service-role credential; the browser never receives that credential.

| Specialist                 | Input                                                          | Output                                                              |
| -------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------- |
| Invitation completeness    | First name, last name, email, position                         | Required field keys that are missing                                |
| Employee email uniqueness  | Tenant-scoped email plus all existing employee emails (global) | Whether the mail already exists anywhere on the platform            |
| Access-code uniqueness     | All existing code digests (global)                             | A fresh code whose digest no employee already has                   |
| Employee invitation policy | Completeness and email-uniqueness assessments                  | Allow/deny with `email_already_exists`, `incomplete`, or `approved` |

The email-uniqueness sub-agent runs before any mail is sent. On a duplicate it reports `email_already_exists` through the policy agent and the API answers 409, so the user sees "El mail ya existe. Por favor ingrese un mail diferente." and no code is generated or delivered. The code-uniqueness sub-agent regenerates until the digest is unused, guaranteeing no two employees on the whole platform share a code. The transactional mailer delivers the code to the entered email through SMTP when `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` are configured, or posts to `TRANSACTIONAL_EMAIL_API_URL` when configured; in local development without a provider it queues the message in the dev outbox only, readable at `GET /__dev__/employee-code-emails` (never in production).
