/**
 * GES V4 Project Reset Manager - PREVIEW ONLY.
 *
 * SAFETY CONTRACT
 * - No file/folder is moved, renamed, trashed or deleted.
 * - No Calendar/Event is created, patched or deleted.
 * - No Registry/Script Property/Project Profile is written.
 * - No trigger is created or deleted.
 * - No execute/apply/reset mutation entrypoint exists in Patch D.
 */

function previewActiveProjectResetV44(mode) {
  return previewProjectResetV44('', mode || GES_PROJECT_RESET_V44.DEFAULT_MODE);
}

function previewProjectResetV44(projectId, mode) {
  var project = projectId ? getProject_(projectId) : getActiveProject_();
  if (!project) throw new Error('PROJECT_RESET_PROJECT_NOT_FOUND');

  mode = normalizeProjectResetModeV44_(mode);
  var policy = getProjectResetModeConfigV44_(mode);
  var startedAt = nowIso_();

  var sourceDocs = resetPreviewSourceDocsV44_(project);
  var managedDrive = resetPreviewManagedDriveAssetsV44_(project, sourceDocs);
  var rootSnapshot = resetPreviewRootSnapshotV44_(project, managedDrive.allKnownIds);
  var registry = resetPreviewRegistryV44_(project);
  var calendar = resetPreviewCalendarV44_(project);
  var runtime = resetPreviewRuntimeV44_(project);
  var protectedItems = resetPreviewProtectedItemsV44_(project, sourceDocs, rootSnapshot);
  var safety = resetPreviewSafetyV44_(project, mode, policy, runtime, rootSnapshot);

  var plan = resetBuildPlanV44_(project, mode, policy, {
    sourceDocs: sourceDocs,
    managedDrive: managedDrive,
    rootSnapshot: rootSnapshot,
    registry: registry,
    calendar: calendar,
    runtime: runtime,
    protectedItems: protectedItems,
    safety: safety
  });

  var fingerprintPayload = {
    version: GES_PROJECT_RESET_V44.VERSION,
    projectId: project.projectId,
    rootFolderId: project.rootFolderId,
    mode: mode,
    driveCandidateIds: plan.drive.trashCandidates.map(function(x) { return x.id; }).sort(),
    reviewCandidateIds: plan.drive.reviewRequired.map(function(x) { return x.id || x.key; }).sort(),
    calendarEventIds: plan.calendar.managedEventIds.slice().sort(),
    calendarIds: plan.calendar.calendarIds.slice().sort(),
    registryCounts: plan.registry.counts,
    runtimePropertyKeys: plan.runtime.propertyKeys.slice().sort(),
    blockers: plan.safety.blockers.slice().sort(),
    warnings: plan.safety.warnings.slice().sort()
  };
  plan.planFingerprint = sha256Hex_(JSON.stringify(fingerprintPayload));
  plan.previewedAt = startedAt;

  console.log(JSON.stringify(plan, null, 2));
  return plan;
}

function resetPreviewSourceDocsV44_(project) {
  var docs = [];
  try {
    docs = getSourceDocs_(project).map(function(file) {
      return {
        id: file.getId(),
        name: file.getName(),
        url: file.getUrl(),
        mimeType: file.getMimeType(),
        modifiedAt: file.getLastUpdated().toISOString(),
        disposition: 'KEEP',
        reason: 'SOURCE_DOC_PROTECTED'
      };
    });
  } catch (e) {
    return { count: 0, items: [], error: safeString_(e && e.message || e) };
  }
  return { count: docs.length, items: docs, error: '' };
}

