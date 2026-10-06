/**
 * GES V4.6.5 - Unified Public Project Sheet + Extended Google Assets + QR/short URL enrichment.
 *
 * PRIVATE Asset Registry remains the source of truth.
 * PUBLIC Project Sheet becomes a sanitized two-tab projection:
 *   1) Assets  = project structural assets + ALL AVAILABLE URL variants
 *   2) Content = all direct Google Docs in Articles (Option B)
 *
 * The old public URL Variants and Calendar Events tabs are retired. Calendar
 * URLs continue to flow through the PRIVATE Registry URL Variants table and are
 * therefore included in the unified public Assets tab.
 */

const GES_PUBLIC_SHEET_RENDERER_V43 = Object.freeze({
  VERSION: '1.3.0-extended-google-assets',
  SHARE_MODE: 'ANYONE_WITH_LINK_VIEW',
  PUBLISH_MODE: 'MANUAL_PUBLISHED_URL_REQUIRED'
});

/** Public: refresh an already-managed Public Project Sheet only. */
function refreshProjectPublicSheetV43(projectId) {
  var project = resolvePublicSheetProjectV43_(projectId || '');
  var state = getProjectSingletonAssetStateV41_(project, 'PROJECT_URL_SHEET');
  if (!state.id || ['CURRENT','OUTDATED','WRONG_FOLDER'].indexOf(safeString_(state.status).toUpperCase()) === -1) {
    return {
      success: true,
      skipped: true,
      code: 'PUBLIC_PROJECT_SHEET_NOT_MANAGED',
      projectId: project.projectId,
      status: state.status || ''
    };
  }

  var file = DriveApp.getFileById(state.id);
  var access = ensureProjectPublicSheetSharingV43_(file, project);
  try { upsertProjectStructuredAssetUrlVariantsV41_(project, 'PROJECT_URL_SHEET', file); } catch (ignore0) {}
  var ss = SpreadsheetApp.openById(state.id);
  var render = renderProjectPublicSheetV43_(project, ss);
  var fingerprint = getProjectManagedAssetFingerprintV41_(project, 'PROJECT_URL_SHEET');

  tagProjectManagedAssetV41_(project, 'PROJECT_URL_SHEET', file, {
    ASSET_SCHEMA_VERSION: GES_PUBLIC_SHEET_V43.ASSET_SCHEMA_VERSION,
    ASSET_FINGERPRINT: fingerprint,
    RENDERER_VERSION: GES_PUBLIC_SHEET_RENDERER_V43.VERSION
  });
  saveProjectAssetRegistryV41_(project, 'PROJECT_URL_SHEET', file, {
    assetFingerprint: fingerprint,
    rendererVersion: GES_PUBLIC_SHEET_RENDERER_V43.VERSION,
    resolutionMethod: state.resolutionMethod || 'PROJECT_REGISTRY_ID',
    publicAccess: access.access,
    publicPermission: access.permission,
    publishedUrl: getProjectPublicSheetPublishedInfoV43_(project, file.getId()).publishedUrl || ''
  });
  upsertProjectManagedAssetToRegistrySheetV41_(project, 'PROJECT_URL_SHEET');

  return {
    success: true,
    skipped: false,
    version: GES_PUBLIC_SHEET_RENDERER_V43.VERSION,
    projectId: project.projectId,
    sheetId: state.id,
    tabs: render.tabs,
    assetRowCount: render.assetRowCount,
    sourceDocCount: render.sourceDocCount,
    contentRowCount: render.contentRowCount,
    urlEnrichment: render.urlEnrichment || {},
    access: access,
    published: getProjectPublicSheetPublishedInfoV43_(project, file.getId())
  };
}

function refreshActiveProjectPublicSheetV43() {
  return refreshProjectPublicSheetV43('');
}

