/**
 * GES V4.5 - Calendar V2 -> PRIVATE URL Variants -> PUBLIC Assets projection.
 *
 * Contract
 * -----------------------------------------------------------------------------
 * 1) Google Calendar events remain system state in PRIVATE Registry / Calendar Events.
 * 2) Only CURRENT Calendar series with a real eventHtmlLink become public URL variants.
 * 3) One project Calendar URL is projected when the Calendar exists.
 * 4) Stale Calendar URL variants are removed from PRIVATE URL Variants.
 * 5) QR / TinyURL / CleanURI / Spoo.me enrichment is preserved across Calendar resyncs.
 * 6) Public Project Sheet is refreshed only after PRIVATE Registry reconciliation.
 * 7) This module never creates, patches, or deletes Google Calendar events.
 */

const GES_CALENDAR_URL_VARIANTS_V45 = Object.freeze({
  VERSION: '1.1.0-calendar-v2-unified-public-assets',
  GENERATED_BY: 'CALENDAR_V2_PUBLIC_URL_PROJECTION_V45',
  LEGACY_GENERATED_BY: Object.freeze([
    'CALENDAR_V2_PUBLIC_URL_PROJECTION',
    'CALENDAR_V2_PUBLIC_URL_PROJECTION_V45'
  ]),
  OWNED_ASSET_TYPES: Object.freeze(['CALENDAR', 'CALENDAR_EVENT'])
});

// Backward-compatible constant used by Patch C/E smoke tests.
const GES_CALENDAR_URL_VARIANTS_V43 = GES_CALENDAR_URL_VARIANTS_V45;

/**
 * Compatibility entrypoint retained from Patch C.
 * Write operation: Registry URL Variants only; does NOT touch Google Calendar.
 */
function syncCalendarEventUrlVariantsToRegistryV43_(project, options) {
  return syncCalendarEventUrlVariantsToRegistryV45_(project, options || {});
}

/**
 * Reconcile CURRENT Calendar/Event URLs into PRIVATE Registry / URL Variants.
 * Idempotent by Registry URL key:
 *   projectId + assetType + assetId + variantType
 */
