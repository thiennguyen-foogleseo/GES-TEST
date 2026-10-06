/**
 * GES V4.4 - Unified Public Project Sheet singleton.
 *
 * One project -> one managed PUBLIC Google Sheet, stored directly in PROJECT_ROOT.
 * The private Asset Registry remains the source of truth.
 * Canonical public tabs:
 *   - Assets (unified Assets + URL Variants)
 *   - Content (Option B: all direct Google Docs in Articles)
 *
 * Legacy per-source Sheets and legacy Sheets folder are preserved and are NOT
 * auto-adopted/migrated by this module.
 */

const GES_SHEETS_ASSET_V4 = Object.freeze({
  VERSION: '1.4.0-unified-public-assets',
  GENERATED_TABS: ['Assets','Content']
});

/* ========================================================================== *
 * Public API
 * ========================================================================== */

function previewProjectSheetV4(projectId) {
  var project = resolveStructuredProjectV4_(projectId || '');
  var state = getProjectSingletonAssetStateV41_(project, 'PROJECT_URL_SHEET');
  var published = state.id ? getProjectPublicSheetPublishedInfoV43_(project, state.id) : {};
  var sharing = null;
  if (state.id) {
    try { sharing = inspectProjectPublicSheetSharingV43_(DriveApp.getFileById(state.id)); }
    catch (ignore) {}
  }
  var contentPreview = previewProjectContentProjectionV43(project.projectId);
  return {
    success: true,
    version: GES_SHEETS_ASSET_V4.VERSION,
    projectId: project.projectId,
    projectName: project.projectName,
    projectKeyword: getProjectKeywordV41_(project),
    status: state.status,
    sheetId: state.id || '',
    sheetUrl: state.url || '',
    resolutionMethod: state.resolutionMethod || '',
    legacyCandidateCount: Number(state.legacyCandidateCount || 0),
    fingerprint: getProjectManagedAssetFingerprintV41_(project, 'PROJECT_URL_SHEET'),
    generatedTabs: GES_SHEETS_ASSET_V4.GENERATED_TABS.slice(),
    sourceDocCount: contentPreview.sourceDocCount,
    contentRowCount: contentPreview.rowCount,
    anyoneWithLink: !!(sharing && sharing.anyoneWithLink),
    sharingAccess: sharing && sharing.access || '',
    publishedToWeb: !!published.publishedUrl,
    publishedUrl: published.publishedUrl || '',
    publishMode: 'MANUAL_PUBLISHED_URL_REQUIRED'
  };
}

function previewActiveProjectSheetV4() {
  return previewProjectSheetV4('');
}

function buildProjectSheetV4(projectId) {
  var project = resolveStructuredProjectV4_(projectId || '');
  assertProjectWritable_(project);
  var result = syncProjectSingletonAssetV41_(project, 'PROJECT_URL_SHEET');
  return {
    success: result.success !== false,
    version: GES_SHEETS_ASSET_V4.VERSION,
    projectId: project.projectId,
    projectName: project.projectName,
    result: result,
    validation: validateProjectPublicSheetV43(project.projectId)
  };
}

function buildActiveProjectSheetV4() {
  return buildProjectSheetV4('');
}

/** Compatibility alias: old Calendar mirror is retired in V4.3. */
function refreshProjectUrlSheetCalendarEventsV41(projectId) {
  return {
    success: true,
    skipped: true,
    code: 'RETIRED_PUBLIC_CALENDAR_EVENTS_TAB_V43',
    projectId: projectId || getActiveProjectId_()
  };
}

function refreshActiveProjectUrlSheetCalendarEventsV41() {
  return refreshProjectUrlSheetCalendarEventsV41('');
}

/* ========================================================================== *
 * Sync integration
 * ========================================================================== */

