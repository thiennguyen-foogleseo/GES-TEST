/** Project profiles and active-project selection for GES V4 G1. */

function projectPropertyKey_(projectId) {
  return V3_CONFIG.PROPERTY_KEYS.PROJECT_PREFIX + projectId;
}

function listProjectIds_() {
  const raw = getScriptProps_().getProperty(V3_CONFIG.PROPERTY_KEYS.PROJECT_INDEX);
  if (!raw) return [];
  const parsed = jsonParseSafe_(raw, []);
  return Array.isArray(parsed) ? parsed.filter(function(id) { return !!id; }) : [];
}

function saveProjectIndex_(ids) {
  const normalized = Array.isArray(ids) ? ids.filter(function(id) { return !!id; }) : [];
  getScriptProps_().setProperty(V3_CONFIG.PROPERTY_KEYS.PROJECT_INDEX, JSON.stringify(normalized));
}

function getProject_(projectId) {
  const key = projectPropertyKey_(projectId);
  const rawText = getScriptProps_().getProperty(key);
  if (!rawText) return null;

  const parsed = jsonParseSafe_(rawText, null);
  if (!parsed) return null;

  const upgraded = upgradeProjectProfileIfNeededV31_(parsed, rawText);

  // Persist the upgrade/normalization only when the stored version is not V3.1.
  if (!isProjectProfileV31_(parsed)) {
    getScriptProps_().setProperty(key, JSON.stringify(upgraded));
  }

  return upgraded;
}

function saveProject_(project) {
  if (!project || !project.projectId) throw new Error('Project profile thiếu projectId.');

  project = normalizeProjectProfileV31_(project);
  project.updatedAt = nowIso_();
  if (!project.createdAt) project.createdAt = project.updatedAt;
  project.audit = project.audit || {};
  project.audit.updatedAt = project.updatedAt;
  if (!project.audit.createdAt) project.audit.createdAt = project.createdAt;
  project.audit.lastUpdatedByVersion = V3_CONFIG.PROFILE_SCHEMA_VERSION;

  const validation = validateProjectProfileV31_(project);
  if (!validation.valid) {
    throw new Error('Project Profile V3.1 không hợp lệ: ' + validation.errors.join(', '));
  }
  project = validation.project;

  getScriptProps_().setProperty(projectPropertyKey_(project.projectId), JSON.stringify(project));

  const ids = listProjectIds_();
  if (ids.indexOf(project.projectId) === -1) {
    ids.push(project.projectId);
    saveProjectIndex_(ids);
  }
  return project;
}

function listProjects() {
  return listProjectIds_().map(getProject_).filter(function(p) { return p && p.enabled !== false; });
}

function getActiveProjectId_() {
  const props = getScriptProps_();
  const explicit = props.getProperty(V3_CONFIG.PROPERTY_KEYS.ACTIVE_PROJECT);
  if (explicit && getProject_(explicit)) return explicit;
  const ids = listProjectIds_();
  if (!ids.length) return '';
  props.setProperty(V3_CONFIG.PROPERTY_KEYS.ACTIVE_PROJECT, ids[0]);
  return ids[0];
}

function getActiveProject_() {
  const id = getActiveProjectId_();
  return id ? getProject_(id) : null;
}

function setActiveProject(projectId) {
  if (!getProject_(projectId)) throw new Error('Project không tồn tại: ' + projectId);
  getScriptProps_().setProperty(V3_CONFIG.PROPERTY_KEYS.ACTIVE_PROJECT, projectId);
  return sanitizeProjectForClient_(getProject_(projectId));
}

