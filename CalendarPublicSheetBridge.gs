/**
 * GES V4 Calendar V2.1 -> Public Project Sheet bridge.
 *
 * Read-only helper used by CalendarPlanner.gs to render Google Calendar event
 * descriptions with the exact public-facing Display Name + URL already exposed
 * in the Public Project Sheet / Assets tab.
 *
 * Safety:
 * - never writes to the Public Sheet;
 * - never changes Registry state;
 * - never treats the Public Sheet as source-of-truth for asset identity;
 * - Calendar asset identity always comes from the Project profile / resolver.
 */

const GES_CALENDAR_PUBLIC_SHEET_BRIDGE_V21 = Object.freeze({
  VERSION: '2.1.1',
  ASSETS_TAB: 'Assets',
  MAX_TARGET_RELEVANT_LINKS: 14,
  MAX_TARGET_DESCRIPTION_CHARS: 12000,
  EXCLUDED_TARGET_VARIANT_PREFIXES: Object.freeze([
    'calendar'
  ]),
  EXCLUDED_TARGET_VARIANT_TYPES: Object.freeze([
    'target url'
  ])
});

/** Read-only diagnostics for the active project. */
function previewActiveCalendarV21PublicLinks() {
  var project = getActiveProject_();
  if (!project) throw new Error('NO_ACTIVE_PROJECT');
  var snapshot = buildCalendarV2AssetSnapshot_(project);
  var context = { project: project, snapshot: snapshot };
  var rows = getCalendarPublicAssetRowsV21_(context);
  var selected = selectCalendarTargetRelevantLinksV21_(context, rows);
  var out = {
    success: true,
    version: GES_CALENDAR_PUBLIC_SHEET_BRIDGE_V21.VERSION,
    projectId: project.projectId,
    projectName: project.projectName,
    projectKeyword: snapshot.projectKeyword,
    publicSheetId: safeString_(snapshot.projectUrlSheet && snapshot.projectUrlSheet.id),
    publicAssetRows: rows.length,
    targetRelevantLinks: selected.length,
    rows: selected
  };
  console.log(JSON.stringify(out, null, 2));
  return out;
}

/**
 * Read the public-facing Assets projection.
 * Returned records intentionally contain only public fields.
 */
function getCalendarPublicAssetRowsV21_(context) {
  var sheetAsset = context && context.snapshot ? context.snapshot.projectUrlSheet : null;
  if (!sheetAsset || !sheetAsset.ready || !sheetAsset.id) return [];

  var spreadsheet;
  try { spreadsheet = SpreadsheetApp.openById(sheetAsset.id); }
  catch (e) { return []; }

  var sheet = spreadsheet.getSheetByName(GES_CALENDAR_PUBLIC_SHEET_BRIDGE_V21.ASSETS_TAB);
  if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() < 4) return [];

  var range = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn());
  var display = range.getDisplayValues();
  if (!display.length) return [];

  var headers = display[0].map(calendarV21NormalizeHeader_);
  var idxType = calendarV21FindHeaderIndex_(headers, ['asset type variant type','asset type','variant type']);
  var idxName = calendarV21FindHeaderIndex_(headers, ['name','anchor name']);
  var idxUrl = calendarV21FindHeaderIndex_(headers, ['url']);
  var idxDisplay = calendarV21FindHeaderIndex_(headers, ['display name','hyperlink']);
  var idxDate = calendarV21FindHeaderIndex_(headers, ['date']);
  if (idxUrl < 0) return [];

  var registryId = safeString_(context.project && context.project.registrySheetId);
  var rows = [];
  var seen = {};

  for (var r = 1; r < display.length; r++) {
    var row = display[r] || [];
    var url = safeString_(row[idxUrl]).trim();
    if (!/^https?:\/\//i.test(url)) continue;
    if (registryId && url.indexOf(registryId) !== -1) continue;

    var key = calendarV21CanonicalUrlKey_(url);
    if (!key || seen[key]) continue;
    seen[key] = true;

    var name = idxName >= 0 ? safeString_(row[idxName]).trim() : '';
    var displayName = idxDisplay >= 0 ? safeString_(row[idxDisplay]).trim() : '';
    rows.push({
      variantType: idxType >= 0 ? safeString_(row[idxType]).trim() : '',
      name: name,
      displayName: displayName || name || url,
      url: url,
      date: idxDate >= 0 ? safeString_(row[idxDate]).trim() : ''
    });
  }
  return rows;
}

/**
 * Relevant-info links for TARGET_URL.
 * Calendar-derived URLs are deliberately excluded to prevent a feedback loop:
 * Calendar -> Public Assets -> Calendar description -> fingerprint -> Calendar.
 */
function selectCalendarTargetRelevantLinksV21_(context, rows) {
  rows = rows || getCalendarPublicAssetRowsV21_(context);
  var sources = calendarV211CanonicalTargetRelevantSources_(context);
  var out = [];
  var seen = {};

  sources.forEach(function(item) {
    var source = item.source;
    if (!source || !source.ready || !source.url) return;

    var row = calendarV211FindPublicRowForCanonicalSource_(rows, source);
    var url = safeString_((row && row.url) || source.url).trim();
    if (!url) return;
    var urlKey = calendarV21CanonicalUrlKey_(url);
    if (!urlKey || seen[urlKey]) return;
    seen[urlKey] = true;

    out.push({
      canonicalRole: item.role,
      variantType: safeString_((row && row.variantType) || item.publicType || item.role),
      name: safeString_((row && row.name) || source.name || item.role),
      displayName: safeString_((row && row.displayName) || (row && row.name) || source.name || item.role),
      url: url,
      date: safeString_((row && row.date) || '')
    });
  });

  return out.slice(0, GES_CALENDAR_PUBLIC_SHEET_BRIDGE_V21.MAX_TARGET_RELEVANT_LINKS);
}

