/** Non-destructive acceptance tests for GES V4.1 Project Structure Patch A. */
function runProjectStructureV41SmokeTests() {
  var results = [];
  function check(name, fn) {
    try { results.push({ name: name, success: true, detail: fn() }); }
    catch (e) { results.push({ name: name, success: false, detail: safeString_(e && e.message || e) }); }
  }

  check('Active project exists', function() {
    var p = getActiveProject_();
    if (!p) throw new Error('NO_ACTIVE_PROJECT');
    return { id: p.projectId, name: p.projectName, keyword: getProjectKeywordV41_(p) };
  });

  check('Structure config', function() {
    if (!GES_CONFIG.PROJECT_STRUCTURE_V41) throw new Error('PROJECT_STRUCTURE_CONFIG_MISSING');
    if (GES_CONFIG.PROJECT_STRUCTURE_V41.MIGRATION_POLICY !== 'PRESERVE_LEGACY_NO_AUTO_MIGRATION') {
      throw new Error('UNSAFE_MIGRATION_POLICY');
    }
    return GES_CONFIG.PROJECT_STRUCTURE_V41;
  });

  check('Canonical folder set', function() {
    var keys = getCanonicalProjectFolderKeysV41_();
    var expected = ['ARTICLES','DOCX','HTML','SLIDES','PDF','PHOTOS','VIDEOS','PODCASTS'];
    expected.forEach(function(k) { if (keys.indexOf(k) === -1) throw new Error('MISSING_' + k); });
    if (keys.indexOf('SHEETS') !== -1 || keys.indexOf('FORMS') !== -1) throw new Error('SHEETS_FORMS_MUST_BE_RETIRED');
    return keys;
  });

  check('Preview does not plan migration', function() {
    var r = previewActiveProjectStructureV41();
    if (!r.success) throw new Error('PREVIEW_FAILED');
    if (r.autoMigrationPlanned) throw new Error('AUTO_MIGRATION_PLANNED');
    if ((r.destructiveActions || []).length) throw new Error('DESTRUCTIVE_ACTIONS_PRESENT');
    return {
      missingCanonicalFolders: r.missingCanonicalFolders.map(function(x) { return x.key; }),
      legacyFolders: r.legacyFolders.map(function(x) { return x.key + ':' + x.id; })
    };
  });

  check('Legacy folder IDs preserved in profile', function() {
    var p = getActiveProject_();
    return {
      legacySheetsFolderId: safeString_(p.folders && p.folders.sheetsFolderId || ''),
      legacyFormsFolderId: safeString_(p.folders && p.folders.formsFolderId || '')
    };
  });

  check('Project singleton cardinality', function() {
    var p = getActiveProject_();
    var types = ['PROJECT_URL_SHEET','PROJECT_FORM','PROJECT_DRAWING','PROJECT_MY_MAPS','PROJECT_EARTH'];
    var out = {};
    types.forEach(function(type) {
      var st = getProjectSingletonAssetStateV41_(p, type);
      out[type] = { status: st.status, id: st.id || '', legacyCandidateCount: st.legacyCandidateCount || 0 };
    });
    return out;
  });

  check('Calendar build queue paused', function() {
    var plan = previewActiveBuildQueueV4();
    var calendarJobs = (plan.jobs || []).filter(function(j) { return safeString_(j.kind).indexOf('CALENDAR_') === 0; });
    if (calendarJobs.length) throw new Error('CALENDAR_JOBS_PRESENT_BEFORE_PATCH_B');
    return { jobs: plan.jobCount, calendarJobs: 0 };
  });

  var output = {
    success: results.every(function(x) { return x.success; }),
    version: '4.1.0-patch-a',
    results: results
  };
  console.log(JSON.stringify(output, null, 2));
  return output;
}