function resetPreviewManagedDriveAssetsV44_(project, sourceDocs) {
  var confirmed = [];
  var review = [];
  var allKnownIds = {};

  (sourceDocs.items || []).forEach(function(docInfo) {
    var docFile;
    try { docFile = DriveApp.getFileById(docInfo.id); } catch (e) { return; }

    (GES_CONFIG.MANAGED_ASSET_TYPES || []).forEach(function(assetType) {
      var state;
      try { state = getAssetState_(project, docFile, assetType); }
      catch (e) {
        review.push({ scope: 'SOURCE_DOC', sourceDocId: docInfo.id, sourceDocName: docInfo.name, assetType: assetType, id: '', name: '', key: docInfo.id + ':' + assetType, reason: 'STATE_RESOLUTION_ERROR: ' + safeString_(e && e.message || e) });
        return;
      }
      if (!state || !state.id) return;
      allKnownIds[state.id] = true;

      var evidence = resetPreviewManagedEvidenceV44_(project, state.id, docInfo.id, assetType, false);
      var item = resetPreviewAssetItemV44_(state, {
        scope: 'SOURCE_DOC',
        sourceDocId: docInfo.id,
        sourceDocName: docInfo.name,
        assetType: assetType,
        evidence: evidence
      });
      if (evidence.confirmed) confirmed.push(item); else review.push(item);
    });
  });

  (GES_CONFIG.PROJECT_SINGLETON_ASSET_TYPES || []).forEach(function(assetType) {
    var state;
    try { state = getProjectSingletonAssetStateV41_(project, assetType); }
    catch (e) {
      review.push({ scope: 'PROJECT', assetType: assetType, id: '', name: '', key: 'PROJECT:' + assetType, reason: 'STATE_RESOLUTION_ERROR: ' + safeString_(e && e.message || e) });
      return;
    }
    if (!state || !state.id) return;
    allKnownIds[state.id] = true;

    var evidence = resetPreviewManagedEvidenceV44_(project, state.id, '', assetType, true);
    var item = resetPreviewAssetItemV44_(state, {
      scope: 'PROJECT',
      sourceDocId: '',
      sourceDocName: '',
      assetType: assetType,
      evidence: evidence
    });
    if (evidence.confirmed) confirmed.push(item); else review.push(item);
  });

  confirmed.sort(resetPreviewSortAssetV44_);
  review.sort(resetPreviewSortAssetV44_);
  return {
    confirmedCount: confirmed.length,
    reviewCount: review.length,
    confirmed: confirmed,
    reviewRequired: review,
    allKnownIds: allKnownIds
  };
}

function resetPreviewManagedEvidenceV44_(project, fileId, sourceDocId, assetType, projectScope) {
  var registry = null;
  try {
    registry = projectScope
      ? getProjectAssetRegistryV41_(project.projectId, assetType)
      : getAssetRegistry_(project.projectId, sourceDocId, assetType);
  } catch (ignore) {}

  var meta = {};
  var file = null;
  try {
    file = DriveApp.getFileById(fileId);
    meta = readV3Meta_(file.getDescription() || '');
  } catch (ignore2) {}

  var registryMatch = !!(registry && safeString_(registry.fileId) === safeString_(fileId));
  var markerProjectMatch = safeString_(meta.PROJECT_ID) === safeString_(project.projectId);
  var markerTypeMatch = safeString_(meta.ASSET_TYPE) === safeString_(assetType) ||
    (assetType === 'PROJECT_URL_SHEET' && safeString_(meta.ASSET_TYPE) === 'SHEET') ||
    (assetType === 'PROJECT_FORM' && safeString_(meta.ASSET_TYPE) === 'FORM');
  var markerSourceMatch = projectScope || !sourceDocId || safeString_(meta.SOURCE_DOC_ID) === safeString_(sourceDocId);
  var markerMatch = markerProjectMatch && markerTypeMatch && markerSourceMatch;

  return {
    confirmed: registryMatch || markerMatch,
    registryMatch: registryMatch,
    markerMatch: markerMatch,
    registryResolutionMethod: safeString_(registry && registry.resolutionMethod),
    managerMarker: safeString_(meta.MANAGER),
    projectMarker: safeString_(meta.PROJECT_ID),
    assetTypeMarker: safeString_(meta.ASSET_TYPE)
  };
}

function resetPreviewAssetItemV44_(state, extra) {
  var item = {
    scope: extra.scope,
    sourceDocId: extra.sourceDocId || '',
    sourceDocName: extra.sourceDocName || '',
    assetType: extra.assetType || '',
    id: safeString_(state.id),
    name: safeString_(state.name),
    url: safeString_(state.url),
    status: safeString_(state.status),
    resolutionMethod: safeString_(state.resolutionMethod),
    evidence: extra.evidence,
    disposition: extra.evidence && extra.evidence.confirmed ? 'ELIGIBLE_MANAGED_OUTPUT' : 'KEEP_REVIEW_REQUIRED'
  };
  try {
    var file = DriveApp.getFileById(item.id);
    item.mimeType = file.getMimeType();
    item.parentId = resetPreviewDirectParentIdV44_(file);
    item.parentName = resetPreviewDirectParentNameV44_(file);
  } catch (e) {
    item.readError = safeString_(e && e.message || e);
  }
  return item;
}

