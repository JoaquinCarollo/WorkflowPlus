# Supabase Verification

Run the migrations against a local Supabase instance with `supabase db reset` before deploying them.

## Employee invitation RLS check

1. Create organization A and B, an owner/member for each, and an `employee_access_invites` row in A.
2. Authenticate as the member of B and confirm that selecting, inserting, updating, or deleting A's invite returns no row or an RLS denial.
3. Authenticate as an employee of A and confirm that creating or reading invitations is denied.
4. Authenticate as the owner or manager of A and confirm that the invitation can be created and its metadata can be read.
5. Confirm that no API response, browser request, database row, or log contains the raw access code. Only its SHA-256 digest belongs in `employee_access_invites`.

## Delivery check

The production API must generate a code with `generateEmployeeAccessCode`, store `digestEmployeeAccessCode(code)`, and send the raw value exactly once through the configured transactional email provider. The same code authenticates the employee on every sign-in (assigning the same employee id) until the organization owner deletes the employee account; codes of deleted accounts cannot authenticate an employee.
