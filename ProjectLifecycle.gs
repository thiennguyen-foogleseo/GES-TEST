/** V3.1 project lifecycle rules: NEW_STACK vs MIGRATE_V2. */

function canChangeProvisioningModeV31_(project) {
  project = normalizeProjectProfileV31_(project);
  if (project.writeState.writeEnabled) return false;
  const status = project.migration && project.migration.status;
  if (['MIGRATING', 'COMPLETED', 'VERIFIED'].indexOf(status) !== -1) return false;
  return true;
}

function detectLegacyMarkersForProjectV31_(project) {
  const hits = [];
  ['SLIDES', 'PDF', 'DOCX'].forEach(function(type) {
    try {
      const folder = getOutputFolderByAssetType_(project, type);
      const it = folder.getFiles();
      while (it.hasNext()) {
        const f = it.next();
        const d = safeString_(f.getDescription());
        if (
          d.indexOf(V3_CONFIG.LEGACY_V2_SOURCE_MARKER) !== -1 ||
          d.indexOf(V3_CONFIG.LEGACY_V2_TYPE_MARKER) !== -1
        ) {
          hits.push({ assetType: type, fileId: f.getId(), fileName: f.getName() });
          if (hits.length >= 20) return;
        }
      }
    } catch (e) {}
  });
  return hits;
}

function validateProjectFoldersForWriteV31_(project) {
  const errors = [];
  const warnings = [];
  let root = null;

  try {
    root = DriveApp.getFolderById(project.rootFolderId);
  } catch (e) {
    errors.push('ROOT_FOLDER_NOT_ACCESSIBLE');
    return { errors: errors, warnings: warnings };
  }

  const map = {
    ARTICLES: 'articlesFolderId',
    SLIDES: 'slidesFolderId',
    PDF: 'pdfFolderId',
    DOCX: 'docxFolderId',
    HTML: 'htmlFolderId'
  };

  Object.keys(map).forEach(function(type) {
    const id = project.folders && project.folders[map[type]];
    if (!id) {
      errors.push(type + '_FOLDER_MISSING');
      return;
    }
    try {
      const folder = DriveApp.getFolderById(id);
      if (!isFolderDirectlyInFolder_(folder, root)) errors.push(type + '_FOLDER_OUTSIDE_ROOT');
    } catch (e) {
      errors.push(type + '_FOLDER_NOT_ACCESSIBLE');
    }
  });

  if (project.registrySheetId) {
    try { SpreadsheetApp.openById(project.registrySheetId); }
    catch (e) { errors.push('REGISTRY_SHEET_NOT_ACCESSIBLE'); }
  } else {
    warnings.push('REGISTRY_SHEET_MISSING');
  }

  return { errors: errors, warnings: warnings };
}

function collectBlockingAssetConflictsV31_(project) {
  const conflicts = [];
  let docs = [];
  try { docs = getSourceDocs_(project); }
  catch (e) { return [{ code: 'SOURCE_DOC_SCAN_FAILED', message: e.message }]; }

  docs.forEach(function(docFile) {
    V3_CONFIG.MANAGED_ASSET_TYPES.forEach(function(type) {
      try {
        const state = getAssetState_(project, docFile, type);
        if (state.status === 'DUPLICATE' || state.status === 'AMBIGUOUS') {
          conflicts.push({
            code: 'ASSET_' + state.status,
            docId: docFile.getId(),
            docName: docFile.getName(),
            assetType: type,
            duplicateCount: state.duplicateCount || 0
          });
        }
      } catch (e) {
        conflicts.push({
          code: 'ASSET_STATE_ERROR',
          docId: docFile.getId(),
          docName: docFile.getName(),
          assetType: type,
          message: e.message
        });
      }
    });
  });

  return conflicts;
}

function validateCommonWriteReadyV31_(project) {
  project = normalizeProjectProfileV31_(project);
  const errors = [];
  const warnings = [];

  if (project.enabled === false) errors.push('PROJECT_DISABLED');
  if (project.upgrade && project.upgrade.requiresLifecycleConfirmation) errors.push('LIFECYCLE_CONFIRMATION_REQUIRED');
  if (project.projectType === 'UNSPECIFIED') errors.push('PROJECT_TYPE_UNSPECIFIED');
  if (project.provisioningMode === 'UNSET') errors.push('PROVISIONING_MODE_UNSET');

  const folderCheck = validateProjectFoldersForWriteV31_(project);
  errors.push.apply(errors, folderCheck.errors);
  warnings.push.apply(warnings, folderCheck.warnings);

  const conflicts = collectBlockingAssetConflictsV31_(project);
  if (conflicts.length) errors.push('REGISTRY_OR_ASSET_CONFLICTS');

  return {
    ready: errors.length === 0,
    errors: errors,
    warnings: warnings,
    conflicts: conflicts
  };
}