/** Public: permission + Publish-to-Web readiness check. */
function validateProjectPublicSheetV43(projectId) {
  var project = resolvePublicSheetProjectV43_(projectId || '');
  var state = getProjectSingletonAssetStateV41_(project, 'PROJECT_URL_SHEET');
  if (!state.id) {
    return { success: true, valid: false, status: state.status || 'MISSING', code: 'PUBLIC_SHEET_MISSING' };
  }
  var file = DriveApp.getFileById(state.id);
  var sharing = inspectProjectPublicSheetSharingV43_(file);
  var published = getProjectPublicSheetPublishedInfoV43_(project, file.getId());
  var tabs = [];
  try { tabs = SpreadsheetApp.openById(file.getId()).getSheets().map(function(s) { return s.getName(); }); } catch (ignore) {}
  var missingTabs = GES_PUBLIC_SHEET_V43.GENERATED_TABS.filter(function(name) { return tabs.indexOf(name) === -1; });
  var retiredTabsPresent = GES_PUBLIC_SHEET_V43.RETIRED_PUBLIC_TABS.filter(function(name) { return tabs.indexOf(name) !== -1; });
  return {
    success: true,
    valid: sharing.anyoneWithLink && !!published.publishedUrl && missingTabs.length === 0 && retiredTabsPresent.length === 0,
    projectId: project.projectId,
    sheetId: file.getId(),
    anyoneWithLink: sharing.anyoneWithLink,
    sharingAccess: sharing.access,
    sharingPermission: sharing.permission,
    publishedToWeb: !!published.publishedUrl,
    publishedUrl: published.publishedUrl || '',
    missingTabs: missingTabs,
    retiredTabsPresent: retiredTabsPresent,
    warnings: [].concat(
      sharing.anyoneWithLink ? [] : ['ANYONE_WITH_LINK_NOT_ENABLED'],
      published.publishedUrl ? [] : ['PUBLISHED_TO_WEB_URL_NOT_SAVED'],
      missingTabs.length ? ['PUBLIC_SHEET_TABS_MISSING'] : [],
      retiredTabsPresent.length ? ['RETIRED_PUBLIC_TABS_STILL_PRESENT'] : []
    )
  };
}

function validateActiveProjectPublicSheetV43() {
  return validateProjectPublicSheetV43('');
}

/** Public write: enforce Anyone-with-link Viewer. Does NOT Publish to Web. */
function ensureActiveProjectPublicSheetSharingV43() {
  var project = resolvePublicSheetProjectV43_('');
  assertProjectWritable_(project);
  var state = getProjectSingletonAssetStateV41_(project, 'PROJECT_URL_SHEET');
  if (!state.id) throw new Error('PUBLIC_PROJECT_SHEET_MISSING');
  return ensureProjectPublicSheetSharingV43_(DriveApp.getFileById(state.id), project);
}

/** Public write: save an already-created Published-to-Web URL and refresh projection. */
function setActiveProjectPublicSheetPublishedUrlV43(publishedUrl) {
  var project = resolvePublicSheetProjectV43_('');
  assertProjectWritable_(project);
  var state = getProjectSingletonAssetStateV41_(project, 'PROJECT_URL_SHEET');
  if (!state.id) throw new Error('PUBLIC_PROJECT_SHEET_MISSING');
  var info = setPublishedUrlForAsset('SHEET', state.id, publishedUrl);
  var refresh = refreshProjectPublicSheetV43(project.projectId);
  return { success: true, published: info, refresh: refresh };
}

/* ========================================================================== *
 * Renderer
 * ========================================================================== */

