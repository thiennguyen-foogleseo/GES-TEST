/** Phase 10 / V3.1: controlled V2 -> V3 migration and cut-over. */

function assertMigrationProjectV31_(project) {
  project = normalizeProjectProfileV31_(project);
  if (project.provisioningMode !== 'MIGRATE_V2') {
    const err = new Error('V2 Migration chỉ áp dụng cho project có Setup Mode = MIGRATE_V2. Project NEW_STACK không cần migration.');
    err.code = 'MIGRATION_NOT_APPLICABLE';
    throw err;
  }
  return project;
}

function previewV2Migration() {
  let project = getActiveProject_();
  if (!project) throw new Error('Chưa có active project.');
  project = assertMigrationProjectV31_(project);

  ensureProjectFolders_(project, true);
  const root = getProjectRoot_(project);
  const articles = getArticlesFolder_(project, true);

  const rootDocs = [];
  const it = root.getFilesByType(MimeType.GOOGLE_DOCS);
  while (it.hasNext()) {
    const f = it.next();
    rootDocs.push({
      id: f.getId(),
      name: f.getName(),
      url: f.getUrl(),
      updated: f.getLastUpdated().toISOString()
    });
  }

  const articleDocs = [];
  const ait = articles.getFilesByType(MimeType.GOOGLE_DOCS);
  while (ait.hasNext()) {
    const f = ait.next();
    articleDocs.push({
      id: f.getId(),
      name: f.getName(),
      url: f.getUrl(),
      updated: f.getLastUpdated().toISOString()
    });
  }

  const assetSummary = { SLIDES: 0, PDF: 0, DOCX: 0, HTML: 0 };
  ['SLIDES', 'PDF', 'DOCX', 'HTML'].forEach(function(type) {
    const folder = getOutputFolderByAssetType_(project, type);
    const fit = folder.getFiles();
    while (fit.hasNext()) {
      const f = fit.next();
      if (fileMatchesAssetType_(f, type)) assetSummary[type]++;
    }
  });

  if (['PENDING', 'FAILED', 'ROLLED_BACK'].indexOf(project.migration.status) !== -1) {
    project.migration.status = 'PREVIEWED';
    project.migration.previewedAt = nowIso_();
    saveProject_(project);
    syncProjectConfigSheet_(project);
  }

  return {
    projectId: project.projectId,
    provisioningMode: project.provisioningMode,
    shadowMode: project.writeState.shadowMode,
    writeEnabled: project.writeState.writeEnabled,
    migrationStatus: project.migration.status,
    rootDocs: rootDocs,
    articleDocs: articleDocs,
    assetSummary: assetSummary,
    warning: 'Root Docs sẽ được move vào Articles nhưng giữ nguyên File ID. Sau migration, V2 sẽ không còn scan thấy các Docs đã move khỏi root.'
  };
}