function validateNewStackWriteReady_(project) {
  project = normalizeProjectProfileV31_(project);
  const result = validateCommonWriteReadyV31_(project);

  if (project.provisioningMode !== 'NEW_STACK') result.errors.push('NOT_NEW_STACK');
  if (project.migration.required !== false || project.migration.status !== 'NOT_REQUIRED') {
    result.errors.push('NEW_STACK_MIGRATION_STATE_INVALID');
  }

  const legacyHits = detectLegacyMarkersForProjectV31_(project);
  if (legacyHits.length) {
    result.warnings.push('LEGACY_V2_MARKERS_DETECTED');
    result.legacyEvidence = legacyHits;
  }

  result.ready = result.errors.length === 0;
  return result;
}

function validateMigratedProjectWriteReady_(project) {
  project = normalizeProjectProfileV31_(project);
  const result = validateCommonWriteReadyV31_(project);

  if (project.provisioningMode !== 'MIGRATE_V2') result.errors.push('NOT_MIGRATE_V2');
  if (!project.migration.required) result.errors.push('MIGRATION_REQUIRED_FLAG_MISSING');
  if (project.migration.status !== 'VERIFIED') result.errors.push('MIGRATION_NOT_VERIFIED');
  if (!project.migration.backup || !project.migration.backup.fileId) result.errors.push('MIGRATION_BACKUP_MISSING');
  if (!project.migration.verification || !project.migration.verification.verified) result.errors.push('MIGRATION_VERIFICATION_MISSING');

  result.ready = result.errors.length === 0;
  return result;
}

function validateProjectWriteReadyV31_(project) {
  project = normalizeProjectProfileV31_(project);
  if (project.provisioningMode === 'NEW_STACK') return validateNewStackWriteReady_(project);
  if (project.provisioningMode === 'MIGRATE_V2') return validateMigratedProjectWriteReady_(project);
  return {
    ready: false,
    errors: ['PROVISIONING_MODE_UNSET'],
    warnings: [],
    conflicts: []
  };
}

function getProjectAvailableActions_(project) {
  project = normalizeProjectProfileV31_(project);
  const mode = project.provisioningMode;
  const migrationStatus = project.migration.status;
  const writeEnabled = project.writeState.writeEnabled;
  const requiresConfirmation = !!project.upgrade.requiresLifecycleConfirmation;

  return {
    canConfirmLifecycle: !writeEnabled && canChangeProvisioningModeV31_(project),
    canEditProject: true,
    canMigrate: mode === 'MIGRATE_V2' && !writeEnabled && migrationStatus !== 'VERIFIED',
    canVerifyMigration: mode === 'MIGRATE_V2' && !writeEnabled && migrationStatus === 'COMPLETED',
    canRollback: mode === 'MIGRATE_V2' && !!project.migration.rollback.available,
    canEnableWrite: !writeEnabled && !requiresConfirmation && (
      mode === 'NEW_STACK' ||
      (mode === 'MIGRATE_V2' && migrationStatus === 'VERIFIED')
    ),
    canDisableWrite: writeEnabled,
    canCreateAssets: writeEnabled,
    canSync: writeEnabled,
    showMigrationControls: mode === 'MIGRATE_V2',
    showRollback: mode === 'MIGRATE_V2' && !!project.migration.rollback.available
  };
}

function getProjectLifecycleState_(project) {
  project = normalizeProjectProfileV31_(project);
  return {
    projectType: project.projectType,
    provisioningMode: project.provisioningMode,
    migrationStatus: project.migration.status,
    migrationRequired: project.migration.required,
    writeEnabled: project.writeState.writeEnabled,
    shadowMode: project.writeState.shadowMode,
    requiresLifecycleConfirmation: !!project.upgrade.requiresLifecycleConfirmation,
    suggestedProjectType: project.upgrade.suggestedProjectType || '',
    suggestedProvisioningMode: project.upgrade.suggestedProvisioningMode || '',
    upgradeEvidence: normalizeArrayV31_(project.upgrade.evidence),
    actions: getProjectAvailableActions_(project)
  };
}