function renderProjectPublicSheetV43_(project, ss) {
  try { ss.setSpreadsheetTimeZone('Asia/Ho_Chi_Minh'); } catch (ignore0) {}
  try { ss.setSpreadsheetLocale('vi_VN'); } catch (ignore1) {}

  migratePublicSheetTabNamesV43_(ss);

  // Capture current short URLs before Assets is cleared. This provides a
  // persistent cache for structural rows (Target URL + folders) that do not
  // exist in the Private Registry URL Variants table.
  var priorAssetSheet = ss.getSheetByName(GES_PUBLIC_SHEET_V43.TABS.ASSETS);
  var priorShortUrlCache = {};
  try {
    if (typeof capturePublicAssetShortUrlCacheV464_ === 'function') {
      priorShortUrlCache = capturePublicAssetShortUrlCacheV464_(priorAssetSheet);
    }
  } catch (ignore2) {}

  var assets = buildUnifiedPublicAssetsProjectionV44_(project);
  var enrichment = {
    version: '4.6.4',
    skipped: true,
    code: 'URL_ENRICHMENT_MODULE_NOT_INSTALLED',
    warnings: []
  };
  try {
    if (typeof enrichPublicAssetRowsV464_ === 'function') {
      enrichment = enrichPublicAssetRowsV464_(project, assets, priorShortUrlCache);
      enrichment.skipped = false;
    }
  } catch (e2) {
    enrichment = {
      version: '4.6.4',
      skipped: true,
      code: 'URL_ENRICHMENT_FAILED_NON_BLOCKING',
      warnings: [safeString_(e2 && e2.message || e2)]
    };
  }

  var content = buildProjectContentProjectionV43_(project);

  var assetSheet = writePublicSheetTableV43_(ss, GES_PUBLIC_SHEET_V43.TABS.ASSETS,
    [GES_PUBLIC_SHEET_V43.ASSETS_HEADERS.slice()].concat(assets), {
      widths: [205,390,165,610,390,110,220,220,190],
      rowHeight: 155
    });
  applyPublicAssetsHyperlinkFormulasV44_(assetSheet, assets.length);
  if (typeof applyPublicAssetsQrFormulasV464_ === 'function') {
    applyPublicAssetsQrFormulasV464_(assetSheet, assets.length);
  }

  var contentRows = content.rows.map(function(row) {
    return [
      row.type, row.document, row.content, row.html, row.sourceUrl,
      row.targetUrl, row.canonical, row.modifiedAt, row.chunk, row.chunks
    ];
  });
  writePublicSheetTableV43_(ss, GES_PUBLIC_SHEET_V43.TABS.CONTENT,
    [GES_PUBLIC_SHEET_V43.CONTENT_HEADERS.slice()].concat(contentRows), {
      widths: [100,320,620,620,480,420,100,170,80,80],
      rowHeight: 120
    });

  removeRetiredPublicGeneratedTabsV44_(ss);
  cleanupPublicDefaultSheetV43_(ss);
  SpreadsheetApp.flush();

  return {
    success: true,
    tabs: GES_PUBLIC_SHEET_V43.GENERATED_TABS.slice(),
    assetRowCount: assets.length,
    sourceDocCount: content.documents.length,
    contentRowCount: contentRows.length,
    urlEnrichment: enrichment
  };
}

/**
 * Build one public index from two PRIVATE sources:
 *   - project structural assets (Target URL + canonical folders)
 *   - every AVAILABLE URL Variant that is safe for public projection
 *
 * The private Asset Registry itself is NEVER projected.
 */