function createProjectUrlSheetAssetV41_(project) {
  assertProjectWritable_(project);
  var outputName = getProjectSingletonExpectedNameV41_(project, 'PROJECT_URL_SHEET');
  var ss = SpreadsheetApp.create(outputName);
  var file = DriveApp.getFileById(ss.getId());
  ensureFileInFolder_(file, getProjectRoot_(project));

  try {
    var access = ensureProjectPublicSheetSharingV43_(file, project);
    var fingerprint = getProjectManagedAssetFingerprintV41_(project, 'PROJECT_URL_SHEET');
    tagProjectManagedAssetV41_(project, 'PROJECT_URL_SHEET', file, {
      ASSET_SCHEMA_VERSION: GES_PUBLIC_SHEET_V43.ASSET_SCHEMA_VERSION,
      ASSET_FINGERPRINT: fingerprint,
      RENDERER_VERSION: GES_SHEETS_ASSET_V4.VERSION
    });
    saveProjectAssetRegistryV41_(project, 'PROJECT_URL_SHEET', file, {
      assetFingerprint: fingerprint,
      rendererVersion: GES_SHEETS_ASSET_V4.VERSION,
      resolutionMethod: 'CREATE',
      publicAccess: access.access,
      publicPermission: access.permission
    });
    upsertProjectManagedAssetToRegistrySheetV41_(project, 'PROJECT_URL_SHEET');
    upsertProjectStructuredAssetUrlVariantsV41_(project, 'PROJECT_URL_SHEET', file);
    var render = renderProjectPublicSheetV43_(project, ss);

    // Recompute after Registry now contains this Sheet + its URL variants.
    fingerprint = getProjectManagedAssetFingerprintV41_(project, 'PROJECT_URL_SHEET');
    tagProjectManagedAssetV41_(project, 'PROJECT_URL_SHEET', file, {
      ASSET_SCHEMA_VERSION: GES_PUBLIC_SHEET_V43.ASSET_SCHEMA_VERSION,
      ASSET_FINGERPRINT: fingerprint,
      RENDERER_VERSION: GES_SHEETS_ASSET_V4.VERSION
    });
    saveProjectAssetRegistryV41_(project, 'PROJECT_URL_SHEET', file, {
      assetFingerprint: fingerprint,
      rendererVersion: GES_SHEETS_ASSET_V4.VERSION,
      resolutionMethod: 'CREATE',
      publicAccess: access.access,
      publicPermission: access.permission
    });
    upsertProjectManagedAssetToRegistrySheetV41_(project, 'PROJECT_URL_SHEET');

    return makeProjectAssetResultV41_(true, project, 'PROJECT_URL_SHEET', 'CREATE', 'CREATED', 'Đã tạo Public Project Sheet trong PROJECT_ROOT với Assets hợp nhất + Content.', file, {
      assetFingerprint: fingerprint,
      render: render,
      sharing: access,
      published: getProjectPublicSheetPublishedInfoV43_(project, file.getId())
    });
  } catch (e) {
    try { clearProjectAssetRegistryV41_(project.projectId, 'PROJECT_URL_SHEET'); } catch (ignore0) {}
    try { file.setTrashed(true); } catch (ignore1) {}
    throw e;
  }
}

function updateProjectUrlSheetAssetV41_(project) {
  assertProjectWritable_(project);
  var resolved = resolveProjectSingletonAssetV41_(project, 'PROJECT_URL_SHEET');
  if (!resolved.file || resolved.ambiguous) throw new Error('PROJECT_URL_SHEET_UPDATE_ASSET_NOT_RESOLVED');

  var file = resolved.file;
  ensureFileInFolder_(file, getProjectRoot_(project));
  var expectedName = getProjectSingletonExpectedNameV41_(project, 'PROJECT_URL_SHEET');
  if (file.getName() !== expectedName) file.setName(expectedName);

  var access = ensureProjectPublicSheetSharingV43_(file, project);
  upsertProjectManagedAssetToRegistrySheetV41_(project, 'PROJECT_URL_SHEET');
  upsertProjectStructuredAssetUrlVariantsV41_(project, 'PROJECT_URL_SHEET', file);
  var ss = SpreadsheetApp.openById(file.getId());
  var render = renderProjectPublicSheetV43_(project, ss);

  var fingerprint = getProjectManagedAssetFingerprintV41_(project, 'PROJECT_URL_SHEET');
  tagProjectManagedAssetV41_(project, 'PROJECT_URL_SHEET', file, {
    ASSET_SCHEMA_VERSION: GES_PUBLIC_SHEET_V43.ASSET_SCHEMA_VERSION,
    ASSET_FINGERPRINT: fingerprint,
    RENDERER_VERSION: GES_SHEETS_ASSET_V4.VERSION
  });
  saveProjectAssetRegistryV41_(project, 'PROJECT_URL_SHEET', file, {
    assetFingerprint: fingerprint,
    rendererVersion: GES_SHEETS_ASSET_V4.VERSION,
    resolutionMethod: resolved.method || 'PROJECT_REGISTRY_ID',
    publicAccess: access.access,
    publicPermission: access.permission,
    publishedUrl: getProjectPublicSheetPublishedInfoV43_(project, file.getId()).publishedUrl || ''
  });
  upsertProjectManagedAssetToRegistrySheetV41_(project, 'PROJECT_URL_SHEET');

  return makeProjectAssetResultV41_(true, project, 'PROJECT_URL_SHEET', 'UPDATE', 'UPDATED', 'Đã cập nhật Public Project Sheet và giữ nguyên File ID.', file, {
    assetFingerprint: fingerprint,
    render: render,
    sharing: access,
    published: getProjectPublicSheetPublishedInfoV43_(project, file.getId())
  });
}

/* Legacy per-source entrypoints are intentionally retired. */
function createSheetAsset_(project, docFile) {
  throw new Error('SHEET_IS_PROJECT_SINGLETON_V41: dùng buildProjectSheetV4().');
}
function updateSheetAsset_(project, docFile) {
  throw new Error('SHEET_IS_PROJECT_SINGLETON_V41: dùng buildProjectSheetV4().');
}

/* ========================================================================== *
 * Helpers retained for project singleton integration
 * ========================================================================== */

function resolveStructuredProjectV4_(projectId) {
  var project = projectId ? getProject_(projectId) : getActiveProject_();
  if (!project) throw new Error('STRUCTURED_ASSET_PROJECT_NOT_FOUND');
  return project;
}

function upsertProjectStructuredAssetUrlVariantsV41_(project, assetType, file) {
  try {
    var asset = {
      sourceDocId: '',
      assetType: assetType,
      assetId: file.getId(),
      assetName: file.getName()
    };
    upsertUrlVariants_(project, asset, generateUrlVariantsForAsset_(project, asset));
  } catch (e) {
    console.log('Project structured URL variants unavailable: ' + safeString_(e && e.message || e));
  }
}
