/**
 * GES V4 G1 lifecycle/profile compatibility helpers.
 * Lifecycle storage remains V3.1-compatible during G1; V4 content/entity models are independent.
 *
 * V3.1 deliberately preserves the existing flat V3 fields
 * (rootFolderId, brandName, websiteUrl, folders.*, writeEnabled, shadowMode)
 * so all existing exporter/scanner modules continue to work unchanged.
 * New lifecycle fields are added alongside them.
 */

function isAllowedValueV31_(value, allowed) {
  return allowed.indexOf(value) !== -1;
}

function normalizeArrayV31_(value) {
  return Array.isArray(value) ? value.slice() : [];
}

function createEmptyMigrationStateV31_(mode) {
  const isMigration = mode === 'MIGRATE_V2';
  return {
    required: isMigration,
    status: isMigration ? 'PENDING' : (mode === 'NEW_STACK' ? 'NOT_REQUIRED' : 'UNCLASSIFIED'),
    sourceVersion: '',
    previewedAt: '',
    backup: {
      created: false,
      fileId: '',
      fileUrl: '',
      createdAt: ''
    },
    startedAt: '',
    completedAt: '',
    verifiedAt: '',
    verification: {
      verified: false,
      sourceDocsChecked: 0,
      slidesChecked: 0,
      pdfsChecked: 0,
      docxChecked: 0,
      fileIdsPreserved: false,
      errors: [],
      warnings: []
    },
    rollback: {
      available: false,
      backupFileId: '',
      lastRollbackAt: ''
    },
    lastError: ''
  };
}

function createEmptyWriteStateV31_(enabled) {
  enabled = !!enabled;
  return {
    shadowMode: !enabled,
    writeEnabled: enabled,
    enabledAt: enabled ? nowIso_() : '',
    disabledAt: enabled ? '' : nowIso_(),
    disabledReason: enabled ? '' : 'INITIAL_SHADOW_MODE',
    lastValidatedAt: '',
    validation: {
      ready: false,
      errors: [],
      warnings: []
    },
    lifecycleLocked: false,
    lockedAt: ''
  };
}

function createEmptyUpgradeStateV31_() {
  return {
    upgradedFrom: '',
    upgradedAt: '',
    requiresLifecycleConfirmation: false,
    suggestedProjectType: '',
    suggestedProvisioningMode: '',
    evidence: [],
    notes: []
  };
}

function normalizeMigrationStateV31_(migration, mode) {
  const base = createEmptyMigrationStateV31_(mode);
  migration = migration || {};

  // Backward-compatible V3.0 migration fields.
  const legacyBackupId = safeString_(migration.lastBackupFileId || '');
  const legacyBackupUrl = safeString_(migration.lastBackupFileUrl || '');
  const legacyMigratedAt = safeString_(migration.lastMigrationAt || migration.migratedAt || '');

  base.required = migration.required !== undefined ? !!migration.required : base.required;
  base.status = safeString_(migration.status || base.status);
  base.sourceVersion = safeString_(migration.sourceVersion || '');
  base.previewedAt = safeString_(migration.previewedAt || '');

  const b = migration.backup || {};
  base.backup = {
    created: b.created !== undefined ? !!b.created : !!legacyBackupId,
    fileId: safeString_(b.fileId || legacyBackupId),
    fileUrl: safeString_(b.fileUrl || legacyBackupUrl),
    createdAt: safeString_(b.createdAt || '')
  };

  base.startedAt = safeString_(migration.startedAt || '');
  base.completedAt = safeString_(migration.completedAt || legacyMigratedAt);
  base.verifiedAt = safeString_(migration.verifiedAt || '');

  const v = migration.verification || {};
  base.verification = {
    verified: v.verified !== undefined ? !!v.verified : !!base.verifiedAt,
    sourceDocsChecked: Number(v.sourceDocsChecked || 0),
    slidesChecked: Number(v.slidesChecked || 0),
    pdfsChecked: Number(v.pdfsChecked || 0),
    docxChecked: Number(v.docxChecked || 0),
    fileIdsPreserved: !!v.fileIdsPreserved,
    errors: normalizeArrayV31_(v.errors),
    warnings: normalizeArrayV31_(v.warnings)
  };

  const r = migration.rollback || {};
  base.rollback = {
    available: r.available !== undefined ? !!r.available : !!legacyBackupId,
    backupFileId: safeString_(r.backupFileId || legacyBackupId),
    lastRollbackAt: safeString_(r.lastRollbackAt || '')
  };

  base.lastError = safeString_(migration.lastError || '');

  // Enforce lifecycle invariants.
  if (mode === 'NEW_STACK') {
    base.required = false;
    base.status = 'NOT_REQUIRED';
    base.rollback.available = false;
  } else if (mode === 'MIGRATE_V2') {
    base.required = true;
    if (base.status === 'NOT_REQUIRED' || base.status === 'UNCLASSIFIED') base.status = 'PENDING';
  } else {
    base.required = false;
    if (!isAllowedValueV31_(base.status, V3_CONFIG.MIGRATION_STATUSES)) base.status = 'UNCLASSIFIED';
  }

  return base;
}

