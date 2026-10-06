/**
 * GES V4.5 - Private System Storage + Legacy Entity Retirement.
 *
 * Architecture:
 *   My Drive / GES Private System / Projects / <projectId>/
 *     - <Project> Asset Registry
 *     - Legacy Archive / Entity Data / <legacy Sheets folder>
 *     - Legacy Archive / Forms / <legacy Forms folder>
 *
 * Safety contract:
 * - Preview is read-only.
 * - Apply moves existing files/folders and preserves Drive IDs.
 * - No file/folder is deleted or trashed.
 * - Named user/domain permissions are preserved.
 * - Only public "anyone" permissions are removed from private-system items.
 * - Legacy Entity Data is archived, indexed, and removed from runtime scanning.
 */

const GES_PRIVATE_SYSTEM_V45 = Object.freeze({
  VERSION: '4.5.0',
  ROOT_NAME: 'GES Private System',
  PROJECTS_FOLDER_NAME: 'Projects',
  SYSTEM_FOLDER_NAME: 'System',
  LEGACY_ARCHIVE_FOLDER_NAME: 'Legacy Archive',
  ENTITY_DATA_FOLDER_NAME: 'Entity Data',
  FORMS_ARCHIVE_FOLDER_NAME: 'Forms',
  STORAGE_POLICY: 'GLOBAL_PRIVATE_ROOT_PER_PROJECT_SUBFOLDER',
  MIGRATION_POLICY: 'PREVIEW_APPLY_VERIFY_NO_DELETE',
  ENTITY_RETIREMENT_POLICY: 'PRIVATE_ARCHIVE_INDEX_NO_RUNTIME_DEPENDENCY',
  MAX_PERMISSION_SCAN_ITEMS: 5000
});

function createPrivateStorageStateV45_() {
  return {
    version: GES_PRIVATE_SYSTEM_V45.VERSION,
    status: 'NOT_CONFIGURED',
    rootFolderId: '',
    projectsFolderId: '',
    systemFolderId: '',
    projectFolderId: '',
    legacyArchiveFolderId: '',
    entityDataArchiveFolderId: '',
    formsArchiveFolderId: '',
    registryMoved: false,
    registryPrivate: false,
    legacySheetsMoved: false,
    legacyFormsMoved: false,
    entityRetirement: {
      status: 'NOT_STARTED',
      indexedFiles: 0,
      archivedFiles: 0,
      runtimeScanDisabled: false,
      lastIndexedAt: ''
    },
    lastPreviewAt: '',
    appliedAt: '',
    verifiedAt: '',
    lastError: '',
    warnings: []
  };
}

function normalizePrivateStorageStateV45_(value) {
  var base = createPrivateStorageStateV45_();
  value = value && typeof value === 'object' ? value : {};
  Object.keys(base).forEach(function(key) {
    if (key === 'entityRetirement' || key === 'warnings') return;
    if (value[key] !== undefined && value[key] !== null) base[key] = value[key];
  });
  base.version = safeString_(value.version || base.version);
  base.status = safeString_(value.status || base.status);
  base.rootFolderId = safeString_(value.rootFolderId || '');
  base.projectsFolderId = safeString_(value.projectsFolderId || '');
  base.systemFolderId = safeString_(value.systemFolderId || '');
  base.projectFolderId = safeString_(value.projectFolderId || '');
  base.legacyArchiveFolderId = safeString_(value.legacyArchiveFolderId || '');
  base.entityDataArchiveFolderId = safeString_(value.entityDataArchiveFolderId || '');
  base.formsArchiveFolderId = safeString_(value.formsArchiveFolderId || '');
  base.registryMoved = !!value.registryMoved;
  base.registryPrivate = !!value.registryPrivate;
  base.legacySheetsMoved = !!value.legacySheetsMoved;
  base.legacyFormsMoved = !!value.legacyFormsMoved;
  base.entityRetirement = Object.assign({}, base.entityRetirement, value.entityRetirement || {});
  base.entityRetirement.indexedFiles = Number(base.entityRetirement.indexedFiles || 0);
  base.entityRetirement.archivedFiles = Number(base.entityRetirement.archivedFiles || 0);
  base.entityRetirement.runtimeScanDisabled = !!base.entityRetirement.runtimeScanDisabled;
  base.warnings = Array.isArray(value.warnings) ? value.warnings.slice() : [];
  return base;
}

function getPrivateSystemStorageSchemaV45() {
  return cloneJson_(GES_PRIVATE_SYSTEM_V45);
}

function privateSystemRootPropertyKeyV45_() {
  return (V3_CONFIG.PROPERTY_KEYS.PRIVATE_SYSTEM_ROOT_ID || 'V45_PRIVATE_SYSTEM_ROOT_ID');
}

function getStoredPrivateSystemRootIdV45_() {
  return safeString_(getScriptProps_().getProperty(privateSystemRootPropertyKeyV45_()) || '');
}

function savePrivateSystemRootIdV45_(folderId) {
  if (!folderId) return;
  getScriptProps_().setProperty(privateSystemRootPropertyKeyV45_(), safeString_(folderId));
}

function driveItemCapabilitiesV45_(fileId) {
  if (!fileId) return {};
  try {
    return apiFetchJson_(
      'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) +
      '?fields=' + encodeURIComponent('id,name,mimeType,parents,capabilities(canEdit,canMoveItemWithinDrive,canShare,canDelete)') +
      '&supportsAllDrives=true',
      { method: 'get' }
    );
  } catch (e) {
    return { error: safeString_(e && e.message || e) };
  }
}

function listDrivePermissionsV45_(fileId) {
  if (!fileId) return [];
  try {
    var data = apiFetchJson_(
      'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) +
      '/permissions?fields=' + encodeURIComponent('permissions(id,type,role,allowFileDiscovery,emailAddress,domain,displayName)') +
      '&supportsAllDrives=true',
      { method: 'get' }
    );
    return data.permissions || [];
  } catch (e) {
    return [];
  }
}

function anyonePermissionsV45_(fileId) {
  return listDrivePermissionsV45_(fileId).filter(function(permission) {
    return safeString_(permission && permission.type).toLowerCase() === 'anyone';
  });
}

function isDriveItemPublicV45_(fileId) {
  return anyonePermissionsV45_(fileId).length > 0;
}

function removeAnyonePermissionsV45_(fileId) {
  var removed = [];
  anyonePermissionsV45_(fileId).forEach(function(permission) {
    if (!permission.id) return;
    apiFetchJson_(
      'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) +
      '/permissions/' + encodeURIComponent(permission.id) + '?supportsAllDrives=true',
      { method: 'delete' }
    );
    removed.push(permission.id);
  });
  return removed;
}

