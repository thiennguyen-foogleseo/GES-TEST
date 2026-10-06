/**
 * GES V4.6.4.1 - Shortener Provider Eligibility & Calendar URL Skip.
 *
 * Design:
 * - QR is rendered in the PUBLIC Assets sheet as a Google Sheets formula.
 * - TinyURL / CleanURI are generated server-side by the central GES Apps Script.
 * - Existing short URLs are reused from the Private Registry or the previous
 *   Public Assets render so normal refreshes do not repeatedly hit providers.
 * - Provider failures never block the Public Sheet render; the corresponding
 *   short URL cell remains blank and the enrichment report carries a warning.
 *
 * NOTE: generating a short URL sends the source URL to the selected third-party
 * shortening provider. This is intentional and only applies to public/project
 * URLs that are already eligible for the PUBLIC Assets projection.
 */

const GES_PUBLIC_URL_ENRICHMENT_V464 = Object.freeze({
  VERSION: '4.6.4.1',
  PROVIDER_POLICY_VERSION: '4.6.4.1',
  QR_PROVIDER: 'IMAGE_CHARTS',
  QR_BASE_URL: 'https://image-charts.com/chart',
  TINYURL_API: 'https://tinyurl.com/api-create.php',
  CLEANURI_API: 'https://cleanuri.com/api/v1/shorten',
  SPOOME_API: 'https://spoo.me/'
});

/**
 * =========================================================
 * 1. TINYURL
 * =========================================================
 */
function shortenURLWithTinyURL(longUrl) {
  try {
    longUrl = normalizeShortenerInputV464_(longUrl);
    if (!longUrl) return '';

    var apiUrl = GES_PUBLIC_URL_ENRICHMENT_V464.TINYURL_API +
      '?url=' + encodeURIComponent(longUrl);

    var response = UrlFetchApp.fetch(apiUrl, {
      method: 'get',
      followRedirects: true,
      muteHttpExceptions: true
    });

    var httpCode = response.getResponseCode();
    var result = response.getContentText().trim();

    if (httpCode < 200 || httpCode >= 300) {
      throw new Error('HTTP ' + httpCode + ': ' + result);
    }

    if (!/^https?:\/\/.+/i.test(result)) {
      throw new Error('TinyURL trả về dữ liệu không hợp lệ: ' + result);
    }

    Logger.log('TinyURL SUCCESS | ' + longUrl + ' -> ' + result);
    return result;
  } catch (e) {
    Logger.log('TinyURL FAILED | ' + safeStringV464_(longUrl) + ' | ' + safeStringV464_(e && e.message || e));
    return 'Error: ' + safeStringV464_(e && e.message || e);
  }
}

/**
 * =========================================================
 * 2. CLEANURI
 * =========================================================
 */
function shortenURLWithCleanURI(longUrl) {
  try {
    longUrl = normalizeShortenerInputV464_(longUrl);
    if (!longUrl) return '';

    var eligibility = getShortenerProviderEligibilityV4641_('CLEANURI', longUrl);
    if (!eligibility.eligible) {
      Logger.log('CleanURI SKIPPED | ' + eligibility.reason + ' | ' + longUrl);
      return '';
    }

    var response = UrlFetchApp.fetch(GES_PUBLIC_URL_ENRICHMENT_V464.CLEANURI_API, {
      method: 'post',
      contentType: 'application/x-www-form-urlencoded',
      payload: 'url=' + encodeURIComponent(longUrl),
      followRedirects: true,
      muteHttpExceptions: true
    });

    var httpCode = response.getResponseCode();
    var body = response.getContentText().trim();

    Logger.log('CleanURI | HTTP ' + httpCode + ' | ' + body);

    if (httpCode < 200 || httpCode >= 300) {
      throw new Error('HTTP ' + httpCode + ': ' + body);
    }

    var data;
    try {
      data = JSON.parse(body);
    } catch (jsonError) {
      throw new Error('CleanURI trả về dữ liệu không phải JSON: ' + body);
    }

    if (data.error) {
      throw new Error('CleanURI API: ' + data.error);
    }

    if (!data.result_url || !/^https?:\/\/.+/i.test(data.result_url)) {
      throw new Error('CleanURI không trả về short URL hợp lệ: ' + body);
    }

    Logger.log('CleanURI SUCCESS | ' + longUrl + ' -> ' + data.result_url);
    return data.result_url;
  } catch (e) {
    Logger.log('CleanURI FAILED | ' + safeStringV464_(longUrl) + ' | ' + safeStringV464_(e && e.message || e));
    return 'Error: ' + safeStringV464_(e && e.message || e);
  }
}