function normalizeWriteStateV31_(project) {
  project = project || {};
  const source = project.writeState || {};
  const legacyEnabled = source.writeEnabled !== undefined ? !!source.writeEnabled : !!project.writeEnabled;
  const state = createEmptyWriteStateV31_(legacyEnabled);

  state.writeEnabled = legacyEnabled;
  state.shadowMode = !legacyEnabled;
  state.enabledAt = safeString_(source.enabledAt || (legacyEnabled ? project.updatedAt || '' : ''));
  state.disabledAt = safeString_(source.disabledAt || '');
  state.disabledReason = safeString_(source.disabledReason || '');
  state.lastValidatedAt = safeString_(source.lastValidatedAt || '');

  const validation = source.validation || {};
  state.validation = {
    ready: !!validation.ready,
    errors: normalizeArrayV31_(validation.errors),
    warnings: normalizeArrayV31_(validation.warnings)
  };

  state.lifecycleLocked = !!source.lifecycleLocked;
  state.lockedAt = safeString_(source.lockedAt || '');
  return state;
}

function normalizeUpgradeStateV31_(upgrade) {
  const base = createEmptyUpgradeStateV31_();
  upgrade = upgrade || {};
  base.upgradedFrom = safeString_(upgrade.upgradedFrom || '');
  base.upgradedAt = safeString_(upgrade.upgradedAt || '');
  base.requiresLifecycleConfirmation = !!upgrade.requiresLifecycleConfirmation;
  base.suggestedProjectType = safeString_(upgrade.suggestedProjectType || '');
  base.suggestedProvisioningMode = safeString_(upgrade.suggestedProvisioningMode || '');
  base.evidence = normalizeArrayV31_(upgrade.evidence);
  base.notes = normalizeArrayV31_(upgrade.notes);
  return base;
}