function buildDefaultProjectProfile_(input) {
  input = input || {};
  const rootId = extractDriveId_(input.rootFolderId || input.rootFolderUrl);
  if (!rootId) throw new Error('Không đọc được Root Drive Folder ID.');

  const root = DriveApp.getFolderById(rootId);
  const rootName = root.getName();
  const brand = normalizeName_(input.brandName || rootName);
  const projectName = normalizeName_(input.projectName || rootName);
  const projectId = input.projectId || ('prj_' + rootId.substring(0, 12));
  const projectType = safeString_(input.projectType || 'OTHER').trim().toUpperCase();
  const provisioningMode = safeString_(input.provisioningMode || 'NEW_STACK').trim().toUpperCase();

  if (!isAllowedValueV31_(projectType, V3_CONFIG.PROJECT_TYPES) || projectType === 'UNSPECIFIED') {
    throw new Error('Project Type không hợp lệ: ' + projectType);
  }
  if (!isAllowedValueV31_(provisioningMode, V3_CONFIG.PROVISIONING_MODES) || provisioningMode === 'UNSET') {
    throw new Error('Provisioning Mode không hợp lệ: ' + provisioningMode);
  }

  let project = {
    schemaVersion: V3_CONFIG.PROFILE_SCHEMA_VERSION,
    projectId: projectId,
    projectName: projectName,
    projectKeyword: normalizeName_(input.projectKeyword || projectName),
    projectType: projectType,
    provisioningMode: provisioningMode,
    targetPageUrl: normalizeUrl_(input.targetPageUrl),
    enabled: true,
    rootFolderId: rootId,
    rootFolderName: rootName,
    brandName: brand,
    websiteUrl: normalizeUrl_(input.websiteUrl),
    googleMapsUrl: normalizeUrl_(input.googleMapsUrl),
    googleSitesUrl: normalizeUrl_(input.googleSitesUrl),
    logoFileId: extractDriveId_(input.logoFileId || input.logoFileUrl),
    phone: safeString_(input.phone),
    phone2: safeString_(input.phone2),
    email: safeString_(input.email),
    address: safeString_(input.address),
    branding: {
      enabled: input.brandingEnabled !== false,
      brandName: brand,
      websiteUrl: normalizeUrl_(input.websiteUrl),
      phones: [safeString_(input.phone), safeString_(input.phone2)].filter(function(v) { return !!v; }),
      email: safeString_(input.email),
      address: safeString_(input.address),
      logo: {
        enabled: true,
        driveFileId: extractDriveId_(input.logoFileId || input.logoFileUrl),
        publicUrl: normalizeUrl_(input.logoPublicUrl)
      },
      cta: {
        enabled: true,
        driveFileId: extractDriveId_(input.ctaFileId || input.ctaFileUrl),
        publicUrl: normalizeUrl_(input.ctaPublicUrl),
        label: safeString_(input.ctaLabel || 'TƯ VẤN NGAY')
      },
      targets: {
        slides: true,
        docs: true,
        pdf: true,
        docx: true,
        html: true
      }
    },
    folders: {},
    projectStructure: typeof createProjectStructureStateV41_ === 'function' ? createProjectStructureStateV41_() : {},
    registrySheetId: '',
    privateStorage: typeof createPrivateStorageStateV45_ === 'function' ? createPrivateStorageStateV45_() : {},
    entityProfile: {},
    contentModelConfig: {
      schemaVersion: GES_CONFIG.CONTENT_MODEL_SCHEMA_VERSION,
      language: 'vi-VN',
      buildOnDemand: true,
      cacheEnabled: false
    },
    migration: createEmptyMigrationStateV31_(provisioningMode),
    writeState: createEmptyWriteStateV31_(false),
    upgrade: createEmptyUpgradeStateV31_(),
    scheduledRegistrySync: {
      enabled: V3_CONFIG.SCANNER.DEFAULT_ENABLED,
      quickScanIntervalMinutes: V3_CONFIG.SCANNER.DEFAULT_INTERVAL_MINUTES,
      fullReconcileIntervalHours: V3_CONFIG.SCANNER.FULL_RECONCILE_HOURS,
      lastQuickScanAt: '',
      lastFullReconcileAt: ''
    },
    createdAt: nowIso_(),
    updatedAt: nowIso_(),
    audit: {
      createdAt: nowIso_(),
      updatedAt: nowIso_(),
      createdByVersion: V3_CONFIG.PROFILE_SCHEMA_VERSION,
      lastUpdatedByVersion: V3_CONFIG.PROFILE_SCHEMA_VERSION
    }
  };

  project = setProjectWriteStateV31_(project, false, 'INITIAL_SHADOW_MODE');
  return normalizeProjectProfileV31_(project);
}

