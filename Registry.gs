/** Core asset registry in Script Properties plus metadata markers on Drive files. */

function assetRegistryKey_(projectId, docId, assetType) {
  return V3_CONFIG.PROPERTY_KEYS.ASSET_PREFIX + projectId + '_' + docId + '_' + assetType;
}

function getAssetRegistry_(projectId, docId, assetType) {
  const raw = getScriptProps_().getProperty(assetRegistryKey_(projectId, docId, assetType));
  return raw ? jsonParseSafe_(raw, null) : null;
}

function saveAssetRegistry_(project, docFile, assetType, file, extra) {
  const record = Object.assign({
    schemaVersion: V3_CONFIG.REGISTRY_SCHEMA_VERSION,
    projectId: project.projectId,
    sourceDocId: docFile.getId(),
    sourceDocName: docFile.getName(),
    assetType: assetType,
    fileId: file ? file.getId() : '',
    fileName: file ? file.getName() : '',
    fileUrl: file ? file.getUrl() : '',
    sourceModifiedAtSyncMs: docFile.getLastUpdated().getTime(),
    sourceModifiedAtSync: docFile.getLastUpdated().toISOString(),
    assetModifiedAtSync: file ? file.getLastUpdated().toISOString() : '',
    rendererVersion: assetType === 'HTML' ? V3_CONFIG.HTML_RENDERER_VERSION : '',
    brandingFingerprint: getBrandingFingerprint_(project, assetType),
    resourceFooterFingerprint: (['SLIDES','PDF','DOCX','HTML'].indexOf(assetType) !== -1 && typeof getOutputResourceFingerprintSafeV467_ === 'function')
      ? getOutputResourceFingerprintSafeV467_(project, docFile)
      : '',
    lastSyncedAt: nowIso_(),
    lifecycleStatus: 'KNOWN'
  }, extra || {});
  getScriptProps_().setProperty(
    assetRegistryKey_(project.projectId, docFile.getId(), assetType),
    JSON.stringify(record)
  );
  return record;
}

function clearAssetRegistry_(projectId, docId, assetType) {
  getScriptProps_().deleteProperty(assetRegistryKey_(projectId, docId, assetType));
}

function getExpectedOutputName_(docFile, assetType) {
  const base = docFile.getName();
  if (assetType === 'SLIDES') return base;
  if (assetType === 'SHEET') return base + ' Entity Data';
  if (assetType === 'FORM') return base + ' Form';
  if (assetType === 'PDF') return base + '.pdf';
  if (assetType === 'DOCX') return base + '.docx';
  if (assetType === 'HTML') return base + '.html';
  throw new Error('Unknown asset type: ' + assetType);
}

function getAssetMime_(assetType) {
  if (assetType === 'SLIDES') return V3_CONFIG.MIME.GOOGLE_SLIDES;
  if (assetType === 'SHEET') return V3_CONFIG.MIME.GOOGLE_SHEETS;
  if (assetType === 'FORM') return V3_CONFIG.MIME.GOOGLE_FORMS;
  if (assetType === 'PDF') return V3_CONFIG.MIME.PDF;
  if (assetType === 'DOCX') return V3_CONFIG.MIME.DOCX;
  if (assetType === 'HTML') return V3_CONFIG.MIME.HTML;
  throw new Error('Unknown asset type: ' + assetType);
}

function readV3Meta_(description) {
  const s = safeString_(description);
  const start = s.indexOf(V3_CONFIG.V3_META_START);
  const end = s.indexOf(V3_CONFIG.V3_META_END);
  if (start === -1 || end === -1 || end <= start) return {};
  const block = s.substring(start + V3_CONFIG.V3_META_START.length, end).trim();
  const out = {};
  block.split(/\r?\n/).forEach(function(line) {
    const p = line.indexOf('=');
    if (p <= 0) return;
    out[line.substring(0, p).trim()] = line.substring(p + 1).trim();
  });
  return out;
}

function mergeV3MetaIntoDescription_(existing, meta) {
  let s = safeString_(existing);
  const start = s.indexOf(V3_CONFIG.V3_META_START);
  const end = s.indexOf(V3_CONFIG.V3_META_END);
  if (start !== -1 && end !== -1 && end > start) {
    s = (s.substring(0, start) + s.substring(end + V3_CONFIG.V3_META_END.length)).trim();
  }
  const lines = [V3_CONFIG.V3_META_START];
  Object.keys(meta).forEach(function(k) {
    if (meta[k] !== undefined && meta[k] !== null) lines.push(k + '=' + safeString_(meta[k]));
  });
  lines.push(V3_CONFIG.V3_META_END);
  return (s ? s + '\n\n' : '') + lines.join('\n');
}

