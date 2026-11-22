# Progress Log

## 2026-11-04

- Initialized the WorkFlowPlus architecture from an empty workspace.
- Added frontend, API, shared domain types, Supabase schema baseline, quality tooling, and project harness files.
- Verification attempt 1/3: `npm run check` stopped at Prettier; it reported formatting in five files. Applied the configured formatter.
- Verification attempt 2: `npm run check` passed format, lint, TypeScript checks, and tests. Root ESM declaration and agent contract documentation were then added.
- Verification attempt 3/3: the check initially stopped at Prettier because the new agent contract document needed formatting. The configured formatter was applied, then `npm run check` passed format, lint, TypeScript checks, and both test suites.
- Correction iterations for this session: 2/3. No blockers remain.

## 2026-11-04 - Workspace interface

- Replaced the web placeholder with a responsive presentation and workspace interface for overview, tasks, employees, and unauthenticated login flows.
- Added a visual new-task form; persistence and authentication remain intentionally unimplemented until their respective features begin.
- Verification: `npm run check` passed format, lint, TypeScript checks, and both test suites.

## 2026-11-04 - Authentication policy and employee codes

- Added deterministic credential-verification and organization-access-policy agent contracts. They use boolean evidence from Supabase Auth and never receive passwords.
- Added a tenant-scoped employee invitation schema with RLS, expiration, one-time status, role restrictions, and SHA-256 code digests.
- Added the employee-code login UI and the owner/manager invitation form. Live Supabase Auth, transactional email delivery, and code redemption endpoints remain to be connected before these access features can be marked done.
- Verification: `npm run check` passed format, lint, TypeScript checks, 6 API tests, and the web test.

## 2026-11-04 - Brand rename

- Renamed the visible product and organization brand from TaskFlow AI to WorkFlowPlus.
- Verification attempt 1/3: `npm run check` stopped at Prettier for `apps/web/src/App.tsx`; applying the configured formatter before retrying.
- Verification attempt 2: `npm run check` passed format, lint, TypeScript checks, 6 API tests, and the web test.

## 2026-11-04 - Public and private navigation

- Updated the navigation boundary: unauthenticated visitors see only Inicio and access/registration; authenticated visitors see only the workspace sections.
- Expanded the public landing page with Quiénes somos, Nuestro objetivo, and A qué nos dedicamos.
- The successful-access transition is currently a local demonstration state and will be replaced by the pending Supabase Auth/code-redemption integration.
- Verification: `npm run check` passed format, lint, TypeScript checks, 6 API tests, and the web test.

## 2026-11-04 - Organization registration

- Created a separate public organization-registration page with company name, email, password, organization type, and optional brief description.
- Added the registration-completeness specialist. It returns only missing required-field identifiers so the primary flow can alert the user without exposing field values or passwords.
- The form validates the four required fields before the existing demonstration-only authentication transition. Live Supabase registration remains pending.
- Verification: `npm run check` passed format, lint, TypeScript checks, 8 API tests, and the web test.

## 2026-11-06 >= Organization access verification and welcome email

- Provider-first organization access: `apps/api/src/domain/auth/organization-access.ts` coordinates the credential-verifier and organization-access-policy agents with Supabase Auth. Registration verifies the email does not already exist in the company account database; duplicates are denied with `account_already_exists`. On successful registration the flow reports `email_sent` when Supabase requires mail confirmation, so the just-registered address receives the message. Sign-in verifies that the provider accepts the matching email/password pair; mismatches are denied with `invalid_credentials` without exposing passwords.
- Added thin API routes `POST /auth/organizations/register` and `POST /auth/organizations/sign-in` with Zod validation; routes return 409 for duplicate registration and 401 for denied sign-in.
- Connected the web registration and organization login forms to the API (`apps/web/src/api.ts`) with accessible error alerts, submitting states, and specific messages for duplicate accounts, mail confirmation, and invalid credentials. The service-role key remains server-only.
- Added `apps/web/src/vite-env.d.ts` for VITE_API_URL typing.
- Verification attempt 1/3: `npm run check` stopped at Prettier formatting in the new API/web files. Applied the configured formatter.
- Verification attempt 2: `npm run check` passed format and lint, then stopped at web typecheck because `import.meta.env` had no Vite client types. Added `vite-env.d.ts`; correction iteration 1/3.
- Verification attempt 3: `npm run check` passed format, lint, TypeScript checks, 13 API tests, and the web test. No blockers remain.

## 2026-11-08 - Employee invitation form with unique email and code

- The "Generar código" button now opens a form with Nombre, Apellido, Mail, Puesto and an automatically generated Id (read-only UUID generated when the form opens), and an "Enviar" button at the bottom.
- Added employee invitation sub-agents in `apps/api/src/domain/auth/employee-invitation.ts`: completeness, email-uniqueness (global across the whole platform), access-code uniqueness (regenerates until the SHA-256 digest is unused by any employee), and the invitation policy agent that reports duplicates to the user as "El mail ya existe. Por favor ingrese un mail diferente." without generating or sending a code.
- Added `POST /employees/invites` (requires and validates `organizationId`); on success it stores only the code digest and sends the raw code once to the entered mail through the transactional mailer (`TRANSACTIONAL_EMAIL_API_URL`); in local development without a provider the message is queued in the dev outbox only. The API response never contains the raw code.
- Added migration `20261108000001_employee_invitation_profile_fields.sql` with first/last name and position columns and global unique indexes for active recipient emails and code digests.
- Verification attempt 1/3: `npm run check` stopped at Prettier formatting in the new/modified files. Applied the configured formatter.
- Verification attempt 2: `npm run check` passed format, lint, TypeScript checks, 26 API tests, and the web test. No blockers remain.

## 2026-11-08 - Employee id generated by the system, assigned at code sign-in

- Correction: the Id no longer appears in the invitation form and the sender never chooses it. The API always generates a unique UUID server-side (`generateUniqueEmployeeId`), one per employee, ignoring any client-supplied id (the `id` field was removed from the request schemas and shared types).
- Added `POST /employees/sign-in`: redeeming the emailed code assigns the stored system id to the employee, marks the invitation redeemed, and rejects expired, reused, wrong-organization, or unknown codes. The web employee login now calls this endpoint with the entered code instead of the previous local demo transition.
- Verification attempt 1/3: `npm run check` stopped at Prettier formatting in the new test file. Applied the configured formatter.
- Verification attempt 2: `npm run check` passed format, lint, TypeScript checks, 30 API tests, and the web test. No blockers remain.

## 2026-11-08 - Empty tasks/employees sections, joined employees, and account deletion

- Removed the hardcoded demo tasks and employees. The Tareas section now shows an empty state ("Todavía no hay tareas") until a task is created, and the Empleados section shows an empty state ("Todavía no hay empleados") until an employee signs in with the emailed code.
- Added tenant-scoped tasks API: `POST /tasks` (title, priority, optional responsable who must be a joined employee of the same organization), `GET /tasks?organizationId=...`. The New Task form now creates the task through the API and it appears in the list with its responsable.
- Added employee directory API: `GET /employees?organizationId=...` returns only employees who redeemed their code (joined), and `DELETE /employees/:employeeId?organizationId=...` permanently removes the account when the organization owner decides; the profile disappears from Empleados and can no longer sign in. The employee card now shows first/last name, position and email, with an accessible Eliminar button.
- Verification attempt 1/3: `npm run check` stopped at Prettier formatting in the new/modified files. Applied the configured formatter.
- Verification attempt 2: `npm run check` passed format, lint, TypeScript checks, 36 API tests, and the web test. No blockers remain.

## 2026-11-08 - Overview with null values and Sin Novedades when there are no tasks

- Removed the hardcoded overview numbers. The Vista general now derives its stats from the real tasks of the organization (`buildOverviewStats`, loaded on the overview page too): with no assigned tasks every value is null (`—`, "Sin datos"), the weekly-progress card shows "Sin actividad todavía", and the attention card shows "Sin Novedades" without action buttons. With tasks, the counts reflect the real assigned/pending tasks.
- Verification attempt 1/3: `npm run check` stopped at Prettier formatting in `apps/web/src/App.tsx`. Applied the configured formatter.
- Verification attempt 2: `npm run check` passed format, lint, TypeScript checks, 36 API tests, and 3 web tests. No blockers remain.

## 2026-11-08 - Single password recovery link in login

- The login form now shows the single line "¿Olvidaste tu contraseña? Recuperala" below the Continuar button, where only the word "Recuperala" is the link/button to the password recovery section.
- Verification: `npm run check` passed format, lint, TypeScript checks, 36 API tests, and 3 web tests. No blockers remain.

## 2026-11-08 - Employee code really delivered to the entered email

- Answer to the check: before this change, Enviar called the API with the entered email but, without a configured provider, the code only stayed in an in-memory dev outbox and never reached a real inbox (fake success). Fixed: the default mailer now sends the code by SMTP (nodemailer) to the entered email when `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` are set in `apps/api/.env`, keeping the `TRANSACTIONAL_EMAIL_API_URL` HTTP option. If delivery fails, the invitation is rolled back and the user sees an error instead of a fake success.
- Added dev-only `GET /__dev__/employee-code-emails` (never in production) so in local development the queued code can be read and used to test the employee sign-in end to end.
- Verification: `npm run check` passed format, lint, TypeScript checks, 39 API tests, and 3 web tests. No blockers remain.

## 2026-11-08 - Live verification of code delivery configuration

- Checked the real configuration: `apps/api/.env` has no SMTP or transactional-email variables yet, so real inbox delivery is not active; the code only goes to the dev outbox locally. Web `VITE_API_URL=http://localhost:3001` matches the API `PORT=3001`, and `WEB_ORIGIN` matches the Vite default.
- Ran the API live (port 3017) and verified end to end: `POST /employees/invites` returned `email_sent` with a system-generated employee id; `GET /__dev__/employee-code-emails` contained the code addressed to the entered email with the matching employee id; the employee list was empty before sign-in; `POST /employees/sign-in` with that code assigned the same id; the employee list then showed the joined profile.
- To send the code to a real inbox, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `TRANSACTIONAL_EMAIL_FROM` in `apps/api/.env` (or `TRANSACTIONAL_EMAIL_API_URL`/`TRANSACTIONAL_EMAIL_API_KEY`) and restart the API.

## 2026-11-08 - Employee access code is reusable on every sign-in

