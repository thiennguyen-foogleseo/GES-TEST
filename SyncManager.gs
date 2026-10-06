/** Asset-level and batch sync orchestration for GES V4.1. */

function withProjectWriteLock_(projectId, fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Một job khác đang chạy. Hãy thử lại sau.');
  try { return fn(); } finally { lock.releaseLock(); }
}

function syncSingleAsset(docId, assetType) {
  const project = getActiveProject_();
  if (!project) throw new Error('Chưa có active project.');
  return withProjectWriteLock_(project.projectId, function() {
    const docFile = getSourceDocById_(project, docId);
    return syncAssetForDoc_(project, docFile, assetType);
  });
}

function syncAssetForDoc_(project, docFile, assetType) {
  if (GES_CONFIG.MANAGED_ASSET_TYPES.indexOf(assetType) === -1) throw new Error('Unsupported source-doc asset type: ' + assetType);
  const state = getAssetState_(project, docFile, assetType);

  if (state.status === 'DUPLICATE') {
    return makeAssetResult_(false, project, docFile, assetType, 'SYNC', 'DUPLICATE', 'Có duplicate. Không tự động xử lý.', null);
  }
  if (state.status === 'MISSING') return createAssetByType_(project, docFile, assetType);

  if (state.status === 'WRONG_FOLDER') {
    const resolved = resolveAssetForDoc_(project, docFile, assetType);
    if (!resolved.file) return makeAssetResult_(false, project, docFile, assetType, 'ADOPT', 'NOT_FOUND', 'Không resolve được asset.', null);
    assertProjectWritable_(project);
    adoptManagedAsset_(project, docFile, assetType, resolved.file, {
      resolutionMethod: resolved.method,
      migratedFromV2: resolved.legacy,
      sourceModifiedAtSyncMs: Math.min(docFile.getLastUpdated().getTime(), resolved.file.getLastUpdated().getTime())
    });
    upsertManagedAssetToRegistrySheet_(project, docFile, assetType);
    return makeAssetResult_(true, project, docFile, assetType, 'ADOPT', 'ADOPTED', 'Đã adopt/move asset vào đúng folder và giữ nguyên File ID.', resolved.file);
  }

  if (state.status === 'OUTDATED' || state.status === 'RENDERER_OUTDATED') {
    return updateAssetByType_(project, docFile, assetType);
  }
  if (state.status === 'CURRENT') {
    return makeAssetResult_(true, project, docFile, assetType, 'SKIP', 'CURRENT', 'Đã đồng bộ, không cần thay đổi.', state.id ? DriveApp.getFileById(state.id) : null);
  }
  return makeAssetResult_(false, project, docFile, assetType, 'SYNC', 'NEEDS_REVIEW', 'Trạng thái cần Review: ' + state.status, state.id ? DriveApp.getFileById(state.id) : null);
}

function createAssetByType_(project, docFile, assetType) {
  let r;
  if (assetType === 'SLIDES') r = createSlidesAsset_(project, docFile);
  else if (assetType === 'PDF') r = createPdfAsset_(project, docFile);
  else if (assetType === 'DOCX') r = createDocxAsset_(project, docFile);
  else if (assetType === 'HTML') r = createHtmlAsset_(project, docFile);
  else throw new Error('Unsupported create type: ' + assetType);
  logEvent_(project.projectId, 'ASSET_CREATE', { docName: docFile.getName(), assetType: assetType, assetId: r.outputId || '', result: r.success ? 'SUCCESS' : 'ERROR', message: r.message || '' });
  return r;
}

function updateAssetByType_(project, docFile, assetType) {
  let r;
  if (assetType === 'SLIDES') r = updateSlidesAsset_(project, docFile);
  else if (assetType === 'PDF') r = updatePdfAsset_(project, docFile);
  else if (assetType === 'DOCX') r = updateDocxAsset_(project, docFile);
  else if (assetType === 'HTML') r = updateHtmlAsset_(project, docFile);
  else throw new Error('Unsupported update type: ' + assetType);
  logEvent_(project.projectId, 'ASSET_UPDATE', { docName: docFile.getName(), assetType: assetType, assetId: r.outputId || '', result: r.success ? 'SUCCESS' : 'ERROR', message: r.message || '' });
  return r;
}

/* ========================================================================== *
 * Project-scoped singleton sync
 * ========================================================================== */