function tagManagedAsset_(project, docFile, assetType, file, extraMeta) {
  const meta = Object.assign({
    MANAGER: 'V3',
    PROJECT_ID: project.projectId,
    SOURCE_DOC_ID: docFile.getId(),
    SOURCE_DOC_NAME: docFile.getName(),
    ASSET_TYPE: assetType,
    SOURCE_MODIFIED_AT_SYNC_MS: docFile.getLastUpdated().getTime(),
    SOURCE_MODIFIED_AT_SYNC: docFile.getLastUpdated().toISOString(),
    RENDERER_VERSION: assetType === 'HTML' ? V3_CONFIG.HTML_RENDERER_VERSION : '',
    BRANDING_FINGERPRINT: getBrandingFingerprint_(project, assetType),
    RESOURCE_FOOTER_FINGERPRINT: (['SLIDES','PDF','DOCX','HTML'].indexOf(assetType) !== -1 && typeof getOutputResourceFingerprintSafeV467_ === 'function')
      ? getOutputResourceFingerprintSafeV467_(project, docFile)
      : '',
    WEBSITE: project.websiteUrl || ''
  }, extraMeta || {});
  file.setDescription(mergeV3MetaIntoDescription_(file.getDescription() || '', meta));
  return meta;
}

function assetMatchesV3Marker_(file, project, docId, assetType) {
  const meta = readV3Meta_(file.getDescription() || '');
  return meta.PROJECT_ID === project.projectId && meta.SOURCE_DOC_ID === docId && meta.ASSET_TYPE === assetType;
}

function assetMatchesV2Marker_(file, docId, assetType) {
  const d = file.getDescription() || '';
  return d.indexOf(V3_CONFIG.LEGACY_V2_SOURCE_MARKER + docId) !== -1 &&
         d.indexOf(V3_CONFIG.LEGACY_V2_TYPE_MARKER + assetType) !== -1;
}

function adoptManagedAsset_(project, docFile, assetType, file, options) {
  options = options || {};
  const folder = getOutputFolderByAssetType_(project, assetType);
  if (options.rename !== false) file.setName(getExpectedOutputName_(docFile, assetType));
  if (options.move !== false) ensureFileInFolder_(file, folder);
  tagManagedAsset_(project, docFile, assetType, file, options.extraMeta || {});
  const registryExtra = {
    resolutionMethod: options.resolutionMethod || 'ADOPT',
    migratedFromV2: !!options.migratedFromV2
  };
  if (options.sourceModifiedAtSyncMs !== undefined) {
    registryExtra.sourceModifiedAtSyncMs = Number(options.sourceModifiedAtSyncMs);
    registryExtra.sourceModifiedAtSync = new Date(Number(options.sourceModifiedAtSyncMs)).toISOString();
  }
  const record = saveAssetRegistry_(project, docFile, assetType, file, registryExtra);
  return { file: file, record: record };
}

function makeAssetResult_(success, project, docFile, assetType, action, code, message, file, extra) {
  return Object.assign({
    success: !!success,
    projectId: project ? project.projectId : '',
    docId: docFile ? docFile.getId() : '',
    docName: docFile ? docFile.getName() : '',
    assetType: assetType || '',
    action: action || '',
    code: code || '',
    message: message || '',
    outputId: file ? file.getId() : '',
    outputName: file ? file.getName() : '',
    outputUrl: file ? file.getUrl() : ''
  }, extra || {});
}

