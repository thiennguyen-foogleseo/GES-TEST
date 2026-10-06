/** Non-destructive smoke tests for GES V4.6.4.1 shortener provider eligibility. */
function runUrlShortenerV464SmokeTests() {
  var results = [];

  function check(name, fn) {
    try {
      results.push({ name: name, success: true, detail: fn() });
    } catch (e) {
      results.push({ name: name, success: false, detail: safeStringV464_(e && e.message || e) });
    }
  }

  check('V4.6.4.1 enrichment config', function() {
    var c = GES_CONFIG.PUBLIC_URL_ENRICHMENT_V464;
    if (!c) throw new Error('PUBLIC_URL_ENRICHMENT_CONFIG_MISSING');
    if (safeStringV464_(c.VERSION) !== '4.6.4.1') throw new Error('PUBLIC_URL_ENRICHMENT_VERSION_MISMATCH');
    if (c.ENABLE_QR !== true) throw new Error('QR_MUST_BE_ENABLED');
    if (c.ENABLE_TINYURL !== true) throw new Error('TINYURL_MUST_BE_ENABLED');
    if (c.ENABLE_CLEANURI !== true) throw new Error('CLEANURI_MUST_BE_ENABLED');
    if (c.CLEANURI_SKIP_GOOGLE_CALENDAR !== true) throw new Error('CLEANURI_CALENDAR_SKIP_MUST_BE_ENABLED');
    return c;
  });

  check('Shortener input normalization', function() {
    if (normalizeShortenerInputV464_('') !== '') throw new Error('EMPTY_URL_MUST_STAY_EMPTY');
    if (normalizeShortenerInputV464_('example.com/a') !== 'https://example.com/a') throw new Error('HTTPS_PREFIX_NOT_ADDED');
    if (normalizeShortenerInputV464_('https://example.com/a?x=1&y=2') !== 'https://example.com/a?x=1&y=2') {
      throw new Error('VALID_URL_CHANGED');
    }
    return { valid: true };
  });

  check('QR formula generator', function() {
    var f = buildPublicAssetQrFormulaV464_(2, ';');
    if (f.indexOf('HYPERLINK(D2;') === -1) throw new Error('QR_HYPERLINK_MISSING');
    if (f.indexOf('ENCODEURL(D2)') === -1) throw new Error('QR_ENCODEURL_MISSING');
    if (f.indexOf('chs=150x150') === -1) throw new Error('QR_SIZE_MISMATCH');
    return f;
  });

  check('Provider result validator', function() {
    if (!isValidShortUrlV464_('https://tinyurl.com/test')) throw new Error('VALID_SHORT_URL_REJECTED');
    if (isValidShortUrlV464_('Error: failed')) throw new Error('ERROR_STRING_ACCEPTED');
    if (isValidShortUrlV464_('')) throw new Error('EMPTY_SHORT_URL_ACCEPTED');
    return { valid: true };
  });

  check('CleanURI Google Calendar eligibility policy', function() {
    var blocked = [
      'https://www.google.com/calendar/event?eid=abc',
      'https://google.com/calendar/event?eid=abc',
      'https://calendar.google.com/calendar/event?eid=abc',
      'https://calendar.google.com/calendar/u/0/r/eventedit/abc'
    ];
    blocked.forEach(function(url) {
      var result = getShortenerProviderEligibilityV4641_('CLEANURI', url);
      if (result.eligible) throw new Error('CALENDAR_URL_NOT_SKIPPED|' + url);
      if (result.reason !== 'GOOGLE_CALENDAR_PROVIDER_POLICY') throw new Error('CALENDAR_SKIP_REASON_MISMATCH|' + url);
    });

    var allowed = [
      'https://docs.google.com/document/d/test/edit',
      'https://drive.google.com/file/d/test/view',
      'https://sites.google.com/view/example',
      'https://www.google.com/maps?cid=123',
      'https://example.com/calendar/event'
    ];
    allowed.forEach(function(url) {
      if (!getShortenerProviderEligibilityV4641_('CLEANURI', url).eligible) {
        throw new Error('NON_CALENDAR_URL_WRONGLY_SKIPPED|' + url);
      }
    });

    if (!getShortenerProviderEligibilityV4641_('TINYURL', blocked[0]).eligible) {
      throw new Error('TINYURL_CALENDAR_MUST_REMAIN_ELIGIBLE');
    }

    return { blocked: blocked.length, allowed: allowed.length, tinyUrlCalendarEligible: true };
  });

  check('Public Assets enrichment functions installed', function() {
    if (typeof capturePublicAssetShortUrlCacheV464_ !== 'function') throw new Error('FUNCTION_MISSING_capturePublicAssetShortUrlCacheV464_');
    if (typeof enrichPublicAssetRowsV464_ !== 'function') throw new Error('FUNCTION_MISSING_enrichPublicAssetRowsV464_');
    if (typeof persistUrlVariantEnrichmentV464_ !== 'function') throw new Error('FUNCTION_MISSING_persistUrlVariantEnrichmentV464_');
    if (typeof applyPublicAssetsQrFormulasV464_ !== 'function') throw new Error('FUNCTION_MISSING_applyPublicAssetsQrFormulasV464_');
    return { installed: true };
  });

  var success = results.every(function(r) { return r.success; });
  var report = {
    success: success,
    version: '4.6.4.1',
    liveProviderCallsExecuted: false,
    results: results
  };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

function runUrlShortenerV4641SmokeTests() {
  return runUrlShortenerV464SmokeTests();
}

/** Optional live test. This WILL call third-party shortener APIs. */
function runUrlShortenerV464LiveTest() {
  var testUrl = 'https://example.com/';
  var tiny = shortenURLWithTinyURL(testUrl);
  var clean = shortenURLWithCleanURI(testUrl);
  var report = {
    success: isValidShortUrlV464_(tiny) && isValidShortUrlV464_(clean),
    version: '4.6.4.1',
    sourceUrl: testUrl,
    tinyUrl: tiny,
    cleanUri: clean
  };
  console.log(JSON.stringify(report, null, 2));
  return report;
}
