/** GES V4.1 project folder resolution and naming. */

function getProjectRoot_(project) {
  return DriveApp.getFolderById(project.rootFolderId);
}

function getCanonicalProjectFolderKeysV41_() {
  if (typeof GES_PROJECT_STRUCTURE_V41 !== 'undefined') {
    return GES_PROJECT_STRUCTURE_V41.CANONICAL_FOLDER_KEYS.slice();
  }
  return ['ARTICLES','DOCX','HTML','SLIDES','PDF','PHOTOS','VIDEOS','PODCASTS'];
}

function expectedFolderName_(project, key) {
  const suffix = V3_CONFIG.FOLDER_SUFFIXES[key];
  if (!suffix) throw new Error('Unknown folder key: ' + key);
  return project.rootFolderName + ' ' + suffix;
}

function findUniqueChildFolderByName_(root, name) {
  const it = root.getFoldersByName(name);
  const found = [];
  while (it.hasNext()) found.push(it.next());
  if (found.length > 1) {
    throw new Error('Có nhiều subfolder trùng tên "' + name + '". Hãy giữ lại một folder duy nhất hoặc xử lý thủ công trước khi provision.');
  }
  return found.length ? found[0] : null;
}

/**
 * Resolve canonical V4.1 folders only.
 * Important: Sheets/Forms folders are legacy and are NEVER created, moved,
 * renamed or deleted by this function.
 */
function ensureProjectFolders_(project, createMissing) {
  const root = getProjectRoot_(project);
  project.rootFolderName = root.getName();
  project.folders = project.folders || {};

  getCanonicalProjectFolderKeysV41_().forEach(function(key) {
    const idKey = key.toLowerCase() + 'FolderId';
    const expectedName = expectedFolderName_(project, key);
    let folder = null;

    if (project.folders[idKey]) {
      try {
        const cached = DriveApp.getFolderById(project.folders[idKey]);
        // Preserve existing folder identity/name. Do not auto-rename anything.
        if (isFolderDirectlyInFolder_(cached, root)) folder = cached;
      } catch (e) {
        folder = null;
      }
    }

    if (!folder) folder = findUniqueChildFolderByName_(root, expectedName);
    if (!folder && createMissing) folder = root.createFolder(expectedName);

    project.folders[idKey] = folder ? folder.getId() : '';
  });

  // Preserve legacy IDs exactly as stored. Do not create or resolve by name.
  project.folders.sheetsFolderId = safeString_(project.folders.sheetsFolderId || '');
  project.folders.formsFolderId = safeString_(project.folders.formsFolderId || '');
  return project.folders;
}

function getProjectFolder_(project, key, createMissing) {
  if (getCanonicalProjectFolderKeysV41_().indexOf(key) === -1) {
    throw new Error('Folder key không còn được provision trong V4.1: ' + key);
  }
  const idKey = key.toLowerCase() + 'FolderId';
  const beforeId = project.folders && project.folders[idKey] || '';
  ensureProjectFolders_(project, createMissing !== false);
  const id = project.folders[idKey];
  if (!id) throw new Error('Chưa có folder ' + expectedFolderName_(project, key));
  if (createMissing !== false && id !== beforeId && typeof saveProject_ === 'function') {
    saveProject_(project);
    try { syncProjectConfigSheet_(project); } catch (ignore) {}
  }
  return DriveApp.getFolderById(id);
}

function getOutputFolderByAssetType_(project, assetType) {
  const map = { SLIDES: 'SLIDES', PDF: 'PDF', DOCX: 'DOCX', HTML: 'HTML' };
  if (map[assetType]) return getProjectFolder_(project, map[assetType], true);

  // V4.1 project-singleton assets live directly under PROJECT_ROOT.
  if (assetType === 'SHEET' || assetType === 'FORM' ||
      assetType === 'PROJECT_URL_SHEET' || assetType === 'PROJECT_FORM' ||
      assetType === 'PROJECT_DRAWING') {
    return getProjectRoot_(project);
  }
  throw new Error('Asset type không có output folder: ' + assetType);
}

function getArticlesFolder_(project, createMissing) {
  return getProjectFolder_(project, 'ARTICLES', createMissing !== false);
}

function isFileDirectlyInFolder_(file, folder) {
  const it = file.getParents();
  while (it.hasNext()) {
    if (it.next().getId() === folder.getId()) return true;
  }
  return false;
}

function isFolderDirectlyInFolder_(child, parent) {
  const it = child.getParents();
  while (it.hasNext()) {
    if (it.next().getId() === parent.getId()) return true;
  }
  return false;
}

function ensureFileInFolder_(file, folder) {
  if (!isFileDirectlyInFolder_(file, folder)) file.moveTo(folder);
}

function getProjectFolderSummary_(project) {
  ensureProjectFolders_(project, false);
  const out = [];
  const root = getProjectRoot_(project);
  out.push({ key: 'ROOT', id: root.getId(), name: root.getName(), url: root.getUrl(), exists: true, legacy: false });

  getCanonicalProjectFolderKeysV41_().forEach(function(key) {
    const idKey = key.toLowerCase() + 'FolderId';
    const id = safeString_(project.folders[idKey] || '');
    if (!id) {
      out.push({ key: key, id: '', name: expectedFolderName_(project, key), url: '', exists: false, legacy: false });
      return;
    }
    try {
      const f = DriveApp.getFolderById(id);
      out.push({ key: key, id: id, name: f.getName(), url: f.getUrl(), exists: true, legacy: false });
    } catch (e) {
      out.push({ key: key, id: id, name: expectedFolderName_(project, key), url: '', exists: false, legacy: false, error: safeString_(e.message) });
    }
  });

  // Show legacy folders to the user but never provision or mutate them.
  if (typeof getProjectLegacyFolderSummaryV41_ === 'function') {
    Array.prototype.push.apply(out, getProjectLegacyFolderSummaryV41_(project));
  }
  return out;
}