/**
 * =========================================================
 * 3. SPOO.ME - installed as an optional provider/fallback.
 * V4.6.4 does not project a public Spoo.me column by default.
 * =========================================================
 */
function shortenURLWithSpooMe(longUrl) {
  try {
    longUrl = normalizeShortenerInputV464_(longUrl);
    if (!longUrl) return '';

    var response = UrlFetchApp.fetch(GES_PUBLIC_URL_ENRICHMENT_V464.SPOOME_API, {
      method: 'post',
      contentType: 'application/x-www-form-urlencoded',
      payload: 'url=' + encodeURIComponent(longUrl),
      headers: { 'Accept': 'application/json' },
      followRedirects: true,
      muteHttpExceptions: true
    });

    var httpCode = response.getResponseCode();
    var body = response.getContentText().trim();

    Logger.log('Spoo.me | HTTP ' + httpCode + ' | ' + body);

    if (httpCode === 429) {
      throw new Error('Spoo.me đang giới hạn số lượng request.');
    }
    if (httpCode < 200 || httpCode >= 300) {
      throw new Error('HTTP ' + httpCode + ': ' + body);
    }

    var data;
    try {
      data = JSON.parse(body);
    } catch (jsonError) {
      throw new Error('Spoo.me trả về dữ liệu không phải JSON: ' + body);
    }

    if (data.short_url && /^https?:\/\/.+/i.test(data.short_url)) {
      Logger.log('Spoo.me SUCCESS | ' + longUrl + ' -> ' + data.short_url);
      return data.short_url;
    }

    throw new Error('Spoo.me API: ' + (data.message || data.error || body));
  } catch (e) {
    Logger.log('Spoo.me FAILED | ' + safeStringV464_(longUrl) + ' | ' + safeStringV464_(e && e.message || e));
    return 'Error: ' + safeStringV464_(e && e.message || e);
  }
}

/** Normalize user/provider input without changing a valid http(s) URL. */
function normalizeShortenerInputV464_(longUrl) {
  if (longUrl === undefined || longUrl === null) return '';
  var s = String(longUrl).trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  return s;
}

function safeStringV464_(value) {
  return value === undefined || value === null ? '' : String(value);
}

/**
 * V4.6.4.1 provider eligibility policy.
 * CleanURI has been observed rejecting Google Calendar event URLs with HTTP 400.
 * Skip only Calendar URLs; do not broadly block google.com/docs/drive/maps/sites.
 */
