/**
 * GES V4.6.5 - Project Settings Persistence + Extended Google Assets tests.
 *
 * Pure smoke tests do not mutate the active Project. The explicit verifier
 * reads the active Project Config only when the operator calls it.
 */

function runProjectSettingsPersistenceV465SmokeTests() {
  const results = [];
  function test(name, fn) {
    try {
      const detail = fn();
      results.push({ name: name, success: true, detail: detail });
    } catch (e) {
      results.push({ name: name, success: false, detail: e && e.message ? e.message : String(e) });
    }
  }

  test('GES version is V4.6.5', function() {
    if (safeString_(GES_CONFIG.APP_VERSION).indexOf('4.6.5-') !== 0) {
      throw new Error('APP_VERSION_NOT_V465: ' + GES_CONFIG.APP_VERSION);
    }
    return GES_CONFIG.APP_VERSION;
  });

  test('CTA Footer image is optional', function() {
    const validation = validateProjectBranding_({
      projectName: 'Example Project',
      brandName: 'Example Brand',
      websiteUrl: 'https://example.com/',
      branding: {
        enabled: true,
        brandName: 'Example Brand',
        websiteUrl: 'https://example.com/',
        phones: ['0900000000'],
        logo: { enabled: true, driveFileId: '', publicUrl: 'https://example.com/logo.png' },
        cta: { enabled: true, driveFileId: '', publicUrl: '', label: 'TƯ VẤN NGAY' },
        targets: { slides: true, docs: true, pdf: true, docx: true, html: true }
      }
    });
    if (!validation.valid) throw new Error('CTA_EMPTY_MUST_NOT_INVALIDATE_BRANDING');
    if ((validation.warnings || []).indexOf('CTA_NOT_CONFIGURED') === -1) {
      throw new Error('CTA_EMPTY_SHOULD_BE_WARNING');
    }
    return { valid: validation.valid, warnings: validation.warnings };
  });

  test('Project Config includes all Project Settings fields', function() {
    const p = normalizeProjectProfileV31_({
      projectId: 'test_v463',
      projectName: 'Example Project',
      projectKeyword: 'Example Keyword',
      projectType: 'SERVICE_PAGE',
      provisioningMode: 'NEW_STACK',
      targetPageUrl: 'https://example.com/service',
      rootFolderId: 'root_test',
      rootFolderName: 'Example Root',
      brandName: 'Example Brand',
      websiteUrl: 'https://example.com/',
      googleMapsUrl: 'https://www.google.com/maps?cid=123',
      googleSitesUrl: 'https://sites.google.com/view/example',
      extendedGoogleAssets: { notebookLmPublicUrl:'https://notebooklm.google.com/notebook/test', googleSitesUrl:'https://sites.google.com/view/example', googleMyMapsUrl:'https://www.google.com/maps/d/viewer?mid=test' },
      phone: '0900000001',
      phone2: '0900000002',
      email: 'info@example.com',
      address: 'Example Address',
      folders: {},
      branding: {
        enabled: true,
        brandName: 'Example Brand',
        websiteUrl: 'https://example.com/',
        phones: ['0900000001', '0900000002'],
        email: 'info@example.com',
        address: 'Example Address',
        logo: { enabled: true, driveFileId: 'logo_file_id', publicUrl: 'https://example.com/logo.png' },
        cta: { enabled: true, driveFileId: '', publicUrl: '', label: 'TƯ VẤN NGAY' },
        targets: { slides: true, docs: false, pdf: true, docx: false, html: true }
      },
      scheduledRegistrySync: { enabled: true, quickScanIntervalMinutes: 30, fullReconcileIntervalHours: 24 }
    });
    const map = projectConfigRowsToMapV463_(buildProjectConfigRowsV463_(p, 'TEST'));
    const required = [
      'Project Name', 'Project Keyword', 'Project Type', 'Target Page URL',
      'Brand Name', 'Website URL', 'Branding Enabled',
      'Hotline 1', 'Hotline 2', 'Branding Email', 'Branding Address',
      'Logo Drive File ID', 'Logo Public URL',
      'CTA Drive File ID', 'CTA Public URL', 'CTA Label',
      'Google Maps URL', 'Google Sites URL', 'NotebookLM Public URL', 'Google My Maps URL', 'Extended Assets Configured Count',
      'Branding Target Slides', 'Branding Target Docs', 'Branding Target PDF',
      'Branding Target DOCX', 'Branding Target HTML',
      'Scheduled Registry Sync'
    ];
    const missing = required.filter(function(k) { return !Object.prototype.hasOwnProperty.call(map, k); });
    if (missing.length) throw new Error('PROJECT_CONFIG_KEYS_MISSING: ' + missing.join(', '));
    return { requiredKeys: required.length, missing: missing.length };
  });

  test('Blank CTA persists without synthetic File ID', function() {
    const p = normalizeProjectProfileV31_({
      projectId: 'test_v463_cta', projectName: 'CTA Optional', projectKeyword: 'CTA Optional',
      projectType: 'PAGE_TARGET', provisioningMode: 'NEW_STACK', rootFolderId: 'root_cta', rootFolderName: 'CTA Root',
      brandName: 'Brand', websiteUrl: 'https://example.com/', folders: {},
      branding: {
        enabled: true,
        brandName: 'Brand', websiteUrl: 'https://example.com/',
        logo: { enabled: true, publicUrl: 'https://example.com/logo.png' },
        cta: { enabled: true, driveFileId: '', publicUrl: '', label: 'TƯ VẤN NGAY' }
      }
    });
    const map = projectConfigRowsToMapV463_(buildProjectConfigRowsV463_(p, 'TEST'));
    if (map['CTA Drive File ID'] !== '') throw new Error('CTA_DRIVE_SHOULD_STAY_EMPTY');
    if (map['CTA Public URL'] !== '') throw new Error('CTA_PUBLIC_SHOULD_STAY_EMPTY');
    if (map['CTA Label'] !== 'TƯ VẤN NGAY') throw new Error('CTA_LABEL_NOT_PERSISTED');
    return { ctaDrive: map['CTA Drive File ID'], ctaPublic: map['CTA Public URL'], ctaLabel: map['CTA Label'] };
  });

  test('Project Config verifier detects exact settings state', function() {
    const p = normalizeProjectProfileV31_({
      projectId: 'test_v463_verify', projectName: 'Verify Project', projectKeyword: 'Verify Keyword',
      projectType: 'ARTICLE', provisioningMode: 'NEW_STACK', rootFolderId: 'root_verify', rootFolderName: 'Verify Root',
      brandName: 'Verify Brand', websiteUrl: 'https://example.com/', folders: {},
      branding: { enabled: false, brandName: 'Verify Brand', websiteUrl: 'https://example.com/' },
      scheduledRegistrySync: { enabled: false }
    });
    const actual = projectConfigRowsToMapV463_(buildProjectConfigRowsV463_(p, 'TEST'));
    const ok = verifyProjectConfigMapV463_(p, actual);
    if (!ok.success) throw new Error('EXPECTED_VERIFIER_PASS');
    actual['Project Name'] = 'Wrong Name';
    const bad = verifyProjectConfigMapV463_(p, actual);
    if (bad.success || !bad.mismatches.length) throw new Error('EXPECTED_VERIFIER_TO_CATCH_MISMATCH');
    return { checkedKeys: ok.checkedKeys, mismatchDetected: bad.mismatches[0].key };
  });

  const success = results.every(function(r) { return r.success; });
  const out = { success: success, version: '4.6.5', results: results };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function verifyActiveProjectSettingsPersistenceV465() {
  const project = getActiveProject_();
  if (!project) throw new Error('Chưa có active project.');
  const verification = verifyProjectConfigPersistenceV463_(project);
  const out = {
    success: !!verification.success,
    version: '4.6.5',
    projectId: project.projectId,
    projectName: project.projectName,
    checkedKeys: verification.checkedKeys || 0,
    mismatches: verification.mismatches || []
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}


function runProjectSettingsPersistenceV463SmokeTests(){ return runProjectSettingsPersistenceV465SmokeTests(); }
function verifyActiveProjectSettingsPersistenceV463(){ return verifyActiveProjectSettingsPersistenceV465(); }