function resetPreviewSortAssetV44_(a, b) {
  return [a.scope, a.sourceDocName, a.assetType, a.name, a.id].join('|').localeCompare(
    [b.scope, b.sourceDocName, b.assetType, b.name, b.id].join('|'), 'vi'
  );
}

function resetPreviewRootSnapshotV44_(project, knownIds) {
  var root = getProjectRoot_(project);
  var directFiles = [];
  var directFolders = [];
  var fileIt = root.getFiles();
  while (fileIt.hasNext() && directFiles.length < GES_PROJECT_RESET_V44.MAX_PREVIEW_ITEMS) {
    var f = fileIt.next();
    directFiles.push({
      id: f.getId(),
      name: f.getName(),
      mimeType: f.getMimeType(),
      url: f.getUrl(),
      knownManaged: !!knownIds[f.getId()],
      isRegistry: safeString_(project.registrySheetId) === safeString_(f.getId()),
      disposition: knownIds[f.getId()] ? 'MANAGED_CANDIDATE' : (safeString_(project.registrySheetId) === safeString_(f.getId()) ? 'KEEP_PRIVATE_REGISTRY' : 'KEEP_UNMANAGED_OR_LEGACY')
    });
  }
  var folderIt = root.getFolders();
  while (folderIt.hasNext() && directFolders.length < GES_PROJECT_RESET_V44.MAX_PREVIEW_ITEMS) {
    var d = folderIt.next();
    directFolders.push({ id: d.getId(), name: d.getName(), url: d.getUrl(), disposition: 'KEEP_FOLDER' });
  }

  var tree = resetPreviewTreeCountV44_(root, GES_PROJECT_RESET_V44.MAX_TREE_NODES);
  return {
    rootFolderId: root.getId(),
    rootFolderName: root.getName(),
    rootFolderUrl: root.getUrl(),
    directFileCount: directFiles.length,
    directFolderCount: directFolders.length,
    directFiles: directFiles,
    directFolders: directFolders,
    recursiveInventory: tree
  };
}

function resetPreviewTreeCountV44_(root, maxNodes) {
  var queue = [root];
  var folders = 0;
  var files = 0;
  var nodes = 0;
  var truncated = false;
  while (queue.length) {
    var folder = queue.shift();
    folders++;
    nodes++;
    if (nodes >= maxNodes) { truncated = true; break; }

    var fit = folder.getFiles();
    while (fit.hasNext()) {
      fit.next(); files++; nodes++;
      if (nodes >= maxNodes) { truncated = true; break; }
    }
    if (truncated) break;

    var dit = folder.getFolders();
    while (dit.hasNext()) {
      queue.push(dit.next());
      if (queue.length + nodes >= maxNodes) { truncated = true; break; }
    }
    if (truncated) break;
  }
  return { folders: folders, files: files, nodesInspected: nodes, truncated: truncated, maxNodes: maxNodes };
}

function resetPreviewRegistryV44_(project) {
  var out = {
    exists: !!project.registrySheetId,
    registrySheetId: safeString_(project.registrySheetId),
    registryUrl: '',
    counts: { assets: 0, urlVariants: 0, calendarEvents: 0, projectConfig: 0, syncLog: 0 },
    keepTabs: ['Project Config', 'Sync Log'],
    clearableManagedTabs: ['Assets', 'URL Variants', 'Calendar Events'],
    error: ''
  };
  if (!project.registrySheetId) return out;
  try {
    var file = DriveApp.getFileById(project.registrySheetId);
    out.registryUrl = file.getUrl();
    var ss = SpreadsheetApp.openById(project.registrySheetId);
    out.counts.assets = resetPreviewSheetDataRowCountV44_(ss, V3_CONFIG.REGISTRY_TABS.ASSETS || 'Assets');
    out.counts.urlVariants = resetPreviewSheetDataRowCountV44_(ss, V3_CONFIG.REGISTRY_TABS.URLS || 'URL Variants');
    out.counts.calendarEvents = resetPreviewSheetDataRowCountV44_(ss, typeof GES_CALENDAR_REGISTRY_V4 !== 'undefined' ? GES_CALENDAR_REGISTRY_V4.TAB_NAME : 'Calendar Events');
    out.counts.projectConfig = resetPreviewSheetDataRowCountV44_(ss, V3_CONFIG.REGISTRY_TABS.CONFIG || 'Project Config');
    out.counts.syncLog = resetPreviewSheetDataRowCountV44_(ss, V3_CONFIG.REGISTRY_TABS.LOG || 'Sync Log');
  } catch (e) {
    out.error = safeString_(e && e.message || e);
  }
  return out;
}