function normalizeProjectProfileV31_(raw) {
  const p = cloneJson_(raw || {});

  p.schemaVersion = V3_CONFIG.PROFILE_SCHEMA_VERSION;
  p.projectId = safeString_(p.projectId || '');
  p.projectName = normalizeName_(p.projectName || p.brandName || p.rootFolderName || '');
  p.projectKeyword = normalizeName_(p.projectKeyword || p.projectName || p.brandName || p.rootFolderName || '');
  p.projectType = safeString_(p.projectType || 'UNSPECIFIED');
  p.provisioningMode = safeString_(p.provisioningMode || 'UNSET');

  if (!isAllowedValueV31_(p.projectType, V3_CONFIG.PROJECT_TYPES)) p.projectType = 'UNSPECIFIED';
  if (!isAllowedValueV31_(p.provisioningMode, V3_CONFIG.PROVISIONING_MODES)) p.provisioningMode = 'UNSET';

  p.targetPageUrl = normalizeUrl_(p.targetPageUrl || '');
  p.enabled = p.enabled !== false;

  // Preserve the existing flat fields used by V3.0 modules.
  p.rootFolderId = safeString_(p.rootFolderId || '');
  p.rootFolderName = normalizeName_(p.rootFolderName || '');
  p.brandName = normalizeName_(p.brandName || p.projectName || p.rootFolderName || '');
  p.websiteUrl = normalizeUrl_(p.websiteUrl || '');
  p.googleMapsUrl = normalizeUrl_(p.googleMapsUrl || '');
  p.googleSitesUrl = normalizeUrl_(p.googleSitesUrl || '');

  // V4.6.5 Extended Google Assets. Google Sites keeps its legacy flat alias
  // while all optional/manual Google-product URLs live in one normalized block.
  var extendedSeedV465 = Object.assign({}, p.extendedGoogleAssets || {});
  if (!extendedSeedV465.googleSitesUrl && p.googleSitesUrl) extendedSeedV465.googleSitesUrl = p.googleSitesUrl;
  p.extendedGoogleAssets = typeof normalizeExtendedGoogleAssetsV465_ === 'function'
    ? normalizeExtendedGoogleAssetsV465_(extendedSeedV465)
    : extendedSeedV465;
  if (p.extendedGoogleAssets && p.extendedGoogleAssets.googleSitesUrl) {
    p.googleSitesUrl = p.extendedGoogleAssets.googleSitesUrl;
  }
  p.logoFileId = safeString_(p.logoFileId || '');
  p.phone = safeString_(p.phone || '');
  p.email = safeString_(p.email || '');
  p.address = safeString_(p.address || '');
  p.folders = p.folders || {};
  p.projectStructure = typeof normalizeProjectStructureStateV41_ === 'function'
    ? normalizeProjectStructureStateV41_(p.projectStructure)
    : (p.projectStructure || {});
  p.registrySheetId = safeString_(p.registrySheetId || '');
  p.privateStorage = typeof normalizePrivateStorageStateV45_ === 'function'
    ? normalizePrivateStorageStateV45_(p.privateStorage)
    : (p.privateStorage || {});

  // GES V4 G1 model settings. These fields are additive and do not change
  // the proven V3.1 lifecycle storage contract.
  p.entityProfile = p.entityProfile && typeof p.entityProfile === 'object' ? p.entityProfile : {};
  p.contentModelConfig = Object.assign({
    schemaVersion: GES_CONFIG.CONTENT_MODEL_SCHEMA_VERSION,
    language: 'vi-VN',
    buildOnDemand: true,
    cacheEnabled: false
  }, p.contentModelConfig || {});

  // Branding Layer. Keep flat aliases in sync so legacy modules continue
  // to work while new exporters use project.branding.
  p.branding = normalizeBrandingConfig_(p);
  p.brandName = normalizeName_(p.branding.brandName || p.brandName || p.projectName || p.rootFolderName || '');
  p.websiteUrl = normalizeUrl_(p.branding.websiteUrl || p.websiteUrl || '');
  p.logoFileId = safeString_((p.branding.logo && p.branding.logo.driveFileId) || p.logoFileId || '');
  p.phone = safeString_((p.branding.phones && p.branding.phones[0]) || p.phone || '');
  p.phone2 = safeString_((p.branding.phones && p.branding.phones[1]) || p.phone2 || '');
  p.email = safeString_(p.branding.email || p.email || '');
  p.address = safeString_(p.branding.address || p.address || '');

  p.migration = normalizeMigrationStateV31_(p.migration, p.provisioningMode);
  p.writeState = normalizeWriteStateV31_(p);
  p.upgrade = normalizeUpgradeStateV31_(p.upgrade);

  // Compatibility aliases used by existing V3.0 modules and UI code.
  p.writeEnabled = !!p.writeState.writeEnabled;
  p.shadowMode = !!p.writeState.shadowMode;


  p.scheduledRegistrySync = Object.assign({
    enabled: V3_CONFIG.SCANNER.DEFAULT_ENABLED,
    quickScanIntervalMinutes: V3_CONFIG.SCANNER.DEFAULT_INTERVAL_MINUTES,
    fullReconcileIntervalHours: V3_CONFIG.SCANNER.FULL_RECONCILE_HOURS,
    lastQuickScanAt: '',
    lastFullReconcileAt: ''
  }, p.scheduledRegistrySync || {});

  p.createdAt = safeString_(p.createdAt || nowIso_());
  p.updatedAt = safeString_(p.updatedAt || p.createdAt);
  p.audit = Object.assign({
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    createdByVersion: V3_CONFIG.PROFILE_SCHEMA_VERSION,
    lastUpdatedByVersion: V3_CONFIG.PROFILE_SCHEMA_VERSION
  }, p.audit || {});

  return p;
}