function syncCalendarEventUrlVariantsToRegistryV45_(project, options) {
  options = options || {};
  if (!project || !project.projectId) throw new Error('CALENDAR_URL_PROJECTION_PROJECT_REQUIRED');
  if (!project.registrySheetId) throw new Error('CALENDAR_URL_PROJECTION_REGISTRY_REQUIRED');
  if (typeof getCalendarRegistryRowsV4 !== 'function') {
    return { success: true, skipped: true, code: 'CALENDAR_REGISTRY_NOT_AVAILABLE' };
  }

  var expected = buildExpectedCalendarUrlVariantsV45_(project, options.calendarId || '');
  var ss = SpreadsheetApp.openById(project.registrySheetId);
  var sh = ensureSheetWithHeaders_(ss, V3_CONFIG.REGISTRY_TABS.URLS, V3_URL_HEADERS);
  var data = sh.getDataRange().getValues();
  var display = sh.getDataRange().getDisplayValues();
  var idx = calendarUrlHeaderIndexV45_(display[0] || []);
  var rowsByKey = {};
  var ownedRows = [];

  for (var r = 1; r < display.length; r++) {
    if (safeString_(display[r][idx['Project ID']]) !== safeString_(project.projectId)) continue;
    var assetType = safeString_(display[r][idx['Asset Type']]).toUpperCase();
    if (GES_CALENDAR_URL_VARIANTS_V45.OWNED_ASSET_TYPES.indexOf(assetType) === -1) continue;
    var key = safeString_(display[r][idx['Key']]);
    if (!key) key = calendarUrlVariantKeyV45_(project.projectId, assetType, display[r][idx['Asset ID']], display[r][idx['Variant Type']]);
    if (rowsByKey[key]) {
      throw new Error('CALENDAR_URL_VARIANT_DUPLICATE_KEY: ' + key + ' rows=' + rowsByKey[key].row + ',' + (r + 1));
    }
    rowsByKey[key] = { row: r + 1, values: data[r], display: display[r] };
    ownedRows.push({ row: r + 1, key: key });
  }

  var expectedByKey = {};
  expected.rows.forEach(function(item) { expectedByKey[item.key] = item; });

  var updated = 0;
  var created = 0;
  var preservedEnrichment = 0;
  var staleRows = [];

  // Update canonical rows in place first so later row deletion cannot invalidate indexes.
  expected.rows.forEach(function(item) {
    var existing = rowsByKey[item.key] || null;
    if (existing) {
      var nextRow = buildCalendarUrlRegistryRowV45_(project, item, existing, idx);
      sh.getRange(existing.row, 1, 1, V3_URL_HEADERS.length).setValues([nextRow]);
      updated++;
      if (calendarUrlRowHasEnrichmentV45_(existing.display, idx)) preservedEnrichment++;
    }
  });

  ownedRows.forEach(function(ref) {
    if (!expectedByKey[ref.key]) staleRows.push(ref.row);
  });

  // Delete stale owned rows in descending order. Never touches non-Calendar URL variants.
  staleRows.sort(function(a, b) { return b - a; }).forEach(function(rowNumber) {
    sh.deleteRow(rowNumber);
  });

  // Append newly expected rows after stale cleanup.
  expected.rows.forEach(function(item) {
    if (rowsByKey[item.key]) return;
    sh.appendRow(buildCalendarUrlRegistryRowV45_(project, item, null, idx));
    created++;
  });

  var result = {
    success: true,
    version: GES_CALENDAR_URL_VARIANTS_V45.VERSION,
    projectId: project.projectId,
    calendarId: expected.calendarId,
    expectedCount: expected.rows.length,
    calendarCount: expected.calendarId ? 1 : 0,
    eventUrlCount: expected.eventUrlCount,
    created: created,
    updated: updated,
    staleRemoved: staleRows.length,
    preservedEnrichment: preservedEnrichment,
    skippedCurrentWithoutHtmlLink: expected.skippedCurrentWithoutHtmlLink,
    warnings: expected.warnings
  };

  try {
    appendRegistryLog_(project.projectId, {
      action: 'CALENDAR_PUBLIC_URL_PROJECTION',
      payload: {
        assetType: 'CALENDAR',
        result: 'SUCCESS',
        message: 'Calendar URLs reconciled into private URL Variants.',
        version: GES_CALENDAR_URL_VARIANTS_V45.VERSION,
        expectedCount: result.expectedCount,
        created: created,
        updated: updated,
        staleRemoved: staleRows.length,
        skippedCurrentWithoutHtmlLink: expected.skippedCurrentWithoutHtmlLink
      }
    });
  } catch (ignoreLog) {}

  return result;
}

/** Read-only preview. Does not modify Registry, Calendar, or Public Sheet. */
function previewCalendarUrlProjectionV45(projectId) {
  var project = resolveCalendarUrlProjectionProjectV45_(projectId || '');
  var expected = buildExpectedCalendarUrlVariantsV45_(project, '');
  var actual = readCalendarOwnedUrlVariantsV45_(project);
  var expectedByKey = {};
  var actualByKey = {};
  expected.rows.forEach(function(row) { expectedByKey[row.key] = row; });
  actual.rows.forEach(function(row) { actualByKey[row.key] = row; });

  var missing = expected.rows.filter(function(row) {
    return !actualByKey[row.key] || normalizeCalendarProjectionUrlV45_(actualByKey[row.key].url) !== normalizeCalendarProjectionUrlV45_(row.url);
  });
  var stale = actual.rows.filter(function(row) { return !expectedByKey[row.key]; });

  return {
    success: true,
    readOnly: true,
    version: GES_CALENDAR_URL_VARIANTS_V45.VERSION,
    projectId: project.projectId,
    projectName: project.projectName,
    calendarId: expected.calendarId,
    expectedCount: expected.rows.length,
    actualOwnedCount: actual.rows.length,
    missingCount: missing.length,
    staleCount: stale.length,
    skippedCurrentWithoutHtmlLink: expected.skippedCurrentWithoutHtmlLink,
    missing: missing,
    stale: stale,
    warnings: expected.warnings
  };
}