- Removed the single-use behavior: `redeemEmployeeAccessCode` no longer consumes the code or enforces expiration, so the employee can sign in with the same emailed code as many times as needed, always receiving the same system-generated employee id. The code stops working only when the organization owner deletes the employee account (the record is removed). Updated the invitation confirmation copy ("podrá usarlo en cada inicio de sesión") and the SPEC/agents/Supabase docs accordingly.
- Verification attempt 1/3: `npm run check` stopped at Prettier formatting in the updated test file. Applied the configured formatter.
- Verification attempt 2: `npm run check` passed format, lint, TypeScript checks, 39 API tests, and 3 web tests. No blockers remain.

## 2026-11-08 - Password recovery recognized registered accounts

- Root cause: `createSupabaseAuthClient` bound `listUsers`/`updateUserById` on the public Supabase auth client, but those admin operations live under `auth.admin` in supabase-js. The real client therefore had no `listUsers`, `verifyAccountExists` always returned false, and recovery always answered "El mail no está registrado", while sign-in (a public method) worked. The unit tests hid the bug because their fake client implemented `listUsers` directly.
- Fix: wired `listUsers` and `updateUserById` through `auth.admin`, and made `findUserByEmail` paginate like `verifyAccountExists` (case-insensitive, all pages), so every successfully registered account is recognized by recovery.
- Live verification against the real Supabase project (no personal data disclosed): the wired client now exposes `listUsers`, the admin call returns users without error, and existence checks return false only for truly unknown emails.
- Verification attempt 1/3: `npm run check` stopped at Prettier formatting in `apps/api/src/domain/auth/organization-access.ts`. Applied the configured formatter.
- Verification attempt 2: `npm run check` passed format, lint, TypeScript checks, 41 API tests, and 3 web tests. No blockers remain.

## 2026-11-08 - Hidden reset section reached only from the recovery email link

- Root cause: the Supabase recovery link only landed on the home/login page because the web app never handled the recovery session/token, and the manual token page was disconnected from any real email.
- Fix: recovery now mints its own single-use token, stores only its digest, and emails a link (`/?token=...`) through the configured transactional mailer (SMTP/HTTP; dev outbox otherwise, readable at `GET /__dev__/recovery-emails`). Opening that link renders a hidden standalone section (no organization/employee navigation) with only two fields: Correo electrónico and Nueva contraseña. The API requires the entered email to match the recovery token's email (`email_mismatch`) and the new password to differ from the current one (`password_reused`, provider-first via Supabase Auth); the token is consumed on success. Removed the manual token page and its button from Password Recovery.
- Live verification: API up, unknown email correctly denied with `accountExists: false` and no mail sent; dev recovery endpoint responds.
- Verification attempt 1/3: `npm run check` stopped at Prettier formatting in 4 new/modified files. Applied the configured formatter.
- Verification attempt 2: `npm run check` passed format, lint, TypeScript checks, 42 API tests, and 3 web tests. No blockers remain.

## 2026-11-06 - Exact access messages and password recovery

- Updated the organization login-denied message to: 'El mail o contraseña que introdujo no son los correctos. Por favor introduzca los indicados'.
- Updated the registration-duplicate message to: 'El mail o contraseña que usted introdujo ya existe. Por favor ingrese un mail y/o contraseña diferentes'.
- Added password recovery agents (`password-reuse-check-v1`, `password-recovery-policy-v1`) and the `password_reset` intent to the access policy. Reset only succeeds when the new password differs from the currently forgotten one; provider-first, without the application receiving or logging passwords.
- Added `POST /auth/organizations/password-recovery` and `POST /auth/organizations/reset-password`. Recovery mail is sent only for existing accounts. Reset consumes a single-use, expiring token digest and redirects the user to the sign-in section on success.
- Added web sections for '¿Olvidaste tu contraseña? Recuperala' and new-password entry, wired to the new routes.
- Verification attempt 1/3: `npm run check` stopped at Prettier formatting in 5 new/modified files. Applied the configured formatter.
- Verification attempt 2: `npm run check` stopped at API typecheck because the Supabase admin typing did not expose `updateUserById` as configured. Narrowed the cast to the local admin interface; correction iteration 1/3.
- Verification attempt 3: `npm run check` passed format, lint, TypeScript checks, 19 API tests, and the web test. No blockers remain.

## 2026-11-09 - Nivel de Autoridad (Administrativo / Operario)

