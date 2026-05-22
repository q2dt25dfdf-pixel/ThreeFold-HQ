import { TASK_DONE_STATUSES } from "@/lib/constants";
import { readField, statusText, stringField } from "@/lib/recordUtils";

export type FollowUpLeadRecord = Record<string, unknown> & { id: string };
export type FollowUpTaskRecord = Record<string, unknown> & { id: string };

export const CRM_FOLLOW_UP_SOURCE = "CRM";

export function autoFollowUpTaskId(leadId: string): string {
  return `crm-followup-${leadId}`;
}

export function hasFollowUpDate(date: string | undefined): date is string {
  return Boolean(date && /^\d{4}-\d{2}-\d{2}$/.test(date.trim()));
}

export function isTaskDone(task: FollowUpTaskRecord): boolean {
  return task.completed === true || TASK_DONE_STATUSES.has(statusText(task));
}

export function taskLeadId(task: FollowUpTaskRecord): string {
  return (
    stringField(task, "crmLeadId") ||
    stringField(task, "leadId") ||
    stringField(task, "crm_lead_id") ||
    stringField(task, "lead_id")
  );
}

export function isCrmFollowUpTask(task: FollowUpTaskRecord): boolean {
  return (
    stringField(task, "source") === CRM_FOLLOW_UP_SOURCE ||
    Boolean(taskLeadId(task)) ||
    task.id.startsWith("crm-followup-")
  );
}

export function findFollowUpTaskForLead(
  tasks: FollowUpTaskRecord[],
  leadId: string,
): FollowUpTaskRecord | undefined {
  return tasks.find((task) => (
    task.id === autoFollowUpTaskId(leadId) ||
    taskLeadId(task) === leadId
  ));
}

export function isLeadFollowUpComplete(
  lead: FollowUpLeadRecord,
  tasks: FollowUpTaskRecord[],
): boolean {
  const task = findFollowUpTaskForLead(tasks, lead.id);
  return Boolean(task && isCrmFollowUpTask(task) && isTaskDone(task));
}

export function leadFollowUpDate(lead: FollowUpLeadRecord): string {
  return readField(lead, "followUpDate", "follow_up_date");
}

export function isLeadFollowUpDueWithin(
  lead: FollowUpLeadRecord,
  tasks: FollowUpTaskRecord[],
  throughISO: string,
): boolean {
  const date = leadFollowUpDate(lead);
  return hasFollowUpDate(date) && date <= throughISO && !isLeadFollowUpComplete(lead, tasks);
}