function previewActiveCalendarUrlProjectionV45() {
  return previewCalendarUrlProjectionV45('');
}

/**
 * Write-only repair of the projection layer. Does NOT call Calendar.Events.*.
 * Useful after installing a patch when Calendar Registry is already CURRENT.
 */
function rebuildCalendarV2PublicProjectionV45(projectId) {
  var project = resolveCalendarUrlProjectionProjectV45_(projectId || '');
  assertProjectWritable_(project);
  var privateUrls = syncCalendarEventUrlVariantsToRegistryV45_(project, {});
  var publicSheet = typeof refreshProjectPublicSheetV43 === 'function'
    ? refreshProjectPublicSheetV43(project.projectId)
    : { success: false, skipped: true, code: 'PUBLIC_SHEET_MODULE_NOT_AVAILABLE' };
  var validation = validateCalendarV2PublicProjectionV45(project.projectId);
  return {
    success: privateUrls.success !== false && publicSheet.success !== false && validation.valid,
    projectId: project.projectId,
    privateUrlVariants: privateUrls,
    publicSheet: publicSheet,
    validation: validation
  };
}

function rebuildActiveCalendarV2PublicProjectionV45() {
  return rebuildCalendarV2PublicProjectionV45('');
}

/**
 * Finalizer called automatically by CalendarSyncManager after a COMPLETE sync.
 * Calendar itself is never modified here.
 */
function finalizeCalendarV2PublicProjectionV45_(project, calendarId) {
  var privateUrls = syncCalendarEventUrlVariantsToRegistryV45_(project, { calendarId: calendarId || '' });
  var publicSheet = typeof refreshProjectPublicSheetV43 === 'function'
    ? refreshProjectPublicSheetV43(project.projectId)
    : { success: false, skipped: true, code: 'PUBLIC_SHEET_MODULE_NOT_AVAILABLE' };
  var validation = validateCalendarV2PublicProjectionV45(project.projectId);
  return {
    success: privateUrls.success !== false && publicSheet.success !== false && validation.valid,
    version: GES_CALENDAR_URL_VARIANTS_V45.VERSION,
    privateUrlVariants: privateUrls,
    publicSheet: publicSheet,
    validation: validation
  };
}

/**
 * Read-only end-to-end validator:
 * Calendar Events Registry -> private URL Variants -> Public Sheet / Assets.
 */
