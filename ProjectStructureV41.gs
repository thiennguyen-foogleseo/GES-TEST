/**
 * GES V4.1 - Project-centric structure helpers.
 *
 * Patch A policy:
 * - Preserve every legacy asset/folder.
 * - Never auto-migrate or auto-delete legacy Sheets/Forms folders/assets.
 * - Canonical project folders are provisioned only for NEW_STACK creation or
 *   by the explicit provisionProjectStructureV41() action.
 * - Google Sheet/Form are project-scoped singleton assets and live directly
 *   under PROJECT_ROOT. Drawing/My Maps/Earth are reserved singleton roles for
 *   later modules; Patch A does not create them.
 */

const GES_PROJECT_STRUCTURE_V41 = Object.freeze({
  VERSION: '4.1.0',
  MODE: 'PROJECT_CENTRIC',
  MIGRATION_POLICY: 'PRESERVE_LEGACY_NO_AUTO_MIGRATION',
  CANONICAL_FOLDER_KEYS: ['ARTICLES','DOCX','HTML','SLIDES','PDF','PHOTOS','VIDEOS','PODCASTS'],
  RETIRED_FOLDER_KEYS: ['SHEETS','FORMS'],
  PROJECT_SINGLETON_TYPES: ['PROJECT_URL_SHEET','PROJECT_FORM','PROJECT_DRAWING','PROJECT_MY_MAPS','PROJECT_EARTH'],
  AUTO_MANAGED_SINGLETON_TYPES: ['PROJECT_URL_SHEET','PROJECT_FORM'],
  OPTIONAL_SINGLETON_TYPES: ['PROJECT_DRAWING','PROJECT_MY_MAPS','PROJECT_EARTH']
});

function createProjectStructureStateV41_() {
  return {
    version: GES_PROJECT_STRUCTURE_V41.VERSION,
    mode: GES_PROJECT_STRUCTURE_V41.MODE,
    migrationPolicy: GES_PROJECT_STRUCTURE_V41.MIGRATION_POLICY,
    calendarV2Pending: false,
    lastPreviewAt: '',
    lastProvisionedAt: '',
    notes: []
  };
}

function normalizeProjectStructureStateV41_(value) {
  const base = createProjectStructureStateV41_();
  value = value && typeof value === 'object' ? value : {};
  base.version = safeString_(value.version || base.version);
  base.mode = safeString_(value.mode || base.mode);
  base.migrationPolicy = safeString_(value.migrationPolicy || base.migrationPolicy);
  base.calendarV2Pending = false; // Calendar V2 installed by Patch B; preserve no legacy pause flag.
  base.lastPreviewAt = safeString_(value.lastPreviewAt || '');
  base.lastProvisionedAt = safeString_(value.lastProvisionedAt || '');
  base.notes = Array.isArray(value.notes) ? value.notes.slice() : [];
  return base;
}

function getProjectKeywordV41_(project) {
  project = project || {};
  return normalizeName_(project.projectKeyword || project.projectName || project.brandName || project.rootFolderName || '');
}

function normalizeExactMatchKeyV41_(value) {
  return safeString_(value)
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('vi-VN');
}

function exactProjectNameMatchesV41_(a, b) {
  return normalizeExactMatchKeyV41_(a) === normalizeExactMatchKeyV41_(b);
}

function getProjectSingletonExpectedNameV41_(project, assetType) {
  const keyword = getProjectKeywordV41_(project);
  if (!keyword) throw new Error('PROJECT_KEYWORD_REQUIRED');
  if (GES_PROJECT_STRUCTURE_V41.PROJECT_SINGLETON_TYPES.indexOf(assetType) === -1) {
    throw new Error('UNKNOWN_PROJECT_SINGLETON_TYPE: ' + assetType);
  }
  return keyword;
}

function getProjectSingletonMimeV41_(assetType) {
  if (assetType === 'PROJECT_URL_SHEET') return V3_CONFIG.MIME.GOOGLE_SHEETS;
  if (assetType === 'PROJECT_FORM') return V3_CONFIG.MIME.GOOGLE_FORMS;
  if (assetType === 'PROJECT_DRAWING') return V3_CONFIG.MIME.GOOGLE_DRAWINGS;
  return '';
}

function getProjectCanonicalFolderKeysV41_() {
  return GES_PROJECT_STRUCTURE_V41.CANONICAL_FOLDER_KEYS.slice();
}

function getProjectLegacyFolderSummaryV41_(project) {
  project = project || {};
  const folders = project.folders || {};
  const out = [];
  [
    { key: 'SHEETS', idKey: 'sheetsFolderId' },
    { key: 'FORMS', idKey: 'formsFolderId' }
  ].forEach(function(spec) {
    const id = safeString_(folders[spec.idKey] || '');
    if (!id) return;
    try {
      const folder = DriveApp.getFolderById(id);
      var privateState = typeof normalizePrivateStorageStateV45_ === 'function'
        ? normalizePrivateStorageStateV45_(project.privateStorage)
        : (project.privateStorage || {});
      var expectedPrivateParentId = spec.key === 'SHEETS'
        ? safeString_(privateState.entityDataArchiveFolderId || '')
        : safeString_(privateState.formsArchiveFolderId || '');
      var privateArchived = false;
      if (expectedPrivateParentId) {
        try { privateArchived = isFolderDirectlyInFolder_(folder, DriveApp.getFolderById(expectedPrivateParentId)); } catch (ignoreArchive) {}
      }
      out.push({
        key: spec.key,
        id: id,
        name: folder.getName(),
        url: folder.getUrl(),
        exists: true,
        legacy: true,
        retiredFromProvisioning: true,
        privateArchived: privateArchived,
        runtimeRetired: !!(privateState.entityRetirement && privateState.entityRetirement.runtimeScanDisabled)
      });
    } catch (e) {
      out.push({
        key: spec.key,
        id: id,
        name: '',
        url: '',
        exists: false,
        legacy: true,
        retiredFromProvisioning: true,
        error: safeString_(e && e.message || e)
      });
    }
  });
  return out;
}