function parseShortenerUrlV4641_(url) {
  var normalized = normalizeShortenerInputV464_(url);
  if (!normalized) return { url: '', host: '', path: '' };

  var match = normalized.match(/^https?:\/\/([^\/?#]+)([^?#]*)/i);
  if (!match) return { url: normalized, host: '', path: '' };

  return {
    url: normalized,
    host: safeStringV464_(match[1]).toLowerCase().replace(/\.$/, ''),
    path: safeStringV464_(match[2] || '/').toLowerCase()
  };
}

function isGoogleCalendarUrlV4641_(url) {
  var parsed = parseShortenerUrlV4641_(url);
  if (!parsed.host) return false;

  if (parsed.host === 'calendar.google.com') return true;

  if ((parsed.host === 'google.com' || parsed.host === 'www.google.com') &&
      parsed.path.indexOf('/calendar/') === 0) {
    return true;
  }

  return false;
}

function getShortenerProviderEligibilityV4641_(provider, longUrl) {
  var normalized = normalizeShortenerInputV464_(longUrl);
  if (!normalized) {
    return { eligible: false, provider: safeStringV464_(provider).toUpperCase(), reason: 'EMPTY_URL' };
  }

  var name = safeStringV464_(provider).trim().toUpperCase();
  var cfg = (typeof GES_CONFIG !== 'undefined' && GES_CONFIG.PUBLIC_URL_ENRICHMENT_V464) || {};

  if (name === 'CLEANURI' &&
      cfg.CLEANURI_SKIP_GOOGLE_CALENDAR !== false &&
      isGoogleCalendarUrlV4641_(normalized)) {
    return {
      eligible: false,
      provider: name,
      reason: 'GOOGLE_CALENDAR_PROVIDER_POLICY',
      url: normalized
    };
  }

  return { eligible: true, provider: name, reason: 'ELIGIBLE', url: normalized };
}

function shouldSkipCleanUriV4641_(longUrl) {
  return !getShortenerProviderEligibilityV4641_('CLEANURI', longUrl).eligible;
}

function isValidShortUrlV464_(value) {
  return /^https?:\/\/.+/i.test(safeStringV464_(value).trim()) &&
    safeStringV464_(value).indexOf('Error:') !== 0;
}

function publicAssetUrlKeyV464_(url) {
  return normalizeShortenerInputV464_(url);
}

/**
 * Capture TinyURL/CleanURI from the existing PUBLIC Assets tab before the
 * renderer clears it. This keeps structural rows cached even though they do not
 * have a corresponding URL Variants row in the Private Registry.
 */
function capturePublicAssetShortUrlCacheV464_(sheet) {
  var out = {};
  if (!sheet || sheet.getLastRow() < 2) return out;

  var values = sheet.getDataRange().getDisplayValues();
  var headers = values[0] || [];
  var urlIndex = headers.indexOf('URL');
  var tinyIndex = headers.indexOf('TinyURL');
  var cleanIndex = headers.indexOf('CleanURI');
  if (urlIndex === -1) return out;

  for (var r = 1; r < values.length; r++) {
    var key = publicAssetUrlKeyV464_(values[r][urlIndex]);
    if (!key) continue;
    var tiny = tinyIndex === -1 ? '' : safeStringV464_(values[r][tinyIndex]).trim();
    var clean = cleanIndex === -1 ? '' : safeStringV464_(values[r][cleanIndex]).trim();
    out[key] = {
      tinyUrl: isValidShortUrlV464_(tiny) ? tiny : '',
      cleanUri: isValidShortUrlV464_(clean) ? clean : ''
    };
  }
  return out;
}

/**
 * Fill TinyURL/CleanURI in the in-memory Public Assets rows.
 * Existing Registry values win, then previous Public Sheet cache, then provider.
 */
function enrichPublicAssetRowsV464_(project, rows, existingCache) {
  rows = rows || [];
  existingCache = existingCache || {};

  var cfg = (typeof GES_CONFIG !== 'undefined' && GES_CONFIG.PUBLIC_URL_ENRICHMENT_V464) || {};
  var enableTiny = cfg.ENABLE_TINYURL !== false;
  var enableClean = cfg.ENABLE_CLEANURI !== false;
  var maxRequests = Number(cfg.MAX_NEW_REQUESTS_PER_RENDER || 120);
  var requestCount = 0;
  var persistence = {};
  var localCache = {};
  var stats = {
    version: GES_PUBLIC_URL_ENRICHMENT_V464.VERSION,
    rows: rows.length,
    tinyReused: 0,
    tinyGenerated: 0,
    tinyFailed: 0,
    cleanReused: 0,
    cleanGenerated: 0,
    cleanFailed: 0,
    cleanSkipped: 0,
    cleanSkipReasons: {},
    externalRequests: 0,
    requestLimitReached: false,
    registryRowsUpdated: 0,
    warnings: []
  };

  rows.forEach(function(row) {
    var longUrl = normalizeShortenerInputV464_(row && row[3]);
    if (!longUrl) return;
    var key = publicAssetUrlKeyV464_(longUrl);
    var previous = existingCache[key] || {};
    var cached = localCache[key] || {};

    var tiny = safeStringV464_(row[6]).trim();
    var clean = safeStringV464_(row[7]).trim();

    if (!isValidShortUrlV464_(tiny)) tiny = '';
    if (!isValidShortUrlV464_(clean)) clean = '';

    if (!tiny && isValidShortUrlV464_(cached.tinyUrl)) tiny = cached.tinyUrl;
    if (!clean && isValidShortUrlV464_(cached.cleanUri)) clean = cached.cleanUri;

    if (!tiny && isValidShortUrlV464_(previous.tinyUrl)) {
      tiny = previous.tinyUrl;
      stats.tinyReused++;
    } else if (tiny) {
      stats.tinyReused++;
    }

    if (!clean && isValidShortUrlV464_(previous.cleanUri)) {
      clean = previous.cleanUri;
      stats.cleanReused++;
    } else if (clean) {
      stats.cleanReused++;
    }

    if (!tiny && enableTiny) {
      if (requestCount >= maxRequests) {
        stats.requestLimitReached = true;
      } else {
        requestCount++;
        stats.externalRequests++;
        var tinyResult = shortenURLWithTinyURL(longUrl);
        if (isValidShortUrlV464_(tinyResult)) {
          tiny = tinyResult;
          stats.tinyGenerated++;
        } else {
          stats.tinyFailed++;
          stats.warnings.push('TINYURL_FAILED|' + longUrl + '|' + safeStringV464_(tinyResult));
        }
      }
    }

    if (!clean && enableClean) {
      var cleanEligibility = getShortenerProviderEligibilityV4641_('CLEANURI', longUrl);
      if (!cleanEligibility.eligible) {
        stats.cleanSkipped++;
        var skipReason = cleanEligibility.reason || 'PROVIDER_POLICY';
        stats.cleanSkipReasons[skipReason] = (stats.cleanSkipReasons[skipReason] || 0) + 1;
      } else if (requestCount >= maxRequests) {
        stats.requestLimitReached = true;
      } else {
        requestCount++;
        stats.externalRequests++;
        var cleanResult = shortenURLWithCleanURI(longUrl);
        if (isValidShortUrlV464_(cleanResult)) {
          clean = cleanResult;
          stats.cleanGenerated++;
        } else {
          stats.cleanFailed++;
          stats.warnings.push('CLEANURI_FAILED|' + longUrl + '|' + safeStringV464_(cleanResult));
        }
      }
    }

    row[6] = tiny || '';
    row[7] = clean || '';
    localCache[key] = { tinyUrl: tiny || '', cleanUri: clean || '' };
    persistence[key] = { tinyUrl: tiny || '', cleanUri: clean || '' };
  });

  if (stats.requestLimitReached) {
    stats.warnings.push('SHORTENER_REQUEST_LIMIT_REACHED|' + maxRequests);
  }

  try {
    if (cfg.PERSIST_TO_PRIVATE_REGISTRY !== false) {
      var persisted = persistUrlVariantEnrichmentV464_(project, persistence);
      stats.registryRowsUpdated = persisted.rowsUpdated || 0;
    }
  } catch (e) {
    stats.warnings.push('REGISTRY_SHORT_URL_PERSIST_FAILED|' + safeStringV464_(e && e.message || e));
  }

  return stats;
}

/**
 * Persist generated short URLs only into existing Private Registry URL Variant
 * rows whose long URL exactly matches. Structural Public Sheet rows are cached
 * by reading the previous Public Assets sheet on the next render.
 */
function persistUrlVariantEnrichmentV464_(project, enrichmentByUrl) {
  var out = { success: true, rowsUpdated: 0, matchedRows: 0 };
  if (!project || !project.registrySheetId || !enrichmentByUrl) return out;

  var ss = SpreadsheetApp.openById(project.registrySheetId);
  var tabName = V3_CONFIG.REGISTRY_TABS.URLS;
  var sh = ss.getSheetByName(tabName);
  if (!sh || sh.getLastRow() < 2) return out;

  var display = sh.getDataRange().getDisplayValues();
  var headers = display[0] || [];
  var projectCol = headers.indexOf('Project ID');
  var urlCol = headers.indexOf('URL');
  var tinyCol = headers.indexOf('TinyURL');
  var cleanCol = headers.indexOf('CleanURI');
  if (projectCol === -1 || urlCol === -1 || tinyCol === -1 || cleanCol === -1) {
    return { success: false, rowsUpdated: 0, matchedRows: 0, code: 'URL_VARIANTS_ENRICHMENT_COLUMNS_MISSING' };
  }

  var rowCount = display.length - 1;
  var tinyValues = sh.getRange(2, tinyCol + 1, rowCount, 1).getValues();
  var cleanValues = sh.getRange(2, cleanCol + 1, rowCount, 1).getValues();
  var changedTiny = false;
  var changedClean = false;

  for (var r = 1; r < display.length; r++) {
    if (safeStringV464_(display[r][projectCol]) !== safeStringV464_(project.projectId)) continue;
    var key = publicAssetUrlKeyV464_(display[r][urlCol]);
    var entry = enrichmentByUrl[key];
    if (!key || !entry) continue;
    out.matchedRows++;

    var tiny = isValidShortUrlV464_(entry.tinyUrl) ? entry.tinyUrl : '';
    var clean = isValidShortUrlV464_(entry.cleanUri) ? entry.cleanUri : '';
    var rowChanged = false;

    if (tiny && safeStringV464_(tinyValues[r - 1][0]) !== tiny) {
      tinyValues[r - 1][0] = tiny;
      changedTiny = true;
      rowChanged = true;
    }
    if (clean && safeStringV464_(cleanValues[r - 1][0]) !== clean) {
      cleanValues[r - 1][0] = clean;
      changedClean = true;
      rowChanged = true;
    }
    if (rowChanged) out.rowsUpdated++;
  }

  if (changedTiny) sh.getRange(2, tinyCol + 1, rowCount, 1).setValues(tinyValues);
  if (changedClean) sh.getRange(2, cleanCol + 1, rowCount, 1).setValues(cleanValues);

  // V4.6.5: Extended Google Assets live in their own PRIVATE Registry tab.
  // Persist the same enrichment map there so manual URLs also have durable cache.
  if (typeof persistExtendedGoogleAssetEnrichmentV465_ === 'function') {
    try {
      var ext = persistExtendedGoogleAssetEnrichmentV465_(project, enrichmentByUrl);
      out.extendedRowsUpdated = ext && ext.rowsUpdated || 0;
      out.extendedMatchedRows = ext && ext.matchedRows || 0;
    } catch (e) {
      out.extendedError = safeStringV464_(e && e.message || e);
    }
  }
  return out;
}

/** Build the QR formula for one Assets row using the configured pixel size. */
function buildPublicAssetQrFormulaV464_(rowNumber, separator) {
  var cfg = (typeof GES_CONFIG !== 'undefined' && GES_CONFIG.PUBLIC_URL_ENRICHMENT_V464) || {};
  var size = Math.max(50, Number(cfg.QR_SIZE_PX || 150));
  var sep = separator || ';';
  return '=IF(D' + rowNumber + '=""' + sep + '""' + sep +
    'HYPERLINK(D' + rowNumber + sep +
    'IMAGE("' + GES_PUBLIC_URL_ENRICHMENT_V464.QR_BASE_URL + '?chs=' + size + 'x' + size + '&cht=qr&chl="&ENCODEURL(D' + rowNumber + '))))';
}

/** Apply clickable QR images to column C of the PUBLIC Assets tab. */
function applyPublicAssetsQrFormulasV464_(sheet, dataRowCount) {
  if (!sheet || dataRowCount <= 0) return;
  var cfg = (typeof GES_CONFIG !== 'undefined' && GES_CONFIG.PUBLIC_URL_ENRICHMENT_V464) || {};
  if (cfg.ENABLE_QR === false) return;

  var formulasSemi = [];
  var formulasComma = [];
  for (var i = 0; i < dataRowCount; i++) {
    var row = i + 2;
    formulasSemi.push([buildPublicAssetQrFormulaV464_(row, ';')]);
    formulasComma.push([buildPublicAssetQrFormulaV464_(row, ',')]);
  }

  var range = sheet.getRange(2, 3, dataRowCount, 1);
  try {
    range.setFormulas(formulasSemi);
  } catch (e) {
    range.setFormulas(formulasComma);
  }
  try { range.setHorizontalAlignment('center').setVerticalAlignment('middle'); } catch (ignore) {}
}
