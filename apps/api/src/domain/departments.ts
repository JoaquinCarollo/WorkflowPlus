import { randomUUID } from 'node:crypto';

export interface Department {
  id: string;
  organizationId: string;
  name: string;
  createdAt: string;
}

export interface CreateDepartmentInput {
  organizationId: string;
  name: string;
}

export interface CreateDepartmentResult {
  status: 'created' | 'denied';
  reason: 'duplicate' | 'invalid_input' | null;
  department: Department | null;
}

const DEPARTMENTS = new Map<string, Department>();

export function createDepartment(
  input: CreateDepartmentInput,
  now: number = Date.now(),
): CreateDepartmentResult {
  const trimmedName = input.name.trim();
  if (!trimmedName || trimmedName.length > 120) {
    return { status: 'denied', reason: 'invalid_input', department: null };
  }
  const existing = [...DEPARTMENTS.values()].find(
    (dept) =>
      dept.organizationId === input.organizationId &&
      dept.name.toLowerCase() === trimmedName.toLowerCase(),
  );
  if (existing) {
    return { status: 'denied', reason: 'duplicate', department: null };
  }
  const department: Department = {
    id: randomUUID(),
    organizationId: input.organizationId,
    name: trimmedName,
    createdAt: new Date(now).toISOString(),
  };
  DEPARTMENTS.set(department.id, department);
  return { status: 'created', reason: null, department };
}

export function listDepartments(organizationId: string): Department[] {
  return [...DEPARTMENTS.values()]
    .filter((dept) => dept.organizationId === organizationId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getDepartmentById(id: string): Department | undefined {
  return DEPARTMENTS.get(id);
}

export function deleteDepartment(
  id: string,
  organizationId: string,
): { status: 'deleted' | 'denied'; reason: 'not_found' | null } {
  const department = DEPARTMENTS.get(id);
  if (!department || department.organizationId !== organizationId) {
    return { status: 'denied', reason: 'not_found' };
  }
  DEPARTMENTS.delete(id);
  return { status: 'deleted', reason: null };
}

export function clearDepartmentsForTest(): void {
  DEPARTMENTS.clear();
}