function validateCalendarV2PublicProjectionV45(projectId) {
  var project = resolveCalendarUrlProjectionProjectV45_(projectId || '');
  var expected = buildExpectedCalendarUrlVariantsV45_(project, '');
  var actual = readCalendarOwnedUrlVariantsV45_(project);
  var expectedByKey = {};
  var actualByKey = {};
  var duplicateKeys = [];

  expected.rows.forEach(function(row) { expectedByKey[row.key] = row; });
  actual.rows.forEach(function(row) {
    if (actualByKey[row.key]) duplicateKeys.push(row.key);
    actualByKey[row.key] = row;
  });

  var privateMissing = [];
  expected.rows.forEach(function(row) {
    var got = actualByKey[row.key];
    if (!got || normalizeCalendarProjectionUrlV45_(got.url) !== normalizeCalendarProjectionUrlV45_(row.url) || safeString_(got.urlStatus).toUpperCase() !== 'AVAILABLE') {
      privateMissing.push({ key: row.key, type: row.variantType, url: row.url });
    }
  });
  var privateStale = actual.rows.filter(function(row) { return !expectedByKey[row.key]; });

  var publicState = null;
  var publicUrls = {};
  var publicCalendarUrls = [];
  var publicSheetError = '';
  try {
    var state = getProjectSingletonAssetStateV41_(project, 'PROJECT_URL_SHEET');
    publicState = { id: state.id || '', status: state.status || '' };
    if (state.id) {
      var pss = SpreadsheetApp.openById(state.id);
      var ash = pss.getSheetByName('Assets');
      if (!ash) throw new Error('PUBLIC_ASSETS_TAB_MISSING');
      var values = ash.getDataRange().getDisplayValues();
      var headers = values[0] || [];
      var urlIndex = headers.indexOf('URL');
      var typeIndex = headers.indexOf('Asset Type/ Variant Type');
      var nameIndex = headers.indexOf('Name');
      if (urlIndex === -1) throw new Error('PUBLIC_ASSETS_URL_COLUMN_MISSING');
      for (var r = 1; r < values.length; r++) {
        var url = safeString_(values[r][urlIndex]);
        if (!url) continue;
        publicUrls[normalizeCalendarProjectionUrlV45_(url)] = true;
        var type = typeIndex >= 0 ? safeString_(values[r][typeIndex]) : '';
        if (/^calendar/i.test(type)) {
          publicCalendarUrls.push({
            type: type,
            name: nameIndex >= 0 ? safeString_(values[r][nameIndex]) : '',
            url: url
          });
        }
      }
    }
  } catch (e) {
    publicSheetError = safeString_(e && e.message || e);
  }

  var publicMissing = expected.rows.filter(function(row) {
    return !publicUrls[normalizeCalendarProjectionUrlV45_(row.url)];
  }).map(function(row) {
    return { key: row.key, type: row.variantType, url: row.url };
  });
  var expectedUrlSet = {};
  expected.rows.forEach(function(row) { expectedUrlSet[normalizeCalendarProjectionUrlV45_(row.url)] = true; });
  var publicStale = publicCalendarUrls.filter(function(row) {
    return !expectedUrlSet[normalizeCalendarProjectionUrlV45_(row.url)];
  });

  var valid = duplicateKeys.length === 0 &&
    privateMissing.length === 0 && privateStale.length === 0 &&
    !publicSheetError && !!(publicState && publicState.id) &&
    publicMissing.length === 0 && publicStale.length === 0 &&
    expected.skippedCurrentWithoutHtmlLink === 0;

  return {
    success: true,
    valid: valid,
    version: GES_CALENDAR_URL_VARIANTS_V45.VERSION,
    projectId: project.projectId,
    projectName: project.projectName,
    calendarId: expected.calendarId,
    expected: {
      total: expected.rows.length,
      calendar: expected.calendarId ? 1 : 0,
      currentEventUrls: expected.eventUrlCount
    },
    privateRegistry: {
      ownedRows: actual.rows.length,
      missing: privateMissing,
      stale: privateStale,
      duplicateKeys: duplicateKeys
    },
    publicSheet: {
      sheetId: publicState && publicState.id || '',
      status: publicState && publicState.status || '',
      error: publicSheetError,
      calendarRows: publicCalendarUrls.length,
      missing: publicMissing,
      stale: publicStale
    },
    skippedCurrentWithoutHtmlLink: expected.skippedCurrentWithoutHtmlLink,
    warnings: expected.warnings
  };
}

function validateActiveCalendarV2PublicProjectionV45() {
  return validateCalendarV2PublicProjectionV45('');
}

/* ========================================================================== *
 * Internal helpers
 * ========================================================================== */