function addProject(input) {
  input = input || {};
  if (typeof assertExplicitFirstProjectInputV452_ === 'function') {
    assertExplicitFirstProjectInputV452_(input);
  }
  const project = buildDefaultProjectProfile_(input);
  // V4.1: NEW_STACK gets canonical folders immediately. MIGRATE_V2 is
  // intentionally read-only here: legacy structure is preserved and no
  // automatic migration/provisioning is performed.
  ensureProjectFolders_(project, project.provisioningMode === 'NEW_STACK');
  // V4.5: new projects start with a private Registry from day one.
  // Existing projects are migrated only by explicit Preview -> Apply.
  if (typeof provisionPrivateSystemStorageForNewProjectV45_ === 'function') {
    provisionPrivateSystemStorageForNewProjectV45_(project);
  }
  saveProject_(project);
  ensureRegistrySpreadsheet_(project);
  saveProject_(project);
  if (!getActiveProjectId_()) setActiveProject(project.projectId);
  logEvent_(project.projectId, 'PROJECT_CREATED', {
    rootFolderId: project.rootFolderId,
    projectType: project.projectType,
    provisioningMode: project.provisioningMode,
    result: 'SUCCESS'
  });
  return sanitizeProjectForClient_(project);
}

function setupV3FirstRun() {
  const existing = listProjects();
  if (existing.length) {
    return {
      success: true,
      setupRequired: false,
      code: 'PROJECT_EXISTS',
      message: 'GES V4.5.2 đã có project. Không chạy bootstrap ngầm.',
      project: sanitizeProjectForClient_(getActiveProject_())
    };
  }

  // V4.5.2 Clean Installation Baseline: first project creation is always
  // explicit. Never read BOOTSTRAP customer values and never touch Drive here.
  return {
    success: true,
    setupRequired: true,
    code: 'EXPLICIT_PROJECT_SETUP_REQUIRED',
    message: 'Chưa có project. Hãy dùng Add Project/Create First Project và nhập Root, Project Type, Brand, Website rõ ràng.',
    project: null
  };
}

