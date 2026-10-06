/** Dashboard data for GES V4 G1 (V3.1 lifecycle compatible). */

function getDashboardData() {
  let project = getActiveProject_();
  if (!project) {
    return {
      setupRequired: true,
      appName: GES_CONFIG.APP_NAME,
      appVersion: GES_CONFIG.APP_VERSION,
      projects: [],
      rows: [],
      summary: {}
    };
  }

  // Patch A is non-migrating: Dashboard resolves structure read-only.
  ensureProjectFolders_(project, false);
  ensureRegistrySpreadsheet_(project);
  project = saveProject_(project);

  const docs = getSourceDocs_(project);
  const rows = docs.map(function(docFile) {
    const assets = {};
    GES_CONFIG.MANAGED_ASSET_TYPES.forEach(function(type) {
      assets[type] = getAssetState_(project, docFile, type);
    });
    return {
      id: docFile.getId(),
      name: docFile.getName(),
      url: docFile.getUrl(),
      updated: docFile.getLastUpdated().toISOString(),
      assets: assets
    };
  });

  const projectAssets = {};
  (GES_CONFIG.PROJECT_SINGLETON_ASSET_TYPES || []).forEach(function(type) {
    projectAssets[type] = getProjectSingletonAssetStateV41_(project, type);
  });

  const registrySummary = getRegistrySummary_(project);
  const summary = buildDashboardSummaryV4_(rows, registrySummary, projectAssets);
  let registryUrl = '';
  try { registryUrl = DriveApp.getFileById(project.registrySheetId).getUrl(); } catch (e) {}

  const lifecycle = getProjectLifecycleState_(project);
  const calendarDashboard = getCalendarDashboardSummaryV4_(project);
  const capabilities = getGesDashboardCapabilitiesV4_();
  const buildQueue = typeof getBuildQueueStateV4 === 'function' ? getBuildQueueStateV4(project.projectId) : { exists: false, status: 'NOT_INSTALLED' };
  const privateStorage = typeof getPrivateStorageDashboardSummaryV45_ === 'function'
    ? getPrivateStorageDashboardSummaryV45_(project)
    : { installed: false, status: 'NOT_INSTALLED', verified: false };

  const folderNameReconcile = typeof getCanonicalFolderNameReconcileDashboardSummaryV451_ === 'function'
    ? getCanonicalFolderNameReconcileDashboardSummaryV451_(project)
    : { installed: false, status: 'NOT_INSTALLED', totalCanonicalFolders: 8, currentCount: 0, renameCount: 0, blockerCount: 0 };

  return {
    setupRequired: false,
    appName: GES_CONFIG.APP_NAME,
    appVersion: GES_CONFIG.APP_VERSION,
    profileSchemaVersion: GES_CONFIG.PROFILE_SCHEMA_VERSION,
    contentModelSchemaVersion: GES_CONFIG.CONTENT_MODEL_SCHEMA_VERSION,
    entityProfileSchemaVersion: GES_CONFIG.ENTITY_PROFILE_SCHEMA_VERSION,
    projects: listProjects().map(sanitizeProjectForClient_),
    activeProjectId: project.projectId,
    project: sanitizeProjectForClient_(project),
    lifecycle: lifecycle,
    availableActions: lifecycle.actions,
    folderSummary: getProjectFolderSummary_(project),
    projectStructure: typeof previewProjectStructureV41 === 'function' ? previewProjectStructureV41(project.projectId) : null,
    projectAssets: projectAssets,
    registryUrl: registryUrl,
    registrySummary: registrySummary,
    scanState: getScanState_(project.projectId),
    rows: rows,
    summary: summary,
    calendar: calendarDashboard,
    capabilities: capabilities,
    buildQueue: buildQueue,
    privateStorage: privateStorage,
    folderNameReconcile: folderNameReconcile,
    migration: project.provisioningMode === 'MIGRATE_V2' ? cloneJson_(project.migration) : null
  };
}

function buildDashboardSummaryV4_(rows, registrySummary, projectAssets) {
  const s = {
    docs: rows.length,
    missing: 0,
    outdated: 0,
    current: 0,
    review: 0,
    assets: registrySummary.assets || 0,
    urls: registrySummary.urls || 0,
    notPublished: registrySummary.notPublished || 0
  };

  rows.forEach(function(row) {
    GES_CONFIG.MANAGED_ASSET_TYPES.forEach(function(type) {
      const st = row.assets[type].status;
      if (st === 'MISSING') s.missing++;
      else if (st === 'OUTDATED' || st === 'RENDERER_OUTDATED') s.outdated++;
      else if (st === 'CURRENT') s.current++;
      else s.review++;
    });
  });

  // Count only Patch-A auto-managed project singletons in top summary.
  (GES_CONFIG.PROJECT_MANAGED_ASSET_TYPES || []).forEach(function(type) {
    const st = projectAssets && projectAssets[type] ? projectAssets[type].status : 'MISSING';
    if (st === 'MISSING') s.missing++;
    else if (st === 'OUTDATED') s.outdated++;
    else if (st === 'CURRENT') s.current++;
    else s.review++;
  });
  return s;
}

// Compatibility alias for any older callers.
function buildDashboardSummaryV3_(rows, registrySummary) {
  return buildDashboardSummaryV4_(rows, registrySummary);
}

function getProjectListForDashboard() {
  return listProjects().map(sanitizeProjectForClient_);
}

function validateActiveProjectForWrite() {
  const project = getActiveProject_();
  if (!project) throw new Error('Chưa có active project.');
  return validateProjectWriteReadyV31_(project);
}

