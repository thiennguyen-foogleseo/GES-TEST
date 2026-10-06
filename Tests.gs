/** Non-destructive smoke tests for GES V4 G1. */

function runNonDestructiveSmokeTests() {
  const results = [];

  function test(name, fn) {
    try { results.push({ name: name, success: true, detail: fn() }); }
    catch (e) { results.push({ name: name, success: false, detail: e.message }); }
  }

  test('GES V4 app config', function() {
    return GES_CONFIG.APP_VERSION + ' / profile ' + GES_CONFIG.PROFILE_SCHEMA_VERSION;
  });

  test('Project profile exists', function() {
    const p = getActiveProject_();
    if (!p) throw new Error('No active project');
    return p.projectId;
  });

  test('Lifecycle profile compatibility', function() {
    const p = getActiveProject_();
    if (String(p.schemaVersion) !== String(GES_CONFIG.PROFILE_SCHEMA_VERSION)) {
      throw new Error('Expected ' + GES_CONFIG.PROFILE_SCHEMA_VERSION + ', got ' + p.schemaVersion);
    }
    const v = validateProjectProfileV31_(p);
    if (!v.valid) throw new Error(v.errors.join(', '));
    return p.schemaVersion + ' / ' + p.projectType + ' / ' + p.provisioningMode;
  });

  test('WriteState aliases are consistent', function() {
    const p = getActiveProject_();
    if (!!p.writeEnabled !== !!p.writeState.writeEnabled) throw new Error('writeEnabled alias mismatch');
    if (!!p.shadowMode !== !!p.writeState.shadowMode) throw new Error('shadowMode alias mismatch');
    if (p.writeState.shadowMode === p.writeState.writeEnabled) throw new Error('Invalid writeState');
    return 'OK';
  });

  test('Branding config normalized', function() {
    const p = getActiveProject_();
    const b = getProjectBranding_(p);
    if (!b || !b.brandingManagerVersion) throw new Error('Branding config missing');
    if (!b.targets || b.targets.slides === undefined) throw new Error('Branding targets missing');
    if (Object.prototype.hasOwnProperty.call(b.targets, 'blogger')) throw new Error('Blogger target must not exist in GES V4');
    return b.brandingManagerVersion + ' / ' + (b.enabled ? 'ENABLED' : 'DISABLED');
  });

  test('Articles source folder exists', function() {
    const p = getActiveProject_();
    return getArticlesFolder_(p, false).getName();
  });

  test('Source Docs scan', function() {
    const p = getActiveProject_();
    return getSourceDocs_(p).length + ' Docs';
  });

  test('Registry Sheet', function() {
    const p = getActiveProject_();
    return ensureRegistrySpreadsheet_(p).getId();
  });

  test('URL rules - Docs', function() {
    const p = getActiveProject_();
    const v = generateUrlVariantsForAsset_(p, {
      assetType: 'DOC', assetId: 'TEST_DOC_ID_12345678901234567890', assetName: 'Test'
    });
    if (v.length !== 4) throw new Error('Expected 4, got ' + v.length);
    return v.map(function(x) { return x.variantType; }).join(', ');
  });

  test('URL rules - Slides', function() {
    const p = getActiveProject_();
    const v = generateUrlVariantsForAsset_(p, {
      assetType: 'SLIDES', assetId: 'TEST_SLIDES_ID_123456789012345', assetName: 'Test'
    });
    if (v.length !== 7) throw new Error('Expected 7, got ' + v.length);
    return v.map(function(x) { return x.variantType; }).join(', ');
  });

  test('Canonical Content schema', function() {
    const schema = getCanonicalContentModelSchemaV4();
    if (schema.VERSION !== GES_CONFIG.CONTENT_MODEL_SCHEMA_VERSION) throw new Error('Content schema mismatch');
    return schema.VERSION;
  });

  test('Entity Profile schema', function() {
    const schema = getEntityProfileSchemaV4();
    if (schema.VERSION !== GES_CONFIG.ENTITY_PROFILE_SCHEMA_VERSION) throw new Error('Entity schema mismatch');
    return schema.VERSION;
  });

  test('Active Entity Profile build', function() {
    const summary = getEntityProfileSummaryV4(getActiveProjectId_());
    if (!summary || !summary.fingerprint) throw new Error('Entity fingerprint missing');
    return summary.primaryEntity.type + ' / ' + summary.fingerprint.substring(0, 12);
  });

  test('Active Canonical Content build', function() {
    const p = getActiveProject_();
    const docs = getSourceDocs_(p);
    if (docs.length !== 1) return 'SKIPPED: requires exactly 1 source Doc, found ' + docs.length;
    const summary = getCanonicalContentModelSummaryV4(docs[0].getId(), p.projectId);
    if (!summary || !summary.fingerprints || !summary.fingerprints.model) throw new Error('Content fingerprint missing');
    return summary.stats.blockCount + ' blocks / ' + summary.fingerprints.model.substring(0, 12);
  });

  test('Content fingerprint deterministic', function() {
    const p = getActiveProject_();
    const docs = getSourceDocs_(p);
    if (docs.length !== 1) return 'SKIPPED: requires exactly 1 source Doc, found ' + docs.length;
    const model = buildCanonicalContentModelV4(docs[0].getId(), p.projectId);
    const result = verifyContentFingerprintDeterminismV4(model);
    if (!result.deterministic) throw new Error('Fingerprint is not deterministic');
    return 'TRUE';
  });

  test('NEW_STACK lifecycle invariant', function() {
    const p = normalizeProjectProfileV31_({
      schemaVersion: GES_CONFIG.PROFILE_SCHEMA_VERSION,
      projectId: 'test_new_stack', projectName: 'Test New Stack', projectType: 'PAGE_TARGET',
      provisioningMode: 'NEW_STACK', rootFolderId: 'dummy', rootFolderName: 'Dummy', brandName: 'Dummy',
      folders: {}, migration: createEmptyMigrationStateV31_('NEW_STACK'), writeState: createEmptyWriteStateV31_(false)
    });
    if (p.migration.required) throw new Error('NEW_STACK must not require migration');
    if (p.migration.status !== 'NOT_REQUIRED') throw new Error('Expected NOT_REQUIRED');
    return p.migration.status;
  });

  test('MIGRATE_V2 lifecycle invariant', function() {
    const p = normalizeProjectProfileV31_({
      schemaVersion: GES_CONFIG.PROFILE_SCHEMA_VERSION,
      projectId: 'test_migrate_v2', projectName: 'Test Migration', projectType: 'HOMEPAGE',
      provisioningMode: 'MIGRATE_V2', rootFolderId: 'dummy', rootFolderName: 'Dummy', brandName: 'Dummy',
      folders: {}, migration: createEmptyMigrationStateV31_('MIGRATE_V2'), writeState: createEmptyWriteStateV31_(false)
    });
    if (!p.migration.required) throw new Error('MIGRATE_V2 must require migration');
    if (p.migration.status !== 'PENDING') throw new Error('Expected PENDING');
    return p.migration.status;
  });

  const ok = results.every(function(r) { return r.success; });
  Logger.log(JSON.stringify(results, null, 2));
  return { success: ok, results: results };
}