function resetPreviewSheetDataRowCountV44_(ss, name) {
  var sh = ss.getSheetByName(name);
  return sh ? Math.max(0, sh.getLastRow() - 1) : 0;
}

function resetPreviewCalendarV44_(project) {
  var rows = [];
  var error = '';
  try {
    if (typeof getCalendarRegistryRowsV4 === 'function') rows = getCalendarRegistryRowsV4(project.projectId) || [];
  } catch (e) { error = safeString_(e && e.message || e); }

  var eventIds = {};
  var calendarIds = {};
  rows.forEach(function(row) {
    if (row.eventId) eventIds[row.eventId] = true;
    if (row.calendarId) calendarIds[row.calendarId] = true;
  });
  if (project.calendar && project.calendar.calendarId) calendarIds[project.calendar.calendarId] = true;
  try {
    if (typeof GES_CALENDAR_ASSET_V4 !== 'undefined' && GES_CALENDAR_ASSET_V4.CALENDAR_PROPERTY_PREFIX) {
      var backupId = getScriptProps_().getProperty(GES_CALENDAR_ASSET_V4.CALENDAR_PROPERTY_PREFIX + project.projectId);
      if (backupId) calendarIds[backupId] = true;
    }
  } catch (ignore) {}

  return {
    registryRowCount: rows.length,
    remoteEventIdCount: Object.keys(eventIds).length,
    managedEventIds: Object.keys(eventIds).sort(),
    calendarIds: Object.keys(calendarIds).sort(),
    calendarCount: Object.keys(calendarIds).length,
    containerDisposition: 'KEEP_BY_DEFAULT',
    rowsByStatus: resetPreviewCalendarStatusCountsV44_(rows),
    error: error
  };
}

function resetPreviewCalendarStatusCountsV44_(rows) {
  var out = {};
  (rows || []).forEach(function(row) {
    var k = safeString_(row.status || 'UNKNOWN');
    out[k] = (out[k] || 0) + 1;
  });
  return out;
}

function resetPreviewRuntimeV44_(project) {
  var props = getScriptProps_().getProperties();
  var projectId = project.projectId;
  var keys = Object.keys(props).filter(function(key) {
    return key.indexOf(V3_CONFIG.PROPERTY_KEYS.ASSET_PREFIX + projectId + '_') === 0 ||
      key.indexOf(V3_CONFIG.PROPERTY_KEYS.PUBLISHED_PREFIX + projectId + '_') === 0 ||
      key === V3_CONFIG.PROPERTY_KEYS.SCAN_STATE_PREFIX + projectId ||
      key === 'GES_V4_BUILD_QUEUE_' + projectId ||
      (typeof GES_CALENDAR_ASSET_V4 !== 'undefined' && key === GES_CALENDAR_ASSET_V4.CALENDAR_PROPERTY_PREFIX + projectId);
  }).sort();

  var queue = { exists: false, status: 'IDLE' };
  try { if (typeof getBuildQueueStateV4 === 'function') queue = getBuildQueueStateV4(projectId); } catch (e) { queue = { exists: false, status: 'ERROR', error: safeString_(e && e.message || e) }; }
  var scan = null;
  try { scan = typeof getScanState_ === 'function' ? getScanState_(projectId) : null; } catch (ignore) {}

  var triggerInfo = [];
  try {
    ScriptApp.getProjectTriggers().forEach(function(trigger) {
      triggerInfo.push({
        handlerFunction: safeString_(trigger.getHandlerFunction()),
        uniqueId: safeString_(trigger.getUniqueId()),
        eventType: safeString_(trigger.getEventType && trigger.getEventType()),
        scope: 'SCRIPT_SHARED',
        disposition: 'KEEP_SHARED_TRIGGER'
      });
    });
  } catch (e2) {
    triggerInfo.push({ handlerFunction: '', uniqueId: '', scope: 'SCRIPT_SHARED', disposition: 'KEEP_SHARED_TRIGGER', error: safeString_(e2 && e2.message || e2) });
  }

  return {
    propertyCount: keys.length,
    propertyKeys: keys,
    buildQueue: queue,
    scanState: scan,
    triggers: triggerInfo,
    sharedTriggerCount: triggerInfo.length
  };
}