function runV2Migration(options) {
  options = options || {};
  let project = getActiveProject_();
  if (!project) throw new Error('Chưa có active project.');
  project = assertMigrationProjectV31_(project);

  const root = getProjectRoot_(project);
  const articles = getArticlesFolder_(project, true);
  const preview = previewV2Migration();
  const selected = options.selectedDocIds && options.selectedDocIds.length
    ? options.selectedDocIds
    : preview.rootDocs.map(function(d) { return d.id; });

  if (options.dryRun) {
    return {
      success: true,
      dryRun: true,
      selectedDocIds: selected,
      preview: preview
    };
  }

  if (project.writeState.writeEnabled) {
    throw new Error('Hãy Disable V3 Write trước khi chạy migration.');
  }

  const selectedSet = {};
  selected.forEach(function(id) { selectedSet[id] = true; });
  const plannedMoves = preview.rootDocs
    .filter(function(d) { return !!selectedSet[d.id]; })
    .map(function(d) {
      return {
        id: d.id,
        name: d.name,
        fromFolderId: root.getId(),
        toFolderId: articles.getId()
      };
    });

  const backup = {
    version: 2,
    createdAt: nowIso_(),
    projectId: project.projectId,
    provisioningMode: project.provisioningMode,
    rootFolderId: project.rootFolderId,
    articlesFolderId: articles.getId(),
    movedDocs: plannedMoves,
    adoptedAssets: []
  };

  // Create rollback backup before any Drive mutation.
  const backupFile = createMigrationBackupFile_(project, backup);
  project.migration.backup = {
    created: true,
    fileId: backupFile.getId(),
    fileUrl: backupFile.getUrl(),
    createdAt: nowIso_()
  };
  project.migration.rollback = {
    available: true,
    backupFileId: backupFile.getId(),
    lastRollbackAt: project.migration.rollback && project.migration.rollback.lastRollbackAt || ''
  };
  project.migration.status = 'BACKED_UP';
  project.migration.startedAt = nowIso_();
  project.migration.lastError = '';
  project = setProjectWriteStateV31_(project, false, 'MIGRATION_IN_PROGRESS');
  saveProject_(project);
  syncProjectConfigSheet_(project);

  try {
    project.migration.status = 'MIGRATING';
    saveProject_(project);

    plannedMoves.forEach(function(item) {
      const f = DriveApp.getFileById(item.id);
      if (isFileDirectlyInFolder_(f, root)) f.moveTo(articles);
    });

    if (options.adoptExistingAssets !== false) {
      getSourceDocs_(project).forEach(function(docFile) {
        ['SLIDES', 'PDF', 'DOCX'].forEach(function(type) {
          try {
            const resolved = resolveAssetForDoc_(project, docFile, type);
            if (resolved.file && !resolved.ambiguous) {
              const fallbackSyncMs = Math.min(
                docFile.getLastUpdated().getTime(),
                resolved.file.getLastUpdated().getTime()
              );

              tagManagedAsset_(project, docFile, type, resolved.file, {
                MIGRATED_FROM: 'V2',
                SOURCE_MODIFIED_AT_SYNC_MS: fallbackSyncMs,
                SOURCE_MODIFIED_AT_SYNC: new Date(fallbackSyncMs).toISOString()
              });

              saveAssetRegistry_(project, docFile, type, resolved.file, {
                resolutionMethod: 'V2_MIGRATION_' + resolved.method,
                migratedFromV2: true,
                sourceModifiedAtSyncMs: fallbackSyncMs,
                sourceModifiedAtSync: new Date(fallbackSyncMs).toISOString()
              });

              backup.adoptedAssets.push({
                docId: docFile.getId(),
                assetType: type,
                fileId: resolved.file.getId(),
                fileName: resolved.file.getName()
              });

              upsertManagedAssetToRegistrySheet_(project, docFile, type);
            }
          } catch (e) {
            logEvent_(project.projectId, 'MIGRATION_ASSET_WARNING', {
              docName: docFile.getName(),
              assetType: type,
              result: 'WARNING',
              message: e.message
            });
          }
        });
      });
    }

    try {
      backupFile.setContent(JSON.stringify(backup, null, 2));
    } catch (ignore) {}

    project.migration.status = 'COMPLETED';
    project.migration.completedAt = nowIso_();
    project.migration.verifiedAt = '';
    project.migration.verification = {
      verified: false,
      sourceDocsChecked: 0,
      slidesChecked: 0,
      pdfsChecked: 0,
      docxChecked: 0,
      fileIdsPreserved: false,
      errors: [],
      warnings: ['Migration completed. Run Verify Migration before enabling V3 Write.']
    };
    project = setProjectWriteStateV31_(project, false, 'MIGRATION_COMPLETED_AWAITING_VERIFICATION');
    saveProject_(project);

    rebuildRegistryForProject(project.projectId);
    syncProjectConfigSheet_(project);

    logEvent_(project.projectId, 'V2_MIGRATION_APPLIED', {
      result: 'SUCCESS',
      movedDocs: plannedMoves.length,
      adoptedAssets: backup.adoptedAssets.length,
      assetId: backupFile.getId()
    });

    return {
      success: true,
      movedDocs: plannedMoves.length,
      adoptedAssets: backup.adoptedAssets.length,
      backupFileId: backupFile.getId(),
      backupFileUrl: backupFile.getUrl(),
      migrationStatus: project.migration.status,
      message: 'Migration hoàn tất ở Shadow Mode. Bước tiếp theo: Verify Migration.'
    };
  } catch (e) {
    project.migration.status = 'FAILED';
    project.migration.lastError = e.message;
    project = setProjectWriteStateV31_(project, false, 'MIGRATION_FAILED');
    saveProject_(project);
    syncProjectConfigSheet_(project);
    logEvent_(project.projectId, 'V2_MIGRATION_FAILED', {
      result: 'ERROR',
      message: e.message,
      assetId: backupFile.getId()
    });
    throw e;
  }
}