function updateProjectSettingsCoreV463_(input) {
  input = input || {};
  let project = getProject_(input.projectId || getActiveProjectId_());
  if (!project) throw new Error('Không tìm thấy project.');

  ['projectName','projectKeyword','brandName','websiteUrl','googleMapsUrl','googleSitesUrl','phone','phone2','email','address','targetPageUrl'].forEach(function(k) {
    if (input[k] !== undefined) project[k] = safeString_(input[k]).trim();
  });

  if (input.projectType !== undefined) {
    const type = safeString_(input.projectType).trim().toUpperCase();
    if (!isAllowedValueV31_(type, V3_CONFIG.PROJECT_TYPES) || type === 'UNSPECIFIED') throw new Error('Project Type không hợp lệ.');
    project.projectType = type;
  }

  if (input.logoFileId !== undefined || input.logoFileUrl !== undefined) {
    project.logoFileId = extractDriveId_(input.logoFileId || input.logoFileUrl);
  }

  // V4.6.5: optional/manual Google product URLs are stored in one block.
  if (input.extendedGoogleAssets !== undefined) {
    var extCurrentV465 = Object.assign({}, project.extendedGoogleAssets || {});
    var extIncomingV465 = input.extendedGoogleAssets || {};
    Object.keys(extIncomingV465).forEach(function(k) { extCurrentV465[k] = extIncomingV465[k]; });
    if (input.googleSitesUrl !== undefined && extIncomingV465.googleSitesUrl === undefined) {
      extCurrentV465.googleSitesUrl = input.googleSitesUrl;
    }
    project.extendedGoogleAssets = typeof normalizeExtendedGoogleAssetsV465_ === 'function'
      ? normalizeExtendedGoogleAssetsV465_(extCurrentV465)
      : extCurrentV465;
    if (project.extendedGoogleAssets.googleSitesUrl) project.googleSitesUrl = project.extendedGoogleAssets.googleSitesUrl;
  } else if (input.googleSitesUrl !== undefined && typeof normalizeExtendedGoogleAssetsV465_ === 'function') {
    var extAliasV465 = Object.assign({}, project.extendedGoogleAssets || {}, { googleSitesUrl: input.googleSitesUrl });
    project.extendedGoogleAssets = normalizeExtendedGoogleAssetsV465_(extAliasV465);
  }

  // V4.6.3: nested branding values are merged, and empty CTA image fields are
  // valid persisted state. CTA remains optional; BrandingManager will surface
  // CTA_NOT_CONFIGURED only as a warning when appropriate.
  if (input.branding) {
    const current = getProjectBranding_(project);
    const incoming = input.branding || {};

    if (incoming.enabled !== undefined) current.enabled = !!incoming.enabled;
    if (incoming.brandName !== undefined) current.brandName = safeString_(incoming.brandName).trim();
    if (incoming.websiteUrl !== undefined) current.websiteUrl = normalizeUrl_(incoming.websiteUrl);
    if (incoming.phones !== undefined) current.phones = brandingNormalizePhones_(incoming.phones);
    if (incoming.email !== undefined) current.email = safeString_(incoming.email).trim();
    if (incoming.address !== undefined) current.address = safeString_(incoming.address).trim();

    if (incoming.logo) current.logo = Object.assign(current.logo || {}, incoming.logo);
    if (incoming.cta) current.cta = Object.assign(current.cta || {}, incoming.cta);
    if (incoming.targets) current.targets = Object.assign(current.targets || {}, incoming.targets);
    if (incoming.slides) current.slides = Object.assign(current.slides || {}, incoming.slides);
    if (incoming.docs) current.docs = Object.assign(current.docs || {}, incoming.docs);
    if (incoming.html) current.html = Object.assign(current.html || {}, incoming.html);

    project.branding = normalizeBrandingConfig_({
      projectName: project.projectName,
      brandName: project.brandName,
      websiteUrl: project.websiteUrl,
      logoFileId: project.logoFileId,
      phone: project.phone,
      phone2: project.phone2,
      email: project.email,
      address: project.address,
      branding: current
    });

    // Keep V3.0/V3.1 compatibility aliases synchronized.
    project.brandName = project.branding.brandName || project.brandName;
    project.websiteUrl = project.branding.websiteUrl || project.websiteUrl;
    project.logoFileId = (project.branding.logo && project.branding.logo.driveFileId) || project.logoFileId;
    project.phone = (project.branding.phones && project.branding.phones[0]) || '';
    project.phone2 = (project.branding.phones && project.branding.phones[1]) || '';
    project.email = project.branding.email || '';
    project.address = project.branding.address || '';
  }

  if (input.scheduledRegistrySync) {
    project.scheduledRegistrySync = Object.assign(project.scheduledRegistrySync || {}, input.scheduledRegistrySync);
  }

  // Project Settings must not provision/migrate folders implicitly in V4.1.
  ensureProjectFolders_(project, false);
  project = saveProject_(project);
  const configSync = syncProjectConfigSheet_(project);
  return { project: project, configSync: configSync || null };
}

// Backward-compatible API. Existing callers still receive the project object.
function updateProjectSettings(input) {
  const result = updateProjectSettingsCoreV463_(input);
  return sanitizeProjectForClient_(result.project);
}

// V4.6.3 transactional UI API: save Project Profile, sync Project Config,
// then read the Registry back and verify the user-facing settings one-to-one.
function saveProjectSettingsV463(input) {
  const result = updateProjectSettingsCoreV463_(input);
  const project = result.project;
  const verification = typeof verifyProjectConfigPersistenceV463_ === 'function'
    ? verifyProjectConfigPersistenceV463_(project)
    : {
        success: false,
        checkedKeys: 0,
        mismatches: [{ key: 'Verifier', expected: 'INSTALLED', actual: 'MISSING' }],
        code: 'PROJECT_CONFIG_VERIFIER_MISSING'
      };

  const branding = getProjectBranding_(project);
  const ctaConfigured = !!(branding && branding.cta && (branding.cta.driveFileId || branding.cta.publicUrl));
  const syncOk = !!(result.configSync && result.configSync.success);
  const success = syncOk && !!verification.success;

  return {
    success: success,
    version: '4.6.3',
    project: sanitizeProjectForClient_(project),
    persistence: {
      profileSaved: true,
      projectConfigSynced: syncOk,
      projectConfigVerified: !!verification.success,
      checkedKeys: verification.checkedKeys || 0,
      mismatches: verification.mismatches || [],
      registrySheetId: project.registrySheetId || '',
      syncedAt: result.configSync && result.configSync.syncedAt || '',
      ctaOptional: true,
      ctaConfigured: ctaConfigured
    }
  };
}