function computeAssetStatus_(project, docFile, assetType, resolved) {
  if (resolved.ambiguous) return 'DUPLICATE';
  if (!resolved.file) return 'MISSING';
  if (resolved.needsPlacement) return 'WRONG_FOLDER';

  const reg = getAssetRegistry_(project.projectId, docFile.getId(), assetType);
  const sourceMs = docFile.getLastUpdated().getTime();
  let syncedMs = reg && Number(reg.sourceModifiedAtSyncMs || 0);
  if (!syncedMs) {
    const meta = readV3Meta_(resolved.file.getDescription() || '');
    syncedMs = Number(meta.SOURCE_MODIFIED_AT_SYNC_MS || 0);
  }
  if (!syncedMs) {
    syncedMs = resolved.file.getLastUpdated().getTime();
  }

  if (sourceMs > syncedMs + V3_CONFIG.MODIFIED_TIME_TOLERANCE_MS) return 'OUTDATED';

  const meta = readV3Meta_(resolved.file.getDescription() || '');
  const currentBrandingFingerprint = getBrandingFingerprint_(project, assetType);
  const storedBrandingFingerprint = reg && reg.brandingFingerprint !== undefined
    ? safeString_(reg.brandingFingerprint)
    : safeString_(meta.BRANDING_FINGERPRINT || '');
  if ((currentBrandingFingerprint || storedBrandingFingerprint) && currentBrandingFingerprint !== storedBrandingFingerprint) {
    return 'OUTDATED';
  }

  // V4.6.7: resource graph changes (Calendar / Extended Google Assets /
  // Public Sheet variants / folders) must also invalidate derived outputs,
  // even when canonical article text is unchanged.
  if (['SLIDES','PDF','DOCX','HTML'].indexOf(assetType) !== -1 && typeof getOutputResourceFingerprintSafeV467_ === 'function') {
    const currentResourceFp = getOutputResourceFingerprintSafeV467_(project, docFile);
    const storedResourceFp = reg && reg.resourceFooterFingerprint !== undefined
      ? safeString_(reg.resourceFooterFingerprint)
      : safeString_(meta.RESOURCE_FOOTER_FINGERPRINT || '');
    if (currentResourceFp && storedResourceFp && currentResourceFp !== storedResourceFp) return 'OUTDATED';
    if (currentResourceFp && !storedResourceFp) return 'OUTDATED';
  }

  if ((assetType === 'SHEET' || assetType === 'FORM') && typeof getManagedAssetFingerprintV4_ === 'function') {
    const currentAssetFingerprint = getManagedAssetFingerprintV4_(project, docFile, assetType);
    const storedAssetFingerprint = reg && reg.assetFingerprint !== undefined
      ? safeString_(reg.assetFingerprint)
      : safeString_(meta.ASSET_FINGERPRINT || '');
    if ((currentAssetFingerprint || storedAssetFingerprint) && currentAssetFingerprint !== storedAssetFingerprint) {
      return 'OUTDATED';
    }
  }

  if (assetType === 'HTML') {
    const rendererVersion = reg && reg.rendererVersion ? reg.rendererVersion : meta.RENDERER_VERSION;
    if (rendererVersion && rendererVersion !== V3_CONFIG.HTML_RENDERER_VERSION) return 'RENDERER_OUTDATED';
  }
  if (assetType === 'SHEET') {
    const rendererVersion = reg && reg.rendererVersion ? reg.rendererVersion : meta.RENDERER_VERSION;
    if (rendererVersion && typeof GES_SHEETS_ASSET_V4 !== 'undefined' && rendererVersion !== GES_SHEETS_ASSET_V4.VERSION) return 'RENDERER_OUTDATED';
  }
  if (assetType === 'FORM') {
    const rendererVersion = reg && reg.rendererVersion ? reg.rendererVersion : meta.RENDERER_VERSION;
    if (rendererVersion && typeof GES_FORMS_ASSET_V4 !== 'undefined' && rendererVersion !== GES_FORMS_ASSET_V4.VERSION) return 'RENDERER_OUTDATED';
  }
  return 'CURRENT';
}

/* ========================================================================== *
 * GES V4.1 project-scoped singleton registry
 * ========================================================================== */

function projectAssetRegistryKeyV41_(projectId, assetType) {
  return V3_CONFIG.PROPERTY_KEYS.ASSET_PREFIX + projectId + '___PROJECT___' + assetType;
}

function getProjectAssetRegistryV41_(projectId, assetType) {
  const raw = getScriptProps_().getProperty(projectAssetRegistryKeyV41_(projectId, assetType));
  return raw ? jsonParseSafe_(raw, null) : null;
}

