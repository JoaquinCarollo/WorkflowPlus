import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canUseAssistant, detectAssistantIntents, runAssistantQuery } from './assistant.js';
import {
  clearEmployeeInvitationsForTest,
  createEmployeeInvitation,
  listJoinedEmployees,
  redeemEmployeeAccessCode,
  type EmployeeCodeEmailMailer,
  type EmployeeCodeEmailMessage,
} from '../auth/employee-invitation.js';
import { clearTasksForTest, createTask, listTasks } from '../tasks/tasks.js';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

function capturingMailer() {
  const messages: EmployeeCodeEmailMessage[] = [];
  const mailer: EmployeeCodeEmailMailer = {
    sendEmployeeCodeEmail: async (message: EmployeeCodeEmailMessage) => {
      messages.push(message);
      return { emailSent: true };
    },
  };
  return { messages, mailer };
}

describe('assistant orchestrator', () => {
  beforeEach(() => {
    clearEmployeeInvitationsForTest();
    clearTasksForTest();
  });

  afterEach(() => {
    clearEmployeeInvitationsForTest();
    clearTasksForTest();
  });

  it('allows only organization actors to use the assistant', () => {
    expect(canUseAssistant({ kind: 'organization' })).toBe(true);
    expect(canUseAssistant(null)).toBe(false);
    expect(
      canUseAssistant({ kind: 'employee', authorityLevel: 'operative', employeeId: 'emp-1' }),
    ).toBe(false);
  });

  it('routes overload queries to employee, task and department analyses', () => {
    expect(detectAssistantIntents('Quien esta sobrecargado?')).toEqual([
      'employee_analysis',
      'task_analysis',
      'department_analysis',
    ]);
  });

  it('answers with task findings backed by real task data', () => {
    const created = createTask({
      organizationId: ORGANIZATION_ID,
      title: 'Auditar sistema',
      priority: 'high',
      dueAt: new Date(Date.parse('2026-11-01T10:00:00.000Z')).toISOString(),
    });
    expect(created.status).toBe('created');
    expect(listTasks(ORGANIZATION_ID)).toHaveLength(1);

    const answer = runAssistantQuery({
      organizationId: ORGANIZATION_ID,
      query: 'Que tareas estan pendientes?',
      now: Date.parse('2026-11-09T12:00:00.000Z'),
    });
    expect(answer.status).toBe('answered');
    expect(answer.agentVersion).toBe('assistant-orchestrator-v1');
    expect(answer.findings.length).toBeGreaterThan(0);
    expect(answer.answer).toContain('Tareas atrasadas');
  });

  it('recognizes insufficient information when the organization has no data', () => {
    const answer = runAssistantQuery({
      organizationId: ORGANIZATION_ID,
      query: 'Cual es la carga?',
    });
    expect(answer.status).toBe('insufficient');
    expect(answer.answer).toContain('No tengo informaci\u00f3n suficiente');
  });

  it('detects an overloaded employee from assigned tasks and capacity', async () => {
    const { messages, mailer } = capturingMailer();
    await createEmployeeInvitation(
      {
        organizationId: ORGANIZATION_ID,
        firstName: 'Andrea',
        lastName: 'Lopez',
        email: 'andrea@correo.com',
        position: 'Disenadora',
        weeklyCapacityHours: 5,
      },
      { mailer },
    );
    redeemEmployeeAccessCode(messages[0].accessCode, ORGANIZATION_ID);
    const employee = listJoinedEmployees(ORGANIZATION_ID)[0];
    expect(employee).toBeDefined();

    const task = createTask({
      organizationId: ORGANIZATION_ID,
      title: 'Auditoria grande',
      priority: 'urgent',
      ownerId: employee.id,
      estimatedMinutes: 400,
    });
    expect(task.status).toBe('created');

    const answer = runAssistantQuery({
      organizationId: ORGANIZATION_ID,
      query: 'Quien esta sobrecargado?',
      now: Date.parse('2026-11-09T12:00:00.000Z'),
    });
    expect(answer.status).toBe('answered');
    expect(answer.findings.some((finding) => finding.title.startsWith('Sobrecarga laboral'))).toBe(
      true,
    );
    expect(answer.answer).toContain('Sobrecarga laboral');
  });
});
