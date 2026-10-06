/** Smoke tests for GES V4.5.2 Clean Installation Baseline. */

function runCleanInstallationBaselineV452SmokeTests() {
  var results = [];
  function test(name, fn) {
    try {
      var detail = fn();
      results.push({ name: name, success: true, detail: detail === undefined ? '' : detail });
    } catch (e) {
      results.push({ name: name, success: false, error: safeString_(e && e.message || e) });
    }
  }

  test('Version is V4.5.2', function() {
    if (safeString_(GES_CONFIG.CLEAN_INSTALLATION_V452 && GES_CONFIG.CLEAN_INSTALLATION_V452.VERSION) !== '4.5.2') {
      throw new Error('CLEAN_INSTALL_VERSION_MISMATCH');
    }
    return GES_CONFIG.APP_VERSION;
  });

  test('Customer bootstrap defaults are empty', function() {
    var audit = cleanInstallationConfigAuditV452_();
    if (audit.nonEmptyBootstrapKeys.length) throw new Error('NON_EMPTY_BOOTSTRAP:' + audit.nonEmptyBootstrapKeys.join(','));
    if (safeString_(GES_CONFIG.BOOTSTRAP.PROJECT_TYPE) !== 'UNSPECIFIED') throw new Error('PROJECT_TYPE_NOT_UNSPECIFIED');
    if (safeString_(GES_CONFIG.BOOTSTRAP.PROVISIONING_MODE) !== 'NEW_STACK') throw new Error('MODE_NOT_NEW_STACK');
    return audit;
  });

  test('Implicit bootstrap is disabled', function() {
    var p = GES_CONFIG.CLEAN_INSTALLATION_V452 || {};
    if (p.ALLOW_IMPLICIT_BOOTSTRAP !== false) throw new Error('IMPLICIT_BOOTSTRAP_ENABLED');
    if (p.CLEAN_MASTER_MODE !== true) throw new Error('CLEAN_MASTER_MODE_DISABLED');
    return 'PASS';
  });

  test('setupV4FirstRun does not create a project', function() {
    var before = listProjectIds_().slice();
    var activeBefore = safeString_(getScriptProps_().getProperty(GES_CONFIG.PROPERTY_KEYS.ACTIVE_PROJECT));
    var result = setupV4FirstRun();
    var after = listProjectIds_().slice();
    var activeAfter = safeString_(getScriptProps_().getProperty(GES_CONFIG.PROPERTY_KEYS.ACTIVE_PROJECT));
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('PROJECT_INDEX_MUTATED');
    if (activeBefore !== activeAfter) throw new Error('ACTIVE_PROJECT_MUTATED');
    if (!before.length && (!result || result.code !== 'EXPLICIT_PROJECT_SETUP_REQUIRED' || result.setupRequired !== true)) {
      throw new Error('FRESH_SETUP_DID_NOT_REQUIRE_EXPLICIT_PROJECT');
    }
    return { projectCount: after.length, code: result && result.code };
  });

  test('Explicit first-project validator fails closed', function() {
    var failed = false;
    try { assertExplicitFirstProjectInputV452_({}); } catch (e) { failed = true; }
    if (!failed) throw new Error('EMPTY_PROJECT_INPUT_ACCEPTED');
    var ok = assertExplicitFirstProjectInputV452_({
      rootFolderId: '12345678901234567890',
      projectName: 'Example Brand Homepage',
      projectType: 'HOMEPAGE',
      provisioningMode: 'NEW_STACK',
      brandName: 'Example Brand',
      websiteUrl: 'https://example.com/'
    });
    if (!ok.valid || ok.provisioningMode !== 'NEW_STACK') throw new Error('GENERIC_PROJECT_INPUT_REJECTED');
    return ok;
  });

  test('Calendar has no customer-specific location fallback', function() {
    var loc = resolveCalendarLocationV4_({ calendar: {}, googleMapsUrl: '', brandName: 'Example Brand', websiteUrl: 'https://example.com/' }, {});
    if (loc.latitude !== null || loc.longitude !== null || loc.locationText !== '' || loc.source !== 'UNRESOLVED') {
      throw new Error('UNRESOLVED_LOCATION_NOT_PRESERVED');
    }
    return loc;
  });

  test('Generic branding fallback is clean', function() {
    if (safeString_(GES_CONFIG.BRANDING.TEMP_DOC_PREFIX) !== '.GES_BRAND_TMP_') throw new Error('TEMP_PREFIX_NOT_GENERIC');
    if (safeString_(GES_CONFIG.SLIDES.BRAND_ACCENT).toUpperCase() !== '#1A73E8') throw new Error('GENERIC_ACCENT_MISMATCH');
    return { tempPrefix: GES_CONFIG.BRANDING.TEMP_DOC_PREFIX, accent: GES_CONFIG.SLIDES.BRAND_ACCENT };
  });

  test('Canonical folder fixture is generic', function() {
    var actual = canonicalFolderExpectedNameV451_('Example Brand', 'ARTICLES');
    if (actual !== 'Example Brand Articles') throw new Error('GENERIC_CANONICAL_FOLDER_FAILED:' + actual);
    return actual;
  });

  test('Clean baseline audit is read-only', function() {
    var props = getScriptProps_();
    var before = props.getProperties();
    var report = inspectCleanInstallationBaselineV452();
    var after = props.getProperties();
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('AUDIT_MUTATED_SCRIPT_PROPERTIES');
    if (!report.invariants || !report.invariants.readOnlyAudit || !report.invariants.noAutomaticCleanup) {
      throw new Error('READ_ONLY_INVARIANTS_MISSING');
    }
    return { status: report.status, runtimeClean: report.runtime.clean };
  });

  var failed = results.filter(function(r) { return !r.success; });
  return {
    success: failed.length === 0,
    version: GES_CLEAN_INSTALLATION_BASELINE_V452.VERSION,
    results: results
  };
}
