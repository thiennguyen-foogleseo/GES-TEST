/**
 * GES V4.5.1 - Canonical Folder Name Reconcile.
 *
 * Purpose:
 * - After PROJECT_ROOT is renamed, explicitly reconcile the 8 canonical
 *   project folders to the live root-folder name.
 * - Preserve every canonical Folder ID.
 * - Never touch legacy Sheets/Forms folders.
 * - Never create, move, trash or delete any folder.
 * - Preview is read-only. Apply is explicit and guarded by project write state.
 */

const GES_CANONICAL_FOLDER_NAME_RECONCILE_V451 = Object.freeze({
  VERSION: '4.5.1',
  POLICY: 'EXPLICIT_PREVIEW_APPLY_VERIFY_KEEP_FOLDER_IDS',
  EXPECTED_NAME_SOURCE: 'LIVE_PROJECT_ROOT_NAME',
  CANONICAL_FOLDER_COUNT: 8,
  CANONICAL_FOLDER_KEYS: ['ARTICLES','DOCX','HTML','SLIDES','PDF','PHOTOS','VIDEOS','PODCASTS']
});

function getCanonicalFolderNameReconcileSchemaV451() {
  return cloneJson_(GES_CANONICAL_FOLDER_NAME_RECONCILE_V451);
}

function canonicalFolderExpectedNameV451_(rootName, key) {
  const cleanRoot = normalizeName_(rootName || '');
  if (!cleanRoot) throw new Error('ROOT_FOLDER_NAME_REQUIRED');
  const suffix = V3_CONFIG.FOLDER_SUFFIXES[key];
  if (!suffix) throw new Error('UNKNOWN_CANONICAL_FOLDER_KEY: ' + key);
  return cleanRoot + ' ' + suffix;
}

function canonicalFolderNameStatusV451_(currentName, expectedName) {
  return normalizeName_(currentName || '') === normalizeName_(expectedName || '') ? 'CURRENT' : 'RENAME_REQUIRED';
}

function listDirectChildFolderIdsByNameV451_(root, name) {
  const out = [];
  const it = root.getFoldersByName(name);
  while (it.hasNext()) out.push(it.next().getId());
  return out;
}

function getCanonicalFolderNameReconcilePlanV451_(project) {
  project = normalizeProjectProfileV31_(project || {});
  if (!project.projectId) throw new Error('PROJECT_ID_REQUIRED');
  if (!project.rootFolderId) throw new Error('ROOT_FOLDER_REQUIRED');

  const root = DriveApp.getFolderById(project.rootFolderId);
  const liveRootName = normalizeName_(root.getName());
  if (!liveRootName) throw new Error('ROOT_FOLDER_NAME_REQUIRED');

  const keys = (typeof getCanonicalProjectFolderKeysV41_ === 'function')
    ? getCanonicalProjectFolderKeysV41_()
    : GES_CANONICAL_FOLDER_NAME_RECONCILE_V451.CANONICAL_FOLDER_KEYS.slice();

  const plan = {
    success: true,
    version: GES_CANONICAL_FOLDER_NAME_RECONCILE_V451.VERSION,
    policy: GES_CANONICAL_FOLDER_NAME_RECONCILE_V451.POLICY,
    projectId: project.projectId,
    rootFolder: {
      id: root.getId(),
      name: liveRootName,
      url: root.getUrl()
    },
    totalCanonicalFolders: keys.length,
    currentCount: 0,
    renameCount: 0,
    blockerCount: 0,
    folders: [],
    actions: [],
    blockers: [],
    destructiveActions: [],
    invariants: {
      keepFolderIds: true,
      moveFolders: false,
      createFolders: false,
      deleteFolders: false,
      touchLegacySheetsForms: false
    }
  };

  keys.forEach(function(key) {
    const idKey = key.toLowerCase() + 'FolderId';
    const folderId = safeString_(project.folders && project.folders[idKey] || '');
    const expectedName = canonicalFolderExpectedNameV451_(liveRootName, key);
    const row = {
      key: key,
      idKey: idKey,
      folderId: folderId,
      currentName: '',
      expectedName: expectedName,
      status: '',
      directChildOfRoot: false,
      conflictingFolderIds: [],
      error: ''
    };

    if (!folderId) {
      row.status = 'BLOCKED';
      row.error = 'CANONICAL_FOLDER_ID_MISSING';
      plan.blockers.push({
        code: 'CANONICAL_FOLDER_ID_MISSING',
        key: key,
        idKey: idKey,
        expectedName: expectedName,
        message: 'Không có Folder ID đã đăng ký cho canonical folder ' + key + '. V4.5.1 không đoán hoặc tạo folder mới.'
      });
      plan.folders.push(row);
      return;
    }

    let folder;
    try {
      folder = DriveApp.getFolderById(folderId);
      row.currentName = folder.getName();
      row.directChildOfRoot = isFolderDirectlyInFolder_(folder, root);
    } catch (e) {
      row.status = 'BLOCKED';
      row.error = 'CANONICAL_FOLDER_UNAVAILABLE';
      plan.blockers.push({
        code: 'CANONICAL_FOLDER_UNAVAILABLE',
        key: key,
        folderId: folderId,
        expectedName: expectedName,
        message: safeString_(e && e.message || e)
      });
      plan.folders.push(row);
      return;
    }

    if (!row.directChildOfRoot) {
      row.status = 'BLOCKED';
      row.error = 'CANONICAL_FOLDER_WRONG_PARENT';
      plan.blockers.push({
        code: 'CANONICAL_FOLDER_WRONG_PARENT',
        key: key,
        folderId: folderId,
        currentName: row.currentName,
        expectedName: expectedName,
        message: 'Canonical folder không còn là direct child của Project Root. V4.5.1 chỉ rename, không move folder.'
      });
      plan.folders.push(row);
      return;
    }

    row.conflictingFolderIds = listDirectChildFolderIdsByNameV451_(root, expectedName)
      .filter(function(id) { return id !== folderId; });

    if (row.conflictingFolderIds.length) {
      row.status = 'BLOCKED';
      row.error = 'EXPECTED_NAME_CONFLICT';
      plan.blockers.push({
        code: 'EXPECTED_NAME_CONFLICT',
        key: key,
        folderId: folderId,
        currentName: row.currentName,
        expectedName: expectedName,
        conflictingFolderIds: row.conflictingFolderIds.slice(),
        message: 'Đã có direct child khác dùng expected name. Không rename để tránh tạo cấu trúc mơ hồ.'
      });
      plan.folders.push(row);
      return;
    }

    row.status = canonicalFolderNameStatusV451_(row.currentName, expectedName);
    if (row.status === 'CURRENT') {
      plan.currentCount++;
    } else {
      plan.renameCount++;
      plan.actions.push({
        action: 'RENAME_CANONICAL_FOLDER_KEEP_ID',
        key: key,
        folderId: folderId,
        fromName: row.currentName,
        toName: expectedName,
        keepFolderId: true
      });
    }
    plan.folders.push(row);
  });

  plan.blockerCount = plan.blockers.length;
  plan.success = plan.blockerCount === 0;
  plan.status = plan.blockerCount > 0 ? 'BLOCKED' : (plan.renameCount > 0 ? 'OUTDATED' : 'CURRENT');
  return plan;
}