function runV31LifecycleSmokeTests() {
  const cases = [];
  function push(name, success, detail) { cases.push({ name: name, success: success, detail: detail || '' }); }

  try {
    const newStack = normalizeProjectProfileV31_({
      projectId: 'case_new', projectName: 'Case NEW_STACK', projectType: 'PAGE_TARGET', provisioningMode: 'NEW_STACK',
      rootFolderId: 'dummy', rootFolderName: 'Dummy', brandName: 'Brand', folders: {},
      migration: createEmptyMigrationStateV31_('NEW_STACK'), writeState: createEmptyWriteStateV31_(false)
    });
    push('NEW_STACK => NOT_REQUIRED', newStack.migration.status === 'NOT_REQUIRED', newStack.migration.status);
  } catch (e) { push('NEW_STACK => NOT_REQUIRED', false, e.message); }

  try {
    const migrate = normalizeProjectProfileV31_({
      projectId: 'case_migrate', projectName: 'Case MIGRATE_V2', projectType: 'HOMEPAGE', provisioningMode: 'MIGRATE_V2',
      rootFolderId: 'dummy', rootFolderName: 'Dummy', brandName: 'Brand', folders: {},
      migration: createEmptyMigrationStateV31_('MIGRATE_V2'), writeState: createEmptyWriteStateV31_(false)
    });
    const actions = getProjectAvailableActions_(migrate);
    push('MIGRATE_V2 cannot enable before VERIFIED', actions.canEnableWrite === false, JSON.stringify(actions));
  } catch (e) { push('MIGRATE_V2 cannot enable before VERIFIED', false, e.message); }

  const success = cases.every(function(c) { return c.success; });
  Logger.log(JSON.stringify(cases, null, 2));
  return { success: success, cases: cases };
}

function runG1ShadowSmokeTests() {
  const p = getActiveProject_();
  if (!p) throw new Error('Chưa có active project.');
  const entity = getEntityProfileSummaryV4(p.projectId);
  const docs = getSourceDocs_(p);
  const content = docs.length === 1 ? getCanonicalContentModelSummaryV4(docs[0].getId(), p.projectId) : null;
  const out = {
    success: !!entity && (!!content || docs.length !== 1),
    projectId: p.projectId,
    writeEnabled: !!p.writeEnabled,
    shadowMode: !!p.shadowMode,
    entityProfile: entity,
    contentModel: content,
    sourceDocCount: docs.length
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function testMigrationPreviewOnly() { return previewV2Migration(); }

function testCanaryAssetStates(docId) {
  const p = getActiveProject_();
  const doc = getSourceDocById_(p, docId);
  const out = {};
  GES_CONFIG.MANAGED_ASSET_TYPES.forEach(function(t) { out[t] = getAssetState_(p, doc, t); });
  return out;
}

function runBrandingSmokeTest() {
  const project = getActiveProject_();
  if (!project) throw new Error('Chưa có active project.');
  const validation = validateProjectBranding_(project);
  const branding = validation.config || getProjectBranding_(project);
  const result = {
    success: validation.valid,
    enabled: branding.enabled,
    brandName: branding.brandName,
    websiteUrl: branding.websiteUrl,
    phones: branding.phones,
    logoConfigured: !!(branding.logo && branding.logo.driveFileId),
    ctaConfigured: !!(branding.cta && branding.cta.driveFileId),
    targets: branding.targets,
    warnings: validation.warnings || [],
    errors: validation.errors || []
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
