/** Non-destructive tests for GES V4.5.1 Canonical Folder Name Reconcile. */

function runCanonicalFolderNameReconcileV451SmokeTests() {
  var results = [];
  function test(name, fn) {
    try { results.push({ name: name, success: true, detail: fn() }); }
    catch (e) { results.push({ name: name, success: false, detail: safeString_(e && e.message || e) }); }
  }

  test('V4.5.1 schema and canonical folder count', function() {
    var s = getCanonicalFolderNameReconcileSchemaV451();
    if (s.VERSION !== '4.5.1') throw new Error('FOLDER_NAME_RECONCILE_VERSION_MISMATCH');
    if (s.CANONICAL_FOLDER_COUNT !== 8) throw new Error('CANONICAL_FOLDER_COUNT_MISMATCH');
    if (!Array.isArray(s.CANONICAL_FOLDER_KEYS) || s.CANONICAL_FOLDER_KEYS.length !== 8) throw new Error('CANONICAL_KEYS_INVALID');
    return s.CANONICAL_FOLDER_KEYS.join(',');
  });

  test('Expected names derive from live root name', function() {
    var expected = {
      ARTICLES: 'Example Brand Articles',
      DOCX: 'Example Brand DOCX',
      HTML: 'Example Brand HTML',
      SLIDES: 'Example Brand Slides',
      PDF: 'Example Brand PDFs',
      PHOTOS: 'Example Brand Photos',
      VIDEOS: 'Example Brand Videos',
      PODCASTS: 'Example Brand Podcasts'
    };
    Object.keys(expected).forEach(function(key) {
      var actual = canonicalFolderExpectedNameV451_('Example Brand', key);
      if (actual !== expected[key]) throw new Error(key + '_EXPECTED_NAME_INVALID:' + actual);
    });
    return expected;
  });

  test('Name status is deterministic', function() {
    if (canonicalFolderNameStatusV451_('Example Brand Articles', 'Example Brand Articles') !== 'CURRENT') {
      throw new Error('CURRENT_STATUS_INVALID');
    }
    if (canonicalFolderNameStatusV451_('Old Articles', 'Example Brand Articles') !== 'RENAME_REQUIRED') {
      throw new Error('RENAME_STATUS_INVALID');
    }
    return 'CURRENT / RENAME_REQUIRED';
  });

  test('Preview is non-destructive', function() {
    var p = getActiveProject_();
    if (!p) return 'NO_ACTIVE_PROJECT';
    var before = JSON.stringify(getProject_(p.projectId));
    var preview = previewCanonicalFolderNameReconcileV451(p.projectId);
    var after = JSON.stringify(getProject_(p.projectId));
    if (before !== after) throw new Error('PREVIEW_MUTATED_PROJECT_STATE');
    if ((preview.destructiveActions || []).length) throw new Error('PREVIEW_HAS_DESTRUCTIVE_ACTIONS');
    if (!preview.invariants || !preview.invariants.keepFolderIds) throw new Error('KEEP_FOLDER_IDS_INVARIANT_MISSING');
    if (preview.invariants.moveFolders || preview.invariants.createFolders || preview.invariants.deleteFolders) {
      throw new Error('PREVIEW_ALLOWS_STRUCTURAL_MUTATION');
    }
    return { status: preview.status, renameCount: preview.renameCount, blockers: preview.blockerCount };
  });

  test('Preview only targets canonical 8 folders', function() {
    var p = getActiveProject_();
    if (!p) return 'NO_ACTIVE_PROJECT';
    var preview = previewCanonicalFolderNameReconcileV451(p.projectId);
    var keys = preview.folders.map(function(f) { return f.key; });
    if (keys.indexOf('SHEETS') !== -1 || keys.indexOf('FORMS') !== -1) throw new Error('LEGACY_FOLDER_TARGETED');
    if (keys.length !== 8) throw new Error('PREVIEW_CANONICAL_COUNT_INVALID:' + keys.length);
    return keys.join(',');
  });

  var failed = results.filter(function(r) { return !r.success; });
  return {
    success: failed.length === 0,
    version: GES_CANONICAL_FOLDER_NAME_RECONCILE_V451.VERSION,
    results: results
  };
}