function listDirectChildrenAllV45_(folderId) {
  var out = [];
  var token = '';
  do {
    var params = [
      'q=' + encodeURIComponent("'" + folderId + "' in parents and trashed = false"),
      'pageSize=1000',
      'fields=' + encodeURIComponent('nextPageToken,files(id,name,mimeType,parents,webViewLink,description,modifiedTime)'),
      'spaces=drive',
      'supportsAllDrives=true',
      'includeItemsFromAllDrives=true'
    ];
    if (token) params.push('pageToken=' + encodeURIComponent(token));
    var page = apiFetchJson_('https://www.googleapis.com/drive/v3/files?' + params.join('&'), { method: 'get' });
    Array.prototype.push.apply(out, page.files || []);
    token = safeString_(page.nextPageToken || '');
  } while (token);
  return out;
}

function stripAnyonePermissionsTreeV45_(rootId) {
  if (!rootId) return { checked: 0, publicFound: 0, permissionsRemoved: 0, truncated: false };
  var queue = [rootId];
  var seen = {};
  var checked = 0;
  var publicFound = 0;
  var removed = 0;
  var max = GES_PRIVATE_SYSTEM_V45.MAX_PERMISSION_SCAN_ITEMS;

  while (queue.length && checked < max) {
    var id = queue.shift();
    if (!id || seen[id]) continue;
    seen[id] = true;
    checked++;

    var perms = anyonePermissionsV45_(id);
    if (perms.length) {
      publicFound++;
      removed += removeAnyonePermissionsV45_(id).length;
    }

    var meta = null;
    try { meta = driveGetFileMetaV45_(id); } catch (ignore) {}
    if (meta && meta.mimeType === 'application/vnd.google-apps.folder') {
      listDirectChildrenAllV45_(id).forEach(function(child) {
        if (child && child.id && !seen[child.id]) queue.push(child.id);
      });
    }
  }

  return {
    checked: checked,
    publicFound: publicFound,
    permissionsRemoved: removed,
    truncated: queue.length > 0
  };
}

function driveGetFileMetaV45_(fileId) {
  return apiFetchJson_(
    'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) +
    '?fields=' + encodeURIComponent('id,name,mimeType,parents,webViewLink,description,modifiedTime,trashed,capabilities(canEdit,canMoveItemWithinDrive,canShare)') +
    '&supportsAllDrives=true',
    { method: 'get' }
  );
}

function findExactChildFoldersV45_(parentFolder, name) {
  var it = parentFolder.getFoldersByName(name);
  var out = [];
  while (it.hasNext()) out.push(it.next());
  return out;
}

function resolveFolderByStoredOrExactNameV45_(storedId, parentFolder, exactName) {
  if (storedId) {
    try {
      var stored = DriveApp.getFolderById(storedId);
      if (!parentFolder || isFolderDirectlyInFolder_(stored, parentFolder)) {
        return { status: 'FOUND', folder: stored, method: 'STORED_ID', duplicates: 0 };
      }
    } catch (ignore) {}
  }
  if (!parentFolder) return { status: 'MISSING', folder: null, method: 'NO_PARENT', duplicates: 0 };
  var found = findExactChildFoldersV45_(parentFolder, exactName);
  if (found.length > 1) return { status: 'CONFLICT', folder: null, method: 'DUPLICATE_NAME', duplicates: found.length };
  if (found.length === 1) return { status: 'FOUND', folder: found[0], method: 'EXACT_NAME', duplicates: 0 };
  return { status: 'MISSING', folder: null, method: 'NOT_FOUND', duplicates: 0 };
}

function inspectGlobalPrivateSystemV45_(project) {
  project = project || {};
  var state = normalizePrivateStorageStateV45_(project.privateStorage);
  var myDrive = DriveApp.getRootFolder();
  var storedRootId = state.rootFolderId || getStoredPrivateSystemRootIdV45_();
  var root = resolveFolderByStoredOrExactNameV45_(storedRootId, myDrive, GES_PRIVATE_SYSTEM_V45.ROOT_NAME);
  var projects = { status: 'MISSING', folder: null, method: 'ROOT_MISSING', duplicates: 0 };
  var system = { status: 'MISSING', folder: null, method: 'ROOT_MISSING', duplicates: 0 };
  var projectFolder = { status: 'MISSING', folder: null, method: 'PROJECTS_MISSING', duplicates: 0 };
  var legacyArchive = { status: 'MISSING', folder: null, method: 'PROJECT_FOLDER_MISSING', duplicates: 0 };
  var entityArchive = { status: 'MISSING', folder: null, method: 'LEGACY_ARCHIVE_MISSING', duplicates: 0 };
  var formsArchive = { status: 'MISSING', folder: null, method: 'LEGACY_ARCHIVE_MISSING', duplicates: 0 };

  if (root.folder) {
    projects = resolveFolderByStoredOrExactNameV45_(state.projectsFolderId, root.folder, GES_PRIVATE_SYSTEM_V45.PROJECTS_FOLDER_NAME);
    system = resolveFolderByStoredOrExactNameV45_(state.systemFolderId, root.folder, GES_PRIVATE_SYSTEM_V45.SYSTEM_FOLDER_NAME);
  }
  if (projects.folder && project.projectId) {
    projectFolder = resolveFolderByStoredOrExactNameV45_(state.projectFolderId, projects.folder, project.projectId);
  }
  if (projectFolder.folder) {
    legacyArchive = resolveFolderByStoredOrExactNameV45_(state.legacyArchiveFolderId, projectFolder.folder, GES_PRIVATE_SYSTEM_V45.LEGACY_ARCHIVE_FOLDER_NAME);
  }
  if (legacyArchive.folder) {
    entityArchive = resolveFolderByStoredOrExactNameV45_(state.entityDataArchiveFolderId, legacyArchive.folder, GES_PRIVATE_SYSTEM_V45.ENTITY_DATA_FOLDER_NAME);
    formsArchive = resolveFolderByStoredOrExactNameV45_(state.formsArchiveFolderId, legacyArchive.folder, GES_PRIVATE_SYSTEM_V45.FORMS_ARCHIVE_FOLDER_NAME);
  }

  return {
    root: root,
    projects: projects,
    system: system,
    projectFolder: projectFolder,
    legacyArchive: legacyArchive,
    entityArchive: entityArchive,
    formsArchive: formsArchive
  };
}