function resetPreviewProtectedItemsV44_(project, sourceDocs, rootSnapshot) {
  var items = [];
  items.push({ type: 'PROJECT_ROOT', id: project.rootFolderId, name: project.rootFolderName, disposition: 'KEEP' });
  (sourceDocs.items || []).forEach(function(doc) { items.push({ type: 'SOURCE_DOC', id: doc.id, name: doc.name, disposition: 'KEEP' }); });
  if (project.registrySheetId) items.push({ type: 'PRIVATE_ASSET_REGISTRY', id: project.registrySheetId, name: 'Asset Registry', disposition: 'KEEP' });

  var branding = project.branding || {};
  var logoId = safeString_(branding.logo && branding.logo.driveFileId || project.logoFileId);
  var ctaId = safeString_(branding.cta && branding.cta.driveFileId);
  if (logoId) items.push({ type: 'BRAND_LOGO', id: logoId, name: 'Logo', disposition: 'KEEP' });
  if (ctaId) items.push({ type: 'BRAND_CTA', id: ctaId, name: 'CTA', disposition: 'KEEP' });

  (rootSnapshot.directFiles || []).forEach(function(file) {
    if (file.disposition === 'KEEP_UNMANAGED_OR_LEGACY') {
      items.push({ type: 'UNMANAGED_OR_LEGACY_ROOT_FILE', id: file.id, name: file.name, disposition: 'KEEP' });
    }
  });
  return items;
}

function resetPreviewSafetyV44_(project, mode, policy, runtime, rootSnapshot) {
  var blockers = [];
  var warnings = [];

  var queueStatus = safeString_(runtime.buildQueue && runtime.buildQueue.status).toUpperCase();
  if (queueStatus === 'RUNNING' || queueStatus === 'QUEUED') blockers.push('BUILD_QUEUE_ACTIVE');
  var scanStatus = safeString_(runtime.scanState && runtime.scanState.status).toUpperCase();
  if (scanStatus === 'RUNNING') blockers.push('DRIVE_SCAN_ACTIVE');

  if (project.writeState && project.writeState.writeEnabled) {
    warnings.push('GES_WRITE_IS_ENABLED_FUTURE_EXECUTION_SHOULD_ENTER_MAINTENANCE_MODE');
  }

  if (mode === 'FULL_PROJECT_PURGE') {
    // V4.5.2 no longer relies on a customer-specific bootstrap Root ID.
    // Homepage roots are protected generically and full purge remains test-only.
    if (safeString_(project.projectType).toUpperCase() === 'HOMEPAGE') blockers.push('FULL_PURGE_BLOCKED_HOMEPAGE_ROOT');
    if (!(project.resetPolicy && project.resetPolicy.isDisposableTestProject === true)) blockers.push('FULL_PURGE_REQUIRES_DISPOSABLE_TEST_PROJECT_FLAG');
    warnings.push('FULL_PURGE_WOULD_INCLUDE_SOURCE_DOCS_AND_PROJECT_ROOT');
    if (rootSnapshot.recursiveInventory && rootSnapshot.recursiveInventory.truncated) warnings.push('ROOT_TREE_PREVIEW_TRUNCATED');
  }

  if (mode !== 'FULL_PROJECT_PURGE') {
    warnings.push('LEGACY_AND_UNMANAGED_ASSETS_ARE_PRESERVED');
    warnings.push('PROJECT_ROOT_AND_SOURCE_DOCS_ARE_PRESERVED');
  }
  warnings.push('PATCH_D_IS_PREVIEW_ONLY_NO_EXECUTION_FUNCTION_EXISTS');

  return {
    executionAvailable: false,
    previewOnly: true,
    blockers: blockers,
    warnings: warnings,
    safeToPreview: true,
    futureExecutionBlocked: blockers.length > 0 || GES_PROJECT_RESET_V44.PREVIEW_ONLY === true
  };
}

