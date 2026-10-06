/** Non-destructive tests for Calendar V2 -> Registry URL Variants -> Public Assets. */

function runCalendarV2PublicProjectionSmokeTestsV45() {
  var project = getActiveProject_();
  if (!project) throw new Error('NO_ACTIVE_PROJECT');
  var results = [];

  function check(name, fn) {
    try { results.push({ name: name, success: true, detail: fn() }); }
    catch (e) { results.push({ name: name, success: false, detail: safeString_(e && e.message || e) }); }
  }

  check('Calendar projection module version', function() {
    if (!GES_CALENDAR_URL_VARIANTS_V45) throw new Error('CALENDAR_PROJECTION_CONSTANT_MISSING');
    return GES_CALENDAR_URL_VARIANTS_V45.VERSION;
  });

  check('Calendar Sync finalizer installed', function() {
    if (typeof finalizeCalendarV2PublicProjectionV45_ !== 'function') throw new Error('CALENDAR_PUBLIC_FINALIZER_MISSING');
    if (typeof validateCalendarV2PublicProjectionV45 !== 'function') throw new Error('CALENDAR_PUBLIC_VALIDATOR_MISSING');
    if (typeof rebuildCalendarV2PublicProjectionV45 !== 'function') throw new Error('CALENDAR_PUBLIC_REPAIR_MISSING');
    return true;
  });

  check('Private Registry has Calendar + URL tabs', function() {
    if (!project.registrySheetId) throw new Error('REGISTRY_SHEET_MISSING');
    var ss = SpreadsheetApp.openById(project.registrySheetId);
    if (!ss.getSheetByName('Calendar Events')) throw new Error('CALENDAR_EVENTS_TAB_MISSING');
    if (!ss.getSheetByName(V3_CONFIG.REGISTRY_TABS.URLS)) throw new Error('URL_VARIANTS_TAB_MISSING');
    return { registrySheetId: project.registrySheetId };
  });

  check('Projection preview is read-only', function() {
    var before = PropertiesService.getScriptProperties().getProperties();
    var p = previewCalendarUrlProjectionV45(project.projectId);
    var after = PropertiesService.getScriptProperties().getProperties();
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('SCRIPT_PROPERTIES_CHANGED_DURING_PROJECTION_PREVIEW');
    return {
      expectedCount: p.expectedCount,
      actualOwnedCount: p.actualOwnedCount,
      missingCount: p.missingCount,
      staleCount: p.staleCount,
      skippedCurrentWithoutHtmlLink: p.skippedCurrentWithoutHtmlLink
    };
  });

  check('Unified Public renderer accepts Calendar URLs', function() {
    if (typeof buildUnifiedPublicAssetsProjectionV44_ !== 'function') throw new Error('UNIFIED_PUBLIC_RENDERER_MISSING');
    if (typeof isPublicUrlVariantAllowedV44_ !== 'function') throw new Error('PUBLIC_URL_FILTER_MISSING');
    var ids = typeof getPublicProjectionSingletonIdsV44_ === 'function' ? getPublicProjectionSingletonIdsV44_(project) : {};
    var cal = isPublicUrlVariantAllowedV44_(project, {
      assetType: 'CALENDAR', assetId: 'test-calendar', urlStatus: 'AVAILABLE', url: 'https://calendar.google.com/calendar/u/0/r'
    }, ids);
    var evt = isPublicUrlVariantAllowedV44_(project, {
      assetType: 'CALENDAR_EVENT', assetId: 'test-event', urlStatus: 'AVAILABLE', url: 'https://www.google.com/calendar/event?eid=test'
    }, ids);
    if (!cal || !evt) throw new Error('CALENDAR_TYPES_BLOCKED_BY_PUBLIC_RENDERER');
    return { calendar: cal, calendarEvent: evt };
  });

  check('Calendar Sync requires htmlLink before fast skip', function() {
    var src = syncProjectCalendarCoreV4_.toString();
    if (src.indexOf('existing.eventHtmlLink') === -1) throw new Error('CALENDAR_FAST_SKIP_HTML_LINK_GUARD_MISSING');
    return true;
  });

  var success = results.every(function(r) { return r.success; });
  var report = {
    success: success,
    version: GES_CALENDAR_URL_VARIANTS_V45.VERSION,
    calendarSyncVersion: GES_CALENDAR_SYNC_V4.VERSION,
    projectId: project.projectId,
    projectName: project.projectName,
    results: results
  };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

/**
 * Read-only post-sync acceptance. Run only after Calendar V2 migration + Sync Calendar.
 * This does not modify Calendar, Registry, or Public Sheet.
 */
function runCalendarV2PublicProjectionAcceptanceV45() {
  var project = getActiveProject_();
  if (!project) throw new Error('NO_ACTIVE_PROJECT');
  var migration = typeof getCalendarV2MigrationStateV4 === 'function'
    ? getCalendarV2MigrationStateV4(project.projectId)
    : { required: false, status: 'UNKNOWN' };
  var audit = auditCalendarRegistryV4(project.projectId);
  var validation = validateCalendarV2PublicProjectionV45(project.projectId);
  var currentRows = getCalendarRegistryRowsV4(project.projectId).filter(function(row) {
    return safeString_(row.status).toUpperCase() === 'CURRENT';
  });

  var success = !migration.required && audit.success && validation.valid;
  var report = {
    success: success,
    projectId: project.projectId,
    projectName: project.projectName,
    migration: migration,
    currentCalendarEvents: currentRows.length,
    registryAudit: audit,
    publicProjection: validation
  };
  console.log(JSON.stringify(report, null, 2));
  return report;
}