function ensureChildFolderV45_(parent, name) {
  var found = findExactChildFoldersV45_(parent, name);
  if (found.length > 1) throw new Error('PRIVATE_STORAGE_FOLDER_CONFLICT_' + name.replace(/\W+/g, '_').toUpperCase());
  return found.length === 1 ? found[0] : parent.createFolder(name);
}

function ensureProjectPrivateHierarchyV45_(project, options) {
  options = options || {};
  var state = normalizePrivateStorageStateV45_(project.privateStorage);
  var myDrive = DriveApp.getRootFolder();
  var rootResolve = resolveFolderByStoredOrExactNameV45_(state.rootFolderId || getStoredPrivateSystemRootIdV45_(), myDrive, GES_PRIVATE_SYSTEM_V45.ROOT_NAME);
  if (rootResolve.status === 'CONFLICT') throw new Error('PRIVATE_SYSTEM_ROOT_CONFLICT');
  var root = rootResolve.folder || myDrive.createFolder(GES_PRIVATE_SYSTEM_V45.ROOT_NAME);
  savePrivateSystemRootIdV45_(root.getId());

  var projects = ensureChildFolderV45_(root, GES_PRIVATE_SYSTEM_V45.PROJECTS_FOLDER_NAME);
  var system = ensureChildFolderV45_(root, GES_PRIVATE_SYSTEM_V45.SYSTEM_FOLDER_NAME);
  var projectFolder = ensureChildFolderV45_(projects, project.projectId);
  var hasLegacy = !!(project.folders && (project.folders.sheetsFolderId || project.folders.formsFolderId));
  var createLegacyArchive = options.createLegacyArchive === true || hasLegacy;
  var legacyArchive = null;
  var entityArchive = null;
  var formsArchive = null;
  if (createLegacyArchive) {
    legacyArchive = ensureChildFolderV45_(projectFolder, GES_PRIVATE_SYSTEM_V45.LEGACY_ARCHIVE_FOLDER_NAME);
    if (project.folders && project.folders.sheetsFolderId) {
      entityArchive = ensureChildFolderV45_(legacyArchive, GES_PRIVATE_SYSTEM_V45.ENTITY_DATA_FOLDER_NAME);
    }
    if (project.folders && project.folders.formsFolderId) {
      formsArchive = ensureChildFolderV45_(legacyArchive, GES_PRIVATE_SYSTEM_V45.FORMS_ARCHIVE_FOLDER_NAME);
    }
  }

  // The private hierarchy itself must never carry an anyone permission.
  [root, projects, system, projectFolder, legacyArchive, entityArchive, formsArchive].filter(Boolean).forEach(function(folder) {
    try { removeAnyonePermissionsV45_(folder.getId()); } catch (ignore) {}
  });

  state.rootFolderId = root.getId();
  state.projectsFolderId = projects.getId();
  state.systemFolderId = system.getId();
  state.projectFolderId = projectFolder.getId();
  state.legacyArchiveFolderId = legacyArchive ? legacyArchive.getId() : safeString_(state.legacyArchiveFolderId || '');
  state.entityDataArchiveFolderId = entityArchive ? entityArchive.getId() : safeString_(state.entityDataArchiveFolderId || '');
  state.formsArchiveFolderId = formsArchive ? formsArchive.getId() : safeString_(state.formsArchiveFolderId || '');
  project.privateStorage = state;

  return {
    root: root,
    projects: projects,
    system: system,
    projectFolder: projectFolder,
    legacyArchive: legacyArchive,
    entityArchive: entityArchive,
    formsArchive: formsArchive
  };
}

function provisionPrivateSystemStorageForNewProjectV45_(project) {
  if (!project) throw new Error('PROJECT_REQUIRED');
  var hierarchy = ensureProjectPrivateHierarchyV45_(project, { createLegacyArchive: false });
  project.privateStorage = normalizePrivateStorageStateV45_(project.privateStorage);
  project.privateStorage.status = 'CONFIGURED';
  project.privateStorage.lastError = '';
  return hierarchy;
}

function getRegistryParentFolderV45_(project) {
  project = project || {};
  var state = normalizePrivateStorageStateV45_(project.privateStorage);
  if (state.projectFolderId) {
    try { return DriveApp.getFolderById(state.projectFolderId); } catch (ignore) {}
  }
  return null;
}

function shouldScanLegacyFolderV45_(project, folderKey) {
  project = project || {};
  var state = normalizePrivateStorageStateV45_(project.privateStorage);
  var retired = state.entityRetirement && state.entityRetirement.runtimeScanDisabled;
  if (!retired) return true;
  var key = safeString_(folderKey).toUpperCase();
  if (key === 'SHEETS' || key === 'FORMS') return false;
  return true;
}

function isLegacyEntityDataFileV45_(project, file) {
  if (!file) return false;
  try {
    if (file.getMimeType() !== V3_CONFIG.MIME.GOOGLE_SHEETS) return false;
  } catch (e) { return false; }
  if (project && project.registrySheetId && file.getId() === project.registrySheetId) return false;
  var name = safeString_(file.getName());
  if (/\sEntity Data$/i.test(name)) return true;
  var description = safeString_(file.getDescription() || '');
  var meta = readV3Meta_(description);
  if (safeString_(meta.ASSET_TYPE).toUpperCase() === 'SHEET') return true;
  if (description.indexOf(V3_CONFIG.LEGACY_V2_TYPE_MARKER + 'SHEET') !== -1) return true;
  return false;
}

function listLegacyEntityDataFilesV45_(project) {
  var out = [];
  var folderId = project && project.folders && project.folders.sheetsFolderId || '';
  if (!folderId) return out;
  var queue = [folderId];
  var seenFolders = {};
  var seenFiles = {};
  var checked = 0;
  var max = GES_PRIVATE_SYSTEM_V45.MAX_PERMISSION_SCAN_ITEMS;
  try {
    while (queue.length && checked < max) {
      var current = queue.shift();
      if (!current || seenFolders[current]) continue;
      seenFolders[current] = true;
      checked++;
      listDirectChildrenAllV45_(current).forEach(function(meta) {
        if (!meta || !meta.id) return;
        if (meta.mimeType === 'application/vnd.google-apps.folder') {
          if (!seenFolders[meta.id]) queue.push(meta.id);
          return;
        }
        if (meta.mimeType !== V3_CONFIG.MIME.GOOGLE_SHEETS || seenFiles[meta.id]) return;
        seenFiles[meta.id] = true;
        try {
          var file = DriveApp.getFileById(meta.id);
          if (isLegacyEntityDataFileV45_(project, file)) out.push(file);
        } catch (ignoreFile) {}
      });
    }
  } catch (ignore) {}
  return out;
}

