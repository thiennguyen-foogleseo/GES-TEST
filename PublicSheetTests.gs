/** Non-destructive smoke tests for GES V4.6.5 Unified Public Project Sheet with Extended Google Assets. */

function runPublicSheetV43SmokeTests() {
  var project = getActiveProject_();
  if (!project) throw new Error('NO_ACTIVE_PROJECT');
  var results = [];

  function check(name, fn) {
    try {
      results.push({ name: name, success: true, detail: fn() });
    } catch (e) {
      results.push({ name: name, success: false, detail: safeString_(e && e.message || e) });
    }
  }

  check('Unified Public Sheet schema', function() {
    var s = getPublicProjectSheetSchemaV43();
    var expectedTabs = ['Assets','Content'];
    var expectedHeaders = [
      'Asset Type/ Variant Type','Name','QR','URL','Display Name',
      'Date','TinyURL','CleanURI','Last Updated'
    ];
    if (JSON.stringify(s.tabs) !== JSON.stringify(expectedTabs)) throw new Error('PUBLIC_SHEET_TAB_SCHEMA_MISMATCH');
    if (JSON.stringify(s.headers.assets) !== JSON.stringify(expectedHeaders)) throw new Error('PUBLIC_ASSETS_HEADER_SCHEMA_MISMATCH');
    if (s.retiredPublicTabs.indexOf('URL Variants') === -1) throw new Error('URL_VARIANTS_TAB_NOT_RETIRED');
    return s;
  });

  check('Private Registry source of truth', function() {
    if (!project.registrySheetId) throw new Error('REGISTRY_SHEET_MISSING');
    var ss = SpreadsheetApp.openById(project.registrySheetId);
    ['Assets','URL Variants','Project Config','Sync Log'].forEach(function(name) {
      if (!ss.getSheetByName(name)) throw new Error('PRIVATE_REGISTRY_TAB_MISSING_' + name.replace(/\s+/g,'_').toUpperCase());
    });
    if (typeof getCalendarRegistryRowsV4 === 'function' && !ss.getSheetByName('Calendar Events')) {
      throw new Error('PRIVATE_REGISTRY_TAB_MISSING_CALENDAR_EVENTS');
    }
    return { registrySheetId: project.registrySheetId, private: true };
  });

  check('Content Option B covers all direct Articles Docs', function() {
    var docs = getSourceDocs_(project);
    var p = previewProjectContentProjectionV43(project.projectId);
    if (p.sourceDocCount !== docs.length) throw new Error('CONTENT_SOURCE_DOC_COUNT_MISMATCH');
    return { sourceDocs: docs.length, projectionDocs: p.sourceDocCount, rows: p.rowCount };
  });

  check('Unified projection includes every generated core URL', function() {
    var registry = readPrivateRegistryProjectionV43_(project);
    var coreTypes = { DOC:true, SLIDES:true, PDF:true, DOCX:true, HTML:true };
    var expected = registry.urls.filter(function(v) {
      return coreTypes[safeString_(v.assetType).toUpperCase()] &&
        safeString_(v.urlStatus).toUpperCase() === 'AVAILABLE' && !!v.url;
    });
    var projection = buildUnifiedPublicAssetsProjectionV44_(project);
    var urls = {};
    projection.forEach(function(row) { if (row[3]) urls[safeString_(row[3])] = true; });
    var missing = expected.filter(function(v) { return !urls[safeString_(v.url)]; });
    if (missing.length) {
      throw new Error('PUBLIC_CORE_URLS_MISSING: ' + missing.map(function(v) {
        return safeString_(v.variantType) + '|' + safeString_(v.url);
      }).join(', '));
    }
    return { expectedCoreUrls: expected.length, projectedRows: projection.length, missing: 0 };
  });

  check('Private Asset Registry is not projected publicly', function() {
    var projection = buildUnifiedPublicAssetsProjectionV44_(project);
    var registryId = safeString_(project.registrySheetId);
    var leaked = projection.filter(function(row) {
      return registryId && safeString_(row[3]).indexOf(registryId) !== -1;
    });
    if (leaked.length) throw new Error('PRIVATE_REGISTRY_URL_LEAKED_TO_PUBLIC_SHEET');
    return { leaked: 0 };
  });

  check('Public Sheet preview', function() {
    var p = previewProjectSheetV4(project.projectId);
    if (p.generatedTabs.join('|') !== 'Assets|Content') throw new Error('PUBLIC_SHEET_PREVIEW_TABS_MISMATCH');
    return {
      status: p.status,
      sheetId: p.sheetId,
      sourceDocCount: p.sourceDocCount,
      contentRowCount: p.contentRowCount,
      anyoneWithLink: p.anyoneWithLink,
      publishedToWeb: p.publishedToWeb
    };
  });

  check('Display Name hyperlink writer installed', function() {
    if (typeof applyPublicAssetsHyperlinkFormulasV44_ !== 'function') throw new Error('PUBLIC_HYPERLINK_WRITER_MISSING');
    return { formula: '=HYPERLINK(URL; Name)' };
  });

  check('Public Sheet fingerprint deterministic', function() {
    var a = getProjectManagedAssetFingerprintV41_(project, 'PROJECT_URL_SHEET');
    var b = getProjectManagedAssetFingerprintV41_(project, 'PROJECT_URL_SHEET');
    if (!a || a !== b) throw new Error('PUBLIC_SHEET_FINGERPRINT_NOT_DETERMINISTIC');
    return a;
  });

  check('Published URL auto-refresh policy V4.6.2', function() {
    if (typeof shouldAutoRefreshPublishedUrlProjectionV462_ !== 'function') {
      throw new Error('PUBLISHED_URL_AUTO_REFRESH_POLICY_MISSING');
    }
    if (!shouldAutoRefreshPublishedUrlProjectionV462_('DOC')) {
      throw new Error('DOC_PUBLISHED_URL_MUST_AUTO_REFRESH_PUBLIC_ASSETS');
    }
    if (!shouldAutoRefreshPublishedUrlProjectionV462_('SLIDES')) {
      throw new Error('SLIDES_PUBLISHED_URL_MUST_AUTO_REFRESH_PUBLIC_ASSETS');
    }
    if (shouldAutoRefreshPublishedUrlProjectionV462_('SHEET')) {
      throw new Error('PROJECT_SHEET_MUST_KEEP_DEDICATED_REFRESH_FLOW');
    }
    if (shouldAutoRefreshPublishedUrlProjectionV462_('FORM')) {
      throw new Error('FORM_MUST_NOT_USE_MANUAL_PUBLISHED_URL_AUTO_REFRESH');
    }
    return {
      version: GES_PUBLISHED_URL_PROJECTION_V462.VERSION,
      autoRefreshTypes: GES_PUBLISHED_URL_PROJECTION_V462.AUTO_REFRESH_TYPES.slice()
    };
  });

  check('Published URL Public Assets verifier installed', function() {
    if (typeof verifyPublishedUrlInPublicAssetsV462_ !== 'function') {
      throw new Error('PUBLISHED_URL_PUBLIC_ASSETS_VERIFIER_MISSING');
    }
    return { installed: true };
  });

  check('Public Assets QR writer V4.6.4.1', function() {
    if (typeof applyPublicAssetsQrFormulasV464_ !== 'function') {
      throw new Error('PUBLIC_ASSETS_QR_WRITER_MISSING');
    }
    var formula = buildPublicAssetQrFormulaV464_(2, ';');
    if (formula.indexOf('HYPERLINK(D2;') === -1) throw new Error('PUBLIC_QR_HYPERLINK_MISSING');
    if (formula.indexOf('ENCODEURL(D2)') === -1) throw new Error('PUBLIC_QR_ENCODEURL_MISSING');
    return { version: '4.6.4.1', formula: formula };
  });

  check('Public URL shortener enrichment V4.6.4.1', function() {
    if (typeof enrichPublicAssetRowsV464_ !== 'function') throw new Error('PUBLIC_URL_ENRICHMENT_MISSING');
    if (typeof shortenURLWithTinyURL !== 'function') throw new Error('TINYURL_SHORTENER_MISSING');
    if (typeof shortenURLWithCleanURI !== 'function') throw new Error('CLEANURI_SHORTENER_MISSING');
    var c = GES_CONFIG.PUBLIC_URL_ENRICHMENT_V464 || {};
    if (c.ENABLE_TINYURL !== true || c.ENABLE_CLEANURI !== true) throw new Error('PUBLIC_SHORTENER_PROVIDER_DISABLED');
    return {
      version: c.VERSION || '',
      tinyUrl: c.ENABLE_TINYURL === true,
      cleanUri: c.ENABLE_CLEANURI === true,
      qrSizePx: c.QR_SIZE_PX || 0,
      cleanUriCalendarSkip: c.CLEANURI_SKIP_GOOGLE_CALENDAR === true
    };
  });


  check('CleanURI Calendar provider policy V4.6.4.1', function() {
    if (typeof getShortenerProviderEligibilityV4641_ !== 'function') {
      throw new Error('SHORTENER_PROVIDER_ELIGIBILITY_MISSING');
    }
    var blocked = getShortenerProviderEligibilityV4641_('CLEANURI', 'https://www.google.com/calendar/event?eid=test');
    var docs = getShortenerProviderEligibilityV4641_('CLEANURI', 'https://docs.google.com/document/d/test/edit');
    if (blocked.eligible) throw new Error('CLEANURI_CALENDAR_URL_NOT_SKIPPED');
    if (!docs.eligible) throw new Error('CLEANURI_DOCS_URL_WRONGLY_SKIPPED');
    return { blockedReason: blocked.reason, docsEligible: docs.eligible };
  });

  check('Extended Google Assets projection V4.6.5', function() {
    if (typeof getExtendedGoogleAssetDescriptorsV465_ !== 'function') throw new Error('EXTENDED_GOOGLE_ASSETS_MODULE_MISSING');
    var expected = getExtendedGoogleAssetDescriptorsV465_(project);
    var projection = buildUnifiedPublicAssetsProjectionV44_(project);
    var urls = {};
    projection.forEach(function(row){ if (row[3]) urls[normalizeUrl_(row[3])] = true; });
    var missing = expected.filter(function(x){ return !urls[normalizeUrl_(x.url)]; });
    if (missing.length) throw new Error('EXTENDED_GOOGLE_ASSET_URLS_MISSING: '+missing.map(function(x){return x.assetType;}).join(','));
    return { configured: expected.length, projected: expected.length - missing.length, registryTab: (V3_CONFIG.REGISTRY_TABS && V3_CONFIG.REGISTRY_TABS.EXTENDED_ASSETS) || '' };
  });

  check('Calendar public projection module', function() {
    if (typeof syncCalendarEventUrlVariantsToRegistryV43_ !== 'function') throw new Error('CALENDAR_URL_VARIANT_PROJECTOR_MISSING');
    return { installed: true, version: GES_CALENDAR_URL_VARIANTS_V43.VERSION };
  });

  check('Retired public tabs are not generated', function() {
    if (GES_PUBLIC_SHEET_V43.GENERATED_TABS.indexOf('URL Variants') !== -1) throw new Error('URL_VARIANTS_STILL_PUBLIC');
    if (GES_PUBLIC_SHEET_V43.GENERATED_TABS.indexOf('Calendar Events') !== -1) throw new Error('CALENDAR_EVENTS_STILL_PUBLIC');
    return { publicTabs: GES_PUBLIC_SHEET_V43.GENERATED_TABS.slice() };
  });

  check('Private Registry privacy diagnostic', function() {
    var r = validateAssetRegistryPrivacyV43(project.projectId);
    return { valid: r.valid, warnings: r.warnings, parentPublic: r.parentPublic };
  });

  var success = results.every(function(r) { return r.success; });
  var report = {
    success: success,
    version: '4.6.5-extended-google-assets',
    projectId: project.projectId,
    projectName: project.projectName,
    results: results
  };
  console.log(JSON.stringify(report, null, 2));
  return report;
}