function saveProjectAssetRegistryV41_(project, assetType, file, extra) {
  const record = Object.assign({
    schemaVersion: V3_CONFIG.REGISTRY_SCHEMA_VERSION,
    projectId: project.projectId,
    assetScope: 'PROJECT',
    sourceDocId: '',
    sourceDocName: '',
    assetType: assetType,
    fileId: file ? file.getId() : '',
    fileName: file ? file.getName() : '',
    fileUrl: file ? file.getUrl() : '',
    assetModifiedAtSync: file ? file.getLastUpdated().toISOString() : '',
    assetFingerprint: typeof getProjectManagedAssetFingerprintV41_ === 'function'
      ? getProjectManagedAssetFingerprintV41_(project, assetType)
      : '',
    rendererVersion: '',
    lastSyncedAt: nowIso_(),
    lifecycleStatus: 'KNOWN'
  }, extra || {});
  getScriptProps_().setProperty(projectAssetRegistryKeyV41_(project.projectId, assetType), JSON.stringify(record));
  return record;
}

function clearProjectAssetRegistryV41_(projectId, assetType) {
  getScriptProps_().deleteProperty(projectAssetRegistryKeyV41_(projectId, assetType));
}

function tagProjectManagedAssetV41_(project, assetType, file, extraMeta) {
  const meta = Object.assign({
    MANAGER: 'GES_V4_1',
    PROJECT_ID: project.projectId,
    ASSET_SCOPE: 'PROJECT',
    PROJECT_ASSET_TYPE: assetType,
    PROJECT_KEYWORD: typeof getProjectKeywordV41_ === 'function' ? getProjectKeywordV41_(project) : project.projectName,
    ASSET_FINGERPRINT: typeof getProjectManagedAssetFingerprintV41_ === 'function'
      ? getProjectManagedAssetFingerprintV41_(project, assetType)
      : '',
    WEBSITE: project.websiteUrl || ''
  }, extraMeta || {});
  file.setDescription(mergeV3MetaIntoDescription_(file.getDescription() || '', meta));
  return meta;
}

function projectAssetMatchesMarkerV41_(file, project, assetType) {
  const meta = readV3Meta_(file.getDescription() || '');
  return meta.PROJECT_ID === project.projectId &&
    meta.ASSET_SCOPE === 'PROJECT' &&
    meta.PROJECT_ASSET_TYPE === assetType;
}

function listProjectMarkerCandidatesV41_(project, assetType) {
  const root = getProjectRoot_(project);
  const mime = typeof getProjectSingletonMimeV41_ === 'function' ? getProjectSingletonMimeV41_(assetType) : '';
  const it = root.getFiles();
  const out = [];
  while (it.hasNext()) {
    const file = it.next();
    if (mime && file.getMimeType() !== mime) continue;
    try {
      if (projectAssetMatchesMarkerV41_(file, project, assetType)) out.push(file);
    } catch (ignore) {}
  }
  return out;
}

function listProjectLegacyExactCandidatesV41_(project, assetType) {
  if (typeof getProjectSingletonExpectedNameV41_ !== 'function') return [];
  const mime = getProjectSingletonMimeV41_(assetType);
  if (!mime) return [];
  const expected = getProjectSingletonExpectedNameV41_(project, assetType);
  const root = getProjectRoot_(project);
  const it = root.getFilesByName(expected);
  const out = [];
  while (it.hasNext()) {
    const file = it.next();
    if (file.getMimeType() !== mime) continue;
    if (!projectAssetMatchesMarkerV41_(file, project, assetType)) out.push(file);
  }
  return out;
}

function resolveProjectSingletonAssetV41_(project, assetType) {
  const record = getProjectAssetRegistryV41_(project.projectId, assetType);
  if (record && record.fileId) {
    try {
      const file = DriveApp.getFileById(record.fileId);
      if (projectAssetMatchesMarkerV41_(file, project, assetType)) {
        return { file: file, ambiguous: false, method: 'PROJECT_REGISTRY_ID', legacyCandidates: [] };
      }
    } catch (ignore) {}
  }

  const marked = listProjectMarkerCandidatesV41_(project, assetType);
  if (marked.length > 1) {
    return { file: null, ambiguous: true, method: 'PROJECT_MARKER_DUPLICATE', duplicateCount: marked.length, legacyCandidates: [] };
  }
  if (marked.length === 1) {
    return { file: marked[0], ambiguous: false, method: 'PROJECT_MARKER', legacyCandidates: [] };
  }

  // IMPORTANT: unmanaged exact-name candidates are surfaced for manual review,
  // never auto-adopted in Patch A.
  const legacy = listProjectLegacyExactCandidatesV41_(project, assetType);
  return { file: null, ambiguous: false, method: legacy.length ? 'LEGACY_EXACT_CANDIDATE' : 'NOT_FOUND', legacyCandidates: legacy };
}