function inferEntityDataSourceV45_(project, file, keyFacts) {
  keyFacts = keyFacts || {};
  var sourceUrl = safeString_(keyFacts['Source Doc'] || '');
  var sourceId = extractDriveId_(sourceUrl);
  if (sourceId) {
    try {
      var sourceFile = DriveApp.getFileById(sourceId);
      return { sourceDocId: sourceId, sourceDocName: sourceFile.getName(), sourceDocUrl: sourceFile.getUrl(), method: 'KEY_FACTS_SOURCE_DOC' };
    } catch (ignore0) {}
  }

  var description = safeString_(file.getDescription() || '');
  var meta = readV3Meta_(description);
  sourceId = safeString_(meta.SOURCE_DOC_ID || extractLegacyV2SourceId_(description) || '');
  if (sourceId) {
    try {
      var markedSource = DriveApp.getFileById(sourceId);
      return { sourceDocId: sourceId, sourceDocName: markedSource.getName(), sourceDocUrl: markedSource.getUrl(), method: 'DRIVE_MARKER' };
    } catch (ignore1) {}
  }

  var expectedName = safeString_(file.getName()).replace(/\sEntity Data$/i, '');
  var exact = getSourceDocs_(project).filter(function(doc) {
    return normalizeExactMatchKeyV41_(doc.getName()) === normalizeExactMatchKeyV41_(expectedName);
  });
  if (exact.length === 1) {
    return { sourceDocId: exact[0].getId(), sourceDocName: exact[0].getName(), sourceDocUrl: exact[0].getUrl(), method: 'EXACT_NAME' };
  }
  return { sourceDocId: '', sourceDocName: expectedName, sourceDocUrl: sourceUrl, method: exact.length > 1 ? 'EXACT_NAME_DUPLICATE' : 'UNRESOLVED' };
}

function readLegacyEntityKeyFactsV45_(spreadsheetId) {
  var out = {};
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sh = ss.getSheetByName('Key Facts');
    if (!sh || sh.getLastRow() < 2) return out;
    var values = sh.getRange(2, 1, sh.getLastRow() - 1, Math.min(2, Math.max(2, sh.getLastColumn()))).getDisplayValues();
    values.forEach(function(row) {
      var key = safeString_(row[0]).trim();
      if (key) out[key] = safeString_(row[1]);
    });
  } catch (ignore) {}
  return out;
}

function entityIndexKeyV45_(projectId, legacyFileId) {
  return [safeString_(projectId), safeString_(legacyFileId)].join('|');
}

function buildLegacyEntityIndexRecordV45_(project, file, archivedFolderId) {
  var facts = readLegacyEntityKeyFactsV45_(file.getId());
  var source = inferEntityDataSourceV45_(project, file, facts);
  return {
    key: entityIndexKeyV45_(project.projectId, file.getId()),
    projectId: project.projectId,
    sourceDocId: source.sourceDocId,
    sourceDocName: source.sourceDocName,
    legacyEntitySheetId: file.getId(),
    legacyEntitySheetName: file.getName(),
    contentFingerprint: safeString_(facts['Content Fingerprint'] || ''),
    entityFingerprint: safeString_(facts['Entity Fingerprint'] || ''),
    generatedBy: safeString_(facts['Generated By'] || ''),
    sourceDocUrl: source.sourceDocUrl,
    resolutionMethod: source.method,
    legacyFolderId: archivedFolderId || getDirectParentId_(file),
    lifecycle: 'ARCHIVED_LEGACY',
    archivedAt: nowIso_(),
    lastVerified: nowIso_(),
    notes: 'V4.5 private archive; runtime generation retired.'
  };
}

function upsertEntityIndexRecordV45_(project, record) {
  if (!project.registrySheetId) return;
  var ss = SpreadsheetApp.openById(project.registrySheetId);
  var headers = V45_ENTITY_INDEX_HEADERS;
  var sh = ensureSheetWithHeaders_(ss, V3_CONFIG.REGISTRY_TABS.ENTITY_INDEX, headers);
  var map = buildKeyRowMap_(sh);
  var row = [
    record.key, record.projectId, record.sourceDocId, record.sourceDocName,
    record.legacyEntitySheetId, record.legacyEntitySheetName,
    record.contentFingerprint, record.entityFingerprint, record.generatedBy,
    record.sourceDocUrl, record.resolutionMethod, record.legacyFolderId,
    record.lifecycle, record.archivedAt, record.lastVerified, record.notes
  ];
  if (map[record.key]) sh.getRange(map[record.key], 1, 1, headers.length).setValues([row]);
  else sh.appendRow(row);
}

function flattenEntityProfileV45_(value, prefix, out) {
  out = out || [];
  prefix = prefix || '';
  if (Array.isArray(value)) {
    out.push([prefix, JSON.stringify(value)]);
    return out;
  }
  if (value && typeof value === 'object') {
    Object.keys(value).sort().forEach(function(key) {
      if (key === 'provenance' || key === 'updatedAt') return;
      var next = prefix ? prefix + '.' + key : key;
      flattenEntityProfileV45_(value[key], next, out);
    });
    return out;
  }
  out.push([prefix, value === undefined || value === null ? '' : String(value)]);
  return out;
}

function syncEntityConfigV45_(project) {
  if (!project || !project.registrySheetId) return { rows: 0 };
  var profile = buildEntityProfileV4(project.projectId);
  var ss = SpreadsheetApp.openById(project.registrySheetId);
  var sh = ensureSheetWithHeaders_(ss, V3_CONFIG.REGISTRY_TABS.ENTITY_CONFIG, V45_ENTITY_CONFIG_HEADERS);
  var rows = flattenEntityProfileV45_(profile, '', []).filter(function(row) { return !!row[0]; }).map(function(row) {
    return [row[0], row[1], 'PROJECT_PROFILE_DERIVED', nowIso_()];
  });
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, V45_ENTITY_CONFIG_HEADERS.length).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, V45_ENTITY_CONFIG_HEADERS.length).setValues(rows);
  return { rows: rows.length, fingerprint: profile.fingerprint };
}

