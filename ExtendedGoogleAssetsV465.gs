/**
 * GES V4.6.5 - Extended Google Assets Registry & Project Settings.
 *
 * Manual/semi-automatic Google product URLs are normalized into one project
 * schema, mirrored into the PRIVATE Registry "Extended Assets" tab, and then
 * projected into the PUBLIC Assets tab. These URLs are optional and never
 * provision external Google products automatically.
 */

const GES_EXTENDED_GOOGLE_ASSETS_V465 = Object.freeze({
  VERSION: '4.6.5',
  SCHEMA_VERSION: '1.0.0',
  REGISTRY_TAB: 'Extended Assets',
  SOURCE: 'PROJECT_SETTINGS',
  HEADERS: [
    'Key','Project ID','Asset Type','Asset Name','URL','Visibility Class','URL Status',
    'QR','TinyURL','CleanURI','Source','Last Synced','Notes'
  ]
});

function extendedGoogleAssetSafeUrlV465_(value) {
  var s = safeString_(value || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  return normalizeUrl_(s);
}

function normalizeExtendedGoogleDrawingV465_(input) {
  var raw = safeString_(input || '').trim();
  if (!raw) return { fileId: '', url: '' };
  var id = '';
  try { id = extractDriveId_(raw) || ''; } catch (ignore) {}
  if (!id && /^[A-Za-z0-9_-]{20,}$/.test(raw)) id = raw;
  var url = /^https?:\/\//i.test(raw) ? normalizeUrl_(raw) : '';
  if (!url && id) url = 'https://docs.google.com/drawings/d/' + id + '/edit';
  return { fileId: id, url: url };
}

function normalizeExtendedGoogleAssetsV465_(input) {
  input = input && typeof input === 'object' ? input : {};
  var drawing = normalizeExtendedGoogleDrawingV465_(
    input.googleDrawingUrl || input.googleDrawingFileId || input.googleDrawingFileIdOrUrl || ''
  );
  if (input.googleDrawingFileId && !drawing.fileId) drawing.fileId = safeString_(input.googleDrawingFileId).trim();
  return {
    schemaVersion: GES_EXTENDED_GOOGLE_ASSETS_V465.SCHEMA_VERSION,
    notebookLmPublicUrl: extendedGoogleAssetSafeUrlV465_(input.notebookLmPublicUrl),
    notebookLmChatUrl: extendedGoogleAssetSafeUrlV465_(input.notebookLmChatUrl),
    googleMyMapsUrl: extendedGoogleAssetSafeUrlV465_(input.googleMyMapsUrl),
    googleEarthUrl: extendedGoogleAssetSafeUrlV465_(input.googleEarthUrl),
    googleSitesUrl: extendedGoogleAssetSafeUrlV465_(input.googleSitesUrl),
    googleAiStudioUrl: extendedGoogleAssetSafeUrlV465_(input.googleAiStudioUrl),
    googleColabUrl: extendedGoogleAssetSafeUrlV465_(input.googleColabUrl),
    googleVidsUrl: extendedGoogleAssetSafeUrlV465_(input.googleVidsUrl),
    googleVidsMp4Url: extendedGoogleAssetSafeUrlV465_(input.googleVidsMp4Url),
    googlePicsUrl: extendedGoogleAssetSafeUrlV465_(input.googlePicsUrl),
    appsScriptWebAppUrl: extendedGoogleAssetSafeUrlV465_(input.appsScriptWebAppUrl),
    googleDrawingFileId: safeString_(drawing.fileId || '').trim(),
    googleDrawingUrl: extendedGoogleAssetSafeUrlV465_(drawing.url)
  };
}

function getExtendedGoogleAssetDefinitionsV465_() {
  return [
    { field:'notebookLmPublicUrl', assetType:'EXT_GOOGLE_NOTEBOOKLM', publicType:'google notebooklm', suffix:'NotebookLM', visibilityClass:'GOOGLE_ACCOUNT_REQUIRED' },
    { field:'notebookLmChatUrl', assetType:'EXT_GOOGLE_NOTEBOOKLM_CHAT', publicType:'google notebooklm chat', suffix:'NotebookLM Chat', visibilityClass:'GOOGLE_ACCOUNT_REQUIRED' },
    { field:'googleMyMapsUrl', assetType:'EXT_GOOGLE_MY_MAPS', publicType:'google my maps', suffix:'Google My Maps', visibilityClass:'OPEN_WEB' },
    { field:'googleEarthUrl', assetType:'EXT_GOOGLE_EARTH', publicType:'google earth', suffix:'Google Earth', visibilityClass:'LINK_PUBLIC' },
    { field:'googleSitesUrl', assetType:'EXT_GOOGLE_SITES', publicType:'google sites', suffix:'Google Sites', visibilityClass:'OPEN_WEB' },
    { field:'googleAiStudioUrl', assetType:'EXT_GOOGLE_AI_STUDIO', publicType:'google ai studio', suffix:'Google AI Studio', visibilityClass:'OPEN_WEB' },
    { field:'googleColabUrl', assetType:'EXT_GOOGLE_COLAB', publicType:'google colab', suffix:'Google Colab', visibilityClass:'LINK_PUBLIC' },
    { field:'googleVidsUrl', assetType:'EXT_GOOGLE_VIDS', publicType:'google vids', suffix:'Google Vids', visibilityClass:'LINK_PUBLIC' },
    { field:'googleVidsMp4Url', assetType:'EXT_GOOGLE_VIDS_MP4', publicType:'google vids mp4', suffix:'Google Vids MP4', visibilityClass:'LINK_PUBLIC' },
    { field:'googlePicsUrl', assetType:'EXT_GOOGLE_PICS', publicType:'google pics', suffix:'Google Pics', visibilityClass:'LINK_PUBLIC' },
    { field:'appsScriptWebAppUrl', assetType:'EXT_GOOGLE_APPS_SCRIPT', publicType:'google apps script', suffix:'Apps Script Web App', visibilityClass:'OPEN_WEB' },
    { field:'googleDrawingUrl', assetType:'EXT_GOOGLE_DRAWING', publicType:'google drawing', suffix:'Google Drawing', visibilityClass:'LINK_PUBLIC' }
  ];
}

function getExtendedGoogleAssetDescriptorsV465_(project) {
  project = project || {};
  var seed = Object.assign({}, project.extendedGoogleAssets || {});
  if (!seed.googleSitesUrl && project.googleSitesUrl) seed.googleSitesUrl = project.googleSitesUrl;
  var cfg = normalizeExtendedGoogleAssetsV465_(seed);
  var baseName = normalizeName_(
    (typeof getProjectKeywordV41_ === 'function' ? getProjectKeywordV41_(project) : '') ||
    project.projectKeyword || project.projectName || project.brandName || 'Project'
  );
  var now = nowIso_();
  return getExtendedGoogleAssetDefinitionsV465_().map(function(def) {
    var url = safeString_(cfg[def.field] || '').trim();
    if (!url) return null;
    return {
      key: [safeString_(project.projectId), def.assetType].join('|'),
      projectId: safeString_(project.projectId),
      assetType: def.assetType,
      publicType: def.publicType,
      assetName: baseName + ' - ' + def.suffix,
      url: url,
      visibilityClass: def.visibilityClass,
      urlStatus: 'AVAILABLE',
      qr: '',
      tinyUrl: '',
      cleanUri: '',
      source: GES_EXTENDED_GOOGLE_ASSETS_V465.SOURCE,
      lastSynced: now,
      notes: def.visibilityClass === 'GOOGLE_ACCOUNT_REQUIRED' ? 'Public link may require Google Account sign-in.' : ''
    };
  }).filter(Boolean);
}

function getExtendedGoogleAssetsFingerprintV465_(project) {
  var rows = getExtendedGoogleAssetDescriptorsV465_(project).map(function(x) {
    return { assetType:x.assetType, url:x.url, visibilityClass:x.visibilityClass };
  });
  return sha256Hex_(JSON.stringify(rows));
}

function syncExtendedGoogleAssetsRegistryV465_(project) {
  if (!project || !project.registrySheetId) return { success:false, skipped:true, reason:'REGISTRY_NOT_CONFIGURED', rowCount:0 };
  var ss = SpreadsheetApp.openById(project.registrySheetId);
  var tabName = (V3_CONFIG.REGISTRY_TABS && V3_CONFIG.REGISTRY_TABS.EXTENDED_ASSETS) || GES_EXTENDED_GOOGLE_ASSETS_V465.REGISTRY_TAB;
  var sh = ensureSheetWithHeaders_(ss, tabName, GES_EXTENDED_GOOGLE_ASSETS_V465.HEADERS);
  var existing = {};
  if (sh.getLastRow() >= 2) {
    var old = sh.getRange(2,1,sh.getLastRow()-1,GES_EXTENDED_GOOGLE_ASSETS_V465.HEADERS.length).getDisplayValues();
    old.forEach(function(row) {
      var key = safeString_(row[0]);
      if (key) existing[key] = row;
    });
  }

  var descriptors = getExtendedGoogleAssetDescriptorsV465_(project);
  var syncedAt = nowIso_();
  var rows = descriptors.map(function(d) {
    var old = existing[d.key] || [];
    var sameUrl = normalizeUrl_(old[4] || '') === normalizeUrl_(d.url || '');
    return [
      d.key, d.projectId, d.assetType, d.assetName, d.url, d.visibilityClass, d.urlStatus,
      sameUrl ? (old[7] || '') : '',
      sameUrl ? (old[8] || '') : '',
      sameUrl ? (old[9] || '') : '',
      d.source, syncedAt, d.notes || ''
    ];
  });

  if (sh.getLastRow() > 1) sh.getRange(2,1,sh.getLastRow()-1,GES_EXTENDED_GOOGLE_ASSETS_V465.HEADERS.length).clearContent();
  if (rows.length) sh.getRange(2,1,rows.length,GES_EXTENDED_GOOGLE_ASSETS_V465.HEADERS.length).setValues(rows);
  return { success:true, spreadsheetId:project.registrySheetId, tab:tabName, rowCount:rows.length, syncedAt:syncedAt };
}

function readExtendedGoogleAssetsRegistryV465_(project) {
  var fallback = getExtendedGoogleAssetDescriptorsV465_(project);
  if (!project || !project.registrySheetId) return fallback;
  try {
    var ss = SpreadsheetApp.openById(project.registrySheetId);
    var tabName = (V3_CONFIG.REGISTRY_TABS && V3_CONFIG.REGISTRY_TABS.EXTENDED_ASSETS) || GES_EXTENDED_GOOGLE_ASSETS_V465.REGISTRY_TAB;
    var sh = ss.getSheetByName(tabName);
    if (!sh || sh.getLastRow() < 2) return fallback;
    var values = sh.getDataRange().getDisplayValues();
    var headers = values[0] || [];
    var idx = {};
    headers.forEach(function(h,i){ idx[safeString_(h)] = i; });
    var defs = {};
    getExtendedGoogleAssetDefinitionsV465_().forEach(function(d){ defs[d.assetType] = d; });
    var out = [];
    for (var r=1;r<values.length;r++) {
      var row = values[r];
      if (safeString_(row[idx['Project ID']]) !== safeString_(project.projectId)) continue;
      var type = safeString_(row[idx['Asset Type']]);
      var def = defs[type] || {};
      var url = safeString_(row[idx['URL']]);
      if (!url) continue;
      out.push({
        key:safeString_(row[idx['Key']]), projectId:project.projectId, assetType:type,
        publicType:def.publicType || type.toLowerCase(), assetName:safeString_(row[idx['Asset Name']]),
        url:url, visibilityClass:safeString_(row[idx['Visibility Class']]), urlStatus:safeString_(row[idx['URL Status']]) || 'AVAILABLE',
        qr:safeString_(row[idx['QR']]), tinyUrl:safeString_(row[idx['TinyURL']]), cleanUri:safeString_(row[idx['CleanURI']]),
        source:safeString_(row[idx['Source']]), lastSynced:safeString_(row[idx['Last Synced']]), notes:safeString_(row[idx['Notes']])
      });
    }
    return out;
  } catch (e) {
    return fallback;
  }
}

function persistExtendedGoogleAssetEnrichmentV465_(project, enrichmentByUrl) {
  var out = { success:true, rowsUpdated:0, matchedRows:0 };
  if (!project || !project.registrySheetId || !enrichmentByUrl) return out;
  var ss = SpreadsheetApp.openById(project.registrySheetId);
  var tabName = (V3_CONFIG.REGISTRY_TABS && V3_CONFIG.REGISTRY_TABS.EXTENDED_ASSETS) || GES_EXTENDED_GOOGLE_ASSETS_V465.REGISTRY_TAB;
  var sh = ss.getSheetByName(tabName);
  if (!sh || sh.getLastRow() < 2) return out;
  var values = sh.getDataRange().getDisplayValues();
  var headers = values[0] || [];
  var projectCol=headers.indexOf('Project ID'), urlCol=headers.indexOf('URL'), tinyCol=headers.indexOf('TinyURL'), cleanCol=headers.indexOf('CleanURI');
  if ([projectCol,urlCol,tinyCol,cleanCol].some(function(i){return i===-1;})) return {success:false,rowsUpdated:0,matchedRows:0,code:'EXTENDED_ASSET_ENRICHMENT_COLUMNS_MISSING'};
  var n=values.length-1;
  var tinyValues=sh.getRange(2,tinyCol+1,n,1).getValues();
  var cleanValues=sh.getRange(2,cleanCol+1,n,1).getValues();
  var changedTiny=false, changedClean=false;
  for (var r=1;r<values.length;r++) {
    if (safeString_(values[r][projectCol]) !== safeString_(project.projectId)) continue;
    var key = typeof publicAssetUrlKeyV464_ === 'function' ? publicAssetUrlKeyV464_(values[r][urlCol]) : normalizeUrl_(values[r][urlCol]);
    var entry = enrichmentByUrl[key];
    if (!key || !entry) continue;
    out.matchedRows++;
    var rowChanged=false;
    if (entry.tinyUrl && safeString_(tinyValues[r-1][0]) !== entry.tinyUrl) { tinyValues[r-1][0]=entry.tinyUrl; changedTiny=true; rowChanged=true; }
    if (entry.cleanUri && safeString_(cleanValues[r-1][0]) !== entry.cleanUri) { cleanValues[r-1][0]=entry.cleanUri; changedClean=true; rowChanged=true; }
    if (rowChanged) out.rowsUpdated++;
  }
  if (changedTiny) sh.getRange(2,tinyCol+1,n,1).setValues(tinyValues);
  if (changedClean) sh.getRange(2,cleanCol+1,n,1).setValues(cleanValues);
  return out;
}

function getExtendedGoogleAssetProjectConfigRowsV465_(project) {
  var cfg = normalizeExtendedGoogleAssetsV465_(Object.assign({}, project && project.extendedGoogleAssets || {}, {
    googleSitesUrl: project && project.googleSitesUrl || (project && project.extendedGoogleAssets && project.extendedGoogleAssets.googleSitesUrl) || ''
  }));
  var count = getExtendedGoogleAssetDescriptorsV465_(project || {}).length;
  return [
    ['Extended Assets Schema Version', cfg.schemaVersion],
    ['NotebookLM Public URL', cfg.notebookLmPublicUrl],
    ['NotebookLM Chat View URL', cfg.notebookLmChatUrl],
    ['Google My Maps URL', cfg.googleMyMapsUrl],
    ['Google Earth Project URL', cfg.googleEarthUrl],
    ['Google Sites URL', cfg.googleSitesUrl],
    ['Google AI Studio App URL', cfg.googleAiStudioUrl],
    ['Google Colab URL', cfg.googleColabUrl],
    ['Google Vids URL', cfg.googleVidsUrl],
    ['Google Vids MP4 URL', cfg.googleVidsMp4Url],
    ['Google Pics URL', cfg.googlePicsUrl],
    ['Apps Script Web App URL', cfg.appsScriptWebAppUrl],
    ['Google Drawing File ID', cfg.googleDrawingFileId],
    ['Google Drawing URL', cfg.googleDrawingUrl],
    ['Extended Assets Configured Count', String(count)]
  ];
}

function getExtendedGoogleAssetVerificationKeysV465_() {
  return [
    'NotebookLM Public URL','NotebookLM Chat View URL','Google My Maps URL','Google Earth Project URL','Google Sites URL',
    'Google AI Studio App URL','Google Colab URL','Google Vids URL','Google Vids MP4 URL','Google Pics URL',
    'Apps Script Web App URL','Google Drawing File ID','Google Drawing URL','Extended Assets Configured Count'
  ];
}

function verifyActiveExtendedGoogleAssetsV465() {
  var project = getActiveProject_();
  if (!project) throw new Error('Chưa có active project.');
  var expected = getExtendedGoogleAssetDescriptorsV465_(project);
  var registry = readExtendedGoogleAssetsRegistryV465_(project);
  var expectedMap={}, registryMap={};
  expected.forEach(function(x){ expectedMap[x.assetType]=normalizeUrl_(x.url); });
  registry.forEach(function(x){ registryMap[x.assetType]=normalizeUrl_(x.url); });
  var mismatches=[];
  Object.keys(expectedMap).forEach(function(k){ if (expectedMap[k] !== registryMap[k]) mismatches.push({assetType:k,expected:expectedMap[k],actual:registryMap[k]||''}); });

  var publicCheck = { checked:false, missing:[] };
  try {
    var state=getProjectSingletonAssetStateV41_(project,'PROJECT_URL_SHEET');
    if (state && state.id) {
      var ss=SpreadsheetApp.openById(state.id), sh=ss.getSheetByName('Assets');
      if (sh && sh.getLastRow()>=2) {
        publicCheck.checked=true;
        var vals=sh.getDataRange().getDisplayValues(), headers=vals[0]||[], ui=headers.indexOf('URL'), publicUrls={};
        for (var r=1;r<vals.length;r++) if (ui>=0 && vals[r][ui]) publicUrls[normalizeUrl_(vals[r][ui])]=true;
        expected.forEach(function(x){ if (!publicUrls[normalizeUrl_(x.url)]) publicCheck.missing.push(x.assetType); });
      }
    }
  } catch (ignore) {}
  var out={success:mismatches.length===0 && (!publicCheck.checked || publicCheck.missing.length===0),version:'4.6.5',configured:expected.length,registryRows:registry.length,mismatches:mismatches,publicCheck:publicCheck};
  Logger.log(JSON.stringify(out,null,2));
  return out;
}
