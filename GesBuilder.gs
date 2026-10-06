/**
 * GES V4.2 - BUILD COMPLETE GES (queue-backed, Calendar V2 enabled).
 *
 * Scope:
 * - Source-doc outputs: Slides / PDF / DOCX / HTML
 * - Project singleton outputs: Project URL Sheet / Project Form
 * - Calendar V2: 15 project-level logical roles, explicit migration required
 * - Google Docs Resource Footer V4.6.6 after URL graph + Calendar are ready
 *   for existing V1 Calendar registries before Calendar write.
 */

const GES_COMPLETE_BUILDER_V4 = Object.freeze({
  VERSION: '1.6.0-resumable-selective-sync-v468',
  SOURCE_ASSET_SCOPE: ['SLIDES','PDF','DOCX','HTML'],
  PROJECT_ASSET_SCOPE: ['PROJECT_URL_SHEET','PROJECT_FORM']
});

function previewBuildCompleteGesV4(projectId) {
  var project = resolveGesBuildProjectV4_(projectId || '');
  var docs = getSourceDocs_(project);
  var docPlans = docs.map(function(docFile) {
    var assets = {};
    GES_CONFIG.MANAGED_ASSET_TYPES.forEach(function(type) {
      assets[type] = getAssetState_(project, docFile, type);
    });
    return { docId: docFile.getId(), docName: docFile.getName(), updated: docFile.getLastUpdated().toISOString(), assets: assets };
  });

  var projectAssets = {};
  (GES_CONFIG.PROJECT_SINGLETON_ASSET_TYPES || []).forEach(function(type) {
    projectAssets[type] = getProjectSingletonAssetStateV41_(project, type);
  });

  var lifecycle = getProjectLifecycleState_(project);
  var queuePlan = typeof previewBuildQueueV4 === 'function' ? previewBuildQueueV4(project.projectId) : null;
  var structure = typeof previewProjectStructureV41 === 'function' ? previewProjectStructureV41(project.projectId) : null;
  var calendarPlan = typeof getCalendarPlanSummaryV4 === 'function' ? getCalendarPlanSummaryV4(project.projectId) : null;
  var calendarMigration = typeof getCalendarV2MigrationStateV4 === 'function'
    ? getCalendarV2MigrationStateV4(project.projectId)
    : { required: false, status: 'NOT_INSTALLED' };

  var result = {
    success: true,
    version: GES_COMPLETE_BUILDER_V4.VERSION,
    projectId: project.projectId,
    projectName: project.projectName,
    projectKeyword: getProjectKeywordV41_(project),
    projectType: project.projectType,
    provisioningMode: project.provisioningMode,
    writeEnabled: !!(project.writeState && project.writeState.writeEnabled),
    shadowMode: !!(project.writeState && project.writeState.shadowMode),
    lifecycle: lifecycle,
    structure: structure,
    docs: docPlans,
    projectAssets: projectAssets,
    sourceManagedAssetTypes: GES_CONFIG.MANAGED_ASSET_TYPES.slice(),
    projectManagedAssetTypes: (GES_CONFIG.PROJECT_MANAGED_ASSET_TYPES || []).slice(),
    buildQueue: queuePlan,
    calendar: {
      integrationPaused: false,
      schemaVersion: calendarPlan ? calendarPlan.schemaVersion : '',
      templateId: calendarPlan ? calendarPlan.templateId : '',
      plan: calendarPlan,
      migration: calendarMigration,
      note: calendarMigration.required ? 'Build Queue sẽ SKIP Calendar cho tới khi Apply Calendar V2 Migration.' : 'Calendar V2 ready.'
    },
    capabilities: {
      docs: true, slides: true, pdf: true, docx: true, html: true,
      projectForm: typeof buildActiveProjectFormV4 === 'function',
      projectSheet: typeof buildActiveProjectSheetV4 === 'function',
      calendar: typeof syncActiveProjectCalendarV4 === 'function',
      calendarV2Migration: typeof previewActiveCalendarV2MigrationV4 === 'function',
      documentResourceFooter: typeof syncActiveProjectDocumentResourceFootersV466 === 'function',
      outputResourceFooter: typeof syncActiveProjectOutputResourceFootersV467 === 'function',
      hyperlinkPropagation: typeof syncActiveProjectOutputResourceFootersV467 === 'function',
      buildQueue: typeof startBuildQueueV4 === 'function'
    }
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}

function buildCompleteGesV4(projectId) {
  var project = resolveGesBuildProjectV4_(projectId || '');
  assertProjectWritable_(project);
  if (typeof startBuildQueueV4 !== 'function') throw new Error('BUILD_QUEUE_MANAGER_NOT_INSTALLED');

  var result = startBuildQueueV4(project.projectId, { runNow: true, source: 'BUILD_COMPLETE_GES_V468', mode: 'BUILD_COMPLETE' });
  try {
    logEvent_(project.projectId, 'BUILD_COMPLETE_GES_QUEUE', {
      result: result.status || '', runId: result.runId || '', totalJobs: result.totalJobs || 0,
      builderVersion: GES_COMPLETE_BUILDER_V4.VERSION, calendarPaused: false,
      calendarMigrationStatus: typeof getCalendarV2MigrationStateV4 === 'function'
        ? getCalendarV2MigrationStateV4(project.projectId).status : 'NOT_INSTALLED'
    });
  } catch (ignore) {}
  return result;
}

function buildCompleteActiveGesV4() {
  return buildCompleteGesV4('');
}

function resolveGesBuildProjectV4_(projectId) {
  var project = projectId ? getProject_(projectId) : getActiveProject_();
  if (!project) throw new Error('GES_BUILD_NO_ACTIVE_PROJECT');
  return project;
}