function markLegacyRegistryRowsArchivedV45_(project) {
  if (!project.registrySheetId) return 0;
  var ss = SpreadsheetApp.openById(project.registrySheetId);
  var sh = ss.getSheetByName(V3_CONFIG.REGISTRY_TABS.ASSETS);
  if (!sh || sh.getLastRow() < 2) return 0;
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, V3_ASSET_HEADERS.length).getValues();
  var legacyFolderIds = [
    project.folders && project.folders.sheetsFolderId || '',
    project.folders && project.folders.formsFolderId || ''
  ].filter(Boolean);
  var changed = 0;
  rows.forEach(function(row, index) {
    var type = safeString_(row[5]).toUpperCase();
    var folderId = safeString_(row[9]);
    if ((type === 'SHEET' || type === 'FORM') && legacyFolderIds.indexOf(folderId) !== -1) {
      sh.getRange(index + 2, 16).setValue('ARCHIVED_LEGACY');
      sh.getRange(index + 2, 20).setValue(nowIso_());
      changed++;
    }
  });
  return changed;
}

function previewPrivateSystemStorageV45(projectId) {
  var project = projectId ? getProject_(projectId) : getActiveProject_();
  if (!project) throw new Error('NO_ACTIVE_PROJECT');
  project.privateStorage = normalizePrivateStorageStateV45_(project.privateStorage);
  var inspection = inspectGlobalPrivateSystemV45_(project);
  var blockers = [];
  var warnings = [];
  ['root','projects','system','projectFolder','legacyArchive','entityArchive','formsArchive'].forEach(function(key) {
    if (inspection[key] && inspection[key].status === 'CONFLICT') blockers.push('DUPLICATE_PRIVATE_FOLDER_' + key.toUpperCase());
  });

  var registry = { exists: false, id: project.registrySheetId || '', name: '', parentIds: [], public: false, capabilities: {} };
  if (project.registrySheetId) {
    try {
      var registryMeta = driveGetFileMetaV45_(project.registrySheetId);
      registry = {
        exists: true,
        id: registryMeta.id,
        name: registryMeta.name,
        parentIds: registryMeta.parents || [],
        public: isDriveItemPublicV45_(registryMeta.id),
        capabilities: registryMeta.capabilities || {}
      };
      if (registry.capabilities.canEdit === false || registry.capabilities.canMoveItemWithinDrive === false) {
        blockers.push('REGISTRY_CANNOT_BE_MOVED_BY_CURRENT_USER');
      }
      if (registry.public && registry.capabilities.canShare === false) blockers.push('REGISTRY_PUBLIC_BUT_CANNOT_UNSHARE');
    } catch (e) {
      blockers.push('REGISTRY_NOT_ACCESSIBLE');
    }
  } else {
    warnings.push('REGISTRY_MISSING_WILL_BE_CREATED_PRIVATE');
  }

  function legacyFolderPreview(key, id) {
    if (!id) return { key: key, exists: false, id: '', files: 0, folders: 0, public: false, capabilities: {} };
    try {
      var meta = driveGetFileMetaV45_(id);
      var children = listDirectChildrenAllV45_(id);
      var result = {
        key: key,
        exists: true,
        id: id,
        name: meta.name,
        parentIds: meta.parents || [],
        files: children.filter(function(x) { return x.mimeType !== 'application/vnd.google-apps.folder'; }).length,
        folders: children.filter(function(x) { return x.mimeType === 'application/vnd.google-apps.folder'; }).length,
        public: isDriveItemPublicV45_(id),
        capabilities: meta.capabilities || {}
      };
      if (result.capabilities.canEdit === false || result.capabilities.canMoveItemWithinDrive === false) {
        blockers.push('LEGACY_' + key + '_CANNOT_BE_MOVED_BY_CURRENT_USER');
      }
      if (result.public && result.capabilities.canShare === false) blockers.push('LEGACY_' + key + '_PUBLIC_BUT_CANNOT_UNSHARE');
      return result;
    } catch (e) {
      warnings.push('LEGACY_' + key + '_FOLDER_NOT_ACCESSIBLE');
      return { key: key, exists: false, id: id, error: safeString_(e && e.message || e) };
    }
  }

  var legacySheets = legacyFolderPreview('SHEETS', project.folders && project.folders.sheetsFolderId || '');
  var legacyForms = legacyFolderPreview('FORMS', project.folders && project.folders.formsFolderId || '');
  var entityFiles = listLegacyEntityDataFilesV45_(project).map(function(file) {
    return { id: file.getId(), name: file.getName(), url: file.getUrl(), public: isDriveItemPublicV45_(file.getId()) };
  });

  var hierarchySummary = {
    root: privateFolderSummaryV45_(inspection.root),
    projects: privateFolderSummaryV45_(inspection.projects),
    system: privateFolderSummaryV45_(inspection.system),
    projectFolder: privateFolderSummaryV45_(inspection.projectFolder),
    legacyArchive: privateFolderSummaryV45_(inspection.legacyArchive),
    entityArchive: privateFolderSummaryV45_(inspection.entityArchive),
    formsArchive: privateFolderSummaryV45_(inspection.formsArchive)
  };

  var actions = [];
  Object.keys(hierarchySummary).forEach(function(key) {
    var item = hierarchySummary[key];
    if (!item.id || !item.public) return;
    actions.push({ action: 'REMOVE_ANYONE_PERMISSION', targetId: item.id, targetName: item.name, scope: 'PRIVATE_HIERARCHY' });
    if (item.capabilities && item.capabilities.canShare === false) blockers.push('PRIVATE_FOLDER_PUBLIC_BUT_CANNOT_UNSHARE_' + key.toUpperCase());
  });
  if (inspection.root.status === 'MISSING') actions.push({ action: 'CREATE_FOLDER', target: GES_PRIVATE_SYSTEM_V45.ROOT_NAME });
  if (inspection.projects.status === 'MISSING') actions.push({ action: 'CREATE_FOLDER', target: GES_PRIVATE_SYSTEM_V45.PROJECTS_FOLDER_NAME });
  if (inspection.system.status === 'MISSING') actions.push({ action: 'CREATE_FOLDER', target: GES_PRIVATE_SYSTEM_V45.SYSTEM_FOLDER_NAME });
  if (inspection.projectFolder.status === 'MISSING') actions.push({ action: 'CREATE_PROJECT_PRIVATE_FOLDER', target: project.projectId });
  var hasLegacyArchiveNeed = !!(legacySheets.exists || legacyForms.exists);
  if (hasLegacyArchiveNeed && inspection.legacyArchive.status === 'MISSING') actions.push({ action: 'CREATE_FOLDER', target: GES_PRIVATE_SYSTEM_V45.LEGACY_ARCHIVE_FOLDER_NAME });
  if (legacySheets.exists && inspection.entityArchive.status === 'MISSING') actions.push({ action: 'CREATE_FOLDER', target: GES_PRIVATE_SYSTEM_V45.ENTITY_DATA_FOLDER_NAME });
  if (legacyForms.exists && inspection.formsArchive.status === 'MISSING') actions.push({ action: 'CREATE_FOLDER', target: GES_PRIVATE_SYSTEM_V45.FORMS_ARCHIVE_FOLDER_NAME });
  if (registry.exists && (!inspection.projectFolder.folder || registry.parentIds.indexOf(inspection.projectFolder.folder.getId()) === -1)) {
    actions.push({ action: 'MOVE_REGISTRY_KEEP_ID', targetId: registry.id, targetName: registry.name });
  }
  if (registry.public) actions.push({ action: 'REMOVE_ANYONE_PERMISSION', targetId: registry.id, targetName: registry.name });
  if (legacySheets.exists) actions.push({ action: 'MOVE_LEGACY_SHEETS_FOLDER_KEEP_ID', targetId: legacySheets.id, targetName: legacySheets.name });
  if (legacyForms.exists) actions.push({ action: 'MOVE_LEGACY_FORMS_FOLDER_KEEP_ID', targetId: legacyForms.id, targetName: legacyForms.name });
  if (entityFiles.length) actions.push({ action: 'INDEX_LEGACY_ENTITY_DATA', count: entityFiles.length });
  actions.push({ action: 'SYNC_ENTITY_CONFIG' });
  actions.push({ action: 'VERIFY_PRIVATE_STORAGE' });

  project.privateStorage.lastPreviewAt = nowIso_();
  return {
    success: blockers.length === 0,
    version: GES_PRIVATE_SYSTEM_V45.VERSION,
    policy: GES_PRIVATE_SYSTEM_V45.MIGRATION_POLICY,
    projectId: project.projectId,
    projectName: project.projectName,
    state: cloneJson_(project.privateStorage),
    hierarchy: hierarchySummary,
    registry: registry,
    legacySheets: legacySheets,
    legacyForms: legacyForms,
    legacyEntityData: { count: entityFiles.length, files: entityFiles },
    actions: actions,
    blockers: blockers,
    warnings: warnings,
    destructiveActions: [],
    preservesDriveIds: true,
    autoDelete: false
  };
}

