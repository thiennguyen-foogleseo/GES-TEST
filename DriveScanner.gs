/** Drive metadata scanner and Registry reconciler. Never creates derivative content. */

function scanStateKey_(projectId) {
  return V3_CONFIG.PROPERTY_KEYS.SCAN_STATE_PREFIX + projectId;
}

function getScanState_(projectId) {
  const raw = getScriptProps_().getProperty(scanStateKey_(projectId));
  return raw ? jsonParseSafe_(raw, null) : null;
}

function saveScanState_(state) {
  getScriptProps_().setProperty(scanStateKey_(state.projectId), JSON.stringify(state));
}

function clearScanState_(projectId) {
  getScriptProps_().deleteProperty(scanStateKey_(projectId));
}

function startProjectScan_(project, mode) {
  ensureProjectFolders_(project, false);
  const folderIds = [project.rootFolderId];
  [
    'articlesFolderId','docxFolderId','htmlFolderId','slidesFolderId','pdfFolderId',
    'photosFolderId','videosFolderId','podcastsFolderId',
    // Legacy folders remain scannable until V4.5 explicitly archives them.
    'sheetsFolderId','formsFolderId'
  ].forEach(function(k) {
    const legacyKey = k === 'sheetsFolderId' ? 'SHEETS' : (k === 'formsFolderId' ? 'FORMS' : '');
    if (legacyKey && typeof shouldScanLegacyFolderV45_ === 'function' && !shouldScanLegacyFolderV45_(project, legacyKey)) return;
    const id = project.folders[k];
    if (id && folderIds.indexOf(id) === -1) folderIds.push(id);
  });
  const state = {
    projectId: project.projectId,
    scanRunId: 'scan_' + new Date().getTime() + '_' + project.projectId,
    mode: mode || 'QUICK',
    status: 'RUNNING',
    startedAt: nowIso_(),
    completedAt: '',
    folderIds: folderIds,
    folderIndex: 0,
    pageToken: '',
    processedFiles: 0,
    discoveredFiles: 0,
    updatedFiles: 0,
    errors: 0
  };
  saveScanState_(state);
  return state;
}

function scanProjectDrive(projectId, mode) {
  const project = getProject_(projectId || getActiveProjectId_());
  if (!project) throw new Error('Project không tồn tại.');
  let state = getScanState_(project.projectId);
  if (!state || state.status === 'COMPLETED' || state.mode !== (mode || state.mode)) {
    state = startProjectScan_(project, mode || 'QUICK');
  }
  return continueProjectScan_(project, state);
}

function continueProjectScan_(project, state) {
  const start = new Date().getTime();
  while (state.folderIndex < state.folderIds.length) {
    const folderId = state.folderIds[state.folderIndex];
    const page = driveListChildrenPage_(folderId, state.pageToken);
    (page.files || []).forEach(function(meta) {
      state.processedFiles++;
      try {
        const asset = metadataToInventoryAsset_(project, meta, folderId, state.scanRunId);
        if (asset) {
          upsertInventoryAsset_(project, asset);
          state.updatedFiles++;
        }
      } catch (e) {
        state.errors++;
        logEvent_(project.projectId, 'SCAN_FILE_ERROR', { assetId: meta.id, message: e.message, result: 'ERROR' });
      }
    });

    if (page.nextPageToken) state.pageToken = page.nextPageToken;
    else {
      state.folderIndex++;
      state.pageToken = '';
    }

    if (new Date().getTime() - start > V3_CONFIG.SCANNER.EXECUTION_BUDGET_MS) {
      state.status = 'PAUSED';
      saveScanState_(state);
      return state;
    }
  }

  state.status = 'COMPLETED';
  state.completedAt = nowIso_();
  saveScanState_(state);
  if (state.mode === 'FULL') reconcileMissingAssetsAfterFullScan_(project, state);
  updateProjectScanTimes_(project, state.mode);
  logEvent_(project.projectId, 'SCAN_COMPLETED', { result: 'SUCCESS', processedFiles: state.processedFiles, errors: state.errors, scanRunId: state.scanRunId, mode: state.mode });
  return state;
}

function driveListChildrenPage_(folderId, pageToken) {
  const params = [
    'q=' + encodeURIComponent("'" + folderId + "' in parents and trashed = false"),
    'pageSize=' + encodeURIComponent(V3_CONFIG.SCANNER.PAGE_SIZE),
    'fields=' + encodeURIComponent('nextPageToken,files(id,name,mimeType,modifiedTime,createdTime,parents,webViewLink,description,trashed)'),
    'spaces=drive',
    'supportsAllDrives=true',
    'includeItemsFromAllDrives=true'
  ];
  if (pageToken) params.push('pageToken=' + encodeURIComponent(pageToken));
  return apiFetchJson_('https://www.googleapis.com/drive/v3/files?' + params.join('&'), { method: 'get' });
}

