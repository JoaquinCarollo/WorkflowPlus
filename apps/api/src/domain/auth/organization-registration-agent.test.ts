import { describe, expect, it } from 'vitest';
import { organizationRegistrationCompletenessAgent } from './organization-registration-agent.js';

describe('organization registration completeness agent', () => {
  it('identifies every missing required field without returning their values', () => {
    expect(
      organizationRegistrationCompletenessAgent({
        companyName: ' ',
        email: '',
        password: '',
        organizationType: 'Empresa de servicios',
      }),
    ).toEqual({
      complete: false,
      missingFields: ['companyName', 'email', 'password'],
      agentVersion: 'organization-registration-completeness-v1',
    });
  });

  it('accepts complete registration details', () => {
    expect(
      organizationRegistrationCompletenessAgent({
        companyName: 'Norte Studio',
        email: 'owner@norte.test',
        password: 'not-returned-by-the-agent',
        organizationType: 'Empresa de servicios',
      }),
    ).toMatchObject({ complete: true, missingFields: [] });
  });
});