function privateFolderSummaryV45_(resolution) {
  resolution = resolution || {};
  var id = resolution.folder ? resolution.folder.getId() : '';
  var capabilities = id ? (driveItemCapabilitiesV45_(id).capabilities || {}) : {};
  return {
    status: resolution.status || 'MISSING',
    method: resolution.method || '',
    duplicates: Number(resolution.duplicates || 0),
    id: id,
    name: resolution.folder ? resolution.folder.getName() : '',
    url: resolution.folder ? resolution.folder.getUrl() : '',
    public: id ? isDriveItemPublicV45_(id) : false,
    capabilities: capabilities
  };
}

function previewActivePrivateSystemStorageV45() {
  return previewPrivateSystemStorageV45('');
}

function applyPrivateSystemStorageV45(projectId) {
  var project = projectId ? getProject_(projectId) : getActiveProject_();
  if (!project) throw new Error('NO_ACTIVE_PROJECT');
  assertProjectWritable_(project);

  var preview = previewPrivateSystemStorageV45(project.projectId);
  if (preview.blockers && preview.blockers.length) {
    throw new Error('PRIVATE_STORAGE_BLOCKED: ' + preview.blockers.join(', '));
  }

  project.privateStorage = normalizePrivateStorageStateV45_(project.privateStorage);
  project.privateStorage.status = 'APPLYING';
  project.privateStorage.lastError = '';
  project = saveProject_(project);

  var result = {
    success: false,
    projectId: project.projectId,
    moved: [],
    permissions: [],
    entityIndex: { indexed: 0 },
    entityConfig: { rows: 0 },
    warnings: []
  };

  try {
    var hierarchy = ensureProjectPrivateHierarchyV45_(project, { createLegacyArchive: true });

    // Registry: move, preserve ID, then remove public-anyone permissions only.
    if (!project.registrySheetId) {
      project.privateStorage = normalizePrivateStorageStateV45_(project.privateStorage);
      project.privateStorage.projectFolderId = hierarchy.projectFolder.getId();
      project = saveProject_(project);
      ensureRegistrySpreadsheet_(project);
    }
    var registryFile = DriveApp.getFileById(project.registrySheetId);
    if (!isFileDirectlyInFolder_(registryFile, hierarchy.projectFolder)) {
      registryFile.moveTo(hierarchy.projectFolder);
      result.moved.push({ type: 'REGISTRY', id: registryFile.getId(), name: registryFile.getName(), keepId: true });
    }
    var registryRemoved = removeAnyonePermissionsV45_(registryFile.getId());
    result.permissions.push({ id: registryFile.getId(), removedAnyonePermissions: registryRemoved.length });

    // Retired legacy Sheets: move the whole folder under private Entity Data.
    var sheetsId = project.folders && project.folders.sheetsFolderId || '';
    if (sheetsId) {
      try {
        var sheetsFolder = DriveApp.getFolderById(sheetsId);
        if (!isFolderDirectlyInFolder_(sheetsFolder, hierarchy.entityArchive)) {
          sheetsFolder.moveTo(hierarchy.entityArchive);
          result.moved.push({ type: 'LEGACY_SHEETS_FOLDER', id: sheetsFolder.getId(), name: sheetsFolder.getName(), keepId: true });
        }
        var sheetPrivacy = stripAnyonePermissionsTreeV45_(sheetsFolder.getId());
        result.permissions.push({ id: sheetsFolder.getId(), tree: sheetPrivacy });
        project.privateStorage.legacySheetsMoved = true;
      } catch (sheetError) {
        result.warnings.push('LEGACY_SHEETS_MOVE_WARNING: ' + safeString_(sheetError && sheetError.message || sheetError));
      }
    }

    // Retired legacy Forms: preserve in private archive as well.
    var formsId = project.folders && project.folders.formsFolderId || '';
    if (formsId) {
      try {
        var formsFolder = DriveApp.getFolderById(formsId);
        if (!isFolderDirectlyInFolder_(formsFolder, hierarchy.formsArchive)) {
          formsFolder.moveTo(hierarchy.formsArchive);
          result.moved.push({ type: 'LEGACY_FORMS_FOLDER', id: formsFolder.getId(), name: formsFolder.getName(), keepId: true });
        }
        var formPrivacy = stripAnyonePermissionsTreeV45_(formsFolder.getId());
        result.permissions.push({ id: formsFolder.getId(), tree: formPrivacy });
        project.privateStorage.legacyFormsMoved = true;
      } catch (formError) {
        result.warnings.push('LEGACY_FORMS_MOVE_WARNING: ' + safeString_(formError && formError.message || formError));
      }
    }

    // Archive index is metadata-only. Full Sections/FAQ/Links/Tables are not copied.
    var entityFiles = listLegacyEntityDataFilesV45_(project);
    entityFiles.forEach(function(file) {
      upsertEntityIndexRecordV45_(project, buildLegacyEntityIndexRecordV45_(project, file, sheetsId));
      result.entityIndex.indexed++;
    });

    result.entityConfig = syncEntityConfigV45_(project);
    var archivedRows = markLegacyRegistryRowsArchivedV45_(project);

    project.privateStorage = normalizePrivateStorageStateV45_(project.privateStorage);
    project.privateStorage.rootFolderId = hierarchy.root.getId();
    project.privateStorage.projectsFolderId = hierarchy.projects.getId();
    project.privateStorage.systemFolderId = hierarchy.system.getId();
    project.privateStorage.projectFolderId = hierarchy.projectFolder.getId();
    project.privateStorage.legacyArchiveFolderId = hierarchy.legacyArchive ? hierarchy.legacyArchive.getId() : '';
    project.privateStorage.entityDataArchiveFolderId = hierarchy.entityArchive ? hierarchy.entityArchive.getId() : '';
    project.privateStorage.formsArchiveFolderId = hierarchy.formsArchive ? hierarchy.formsArchive.getId() : '';
    project.privateStorage.registryMoved = isFileDirectlyInFolder_(registryFile, hierarchy.projectFolder);
    project.privateStorage.registryPrivate = !isDriveItemPublicV45_(registryFile.getId());
    project.privateStorage.entityRetirement.status = 'ARCHIVED';
    project.privateStorage.entityRetirement.indexedFiles = result.entityIndex.indexed;
    project.privateStorage.entityRetirement.archivedFiles = result.entityIndex.indexed;
    project.privateStorage.entityRetirement.runtimeScanDisabled = true;
    project.privateStorage.entityRetirement.lastIndexedAt = nowIso_();
    project.privateStorage.status = 'APPLIED';
    project.privateStorage.appliedAt = nowIso_();
    project.privateStorage.lastError = '';
    project.privateStorage.warnings = result.warnings.slice();
    project = saveProject_(project);
    syncProjectConfigSheet_(project);

    result.archivedRegistryRows = archivedRows;
    result.verification = verifyPrivateSystemStorageV45(project.projectId);
    result.success = !!result.verification.success;

    try {
      logEvent_(project.projectId, 'PRIVATE_SYSTEM_STORAGE_V45_APPLY', {
        result: result.success ? 'SUCCESS' : 'WARNING',
        moved: result.moved.length,
        entityIndexed: result.entityIndex.indexed,
        registryPrivate: result.verification.registry && result.verification.registry.private
      });
    } catch (ignoreLog) {}
    return result;
  } catch (e) {
    project = getProject_(project.projectId) || project;
    project.privateStorage = normalizePrivateStorageStateV45_(project.privateStorage);
    project.privateStorage.status = 'ERROR';
    project.privateStorage.lastError = safeString_(e && e.message || e);
    saveProject_(project);
    try { syncProjectConfigSheet_(project); } catch (ignoreConfig) {}
    throw e;
  }
}