// V4.6.5 UI API. Keeps V4.6.3 persistence semantics and adds Extended
// Google Assets Registry verification/projection metadata.
function saveProjectSettingsV465(input) {
  const result = updateProjectSettingsCoreV463_(input);
  const project = result.project;
  const verification = typeof verifyProjectConfigPersistenceV463_ === 'function'
    ? verifyProjectConfigPersistenceV463_(project)
    : { success:false, checkedKeys:0, mismatches:[{key:'Verifier',expected:'INSTALLED',actual:'MISSING'}] };
  const branding = getProjectBranding_(project);
  const ctaConfigured = !!(branding && branding.cta && (branding.cta.driveFileId || branding.cta.publicUrl));
  const syncOk = !!(result.configSync && result.configSync.success);
  const ext = typeof getExtendedGoogleAssetDescriptorsV465_ === 'function' ? getExtendedGoogleAssetDescriptorsV465_(project) : [];
  const extSync = result.configSync && result.configSync.extendedAssets || null;
  return {
    success: syncOk && !!verification.success,
    version: '4.6.5',
    project: sanitizeProjectForClient_(project),
    persistence: {
      profileSaved: true,
      projectConfigSynced: syncOk,
      projectConfigVerified: !!verification.success,
      checkedKeys: verification.checkedKeys || 0,
      mismatches: verification.mismatches || [],
      registrySheetId: project.registrySheetId || '',
      syncedAt: result.configSync && result.configSync.syncedAt || '',
      ctaOptional: true,
      ctaConfigured: ctaConfigured,
      extendedAssetsConfigured: ext.length,
      extendedAssetsRegistrySynced: !!(extSync && extSync.success),
      extendedAssetsRegistryRows: extSync && extSync.rowCount || 0
    }
  };
}

function setProjectWriteEnabled(projectId, enabled) {
  let project = getProject_(projectId || getActiveProjectId_());
  if (!project) throw new Error('Project không tồn tại.');

  if (enabled) {
    project = enableProjectWriteV31_(project);
    logEvent_(project.projectId, 'WRITE_ENABLED', { result: 'SUCCESS', provisioningMode: project.provisioningMode });
  } else {
    project = disableProjectWriteV31_(project, 'MANUAL_DISABLE');
    logEvent_(project.projectId, 'WRITE_DISABLED', { result: 'SUCCESS' });
  }

  return sanitizeProjectForClient_(project);
}

function disableProject(projectId) {
  let project = getProject_(projectId);
  if (!project) throw new Error('Project không tồn tại.');
  project.enabled = false;
  saveProject_(project);
  if (getActiveProjectId_() === projectId) {
    const next = listProjects()[0];
    if (next) setActiveProject(next.projectId);
  }
  return true;
}

function sanitizeProjectForClient_(project) {
  if (!project) return null;
  return cloneJson_(normalizeProjectProfileV31_(project));
}

function getProjectSetupSummary(projectId) {
  let project = getProject_(projectId || getActiveProjectId_());
  if (!project) throw new Error('Chưa có project. Chạy setupV3FirstRun() hoặc Add Project.');
  ensureProjectFolders_(project, false);
  project = saveProject_(project);
  return {
    project: sanitizeProjectForClient_(project),
    lifecycle: getProjectLifecycleState_(project),
    folders: getProjectFolderSummary_(project),
    registry: project.registrySheetId ? DriveApp.getFileById(project.registrySheetId).getUrl() : ''
  };
}