- Added `authorityLevel: 'administrative' | 'operative'` to the employee invitation flow: the "Generar código" form now has a required "Nivel de Autoridad" select (Nivel Administrativo / Nivel Operario). The level is stored on the employee record, returned by `POST /employees/invites` and `POST /employees/sign-in`, shown on each employee card, defaults to `operative` when omitted, and is persisted in Supabase via migration `20261109000001_employee_authority_level.sql` (enum + column, owner-only RLS on invites).
- Access policy: only the organization owner can invite employees (the "+ Generar código" button and the Eliminar button are hidden for employees, and the API answers 403 for employee actors on `POST /employees/invites` / `DELETE /employees/:id`). Both Nivel Administrativo and Nivel Operario employees see all organization tasks (their own and their teammates', including the empty state); only the owner and Nivel Administrativo employees see "+ Nueva tarea" and can create/assign tasks (`POST /tasks` answers 403 for Nivel Operario actors). The session (organization vs employee + level) is kept in App state and sent as trusted `x-actor-kind` / `x-actor-authority` headers until the verified-JWT middleware lands; missing headers keep the legacy demo behavior.
- Added policy helpers (`canInviteEmployees`, `canCreateTask`, `canDeleteEmployeeAccount`, `canViewOrganizationTasks` in the API, `canCreateTasksForSession` / `canInviteEmployeesForSession` in the web) and tests: default operative, administrative stored and returned on sign-in, and HTTP checks that employees cannot invite, operatives cannot create tasks, while administrators and the owner can.
- Verification attempt 1/3: `npm run check` stopped at Prettier formatting in 4 files. Applied the configured formatter.
- Verification attempt 2: `npm run check` passed format, lint, TypeScript checks, 46 API tests, and 4 web tests. No blockers remain.

## 2026-11-09 - Confirmación al eliminar empleado

- Replaced the direct "Eliminar" action with a confirmation dialog (`DeleteEmployeeConfirmation`): tapping Eliminar opens an `alertdialog` asking "¿Está seguro de querer eliminar al siguiente empleado?" and showing the employee to delete (Nombre, Apellido, Puesto and Nivel de autoridad as Nivel Administrativo / Nivel Operario). The dialog has exactly "Cancelar" (keeps the employee, closes the dialog) and "Confirmar" in red (`.button-danger`, shows "Eliminando…" while pending, errors stay open inside the dialog). `handleDeleteEmployee` now throws when the API does not delete, so the dialog reports failures instead of silently keeping the card.
- Confirmed deletion removes the employee from the database on Confirm: `DELETE /employees/:employeeId` deletes the invitation record, so the stored email and the access-code digest are erased from the database. Verified by a new test: after deletion the original code no longer signs in (`redeemEmployeeAccessCode` denied) and the same email can be invited again with a new code and id.
- Added a web test rendering the confirmation with the employee's Nombre, Apellido, Puesto, Nivel de autoridad and Cancelar / Confirmar (red) buttons.
- Verification attempt 1/3: `npm run check` stopped at Prettier formatting in `App.tsx`. Applied the configured formatter.
- Verification attempt 2: `npm run check` passed format, lint, TypeScript checks, 47 API tests, and 5 web tests. No blockers remain.

## 2026-11-09 - Vista general: ciclo de estados, períodos, gráfico y actividad

- Task lifecycle: `pending | in_progress | completed | cancelled` with allowed transitions (pending→in_progress/completed/cancelled, in_progress→completed/cancelled/pending, completed/cancelled→pending reopen). The four overview cards are real now: Tareas asignadas = total created, Completadas = finalized, Pendientes = not started, Canceladas = cancelled, plus a completion percentage strip (`completed/assigned`, e.g. `62,5%`, with a progress bar). New `PATCH /tasks/:taskId` (status, owner reassign, priority change) wired to selects in Tareas; operatives can only change status, owner/priority requires organization or Nivel Administrativo (403 otherwise). Timestamps `completedAt/cancelledAt/updatedAt` are stored and a migration (`20261109000002_task_lifecycle_and_activity.sql`) documents them with a `task_activity_events` table.
- Overview period selector above the cards (Últimos 7/30/90 días, Todo el período) filtering stats by `createdAt`, chart and activity; the old Mon-Fri chart is replaced by a created vs completed per-day chart with legend and summary (`X completadas frente a Y creadas`).
- Centro de atención now lists one alert per problem (sin responsable, urgentes pendientes, en curso, canceladas) each with its own button that navigates directly to Tareas.
- Actividad reciente section below the charts lists the latest 10 audit events (created/started/completed/cancelled/reopened/reassigned/priority_changed, e.g. "Juan completó la tarea Actualizar inventario.", "El administrador reasignó…", "María modificó la prioridad…") served by `GET /activities?organizationId&range=` and stored per organization.
- Verification attempt 1/3: Prettier formatting in 4 files; applied formatter. Attempt 2: `npm run check` failed lint (unused `priorityLabels`) — removed; also fixed a status-only PATCH denying the organization and a per-day chart test expecting only days with data. Correction iteration 1/3.
- Verification attempt 3: `npm run check` passed format, lint, TypeScript checks, 51 API tests, and 9 web tests. No blockers remain.

## 2026-11-10 - Empleados: invitaciones, perfil, buscador, habilidades y carga

- Invitaciones pendientes: new `GET /employees/invites` table (Empleado / Estado / Fecha de envío / Vencimiento / Acción) where Pendiente offers Reenviar + Cancelar and Aceptada offers Ver perfil. Each invitation stores `sentAt` and `expiresAt` (30 days); pending codes expire after that window (joined employees keep reusing their code), `POST /employees/invites/:id/resend` issues a fresh digest and new expiry (old code stops working, mail failure rolls back), and `DELETE /employees/invites/:id` cancels a pending invite freeing the email. Only the organization owner can resend/cancel (403 for employees).
- Perfil individual: clicking a card opens `EmployeeProfileModal` with personal info, puesto/departamento/nivel, fecha de incorporación, pending/completed tasks and overdue tasks (`dueAt < now` and active, enabled by a new optional Fecha de entrega in Nueva tarea), a filtered activity history, and editable puesto/departamento/nivel de autoridad through `PATCH /employees/:id` (owner or own profile). New `department` field (invite form + migration `20261110000001_employee_profiles_and_task_deadlines.sql`, default General).
- Buscador y filtros: search by first/last name, department select (distinct values), authority filter (Todos/Administrativo/Operario) and sort A-Z or by pending-task count, implemented as the tested `filterAndSortEmployees` helper.
- Habilidades: `skills` array per employee (normalized, deduped case-insensitively), shown as chips in the card and editable in the profile with add/remove wired to the same PATCH.
- Carga laboral: each card shows a workload indicator from `pendingTaskCount` via `workloadLevel` (Baja 0-2, Media 3-5, Alta 6+, dot + text).
- Verification attempt 1/3: Prettier formatting in 3 files; applied formatter. Attempt 2: typecheck failed (profile `onUpdate` return type and missing `department/skills/joinedAt` in a test fixture) — fixed. Attempt 3: `npm run check` passed format, lint, TypeScript checks, 54 API tests, and 11 web tests. No blockers remain.

## 2026-11-11 - Tareas: detalle, revisión, filtros, Kanban y adjuntos

- Estados: added `in_review` (En revisión) to the lifecycle pending→in_progress→in_review→completed (with return to in_progress for correction and approve to completed, cancel from active states, reopen to pending). Overview cards stay real because each status is counted distinctly.
- Task detail: clicking the arrow opens `TaskDetailModal` with nombre, descripción, responsable, prioridad, estado, creación/vencimiento/finalización, tiempo estimado, categoría, comentarios, adjuntos and historial (activities filtered by task). Buttons: Editar (title/description/category/estimate/due/priority), Eliminar (two-step confirm + `DELETE /tasks/:id`), Reasignar (owner select calling the existing reassign path), Cambiar estado, and Aprobar / Devolver para corrección for admins when `in_review`.
- Description & categories: tasks now carry `description`, `category`, `estimatedMinutes` in addition to prioridad/responsable/vencimiento. Categories are the predefined list (Administración, Finanzas, Marketing, Recursos Humanos, Ventas, Tecnología, Otros) plus per-organization custom categories through `GET/POST /categories`; the create form offers the select and an optional "Nueva categoría…" input. Migration `20261111000001_task_detail_and_attachments.sql` adds the columns, `organization_categories`, `task_comments` and `task_attachments` (dataUrl ≤5 MB, 404 if task not found).
- Functional filters: pills Todas/Pendientes/En progreso/En revisión/Completadas/Canceladas with real counts, search by task name, and the ☷ panel with Por empleado / prioridad / categoría / fecha (vencidas, esta semana, sin fecha) / estado, implemented as the tested `filterTasks` helper.
- Kanban: Lista/Kanban toggle; kanban has Pendientes/En progreso/En revisión/Completadas columns of draggable cards (HTML5 drag&drop to `PATCH` status) showing title/category/owner/status.
- Employee deletion with tasks: the delete confirmation now detects active tasks (pending/in_progress/in_review) and asks Reasignarlas (select new owner) / Dejarlas sin asignar / Cancelarlas; the API applies `handleEmployeeDeletionTasks` before removing the employee and never silently drops tasks (verified by a domain test).
- Comments & attachments endpoints `GET/POST /tasks/:id/comments` and `GET/POST /tasks/:id/attachments` (with `DELETE` attachment), all tenant-scoped and audited as activity.
- Verification attempt 1/3: Prettier in 5 files + lint (unused props) + typecheck (duplicate status labels, `onUpdate` return) — fixed in correction iteration 1/3; attempt 2: a lifecycle test did pending→completed directly, now invalid — routed through `in_progress`. Attempt 3: `npm run check` passed format, lint, TypeScript checks, 57 API tests and 12 web tests. No blockers remain.

## 2026-11-11 - Fase 2: analítica de Vista general

- Distribución de carga laboral: gráfico de barras en Vista general (horas asignadas por empleado, orden descendente) con click en cada empleado para abrir su perfil.
- Comparación de períodos: "Últimos 7/30/90 días vs el período anterior" — creadas, completadas, atrasadas (vencidas sin completar, creadas en el período) y tiempo medio de finalización, con variación % ("nuevo" cuando el período anterior tenía 0).
- Pronóstico de la próxima semana: tareas venciendo en 7 días vs capacidad del equipo (disponibilidad: disponible 100%, no disponible temporalmente 50%, vacaciones/licencia/ausente 0%); nivel bajo/manejable/exigente/muy exigente/sobrecarga + barra de utilización y pendientes atrasadas.
- Todos los datos derivados de tareas y empleados reales; estado vacío coherente. Verification: `npm run check` passed format, lint, typecheck, 58 API tests y 15 web tests.

## 2026-11-11 - Fase 3: panel por rol y organigrama

- Panel adaptado a rol en Vista general: Dueño/organización ve la organización completa; Administrativo ve tareas/carga/actividades de su departamento (equipo); Operario ve sus propias tareas, próximos vencimientos y su actividad personal. Distribución de carga solo para Dueño/Admin (departamento); organigrama visible solo para Dueño/Admin.
- Organigrama (página privada): estructura por departamentos con responsables de equipo (nivel Administrativo) y miembros; click en cualquier persona abre su perfil.
- Helpers testeados: scopeTasksForSession, scopeEmployeesForSession, roleFromSession, buildOrgChart.
- Verification: npm run check passed (format, lint, typecheck, 58 API tests, 17 web tests).

## 2026-11-11 - Fase 4: onboarding, recurrencia, plantillas y aprobación configurable

- Onboarding: al iniciar sesión por primera vez con código (employee.onboardingCompleted = false) se muestra un flujo de 5 pasos (perfil, departamento/puesto, habilidades, tareas asignadas, instrucciones); al completarlo marca onboardingCompleted vía PATCH /employees/:id.
- Tareas recurrentes: frecuencia Diaria/Semanal/Cada 15 días/Mensual en Nueva tarea; al listar tareas se materializan las instancias vencidas (POST /tasks/generate-recurring también disponible); cada recurrente genera sus próximas ocurrencias.
- Plantillas de tareas: crear/aplicar plantillas con N tareas (ej. Incorporación de empleado); botón "+ Plantillas" en Tareas (solo Crear/Admin).
- Aprobación configurable: checkbox "Requiere aprobación" + aprobador (Cualquier administrador o un Nivel Administrativo específico) en Nueva tarea; in_review → completed solo para dueño/admin o el aprobador designado.
- Migración 20261111000004 (recurrencia, aprobación, onboarding, task_templates + RLS).
- Verification: npm run check passed (format, lint, typecheck, 58 API tests, 17 web tests).

## 2026-11-13 - Fase 5: asistente con orquestador y subagentes

- Added the assistant module in `apps/api/src/domain/agents/assistant.ts` with an orchestrator (`assistant-orchestrator-v1`) that detects intents (task analysis, employee analysis, department analysis, productivity analysis) from free-text queries and runs the matching analysis, returning an explainable answer with findings, severities and metrics.
- Added `POST /agents/assistant` (organization-only actor) with Zod validation and tenant-scoped queries; answers reuse real task and employee data and return `insufficient` when there is no data.
- Added web assistant types and `fetchAssistantAnswer` plus the AssistantChat entry in the app shell.
- Recovery after an encoding round-trip corrupted `apps/web/src/App.tsx` (replacement characters and scrambled syntax): rewrote the file from scratch, repaired stray characters in `apps/web/src/api.ts`, `apps/api/src/app.ts`, `apps/api/src/domain/agents/assistant.ts` and `apps/api/src/domain/auth/employee-invitation.ts`.
- Verification: format, lint, TypeScript checks, 63 API tests (10 files) and 17 web tests (1 file) all pass.

## 2026-11-13 - Verification of the current state

- `apps/web/src/App.tsx` was rewritten from scratch and now renders the public landing, the authenticated assistant shell and the delete-employee confirmation; all 17 web tests pass.
- API suite passes 63/63, web suite passes 17/17, Prettier, ESLint and TypeScript checks pass for api, web and domain workspaces.

## 2026-11-13 - Public landing page redesign and working access action

- The public home now renders a real landing page: hero with headline "Haz que el trabajo", supporting copy and the CTA button "Acceder o registrarse", followed by the sections "Quiénes somos", "Nuestro objetivo" and "A qué nos dedicamos".
- The CTA now switches the unauthenticated view to a functional access screen (headline, copy and "Volver" action) instead of doing nothing.
- Verification: format, lint, TypeScript checks, 63 API tests and 17 web tests all pass.

## 2026-11-13 - Public landing page design restored to the pre-assistant layout

- The public home was rebuilt with the original design system classes (`site-shell`, `topbar`, `brand`, `hero-section`, `hero-copy`, `hero-text`, `hero-actions`, `button button-primary`, `hero-panel`, `pulse-row`, `pulse-chart`, `about-section`, `home-footer`) instead of the placeholder classes introduced during the rewrite.
- The CTA "Acceder o registrarse" now navigates to a functional access view using the same design system, with a "Volver" action.
- Verification: format, lint, TypeScript checks, 63 API tests and 17 web tests all pass.

## 2026-11-13 - Public workspace restaurado a estado pre-fase-5

- `apps/web/src/App.tsx` reconstruido por completo con las secciones pre-fase-5: vista pública (landing con hero y secciones), pantalla de acceso/registro, y el workspace autenticado con navegación entre "Vista general", "Tareas" y "Empleados".
- El workspace carga tareas, empleados y actividades de la API y renderiza tarjetas de carga, distribución de workload, pronóstico, alertas de atención, lista de tareas y directorio de empleados, todos con botones funcionales que cambian de sección.
- Se eliminó el asistente (fase 5) y se restauró el design system real de `styles.css`.
- Verificación: format, lint, TypeScript checks, 63 API tests y 17 web tests pasan.

## 2026-11-14 - Auth y las tres secciones conectadas a la API

- Reconstruida la shell web: landing pública, pantalla de acceso con roles Organización/Empleado, inicio de sesión y registro de organización (nombre, email, contraseña, tipo, descripción opcional) conectados a Supabase Auth, inicio de sesión de empleado con id de organización + código, y recuperación/restablecimiento de contraseña desde el enlace enviado por mail.
- El workspace autenticado ahora tiene las tres secciones reales: Vista general, Tareas y Empleados, todas alimentadas por la API tenant-scoped.
- Vista general: selector de período, estadísticas reales, porcentaje de completadas, gráfico creadas vs completadas, comparación de períodos, centro de atención, distribución de carga, pronóstico de la próxima semana, organigrama y actividad reciente, con alcance por rol.
- Tareas: formulario de alta (título, descripción, categoría, prioridad, responsable, vencimiento, estimación), pills por estado con conteos, búsqueda, filtres por empleado/prioridad/categoría/fecha, vistas Lista y Kanban con cambios de estado, y modal de detalle con edición, reasignación, eliminación y comentarios.
- Empleados: formulario de invitación (nombre, apellido, mail, puesto, departamento, nivel de autoridad, habilidades, capacidad, disponibilidad), directorio con búsqueda/filtros/orden, carga y habilidades, modal de perfil con edición, tabla de invitaciones con reenviar/cancelar, y confirmación de baja con tratamiento de tareas (reasignar/dejar sin asignar/cancelar).
- Se extrajeron los helpers puros a `apps/web/src/domain.ts` y la UI compartida a `apps/web/src/components`; el enlace del email de invitación ahora incluye el `organizationId` para que el empleado llegue al login con su organización ya cargada.
- Se corrigieron caracteres corruptos en strings visibles de la API (email de código de acceso y mensajes de actividad) y se eliminaron los artifacts `*.ts System.Object[]`.
- Refuerzo de seguridad: `PATCH /employees/:id` ahora solo permite cambiar el nivel de autoridad al dueño de la organización; un empleado que edita su propio perfil no puede auto-escalar (probado con un test HTTP 403) y la UI oculta el selector de nivel para no enviarlo.
- El formulario de invitación se cierra solo cuando el mail se envía con éxito: el botón muestra "Enviando…" y queda deshabilitado durante el envío; si hay error (mail duplicado, campos incompletos o fallo de envío) el formulario permanece abierto con el mensaje.
- Se eliminó el campo "Id de organización" del login de empleado: el código de acceso por sí solo es suficiente para ingresar (`POST /employees/sign-in` solo necesita el código; el dominio lo resuelve por el código único).
- Verificación: `npm run check` pasó format, lint, TypeScript checks, 64 API tests y 19 web tests. Prueba en vivo de la API con mailer capturado verificó invitación → login de empleado → alta de tarea → cambio de estado → listado (1 tarea, 1 empleado).
- Nota: el registro de organización no pudo completarse en este entorno porque Supabase devolvió "email rate limit exceeded"; el flujo está cubierto por los tests unitarios de la API.

## 2026-11-15 - Jefes de departamento (department leads)

- Nueva migración `20261115000001_department_leads.sql` con tabla `department_leads` (organization_id, department, employee_id, assigned_at, assigned_by), RLS de solo dueño para escritura, lectura para miembros, e índices por organización+departamento y organización+empleado.
- API domain (`employee-invitation.ts`): `assignDepartmentLead`, `removeDepartmentLead`, `getDepartmentLead`, `listDepartmentLeads`, `isDepartmentLead`, `getDepartmentLeadByEmployee`, `canAssignTaskToEmployee`. Solo el dueño puede asignar/remover; el empleado debe ser administrativo y estar en el departamento.
- API domain (`tasks.ts`): `createTask` y `updateTask` ahora rechazan la asignación de `ownerId` si el actor es un jefe de departamento y el target no es un operativo de su mismo departamento (`invalid_owner`).
- API server (`app.ts`): endpoints `POST /department-leads`, `GET /department-leads`, `DELETE /department-leads/:department`.
- Frontend (`api.ts`): tipos `DepartmentLead`, `AssignDepartmentLeadResult` y funciones `fetchDepartmentLeads`, `assignDepartmentLead`, `removeDepartmentLead`.
- Frontend (`domain.ts`): `scopeEmployeesForSession` y `scopeTasksForSession` aceptan `departmentLeads` opcional; un jefe de departamento ve solo operativos de su departamento y sus tareas.
- Frontend (`EmployeesSection.tsx`): sección "Jefes de departamento" con lista de asignados, botón remover, y modal para asignar jefe (departamento + empleado administrativo de ese departamento).
- Frontend (`OverviewSection.tsx`, `TasksSection.tsx`): cargan `departmentLeads` y los pasan a las funciones de scope.
- `styles.css`: estilos para `.department-leads-section` y `.department-leads-list`.
- Tests: 6 nuevos tests en `employee-invitation.test.ts` cubriendo asignación solo por owner, rechazo a no-owner, rechazo a empleado inexistente, listado vacío, remoción solo por owner, y `canAssignTaskToEmployee` para owner y administrativo sin lead.
- Verificación: `npm run check` pasó format, lint, TypeScript checks, 70 API tests y 19 web tests.

## 2026-11-15 - Departamentos creables y seleccionables al invitar

- Nueva migración `20261115000002_departments.sql` con tabla `departments` (id uuid PK, organization_id, name, created_at; UNIQUE por organización+nombre) y RLS: solo el dueño escribe, cualquier miembro lee.
- Dominio API nuevo `apps/api/src/domain/departments.ts` con almacenamiento en memoria tenant-scoped: `createDepartment`, `listDepartments`, `getDepartmentById`, `deleteDepartment`, `clearDepartmentsForTest`. Rechaza nombres duplicados por organización (case-insensitive) y nombres vacíos.
- Endpoints en `app.ts`: `POST /departments` (solo dueño), `GET /departments`, `DELETE /departments/:departmentId` (solo dueño).
- `normalizeDepartment` en `employee-invitation.ts` ahora devuelve `''` cuando no se envía departamento (antes forzaba `'General'`); `clearEmployeeInvitationsForTest` también limpia departamentos.
- Frontend `api.ts`: tipos `Department`, `CreateDepartmentResult` y funciones `fetchDepartments`, `createDepartment`, `deleteDepartment`.
- `EmployeesSection.tsx`: sección "Departamentos" (solo dueño) con lista, creación y eliminación; el formulario de invitación ahora usa un `<select>` con los departamentos creados y la opción "Sin departamento"; el perfil del empleado también usa `<select>` con los departamentos creados y la opción "Sin departamento".
- `styles.css`: estilos `.departments-section`, `.departments-list`, `.department-list-item`.
- Tests: nuevo `apps/api/src/domain/departments.test.ts` con 6 tests (creación, listado, duplicado case-insensitive, alcance por tenant, validación de nombre, borrado tenant-scoped).
- Verificación: `npm run check` pasó format, lint, TypeScript checks, 76 API tests y 19 web tests.

## 2026-11-15 - Borrado de departamentos desde modal de selección

- La sección "Departamentos" en `EmployeesSection.tsx` ahora muestra una lista simple de departamentos y, junto al botón "Crear departamento", un botón rojo "Eliminar departamentos" (deshabilitado si no hay departamentos).
- Ese botón abre un modal "Eliminar departamentos" con la lista completa de departamentos creados, checkboxes para seleccionar uno o varios, "Seleccionar todos", y abajo los botones "Cancelar" (neutro) y "Eliminar departamentos (N)" (rojo) que borra los seleccionados en secuencia, informa los que fallaron y sincroniza la lista con la API al terminar; si todo se borra bien, el modal se cierra.
- La selección vive en el estado local (`selectedDepartmentIds`) y se reinicia al abrir el modal y al terminar un borrado exitoso; se mantienen los estilos de checkboxes y labels existentes.
- `styles.css`: nuevo `.department-actions` para alinear los botones crear/eliminar en fila con wrap.
- Verificación: `npm run check` pasó format, lint, TypeScript checks, 76 API tests y 19 web tests.
- Ajuste posterior: `styles.css` excluye los checkboxes de la regla genérica `.task-modal input` (border/padding/width 100%) con `:not([type='checkbox'])`, les da tamaño fijo 1.05rem y acento `#17233a`, y elimina el outline verde de `:focus` para checkboxes; los checkboxes de la lista de departamentos quedan alineados en una misma línea vertical.

## 2026-11-15 - Actividades recientes registran creación/eliminación de departamentos

- `tasks.ts`: nuevos tipos de actividad `department_created` y `department_deleted` y nueva función exportada `recordDepartmentActivity` (mismo almacenamiento en memoria `ACTIVITIES`, usado por `listActivities`).
- `app.ts`: `POST /departments` registra "creó el departamento: <nombre>" y `DELETE /departments/:departmentId` registra "eliminó el departamento: <nombre>" usando `resolveActorName` del actor autenticado; el nombre se obtiene antes de borrar vía `getDepartmentById`.
- `EmployeesSection.tsx`: crear y eliminar departamentos ahora también llaman `onRefresh()` para que la sección Actividad reciente se actualice en pantalla.
- Test de integración nuevo en `departments.test.ts`: flujo HTTP crear → `GET /activities` contiene `department_created`; eliminar (borrado real por HTTP) → `GET /activities` contiene `department_deleted`. Se aisla el estado global con `clearTasksForTest` en beforeEach/afterEach.
- Verificación: `npm run check` pasó format, lint, TypeScript checks, 77 API tests y 19 web tests.
- Ajuste posterior: el bug de asignación de jefe de departamento se resolvió quitando también la restricción de que el jefe deba pertenecer ya al departamento; cualquier empleado administrativo puede ser asignado como jefe de un departamento, y `scopeEmployeesForSession`/`scopeTasksForSession` pasan a usar el departamento del lead (no el del empleado) para filtrar operativos y tareas.

## 2026-11-15 - Ver departamentos, botón Volver centrado y actividades de empleado

- `EmployeesSection.tsx`: la sección Departamentos ahora muestra una lista mínima y tres botones: "Crear departamento", "Ver departamentos" (modal de solo lectura con la lista completa de departamentos creados + botón Cerrar) y "Eliminar departamentos"; se eliminó la lista inline de departamentos en la sección.
- `App.tsx`: el botón "Volver" de la pantalla de acceso (roles Organización/Empleado) queda centrado vía `.login-back { text-align: center; }`.
- Actividades recientes ahora registran: `employee_invited` (al invitar), `invitation_accepted` (solo la primera vez que el empleado acepta; `redeemEmployeeAccessCode` ahora devuelve `acceptedNow`) y `employee_deleted` (al eliminar la cuenta). Se implementa en `tasks.ts` con `recordEmployeeActivity` y se llama desde los endpoints `POST /employees/invites`, `POST /employees/sign-in` y `DELETE /employees/:employeeId`; el frontend ya recarga actividades en `refresh` y al iniciar sesión, por lo que los nuevos eventos aparecen en Actividad reciente.
- Bug resuelto: al seleccionar un departamento en el modal "Asignar jefe de departamento" no aparecían empleados administrativos; el dropdown ahora lista todos los empleados administrativos y el backend ya no exige que el jefe pertenezca al departamento (restricción `wrong_department` eliminada); los scopes frontend usan el departamento del lead.
- Verificación: `npm run check` pasó format, lint, TypeScript checks, 77 API tests y 19 web tests.

## 2026-11-15 - Invitaciones sin título, carga en filas, organigrama único con jefe destacado

- `EmployeesSection.tsx`: se eliminó el encabezado "Invitaciones"; la tabla de invitaciones ahora incluye una columna "Carga" con el mismo indicador (punto de color + "Carga Baja/Media/Alta: N") calculado con `pendingTaskCount`/`workloadLevel`; el indicador de carga ya no aparece en las tarjetas de empleado (el botón "Eliminar" queda solo, alineado a la derecha).
- `domain.ts`: `buildOrgChart` ahora deduplica por id, devuelve `{ department, jefe, members }` (sin la lista `leads`, que duplicaba a los administrativos en la UI) y acepta `departmentLeads` opcional para detectar al jefe de cada departamento; el jefe se excluye de `members`. `OverviewSection.tsx` pasa `departmentLeads` a `buildOrgChart`.
- El organigrama ya no repite a una persona (cada empleado aparece una única vez); el jefe asignado aparece arriba en su departamento, con estilo destacado (`.orgchart-person-jefe`, avatar verde lima grande, badge "Jefe").
- `App.test.tsx`: test del organigrama actualizado al nuevo shape (`jefe` y `members` sin el jefe).
- Verificación: `npm run check` pasó format, lint, TypeScript checks, 77 API tests y 19 web tests.

## 2026-11-15 - Jefe visible, mails ocultos y "Mi perfil" con FAB

- Organigrama: las reglas `.orgchart-person-jefe` pasan a `.orgchart-person.orgchart-person-jefe` (mayor especificidad que `.orgchart-person`), forzando el fondo oscuro y el texto blanco del nombre del jefe; ya se ve correctamente.
- Tarjetas de empleados: el mail ya no se muestra; se muestra solo el nivel de autoridad, y "Sin departamento" cuando el campo está vacío.
- Nueva sección `MyProfileSection` (`apps/web/src/components/MyProfileSection.tsx`): página de perfil detallada (información, resumen de tareas con pendientes/en progreso/completadas/vencidas, habilidades y actividad reciente del empleado) accesible desde un botón circular flotante (`.fab-profile`) en la esquina inferior derecha; solo los empleados (administrative/operative) ven el botón y solo ven su propio perfil (`session.employeeId`); el dueño no ve el botón.
- `App.tsx`: nueva sección `'profile'` en el router; `selfEmployee` derivado de la sesión; el FAB aparece solo si `session.kind === 'employee'` y el empleado existe en el listado; el fallback sin `selfEmployee` muestra Vista general.
- Verificación: `npm run check` pasó format, lint, TypeScript checks, 77 API tests y 19 web tests.

## 2026-11-15 - Perfiles completos por rol, sin modal pequeño

- `MyProfileSection` generalizada: acepta `isSelf` ("Mi perfil" vs "Perfil") y muestra la información del empleado por `employee.id`; filtra actividad por `actorEmployeeId` y tareas por `ownerId` según el empleado mostrado.
- `App.tsx`: nuevo estado `profileEmployeeId`; al hacer clic en la tarjeta de un empleado (o en "Ver perfil" de una invitación aceptada) navega a la sección `'profile'` mostrando el perfil de ese empleado; el botón circular (FAB) sigue siendo solo para empleados y abre el propio perfil.
- `EmployeesSection.tsx`: se eliminó `EmployeeProfileModal` (el cuadro pequeño); la tarjeta de empleado es clickeable solo si `canViewProfileOf` lo permite: el dueño ve todos; un administrativo ve su propio perfil y los perfiles de los operativos de su mismo departamento; un operativo solo su propio perfil; en caso contrario el botón queda deshabilitado.
- `styles.css`: `.employee-profile-button:disabled` con `cursor: default` y opacidad reducida.
- Verificación: `npm run check` pasó format, lint, TypeScript checks, 77 API tests y 19 web tests.

## 2026-11-15 - Quitado mojibake y eliminación de departamento desvincula empleados

- Reparado el doble-codificado UTF-8 en `EmployeesSection.tsx` (una `Set-Content` de PowerShell había reescrito el archivo y corrompido tildes y signos como `í`, `á`, `ó`, `…`); se restauró con una pasada cp1252→UTF-8 y se escaneó el resto de `apps/web/src` sin hallazgos.
- Nueva función de dominio `unassignEmployeesFromDepartment(organizationId, department)` en `employee-invitation.ts`: pone `department = ''` en todos los empleados y invitaciones de la organización que pertenecían al departamento (incluye al jefe) y elimina los registros de `DEPARTMENT_LEADS` para ese departamento.
- `DELETE /departments/:departmentId` (`app.ts`) ahora llama a `unassignEmployeesFromDepartment` al borrar, además de registrar la actividad; el organigrama deja de mostrar el departamento (ningún empleado lo tiene) y los desvinculados aparecen como "Sin departamento".
- `EmployeesSection.tsx`: `reloadDepartments()` ahora también recarga los jefes de departamento para que un jefe desvinculado desaparezca de la lista inmediatamente.
- Test de integración nuevo en `departments.test.ts`: crea departamento, invita y redime admin + operativo en ese departamento, asigna lead, borra el departamento por HTTP y verifica que ambos queden con `department = ''`, que `/department-leads` devuelva vacío y que la actividad `department_deleted` quede registrada.
- Verificación: `npm run check` pasó format, lint, TypeScript checks, 78 API tests y 19 web tests.

## 2026-11-15 - Persistencia de sesión, mensajes de departamento, Volver centrado, * obligatorios y asignación de departamento en perfil

- Botón "Volver" en las pantallas de recuperar/restablecer contraseña ahora centrado (`.login-back`).
- Crear departamento: validación de nombre vacío en el handler con el mensaje "No se puede crear el departamento porque el nombre no está puesto."; duplicado muestra "No se pueden crear departamentos con nombres ya existentes." (mapeo por `result.reason === 'duplicate'`); el botón Crear ya no se deshabilita por nombre vacío para que el clic muestre el mensaje; label con asterisco y error se limpia al escribir.
- Formulario "Invitar empleado": los campos obligatorios muestran asterisco: Nombre *, Apellido *, Mail *, Puesto *.
- Persistencia de sesión: nuevo `apps/web/src/session-storage.ts` con `loadStoredSession`/`storeSession`/`clearStoredSession` y `loadUiState`/`storeUiState`; sesión y sección actual (`overview|tasks|employees|profile` + `profileEmployeeId`) se guardan en `localStorage` y se restauran al refrescar; `performSignOut` limpia ambos.
- Al asignar jefe de departamento (`assignDepartmentLead`), el empleado queda afiliado a ese departamento (`record.department = normalizedDepartment`); el cambio se refleja en su perfil y en el organigrama (ya se basa en `employee.department`).
- Nueva funcionalidad "Asignar a departamento" en la página de perfil del empleado (`MyProfileSection`), visible solo para el owner: select con todos los departamentos + opción "Sin departamento", botón "Guardar departamento" que llama a `updateEmployeeProfile`; se refleja en perfil y organigrama tras `refresh()`. El jefe asignado también queda afiliado al departamento al que se lo asigna como jefe.
- Verificación: `npm run check` pasó format, lint, TypeScript checks, 78 API tests y 19 web tests.

## 2026-11-15 - Link del mail de invitación abre solo el login de empleado

- `App.tsx`: cuando la URL contiene `?page=login` (el link del mail de invitación), la app ya no restaura la sesión guardada en `localStorage`; fuerza la pantalla de acceso con `authRole=employee` y limpia la sesión almacenada (y los datos en memoria). Antes, abrir ese link con sesión viva caía directo en el workspace de la organización.
- `employee-invitation.ts`: el texto del mail ahora explicita que el enlace lleva directamente a la pantalla de inicio de sesión para empleados de WorkFlowPlus y que ese código no sirve para entrar a la cuenta de la organización.
- Verificación: `npm run check` pasó format, lint, TypeScript checks, 78 API tests y 19 web tests.

## 2026-11-15 - Centro de ayuda por sección

- Nueva sección `Ayuda` en la navegación del workspace (`App.tsx`), con tipo `Section` extendido a `'help'` y persistencia en `session-storage.ts` (`StoredSection`).
- Nuevo componente `HelpSection.tsx` con pestañas para Empleado, Vista general y Tareas, cada una con contenido explicativo y botón para navegar directamente a la sección correspondiente.
- Estilos `.help-section`, `.help-tabs`, `.help-tab`, `.help-content`, `.help-item` y `.help-actions` en `styles.css`.
- Tests en `App.test.tsx`: render por defecto, contenido de las tres pestañas y `HELP_CONTENT` con todas las secciones.
- Entrada `help-section` añadida a `features.json` con estado `done`.
- Verificación: `npm run check` pasó format, lint, TypeScript checks, 78 API tests y 24 web tests.

## 2026-11-15 - Mejoras visuales del centro de ayuda

- Se agregó un banner de bienvenida con degradado (`#17233a` → `#2a3550`), icono de información (ⓘ) y frase resumen en `HelpSection.tsx` (recomendación 1 de diseño visual).
- Se agregaron iconos por sección (👤 Empleado, 📊 Vista general, ✅ Tareas) en las pestañas y en cada tarjeta de ayuda, con borde izquierdo de color diferenciado por sección (recomendación 2 de diseño visual).
- Se agregaron estilos `.help-banner`, `.help-banner-icon`, `.help-tab-icon` y `.help-item-icon` en `styles.css`.
- Verificación: `npm run check` pasó format, lint, TypeScript checks, 78 API tests y 24 web tests.

## 2026-11-19 - Checklist de tareas, exportación CSV y modo oscuro

- Checklist de tareas: `TaskChecklistItem` y `checklist` se agregaron al dominio/API con validación Zod, normalización y deduplicación de ids, y auditoría al actualizarlo. La UI del detalle permite agregar, marcar, quitar y guardar ítems; el guardado propaga el refresco al estado padre para no perder cambios al reabrir el modal. El alcance sigue siendo `organizationId`, sin tocar estados ni transiciones.
- Exportación CSV: Vista general exporta solo las tareas filtradas por período y por alcance de rol/organización. El CSV usa separador `;`, BOM UTF-8, encabezados en español, progreso de checklist y escaping contra inyección de fórmulas (incluidos caracteres de control). La descarga difiere `revokeObjectURL` para evitar cancelaciones en navegadores.
- Modo oscuro: toggle accesible en la navegación con `aria-label`/`aria-pressed`, persistencia en `localStorage` junto a la sección y script mínimo en `index.html` para aplicar `data-theme` antes del primer pintado. Se ampliaron los overrides oscuros a superficies reales de Vista general, login, perfil, navegación móvil y modales.
- Tests nuevos: checklist tenant-scoped en API, CSV escapado en web y toggle de modo oscuro en workspace autenticado.
- Entradas `task-checklist`, `csv-report-export` y `dark-mode` añadidas a `features.json` con estado `done`.
- Verification attempt 1: `npm run check` pasó format, lint, TypeScript checks, 79 API tests y 26 web tests.
- Después de la revisión de mejora se corrigió propagación del checklist, sanitización CSV, descarga diferida, superficies del tema oscuro y validación/normalización del checklist.
- Verification attempt 2: `npm run check` falló en ESLint con `Unexpected control character(s) in regular expression: \x00, \x1f no-control-regex` en `apps/web/src/domain.ts`; se reemplazó la regex por filtrado por código de carácter.
- Verification attempt 3: `npm run check` pasó format, lint, TypeScript checks, 79 API tests y 26 web tests. Correction iterations for this session: 2/3. No blockers remain.

## 2026-11-19 - Menú de secciones, campos obligatorios y mail de asignación

- Verification attempt 1: `npm run check` se detuvo en Prettier con `Code style issues found` en `apps/api/src/app.ts`. Se aplicó el formatter.
- Verification attempt 2: `npm run check` pasó format, lint y typecheck, pero falló el nuevo test de correos: un PATCH con el mismo `ownerId` devuelve 400 `invalid_input` porque `updateTask` solo acepta cambios reales. Se ajustó la prueba para verificar un cambio de prioridad (sin mail) y luego el reasignado (con mail).
- Verification attempt 3: `npm run check` volvió a fallar en el test de correos; el PATCH de reasignación no enviaba mail porque `getTaskById` devuelve la referencia mutable de `TASKS` y la comparación se hacía después de mutarla. Se captura ahora `previousOwnerId` como valor antes de `updateTask`.
- Verification attempt 4: `npm run check` pasó format, lint, typecheck, 80 API tests y 28 web tests.
- Revisión de mejora: sin hallazgos críticos; se aplicaron correcciones de robustez en formularios de tareas, patrón de disclosure del menú, logging sin PII, flag `assignmentEmailSent` y notificación también en la materialización recurrente de `GET /tasks`.
- Verification attempt 5: `npm run check` se detuvo en Prettier en `apps/api/src/app.ts` y `apps/web/src/components/TasksSection.tsx`; se aplicó el formatter.
- Verification attempt 6: `npm run check` pasó format, lint, typecheck, 80 API tests y 28 web tests. Correction iterations for the review cycle: 1/3. No blockers remain.

## 2026-11-19 - Renombrado a Modo Nocturno y ajuste visual en Empleados

- El toggle accesible ahora dice `Modo Nocturno` y su `aria-label` es `Activar Modo Nocturno`; el estado interno y el atributo `data-theme` se mantienen como `dark` para no romper la persistencia ni el script inicial.
- Se unificaron los tonos de la sección Empleados con el resto del workspace: resumen, jefes/departamentos, tabla de invitaciones, tarjetas, barras de carga, chips de habilidades y avatares usan superficies azul oscuro, bordes `#2c3a52`, texto `#aeb9cc` y acento `#d8ff71`.
- `features.json` refleja el nuevo nombre y la cobertura visual de Empleados.
- Verificación inicial: `npm run check` pasó format, lint, typecheck, 80 API tests y 28 web tests.
- Revisión de mejora: sin hallazgos críticos; se detectaron contraste del contador en filtros seleccionados, avisos de validación claros en tema oscuro, falta de aserción de ausencia del texto anterior/cobertura de persistencia y capitalización inconsistente.
- Corrección 1/3 del ciclo aplicada: override oscuro para `.filter.is-selected span` y `.validation-alert`, test de no regresión del texto anterior, test de persistencia de `theme: 'dark'` con fallback inválido a `'light'`, y etiquetas `Modo Claro` / `Modo Nocturno` unificadas.
- Verificación final: `npm run check` pasó format, lint, typecheck, 80 API tests y 29 web tests. No blockers remain.

## 2026-11-19 - Pulimiento visual: skeletons, densidad, microinteracciones y vistas rápidas

- Skeletons y estados vacíos: `App.tsx` muestra `WorkspaceSkeleton` durante la carga y suprime las secciones para evitar estados vacíos simultáneos; Tareas y Empleados usan `EmptyState` con acción solo para roles autorizados y rama "Sin resultados" cuando hay datos ocultos por filtros.
- Densidad: toggle accesible en la navegación, persistencia `comfortable|compact` por `organizationId` en `session-storage.ts`, compatibilidad con payloads legacy y `data-density` aplicado antes del primer pintado en `index.html`; los estilos solo ajustan espaciado, nunca columnas.
- Microinteracciones: transiciones y elevación sutil en botones, filtros y tarjetas, shimmer del skeleton y animación del drawer, con anulación completa bajo `prefers-reduced-motion`.
- Vistas rápidas: `QuickViewDrawer` de solo lectura para tareas y empleados, con `role="dialog"`, cierre con Escape/backdrop, foco administrado, datos ya cargados y acceso al detalle/perfil completo; capas ordenadas FAB 40 < modal 50 < drawer 60.
- Error de carga: `App.tsx` distingue fallo de red de ausencia de datos, limpia datos del tenant anterior antes de cargar y ofrece "Reintentar" sin mezclar organizaciones.
- Tests nuevos: skeleton accesible, estado vacío con acción, drawer sin controles de edición, toggle de densidad y persistencia por organización con fallback legacy. `features.json` registra las cuatro mejoras como `done`.
- Verification attempt 1: `npm run check` se detuvo en Prettier en `App.tsx`, `EmployeesSection.tsx` y `ui.tsx`; se aplicó `npm run format:write`.
- Verification attempt 2: `npm run check` falló en typecheck porque `EmployeeProfile.joinedAt` es nullable; se agregó fallback "Sin fecha".
- Verification attempt 3: `npm run check` pasó format, lint, typecheck, 80 API tests y 32 web tests.
- Revisión de mejora: sin hallazgos críticos; se corrigieron error disfrazado de estado vacío, filtrado del tema entre organizaciones, estados "Sin resultados", cobertura Kanban confirmada y orden de capas. Corrección 1/3 del ciclo aplicada.
- Verification attempt 4: `npm run check` pasó format, lint, typecheck, 80 API tests y 32 web tests. No blockers remain.

## 2026-11-20 - Corrección de fecha de tareas y refresco de jefes de departamento

- `TasksSection`: `dueAt` se convierte con `toDateTimeLocalValue` (hora local del navegador) al abrir el `datetime-local` y con `fromDateTimeLocalValue` al guardar, en alta y en edición. Se agregaron tres tests de ida y vuelta, incluido un ISO con offset explícito y valores vacíos/inválidos.
- `departmentLeads` pasa a ser estado de `App`, se carga una sola vez en el lote inicial y se actualiza en `refresh()`. `OverviewSection`, `TasksSection` y `EmployeesSection` reciben la lista por prop y ya no hacen su propia petición; asignar, cambiar o remover un jefe usa `onRefresh()` y refleja el cambio sin pedidos duplicados. `EmployeesSection` mantiene su carga local de departamentos, que no forma parte de este fix.
- Verification attempt 1: `npm run check` se detuvo en Prettier en `apps/web/src/App.tsx`; se aplicó `npm run format:write`.
- Verification attempt 2: `npm run check` falló en ESLint con `'organizationId' is defined but never used` en `OverviewSection.tsx` (el parámetro quedó sin uso al quitar su fetch); se eliminó la prop y su paso desde `App`.
- Verification attempt 3: `npm run check` pasó format, lint, typecheck, 80 API tests y 35 web tests. Correction iterations for this session: 2/3. No blockers remain.

## 2026-11-20 - Jerarquía visual del directorio de empleados

- En las tarjetas del directorio el nombre y el puesto ahora se apilan en una columna (`.employee-identity`) en lugar de compartir línea; el nombre usa `.employee-name` con `font-size: 0.9rem` y el puesto `.employee-position` con `0.75rem`.
- Se agregó un test de render estático que verifica el orden nombre → puesto. No cambia permisos, filtros ni datos de empleado.
- Verification attempt 1: `npm run check` pasó format, lint, typecheck, 80 API tests y 36 web tests. No blockers remain.

## 2026-11-20 - Centrado vertical de las filas de invitaciones

- Aclaración del usuario: las "filas" eran las de la tabla de invitaciones (Empleado, Estado, Carga, Fecha Envío, Vencimiento, Acción), no las tarjetas del directorio. Se revirtió por completo el centrado aplicado a `.employee-card`, que había sido un diagnóstico erróneo.
- `.invitations-table th, .invitations-table td` pasó de `vertical-align: top` a `vertical-align: middle`, para que cada celda quede centrada respecto de su fila. No se modifican datos, permisos ni la jerarquía nombre/puesto del cambio anterior.
- Verification attempt 1: `npm run check` pasó format, lint, typecheck, 80 API tests y 36 web tests. No blockers remain.

## 2026-11-20 - URL limpia tras acceso de empleado con código

- Nueva helper `clearAccessUrl()` en `App.tsx`: usa `window.history.replaceState(null, '', window.location.pathname)` para quitar `?page=login`, `?role=employee` y cualquier otro query param sin recargar ni perder el estado de React.
- Se invoca en `handleEmployeeSignIn` solo después de guardar la sesión del empleado. Así, un refresh posterior ya no dispara el efecto que limpia la sesión por `page=login`, y se carga la sesión persistida.
- Se agregó un test que verifica el `replaceState` con la ruta principal; los web tests pasaron de 36 a 37. No se tocó el login de organización ni el flujo de reseteo de contraseña.
- Verification attempt 1: `npm run check` pasó format, lint, typecheck, 80 API tests y 37 web tests. No blockers remain.

## 2026-11-20 - Aislamiento de la sesión activa por pestaña

- Causa: `storeSession()` escribía `workflowplus.session` en `localStorage`, compartido por todas las pestañas del mismo origen; el login del empleado sobrescribía la sesión del dueño y un refresh en otra pestaña cargaba la del empleado.
- `loadStoredSession()` y `storeSession()` ahora usan `sessionStorage`, por lo que cada pestaña conserva su propia sesión al refrescar. El estado de UI (tema/densidad/sección) sigue en `localStorage` con `organizationId`.
- Se agregó `clearActiveSession()` para el efecto de `?page=login`: cierra solo la sesión de la pestaña actual sin borrar preferencias globales. `clearStoredSession()` (sign out explícito) sí sigue borrando sesión + UI.
- No se migra la sesión vieja de `localStorage` a propósito: hacerlo en la pestaña del dueño podría reintroducir la sesión del empleado escrita por otra pestaña.
- Se agregaron 4 tests de aislamiento; los web tests pasaron de 37 a 41.
- Verification attempt 1: `npm run check` pasó format, lint, typecheck, 80 API tests y 41 web tests. No blockers remain.

## 2026-11-20 - Forma estable de las tarjetas de acceso

- Causa: `.login-page` y `.registration-page` tienen `min-height: calc(100vh - 78px)` y sus tarjetas eran ítems de grid con `align-self: stretch` por defecto. Al reducir el zoom aumentan los píxeles CSS de `100vh`, la fila crece y la tarjeta se estiraba hacia abajo.
- Se agregó `align-self: center` a `.login-card` y `.registration-card`, igualando el comportamiento que ya tenían `.login-intro` y `.registration-intro`. La tarjeta mantiene su altura natural y queda centrada; no se cambiaron campos, validaciones ni breakpoints.
- Verification attempt 1: `npm run check` pasó format, lint, typecheck, 80 API tests y 41 web tests. No blockers remain.

## 2026-11-20 - Eliminación de cuenta desde el perfil del empleado

- Backend: `canDeleteEmployeeAccount(actor, employeeId)` ahora permite al dueño seguir eliminando cualquier empleado de su organización y, además, a un actor `employee` eliminarse solo cuando `actor.employeeId === employeeId`. Otros empleados siguen dando 403. La ruta `DELETE /employees/:employeeId` pasa el id objetivo a la regla.
- Frontend: `MyProfileSection` muestra una tarjeta `profile-danger-card` solo cuando `isSelf` y llega `onDeleteAccount`, con botón rojo `Eliminar mi cuenta` y modal de confirmación. Tras éxito, `App.deleteOwnAccount()` usa `deleteEmployeeAccount(..., { mode: 'unassign' })` y llama a `performSignOut()` para cerrar la sesión de esa pestaña.
- No se quitó la eliminación que el dueño ya tenía en el directorio; la nueva acción es la auto-gestión del empleado en su perfil. Las tareas activas quedan sin asignar, igual que el modo por defecto del backend.
- Se agregaron tests de regla, HTTP y render; los tests pasaron de 80/36 a 81/43 (API/web).
- Verification attempt 1: `npm run check` falló en Prettier en `employee-invitation.ts` y `MyProfileSection.tsx`; se corrigió con `npx prettier --write` en esos dos archivos. Result: sin errores de estilo pendientes.
- Verification attempt 2: `npm run check` pasó format, lint, typecheck, 81 API tests y 43 web tests. Correction iterations for this session: 1/3. No blockers remain.

## 2026-11-20 - Estado de UI por actor, no solo por organización

- Causa: `workflowplus.ui` era una única clave en `localStorage` validada solo por `organizationId`. Como el almacenamiento se comparte entre pestañas, dueño y empleados de la misma organización sobreescribían `section`, `profileEmployeeId`, tema y densidad; un refresh cargaba la navegación ajena.
- Nueva helper `uiScopeKey(session, organizationId)`: `organization:<org>` para el dueño, `employee:<org>:<employeeId>` para cada empleado y `anonymous:<org>` sin sesión. `loadUiState(scope, organizationId)`, `storeUiState(scope, ui)` y `clearStoredSession(scope)` usan ahora claves `workflowplus.ui.<scope>`; el sign out borra solo el scope activo más la clave legacy.
- `App` calcula el scope con la sesión persistida al iniciar y con la sesión nueva al hacer login, y el efecto de guardado depende de ese scope. El script inicial de `index.html` Deriva la misma clave desde `sessionStorage` para evitar flash de tema.
- Se agregó un test de aislamiento dueño/empleado/otro empleado; los web tests pasaron de 43 a 44. Las sesiones ya estaban en `sessionStorage`, por lo que cada pestaña parte de su propio actor.
- Verification attempt 1: `npm run check` falló en Prettier en `App.tsx`; se corrigió con `npx prettier --write`. Result: sin errores de estilo pendientes.
- Verification attempt 2: `npm run check` pasó format, lint, typecheck, 81 API tests y 44 web tests. Correction iterations for this session: 1/3. No blockers remain.

## 2026-11-20 - Organigrama navegable y eliminación por perfil según rol

- `OverviewSection` recibe `onOpenProfile(employeeId)`; jefes y miembros del organigrama pasan de llevar al listado de empleados a abrir directamente `profileEmployeeId` del empleado tocado. Se agregó `aria-label="Ver perfil de …"` a cada nodo para accesibilidad y verificación estática.
- `MyProfileSection` muestra la tarjeta roja cuando recibe `onDeleteAccount`, pero `App` solo la pasa en dos casos: dueño viendo cualquier empleado (`deleteProfileEmployee`, vuelve a Empleados y refresca) o empleado viendo su propio perfil (`deleteOwnAccount`, cierra sesión). Un empleado viendo a otro no recibe la prop y no ve el botón.
- El botón usa `.button-danger` (`#b03030` con `color: #fff`). Textos contextuales: dueño ve “Eliminar cuenta del empleado”; empleado ve “Eliminar mi cuenta”. La regla backend de autogestión/propiedad ya implementada sigue vigente.
- Se agregaron tests de nodos del organigrama y de visibilidad por rol; los web tests pasaron de 44 a 46.
- Verification attempt 1: `npm run check` falló en Prettier en `App.test.tsx`; se corrigió con `npx prettier --write`. Result: sin errores de estilo pendientes.
- Verification attempt 2: `npm run check` pasó format, lint, typecheck, 81 API tests y 46 web tests. Correction iterations for this session: 1/3. No blockers remain.

## 2026-11-20 - Menú hamburguesa a la izquierda

- El toggle del workspace pasó a ser el primer hijo del `.topbar`, antes de la marca, y el media query `max-width: 699px` usa `justify-content: flex-start` con `gap` para que quede alineado a la izquierda sin empujar la marca al extremo derecho.
- Elícono deja de ser el carácter `☰`/`×` y ahora son tres barras reales (`.menu-toggle-bars` con tres `span`), con `aria-label`/`aria-expanded` existentes y override de color para modo nocturno.
- Se agregó un test estático que verifica el orden toggle → marca y la presencia de las tres barras; los web tests pasaron de 46 a 47.
- Verification attempt 1: `npm run check` pasó format, lint, typecheck, 81 API tests y 47 web tests. No blockers remain.

## 2026-11-20 - Simplificación de alta de tareas y directorio

- El formulario de nuevas tareas ya no pide “Tiempo estimado (minutos)”: se quitó del estado, de la validación `missingNewTaskFields` y del payload de `createTask`. El backend sigue aceptando el campo como opcional y guarda `null` cuando se omite, sin afectar la edición de tareas existentes.
- El directorio del dueño ya no muestra el botón “Eliminar” por empleado ni el modal `DeleteEmployeeConfirmation`; la eliminación sigue disponible desde el perfil del empleado (`MyProfileSection`) con la misma regla de permisos.
- Se actualizó el test de campos obligatorios y se agregó una aserción de que el directorio con sesión de organización no renderiza `row-action`/“Eliminar a …”.
- Verification attempt 1: `npm run check` falló en Prettier en `EmployeesSection.tsx`; se corrigió con `npx prettier --write`. Result: sin errores de estilo pendientes.
- Verification attempt 2: `npm run check` pasó format, lint, typecheck, 81 API tests y 47 web tests. Correction iterations for this session: 1/3. No blockers remain.

## 2026-11-21 - Mejoras de alta de tareas, detalle y jefes de departamento

- Categoría: el formulario de nueva tarea reemplaza el input con datalist por un `<select>` con "Seleccionar categoría" y las categorías de la organización, usando el mismo estilo del campo prioridad.
- Detalle de tareas: se quitaron la lista de verificación, sus controles y el campo "Checklist" de la vista rápida; los datos del checklist se conservan en la API y en el CSV. Se agregó la sección "Archivos" con enlaces de descarga de los adjuntos tenant-scoped.
- Navegación al detalle: se eliminó la flecha (→) de cada fila y se agregó un botón "Detalle" con `aria-label` en la lista y en las tarjetas Kanban; el botón abre el mismo modal de detalle.
- Adjuntos al crear: el formulario permite seleccionar uno o más archivos (hasta 5, 5 MB cada uno y 10 MB en total), los lee como data URL, permite quitarlos antes de crear y los envía en `POST /tasks`. El dominio valida el formato base64, el MIME y el tamaño declarado contra el contenido; `express.json` acepta el payload y `GET /tasks/:id/attachments` filtra también por `organizationId`.
- Actividad reciente: `POST /department-leads` y `DELETE /department-leads/:department` registran `department_lead_assigned` y `department_lead_removed` con el nombre del empleado y el departamento, usando el actor autenticado.
- Confirmación: "Remover" en Jefes de departamento abre un `alertdialog` que avisa que se quita al jefe de su puesto, con Cancelar y Confirmar en rojo; cierra con Escape, administra el foco y reporta errores sin cerrar.
- Se actualizó el centro de ayuda (botón Detalle, alta con archivos y límites reales) y se corrigieron tres mensajes de actividad con caracteres dañados.
- Verification attempt 1: `npm run check` se detuvo en Prettier en `apps/api/src/app.ts`; se aplicó `npm run format:write`.
- Verification attempt 2: `npm run check` falló en typecheck porque `recordEmployeeActivity` no aceptaba los nuevos tipos de actividad; se amplió su unión.
- Verification attempt 3: `npm run check` pasó format, lint, typecheck, 83 API tests y 52 web tests.
- Revisión de mejora: se corrigieron límites acumulativos de archivos entre selecciones, validación del contenido base64 en el servidor, filtrado por organización en `listTaskAttachments`, textos de ayuda, foco del diálogo y mensajes de actividad; se agregaron tests para los límites y el data URL falsificado.
- Verification attempt 4: `npm run check` pasó format, lint, typecheck y 83 API tests, pero falló el test del centro de ayuda porque el encabezado esperado seguía siendo "Comentarios y adjuntos"; se actualizó a "Comentarios y archivos".
- Verification attempt 5: `npm run check` pasó format, lint, typecheck, 83 API tests y 52 web tests. Correction iterations del ciclo de revisión: 2/3. No blockers remain.

## 2026-11-21 - Publicación y bootstrap de Supabase

- Se agregó `.github/workflows/deploy-pages.yml` para publicar el frontend en GitHub Pages y `base: '/WorkflowPlus/'` en `apps/web/vite.config.ts`; `npm run check` pasó y los cambios se subieron en `ea85760`.
- Se agregó `render.yaml` con el servicio API del monorepo (`buildCommand`, `startCommand`, `healthCheckPath: /health`, `WEB_ORIGIN` de Pages y variables de Supabase con `sync: false`); se simplificaron las variables de email opcionales en `0bd5bf4`.
- Se generó `supabase/bootstrap_all.sql` con las migraciones ordenadas para ejecutarlas de una sola vez en el SQL Editor de Supabase; subido en `1715b92`.
- Error de verificación en Supabase: `22P02: invalid input value for enum task_status: "cancelled"`. La migración `20261109000002_task_lifecycle_and_activity.sql` agregaba una restricción que comparaba `status` con `'cancelled'`, pero `task_status` no tenía ese valor.
- Corrección: nueva migración timestampada `20261109000000_align_task_status_enum.sql`, que agrega `pending`, `completed`, `cancelled` e `in_review` a `task_status` antes de la restricción. Se regeneró `supabase/bootstrap_all.sql` con 13 migraciones y se volvió a ejecutar `npm run check`.
- Nota: el error ocurrió en la verificación de BD, no en `npm run check`; el quality gate local sigue pasando con 83 API tests y 52 web tests.
- Segundo error de verificación en Supabase: `55P04: unsafe use of new value "cancelled" of enum type task_status`; los valores nuevos de un enum no pueden usarse hasta que se confirme la transacción que los agregó.
- Corrección: se reemplazó `supabase/bootstrap_all.sql` por dos archivos, `supabase/bootstrap_01_enum.sql` y `supabase/bootstrap_02_rest.sql`, para ejecutar primero el alta de valores del enum en su propia consulta y recién después el resto de las migraciones.
- Tercer error de verificación en Supabase: `22P02: invalid input value for enum task_status: "cancelled"` persistió en `bootstrap_02_rest.sql`. Se cambió la restricción `tasks_completion_timestamps_check` para comparar `status::text = 'cancelled'` en lugar de hacer el cast implícito al enum, eliminando la dependencia del orden de commit de los valores del enum. Se regeneró `bootstrap_02_rest.sql`.
- Bloqueo documentado tras agotar las 3/3 iteraciones de corrección de BD: el bootstrap SQL sigue siendo una deuda de verificación. Decisión para la publicación rápida: no ejecutar migraciones en la demo pública. La API actual mantiene tareas/empleados en memoria y usa Supabase únicamente para autenticación, así que el deploy necesita solo `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`. El esquema SQL queda pendiente de alineación/verificación posterior.

## 2026-11-22 - Registro e inicio de sesión bloqueados por CORS en la demo pública

- Causa: `render.yaml` configuraba `WEB_ORIGIN=https://JoaquinCarollo.github.io/WorkflowPlus/`, pero el navegador envía `Origin: https://joaquincarollo.github.io` (sin path y con host en minúsculas). La API devolvía ese valor inválido en `Access-Control-Allow-Origin`, por lo que el `fetch` de registro/login era bloqueado antes de leer la respuesta y la UI mostraba el mensaje genérico "No se pudo registrar..." / "No se pudo iniciar sesión...".
- Fix: `createApp` normaliza `WEB_ORIGIN` a `new URL(...).origin` antes de pasarlo a `cors()`, y falla rápido si el valor no es una URL absoluta. `render.yaml` conserva `https://JoaquinCarollo.github.io/WorkflowPlus/` porque los builders de links de email necesitan el path `/WorkflowPlus/`; la normalización solo afecta al header CORS. Se agregaron tests de response/preflight, de links con path y de configuración inválida.
- Verification attempt 1/3: `npm run check` falló en el nuevo test porque usé `joaquin334.github.io` como origin esperado en lugar de `joaquincarollo.github.io`; corregí el valor en el test.
- Verification attempt 2: `npm run check` pasó format, lint, typecheck, 84 API tests y 52 web tests.
- Verification attempt 3: `npm run check` se detuvo en Prettier por el formato del nuevo bloque en `PROGRESS.md`; se aplicó el formatter y la corrida pasó format, lint, typecheck, 84 API tests y 52 web tests.
- Revisión posterior: se detectó que quitar el path de `WEB_ORIGIN` rompía los links por email; se conservó el valor con path en `render.yaml` y se reforzó la normalización CORS. Corrección 1/3 de este ciclo aplicada.
- Verificación final: `npm run check` pasó format, lint, typecheck, 86 API tests y 52 web tests. No blockers locales.
- Pendiente externo: redesplegar la API para que el código normalizado llegue a producción; no hace falta cambiar variables en Render. El frontend ya publicado apunta a `https://workflowplus-api.onrender.com`.

## 2026-11-22 - Correo de recuperación no llega en la demo pública

- Causa: `render.yaml` no declaraba `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` ni `TRANSACTIONAL_EMAIL_FROM`. En producción, sin proveedor configurado, `createConfiguredTransactionalEmailMailer` devuelve `emailSent: false`; el token se descarta y no se envía ningún mail. Además, `handleRecovery` mostraba el mensaje de éxito sin leer el resultado, así que la UI decía "revisá tu correo" aunque el envío hubiera fallado.
- Fix: el blueprint declara las variables SMTP (`sync: false` para secretos, puerto 587) para que se carguen en Render; `assertTransactionalEmailProviderConfigured` falla en el arranque de producción si no hay SMTP ni API URL, evitando un deploy que "éxite" sin enviar mails; el endpoint de recuperación responde siempre 200 con `{ status, emailSent }` y la UI mantiene el aviso genérico para no enumerar cuentas. Se agregaron tests de mailer fallido, configuración de proveedor y contrato HTTP.
- Revisión posterior 1: la primera versión mostraba un error distinto cuando la cuenta existía pero fallaba el envío, lo que permitía enumerar cuentas. Corrección 1/3 aplicada: mensaje siempre genérico y `accountExists` eliminado del contrato web.
- Revisión posterior 2: el código HTTP 400/200 seguía distinguiendo cuentas existentes. Corrección 2/3 aplicada: el endpoint responde 200 en todos los casos.
- Verificación final: `npm run check` pasó format, lint, typecheck, 96 API tests y 52 web tests. No blockers locales.
- Pendiente externo: cargar en Render los mismos valores SMTP que ya están en `apps/api/.env` (sin commitearlos) y redesplegar la API. Opcionalmente se puede usar `TRANSACTIONAL_EMAIL_API_URL` / `TRANSACTIONAL_EMAIL_API_KEY` en lugar de SMTP.
- Diagnóstico en vivo posterior: la API desplegada arranca con `NODE_ENV=production` (el endpoint dev `/__dev__/recovery-emails` da 404) y `transporter.verify()` con las credenciales locales responde `SMTP_OK`, pero una recuperación real contra la única cuenta registrada devolvió `emailSent: false`. Agregado `console.error('[email] SMTP delivery failed:', reason)` en `createSmtpTransactionalEmailMailer` (sin secretos) para identificar el motivo exacto en los logs de Render; se necesita un nuevo deploy y un reintento.
- Segunda causa posible: si Render tiene `TRANSACTIONAL_EMAIL_API_URL` cargado, el mailer elige el proveedor HTTP y no pasaba por el log SMTP. Se agregaron logs de proveedor elegido y de fallo HTTP (`[email] Using ...`, `[email] HTTP email delivery failed: ...`) para cubrir ambos caminos. `Cannot GET /` en la raíz de la API es esperado; la ruta válida es `/health`.
- Tercer diagnóstico: los logs de Render no mostraban ni siquiera esos mensajes, así que el flujo cortaba antes del mailer. Se agregaron `[auth] Password recovery requested` al endpoint, `[email] Recovery skipped: account not found` cuando Supabase no halla la cuenta y `[email] Recovery delivery failed for an existing account` cuando el mailer devuelve false. Con el próximo deploy se puede identificar si el problema es entrega del request, búsqueda de cuenta o envío.
- Cuarto diagnóstico (confirmado): los logs mostraron `[auth] Password recovery requested` seguido de `[email] Recovery skipped: account not found`, por lo que la API recibe el pedido pero `auth.admin.listUsers` no encuentra la cuenta. Se agregaron logs seguros de arranque (`[supabase] project host`, `[supabase] service role differs from anon`) y del error de búsqueda (`[supabase] Account lookup failed: ...`). El host local es `vevgvfvilacmiukyzzqf.supabase.co` y localmente la service role key existe y difiere de la anon key; falta comparar eso en Render.
- Quinto diagnóstico (confirmado): después de corregir `SUPABASE_URL` y las keys en Render, la búsqueda de cuenta funciona y el flujo llega al mailer, pero aparece `[email] SMTP delivery failed: Connection timeout`. Render bloquea SMTP saliente, así que se migró el envío a HTTP usando Brevo (`https://api.brevo.com/v3/smtp/email`, header `api-key`, payload `sender/to/subject/textContent/htmlContent`). Brevo permite verificar una casilla sin dominio, a diferencia de Resend. El cambio cubre recuperación, invitaciones de empleados y notificaciones de tareas; el registro sigue usando el correo propio de Supabase. Referencias: `https://developers.brevo.com/reference/create-sender` y `https://developers.brevo.com/reference/send-transac-email`.