function verifyV2Migration() {
  let project = getActiveProject_();
  if (!project) throw new Error('Chưa có active project.');
  project = assertMigrationProjectV31_(project);

  if (['COMPLETED', 'VERIFIED'].indexOf(project.migration.status) === -1) {
    throw new Error('Migration phải ở trạng thái COMPLETED trước khi Verify.');
  }
  if (!project.migration.backup || !project.migration.backup.fileId) {
    throw new Error('Không tìm thấy migration backup.');
  }

  const errors = [];
  const warnings = [];
  const counts = { sourceDocsChecked: 0, slidesChecked: 0, pdfsChecked: 0, docxChecked: 0 };

  const root = getProjectRoot_(project);
  const rootDocs = [];
  const rit = root.getFilesByType(MimeType.GOOGLE_DOCS);
  while (rit.hasNext()) rootDocs.push(rit.next().getId());
  if (rootDocs.length) errors.push('ROOT_STILL_CONTAINS_' + rootDocs.length + '_GOOGLE_DOCS');

  const backup = jsonParseSafe_(
    DriveApp.getFileById(project.migration.backup.fileId).getBlob().getDataAsString(),
    null
  );
  if (!backup) errors.push('MIGRATION_BACKUP_INVALID');

  const docs = getSourceDocs_(project);
  counts.sourceDocsChecked = docs.length;

  if (backup && Array.isArray(backup.adoptedAssets)) {
    backup.adoptedAssets.forEach(function(item) {
      try {
        const docFile = getSourceDocById_(project, item.docId);
        const resolved = resolveAssetForDoc_(project, docFile, item.assetType);
        if (!resolved.file) {
          errors.push(item.assetType + '_NOT_RESOLVED_FOR_' + item.docId);
          return;
        }
        if (resolved.file.getId() !== item.fileId) {
          errors.push(item.assetType + '_FILE_ID_CHANGED_FOR_' + item.docId);
          return;
        }
        if (item.assetType === 'SLIDES') counts.slidesChecked++;
        if (item.assetType === 'PDF') counts.pdfsChecked++;
        if (item.assetType === 'DOCX') counts.docxChecked++;
      } catch (e) {
        errors.push(item.assetType + '_VERIFY_ERROR_' + item.docId + ': ' + e.message);
      }
    });
  } else {
    warnings.push('Backup không chứa adoptedAssets; chỉ kiểm tra source structure.');
  }

  const verified = errors.length === 0;
  project.migration.verification = {
    verified: verified,
    sourceDocsChecked: counts.sourceDocsChecked,
    slidesChecked: counts.slidesChecked,
    pdfsChecked: counts.pdfsChecked,
    docxChecked: counts.docxChecked,
    fileIdsPreserved: verified,
    errors: errors,
    warnings: warnings
  };

  project.migration.status = verified ? 'VERIFIED' : 'COMPLETED';
  project.migration.verifiedAt = verified ? nowIso_() : '';
  project.migration.lastError = verified ? '' : errors.join('; ');
  project = setProjectWriteStateV31_(project, false, verified ? 'MIGRATION_VERIFIED_AWAITING_CUTOVER' : 'MIGRATION_VERIFICATION_FAILED');
  saveProject_(project);
  syncProjectConfigSheet_(project);

  logEvent_(project.projectId, 'V2_MIGRATION_VERIFIED', {
    result: verified ? 'SUCCESS' : 'ERROR',
    message: verified ? 'File IDs preserved and source structure verified.' : errors.join('; ')
  });

  return {
    success: verified,
    migrationStatus: project.migration.status,
    verification: project.migration.verification
  };
}

function createMigrationBackupFile_(project, backup) {
  const name = 'V3_Migration_Backup_' + Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh',
    'yyyy-MM-dd_HH-mm-ss'
  ) + '.json';
  const blob = Utilities.newBlob(JSON.stringify(backup, null, 2), 'application/json', name);
  return getProjectRoot_(project).createFile(blob);
}

function rollbackLastV2Migration() {
  let project = getActiveProject_();
  if (!project) throw new Error('Chưa có active project.');
  project = assertMigrationProjectV31_(project);

  const backupId = project.migration && project.migration.backup && project.migration.backup.fileId;
  if (!backupId) throw new Error('Không có migration backup để rollback.');

  const backup = jsonParseSafe_(DriveApp.getFileById(backupId).getBlob().getDataAsString(), null);
  if (!backup || !backup.movedDocs) throw new Error('Migration backup không hợp lệ.');

  const root = getProjectRoot_(project);
  let movedBack = 0;
  backup.movedDocs.forEach(function(item) {
    try {
      const file = DriveApp.getFileById(item.id);
      if (!isFileDirectlyInFolder_(file, root)) file.moveTo(root);
      movedBack++;
    } catch (e) {
      logEvent_(project.projectId, 'ROLLBACK_WARNING', {
        assetId: item.id,
        message: e.message,
        result: 'WARNING'
      });
    }
  });

  project.migration.status = 'ROLLED_BACK';
  project.migration.rollback.available = true;
  project.migration.rollback.lastRollbackAt = nowIso_();
  project = setProjectWriteStateV31_(project, false, 'ROLLED_BACK_TO_V2');
  saveProject_(project);
  syncProjectConfigSheet_(project);

  logEvent_(project.projectId, 'ROLLBACK_TO_V2', {
    result: 'SUCCESS',
    movedDocs: movedBack
  });

  return {
    success: true,
    movedDocsBackToRoot: movedBack,
    migrationStatus: project.migration.status,
    message: 'Đã đưa source Docs về root. V3 trở lại Shadow Mode.'
  };
}

function cutoverProjectToV3() {
  let project = getActiveProject_();
  if (!project) throw new Error('Chưa có active project.');

  project = enableProjectWriteV31_(project);

  logEvent_(project.projectId, 'PRODUCTION_CUTOVER_V3', {
    result: 'SUCCESS',
    projectType: project.projectType,
    provisioningMode: project.provisioningMode
  });

  return sanitizeProjectForClient_(project);
}
