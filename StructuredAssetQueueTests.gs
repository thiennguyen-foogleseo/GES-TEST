/** Non-destructive smoke tests for Project Structure V4.1 + Build Queue. */

function runStructuredAssetQueueSmokeTestsV4() {
  var results = [];
  function check(name, fn) {
    try { results.push({ name: name, success: true, detail: fn() }); }
    catch (e) { results.push({ name: name, success: false, detail: safeString_(e && e.message || e) }); }
  }

  check('Active project', function() {
    var p = getActiveProject_();
    if (!p) throw new Error('NO_ACTIVE_PROJECT');
    return { projectName: p.projectName, projectKeyword: getProjectKeywordV41_(p) };
  });

  check('Source-doc managed types', function() {
    var expected = ['SLIDES','PDF','DOCX','HTML'];
    expected.forEach(function(type) {
      if (GES_CONFIG.MANAGED_ASSET_TYPES.indexOf(type) === -1) throw new Error(type + '_NOT_MANAGED');
    });
    if (GES_CONFIG.MANAGED_ASSET_TYPES.indexOf('FORM') !== -1) throw new Error('FORM_MUST_NOT_BE_SOURCE_SCOPED');
    if (GES_CONFIG.MANAGED_ASSET_TYPES.indexOf('SHEET') !== -1) throw new Error('SHEET_MUST_NOT_BE_SOURCE_SCOPED');
    return GES_CONFIG.MANAGED_ASSET_TYPES.slice();
  });

  check('Project singleton managed types', function() {
    if ((GES_CONFIG.PROJECT_MANAGED_ASSET_TYPES || []).indexOf('PROJECT_FORM') === -1) throw new Error('PROJECT_FORM_NOT_MANAGED');
    if ((GES_CONFIG.PROJECT_MANAGED_ASSET_TYPES || []).indexOf('PROJECT_URL_SHEET') === -1) throw new Error('PROJECT_URL_SHEET_NOT_MANAGED');
    return GES_CONFIG.PROJECT_MANAGED_ASSET_TYPES.slice();
  });

  check('Canonical folders exclude Sheets/Forms', function() {
    var keys = getCanonicalProjectFolderKeysV41_();
    ['ARTICLES','DOCX','HTML','SLIDES','PDF','PHOTOS','VIDEOS','PODCASTS'].forEach(function(k) {
      if (keys.indexOf(k) === -1) throw new Error('CANONICAL_FOLDER_MISSING_' + k);
    });
    if (keys.indexOf('SHEETS') !== -1 || keys.indexOf('FORMS') !== -1) throw new Error('RETIRED_FOLDER_STILL_CANONICAL');
    return keys;
  });

  check('Structure preview is non-destructive', function() {
    var r = previewActiveProjectStructureV41();
    if (!r || !r.success) throw new Error('STRUCTURE_PREVIEW_FAILED');
    if (r.autoMigrationPlanned !== false) throw new Error('AUTO_MIGRATION_MUST_BE_FALSE');
    if ((r.destructiveActions || []).length) throw new Error('DESTRUCTIVE_ACTION_PLANNED');
    return { missingCanonicalFolders: r.missingCanonicalFolders.length, legacyFolders: r.legacyFolders.length };
  });

  check('Project URL Sheet preview', function() {
    var r = previewActiveProjectSheetV4();
    if (!r || !r.success) throw new Error('SHEET_PREVIEW_FAILED');
    return { status: r.status, sheetId: r.sheetId || '', legacyCandidateCount: r.legacyCandidateCount || 0 };
  });

  check('Project Form preview', function() {
    var r = previewActiveProjectFormV4();
    if (!r || !r.success) throw new Error('FORM_PREVIEW_FAILED');
    return { status: r.status, source: r.source };
  });

  check('Project singleton fingerprints deterministic', function() {
    var p = getActiveProject_();
    var s1 = getProjectManagedAssetFingerprintV41_(p, 'PROJECT_URL_SHEET');
    var s2 = getProjectManagedAssetFingerprintV41_(p, 'PROJECT_URL_SHEET');
    var f1 = getProjectManagedAssetFingerprintV41_(p, 'PROJECT_FORM');
    var f2 = getProjectManagedAssetFingerprintV41_(p, 'PROJECT_FORM');
    if (!s1 || s1 !== s2) throw new Error('PROJECT_SHEET_FINGERPRINT_NOT_DETERMINISTIC');
    if (!f1 || f1 !== f2) throw new Error('PROJECT_FORM_FINGERPRINT_NOT_DETERMINISTIC');
    return { sheet: s1, form: f1 };
  });

  check('Build Queue project-scoped jobs', function() {
    var r = previewActiveBuildQueueV4();
    var projectTypes = r.jobs.filter(function(j) { return j.kind === 'PROJECT_ASSET_SYNC'; }).map(function(j) { return j.assetType; });
    if (projectTypes.indexOf('PROJECT_FORM') === -1) throw new Error('QUEUE_PROJECT_FORM_JOB_MISSING');
    if (projectTypes.indexOf('PROJECT_URL_SHEET') === -1) throw new Error('QUEUE_PROJECT_SHEET_JOB_MISSING');
    var sourceTypes = r.jobs.filter(function(j) { return j.kind === 'ASSET_SYNC'; }).map(function(j) { return j.assetType; });
    if (sourceTypes.indexOf('FORM') !== -1 || sourceTypes.indexOf('SHEET') !== -1) throw new Error('QUEUE_STILL_HAS_PER_DOC_FORM_SHEET');
    var calendarJobs = r.jobs.filter(function(j) { return j.kind.indexOf('CALENDAR_') === 0; });
    if (calendarJobs.length) throw new Error('CALENDAR_MUST_BE_PAUSED_UNTIL_V2');
    return { jobCount: r.jobCount, projectAssetTypes: projectTypes, sourceAssetTypes: sourceTypes };
  });

  var output = {
    success: results.every(function(r) { return r.success; }),
    version: '1.2.0-project-structure-v41',
    results: results
  };
  console.log(JSON.stringify(output, null, 2));
  return output;
}