function confirmProjectLifecycle(input) {
  input = input || {};

  // Hotfix V3.1.1: Always normalize the persisted/legacy project before
  // mutating nested V3.1 lifecycle fields such as writeState. This makes
  // lifecycle confirmation safe even when the stored profile was created
  // by V3.0.x or an older ProjectManager implementation.
  let project = getProject_(input.projectId || getActiveProjectId_());
  if (!project) throw new Error('PROJECT_NOT_FOUND');
  project = normalizeProjectProfileV31_(project);

  const projectType = safeString_(input.projectType).trim().toUpperCase();
  const mode = safeString_(input.provisioningMode).trim().toUpperCase();

  if (!isAllowedValueV31_(projectType, V3_CONFIG.PROJECT_TYPES) || projectType === 'UNSPECIFIED') {
    throw new Error('Project Type không hợp lệ.');
  }
  if (!isAllowedValueV31_(mode, V3_CONFIG.PROVISIONING_MODES) || mode === 'UNSET') {
    throw new Error('Setup Mode không hợp lệ.');
  }
  if (!canChangeProvisioningModeV31_(project) && project.provisioningMode !== mode) {
    throw new Error('Provisioning Mode đã bị khóa bởi trạng thái hiện tại của project.');
  }

  const evidence = normalizeArrayV31_(project.upgrade && project.upgrade.evidence);
  if (mode === 'NEW_STACK' && evidence.length && input.acknowledgeLegacyEvidence !== true) {
    const err = new Error('Project có dấu hiệu migration/V2. Hãy xác nhận acknowledgeLegacyEvidence trước khi chọn NEW_STACK.');
    err.code = 'LEGACY_EVIDENCE_REQUIRES_CONFIRMATION';
    throw err;
  }

  project.projectType = projectType;
  project.provisioningMode = mode;
  if (input.targetPageUrl !== undefined) project.targetPageUrl = normalizeUrl_(input.targetPageUrl);

  if (mode === 'NEW_STACK') {
    project.migration = createEmptyMigrationStateV31_('NEW_STACK');
  } else {
    const previous = normalizeMigrationStateV31_(project.migration, 'MIGRATE_V2');
    project.migration = previous;
    project.migration.required = true;
    if (['NOT_REQUIRED', 'UNCLASSIFIED'].indexOf(project.migration.status) !== -1) project.migration.status = 'PENDING';
  }

  project.upgrade = normalizeUpgradeStateV31_(project.upgrade);
  project.upgrade.requiresLifecycleConfirmation = false;
  project.upgrade.suggestedProjectType = '';
  project.upgrade.suggestedProvisioningMode = '';

  project.writeState.lifecycleLocked = false;
  project.writeState.lockedAt = '';
  project = setProjectWriteStateV31_(project, false, 'LIFECYCLE_CONFIRMED_SHADOW_MODE');

  saveProject_(project);
  syncProjectConfigSheet_(project);
  logEvent_(project.projectId, 'PROJECT_LIFECYCLE_CONFIRMED', {
    result: 'SUCCESS',
    projectType: projectType,
    provisioningMode: mode
  });
  return sanitizeProjectForClient_(project);
}

function enableProjectWriteV31_(project) {
  project = normalizeProjectProfileV31_(project);
  const validation = validateProjectWriteReadyV31_(project);
  project.writeState.lastValidatedAt = nowIso_();
  project.writeState.validation = {
    ready: validation.ready,
    errors: validation.errors.slice(),
    warnings: validation.warnings.slice()
  };

  if (!validation.ready) {
    saveProject_(project);
    const err = new Error('Project chưa sẵn sàng để Enable Write: ' + validation.errors.join(', '));
    err.code = 'PROJECT_NOT_WRITE_READY';
    err.validation = validation;
    throw err;
  }

  project = setProjectWriteStateV31_(project, true, '');
  project.writeState.lifecycleLocked = true;
  project.writeState.lockedAt = nowIso_();
  saveProject_(project);
  syncProjectConfigSheet_(project);
  return project;
}

function disableProjectWriteV31_(project, reason) {
  project = setProjectWriteStateV31_(project, false, reason || 'MANUAL_DISABLE');
  saveProject_(project);
  syncProjectConfigSheet_(project);
  return project;
}