function validateProjectProfileV31_(project) {
  const errors = [];
  const warnings = [];
  const p = normalizeProjectProfileV31_(project);

  if (!p.projectId) errors.push('PROJECT_ID_REQUIRED');
  if (!p.projectName) errors.push('PROJECT_NAME_REQUIRED');
  if (!p.projectKeyword) warnings.push('PROJECT_KEYWORD_EMPTY_FALLBACK_TO_PROJECT_NAME');
  if (!p.rootFolderId) errors.push('ROOT_FOLDER_REQUIRED');

  if (!isAllowedValueV31_(p.projectType, V3_CONFIG.PROJECT_TYPES)) errors.push('INVALID_PROJECT_TYPE');
  if (!isAllowedValueV31_(p.provisioningMode, V3_CONFIG.PROVISIONING_MODES)) errors.push('INVALID_PROVISIONING_MODE');

  if (p.provisioningMode === 'UNSET') warnings.push('PROVISIONING_MODE_REQUIRES_CONFIRMATION');
  if (p.projectType === 'UNSPECIFIED') warnings.push('PROJECT_TYPE_REQUIRES_CONFIRMATION');

  if (p.provisioningMode === 'NEW_STACK') {
    if (p.migration.required !== false) errors.push('NEW_STACK_MIGRATION_REQUIRED_INVALID');
    if (p.migration.status !== 'NOT_REQUIRED') errors.push('NEW_STACK_MIGRATION_STATUS_INVALID');
  }

  if (p.provisioningMode === 'MIGRATE_V2') {
    if (p.migration.required !== true) errors.push('MIGRATE_V2_MIGRATION_REQUIRED');
    if (p.writeState.writeEnabled && p.migration.status !== 'VERIFIED') {
      warnings.push('WRITE_ENABLED_BEFORE_MIGRATION_VERIFIED');
    }
  }

  if (p.writeState.shadowMode === p.writeState.writeEnabled) errors.push('INVALID_WRITE_STATE');

  return {
    valid: errors.length === 0,
    errors: errors,
    warnings: warnings,
    project: p
  };
}

function setProjectWriteStateV31_(project, enabled, reason) {
  project = normalizeProjectProfileV31_(project);
  enabled = !!enabled;
  project.writeState.writeEnabled = enabled;
  project.writeState.shadowMode = !enabled;
  if (enabled) {
    project.writeState.enabledAt = nowIso_();
    project.writeState.disabledAt = '';
    project.writeState.disabledReason = '';
  } else {
    project.writeState.disabledAt = nowIso_();
    project.writeState.disabledReason = safeString_(reason || 'MANUAL_DISABLE');
  }
  project.writeEnabled = enabled;
  project.shadowMode = !enabled;
  return project;
}
