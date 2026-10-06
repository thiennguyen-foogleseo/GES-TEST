/**
 * Calendar V2 -> V2.1 safe upgrade diagnostics.
 *
 * V2.1 deliberately keeps the same 15 event keys and template ID. Existing
 * Calendar Event IDs therefore do not require a second migration; Sync Calendar
 * patches schedule/description/attachments in place when fingerprints differ.
 */

function previewActiveCalendarV21UpgradeV4() {
  var project = getActiveProject_();
  if (!project) throw new Error('NO_ACTIVE_PROJECT');
  var plan = previewActiveCalendarPlanV4();
  var rows = getCalendarRegistryRowsV4(project.projectId) || [];
  var byKey = {};
  rows.forEach(function(row) { byKey[safeString_(row.eventKey)] = row; });

  var events = plan.events.map(function(event) {
    var row = byKey[event.eventKey] || null;
    return {
      eventKey: event.eventKey,
      summary: event.summary,
      scheduleLabel: event.scheduleLabel,
      availability: event.availability.status,
      registryStatus: row ? safeString_(row.status) : 'MISSING_REGISTRY_ROW',
      eventId: row ? safeString_(row.eventId) : '',
      sameFingerprint: !!(row && safeString_(row.fingerprint) === safeString_(event.fingerprint)),
      actionExpected: !row || !row.eventId
        ? (event.availability.status === 'READY' ? 'CREATE_OR_ADOPT' : 'PLAN_ONLY')
        : (safeString_(row.fingerprint) === safeString_(event.fingerprint) ? 'SKIP_CURRENT' : 'PATCH_SAME_EVENT_ID')
    };
  });

  var migration = typeof getCalendarV2MigrationStateV4 === 'function'
    ? getCalendarV2MigrationStateV4(project.projectId)
    : { required:false, status:'UNKNOWN' };

  var result = {
    success: true,
    version: '2.1.1',
    projectId: project.projectId,
    projectName: project.projectName,
    schemaVersion: plan.schemaVersion,
    templateId: plan.templateId,
    planVersion: plan.planVersion,
    preservesTemplateId: plan.templateId === 'GES_PROJECT_CALENDAR_V2_15_EVENTS',
    preservesEventKeys: true,
    requiresNewV21Migration: false,
    existingV2Migration: migration,
    eventCount: plan.events.length,
    expectedPatchCount: events.filter(function(x) { return x.actionExpected === 'PATCH_SAME_EVENT_ID'; }).length,
    expectedCreateOrAdoptCount: events.filter(function(x) { return x.actionExpected === 'CREATE_OR_ADOPT'; }).length,
    events: events
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}