function findExactRootFilesV41_(project, mimeType, expectedName) {
  const root = getProjectRoot_(project);
  const it = root.getFilesByName(expectedName);
  const out = [];
  while (it.hasNext()) {
    const file = it.next();
    if (!mimeType || file.getMimeType() === mimeType) out.push(file);
  }
  return out;
}

/**
 * Resolve the canonical content source for a project-scoped Form.
 * - exact match projectKeyword wins;
 * - if there is exactly one Source Doc, it is a safe compatibility fallback;
 * - multi-doc project without exact match is REVIEW, never guessed.
 */
function resolveProjectPrimarySourceDocV41_(project) {
  const docs = getSourceDocs_(project);
  const keyword = getProjectKeywordV41_(project);
  const exact = docs.filter(function(file) {
    return exactProjectNameMatchesV41_(file.getName(), keyword);
  });

  if (exact.length === 1) {
    return { ready: true, status: 'READY', method: 'EXACT_PROJECT_KEYWORD', file: exact[0], candidates: 1 };
  }
  if (exact.length > 1) {
    return { ready: false, status: 'NEEDS_REVIEW', method: 'EXACT_DUPLICATE', file: null, candidates: exact.length };
  }
  if (docs.length === 1) {
    return { ready: true, status: 'READY', method: 'ONLY_SOURCE_DOC_FALLBACK', file: docs[0], candidates: 1 };
  }
  return {
    ready: false,
    status: docs.length ? 'SOURCE_REQUIRED' : 'MISSING_SOURCE',
    method: docs.length ? 'MULTI_SOURCE_NO_EXACT_MATCH' : 'NO_SOURCE_DOC',
    file: null,
    candidates: docs.length
  };
}

function previewProjectStructureV41(projectId) {
  let project = projectId ? getProject_(projectId) : getActiveProject_();
  if (!project) throw new Error('PROJECT_NOT_FOUND');
  ensureProjectFolders_(project, false);

  const root = getProjectRoot_(project);
  const folders = getProjectFolderSummary_(project);
  const canonical = folders.filter(function(item) { return !item.legacy && item.key !== 'ROOT'; });
  const legacy = folders.filter(function(item) { return !!item.legacy; });
  const missingCanonical = canonical.filter(function(item) { return !item.exists; });

  const singletonStates = {};
  GES_PROJECT_STRUCTURE_V41.PROJECT_SINGLETON_TYPES.forEach(function(type) {
    if (typeof getProjectSingletonAssetStateV41_ === 'function') {
      singletonStates[type] = getProjectSingletonAssetStateV41_(project, type);
    } else {
      singletonStates[type] = { status: 'MODULE_NOT_READY', id: '', name: '', url: '' };
    }
  });

  project.projectStructure = normalizeProjectStructureStateV41_(project.projectStructure);
  project.projectStructure.lastPreviewAt = nowIso_();
  // Preview intentionally does not save project and does not touch Drive.

  return {
    success: true,
    version: GES_PROJECT_STRUCTURE_V41.VERSION,
    mode: GES_PROJECT_STRUCTURE_V41.MODE,
    migrationPolicy: GES_PROJECT_STRUCTURE_V41.MIGRATION_POLICY,
    projectId: project.projectId,
    projectName: project.projectName,
    projectKeyword: getProjectKeywordV41_(project),
    root: { id: root.getId(), name: root.getName(), url: root.getUrl() },
    canonicalFolders: canonical,
    missingCanonicalFolders: missingCanonical,
    legacyFolders: legacy,
    singletonAssets: singletonStates,
    sourceResolution: resolveProjectPrimarySourceDocV41_(project),
    destructiveActions: [],
    autoMigrationPlanned: false
  };
}

function previewActiveProjectStructureV41() {
  return previewProjectStructureV41('');
}

/**
 * Explicit provisioning only. Creates missing canonical folders and nothing
 * else. Legacy folders/files are never moved, renamed or deleted.
 */
function provisionProjectStructureV41(projectId) {
  let project = projectId ? getProject_(projectId) : getActiveProject_();
  if (!project) throw new Error('PROJECT_NOT_FOUND');
  assertProjectWritable_(project);

  const before = previewProjectStructureV41(project.projectId);
  ensureProjectFolders_(project, true);
  project.projectStructure = normalizeProjectStructureStateV41_(project.projectStructure);
  project.projectStructure.lastProvisionedAt = nowIso_();
  project = saveProject_(project);
  try { syncProjectConfigSheet_(project); } catch (ignore) {}

  const after = previewProjectStructureV41(project.projectId);
  try {
    logEvent_(project.projectId, 'PROJECT_STRUCTURE_V41_PROVISION', {
      result: 'SUCCESS',
      createdFolders: before.missingCanonicalFolders.map(function(x) { return x.key; }),
      migrationPolicy: GES_PROJECT_STRUCTURE_V41.MIGRATION_POLICY
    });
  } catch (ignore2) {}
  return after;
}

function provisionActiveProjectStructureV41() {
  return provisionProjectStructureV41('');
}
