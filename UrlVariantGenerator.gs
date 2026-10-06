/** Deterministic URL-variant rules plus manually supplied Published-to-Web URLs. */

function publishedPropertyKey_(projectId, assetType, assetId) {
  return V3_CONFIG.PROPERTY_KEYS.PUBLISHED_PREFIX + projectId + '_' + assetType + '_' + assetId;
}

function getPublishedInfo_(project, assetType, assetId) {
  const raw = getScriptProps_().getProperty(publishedPropertyKey_(project.projectId, assetType, assetId));
  return raw ? jsonParseSafe_(raw, {}) : {};
}

const GES_PUBLISHED_URL_PROJECTION_V462 = Object.freeze({
  VERSION: '4.6.2',
  AUTO_REFRESH_TYPES: ['DOC', 'SLIDES']
});

function shouldAutoRefreshPublishedUrlProjectionV462_(assetType) {
  return GES_PUBLISHED_URL_PROJECTION_V462.AUTO_REFRESH_TYPES.indexOf(
    safeString_(assetType).toUpperCase()
  ) !== -1;
}

/**
 * Persist a manually-created Publish-to-Web URL.
 *
 * V4.6.2 invariant for DOC / SLIDES:
 *   Published URL -> Private Registry URL Variants -> Public Sheet Assets
 * must complete in the same user action. This prevents the Public Sheet from
 * remaining stale after Set Docs Pub URL / Set Pub URL.
 */
function setPublishedUrlForAsset(assetType, assetId, publishedUrl) {
  const project = getActiveProject_();
  const normalizedType = safeString_(assetType).toUpperCase();
  const info = parsePublishedUrl_(normalizedType, publishedUrl);
  if (!info.valid) throw new Error(info.message || 'Published URL không hợp lệ.');

  getScriptProps_().setProperty(
    publishedPropertyKey_(project.projectId, normalizedType, assetId),
    JSON.stringify(info)
  );

  // Source of truth first: rebuild PRIVATE Registry URL Variants.
  rebuildRegistryForProject(project.projectId);

  var publicProjection = {
    required: shouldAutoRefreshPublishedUrlProjectionV462_(normalizedType),
    attempted: false,
    refreshed: false,
    skipped: false,
    verified: false,
    code: 'AUTO_REFRESH_NOT_REQUIRED',
    message: ''
  };

  // DOC and SLIDES Published URLs are public-safe URL variants and therefore
  // must immediately flow into the PUBLIC Assets projection when that Sheet
  // already exists. PROJECT_URL_SHEET keeps its dedicated setter/refresh flow.
  if (publicProjection.required) {
    publicProjection.attempted = true;
    try {
      if (typeof refreshProjectPublicSheetV43 !== 'function') {
        publicProjection.code = 'PUBLIC_SHEET_REFRESH_FUNCTION_MISSING';
        publicProjection.message = 'Không tìm thấy refreshProjectPublicSheetV43().';
      } else {
        var refresh = refreshProjectPublicSheetV43(project.projectId);
        publicProjection.refresh = refresh;
        publicProjection.skipped = !!(refresh && refresh.skipped);
        publicProjection.refreshed = !!(refresh && refresh.success && !refresh.skipped);
        publicProjection.code = refresh && refresh.code ||
          (publicProjection.refreshed ? 'PUBLIC_ASSETS_REFRESHED' : 'PUBLIC_ASSETS_REFRESH_SKIPPED');

        if (publicProjection.refreshed) {
          var verification = verifyPublishedUrlInPublicAssetsV462_(project, info.publishedUrl);
          publicProjection.verification = verification;
          publicProjection.verified = !!verification.found;
          if (!publicProjection.verified) {
            publicProjection.code = 'PUBLISHED_URL_NOT_FOUND_IN_PUBLIC_ASSETS';
            publicProjection.message = 'Public Sheet đã refresh nhưng Published URL chưa xuất hiện trong tab Assets.';
          }
        } else if (publicProjection.skipped) {
          publicProjection.message = 'Public Project Sheet chưa ở trạng thái managed; URL vẫn đã được lưu trong Private Registry.';
        }
      }
    } catch (e) {
      publicProjection.code = 'PUBLIC_ASSETS_REFRESH_FAILED';
      publicProjection.message = safeString_(e && e.message || e);
    }
  }

  return {
    valid: info.valid,
    publishedId: info.publishedId,
    publishedUrl: info.publishedUrl,
    savedAt: info.savedAt,
    assetType: normalizedType,
    assetId: safeString_(assetId),
    registryRebuilt: true,
    publicProjection: publicProjection
  };
}

/** Verify the URL is physically present in the managed Public Sheet / Assets. */
function verifyPublishedUrlInPublicAssetsV462_(project, publishedUrl) {
  var state = getProjectSingletonAssetStateV41_(project, 'PROJECT_URL_SHEET');
  if (!state || !state.id) {
    return { checked: false, found: false, code: 'PUBLIC_PROJECT_SHEET_MISSING' };
  }

  var ss = SpreadsheetApp.openById(state.id);
  var sheetName = (typeof GES_PUBLIC_SHEET_V43 !== 'undefined' &&
    GES_PUBLIC_SHEET_V43.TABS && GES_PUBLIC_SHEET_V43.TABS.ASSETS) || 'Assets';
  var sh = ss.getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) {
    return { checked: true, found: false, code: 'PUBLIC_ASSETS_EMPTY', sheetId: state.id };
  }

  var values = sh.getDataRange().getDisplayValues();
  var headers = values[0] || [];
  var urlIndex = headers.indexOf('URL');
  if (urlIndex === -1) {
    return { checked: true, found: false, code: 'PUBLIC_ASSETS_URL_COLUMN_MISSING', sheetId: state.id };
  }

  var target = normalizeUrl_(publishedUrl);
  var foundRow = 0;
  for (var r = 1; r < values.length; r++) {
    if (normalizeUrl_(values[r][urlIndex]) === target) {
      foundRow = r + 1;
      break;
    }
  }

  return {
    checked: true,
    found: foundRow > 0,
    code: foundRow > 0 ? 'PUBLISHED_URL_PROJECTED' : 'PUBLISHED_URL_NOT_PROJECTED',
    sheetId: state.id,
    row: foundRow,
    url: target
  };
}