function buildUnifiedPublicAssetsProjectionV44_(project) {
  var registry = readPrivateRegistryProjectionV43_(project);
  var rows = [];
  var now = new Date();
  var today = formatPublicDateV44_(now);
  var nowIso = now.toISOString();

  function add(type, name, qr, url, date, tinyUrl, cleanUri, updated) {
    url = safeString_(url);
    if (!url) return;
    rows.push([
      safeString_(type),
      safeString_(name),
      safeString_(qr),
      url,
      '', // Display Name is written as HYPERLINK(URL, Name) after setValues.
      safeString_(date),
      safeString_(tinyUrl),
      safeString_(cleanUri),
      safeString_(updated)
    ]);
  }

  // Project-level structural URLs do not depend on Registry URL rules.
  add('target url', getProjectKeywordV41_(project), '', project.targetPageUrl || '', today, '', '', nowIso);

  try {
    var root = getProjectRoot_(project);
    add('folder top', root.getName(), '', root.getUrl(), today, '', '', nowIso);
  } catch (ignore0) {}

  try {
    getProjectFolderSummary_(project).forEach(function(folder) {
      if (!folder.exists || folder.legacy || folder.key === 'ROOT') return;
      var typeMap = {
        ARTICLES: 'folder articles',
        DOCX: 'folder docx',
        HTML: 'folder HTML',
        SLIDES: 'folder slides',
        PDF: 'folder pdfs',
        PHOTOS: 'folder photos',
        VIDEOS: 'folder videos',
        PODCASTS: 'folder podcasts'
      };
      add(typeMap[folder.key] || ('folder ' + safeString_(folder.key).toLowerCase()), folder.name, '', folder.url, today, '', '', nowIso);
    });
  } catch (ignore1) {}

  // V4.6.5: optional Google products entered in Project Settings are mirrored
  // into the PRIVATE Extended Assets Registry and projected like structural URLs.
  try {
    var extendedV465 = typeof readExtendedGoogleAssetsRegistryV465_ === 'function'
      ? readExtendedGoogleAssetsRegistryV465_(project)
      : (typeof getExtendedGoogleAssetDescriptorsV465_ === 'function' ? getExtendedGoogleAssetDescriptorsV465_(project) : []);
    extendedV465.forEach(function(asset) {
      if (!asset || !asset.url || safeString_(asset.urlStatus).toUpperCase() === 'INVALID') return;
      add(
        asset.publicType || safeString_(asset.assetType).toLowerCase(),
        asset.assetName || getProjectKeywordV41_(project),
        asset.qr || '',
        asset.url,
        today,
        asset.tinyUrl || '',
        asset.cleanUri || '',
        asset.lastSynced || nowIso
      );
    });
  } catch (ignoreExtendedV465) {}

  var ids = getPublicProjectionSingletonIdsV44_(project);
  var projectedAssetIds = {};

  registry.urls.forEach(function(v) {
    if (!isPublicUrlVariantAllowedV44_(project, v, ids)) return;
    add(
      v.variantType || publicAssetTypeLabelV43_(v.assetType),
      v.anchorName || v.assetName || '',
      v.qr || '',
      v.url || '',
      v.date || formatPublicDateFromIsoV44_(v.lastVerified),
      v.tinyUrl || '',
      v.cleanUri || '',
      v.lastVerified || ''
    );
    if (v.assetId) projectedAssetIds[v.assetId] = true;
  });

  // Fallback: a managed source asset should never disappear from the public
  // index just because its URL-variant generation has not run yet.
  registry.assets.forEach(function(a) {
    if (!isPublicFallbackAssetAllowedV44_(project, a, ids)) return;
    if (projectedAssetIds[a.assetId]) return;
    if (!a.url) return;
    add(
      publicAssetTypeLabelV43_(a.assetType),
      a.assetName,
      '',
      a.url,
      formatPublicDateFromIsoV44_(a.assetModified),
      '',
      '',
      a.lastVerified || a.assetModified || ''
    );
  });

  // A URL is the public identity. Keep each URL exactly once even if private
  // Registry sources overlap (e.g. canonical asset row + URL variant row).
  return dedupePublicProjectionRowsV43_(rows, function(row) {
    return normalizePublicProjectionUrlKeyV44_(row[3]);
  });
}

function getPublicProjectionSingletonIdsV44_(project) {
  function stateId(type) {
    try {
      var s = getProjectSingletonAssetStateV41_(project, type);
      return s && s.id || '';
    } catch (e) { return ''; }
  }
  return {
    publicSheetId: stateId('PROJECT_URL_SHEET'),
    projectFormId: stateId('PROJECT_FORM'),
    projectDrawingId: stateId('PROJECT_DRAWING')
  };
}

function isPublicUrlVariantAllowedV44_(project, v, ids) {
  if (!v || !v.url) return false;
  var status = safeString_(v.urlStatus).toUpperCase();
  if (status && status !== 'AVAILABLE') return false;

  // Never expose the PRIVATE Asset Registry itself in the PUBLIC Sheet.
  if (project.registrySheetId && safeString_(v.assetId) === safeString_(project.registrySheetId)) return false;

  var type = safeString_(v.assetType).toUpperCase();

  // Retired per-source Sheets/Forms are legacy and must not be projected.
  if (type === 'SHEET' || type === 'PROJECT_URL_SHEET') {
    return !!ids.publicSheetId && safeString_(v.assetId) === safeString_(ids.publicSheetId);
  }
  if (type === 'FORM' || type === 'PROJECT_FORM') {
    return !!ids.projectFormId && safeString_(v.assetId) === safeString_(ids.projectFormId);
  }
  if (type === 'DRAWING' || type === 'PROJECT_DRAWING') {
    // If V4 has adopted a canonical singleton Drawing, use only that ID.
    // Before adoption, allow the existing project Drawing variant so legacy
    // projects do not silently lose their single Drawing URL.
    return ids.projectDrawingId ? safeString_(v.assetId) === safeString_(ids.projectDrawingId) : true;
  }

  return [
    'DOC','SLIDES','PDF','DOCX','HTML',
    'CALENDAR','CALENDAR_EVENT',
    'PROJECT_MY_MAPS','PROJECT_EARTH'
  ].indexOf(type) !== -1;
}