/** G1 read-only preview of Entity Profile + Canonical Content summaries. */
function getActiveG1ModelSummary(docId) {
  return {
    entityProfile: getEntityProfileSummaryV4(getActiveProjectId_()),
    contentModel: getCanonicalContentModelSummaryV4(docId || '', getActiveProjectId_())
  };
}

/** Lightweight Calendar state for the Dashboard. No remote event mutation. */
function getCalendarDashboardSummaryV4_(project) {
  const base = {
    installed: typeof inspectCalendarSyncStateV4 === 'function',
    status: 'NOT_INSTALLED',
    calendarId: '',
    calendarUrl: '',
    schemaVersion: typeof GES_CALENDAR_PLAN_SCHEMA_V4 !== 'undefined' ? GES_CALENDAR_PLAN_SCHEMA_V4.VERSION : '',
    templateId: typeof GES_CALENDAR_PLAN_SCHEMA_V4 !== 'undefined' ? GES_CALENDAR_PLAN_SCHEMA_V4.TEMPLATE_ID : '',
    plan: { total: 0, ready: 0, deferred: 0, missingSource: 0, needsReview: 0 },
    registry: { total: 0, current: 0, outdated: 0, deferred: 0, orphaned: 0, error: 0, conflict: 0 },
    migration: { required: false, status: 'NOT_INSTALLED' },
    error: ''
  };
  if (!base.installed) return base;

  try {
    if (typeof getCalendarV2MigrationStateV4 === 'function') {
      base.migration = getCalendarV2MigrationStateV4(project.projectId);
    }
    const state = inspectCalendarSyncStateV4(project.projectId);
    const ids = state.calendarIdCandidates || [];
    base.calendarId = ids.length === 1 ? ids[0] : '';
    base.calendarUrl = state.calendarUrl || '';
    base.plan = Object.assign(base.plan, state.plan || {});
    base.registry = Object.assign(base.registry, state.registry || {});

    if (ids.length > 1) base.status = 'CONFLICT';
    else if (base.migration && base.migration.required) base.status = 'MIGRATION_REQUIRED';
    else if (!base.calendarId) base.status = 'NOT_BUILT';
    else if ((base.registry.error || 0) > 0 || (base.registry.conflict || 0) > 0) base.status = 'ERROR';
    else if ((base.registry.orphaned || 0) > 0) base.status = 'REVIEW';
    else if ((base.registry.outdated || 0) > 0) base.status = 'OUTDATED';
    else if ((base.registry.current || 0) >= (base.plan.ready || 0) &&
             (base.registry.deferred || 0) >= (base.plan.deferred || 0)) base.status = 'CURRENT';
    else base.status = 'PARTIAL';
    return base;
  } catch (e) {
    base.status = 'ERROR';
    base.error = safeString_(e && e.message || e);
    return base;
  }
}

/** Feature detection keeps the UI compatible while V4 modules are installed incrementally. */
function getGesDashboardCapabilitiesV4_() {
  return {
    contentModel: typeof getActiveG1ModelSummary === 'function',
    calendarPlan: typeof previewCalendarPlanV4 === 'function',
    calendarRegistry: typeof auditCalendarRegistryV4 === 'function',
    calendarBuild: typeof buildActiveProjectCalendarV4 === 'function',
    calendarSync: typeof syncActiveProjectCalendarV4 === 'function',
    calendarVisibility: typeof validateActiveProjectCalendarVisibilityV4 === 'function',
    calendarV2MigrationPreview: typeof previewActiveCalendarV2MigrationV4 === 'function',
    calendarV2MigrationApply: typeof applyActiveCalendarV2MigrationV4 === 'function',
    calendarV21CleanupPreview: typeof previewActiveCalendarV21LegacyCleanup === 'function',
    calendarV21CleanupApply: typeof applyActiveCalendarV21LegacyCleanup === 'function',
    completeBuild: typeof buildCompleteActiveGesV4 === 'function',
    buildQueue: typeof startBuildQueueV4 === 'function',
    sheetAsset: typeof buildActiveProjectSheetV4 === 'function',
    formAsset: typeof buildActiveProjectFormV4 === 'function',
    projectStructureV41: typeof previewActiveProjectStructureV41 === 'function',
    projectStructureProvision: typeof provisionActiveProjectStructureV41 === 'function',
    publicSheetV43: typeof validateActiveProjectPublicSheetV43 === 'function',
    publicContentV43: typeof previewActiveProjectContentProjectionV43 === 'function',
    projectResetPreviewV44: typeof previewActiveProjectResetV44 === 'function',
    privateStorageV45Preview: typeof previewActivePrivateSystemStorageV45 === 'function',
    privateStorageV45Apply: typeof applyActivePrivateSystemStorageV45 === 'function',
    privateStorageV45Verify: typeof verifyActivePrivateSystemStorageV45 === 'function',
    privateStorageV45Tests: typeof runPrivateSystemStorageV45SmokeTests === 'function',
    folderNameV451Preview: typeof previewActiveCanonicalFolderNameReconcileV451 === 'function',
    folderNameV451Apply: typeof applyActiveCanonicalFolderNameReconcileV451 === 'function',
    folderNameV451Verify: typeof verifyActiveCanonicalFolderNameReconcileV451 === 'function',
    folderNameV451Tests: typeof runCanonicalFolderNameReconcileV451SmokeTests === 'function',
    calendarV2Ready: typeof GES_CALENDAR_PLAN_SCHEMA_V4 !== 'undefined' && GES_CALENDAR_PLAN_SCHEMA_V4.VERSION === '2.1.1',
    imagesAsset: typeof buildActiveProjectImagesV4 === 'function',
    drawingAsset: typeof buildActiveProjectDrawingV4 === 'function'
  };
}

