/**
 * GES V4 Calendar V2.1 asset resolver.
 * Read-only. It never creates/moves/renames/deletes Drive assets.
 */

const GES_CALENDAR_RESOLVER_V2 = Object.freeze({
  VERSION: '2.1.1',
  FOLDER_ROLE_MAP: Object.freeze({
    PROJECT_FOLDER: 'ROOT', // rootFolderId of the current Project; Homepage may equal site/global root
    ARTICLES_FOLDER: 'ARTICLES',
    DOCX_FOLDER: 'DOCX',
    SLIDES_FOLDER: 'SLIDES',
    PDFS_FOLDER: 'PDF',
    PHOTOS_FOLDER: 'PHOTOS',
    VIDEOS_FOLDER: 'VIDEOS',
    PODCAST_FOLDER: 'PODCASTS',
    HTML_FOLDER: 'HTML'
  })
});

function buildCalendarV2AssetSnapshot_(project) {
  var keyword = getCalendarV2ProjectKeyword_(project);
  var folders = getCalendarV2FolderMap_(project);
  var exactDoc = resolveCalendarV2ExactFile_(project, folders.ARTICLES, keyword, V3_CONFIG.MIME.GOOGLE_DOCS, 'DOC');
  var exactSlides = resolveCalendarV2ExactFile_(project, folders.SLIDES, keyword, V3_CONFIG.MIME.GOOGLE_SLIDES, 'SLIDES');
  var sheet = resolveCalendarV2ProjectSingleton_(project, 'PROJECT_URL_SHEET');
  var form = resolveCalendarV2ProjectSingleton_(project, 'PROJECT_FORM');
  var drawing = resolveCalendarV21ProjectDrawing_(project);

  return {
    resolverVersion: GES_CALENDAR_RESOLVER_V2.VERSION,
    projectKeyword: keyword,
    folders: folders,
    exactMatchDoc: exactDoc,
    exactMatchSlides: exactSlides,
    projectUrlSheet: sheet,
    projectForm: form,
    projectDrawing: drawing
  };
}


/**
 * Calendar-only Drawing resolver. Project Structure V4.1 intentionally does not
 * auto-adopt legacy Drawings. Calendar V2.1.1 may safely REFERENCE one existing
 * project-scoped Drawing without changing ownership, metadata, folder or File ID.
 *
 * Resolution order:
 * 1. managed PROJECT_DRAWING singleton;
 * 2. existing Calendar Registry DRAWING/PROJECT_DRAWING assetId;
 * 3. exactly one exact-name Google Drawing directly under PROJECT_ROOT;
 * 4. otherwise keep the original DEFERRED/NEEDS_REVIEW state.
 */
function resolveCalendarV21ProjectDrawing_(project) {
  var managed = resolveCalendarV2ProjectSingleton_(project, 'PROJECT_DRAWING');
  if (managed && managed.ready) return managed;

  var registryIds = [];
  try {
    if (typeof getCalendarRegistryRowsV4 === 'function') {
      (getCalendarRegistryRowsV4(project.projectId) || []).forEach(function(row) {
        var key = safeString_(row.eventKey).toUpperCase();
        if (key !== 'DRAWING' && key !== 'PROJECT_DRAWING') return;
        var id = safeString_(row.assetId).trim();
        if (id && registryIds.indexOf(id) === -1) registryIds.push(id);
      });
    }
  } catch (ignoreRegistry) {}

  var registryFiles = [];
  registryIds.forEach(function(id) {
    try {
      var file = DriveApp.getFileById(id);
      if (file.getMimeType() === V3_CONFIG.MIME.GOOGLE_DRAWINGS) registryFiles.push(file);
    } catch (ignoreFile) {}
  });
  if (registryFiles.length === 1) {
    return calendarV2FileRecord_(registryFiles[0], 'PROJECT_DRAWING', 'LEGACY_CALENDAR_REGISTRY_REFERENCE_ONLY');
  }
  if (registryFiles.length > 1) {
    return {
      kind: 'DRIVE_FILE', assetType: 'PROJECT_DRAWING', id: '', name: '', url: '', mimeType: '',
      exists: false, ready: false, ambiguous: true, status: 'NEEDS_REVIEW',
      reason: 'MULTIPLE_LEGACY_DRAWING_REGISTRY_REFERENCES', candidateCount: registryFiles.length
    };
  }

  var keyword = getCalendarV2ProjectKeyword_(project);
  var exact = [];
  try {
    if (typeof findExactRootFilesV41_ === 'function') {
      exact = findExactRootFilesV41_(project, V3_CONFIG.MIME.GOOGLE_DRAWINGS, keyword) || [];
    } else {
      var root = DriveApp.getFolderById(project.rootFolderId);
      var it = root.getFilesByName(keyword);
      while (it.hasNext()) {
        var candidate = it.next();
        if (candidate.getMimeType() === V3_CONFIG.MIME.GOOGLE_DRAWINGS) exact.push(candidate);
      }
    }
  } catch (ignoreExact) {}

  if (exact.length === 1) {
    return calendarV2FileRecord_(exact[0], 'PROJECT_DRAWING', 'LEGACY_EXACT_REFERENCE_ONLY');
  }
  if (exact.length > 1) {
    return {
      kind: 'DRIVE_FILE', assetType: 'PROJECT_DRAWING', id: '', name: '', url: '', mimeType: '',
      exists: false, ready: false, ambiguous: true, status: 'NEEDS_REVIEW',
      reason: 'EXACT_DRAWING_DUPLICATE', candidateCount: exact.length
    };
  }
  return managed;
}

