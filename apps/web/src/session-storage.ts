import type { SessionActor } from './api.js';

const STORAGE_KEY = 'workflowplus.session';
const UI_KEY = 'workflowplus.ui';

export interface StoredSession {
  session: SessionActor;
  organizationId: string;
}

export function uiScopeKey(session: SessionActor | null, organizationId: string): string {
  if (session?.kind === 'employee' && session.employeeId) {
    return `employee:${organizationId}:${session.employeeId}`;
  }
  if (session?.kind === 'organization') {
    return `organization:${organizationId}`;
  }
  return `anonymous:${organizationId}`;
}

function isSessionActor(value: unknown): value is SessionActor {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const actor = value as Record<string, unknown>;
  if (actor.kind === 'organization') {
    return true;
  }
  if (actor.kind === 'employee') {
    return (
      typeof actor.employeeId === 'string' &&
      actor.employeeId.length > 0 &&
      (actor.authorityLevel === 'administrative' || actor.authorityLevel === 'operative')
    );
  }
  return false;
}

export function loadStoredSession(): StoredSession | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.organizationId !== 'string' || parsed.organizationId.trim().length === 0) {
      return null;
    }
    if (!isSessionActor(parsed.session)) {
      return null;
    }
    return { session: parsed.session, organizationId: parsed.organizationId };
  } catch {
    return null;
  }
}

export function storeSession(stored: StoredSession): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // ignore storage failures
  }
}

export function clearActiveSession(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
}

export function clearStoredSession(scopeKey = ''): void {
  clearActiveSession();
  try {
    if (scopeKey) {
      window.localStorage.removeItem(`${UI_KEY}.${scopeKey}`);
    }
    window.localStorage.removeItem(UI_KEY);
  } catch {
    // ignore storage failures
  }
}

export type StoredSection = 'overview' | 'tasks' | 'employees' | 'profile' | 'help';
export type StoredTheme = 'light' | 'dark';
export type StoredDensity = 'comfortable' | 'compact';

export interface StoredUiState {
  section: StoredSection;
  profileEmployeeId: string | null;
  theme: StoredTheme;
  density: StoredDensity;
  organizationId: string;
}

const VALID_SECTIONS: StoredSection[] = ['overview', 'tasks', 'employees', 'profile', 'help'];
const VALID_THEMES: StoredTheme[] = ['light', 'dark'];
const VALID_DENSITIES: StoredDensity[] = ['comfortable', 'compact'];

export function loadUiState(scopeKey: string, organizationId = ''): StoredUiState | null {
  try {
    const raw = window.localStorage.getItem(`${UI_KEY}.${scopeKey}`);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const section = parsed.section;
    if (typeof section !== 'string' || !VALID_SECTIONS.includes(section as StoredSection)) {
      return null;
    }
    const storedOrganizationId =
      typeof parsed.organizationId === 'string' && parsed.organizationId.trim().length > 0
        ? parsed.organizationId
        : '';
    if (organizationId && storedOrganizationId !== organizationId) {
      return null;
    }
    const profileEmployeeId =
      typeof parsed.profileEmployeeId === 'string' && parsed.profileEmployeeId.length > 0
        ? parsed.profileEmployeeId
        : null;
    const theme = parsed.theme;
    const density = parsed.density;
    return {
      section: section as StoredSection,
      profileEmployeeId,
      theme:
        typeof theme === 'string' && VALID_THEMES.includes(theme as StoredTheme)
          ? (theme as StoredTheme)
          : 'light',
      density:
        typeof density === 'string' && VALID_DENSITIES.includes(density as StoredDensity)
          ? (density as StoredDensity)
          : 'comfortable',
      organizationId: storedOrganizationId,
    };
  } catch {
    return null;
  }
}

export function storeUiState(scopeKey: string, ui: StoredUiState): void {
  try {
    window.localStorage.setItem(`${UI_KEY}.${scopeKey}`, JSON.stringify(ui));
  } catch {
    // ignore storage failures
  }
}
