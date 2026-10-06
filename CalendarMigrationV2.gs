/**
 * GES V4 Calendar V2 explicit migration helpers.
 *
 * Safety:
 * - preview is read-only;
 * - apply never deletes Calendar events or registry rows;
 * - safe aliases are renamed in-place to preserve Calendar Event IDs;
 * - unsafe/retired V1 rows are left intact and Calendar Sync later marks them
 *   ORPHANED. Cleanup/deletion is intentionally out of scope.
 */

const GES_CALENDAR_V2_MIGRATION = Object.freeze({
  VERSION: '2.0.0',
  STATUS_PENDING: 'PENDING',
  STATUS_VERIFIED: 'VERIFIED',
  STATUS_NOT_REQUIRED: 'NOT_REQUIRED',
  STATUS_NEEDS_REVIEW: 'NEEDS_REVIEW',
  ALIASES: Object.freeze({
    ROOT_FOLDER: 'PROJECT_FOLDER',
    PDF_FOLDER: 'PDFS_FOLDER',
    IMAGES_FOLDER: 'PHOTOS_FOLDER',
    ENTITY_SHEET: 'PROJECT_URL_SHEET',
    DOC_SOURCE: 'EXACT_MATCH_DOC',
    SLIDES_FILE: 'EXACT_MATCH_SLIDES',
    FORM: 'PROJECT_FORM',
    DRAWING: 'PROJECT_DRAWING'
  }),
  RETIRED_KEYS: Object.freeze(['PROJECT_HUB','PDF_FILE','DOCX_FILE','HTML_FILE'])
});

function getCalendarV2MigrationStateV4(projectId) {
  var project = resolveCalendarProjectV4_(projectId || '');
  var saved = project.calendar && project.calendar.v2Migration ? project.calendar.v2Migration : {};
  if (safeString_(saved.status) === GES_CALENDAR_V2_MIGRATION.STATUS_VERIFIED) {
    return { required: false, status: 'VERIFIED', verifiedAt: safeString_(saved.verifiedAt), version: safeString_(saved.version || GES_CALENDAR_V2_MIGRATION.VERSION) };
  }

  var rows = typeof getCalendarRegistryRowsV4 === 'function' ? getCalendarRegistryRowsV4(project.projectId) : [];
  if (!rows.length) return { required: false, status: 'NOT_REQUIRED', legacyRowCount: 0 };

  var legacyRows = rows.filter(function(row) {
    return safeString_(row.templateId) !== GES_CALENDAR_PLAN_SCHEMA_V4.TEMPLATE_ID ||
      GES_CALENDAR_PLAN_SCHEMA_V4.EVENT_ROLES.indexOf(safeString_(row.eventKey)) === -1;
  });
  if (!legacyRows.length) return { required: false, status: 'NOT_REQUIRED', legacyRowCount: 0 };

  return { required: true, status: 'PENDING', legacyRowCount: legacyRows.length };
}