function applyActivePrivateSystemStorageV45() {
  return applyPrivateSystemStorageV45('');
}

function verifyPrivateSystemStorageV45(projectId) {
  var project = projectId ? getProject_(projectId) : getActiveProject_();
  if (!project) throw new Error('NO_ACTIVE_PROJECT');
  project.privateStorage = normalizePrivateStorageStateV45_(project.privateStorage);
  var state = project.privateStorage;
  var errors = [];
  var warnings = [];

  var hierarchy = inspectGlobalPrivateSystemV45_(project);
  ['root','projects','projectFolder'].forEach(function(key) {
    if (!hierarchy[key] || !hierarchy[key].folder) errors.push('PRIVATE_FOLDER_MISSING_' + key.toUpperCase());
  });
  var hasLegacySheets = !!(project.folders && project.folders.sheetsFolderId);
  var hasLegacyForms = !!(project.folders && project.folders.formsFolderId);
  if ((hasLegacySheets || hasLegacyForms) && (!hierarchy.legacyArchive || !hierarchy.legacyArchive.folder)) errors.push('PRIVATE_FOLDER_MISSING_LEGACYARCHIVE');
  if (hasLegacySheets && (!hierarchy.entityArchive || !hierarchy.entityArchive.folder)) errors.push('PRIVATE_FOLDER_MISSING_ENTITYARCHIVE');
  if (hasLegacyForms && (!hierarchy.formsArchive || !hierarchy.formsArchive.folder)) errors.push('PRIVATE_FOLDER_MISSING_FORMSARCHIVE');

  var registry = { exists: false, private: false, correctParent: false, id: project.registrySheetId || '' };
  if (!project.registrySheetId) {
    errors.push('REGISTRY_MISSING');
  } else {
    try {
      var registryMeta = driveGetFileMetaV45_(project.registrySheetId);
      registry.exists = true;
      registry.private = !isDriveItemPublicV45_(project.registrySheetId);
      registry.correctParent = !!(hierarchy.projectFolder.folder && (registryMeta.parents || []).indexOf(hierarchy.projectFolder.folder.getId()) !== -1);
      registry.name = registryMeta.name;
      registry.parentIds = registryMeta.parents || [];
      if (!registry.private) errors.push('REGISTRY_STILL_PUBLIC');
      if (!registry.correctParent) errors.push('REGISTRY_NOT_IN_PRIVATE_PROJECT_FOLDER');
    } catch (e) {
      errors.push('REGISTRY_NOT_ACCESSIBLE');
    }
  }

  function verifyLegacyFolder(id, expectedParent, code) {
    if (!id) return { configured: false, exists: false, private: true, correctParent: true, descendantsPublic: 0 };
    var out = { configured: true, exists: false, private: false, correctParent: false, descendantsPublic: 0 };
    try {
      var meta = driveGetFileMetaV45_(id);
      out.exists = true;
      out.private = !isDriveItemPublicV45_(id);
      out.correctParent = !!(expectedParent && (meta.parents || []).indexOf(expectedParent.getId()) !== -1);
      var publicDesc = countPublicItemsInTreeV45_(id);
      out.descendantsPublic = publicDesc.publicItems;
      out.scanned = publicDesc.checked;
      out.truncated = publicDesc.truncated;
      if (!out.private || out.descendantsPublic) errors.push(code + '_PUBLIC_PERMISSION_REMAINS');
      if (!out.correctParent) errors.push(code + '_WRONG_PRIVATE_PARENT');
      if (out.truncated) warnings.push(code + '_PRIVACY_SCAN_TRUNCATED');
    } catch (e) {
      errors.push(code + '_NOT_ACCESSIBLE');
    }
    return out;
  }

  var legacySheets = verifyLegacyFolder(project.folders && project.folders.sheetsFolderId || '', hierarchy.entityArchive.folder, 'LEGACY_SHEETS');
  var legacyForms = verifyLegacyFolder(project.folders && project.folders.formsFolderId || '', hierarchy.formsArchive.folder, 'LEGACY_FORMS');

  var entityIndex = { rows: 0, archived: 0 };
  try {
    var ss = SpreadsheetApp.openById(project.registrySheetId);
    var indexSheet = ss.getSheetByName(V3_CONFIG.REGISTRY_TABS.ENTITY_INDEX);
    var configSheet = ss.getSheetByName(V3_CONFIG.REGISTRY_TABS.ENTITY_CONFIG);
    if (!indexSheet) errors.push('ENTITY_INDEX_TAB_MISSING');
    if (!configSheet) errors.push('ENTITY_CONFIG_TAB_MISSING');
    if (indexSheet && indexSheet.getLastRow() > 1) {
      entityIndex.rows = indexSheet.getLastRow() - 1;
      var lifecycles = indexSheet.getRange(2, 13, entityIndex.rows, 1).getDisplayValues();
      entityIndex.archived = lifecycles.filter(function(r) { return safeString_(r[0]).toUpperCase() === 'ARCHIVED_LEGACY'; }).length;
    }
  } catch (registryError) {
    errors.push('PRIVATE_REGISTRY_TABS_NOT_READABLE');
  }

  var publicSheet = { status: 'NOT_CHECKED', id: '' };
  try {
    var publicState = getProjectSingletonAssetStateV41_(project, 'PROJECT_URL_SHEET');
    publicSheet.status = publicState.status;
    publicSheet.id = publicState.id || '';
    if (publicState.id) {
      var pubMeta = driveGetFileMetaV45_(publicState.id);
      if ((pubMeta.parents || []).indexOf(project.rootFolderId) === -1) errors.push('PUBLIC_PROJECT_SHEET_MOVED_OUT_OF_PROJECT_ROOT');
    }
  } catch (publicError) {
    warnings.push('PUBLIC_SHEET_VERIFY_WARNING: ' + safeString_(publicError && publicError.message || publicError));
  }

  var calendar = { installed: typeof inspectCalendarSyncStateV4 === 'function', status: 'NOT_CHECKED' };
  if (calendar.installed) {
    try {
      var cal = inspectCalendarSyncStateV4(project.projectId);
      calendar.status = 'OK';
      calendar.calendarIdCandidates = cal.calendarIdCandidates || [];
      calendar.registry = cal.registry || {};
    } catch (calendarError) {
      warnings.push('CALENDAR_VERIFY_WARNING: ' + safeString_(calendarError && calendarError.message || calendarError));
      calendar.status = 'WARNING';
    }
  }

  var success = errors.length === 0;
  project.privateStorage = normalizePrivateStorageStateV45_(project.privateStorage);
  project.privateStorage.registryMoved = registry.correctParent;
  project.privateStorage.registryPrivate = registry.private;
  project.privateStorage.status = success ? 'VERIFIED' : (project.privateStorage.status === 'ERROR' ? 'ERROR' : 'APPLIED');
  project.privateStorage.verifiedAt = success ? nowIso_() : '';
  project.privateStorage.lastError = success ? '' : errors.join('; ');
  project.privateStorage.warnings = warnings.slice();
  project = saveProject_(project);
  try { syncProjectConfigSheet_(project); } catch (ignoreSync) {}

  return {
    success: success,
    version: GES_PRIVATE_SYSTEM_V45.VERSION,
    projectId: project.projectId,
    state: cloneJson_(project.privateStorage),
    registry: registry,
    legacySheets: legacySheets,
    legacyForms: legacyForms,
    entityIndex: entityIndex,
    publicSheet: publicSheet,
    calendar: calendar,
    errors: errors,
    warnings: warnings
  };
}

