import { describe, expect, it } from 'vitest';
import { digestEmployeeAccessCode, generateEmployeeAccessCode } from './employee-access-code.js';

describe('employee access codes', () => {
  it('generates a readable code without ambiguous characters', () => {
    expect(generateEmployeeAccessCode()).toMatch(
      /^TFA-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/,
    );
  });

  it('creates a SHA-256 digest without retaining the source code', () => {
    expect(digestEmployeeAccessCode('TFA-ABCD-EFGH-JKLM')).toMatch(/^[a-f0-9]{64}$/);
  });
});