function getCalendarV2ProjectKeyword_(project) {
  var keyword = typeof getProjectKeywordV41_ === 'function'
    ? getProjectKeywordV41_(project)
    : safeString_(project.projectKeyword || project.projectName || project.brandName);
  return safeString_(keyword).trim();
}

function getCalendarV2FolderMap_(project) {
  var out = {};
  var summary = typeof getProjectFolderSummary_ === 'function'
    ? getProjectFolderSummary_(project)
    : [];

  (summary || []).forEach(function(item) {
    if (!item || item.legacy) return;
    out[safeString_(item.key).toUpperCase()] = {
      key: safeString_(item.key).toUpperCase(),
      id: safeString_(item.id),
      name: safeString_(item.name),
      url: safeString_(item.url),
      exists: item.exists === true,
      ambiguous: false
    };
  });

  if (!out.ROOT) {
    try {
      var root = DriveApp.getFolderById(project.rootFolderId);
      out.ROOT = { key: 'ROOT', id: root.getId(), name: root.getName(), url: root.getUrl(), exists: true, ambiguous: false };
    } catch (e) {
      out.ROOT = { key: 'ROOT', id: safeString_(project.rootFolderId), name: safeString_(project.rootFolderName || project.projectName), url: '', exists: false, ambiguous: false };
    }
  }

  ['ARTICLES','DOCX','HTML','SLIDES','PDF','PHOTOS','VIDEOS','PODCASTS'].forEach(function(key) {
    if (!out[key]) out[key] = { key: key, id: '', name: '', url: '', exists: false, ambiguous: false };
  });
  return out;
}

function resolveCalendarV2ExactFile_(project, folderRecord, keyword, mimeType, assetType) {
  if (!keyword) return calendarV2MissingFileResult_('PROJECT_KEYWORD_REQUIRED', assetType);
  if (!folderRecord || !folderRecord.exists || !folderRecord.id) {
    return calendarV2MissingFileResult_('CANONICAL_FOLDER_MISSING', assetType);
  }

  var folder;
  try { folder = DriveApp.getFolderById(folderRecord.id); }
  catch (e) { return calendarV2MissingFileResult_('CANONICAL_FOLDER_NOT_ACCESSIBLE', assetType); }

  var matches = [];
  var it = folder.getFiles();
  while (it.hasNext()) {
    var file = it.next();
    if (mimeType && file.getMimeType() !== mimeType) continue;
    if (calendarV2ExactNameMatches_(file.getName(), keyword)) matches.push(file);
  }

  if (matches.length > 1) {
    return {
      exists: false, ready: false, ambiguous: true, status: 'NEEDS_REVIEW',
      reason: 'EXACT_MATCH_DUPLICATE', assetType: assetType,
      candidateCount: matches.length,
      candidateIds: matches.map(function(f) { return f.getId(); })
    };
  }
  if (!matches.length) return calendarV2MissingFileResult_('EXACT_MATCH_NOT_FOUND', assetType);

  return calendarV2FileRecord_(matches[0], assetType, 'EXACT_PROJECT_KEYWORD');
}