function isPublicFallbackAssetAllowedV44_(project, a, ids) {
  if (!a || !a.assetId || !a.url) return false;
  if (project.registrySheetId && safeString_(a.assetId) === safeString_(project.registrySheetId)) return false;

  var lifecycle = safeString_(a.lifecycleStatus).toUpperCase();
  if (lifecycle === 'TRASHED') return false;
  if (safeString_(a.systemAsset).toUpperCase() === 'TRUE') return false;

  var type = safeString_(a.assetType).toUpperCase();
  if (type === 'SHEET' || type === 'PROJECT_URL_SHEET') {
    return !!ids.publicSheetId && safeString_(a.assetId) === safeString_(ids.publicSheetId);
  }
  if (type === 'FORM' || type === 'PROJECT_FORM') {
    return !!ids.projectFormId && safeString_(a.assetId) === safeString_(ids.projectFormId);
  }
  if (type === 'DRAWING' || type === 'PROJECT_DRAWING') {
    return ids.projectDrawingId ? safeString_(a.assetId) === safeString_(ids.projectDrawingId) : lifecycle !== 'TRASHED';
  }
  return ['DOC','SLIDES','PDF','DOCX','HTML'].indexOf(type) !== -1;
}

/** Compatibility helper retained for diagnostics/tests. */
function buildPublicAssetsProjectionV43_(project) {
  return buildUnifiedPublicAssetsProjectionV44_(project);
}

/** Compatibility helper: URL-only subset from the private Registry. */
function buildPublicUrlVariantsProjectionV43_(project) {
  var registry = readPrivateRegistryProjectionV43_(project);
  var ids = getPublicProjectionSingletonIdsV44_(project);
  return registry.urls.filter(function(v) {
    return isPublicUrlVariantAllowedV44_(project, v, ids);
  }).map(function(v) {
    return [
      v.variantType || '', v.anchorName || v.assetName || '', v.qr || '', v.url || '',
      v.assetName || v.anchorName || '', v.date || '', v.tinyUrl || '', v.cleanUri || '',
      v.lastVerified || ''
    ];
  });
}

function readPrivateRegistryProjectionV43_(project) {
  var result = { assets: [], urls: [] };
  if (!project.registrySheetId) return result;
  var ss = SpreadsheetApp.openById(project.registrySheetId);

  var ash = ss.getSheetByName(V3_CONFIG.REGISTRY_TABS.ASSETS);
  if (ash && ash.getLastRow() >= 2) {
    var av = ash.getDataRange().getDisplayValues();
    var ai = publicHeaderIndexV43_(av[0]);
    for (var r = 1; r < av.length; r++) {
      if (safeString_(av[r][ai['Project ID']]) !== safeString_(project.projectId)) continue;
      result.assets.push({
        sourceDocId: publicCellByHeaderV43_(av[r], ai, 'Source Doc ID'),
        sourceDocName: publicCellByHeaderV43_(av[r], ai, 'Source Doc Name'),
        assetType: publicCellByHeaderV43_(av[r], ai, 'Asset Type'),
        assetId: publicCellByHeaderV43_(av[r], ai, 'Asset ID'),
        assetName: publicCellByHeaderV43_(av[r], ai, 'Asset Name'),
        url: publicCellByHeaderV43_(av[r], ai, 'Drive/Public URL'),
        assetModified: publicCellByHeaderV43_(av[r], ai, 'Asset Modified'),
        syncStatus: publicCellByHeaderV43_(av[r], ai, 'Sync Status'),
        lifecycleStatus: publicCellByHeaderV43_(av[r], ai, 'Lifecycle Status'),
        systemAsset: publicCellByHeaderV43_(av[r], ai, 'System Asset'),
        lastVerified: publicCellByHeaderV43_(av[r], ai, 'Last Seen'),
        notes: publicCellByHeaderV43_(av[r], ai, 'Notes')
      });
    }
  }

  var ush = ss.getSheetByName(V3_CONFIG.REGISTRY_TABS.URLS);
  if (ush && ush.getLastRow() >= 2) {
    var uv = ush.getDataRange().getDisplayValues();
    var ui = publicHeaderIndexV43_(uv[0]);
    for (var u = 1; u < uv.length; u++) {
      if (safeString_(uv[u][ui['Project ID']]) !== safeString_(project.projectId)) continue;
      result.urls.push({
        sourceDocId: publicCellByHeaderV43_(uv[u], ui, 'Source Doc ID'),
        assetType: publicCellByHeaderV43_(uv[u], ui, 'Asset Type'),
        assetId: publicCellByHeaderV43_(uv[u], ui, 'Asset ID'),
        assetName: publicCellByHeaderV43_(uv[u], ui, 'Asset Name'),
        variantType: publicCellByHeaderV43_(uv[u], ui, 'Variant Type'),
        anchorName: publicCellByHeaderV43_(uv[u], ui, 'Anchor/Name'),
        url: publicCellByHeaderV43_(uv[u], ui, 'URL'),
        urlStatus: publicCellByHeaderV43_(uv[u], ui, 'URL Status'),
        publishedId: publicCellByHeaderV43_(uv[u], ui, 'Published ID'),
        generatedBy: publicCellByHeaderV43_(uv[u], ui, 'Generated By'),
        lastVerified: publicCellByHeaderV43_(uv[u], ui, 'Last Verified'),
        qr: publicCellByHeaderV43_(uv[u], ui, 'QR'),
        date: publicCellByHeaderV43_(uv[u], ui, 'Date'),
        tinyUrl: publicCellByHeaderV43_(uv[u], ui, 'TinyURL'),
        cleanUri: publicCellByHeaderV43_(uv[u], ui, 'CleanURI'),
        spooMe: publicCellByHeaderV43_(uv[u], ui, 'Spoo.me'),
        notes: publicCellByHeaderV43_(uv[u], ui, 'Notes')
      });
    }
  }
  return result;
}