function buildExpectedCalendarUrlVariantsV45_(project, calendarIdOverride) {
  var rows = getCalendarRegistryRowsV4(project.projectId);
  var current = rows.filter(function(row) {
    return safeString_(row.status).toUpperCase() === 'CURRENT' && !!safeString_(row.eventId);
  });

  var calendarIds = {};
  current.forEach(function(row) {
    if (row.calendarId) calendarIds[safeString_(row.calendarId)] = true;
  });
  if (project.calendar && project.calendar.calendarId) calendarIds[safeString_(project.calendar.calendarId)] = true;
  if (calendarIdOverride) calendarIds[safeString_(calendarIdOverride)] = true;
  var ids = Object.keys(calendarIds).filter(function(id) { return !!id; });
  var warnings = [];
  if (ids.length > 1) warnings.push('MULTIPLE_CALENDAR_IDS_IN_PROJECTION:' + ids.join(','));
  var calendarId = calendarIdOverride || (project.calendar && project.calendar.calendarId) || (ids.length === 1 ? ids[0] : '');

  var out = [];
  var keyword = getProjectKeywordV41_(project);
  if (calendarId) {
    var calUrl = typeof calendarAssetCalendarUrlV4_ === 'function'
      ? calendarAssetCalendarUrlV4_(calendarId)
      : ('https://calendar.google.com/calendar/u/0/r?cid=' + encodeURIComponent(calendarId));
    out.push(buildExpectedCalendarUrlRowV45_(project, {
      assetType: 'CALENDAR',
      assetId: calendarId,
      assetName: 'Calendar - ' + keyword,
      variantType: 'calendar',
      label: 'Calendar - ' + keyword,
      url: calUrl,
      notes: 'Project Calendar'
    }));
  }

  var skipped = 0;
  current.forEach(function(row) {
    var htmlLink = safeString_(row.eventHtmlLink);
    if (!htmlLink) {
      skipped++;
      warnings.push('CURRENT_EVENT_MISSING_HTML_LINK:' + safeString_(row.eventKey));
      return;
    }
    var allDay = row.allDay === true || safeString_(row.allDay).toUpperCase() === 'TRUE';
    out.push(buildExpectedCalendarUrlRowV45_(project, {
      assetType: 'CALENDAR_EVENT',
      assetId: safeString_(row.eventId),
      assetName: safeString_(row.eventSummary) || ('Calendar - ' + keyword + ' - Event'),
      variantType: allDay ? 'Calendar - All Day Event' : 'Calendar Event',
      label: safeString_(row.eventSummary) || ('Calendar - ' + keyword + ' - Event'),
      url: htmlLink,
      notes: 'eventKey=' + safeString_(row.eventKey)
    }));
  });

  out.sort(function(a, b) { return a.key.localeCompare(b.key); });
  return {
    calendarId: calendarId,
    rows: out,
    eventUrlCount: out.filter(function(row) { return row.assetType === 'CALENDAR_EVENT'; }).length,
    skippedCurrentWithoutHtmlLink: skipped,
    warnings: warnings
  };
}

function buildExpectedCalendarUrlRowV45_(project, item) {
  var key = calendarUrlVariantKeyV45_(project.projectId, item.assetType, item.assetId, item.variantType);
  return {
    key: key,
    sourceDocId: '',
    assetType: item.assetType,
    assetId: item.assetId,
    assetName: item.assetName,
    variantType: item.variantType,
    label: item.label,
    url: item.url,
    urlStatus: 'AVAILABLE',
    publishedId: '',
    generatedBy: GES_CALENDAR_URL_VARIANTS_V45.GENERATED_BY,
    notes: item.notes || ''
  };
}

