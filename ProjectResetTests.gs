/** Non-destructive tests for Project Reset Preview Patch D. */

function runProjectResetPreviewSmokeTestsV44() {
  var results = [];
  function check(name, fn) {
    try { results.push({ name: name, success: true, detail: fn() }); }
    catch (e) { results.push({ name: name, success: false, detail: safeString_(e && e.message || e) }); }
  }

  check('Reset schema is preview-only', function() {
    if (!GES_PROJECT_RESET_V44.PREVIEW_ONLY) throw new Error('RESET_PREVIEW_ONLY_FLAG_FALSE');
    if (typeof executeProjectResetV44 !== 'undefined') throw new Error('DESTRUCTIVE_EXECUTE_FUNCTION_PRESENT');
    if (typeof applyProjectResetV44 !== 'undefined') throw new Error('DESTRUCTIVE_APPLY_FUNCTION_PRESENT');
    return GES_PROJECT_RESET_V44.VERSION;
  });

  check('Reset modes available', function() {
    var names = Object.keys(GES_PROJECT_RESET_V44.MODES);
    ['RESET_OUTPUTS','RESET_TEST_BUILD','RESET_GES_STATE','FULL_PROJECT_PURGE'].forEach(function(name) {
      if (names.indexOf(name) === -1) throw new Error('RESET_MODE_MISSING: ' + name);
    });
    return names;
  });

  check('Preview does not mutate Script Properties', function() {
    var project = getActiveProject_();
    if (!project) throw new Error('NO_ACTIVE_PROJECT');
    var before = JSON.stringify(getScriptProps_().getProperties());
    var preview = previewProjectResetV44(project.projectId, 'RESET_TEST_BUILD');
    var after = JSON.stringify(getScriptProps_().getProperties());
    if (before !== after) throw new Error('SCRIPT_PROPERTIES_CHANGED_DURING_PREVIEW');
    if (!preview.previewOnly || preview.executeFunctionShipped) throw new Error('PREVIEW_CONTRACT_INVALID');
    return {
      projectId: project.projectId,
      trashCandidateCount: preview.drive.trashCandidateCount,
      reviewRequiredCount: preview.drive.reviewRequiredCount,
      calendarManagedEventCount: preview.calendar.managedEventCount,
      planFingerprint: preview.planFingerprint
    };
  });

  check('Full purge is hard-blocked unless disposable', function() {
    var project = getActiveProject_();
    if (!project) throw new Error('NO_ACTIVE_PROJECT');
    var preview = previewProjectResetV44(project.projectId, 'FULL_PROJECT_PURGE');
    if (preview.safety.futureExecutionBlocked !== true) throw new Error('FULL_PURGE_NOT_BLOCKED');
    return preview.safety.blockers;
  });

  var success = results.every(function(x) { return x.success; });
  var out = { success: success, version: GES_PROJECT_RESET_V44.VERSION, results: results };
  console.log(JSON.stringify(out, null, 2));
  return out;
}