function driveGetFileMeta_(fileId) {
  const fields = 'id,name,mimeType,modifiedTime,createdTime,parents,webViewLink,description,trashed';
  return apiFetchJson_('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '?fields=' + encodeURIComponent(fields) + '&supportsAllDrives=true', { method: 'get' });
}

function mimeToAssetType_(mime, name) {
  if (mime === V3_CONFIG.MIME.GOOGLE_DOCS) return 'DOC';
  if (mime === V3_CONFIG.MIME.GOOGLE_SHEETS) return 'SHEET';
  if (mime === V3_CONFIG.MIME.GOOGLE_FORMS) return 'FORM';
  if (mime === V3_CONFIG.MIME.GOOGLE_DRAWINGS) return 'DRAWING';
  if (mime === V3_CONFIG.MIME.GOOGLE_SLIDES) return 'SLIDES';
  if (mime === V3_CONFIG.MIME.PDF) return 'PDF';
  if (mime === V3_CONFIG.MIME.DOCX) return 'DOCX';
  if (mime === V3_CONFIG.MIME.HTML || /\.html?$/i.test(name || '')) return 'HTML';
  return '';
}

function metadataToInventoryAsset_(project, meta, currentFolderId, scanRunId) {
  let assetType = mimeToAssetType_(meta.mimeType, meta.name);
  const marker = readV3Meta_(meta.description || '');
  if (marker.PROJECT_ID === project.projectId && marker.ASSET_SCOPE === 'PROJECT' && marker.PROJECT_ASSET_TYPE) {
    assetType = safeString_(marker.PROJECT_ASSET_TYPE).toUpperCase();
  }
  if (!assetType || V3_CONFIG.DRIVE_INVENTORY_TYPES.indexOf(assetType) === -1) return null;
  let sourceDocId = '';
  let sourceDocName = '';
  let resolutionMethod = '';

  if (marker.PROJECT_ID === project.projectId && marker.ASSET_SCOPE === 'PROJECT' && marker.PROJECT_ASSET_TYPE) {
    resolutionMethod = 'PROJECT_MARKER';
  } else if (assetType === 'DOC' && currentFolderId === project.folders.articlesFolderId) {
    sourceDocId = meta.id;
    sourceDocName = meta.name;
    resolutionMethod = 'SOURCE_DOC';
  } else {
    const v3 = marker;
    if (v3.PROJECT_ID === project.projectId && v3.SOURCE_DOC_ID) {
      sourceDocId = v3.SOURCE_DOC_ID;
      sourceDocName = v3.SOURCE_DOC_NAME || '';
      resolutionMethod = 'V3_MARKER';
    } else {
      const v2Source = extractLegacyV2SourceId_(meta.description || '');
      if (v2Source) {
        sourceDocId = v2Source;
        resolutionMethod = 'V2_MARKER';
      }
    }
  }

  if (sourceDocId && !sourceDocName) {
    try { sourceDocName = DriveApp.getFileById(sourceDocId).getName(); } catch (e) {}
  }

  const systemAsset = meta.id === project.registrySheetId;
  return {
    sourceDocId: sourceDocId,
    sourceDocName: sourceDocName,
    assetType: assetType,
    assetId: meta.id,
    assetName: meta.name,
    mimeType: meta.mimeType,
    folderId: currentFolderId,
    folderName: safeFolderName_(currentFolderId),
    url: meta.webViewLink || driveFallbackUrl_(assetType, meta.id),
    sourceModified: sourceDocId ? safeSourceModified_(sourceDocId) : '',
    assetModified: meta.modifiedTime || '',
    syncStatus: marker.ASSET_SCOPE === 'PROJECT'
      ? deriveProjectSyncStatusV41_(project, assetType)
      : (sourceDocId && assetType !== 'DOC' ? deriveSyncStatusFromRegistry_(project, sourceDocId, assetType) : ''),
    lifecycleStatus: marker.ASSET_SCOPE === 'PROJECT' || sourceDocId || assetType === 'DOC' ? 'KNOWN' : 'UNLINKED',
    resolutionMethod: resolutionMethod,
    systemAsset: systemAsset,
    lastSynced: marker.ASSET_SCOPE === 'PROJECT'
      ? ((getProjectAssetRegistryV41_(project.projectId, assetType) || {}).lastSyncedAt || '')
      : (sourceDocId && assetType !== 'DOC' ? ((getAssetRegistry_(project.projectId, sourceDocId, assetType) || {}).lastSyncedAt || '') : ''),
    lastSeenRunId: scanRunId
  };
}

function extractLegacyV2SourceId_(description) {
  const s = safeString_(description);
  const re = new RegExp(V3_CONFIG.LEGACY_V2_SOURCE_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^\\s]+)');
  const m = s.match(re);
  return m ? m[1] : '';
}