function buildCalendarUrlRegistryRowV45_(project, item, existing, idx) {
  var now = nowIso_();
  var date = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  var display = existing && existing.display || [];

  function old(header) {
    return idx[header] === undefined ? '' : safeString_(display[idx[header]]);
  }

  var qr = old('QR');
  var tiny = old('TinyURL');
  var clean = old('CleanURI');
  var spoo = old('Spoo.me');
  var oldDate = old('Date');
  var hyperlink = item.url
    ? '=HYPERLINK("' + String(item.url).replace(/"/g, '""') + '","' + String(item.label || item.assetName || item.variantType).replace(/"/g, '""') + '")'
    : '';

  return [
    item.key,
    project.projectId,
    item.sourceDocId || '',
    item.assetType,
    item.assetId,
    item.assetName || '',
    item.variantType,
    item.label || item.assetName || '',
    item.url || '',
    item.urlStatus || 'AVAILABLE',
    item.publishedId || '',
    GES_CALENDAR_URL_VARIANTS_V45.GENERATED_BY,
    now,
    qr,
    hyperlink,
    oldDate || date,
    tiny,
    clean,
    spoo,
    item.notes || ''
  ];
}

function readCalendarOwnedUrlVariantsV45_(project) {
  var result = { rows: [] };
  if (!project.registrySheetId) return result;
  var ss = SpreadsheetApp.openById(project.registrySheetId);
  var sh = ss.getSheetByName(V3_CONFIG.REGISTRY_TABS.URLS);
  if (!sh || sh.getLastRow() < 2) return result;
  var values = sh.getDataRange().getDisplayValues();
  var idx = calendarUrlHeaderIndexV45_(values[0] || []);
  for (var r = 1; r < values.length; r++) {
    if (safeString_(values[r][idx['Project ID']]) !== safeString_(project.projectId)) continue;
    var assetType = safeString_(values[r][idx['Asset Type']]).toUpperCase();
    if (GES_CALENDAR_URL_VARIANTS_V45.OWNED_ASSET_TYPES.indexOf(assetType) === -1) continue;
    result.rows.push({
      key: safeString_(values[r][idx['Key']]) || calendarUrlVariantKeyV45_(project.projectId, assetType, values[r][idx['Asset ID']], values[r][idx['Variant Type']]),
      assetType: assetType,
      assetId: safeString_(values[r][idx['Asset ID']]),
      assetName: safeString_(values[r][idx['Asset Name']]),
      variantType: safeString_(values[r][idx['Variant Type']]),
      label: safeString_(values[r][idx['Anchor/Name']]),
      url: safeString_(values[r][idx['URL']]),
      urlStatus: safeString_(values[r][idx['URL Status']]),
      generatedBy: safeString_(values[r][idx['Generated By']]),
      qr: safeString_(values[r][idx['QR']]),
      tinyUrl: safeString_(values[r][idx['TinyURL']]),
      cleanUri: safeString_(values[r][idx['CleanURI']]),
      notes: safeString_(values[r][idx['Notes']])
    });
  }
  result.rows.sort(function(a, b) { return a.key.localeCompare(b.key); });
  return result;
}

function calendarUrlHeaderIndexV45_(headers) {
  var idx = {};
  (headers || []).forEach(function(h, i) { idx[safeString_(h)] = i; });
  V3_URL_HEADERS.forEach(function(header) {
    if (idx[header] === undefined) throw new Error('CALENDAR_URL_VARIANT_HEADER_MISSING: ' + header);
  });
  return idx;
}

function calendarUrlVariantKeyV45_(projectId, assetType, assetId, variantType) {
  return [safeString_(projectId), safeString_(assetType).toUpperCase(), safeString_(assetId), safeString_(variantType)].join('|');
}

function calendarUrlRowHasEnrichmentV45_(displayRow, idx) {
  if (!displayRow) return false;
  return ['QR','TinyURL','CleanURI','Spoo.me'].some(function(header) {
    return idx[header] !== undefined && !!safeString_(displayRow[idx[header]]);
  });
}

function normalizeCalendarProjectionUrlV45_(url) {
  return safeString_(url).trim().replace(/#.*$/, '').replace(/\/$/, '');
}

function resolveCalendarUrlProjectionProjectV45_(projectId) {
  var project = projectId ? getProject_(projectId) : getActiveProject_();
  if (!project) throw new Error('CALENDAR_URL_PROJECTION_PROJECT_NOT_FOUND');
  return project;
}