/**
 * Exact canonical TARGET_URL relevant-info contract:
 * 9 project folders + Public Sheet + Form + Drawing + exact Doc + exact Slides.
 * Never include article children or URL variants such as view/pub/preview.
 */
function calendarV211CanonicalTargetRelevantSources_(context) {
  var snapshot = context && context.snapshot ? context.snapshot : {};
  var out = [];
  function add(role, source, publicType) {
    if (!source || !source.ready || !source.url) return;
    out.push({ role: role, source: source, publicType: publicType || role });
  }

  [
    ['PROJECT_FOLDER','ROOT','folder top'],
    ['ARTICLES_FOLDER','ARTICLES','folder articles'],
    ['DOCX_FOLDER','DOCX','folder docx'],
    ['HTML_FOLDER','HTML','folder html'],
    ['SLIDES_FOLDER','SLIDES','folder slides'],
    ['PDFS_FOLDER','PDF','folder pdfs'],
    ['PHOTOS_FOLDER','PHOTOS','folder photos'],
    ['VIDEOS_FOLDER','VIDEOS','folder videos'],
    ['PODCAST_FOLDER','PODCASTS','folder podcasts']
  ].forEach(function(spec) {
    var folder = snapshot.folders && snapshot.folders[spec[1]];
    if (!folder || !folder.exists || !folder.url) return;
    add(spec[0], {
      ready: true, id: safeString_(folder.id), name: safeString_(folder.name),
      url: safeString_(folder.url), kind: 'DRIVE_FOLDER'
    }, spec[2]);
  });

  add('PROJECT_URL_SHEET', snapshot.projectUrlSheet, 'spreadsheet');
  add('PROJECT_FORM', snapshot.projectForm, 'form');
  add('PROJECT_DRAWING', snapshot.projectDrawing, 'drawing');
  add('EXACT_MATCH_DOC', snapshot.exactMatchDoc, 'document');
  add('EXACT_MATCH_SLIDES', snapshot.exactMatchSlides, 'slide');
  return out;
}

function calendarV211FindPublicRowForCanonicalSource_(rows, source) {
  var wanted = calendarV21CanonicalUrlKey_(source && source.url);
  var id = safeString_(source && source.id).trim();
  var firstIdMatch = null;
  for (var i = 0; i < (rows || []).length; i++) {
    var row = rows[i];
    if (calendarV21TargetLinkExcluded_(calendarV21NormalizeText_(row.variantType))) continue;
    if (wanted && calendarV21CanonicalUrlKey_(row.url) === wanted) return row;
    if (!firstIdMatch && id && safeString_(row.url).indexOf(id) !== -1) firstIdMatch = row;
  }
  return firstIdMatch;
}

function findCalendarPublicDisplayNameV21_(context, url, fallbackName) {
  var key = calendarV21CanonicalUrlKey_(url);
  if (!key) return safeString_(fallbackName || '');
  var rows = getCalendarPublicAssetRowsV21_(context);
  for (var i = 0; i < rows.length; i++) {
    if (calendarV21CanonicalUrlKey_(rows[i].url) === key) {
      return rows[i].displayName || rows[i].name || fallbackName || url;
    }
  }
  return safeString_(fallbackName || url);
}

function calendarV21TargetLinkExcluded_(normalizedType) {
  if (GES_CALENDAR_PUBLIC_SHEET_BRIDGE_V21.EXCLUDED_TARGET_VARIANT_TYPES.indexOf(normalizedType) !== -1) return true;
  return GES_CALENDAR_PUBLIC_SHEET_BRIDGE_V21.EXCLUDED_TARGET_VARIANT_PREFIXES.some(function(prefix) {
    return normalizedType.indexOf(prefix) === 0;
  });
}

function calendarV21FindHeaderIndex_(headers, candidates) {
  for (var i = 0; i < candidates.length; i++) {
    var candidate = calendarV21NormalizeHeader_(candidates[i]);
    var index = headers.indexOf(candidate);
    if (index !== -1) return index;
  }
  return -1;
}

function calendarV21NormalizeHeader_(value) {
  return calendarV21NormalizeText_(value).replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
}

function calendarV21NormalizeText_(value) {
  var s = safeString_(value).toLowerCase();
  try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (ignore) {}
  return s.replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function calendarV21CanonicalUrlKey_(url) {
  var value = safeString_(url).trim();
  if (!value) return '';
  return value.replace(/#.*$/, '').replace(/[?&](usp|resourcekey)=[^&#]*/gi, '').replace(/[?&]$/, '');
}

function calendarV21EscapeHtml_(value) {
  return safeString_(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function calendarV21Anchor_(label, url) {
  var href = safeString_(url).trim();
  var text = safeString_(label || href).trim();
  if (!href) return calendarV21EscapeHtml_(text);
  return '<a href="' + calendarV21EscapeHtml_(href) + '">' + calendarV21EscapeHtml_(text || href) + '</a>';
}