function verifyActivePrivateSystemStorageV45() {
  return verifyPrivateSystemStorageV45('');
}

function countPublicItemsInTreeV45_(rootId) {
  if (!rootId) return { checked: 0, publicItems: 0, truncated: false };
  var queue = [rootId];
  var seen = {};
  var checked = 0;
  var publicItems = 0;
  var max = GES_PRIVATE_SYSTEM_V45.MAX_PERMISSION_SCAN_ITEMS;
  while (queue.length && checked < max) {
    var id = queue.shift();
    if (!id || seen[id]) continue;
    seen[id] = true;
    checked++;
    if (isDriveItemPublicV45_(id)) publicItems++;
    var meta = null;
    try { meta = driveGetFileMetaV45_(id); } catch (ignore) {}
    if (meta && meta.mimeType === 'application/vnd.google-apps.folder') {
      listDirectChildrenAllV45_(id).forEach(function(child) {
        if (child && child.id && !seen[child.id]) queue.push(child.id);
      });
    }
  }
  return { checked: checked, publicItems: publicItems, truncated: queue.length > 0 };
}

function getPrivateStorageDashboardSummaryV45_(project) {
  project = project || getActiveProject_();
  if (!project) return { installed: true, status: 'NO_PROJECT', verified: false };
  var state = normalizePrivateStorageStateV45_(project.privateStorage);
  return {
    installed: true,
    version: GES_PRIVATE_SYSTEM_V45.VERSION,
    status: state.status,
    verified: state.status === 'VERIFIED',
    rootFolderId: state.rootFolderId,
    projectFolderId: state.projectFolderId,
    registryMoved: state.registryMoved,
    registryPrivate: state.registryPrivate,
    legacySheetsMoved: state.legacySheetsMoved,
    legacyFormsMoved: state.legacyFormsMoved,
    entityRetirement: cloneJson_(state.entityRetirement),
    lastPreviewAt: state.lastPreviewAt,
    appliedAt: state.appliedAt,
    verifiedAt: state.verifiedAt,
    lastError: state.lastError,
    warnings: state.warnings || []
  };
}
