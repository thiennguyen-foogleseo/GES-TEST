/** Non-destructive tests for GES V4.5 Private System Storage. */

function runPrivateSystemStorageV45SmokeTests() {
  var results = [];
  function test(name, fn) {
    try { results.push({ name: name, success: true, detail: fn() }); }
    catch (e) { results.push({ name: name, success: false, detail: safeString_(e && e.message || e) }); }
  }

  test('Private storage schema', function() {
    var s = getPrivateSystemStorageSchemaV45();
    if (s.VERSION !== '4.5.0') throw new Error('PRIVATE_STORAGE_VERSION_MISMATCH');
    if (s.STORAGE_POLICY !== 'GLOBAL_PRIVATE_ROOT_PER_PROJECT_SUBFOLDER') throw new Error('PRIVATE_STORAGE_POLICY_MISMATCH');
    return s.VERSION;
  });

  test('Private storage state normalization', function() {
    var s = normalizePrivateStorageStateV45_({ status: 'APPLIED', entityRetirement: { runtimeScanDisabled: true } });
    if (s.status !== 'APPLIED') throw new Error('PRIVATE_STORAGE_STATE_STATUS_LOST');
    if (!s.entityRetirement.runtimeScanDisabled) throw new Error('ENTITY_RETIREMENT_SCAN_FLAG_LOST');
    if (!Array.isArray(s.warnings)) throw new Error('PRIVATE_STORAGE_WARNINGS_NOT_ARRAY');
    return s.status;
  });

  test('Entity index key deterministic', function() {
    var a = entityIndexKeyV45_('prj_test', 'file_test');
    var b = entityIndexKeyV45_('prj_test', 'file_test');
    if (a !== b || a !== 'prj_test|file_test') throw new Error('ENTITY_INDEX_KEY_NOT_DETERMINISTIC');
    return a;
  });

  test('Entity profile flatten deterministic', function() {
    var rows = flattenEntityProfileV45_({ b: 2, a: { y: 'Y', x: 'X' } }, '', []);
    var keys = rows.map(function(r) { return r[0]; });
    if (JSON.stringify(keys) !== JSON.stringify(['a.x','a.y','b'])) throw new Error('ENTITY_CONFIG_FLATTEN_ORDER_INVALID');
    return keys.join(',');
  });

  test('Registry tabs V4.5 configured', function() {
    if (!V3_CONFIG.REGISTRY_TABS.ENTITY_CONFIG) throw new Error('ENTITY_CONFIG_TAB_NOT_CONFIGURED');
    if (!V3_CONFIG.REGISTRY_TABS.ENTITY_INDEX) throw new Error('ENTITY_INDEX_TAB_NOT_CONFIGURED');
    return V3_CONFIG.REGISTRY_TABS.ENTITY_CONFIG + ' / ' + V3_CONFIG.REGISTRY_TABS.ENTITY_INDEX;
  });

  test('Active project preview is read-only', function() {
    var p = getActiveProject_();
    if (!p) return 'NO_ACTIVE_PROJECT';
    var before = JSON.stringify(normalizePrivateStorageStateV45_(p.privateStorage));
    var preview = previewPrivateSystemStorageV45(p.projectId);
    var afterProject = getProject_(p.projectId);
    var after = JSON.stringify(normalizePrivateStorageStateV45_(afterProject.privateStorage));
    if (before !== after) throw new Error('PREVIEW_MUTATED_PROJECT_STATE');
    if (!Array.isArray(preview.actions)) throw new Error('PREVIEW_ACTIONS_MISSING');
    if ((preview.destructiveActions || []).length) throw new Error('PREVIEW_HAS_DESTRUCTIVE_ACTIONS');
    return { actions: preview.actions.length, blockers: (preview.blockers || []).length };
  });

  var failed = results.filter(function(r) { return !r.success; });
  return { success: failed.length === 0, version: GES_PRIVATE_SYSTEM_V45.VERSION, results: results };
}