function previewCanonicalFolderNameReconcileV451(projectId) {
  const project = getProject_(projectId);
  if (!project) throw new Error('PROJECT_NOT_FOUND: ' + projectId);
  return getCanonicalFolderNameReconcilePlanV451_(project);
}

function previewActiveCanonicalFolderNameReconcileV451() {
  const project = getActiveProject_();
  if (!project) throw new Error('Chưa có active project.');
  return previewCanonicalFolderNameReconcileV451(project.projectId);
}

function applyCanonicalFolderNameReconcileV451(projectId) {
  let project = getProject_(projectId);
  if (!project) throw new Error('PROJECT_NOT_FOUND: ' + projectId);
  assertProjectWritable_(project);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('FOLDER_NAME_RECONCILE_LOCK_TIMEOUT');

  try {
    project = getProject_(projectId);
    if (!project) throw new Error('PROJECT_NOT_FOUND_AFTER_LOCK: ' + projectId);
    assertProjectWritable_(project);

    const before = getCanonicalFolderNameReconcilePlanV451_(project);
    if (before.blockers.length) {
      const err = new Error('FOLDER_NAME_RECONCILE_BLOCKED: ' + before.blockers.map(function(b) { return b.code + ':' + b.key; }).join(', '));
      err.code = 'FOLDER_NAME_RECONCILE_BLOCKED';
      err.preview = before;
      throw err;
    }

    const root = DriveApp.getFolderById(project.rootFolderId);
    const applied = [];

    before.actions.forEach(function(action) {
      if (action.action !== 'RENAME_CANONICAL_FOLDER_KEEP_ID') return;
      const folder = DriveApp.getFolderById(action.folderId);
      if (!isFolderDirectlyInFolder_(folder, root)) {
        throw new Error('CANONICAL_FOLDER_PARENT_CHANGED_DURING_APPLY: ' + action.key);
      }

      const conflicts = listDirectChildFolderIdsByNameV451_(root, action.toName)
        .filter(function(id) { return id !== action.folderId; });
      if (conflicts.length) {
        throw new Error('EXPECTED_NAME_CONFLICT_DURING_APPLY: ' + action.key);
      }

      const currentName = folder.getName();
      if (normalizeName_(currentName) !== normalizeName_(action.toName)) {
        folder.setName(action.toName);
      }
      applied.push({
        key: action.key,
        folderId: action.folderId,
        beforeName: currentName,
        afterName: folder.getName(),
        idPreserved: folder.getId() === action.folderId
      });
    });

    project.rootFolderName = normalizeName_(root.getName());
    project.folderNameReconcile = Object.assign({}, project.folderNameReconcile || {}, {
      version: GES_CANONICAL_FOLDER_NAME_RECONCILE_V451.VERSION,
      status: 'APPLIED',
      rootFolderName: project.rootFolderName,
      lastAppliedAt: nowIso_(),
      lastRenameCount: applied.length
    });
    project = saveProject_(project);
    try { syncProjectConfigSheet_(project); } catch (ignoreConfigSync) {}

    const verification = verifyCanonicalFolderNameReconcileV451(projectId);
    project = getProject_(projectId) || project;
    project.folderNameReconcile = Object.assign({}, project.folderNameReconcile || {}, {
      version: GES_CANONICAL_FOLDER_NAME_RECONCILE_V451.VERSION,
      status: verification.success ? 'VERIFIED' : 'VERIFY_FAILED',
      rootFolderName: project.rootFolderName,
      lastVerifiedAt: nowIso_(),
      lastRenameCount: applied.length
    });
    saveProject_(project);

    logEvent_(projectId, 'CANONICAL_FOLDER_NAME_RECONCILE_V451', {
      result: verification.success ? 'SUCCESS' : 'VERIFY_FAILED',
      message: 'Canonical folder name reconcile completed with Folder IDs preserved.',
      version: GES_CANONICAL_FOLDER_NAME_RECONCILE_V451.VERSION,
      rootFolderName: project.rootFolderName,
      renamed: applied.length,
      verificationSuccess: verification.success
    });

    return {
      success: verification.success,
      version: GES_CANONICAL_FOLDER_NAME_RECONCILE_V451.VERSION,
      projectId: projectId,
      rootFolderName: project.rootFolderName,
      renamed: applied.length,
      applied: applied,
      verification: verification
    };
  } finally {
    try { lock.releaseLock(); } catch (ignoreRelease) {}
  }
}