function parsePublishedUrl_(assetType, url) {
  const s = normalizeUrl_(url);
  if (!s) return { valid: false, message: 'URL trống.' };
  const m = s.match(/\/d\/e\/([^/]+)/);
  if (!m) return { valid: false, message: 'Không tìm thấy Published ID (/d/e/...).' };
  const domainOk = /^https:\/\/docs\.google\.com\//i.test(s);
  if (!domainOk) return { valid: false, message: 'Published URL phải thuộc docs.google.com.' };
  if (assetType === 'DOC' && s.indexOf('/document/') === -1) return { valid: false, message: 'URL không phải Google Docs Published URL.' };
  if (assetType === 'SHEET' && s.indexOf('/spreadsheets/') === -1) return { valid: false, message: 'URL không phải Google Sheets Published URL.' };
  if (assetType === 'SLIDES' && s.indexOf('/presentation/') === -1) return { valid: false, message: 'URL không phải Google Slides Published URL.' };
  return { valid: true, publishedId: m[1], publishedUrl: s, savedAt: nowIso_() };
}

function generateUrlVariantsForAsset_(project, asset) {
  const rawType = asset.assetType;
  const t = rawType === 'PROJECT_URL_SHEET' ? 'SHEET' :
            rawType === 'PROJECT_FORM' ? 'FORM' :
            rawType === 'PROJECT_DRAWING' ? 'DRAWING' : rawType;
  const id = asset.assetId;
  const pub = getPublishedInfo_(project, t, id);
  const v = [];
  function add(type, label, url, status, publishedId, notes) {
    v.push({ variantType: type, label: label, url: url || '', status: status || (url ? 'AVAILABLE' : 'NOT_AVAILABLE'), publishedId: publishedId || '', notes: notes || '', generatedBy: 'URL_RULE_V' + V3_CONFIG.URL_RULE_VERSION });
  }

  if (t === 'DOC') {
    add('document', asset.assetName, 'https://docs.google.com/document/d/' + id + '/edit?usp=sharing');
    add('document view', asset.assetName + ' - view', 'https://docs.google.com/document/d/' + id + '/view');
    add('document preview', asset.assetName + ' - preview', 'https://docs.google.com/document/d/' + id + '/preview');
    add('document pub', asset.assetName + ' - pub', pub.publishedUrl || '', pub.publishedUrl ? 'AVAILABLE' : 'NOT_PUBLISHED', pub.publishedId || '');
  }
  else if (t === 'SHEET') {
    add('spreadsheet', asset.assetName, 'https://docs.google.com/spreadsheets/d/' + id + '/edit?usp=sharing');
    add('spreadsheet view', asset.assetName + ' - view', 'https://docs.google.com/spreadsheets/d/' + id + '/view');
    add('spreadsheet preview', asset.assetName + ' - preview', 'https://docs.google.com/spreadsheets/d/' + id + '/preview');
    add('spreadsheet pubhtml', asset.assetName + ' - pubhtml', pub.publishedUrl || '', pub.publishedUrl ? 'AVAILABLE' : 'NOT_PUBLISHED', pub.publishedId || '');
  }
  else if (t === 'FORM') {
    let editUrl = 'https://docs.google.com/forms/d/' + id + '/edit';
    let publicUrl = '';
    try {
      const form = FormApp.openById(id);
      editUrl = form.getEditUrl() || editUrl;
      publicUrl = form.getPublishedUrl() || '';
    } catch (e) {}
    add('form', asset.assetName, editUrl);
    add('form preview', asset.assetName + ' - form', publicUrl, publicUrl ? 'AVAILABLE' : 'NOT_AVAILABLE');
  }
  else if (t === 'DRAWING') {
    add('drawing', asset.assetName, 'https://docs.google.com/drawings/d/' + id + '/edit');
  }
  else if (t === 'SLIDES') {
    const base = 'https://docs.google.com/presentation/d/' + id;
    add('slide', asset.assetName, base + '/edit');
    add('slide view', asset.assetName + ' - view', base + '/view');
    add('slide htmlpresent', asset.assetName + ' - htmlpresent', base + '/htmlpresent');
    add('slide present', asset.assetName + ' - present', base + '/present');
    add('slide preview', asset.assetName + ' - preview', base + '/preview');
    add('slide preview minimal', asset.assetName + ' - preview minimal', base + '/preview?rm=minimal');
    add('slide pub', asset.assetName + ' - pub', pub.publishedUrl || '', pub.publishedUrl ? 'AVAILABLE' : 'NOT_PUBLISHED', pub.publishedId || '');
  }
  else if (t === 'PDF') add('pdf', asset.assetName, 'https://drive.google.com/file/d/' + id + '/view');
  else if (t === 'DOCX') add('docx', asset.assetName, 'https://drive.google.com/file/d/' + id + '/view');
  else if (t === 'HTML') add('html', asset.assetName, 'https://drive.google.com/file/d/' + id + '/view');
  return v;
}
