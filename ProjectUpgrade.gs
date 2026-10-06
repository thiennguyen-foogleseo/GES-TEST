/** V3.0.x -> V3.1 Project Profile upgrade and compatibility layer. */

function isProjectProfileV31_(project) {
  return !!project && String(project.schemaVersion || '') === String(V3_CONFIG.PROFILE_SCHEMA_VERSION);
}

function projectProfileBackupKeyV31_(projectId) {
  return V3_CONFIG.PROPERTY_KEYS.PROFILE_BACKUP_PREFIX + projectId;
}

function backupLegacyProjectProfileV31_(projectId, rawText) {
  if (!projectId || !rawText) return '';
  const props = getScriptProps_();
  const key = projectProfileBackupKeyV31_(projectId);
  // Keep the first exact pre-V3.1 snapshot. Do not overwrite it on later loads.
  if (!props.getProperty(key)) props.setProperty(key, rawText);
  return key;
}

function detectLegacyMigrationEvidenceV31_(old) {
  old = old || {};
  const m = old.migration || {};
  const evidence = [];

  if (m.lastBackupFileId) evidence.push('LEGACY_MIGRATION_BACKUP');
  if (m.backup && m.backup.fileId) evidence.push('LEGACY_MIGRATION_BACKUP_V31_SHAPE');
  if (m.lastMigrationAt || m.migratedAt || m.completedAt) evidence.push('LEGACY_MIGRATION_COMPLETED_AT');
  if (m.verifiedAt || (m.verification && m.verification.verified)) evidence.push('LEGACY_MIGRATION_VERIFIED');
  if (m.rollbackAvailable || (m.rollback && m.rollback.available)) evidence.push('LEGACY_ROLLBACK_AVAILABLE');

  return evidence;
}

function inferLegacyMigrationStatusV31_(old) {
  const m = (old && old.migration) || {};
  if (m.status && isAllowedValueV31_(m.status, V3_CONFIG.MIGRATION_STATUSES)) return m.status;
  if (m.verifiedAt || (m.verification && m.verification.verified)) return 'VERIFIED';
  if (m.lastMigrationAt || m.migratedAt || m.completedAt) return 'COMPLETED';
  if (m.lastBackupFileId || (m.backup && m.backup.fileId)) return 'BACKED_UP';
  return 'PENDING';
}

function suggestProjectTypeForUpgradeV31_(old) {
  if (old.projectType && isAllowedValueV31_(old.projectType, V3_CONFIG.PROJECT_TYPES)) {
    return { value: old.projectType, suggestion: '' };
  }

  if (old.targetPageUrl) return { value: 'UNSPECIFIED', suggestion: 'PAGE_TARGET' };

  return { value: 'UNSPECIFIED', suggestion: '' };
}

function suggestProvisioningForUpgradeV31_(old, evidence) {
  if (old.provisioningMode && isAllowedValueV31_(old.provisioningMode, V3_CONFIG.PROVISIONING_MODES)) {
    return { value: old.provisioningMode, suggestion: '' };
  }
  if ((evidence || []).length) return { value: 'MIGRATE_V2', suggestion: 'MIGRATE_V2' };
  return { value: 'UNSET', suggestion: 'NEW_STACK' };
}

function upgradeLegacyProjectProfileToV31_(old, rawText) {
  old = cloneJson_(old || {});
  if (!old.projectId) throw new Error('Legacy Project Profile thiếu projectId.');

  backupLegacyProjectProfileV31_(old.projectId, rawText || JSON.stringify(old));

  const sourceVersion = safeString_(old.schemaVersion || '3.0.x');
  const evidence = detectLegacyMigrationEvidenceV31_(old);
  const typeInfo = suggestProjectTypeForUpgradeV31_(old);
  const modeInfo = suggestProvisioningForUpgradeV31_(old, evidence);

  old.projectType = typeInfo.value;
  old.provisioningMode = modeInfo.value;

  let p = normalizeProjectProfileV31_(old);

  if (p.provisioningMode === 'MIGRATE_V2') {
    p.migration.required = true;
    p.migration.status = inferLegacyMigrationStatusV31_(old);
  } else if (p.provisioningMode === 'NEW_STACK') {
    p.migration = createEmptyMigrationStateV31_('NEW_STACK');
  } else {
    p.migration = createEmptyMigrationStateV31_('UNSET');
  }

  p.upgrade = {
    upgradedFrom: sourceVersion,
    upgradedAt: nowIso_(),
    requiresLifecycleConfirmation: p.projectType === 'UNSPECIFIED' || p.provisioningMode === 'UNSET',
    suggestedProjectType: typeInfo.suggestion || '',
    suggestedProvisioningMode: modeInfo.suggestion || '',
    evidence: evidence,
    notes: ['V3.0.x profile was upgraded without changing Drive assets. Confirm lifecycle before enabling new V3.1 writes.']
  };

  // Preserve the previous write state exactly, but unresolved lifecycle will be blocked by WriteGuard.
  p.writeState = normalizeWriteStateV31_(old);
  p.writeEnabled = p.writeState.writeEnabled;
  p.shadowMode = p.writeState.shadowMode;

  p.audit = p.audit || {};
  p.audit.lastUpdatedByVersion = V3_CONFIG.PROFILE_SCHEMA_VERSION;
  p.audit.updatedAt = nowIso_();
  p.updatedAt = p.audit.updatedAt;

  const validation = validateProjectProfileV31_(p);
  // Provisional UNSET/UNSPECIFIED profiles are valid with warnings, not fatal errors.
  if (!validation.valid) {
    throw new Error('Không thể upgrade Project Profile V3.0 -> V3.1: ' + validation.errors.join(', '));
  }
  return validation.project;
}

function upgradeProjectProfileIfNeededV31_(project, rawText) {
  if (!project) return null;
  if (isProjectProfileV31_(project)) return normalizeProjectProfileV31_(project);
  return upgradeLegacyProjectProfileToV31_(project, rawText);
}

function upgradeAllProjectProfilesToV31() {
  const ids = listProjectIds_();
  const results = [];
  const props = getScriptProps_();

  ids.forEach(function(projectId) {
    try {
      const key = projectPropertyKey_(projectId);
      const rawText = props.getProperty(key);
      const old = rawText ? jsonParseSafe_(rawText, null) : null;
      if (!old) throw new Error('Profile missing');
      const p = upgradeProjectProfileIfNeededV31_(old, rawText);
      props.setProperty(key, JSON.stringify(p));
      results.push({ projectId: projectId, success: true, schemaVersion: p.schemaVersion, requiresConfirmation: !!p.upgrade.requiresLifecycleConfirmation });
    } catch (e) {
      results.push({ projectId: projectId, success: false, message: e.message });
    }
  });

  return { success: results.every(function(r) { return r.success; }), results: results };
}

function getLegacyProjectProfileBackupV31(projectId) {
  const raw = getScriptProps_().getProperty(projectProfileBackupKeyV31_(projectId));
  return raw ? jsonParseSafe_(raw, null) : null;
}