function applyActiveCanonicalFolderNameReconcileV451() {
  const project = getActiveProject_();
  if (!project) throw new Error('Chưa có active project.');
  return applyCanonicalFolderNameReconcileV451(project.projectId);
}

function verifyCanonicalFolderNameReconcileV451(projectId) {
  const project = getProject_(projectId);
  if (!project) throw new Error('PROJECT_NOT_FOUND: ' + projectId);
  const plan = getCanonicalFolderNameReconcilePlanV451_(project);

  const errors = [];
  if (plan.blockers.length) {
    plan.blockers.forEach(function(b) { errors.push(b.code + ':' + b.key); });
  }
  if (plan.renameCount > 0) errors.push('CANONICAL_FOLDER_NAMES_NOT_CURRENT:' + plan.renameCount);
  if (plan.totalCanonicalFolders !== GES_CANONICAL_FOLDER_NAME_RECONCILE_V451.CANONICAL_FOLDER_COUNT) {
    errors.push('CANONICAL_FOLDER_COUNT_MISMATCH:' + plan.totalCanonicalFolders);
  }

  const idChecks = plan.folders.map(function(row) {
    return {
      key: row.key,
      folderId: row.folderId,
      currentName: row.currentName,
      expectedName: row.expectedName,
      current: row.status === 'CURRENT',
      directChildOfRoot: row.directChildOfRoot
    };
  });

  return {
    success: errors.length === 0,
    version: GES_CANONICAL_FOLDER_NAME_RECONCILE_V451.VERSION,
    projectId: projectId,
    rootFolder: plan.rootFolder,
    totalCanonicalFolders: plan.totalCanonicalFolders,
    currentCount: plan.currentCount,
    renameCount: plan.renameCount,
    errors: errors,
    folderChecks: idChecks,
    invariants: plan.invariants
  };
}

function verifyActiveCanonicalFolderNameReconcileV451() {
  const project = getActiveProject_();
  if (!project) throw new Error('Chưa có active project.');
  return verifyCanonicalFolderNameReconcileV451(project.projectId);
}

function getCanonicalFolderNameReconcileDashboardSummaryV451_(project) {
  const base = {
    installed: true,
    version: GES_CANONICAL_FOLDER_NAME_RECONCILE_V451.VERSION,
    status: 'UNKNOWN',
    rootFolderName: '',
    totalCanonicalFolders: GES_CANONICAL_FOLDER_NAME_RECONCILE_V451.CANONICAL_FOLDER_COUNT,
    currentCount: 0,
    renameCount: 0,
    blockerCount: 0,
    error: ''
  };
  try {
    const plan = getCanonicalFolderNameReconcilePlanV451_(project);
    base.status = plan.status;
    base.rootFolderName = plan.rootFolder.name;
    base.totalCanonicalFolders = plan.totalCanonicalFolders;
    base.currentCount = plan.currentCount;
    base.renameCount = plan.renameCount;
    base.blockerCount = plan.blockerCount;
    return base;
  } catch (e) {
    base.status = 'ERROR';
    base.error = safeString_(e && e.message || e);
    return base;
  }
}
