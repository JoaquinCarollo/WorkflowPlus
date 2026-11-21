import { createHash, randomInt } from 'node:crypto';

const ACCESS_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ACCESS_CODE_GROUP_LENGTH = 4;
const ACCESS_CODE_GROUPS = 3;

export function generateEmployeeAccessCode(): string {
  const groups = Array.from({ length: ACCESS_CODE_GROUPS }, () => {
    let group = '';
    for (let index = 0; index < ACCESS_CODE_GROUP_LENGTH; index += 1) {
      group += ACCESS_CODE_ALPHABET[randomInt(ACCESS_CODE_ALPHABET.length)];
    }
    return group;
  });

  return `TFA-${groups.join('-')}`;
}

export function digestEmployeeAccessCode(accessCode: string): string {
  return createHash('sha256').update(accessCode).digest('hex');
}