function previewCalendarV2MigrationV4(projectId) {
  var project = resolveCalendarProjectV4_(projectId || '');
  var plan = previewCalendarPlanV4(project.projectId);
  var rows = getCalendarRegistryRowsV4(project.projectId);
  var byKey = {};
  rows.forEach(function(row) { byKey[row.eventKey] = byKey[row.eventKey] || []; byKey[row.eventKey].push(row); });
  var planByKey = {};
  plan.events.forEach(function(event) { planByKey[event.eventKey] = event; });

  var aliasActions = [];
  var conflicts = [];
  Object.keys(GES_CALENDAR_V2_MIGRATION.ALIASES).forEach(function(oldKey) {
    var newKey = GES_CALENDAR_V2_MIGRATION.ALIASES[oldKey];
    var oldRows = byKey[oldKey] || [];
    if (!oldRows.length) return;
    if (oldRows.length > 1) {
      conflicts.push({ type: 'OLD_KEY_DUPLICATE', oldEventKey: oldKey, newEventKey: newKey, count: oldRows.length });
      return;
    }
    var targetRows = byKey[newKey] || [];
    if (targetRows.length) {
      conflicts.push({ type: 'TARGET_KEY_EXISTS', oldEventKey: oldKey, newEventKey: newKey, count: targetRows.length });
      return;
    }

    var oldRow = oldRows[0];
    var planned = planByKey[newKey];
    var plannedAssetId = safeString_(planned && planned.source && planned.source.id);
    var oldAssetId = safeString_(oldRow.assetId);
    var sourceSafe = !!planned && planned.availability && planned.availability.status === 'READY' && !!plannedAssetId && !!oldAssetId && plannedAssetId === oldAssetId;

    aliasActions.push({
      oldEventKey: oldKey,
      newEventKey: newKey,
      eventId: safeString_(oldRow.eventId),
      oldAssetId: oldAssetId,
      plannedAssetId: plannedAssetId,
      sourceSafe: sourceSafe,
      action: sourceSafe ? 'RENAME_IN_PLACE_KEEP_EVENT_ID' : 'KEEP_OLD_AS_ORPHAN_CREATE_NEW_IF_READY',
      reason: sourceSafe ? 'SAME_CANONICAL_ASSET' : 'CANONICAL_ASSET_CHANGED_OR_NOT_READY'
    });
  });

  var sameKeyLegacy = rows.filter(function(row) {
    return GES_CALENDAR_PLAN_SCHEMA_V4.EVENT_ROLES.indexOf(row.eventKey) !== -1 && safeString_(row.templateId) !== GES_CALENDAR_PLAN_SCHEMA_V4.TEMPLATE_ID;
  }).map(function(row) {
    return { eventKey: row.eventKey, eventId: row.eventId, action: 'KEEP_EVENT_ID_PATCH_ON_SYNC' };
  });

  var retired = rows.filter(function(row) {
    return GES_CALENDAR_PLAN_SCHEMA_V4.EVENT_ROLES.indexOf(row.eventKey) === -1 && !GES_CALENDAR_V2_MIGRATION.ALIASES[row.eventKey];
  }).map(function(row) {
    return { eventKey: row.eventKey, eventId: row.eventId, action: 'KEEP_REMOTE_MARK_ORPHANED_ON_SYNC' };
  });

  var state = getCalendarV2MigrationStateV4(project.projectId);
  var result = {
    success: conflicts.length === 0,
    version: GES_CALENDAR_V2_MIGRATION.VERSION,
    projectId: project.projectId,
    projectName: project.projectName,
    currentState: state,
    targetTemplateId: GES_CALENDAR_PLAN_SCHEMA_V4.TEMPLATE_ID,
    aliasActions: aliasActions,
    sameKeyLegacy: sameKeyLegacy,
    retired: retired,
    conflicts: conflicts,
    safeRenameCount: aliasActions.filter(function(x) { return x.sourceSafe; }).length,
    keptOrphanCount: aliasActions.filter(function(x) { return !x.sourceSafe; }).length + retired.length,
    destructiveActions: [],
    requiresConfirmation: state.required === true
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function previewActiveCalendarV2MigrationV4() {
  return previewCalendarV2MigrationV4('');
}

function applyCalendarV2MigrationV4(projectId) {
  assertCalendarServiceAvailableV4_();
  var project = resolveCalendarProjectV4_(projectId || '');
  assertProjectWritable_(project);
  var preview = previewCalendarV2MigrationV4(project.projectId);
  if (preview.conflicts.length) throw new Error('CALENDAR_V2_MIGRATION_CONFLICT: ' + JSON.stringify(preview.conflicts));

  var plan = previewCalendarPlanV4(project.projectId);
  var planByKey = {};
  plan.events.forEach(function(e) { planByKey[e.eventKey] = e; });
  var rows = getCalendarRegistryRowsV4(project.projectId);
  var calendarState = collectProjectCalendarIdsV4_(project, rows);
  if (calendarState.ids.length > 1) throw new Error('CALENDAR_V2_MIGRATION_MULTIPLE_CALENDARS');
  var calendarId = calendarState.ids.length === 1 ? calendarState.ids[0] : '';
  var results = [];

  preview.aliasActions.forEach(function(item) {
    if (!item.sourceSafe) {
      results.push({ oldEventKey: item.oldEventKey, newEventKey: item.newEventKey, action: 'KEEP_OLD_FOR_ORPHAN', success: true });
      return;
    }
    var planned = planByKey[item.newEventKey];
    var oldRecord = getCalendarRegistryRecordV4(project.projectId, item.oldEventKey);
    if (!oldRecord) throw new Error('CALENDAR_V2_MIGRATION_OLD_RECORD_MISSING: ' + item.oldEventKey);

    if (calendarId && oldRecord.eventId) {
      var remote = getRemoteCalendarEventOrNullV4_(calendarId, oldRecord.eventId);
      if (remote) patchRemoteCalendarEventKeyForV2_(project, plan, remote, calendarId, item.newEventKey);
    }

    var renamed = renameCalendarRegistryEventKeyV4(project.projectId, item.oldEventKey, item.newEventKey, {
      eventRole: planned.role,
      templateId: plan.templateId,
      planVersion: plan.planVersion,
      eventSummary: planned.summary,
      sourceKind: planned.sourceKind,
      assetType: safeString_(planned.source.assetType),
      assetId: safeString_(planned.source.id),
      assetUrl: safeString_(planned.source.url),
      recurrenceRule: safeString_(planned.recurrence.rrulePreview),
      byDay: planned.recurrence.byDay.slice(),
      allDay: planned.recurrence.allDay === true,
      startTime: planned.recurrence.allDay ? '' : calendarV2Pad2_(planned.recurrence.startHour) + ':' + calendarV2Pad2_(planned.recurrence.startMinute),
      durationMinutes: planned.recurrence.durationMinutes,
      visibility: planned.visibility,
      transparency: planned.transparency,
      location: planned.location,
      attachmentCount: planned.attachments.length,
      urlRefCount: planned.urlRefs.length,
      fingerprint: planned.fingerprint,
      status: oldRecord.eventId ? 'OUTDATED' : 'PLANNED',
      resolutionMethod: 'CALENDAR_V2_SAFE_ALIAS_RENAME',
      notes: 'RENAMED_FROM_' + item.oldEventKey + '_KEEP_EVENT_ID'
    });
    results.push(renamed);
  });

  // Same-key legacy rows keep their identity/Event ID; mark OUTDATED so Sync
  // patches schedule/content/template on the same remote series.
  preview.sameKeyLegacy.forEach(function(item) {
    try {
      patchCalendarRegistryRecordV4(project.projectId, item.eventKey, {
        templateId: plan.templateId,
        planVersion: plan.planVersion,
        status: item.eventId ? 'OUTDATED' : 'PLANNED',
        resolutionMethod: 'CALENDAR_V2_SAME_KEY_KEEP_EVENT_ID',
        notes: 'CALENDAR_V2_PATCH_ON_SYNC'
      }, { createIfMissing: false });
      results.push({ eventKey: item.eventKey, action: 'KEEP_EVENT_ID_PATCH_ON_SYNC', success: true, eventId: item.eventId || '' });
    } catch (e) {
      results.push({ eventKey: item.eventKey, action: 'ERROR', success: false, error: safeString_(e && e.message || e) });
    }
  });

  var failed = results.filter(function(r) { return r.success === false; });
  if (failed.length) {
    throw new Error('CALENDAR_V2_MIGRATION_APPLY_FAILED: ' + JSON.stringify(failed));
  }

  project = getProject_(project.projectId);
  project.calendar = project.calendar || {};
  project.calendar.v2Migration = {
    version: GES_CALENDAR_V2_MIGRATION.VERSION,
    status: 'VERIFIED',
    verifiedAt: nowIso_(),
    targetTemplateId: plan.templateId,
    safeRenames: preview.safeRenameCount,
    keptForOrphan: preview.keptOrphanCount
  };
  saveProject_(project);
  try { if (typeof refreshProjectUrlSheetCalendarEventsV41 === 'function') refreshProjectUrlSheetCalendarEventsV41(project.projectId); } catch (ignore) {}

  var result = {
    success: results.every(function(r) { return r.success !== false; }),
    projectId: project.projectId,
    projectName: project.projectName,
    status: 'VERIFIED',
    calendarId: calendarId,
    results: results,
    destructiveActions: []
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function applyActiveCalendarV2MigrationV4() {
  return applyCalendarV2MigrationV4('');
}

function patchRemoteCalendarEventKeyForV2_(project, plan, remote, calendarId, newEventKey) {
  var privateProps = Object.assign({}, remote && remote.extendedProperties && remote.extendedProperties.private || {});
  privateProps.gesProjectId = project.projectId;
  privateProps.gesEventKey = newEventKey;
  privateProps.gesCalendarTemplate = plan.templateId;
  privateProps.gesPlanVersion = String(plan.planVersion);
  privateProps.gesFingerprint = 'CALENDAR_V2_MIGRATION_PENDING_PATCH';
  privateProps.gesCalendarSchema = 'V2';
  Calendar.Events.patch({ extendedProperties: { private: privateProps } }, calendarId, remote.id, { sendUpdates: 'none' });
}

function assertCalendarV2MigrationReadyV4_(projectId) {
  var state = getCalendarV2MigrationStateV4(projectId || '');
  if (state.required) throw new Error('CALENDAR_V2_MIGRATION_REQUIRED');
  return state;
}

function calendarV2Pad2_(value) {
  var n = Number(value || 0);
  return n < 10 ? '0' + n : String(n);
}