function syncProjectSingletonAssetV41_(project, assetType) {
  if (GES_CONFIG.PROJECT_MANAGED_ASSET_TYPES.indexOf(assetType) === -1) {
    throw new Error('Unsupported project singleton asset type: ' + assetType);
  }
  const state = getProjectSingletonAssetStateV41_(project, assetType);

  if (state.status === 'DUPLICATE' || state.status === 'NEEDS_REVIEW' || state.status === 'SOURCE_REQUIRED' || state.status === 'MISSING_SOURCE') {
    return makeProjectAssetResultV41_(false, project, assetType, 'SYNC', state.status, 'Project singleton cần Review trước khi tạo/cập nhật: ' + (state.resolutionMethod || state.status), null, state);
  }
  if (state.status === 'MISSING') {
    if (assetType === 'PROJECT_URL_SHEET') return createProjectUrlSheetAssetV41_(project);
    if (assetType === 'PROJECT_FORM') return createProjectFormAssetV41_(project);
  }
  if (state.status === 'WRONG_FOLDER') {
    const resolved = resolveProjectSingletonAssetV41_(project, assetType);
    if (!resolved.file) return makeProjectAssetResultV41_(false, project, assetType, 'ADOPT', 'NOT_FOUND', 'Không resolve được project singleton.', null);
    assertProjectWritable_(project);
    ensureFileInFolder_(resolved.file, getProjectRoot_(project));
    tagProjectManagedAssetV41_(project, assetType, resolved.file, {});
    saveProjectAssetRegistryV41_(project, assetType, resolved.file, { resolutionMethod: resolved.method || 'PROJECT_MARKER' });
    upsertProjectManagedAssetToRegistrySheetV41_(project, assetType);
    return makeProjectAssetResultV41_(true, project, assetType, 'ADOPT', 'ADOPTED', 'Đã move project singleton vào PROJECT_ROOT và giữ nguyên File ID.', resolved.file);
  }
  if (state.status === 'OUTDATED') {
    if (assetType === 'PROJECT_URL_SHEET') return updateProjectUrlSheetAssetV41_(project);
    if (assetType === 'PROJECT_FORM') return updateProjectFormAssetV41_(project);
  }
  if (state.status === 'CURRENT') {
    return makeProjectAssetResultV41_(true, project, assetType, 'SKIP', 'CURRENT', 'Project singleton đã CURRENT.', state.id ? DriveApp.getFileById(state.id) : null);
  }
  return makeProjectAssetResultV41_(false, project, assetType, 'SYNC', 'NEEDS_REVIEW', 'Trạng thái project singleton cần Review: ' + state.status, state.id ? DriveApp.getFileById(state.id) : null, state);
}

function syncActiveProjectSingletonAssetV41(assetType) {
  const project = getActiveProject_();
  if (!project) throw new Error('Chưa có active project.');
  return withProjectWriteLock_(project.projectId, function() {
    assertProjectWritable_(project);
    return syncProjectSingletonAssetV41_(project, safeString_(assetType).toUpperCase());
  });
}

function syncDocumentAllAssets(docId) {
  if (typeof queueOneDocumentV468 !== 'function') {
    throw new Error('SELECTIVE_SYNC_QUEUE_V468_NOT_INSTALLED');
  }
  return queueOneDocumentV468(docId);
}

function syncSelectedDocuments(docIds) {
  if (typeof queueSelectedDocumentsV468 !== 'function') {
    throw new Error('SELECTIVE_SYNC_QUEUE_V468_NOT_INSTALLED');
  }
  return queueSelectedDocumentsV468(docIds || []);
}

function createAllMissingAssets() {
  if (typeof queueCreateAllMissingV468 !== 'function') {
    throw new Error('SELECTIVE_SYNC_QUEUE_V468_NOT_INSTALLED');
  }
  return queueCreateAllMissingV468();
}

function syncAllChangedAssets() {
  if (typeof queueSyncAllChangedV468 !== 'function') {
    throw new Error('SELECTIVE_SYNC_QUEUE_V468_NOT_INSTALLED');
  }
  return queueSyncAllChangedV468();
}

function previewHtmlForDoc(docId) {
  const project = getActiveProject_();
  const docFile = getSourceDocById_(project, docId);
  return renderSourceDocHtml_(project, docFile);
}