function migratePublicSheetTabNamesV43_(ss) {
  var oldAssets = ss.getSheetByName('GES Assets');
  var assets = ss.getSheetByName('Assets');
  if (oldAssets && !assets) {
    try { oldAssets.setName('Assets'); } catch (ignore) {}
  }
}

/** Remove only known generated public tabs after the merged Assets tab exists. */
function removeRetiredPublicGeneratedTabsV44_(ss) {
  GES_PUBLIC_SHEET_V43.RETIRED_PUBLIC_TABS.forEach(function(name) {
    var sh = ss.getSheetByName(name);
    if (!sh) return;
    if (name === GES_PUBLIC_SHEET_V43.TABS.ASSETS) return;
    if (ss.getSheets().length <= 1) return;
    try { ss.deleteSheet(sh); } catch (ignore) {}
  });
}

/** Compatibility alias from Patch C. */
function hideRetiredPublicGeneratedTabsV43_(ss) {
  removeRetiredPublicGeneratedTabsV44_(ss);
}

function writePublicSheetTableV43_(ss, name, rows, options) {
  options = options || {};
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clear();
  try { sh.showSheet(); } catch (ignore0) {}
  var data = rows && rows.length ? rows : [['']];
  var cols = data.reduce(function(max, row) { return Math.max(max, row.length); }, 1);
  data = data.map(function(row) {
    var out = row.slice();
    while (out.length < cols) out.push('');
    return out;
  });
  sh.getRange(1, 1, data.length, cols).setValues(data);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, cols).setFontWeight('bold');
  sh.getDataRange().setWrap(true).setVerticalAlignment('top');
  try { sh.getRange(2, 1, Math.max(1, data.length - 1), cols).setFontColor('#188038'); } catch (ignore1) {}
  try { sh.getRange(1, 1, 1, cols).setFontColor('#202124'); } catch (ignore2) {}
  (options.widths || []).forEach(function(width, i) {
    if (width) try { sh.setColumnWidth(i + 1, width); } catch (ignore3) {}
  });
  if (options.rowHeight && data.length > 1) {
    try { sh.setRowHeights(2, data.length - 1, options.rowHeight); } catch (ignore4) {}
  }
  return sh;
}

/**
 * Display Name must remain a formula, not a copied string. Apps Script normally
 * accepts the English formula separator; vi_VN displays it as a semicolon.
 * We try the user's requested semicolon syntax first and fall back to comma.
 */