function resetBuildPlanV44_(project, mode, policy, ctx) {
  var driveTrash = policy.trashManagedDriveAssets ? ctx.managedDrive.confirmed.slice() : [];
  var driveReview = ctx.managedDrive.reviewRequired.slice();

  var calendarAction = policy.clearCalendarManagedEvents
    ? 'DELETE_ONLY_PROJECT_MANAGED_EVENTS_AFTER_REMOTE_IDENTITY_VERIFICATION'
    : 'KEEP_UNCHANGED';
  var registryAction = policy.clearRegistryManagedRows
    ? 'CLEAR_MANAGED_DATA_ROWS_KEEP_REGISTRY_FILE_CONFIG_AND_LOG'
    : 'KEEP_UNCHANGED';
  var runtimeAction = policy.clearRuntimeState
    ? 'CLEAR_PROJECT_SCOPED_ASSET_PUBLISHED_SCAN_AND_BUILD_QUEUE_STATE_KEEP_SHARED_TRIGGERS'
    : 'KEEP_UNCHANGED';

  var fullPurge = mode === 'FULL_PROJECT_PURGE';
  return {
    success: true,
    version: GES_PROJECT_RESET_V44.VERSION,
    previewOnly: true,
    executeFunctionShipped: false,
    projectId: project.projectId,
    projectName: project.projectName,
    projectType: project.projectType,
    provisioningMode: project.provisioningMode,
    rootFolderId: project.rootFolderId,
    rootFolderName: project.rootFolderName,
    mode: mode,
    modeLabel: policy.label,
    modeDescription: policy.description,
    confirmationPhraseForFuturePatch: 'RESET ' + project.projectName,

    sourceDocs: ctx.sourceDocs,

    drive: {
      action: fullPurge ? 'TRASH_PROJECT_ROOT_RECURSIVELY_FUTURE_ONLY' : (policy.trashManagedDriveAssets ? 'TRASH_CONFIRMED_MANAGED_OUTPUTS_FUTURE_ONLY' : 'KEEP_DRIVE_OUTPUTS'),
      trashCandidateCount: fullPurge ? ctx.rootSnapshot.recursiveInventory.files : driveTrash.length,
      trashCandidates: fullPurge ? [] : driveTrash,
      reviewRequiredCount: driveReview.length,
      reviewRequired: driveReview,
      rootSnapshot: ctx.rootSnapshot,
      note: fullPurge ? 'Full purge intentionally does not enumerate every recursive file in the action list; see recursiveInventory. Execution is blocked in this patch.' : 'Only assets with Registry/manager-marker evidence are eligible. Unmanaged/legacy files are preserved.'
    },

    registry: {
      registrySheetId: ctx.registry.registrySheetId,
      registryUrl: ctx.registry.registryUrl,
      fileDisposition: policy.removeRegistryFile ? 'WOULD_REMOVE_IN_FUTURE_FULL_PURGE' : 'KEEP_PRIVATE_REGISTRY_FILE',
      action: registryAction,
      counts: ctx.registry.counts,
      clearableManagedTabs: ctx.registry.clearableManagedTabs,
      keepTabs: ctx.registry.keepTabs,
      error: ctx.registry.error
    },

    calendar: {
      action: fullPurge && policy.removeCalendarContainer ? 'WOULD_DELETE_PROJECT_CALENDAR_CONTAINER_FUTURE_ONLY' : calendarAction,
      keepCalendarContainer: !policy.removeCalendarContainer,
      calendarIds: ctx.calendar.calendarIds,
      calendarCount: ctx.calendar.calendarCount,
      managedEventIds: ctx.calendar.managedEventIds,
      managedEventCount: ctx.calendar.remoteEventIdCount,
      registryRowCount: ctx.calendar.registryRowCount,
      rowsByStatus: ctx.calendar.rowsByStatus,
      error: ctx.calendar.error
    },

    runtime: {
      action: runtimeAction,
      propertyCount: ctx.runtime.propertyCount,
      propertyKeys: ctx.runtime.propertyKeys,
      buildQueue: ctx.runtime.buildQueue,
      scanState: ctx.runtime.scanState,
      sharedTriggerCount: ctx.runtime.sharedTriggerCount,
      sharedTriggersDisposition: 'KEEP_ALL_SHARED_TRIGGERS'
    },

    profile: {
      action: policy.removeProjectProfile ? 'WOULD_REMOVE_PROJECT_PROFILE_AND_INDEX_REFERENCE_FUTURE_ONLY' : 'KEEP_PROJECT_PROFILE',
      keepProjectConfig: !policy.removeProjectProfile,
      keepBrandingConfig: !policy.removeProjectProfile,
      keepLifecycleMigrationHistory: mode !== 'FULL_PROJECT_PURGE'
    },

    protectedItems: ctx.protectedItems,
    safety: ctx.safety
  };
}

function resetPreviewDirectParentIdV44_(file) {
  try { var it = file.getParents(); return it.hasNext() ? it.next().getId() : ''; } catch (e) { return ''; }
}

function resetPreviewDirectParentNameV44_(file) {
  try { var it = file.getParents(); return it.hasNext() ? it.next().getName() : ''; } catch (e) { return ''; }
}
