/** Non-destructive smoke tests for GES Calendar V2.1. */

function runCalendarModuleSmokeTestsV4() {
  return runCalendarV2SmokeTestsV4();
}

function runCalendarV2SmokeTestsV4() {
  var results = [];
  function test(name, fn) {
    try { results.push({ name: name, success: true, detail: fn() }); }
    catch (e) { results.push({ name: name, success: false, detail: safeString_(e && e.message || e) }); }
  }

  test('Calendar Advanced Service', function() {
    return assertCalendarServiceAvailableV4_();
  });

  test('Calendar V2.1 schema', function() {
    var s = getCalendarPlanSchemaV4();
    if (s.VERSION !== '2.1.1') throw new Error('CALENDAR_SCHEMA_NOT_V2_1_1');
    if (s.PLAN_VERSION !== 4) throw new Error('CALENDAR_PLAN_VERSION_NOT_4');
    if (s.TEMPLATE_ID !== 'GES_PROJECT_CALENDAR_V2_15_EVENTS') throw new Error('CALENDAR_TEMPLATE_ID_CHANGED');
    if (s.EVENT_ROLES.length !== 15 || s.TEMPLATE.length !== 15) throw new Error('CALENDAR_V2_1_EVENT_COUNT_NOT_15');
    if (Number(s.DEFAULTS.TIMED_EVENT_DURATION_MINUTES) !== 15) throw new Error('CALENDAR_DURATION_NOT_15_MINUTES');
    return { version: s.VERSION, planVersion: s.PLAN_VERSION, templateId: s.TEMPLATE_ID, eventCount: s.EVENT_ROLES.length };
  });

  test('Calendar V2.1 role set exact', function() {
    var expected = [
      'TARGET_URL','PROJECT_FOLDER','ARTICLES_FOLDER','DOCX_FOLDER','SLIDES_FOLDER','PDFS_FOLDER',
      'PHOTOS_FOLDER','VIDEOS_FOLDER','PODCAST_FOLDER','HTML_FOLDER','PROJECT_URL_SHEET',
      'EXACT_MATCH_DOC','EXACT_MATCH_SLIDES','PROJECT_FORM','PROJECT_DRAWING'
    ];
    var actual = GES_CALENDAR_PLAN_SCHEMA_V4.EVENT_ROLES.slice();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('CALENDAR_V2_1_ROLE_SET_MISMATCH');
    return actual;
  });

  test('Calendar V2.1 schedule matrix exact', function() {
    var byKey = {};
    GES_CALENDAR_PLAN_SCHEMA_V4.TEMPLATE.forEach(function(x) { byKey[x.eventKey] = x; });
    var expected = {
      TARGET_URL:          { allDay:true,  days:['MO','TU','WE','TH','FR'] },
      PROJECT_URL_SHEET:   { allDay:true,  days:['MO','TU','WE','TH','FR'] },
      EXACT_MATCH_DOC:     { allDay:true,  days:['MO','TU','WE','TH','FR'] },
      PROJECT_FOLDER:      { allDay:false, days:['TU'], hour:8,  minute:0 },
      EXACT_MATCH_SLIDES:  { allDay:false, days:['TU'], hour:16, minute:0 },
      PDFS_FOLDER:         { allDay:false, days:['WE'], hour:10, minute:0 },
      SLIDES_FOLDER:       { allDay:false, days:['TH'], hour:9,  minute:0 },
      PHOTOS_FOLDER:       { allDay:false, days:['TH'], hour:16, minute:0 },
      PROJECT_DRAWING:     { allDay:false, days:['FR'], hour:7,  minute:0 },
      PROJECT_FORM:        { allDay:false, days:['FR'], hour:11, minute:0 },
      ARTICLES_FOLDER:     { allDay:false, days:['SA'], hour:9,  minute:0 },
      DOCX_FOLDER:         { allDay:false, days:['SA'], hour:13, minute:0 },
      HTML_FOLDER:         { allDay:false, days:['SU'], hour:9,  minute:0 },
      PODCAST_FOLDER:      { allDay:false, days:['SU'], hour:13, minute:0 },
      VIDEOS_FOLDER:       { allDay:false, days:['SU'], hour:17, minute:0 }
    };
    Object.keys(expected).forEach(function(key) {
      var spec = byKey[key];
      var e = expected[key];
      if (!spec) throw new Error('SCHEDULE_ROLE_MISSING_' + key);
      if ((spec.allDay === true) !== e.allDay) throw new Error('SCHEDULE_ALLDAY_MISMATCH_' + key);
      if (JSON.stringify(spec.byDay || []) !== JSON.stringify(e.days)) throw new Error('SCHEDULE_DAY_MISMATCH_' + key);
      if (!e.allDay && (Number(spec.hour) !== e.hour || Number(spec.minute || 0) !== e.minute)) throw new Error('SCHEDULE_TIME_MISMATCH_' + key);
    });
    return expected;
  });

  test('Calendar attachment MIME label policy exact', function() {
    var expected = {
      'application/vnd.google-apps.folder': 'Folder',
      'application/vnd.google-apps.spreadsheet': 'Sheet',
      'application/vnd.google-apps.form': 'Form',
      'application/vnd.google-apps.drawing': 'Drawing',
      'application/vnd.google-apps.document': 'Document',
      'application/vnd.google-apps.presentation': 'Presentation'
    };
    Object.keys(expected).forEach(function(mimeType) {
      var actual = calendarV2AttachmentTitleFromMimeTypeV4_(mimeType, 'Original Drive Name');
      if (actual !== expected[mimeType]) {
        throw new Error('ATTACHMENT_MIME_LABEL_MISMATCH_' + mimeType + '_' + actual);
      }
    });
    var fallback = calendarV2AttachmentTitleFromMimeTypeV4_('application/pdf', 'Original PDF Name');
    if (fallback !== 'Original PDF Name') throw new Error('ATTACHMENT_UNKNOWN_MIME_FALLBACK_CHANGED');
    if (GES_CALENDAR_ATTACHMENT_LABEL_POLICY_V4 !== 'mime-v1') throw new Error('ATTACHMENT_LABEL_POLICY_VERSION_CHANGED');
    return { policy: GES_CALENDAR_ATTACHMENT_LABEL_POLICY_V4, mapping: expected, fallback: fallback };
  });

  test('Calendar fingerprint canonicalizes attachment labels', function() {
    var base = {
      eventKey: 'TEST', role: 'TEST', summary: 'Test', description: '', location: '',
      visibility: 'public', transparency: 'transparent', recurrence: {}, source: {}, urlRefs: []
    };
    var legacy = Object.assign({}, base, {
      attachments: [{ fileId:'1', title:'Project-specific sheet name', mimeType:'application/vnd.google-apps.spreadsheet', fileUrl:'https://drive.google.com/open?id=1' }]
    });
    var canonical = Object.assign({}, base, {
      attachments: [{ fileId:'1', title:'Sheet', mimeType:'application/vnd.google-apps.spreadsheet', fileUrl:'https://drive.google.com/open?id=1' }]
    });
    var a = computeCalendarEventFingerprintV4_(legacy);
    var b = computeCalendarEventFingerprintV4_(canonical);
    if (a !== b) throw new Error('ATTACHMENT_FINGERPRINT_NOT_CANONICAL');
    return { policy: GES_CALENDAR_ATTACHMENT_LABEL_POLICY_V4, fingerprint: a };
  });

  test('Active project', function() {
    var p = getActiveProject_();
    if (!p) throw new Error('NO_ACTIVE_PROJECT');
    return { projectId: p.projectId, projectName: p.projectName, projectKeyword: getProjectKeywordV41_(p), rootFolderId: p.rootFolderId };
  });

  test('Project Folder uses current project.rootFolderId', function() {
    var p = getActiveProject_();
    var plan = previewActiveCalendarPlanV4();
    var e = plan.events.filter(function(x) { return x.eventKey === 'PROJECT_FOLDER'; })[0];
    if (!e) throw new Error('PROJECT_FOLDER_EVENT_MISSING');
    if (safeString_(e.source && e.source.id) !== safeString_(p.rootFolderId)) {
      throw new Error('PROJECT_FOLDER_NOT_PROJECT_ROOT');
    }
    return { projectType: p.projectType, rootFolderId: p.rootFolderId, eventSourceId: e.source.id };
  });

  test('Calendar V2.1 Plan valid', function() {
    var plan = previewActiveCalendarPlanV4();
    var v = validateCalendarPlanV4(plan);
    if (!v.valid) throw new Error(JSON.stringify(v.errors));
    if (plan.events.length !== 15) throw new Error('PLAN_EVENT_COUNT_NOT_15');
    return { total: plan.stats.total, ready: plan.stats.ready, deferred: plan.stats.deferred, missingSource: plan.stats.missingSource, needsReview: plan.stats.needsReview, fingerprint: plan.fingerprint };
  });

  test('TARGET_URL hub attachment contract', function() {
    var plan = previewActiveCalendarPlanV4();
    var target = plan.events.filter(function(x) { return x.eventKey === 'TARGET_URL'; })[0];
    if (!target) throw new Error('TARGET_URL_EVENT_MISSING');
    var ids = (target.attachments || []).map(function(a) { return safeString_(a.fileId); });
    var unique = {};
    ids.forEach(function(id) {
      if (!id) throw new Error('TARGET_ATTACHMENT_EMPTY_ID');
      if (unique[id]) throw new Error('TARGET_ATTACHMENT_DUPLICATE_' + id);
      unique[id] = true;
    });
    if (ids.length > 14) throw new Error('TARGET_ATTACHMENT_COUNT_GT_14');

    var snap = buildCalendarV2AssetSnapshot_(getActiveProject_());
    var expectedIds = [];
    ['ROOT','ARTICLES','DOCX','HTML','SLIDES','PDF','PHOTOS','VIDEOS','PODCASTS'].forEach(function(key) {
      var f = snap.folders && snap.folders[key];
      if (f && f.exists && f.id) expectedIds.push(f.id);
    });
    [snap.projectUrlSheet,snap.projectForm,snap.projectDrawing,snap.exactMatchDoc,snap.exactMatchSlides].forEach(function(x) {
      if (x && x.ready && x.id) expectedIds.push(x.id);
    });
    expectedIds.forEach(function(id) {
      if (ids.indexOf(id) === -1) throw new Error('TARGET_HUB_ATTACHMENT_MISSING_' + id);
    });
    return { attachmentCount: ids.length, expectedReadyCount: expectedIds.length, ids: ids };
  });

  test('Planned Calendar attachment titles follow MIME policy', function() {
    var plan = previewActiveCalendarPlanV4();
    var checked = 0;
    var labels = {};
    (plan.events || []).forEach(function(event) {
      (event.attachments || []).forEach(function(attachment) {
        var expectedTitle = calendarV2AttachmentTitleFromMimeTypeV4_(attachment.mimeType, attachment.title);
        if (safeString_(attachment.title) !== expectedTitle) {
          throw new Error('PLANNED_ATTACHMENT_TITLE_NOT_CANONICAL_' + event.eventKey + '_' + safeString_(attachment.fileId));
        }
        checked++;
        labels[safeString_(attachment.mimeType)] = expectedTitle;
      });
      if (event.extendedPropertiesPreview &&
          event.extendedPropertiesPreview.gesAttachmentLabelPolicy !== GES_CALENDAR_ATTACHMENT_LABEL_POLICY_V4) {
        throw new Error('ATTACHMENT_POLICY_EXTENDED_PROPERTY_MISSING_' + event.eventKey);
      }
    });
    if (!checked) throw new Error('NO_PLANNED_ATTACHMENTS_TO_VALIDATE');
    return { checked: checked, labels: labels, policy: GES_CALENDAR_ATTACHMENT_LABEL_POLICY_V4 };
  });

  test('Public Sheet Display Name bridge', function() {
    if (typeof getCalendarPublicAssetRowsV21_ !== 'function') throw new Error('CALENDAR_PUBLIC_SHEET_BRIDGE_MISSING');
    var p = getActiveProject_();
    var snap = buildCalendarV2AssetSnapshot_(p);
    var rows = getCalendarPublicAssetRowsV21_({ project:p, snapshot:snap });
    return { publicSheetReady: !!(snap.projectUrlSheet && snap.projectUrlSheet.ready), publicAssetRows: rows.length };
  });

  test('TARGET_URL description hyperlink contract', function() {
    var plan = previewActiveCalendarPlanV4();
    var target = plan.events.filter(function(x) { return x.eventKey === 'TARGET_URL'; })[0];
    var description = safeString_(target && target.description);
    if (description.indexOf('Meeting Topics') === -1) throw new Error('TARGET_DESCRIPTION_MEETING_TOPICS_MISSING');
    if (description.indexOf('RELEVANT INFO for this meeting') === -1) throw new Error('TARGET_DESCRIPTION_RELEVANT_INFO_MISSING');
    if (description.indexOf('Website URL') === -1) throw new Error('TARGET_DESCRIPTION_WEBSITE_MISSING');
    if (description.indexOf('<a href=') === -1) throw new Error('TARGET_DESCRIPTION_HYPERLINK_MISSING');
    return { length: description.length, urlRefCount: target.urlRefs.length };
  });

  test('Exact-match resolvers do not fuzzy match', function() {
    var p = getActiveProject_();
    var snap = buildCalendarV2AssetSnapshot_(p);
    return {
      keyword: snap.projectKeyword,
      doc: { status: snap.exactMatchDoc.status, reason: snap.exactMatchDoc.reason, id: snap.exactMatchDoc.id || '' },
      slides: { status: snap.exactMatchSlides.status, reason: snap.exactMatchSlides.reason, id: snap.exactMatchSlides.id || '' }
    };
  });

  test('Project singleton resolver', function() {
    var p = getActiveProject_();
    var snap = buildCalendarV2AssetSnapshot_(p);
    return {
      projectUrlSheet: { status: snap.projectUrlSheet.status, id: snap.projectUrlSheet.id || '' },
      projectForm: { status: snap.projectForm.status, id: snap.projectForm.id || '' },
      projectDrawing: { status: snap.projectDrawing.status, id: snap.projectDrawing.id || '' }
    };
  });

  test('Calendar V2 migration remains non-destructive', function() {
    var r = previewActiveCalendarV2MigrationV4();
    if ((r.destructiveActions || []).length) throw new Error('MIGRATION_PREVIEW_HAS_DESTRUCTIVE_ACTIONS');
    return { status: r.currentState.status, required: r.currentState.required, safeRenameCount: r.safeRenameCount, keptOrphanCount: r.keptOrphanCount, conflicts: r.conflicts.length };
  });

  test('Calendar Registry integrity', function() {
    var audit = auditCalendarRegistryV4();
    if (!audit.success) throw new Error(JSON.stringify(audit));
    return audit;
  });

  test('Build Queue includes Calendar jobs', function() {
    var q = previewActiveBuildQueueV4();
    var kinds = q.jobs.map(function(j) { return j.kind; });
    if (kinds.indexOf('CALENDAR_SYNC') === -1) throw new Error('CALENDAR_SYNC_JOB_MISSING');
    if (kinds.indexOf('CALENDAR_VISIBILITY') === -1) throw new Error('CALENDAR_VISIBILITY_JOB_MISSING');
    return { totalJobs: q.jobCount, calendarJobs: kinds.filter(function(k) { return k.indexOf('CALENDAR_') === 0; }) };
  });

  test('BUILD COMPLETE GES preview Calendar active', function() {
    var r = previewBuildCompleteGesV4('');
    if (!r.calendar || r.calendar.integrationPaused) throw new Error('CALENDAR_STILL_PAUSED');
    return { templateId: r.calendar.templateId, migration: r.calendar.migration, queueJobs: r.buildQueue && r.buildQueue.jobCount };
  });

  test('Unified Public Sheet separation installed', function() {
    if (typeof refreshProjectPublicSheetV43 !== 'function') throw new Error('PUBLIC_SHEET_REFRESH_MISSING');
    if (typeof syncCalendarEventUrlVariantsToRegistryV43_ !== 'function') throw new Error('CALENDAR_URL_VARIANT_PROJECTION_MISSING');
    var schema = getPublicProjectSheetSchemaV43();
    if (schema.tabs.indexOf('Calendar Events') !== -1) throw new Error('CALENDAR_EVENTS_PUBLIC_TAB_NOT_RETIRED');
    if (schema.tabs.indexOf('Assets') === -1 || schema.tabs.indexOf('Content') === -1) throw new Error('UNIFIED_PUBLIC_TABS_MISSING');
    return { publicTabs: schema.tabs, registrySourceOfTruth: schema.sourceOfTruth };
  });


  test('TARGET_URL relevant-info canonical-only contract', function() {
    var p = getActiveProject_();
    var snap = buildCalendarV2AssetSnapshot_(p);
    var context = { project:p, snapshot:snap };
    var rows = getCalendarPublicAssetRowsV21_(context);
    var selected = selectCalendarTargetRelevantLinksV21_(context, rows);
    if (selected.length > 14) throw new Error('TARGET_RELEVANT_LINKS_GT_14');
    var allowed = {
      PROJECT_FOLDER:true, ARTICLES_FOLDER:true, DOCX_FOLDER:true, HTML_FOLDER:true, SLIDES_FOLDER:true,
      PDFS_FOLDER:true, PHOTOS_FOLDER:true, VIDEOS_FOLDER:true, PODCAST_FOLDER:true,
      PROJECT_URL_SHEET:true, PROJECT_FORM:true, PROJECT_DRAWING:true, EXACT_MATCH_DOC:true, EXACT_MATCH_SLIDES:true
    };
    selected.forEach(function(row) {
      if (!allowed[row.canonicalRole]) throw new Error('TARGET_RELEVANT_NON_CANONICAL_' + safeString_(row.canonicalRole));
    });
    return { count:selected.length, roles:selected.map(function(x){return x.canonicalRole;}) };
  });

  test('PROJECT_DRAWING V2.1.1 contract', function() {
    var plan = previewActiveCalendarPlanV4();
    var e = plan.events.filter(function(x){return x.eventKey === 'PROJECT_DRAWING';})[0];
    if (!e) throw new Error('PROJECT_DRAWING_EVENT_MISSING');
    if (e.recurrence.allDay) throw new Error('PROJECT_DRAWING_MUST_BE_TIMED');
    if (JSON.stringify(e.recurrence.byDay) !== JSON.stringify(['FR'])) throw new Error('PROJECT_DRAWING_DAY_NOT_FR');
    if (Number(e.recurrence.startHour) !== 7 || Number(e.recurrence.startMinute) !== 0) throw new Error('PROJECT_DRAWING_TIME_NOT_0700');
    if (safeString_(e.description).indexOf('Target Page') !== -1) throw new Error('PROJECT_DRAWING_TARGET_PAGE_MUST_BE_REMOVED');
    return { availability:e.availability, source:e.source, schedule:e.scheduleLabel };
  });

  test('Legacy cleanup preview is read-only', function() {
    if (typeof previewActiveCalendarV21LegacyCleanup !== 'function') throw new Error('CALENDAR_LEGACY_CLEANUP_MODULE_MISSING');
    var props = PropertiesService.getScriptProperties();
    var before = props.getProperties();
    var preview = previewActiveCalendarV21LegacyCleanup();
    var after = props.getProperties();
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('CLEANUP_PREVIEW_CHANGED_SCRIPT_PROPERTIES');
    return { deleteCandidates:preview.deleteCandidateCount, reviewRequired:preview.reviewRequiredCount, blockers:preview.blockers.length };
  });

  var output = { success: results.every(function(r) { return r.success; }), version: '2.1.1-calendar-v2-1-g1', results: results };
  console.log(JSON.stringify(output, null, 2));
  return output;
}

/** Backward-compatible K1 acceptance read-only helper. */
function runK1CalendarPostCanaryAcceptanceV4() {
  var plan = previewK1CalendarPlanV4();
  var project = getProject_(plan.projectId);
  var audit = auditCalendarRegistryV4(project.projectId);
  var migration = getCalendarV2MigrationStateV4(project.projectId);
  var result = {
    success: audit.success,
    projectId: project.projectId,
    projectName: project.projectName,
    calendarV2PlanTotal: plan.stats.total,
    readyPlanned: plan.stats.ready,
    migration: migration,
    registryAudit: audit
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}