function applyPublicAssetsHyperlinkFormulasV44_(sheet, dataRowCount) {
  if (!sheet || dataRowCount <= 0) return;
  var formulasSemi = [];
  var formulasComma = [];
  for (var i = 0; i < dataRowCount; i++) {
    var row = i + 2;
    formulasSemi.push(['=IF(OR(D' + row + '="";B' + row + '="");"";HYPERLINK(D' + row + ';B' + row + '))']);
    formulasComma.push(['=IF(OR(D' + row + '="",B' + row + '=""),"",HYPERLINK(D' + row + ',B' + row + '))']);
  }
  var range = sheet.getRange(2, 5, dataRowCount, 1);
  try {
    range.setFormulas(formulasSemi);
  } catch (e) {
    range.setFormulas(formulasComma);
  }
}

function cleanupPublicDefaultSheetV43_(ss) {
  ['Sheet1','Trang tính1'].forEach(function(name) {
    var sh = ss.getSheetByName(name);
    if (!sh || ss.getSheets().length <= 1) return;
    if (sh.getLastRow() <= 1 && sh.getLastColumn() <= 1) {
      try { ss.deleteSheet(sh); } catch (ignore) {}
    }
  });
}

function ensureProjectPublicSheetSharingV43_(file, project) {
  var out = { success: true, access: '', permission: '', anyoneWithLink: false, error: '' };
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    out.success = false;
    out.error = safeString_(e && e.message || e);
  }
  var inspected = inspectProjectPublicSheetSharingV43_(file);
  out.access = inspected.access;
  out.permission = inspected.permission;
  out.anyoneWithLink = inspected.anyoneWithLink;
  return out;
}

function inspectProjectPublicSheetSharingV43_(file) {
  var access = '';
  var permission = '';
  try { access = safeString_(file.getSharingAccess()); } catch (ignore0) {}
  try { permission = safeString_(file.getSharingPermission()); } catch (ignore1) {}
  return {
    access: access,
    permission: permission,
    anyoneWithLink: access === safeString_(DriveApp.Access.ANYONE_WITH_LINK) || access === 'ANYONE_WITH_LINK'
  };
}

function getProjectPublicSheetPublishedInfoV43_(project, sheetId) {
  try { return getPublishedInfo_(project, 'SHEET', sheetId) || {}; }
  catch (e) { return {}; }
}

function resolvePublicSheetProjectV43_(projectId) {
  var project = projectId ? getProject_(projectId) : getActiveProject_();
  if (!project) throw new Error('PUBLIC_SHEET_PROJECT_NOT_FOUND');
  return project;
}

function publicHeaderIndexV43_(headers) {
  var idx = {};
  (headers || []).forEach(function(h, i) { idx[safeString_(h)] = i; });
  return idx;
}

function publicCellByHeaderV43_(row, idx, header) {
  var i = idx[header];
  return i === undefined ? '' : safeString_(row[i]);
}

function publicAssetTypeLabelV43_(assetType) {
  var t = safeString_(assetType).toUpperCase();
  var map = {
    DOC: 'document',
    SLIDES: 'slide',
    PDF: 'pdf',
    DOCX: 'docx',
    HTML: 'html',
    PROJECT_URL_SHEET: 'spreadsheet',
    PROJECT_FORM: 'form',
    PROJECT_DRAWING: 'drawing',
    SHEET: 'spreadsheet',
    FORM: 'form',
    DRAWING: 'drawing',
    CALENDAR: 'calendar',
    CALENDAR_EVENT: 'Calendar Event'
  };
  return map[t] || safeString_(assetType).toLowerCase();
}

function dedupePublicProjectionRowsV43_(rows, keyFn) {
  var seen = {};
  return (rows || []).filter(function(row) {
    var key = keyFn(row);
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function normalizePublicProjectionUrlKeyV44_(url) {
  return safeString_(url).trim();
}

function formatPublicDateV44_(date) {
  try {
    return Utilities.formatDate(date, Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  } catch (e) {
    return '';
  }
}

function formatPublicDateFromIsoV44_(value) {
  if (!value) return '';
  try { return formatPublicDateV44_(new Date(value)); }
  catch (e) { return ''; }
}
