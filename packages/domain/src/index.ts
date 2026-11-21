export type OrganizationRole = 'owner' | 'manager' | 'employee';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'blocked' | 'done';

export interface TenantContext {
  organizationId: string;
  userId: string;
  role: OrganizationRole;
}

export interface AssignmentRecommendation {
  taskId: string;
  organizationId: string;
  candidateUserId: string;
  score: number;
  rationale: string[];
  coordinatorVersion: string;
}

export interface EmployeeAccessInviteRequest {
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string;
  position: string;
}

export interface EmployeeInvitation {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string;
  position: string;
}

export interface OrganizationRegistrationRequest {
  companyName: string;
  email: string;
  password: string;
  organizationType: string;
  description?: string;
}
