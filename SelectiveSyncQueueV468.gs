/**
 * GES V4.6.8 — Resumable Selective Sync Queue & Large Project Optimization
 *
 * Public queue facade used by Dashboard batch actions. All heavy project-wide
 * operations are routed through the same resumable Build Queue infrastructure.
 */

const GES_SELECTIVE_SYNC_QUEUE_V468 = Object.freeze({
  VERSION: '4.6.8',
  MODES: Object.freeze({
    BUILD_COMPLETE: 'BUILD_COMPLETE',
    CREATE_MISSING: 'CREATE_MISSING',
    SYNC_CHANGED: 'SYNC_CHANGED',
    DOC_RESOURCE: 'DOC_RESOURCE',
    OUTPUT_RESOURCE: 'OUTPUT_RESOURCE',
    SELECTED_SYNC: 'SELECTED_SYNC'
  })
});

function getSelectiveSyncQueueSchemaV468() {
  return {
    version: GES_SELECTIVE_SYNC_QUEUE_V468.VERSION,
    modes: Object.keys(GES_SELECTIVE_SYNC_QUEUE_V468.MODES).map(function(k) {
      return GES_SELECTIVE_SYNC_QUEUE_V468.MODES[k];
    }),
    resumable: true,
    autoContinuation: true,
    oneDocResourceJobPerSourceDoc: true,
    oneOutputResourceJobPerAsset: true,
    heavyAssets: ['PDF', 'DOCX'],
    sourceOfTruth: 'GES_BUILD_QUEUE_V4'
  };
}

function startSelectiveSyncQueueV468(mode, docIds, options) {
  options = options || {};
  var project = getActiveProject_();
  if (!project) throw new Error('Chưa có active project.');
  assertProjectWritable_(project);

  var normalizedMode = normalizeBuildQueueModeV468_(mode || '');
  var selected = Array.isArray(docIds) ? docIds.filter(Boolean) : [];

  return startBuildQueueV4(project.projectId, {
    runNow: options.runNow !== false,
    restart: options.restart === true,
    source: safeString_(options.source || ('V468_' + normalizedMode)),
    mode: normalizedMode,
    selectedDocIds: selected
  });
}

function previewSelectiveSyncQueueV468(mode, docIds) {
  var project = getActiveProject_();
  if (!project) throw new Error('Chưa có active project.');
  return previewBuildQueueV4(project.projectId, {
    mode: normalizeBuildQueueModeV468_(mode || ''),
    selectedDocIds: Array.isArray(docIds) ? docIds.filter(Boolean) : []
  });
}

function queueCreateAllMissingV468() {
  return startSelectiveSyncQueueV468('CREATE_MISSING', [], {
    source: 'DASHBOARD_CREATE_ALL_MISSING'
  });
}

function queueSyncAllChangedV468() {
  return startSelectiveSyncQueueV468('SYNC_CHANGED', [], {
    source: 'DASHBOARD_SYNC_ALL_CHANGED'
  });
}

function queueDocsResourceSyncV468() {
  return startSelectiveSyncQueueV468('DOC_RESOURCE', [], {
    source: 'DASHBOARD_DOC_RESOURCE_SYNC'
  });
}

function queueOutputResourceSyncV468() {
  return startSelectiveSyncQueueV468('OUTPUT_RESOURCE', [], {
    source: 'DASHBOARD_OUTPUT_RESOURCE_SYNC'
  });
}

function queueSelectedDocumentsV468(docIds) {
  var ids = Array.isArray(docIds) ? docIds.filter(Boolean) : [];
  if (!ids.length) throw new Error('SELECTED_SYNC_REQUIRES_AT_LEAST_ONE_DOC');
  return startSelectiveSyncQueueV468('SELECTED_SYNC', ids, {
    source: 'DASHBOARD_SYNC_SELECTED'
  });
}

function queueOneDocumentV468(docId) {
  if (!safeString_(docId)) throw new Error('SELECTED_SYNC_REQUIRES_DOC_ID');
  return queueSelectedDocumentsV468([docId]);
}