function safeFolderName_(id) {
  try { return DriveApp.getFolderById(id).getName(); } catch (e) { return ''; }
}
function safeSourceModified_(id) {
  try { return DriveApp.getFileById(id).getLastUpdated().toISOString(); } catch (e) { return ''; }
}
function deriveSyncStatusFromRegistry_(project, sourceDocId, assetType) {
  try {
    const doc = DriveApp.getFileById(sourceDocId);
    return getAssetState_(project, doc, assetType).status;
  } catch (e) { return 'UNKNOWN'; }
}
function deriveProjectSyncStatusV41_(project, assetType) {
  try { return getProjectSingletonAssetStateV41_(project, assetType).status; }
  catch (e) { return 'UNKNOWN'; }
}

function driveFallbackUrl_(assetType, id) {
  if (assetType === 'PROJECT_URL_SHEET') assetType = 'SHEET';
  if (assetType === 'PROJECT_FORM') assetType = 'FORM';
  if (assetType === 'PROJECT_DRAWING') assetType = 'DRAWING';
  if (assetType === 'DOC') return 'https://docs.google.com/document/d/' + id + '/edit';
  if (assetType === 'SHEET') return 'https://docs.google.com/spreadsheets/d/' + id + '/edit';
  if (assetType === 'FORM') return 'https://docs.google.com/forms/d/' + id + '/edit';
  if (assetType === 'DRAWING') return 'https://docs.google.com/drawings/d/' + id + '/edit';
  if (assetType === 'SLIDES') return 'https://docs.google.com/presentation/d/' + id + '/edit';
  return 'https://drive.google.com/file/d/' + id + '/view';
}

function reconcileMissingAssetsAfterFullScan_(project, state) {
  if (!project.registrySheetId) return;
  const sh = SpreadsheetApp.openById(project.registrySheetId).getSheetByName(V3_CONFIG.REGISTRY_TABS.ASSETS);
  const last = sh.getLastRow();
  if (last < 2) return;
  const data = sh.getRange(2,1,last-1,V3_ASSET_HEADERS.length).getValues();
  data.forEach(function(row, i) {
    if (String(row[1]) !== project.projectId) return;
    const assetType = String(row[5]);
    // Ignore historical remote-publishing rows left by older V3 deployments.
    if (['BLOGGER','SITES_RENDER','GOOGLE_SITES_PAGE'].indexOf(assetType) !== -1) return;
    const assetId = String(row[6]);
    const seenRun = String(row[21] || '');
    const existingLifecycle = String(row[15] || '').toUpperCase();
    if (existingLifecycle === 'ARCHIVED_LEGACY') return;
    if (!assetId || seenRun === state.scanRunId) return;
    if (String(assetId) === String(project.registrySheetId || '') && project.privateStorage &&
        ['APPLIED','VERIFIED'].indexOf(String(project.privateStorage.status || '').toUpperCase()) !== -1) {
      sh.getRange(i+2,16).setValue('PRIVATE_SYSTEM');
      sh.getRange(i+2,20).setValue(nowIso_());
      return;
    }
    let lifecycle = 'NOT_FOUND';
    try {
      const meta = driveGetFileMeta_(assetId);
      if (meta.trashed) lifecycle = 'TRASHED';
      else {
        const parents = meta.parents || [];
        const known = [
          project.rootFolderId,
          project.folders.articlesFolderId, project.folders.docxFolderId, project.folders.htmlFolderId,
          project.folders.slidesFolderId, project.folders.pdfFolderId, project.folders.photosFolderId,
          project.folders.videosFolderId, project.folders.podcastsFolderId,
          // Legacy folders remain known locations.
          project.folders.sheetsFolderId, project.folders.formsFolderId
        ].filter(Boolean);
        lifecycle = parents.some(function(p) { return known.indexOf(p) !== -1; }) ? 'KNOWN' : 'MOVED_OUT';
      }
    } catch (e) {
      lifecycle = e.httpCode === 403 ? 'NOT_ACCESSIBLE' : 'NOT_FOUND';
    }
    sh.getRange(i+2,16).setValue(lifecycle);
    sh.getRange(i+2,20).setValue(nowIso_());
  });
}

function updateProjectScanTimes_(project, mode) {
  project.scheduledRegistrySync = project.scheduledRegistrySync || {};
  const stamp = nowIso_();
  if (mode === 'FULL') {
    project.scheduledRegistrySync.lastFullReconcileAt = stamp;
    project.scheduledRegistrySync.lastQuickScanAt = stamp;
  } else {
    project.scheduledRegistrySync.lastQuickScanAt = stamp;
  }
  saveProject_(project);
}

function scanDriveNow() {
  return scanProjectDrive(getActiveProjectId_(), 'QUICK');
}
function fullReconcileNow() {
  return scanProjectDrive(getActiveProjectId_(), 'FULL');
}
function rebuildRegistryForProject(projectId) {
  clearScanState_(projectId || getActiveProjectId_());
  return scanProjectDrive(projectId || getActiveProjectId_(), 'FULL');
}