function resolveCalendarV2ProjectSingleton_(project, assetType) {
  if (typeof getProjectSingletonAssetStateV41_ !== 'function') {
    return calendarV2MissingFileResult_('PROJECT_SINGLETON_RESOLVER_NOT_INSTALLED', assetType, 'DEFERRED');
  }

  var state = getProjectSingletonAssetStateV41_(project, assetType) || {};
  var status = safeString_(state.status).toUpperCase();
  if (['CURRENT','OUTDATED','WRONG_FOLDER'].indexOf(status) !== -1 && state.id) {
    try {
      var file = DriveApp.getFileById(state.id);
      return calendarV2FileRecord_(file, assetType, safeString_(state.resolutionMethod || status));
    } catch (e) {
      return calendarV2MissingFileResult_('PROJECT_SINGLETON_FILE_NOT_ACCESSIBLE', assetType);
    }
  }

  if (status === 'DUPLICATE' || status === 'NEEDS_REVIEW' || status === 'SOURCE_REQUIRED') {
    return {
      exists: false, ready: false, ambiguous: true, status: 'NEEDS_REVIEW',
      reason: safeString_(state.resolutionMethod || status), assetType: assetType,
      candidateCount: Number(state.duplicateCount || state.legacyCandidateCount || state.sourceCandidates || 0)
    };
  }

  return calendarV2MissingFileResult_(safeString_(state.resolutionMethod || status || 'NOT_FOUND'), assetType, 'DEFERRED');
}

function resolveCalendarV2EventSource_(spec, context) {
  var project = context.project;
  var snapshot = context.snapshot;

  if (spec.sourceKind === 'TARGET_URL') {
    var target = safeString_(project.targetPageUrl || project.websiteUrl);
    return {
      kind: 'TARGET_URL', assetType: 'TARGET_URL', id: '', name: target || snapshot.projectKeyword,
      url: target, mimeType: '', exists: !!target, ready: !!target,
      status: target ? 'READY' : 'MISSING_SOURCE', reason: target ? 'TARGET_URL_RESOLVED' : 'TARGET_URL_MISSING'
    };
  }

  if (spec.sourceKind === 'DRIVE_FOLDER') {
    var folderKey = safeString_(spec.folderKey || GES_CALENDAR_RESOLVER_V2.FOLDER_ROLE_MAP[spec.role]);
    var folder = snapshot.folders[folderKey] || { exists: false, id: '', name: '', url: '' };
    return {
      kind: 'DRIVE_FOLDER', assetType: folderKey === 'ROOT' ? 'PROJECT_FOLDER' : folderKey + '_FOLDER',
      id: safeString_(folder.id), name: safeString_(folder.name), url: safeString_(folder.url),
      mimeType: 'application/vnd.google-apps.folder', exists: folder.exists === true, ready: folder.exists === true,
      status: folder.exists === true ? 'READY' : 'DEFERRED',
      reason: folder.exists === true ? 'CANONICAL_FOLDER_RESOLVED' : 'CANONICAL_FOLDER_NOT_AVAILABLE'
    };
  }

  var fileSource = null;
  if (spec.role === 'PROJECT_URL_SHEET') fileSource = snapshot.projectUrlSheet;
  else if (spec.role === 'EXACT_MATCH_DOC') fileSource = snapshot.exactMatchDoc;
  else if (spec.role === 'EXACT_MATCH_SLIDES') fileSource = snapshot.exactMatchSlides;
  else if (spec.role === 'PROJECT_FORM') fileSource = snapshot.projectForm;
  else if (spec.role === 'PROJECT_DRAWING') fileSource = snapshot.projectDrawing;

  if (!fileSource) return calendarV2MissingFileResult_('UNRESOLVED_FILE_ROLE', spec.assetType || spec.role);
  return Object.assign({ kind: 'DRIVE_FILE' }, fileSource);
}

function calendarV2FileRecord_(file, assetType, resolutionMethod) {
  return {
    kind: 'DRIVE_FILE', assetType: assetType,
    id: file.getId(), name: file.getName(), url: file.getUrl(), mimeType: file.getMimeType(),
    exists: true, ready: true, status: 'READY', reason: 'SOURCE_RESOLVED', resolutionMethod: resolutionMethod || ''
  };
}

function calendarV2MissingFileResult_(reason, assetType, status) {
  var normalizedStatus = status || 'MISSING_SOURCE';
  return {
    kind: 'DRIVE_FILE', assetType: assetType || '', id: '', name: '', url: '', mimeType: '',
    exists: false, ready: false, ambiguous: false, status: normalizedStatus, reason: reason || 'NOT_FOUND'
  };
}

function calendarV2ExactNameMatches_(a, b) {
  if (typeof exactProjectNameMatchesV41_ === 'function') return exactProjectNameMatchesV41_(a, b);
  return calendarV2NormalizeExactKey_(a) === calendarV2NormalizeExactKey_(b);
}

function calendarV2NormalizeExactKey_(value) {
  return safeString_(value).normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN');
}
