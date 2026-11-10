// The built-in Maintenance tag. Mirrors the web (lib/smartclean/taskTags.ts) and the server
// (app/services/task_tags.py): one fixed spelling, never renamed, and only people with maintenance access
// can add or remove it. The native app does not create or edit tasks, so it only needs to recognise the tag.

export const MAINTENANCE_TAG = "Maintenance";

export const hasMaintenanceTag = (tags: string[] | undefined) =>
  (tags ?? []).some(
    (t) => t.trim().toLowerCase() === MAINTENANCE_TAG.toLowerCase(),
  );
