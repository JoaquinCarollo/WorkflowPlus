export type RequiredOrganizationField = 'companyName' | 'email' | 'password' | 'organizationType';

export interface OrganizationRegistrationDetails {
  companyName: string;
  email: string;
  password: string;
  organizationType: string;
  description?: string;
}

export interface RegistrationCompletenessAssessment {
  complete: boolean;
  missingFields: RequiredOrganizationField[];
  agentVersion: 'organization-registration-completeness-v1';
}

// This deterministic specialist checks only whether required values exist; it never logs a password.
export function organizationRegistrationCompletenessAgent(
  details: OrganizationRegistrationDetails,
): RegistrationCompletenessAssessment {
  const fields: Array<[RequiredOrganizationField, string]> = [
    ['companyName', details.companyName],
    ['email', details.email],
    ['password', details.password],
    ['organizationType', details.organizationType],
  ];
  const missingFields = fields
    .filter(([, value]) => value.trim().length === 0)
    .map(([field]) => field);

  return {
    complete: missingFields.length === 0,
    missingFields,
    agentVersion: 'organization-registration-completeness-v1',
  };
}