function getProjectSingletonAssetStateV41_(project, assetType) {
  if (assetType === 'PROJECT_MY_MAPS' || assetType === 'PROJECT_EARTH') {
    return { status: 'DEFERRED', id: '', name: '', url: '', resolutionMethod: 'BRIDGE_MODULE_NOT_INSTALLED' };
  }
  if (assetType === 'PROJECT_DRAWING') {
    const drawingResolved = resolveProjectSingletonAssetV41_(project, assetType);
    if (drawingResolved.ambiguous) return { status: 'DUPLICATE', id: '', name: '', url: '', resolutionMethod: drawingResolved.method, duplicateCount: drawingResolved.duplicateCount || 0 };
    if (drawingResolved.file) return { status: 'CURRENT', id: drawingResolved.file.getId(), name: drawingResolved.file.getName(), url: drawingResolved.file.getUrl(), resolutionMethod: drawingResolved.method };
    if ((drawingResolved.legacyCandidates || []).length) return { status: 'NEEDS_REVIEW', id: '', name: '', url: '', resolutionMethod: 'LEGACY_EXACT_CANDIDATE', legacyCandidateCount: drawingResolved.legacyCandidates.length };
    return { status: 'DEFERRED', id: '', name: '', url: '', resolutionMethod: 'DRAWING_MODULE_NOT_INSTALLED' };
  }

  const resolved = resolveProjectSingletonAssetV41_(project, assetType);
  if (resolved.ambiguous) {
    return { status: 'DUPLICATE', id: '', name: '', url: '', resolutionMethod: resolved.method, duplicateCount: resolved.duplicateCount || 0 };
  }
  if (!resolved.file) {
    if ((resolved.legacyCandidates || []).length) {
      return {
        status: 'NEEDS_REVIEW', id: '', name: '', url: '', resolutionMethod: 'LEGACY_EXACT_CANDIDATE',
        legacyCandidateCount: resolved.legacyCandidates.length,
        legacyCandidateIds: resolved.legacyCandidates.map(function(f) { return f.getId(); })
      };
    }
    if (assetType === 'PROJECT_FORM' && typeof resolveProjectPrimarySourceDocV41_ === 'function') {
      const source = resolveProjectPrimarySourceDocV41_(project);
      if (!source.ready) return { status: source.status, id: '', name: '', url: '', resolutionMethod: source.method, sourceCandidates: source.candidates || 0 };
    }
    return { status: 'MISSING', id: '', name: '', url: '', resolutionMethod: 'NOT_FOUND' };
  }

  const file = resolved.file;
  const root = getProjectRoot_(project);
  if (!isFileDirectlyInFolder_(file, root)) {
    return { status: 'WRONG_FOLDER', id: file.getId(), name: file.getName(), url: file.getUrl(), resolutionMethod: resolved.method };
  }

  const record = getProjectAssetRegistryV41_(project.projectId, assetType) || {};
  const currentFp = typeof getProjectManagedAssetFingerprintV41_ === 'function'
    ? getProjectManagedAssetFingerprintV41_(project, assetType)
    : '';
  const storedFp = safeString_(record.assetFingerprint || readV3Meta_(file.getDescription() || '').ASSET_FINGERPRINT || '');
  if (currentFp && storedFp && currentFp !== storedFp) {
    return { status: 'OUTDATED', id: file.getId(), name: file.getName(), url: file.getUrl(), resolutionMethod: resolved.method, fingerprint: currentFp, storedFingerprint: storedFp };
  }
  return { status: 'CURRENT', id: file.getId(), name: file.getName(), url: file.getUrl(), resolutionMethod: resolved.method, fingerprint: currentFp };
}

function makeProjectAssetResultV41_(success, project, assetType, action, code, message, file, extra) {
  return Object.assign({
    success: !!success,
    projectId: project ? project.projectId : '',
    projectName: project ? project.projectName : '',
    assetScope: 'PROJECT',
    assetType: assetType,
    action: action || '',
    code: code || '',
    message: message || '',
    outputId: file ? file.getId() : '',
    outputName: file ? file.getName() : '',
    outputUrl: file ? file.getUrl() : ''
  }, extra || {});
}
