/**
 * GES V4 - Resumable Build Queue Manager
 *
 * Breaks BUILD COMPLETE GES into deterministic, resumable jobs so adding Sheet,
 * Form and future assets does not reintroduce Apps Script execution timeouts.
 */

const GES_BUILD_QUEUE_V4 = Object.freeze({
  VERSION: '1.5.0-resumable-selective-sync-v468',
  PROPERTY_PREFIX: 'GES_V4_BUILD_QUEUE_',
  INDEX_PROPERTY: 'GES_V4_BUILD_QUEUE_INDEX',
  CONTINUATION_HANDLER: 'resumeGesBuildQueueV4',
  CONTINUATION_DELAY_MS: 45000,
  EXECUTION_BUDGET_MS: 150000,
  MIN_REMAINING_MS: 30000,
  LIGHT_JOB_MIN_REMAINING_MS: 50000,
  DOC_FOOTER_MIN_REMAINING_MS: 55000,
  HEAVY_JOB_MIN_REMAINING_MS: 120000,
  CALENDAR_MIN_REMAINING_MS: 90000,
  STATE_CHUNK_CHARS: 2500,
  LOCK_TIMEOUT_MS: 8000,
  WORKER_LEASE_MS: 330000,
  MAX_ATTEMPTS: 8,
  ASSET_ORDER: ['SLIDES','HTML','PDF','DOCX'],
  PROJECT_ASSET_ORDER: ['PROJECT_URL_SHEET','PROJECT_FORM']
});

/* ========================================================================== *
 * Public API
 * ========================================================================== */

function previewBuildQueueV4(projectId, options) {
  options = options || {};
  var project = buildQueueResolveProjectV4_(projectId || '');
  var mode = normalizeBuildQueueModeV468_(options.mode || 'BUILD_COMPLETE');
  var jobs = buildQueuePlanJobsV4_(project, {
    mode: mode,
    selectedDocIds: options.selectedDocIds || []
  });
  return {
    success: true,
    version: GES_BUILD_QUEUE_V4.VERSION,
    queueMode: mode,
    projectId: project.projectId,
    projectName: project.projectName,
    writeEnabled: !!(project.writeState && project.writeState.writeEnabled),
    jobCount: jobs.length,
    heavyJobCount: jobs.filter(function(job) { return isHeavyBuildQueueJobV468_(job); }).length,
    jobs: jobs.map(function(job) {
      return {
        seq: job.q,
        jobId: job.id,
        kind: job.k,
        sourceDocId: job.d || '',
        assetType: job.a || '',
        status: job.s
      };
    })
  };
}

function previewActiveBuildQueueV4() {
  return previewBuildQueueV4('');
}

function startBuildQueueV4(projectId, options) {
  options = options || {};
  var project = buildQueueResolveProjectV4_(projectId || '');
  assertProjectWritable_(project);

  var requestedMode = normalizeBuildQueueModeV468_(options.mode || 'BUILD_COMPLETE');
  var selectedDocIds = Array.isArray(options.selectedDocIds) ? options.selectedDocIds.filter(Boolean) : [];

  // IMPORTANT: only hold ScriptLock while reading/writing queue state.
  // Heavy asset work runs OUTSIDE the global ScriptLock so one project cannot
  // block every other GES project for several minutes.
  var prepared = withBuildQueueStateLockV4_(function() {
    var existing = readBuildQueueStateV4_(project.projectId);

    if (existing && ['QUEUED','RUNNING'].indexOf(existing.st) !== -1 && !options.restart) {
      if (existing.st === 'RUNNING' && !isBuildQueueLeaseActiveV4_(existing)) {
        existing.st = 'QUEUED';
        existing.lk = '';
        existing.le = 0;
        existing.up = nowIso_();
        writeBuildQueueStateV4_(existing);
        addBuildQueueIndexV4_(project.projectId);
      }
      return { reused: true, state: existing, requestedMode: requestedMode };
    }

    var jobs = buildQueuePlanJobsV4_(project, {
      mode: requestedMode,
      selectedDocIds: selectedDocIds
    });
    var state = {
      v: GES_BUILD_QUEUE_V4.VERSION,
      r: 'build_' + new Date().getTime() + '_' + project.projectId,
      p: project.projectId,
      pn: project.projectName,
      m: requestedMode,
      st: 'QUEUED',
      c: 0,
      j: jobs,
      cr: nowIso_(),
      up: nowIso_(),
      co: '',
      er: '',
      src: safeString_(options.source || requestedMode),
      lk: '',
      le: 0
    };
    writeBuildQueueStateV4_(state);
    addBuildQueueIndexV4_(project.projectId);
    return { reused: false, state: state, requestedMode: requestedMode };
  });

  ensureBuildQueueContinuationTriggerV4_();

  if (options.runNow === false) {
    var queuedOnly = expandBuildQueueStateV4_(prepared.state);
    queuedOnly.reusedExistingQueue = !!prepared.reused;
    queuedOnly.requestedMode = requestedMode;
    return queuedOnly;
  }

  if (prepared.state.st === 'RUNNING' && isBuildQueueLeaseActiveV4_(prepared.state)) {
    var busy = expandBuildQueueStateV4_(prepared.state);
    busy.status = 'BUSY';
    busy.workerBusy = true;
    busy.reusedExistingQueue = !!prepared.reused;
    busy.requestedMode = requestedMode;
    return busy;
  }

  var result = runBuildQueueSliceCoreV4_(project.projectId, {
    source: prepared.state.src,
    budgetMs: Number(options.budgetMs || GES_BUILD_QUEUE_V4.EXECUTION_BUDGET_MS)
  });
  result.reusedExistingQueue = !!prepared.reused;
  result.requestedMode = requestedMode;
  return result;
}

function startActiveBuildQueueV4() {
  return startBuildQueueV4('', {
    runNow: true,
    source: 'DASHBOARD_BUILD_COMPLETE_GES',
    mode: 'BUILD_COMPLETE'
  });
}

function getBuildQueueStateV4(projectId) {
  var project = buildQueueResolveProjectV4_(projectId || '');
  var state = readBuildQueueStateV4_(project.projectId);
  return state ? expandBuildQueueStateV4_(state) : {
    success: true,
    exists: false,
    projectId: project.projectId,
    projectName: project.projectName,
    status: 'IDLE'
  };
}

function getActiveBuildQueueStateV4() {
  return getBuildQueueStateV4('');
}

function cancelBuildQueueV4(projectId) {
  return withBuildQueueStateLockV4_(function() {
    var project = buildQueueResolveProjectV4_(projectId || '');
    var state = readBuildQueueStateV4_(project.projectId);
    if (!state) return { success: true, projectId: project.projectId, status: 'IDLE' };
    state.st = 'CANCELLED';
    state.co = nowIso_();
    state.up = nowIso_();
    // Clearing the lease causes any in-flight worker to fail its next owned
    // state write instead of continuing to mutate the queue indefinitely.
    state.lk = '';
    state.le = 0;
    writeBuildQueueStateV4_(state);
    removeBuildQueueIndexV4_(project.projectId);
    return expandBuildQueueStateV4_(state);
  });
}

function retryBuildQueueV4(projectId) {
  var project = buildQueueResolveProjectV4_(projectId || '');
  assertProjectWritable_(project);
  var state = withBuildQueueStateLockV4_(function() {
    var current = readBuildQueueStateV4_(project.projectId);
    if (!current) throw new Error('BUILD_QUEUE_NOT_FOUND');
    if (current.st !== 'ERROR') return current;
    var job = current.j[current.c];
    if (!job) throw new Error('BUILD_QUEUE_ERROR_JOB_NOT_FOUND');
    job.s = 'PENDING';
    job.m = '';
    job.cd = '';
    current.st = 'QUEUED';
    current.er = '';
    current.lk = '';
    current.le = 0;
    current.up = nowIso_();
    writeBuildQueueStateV4_(current);
    addBuildQueueIndexV4_(project.projectId);
    return current;
  });
  ensureBuildQueueContinuationTriggerV4_();
  return expandBuildQueueStateV4_(state);
}

/** Time-driven trigger entrypoint. */
function resumeGesBuildQueueV4() {
  var ids = readBuildQueueIndexV4_();
  if (!ids.length) {
    cleanupBuildQueueContinuationTriggersV4_();
    return { success: true, status: 'IDLE', queuedProjects: 0 };
  }

  var result = null;
  // Do not hold a ScriptLock while running a project. Try queued projects until
  // one is not currently owned by another worker.
  for (var i = 0; i < ids.length; i++) {
    result = runBuildQueueSliceCoreV4_(ids[i], {
      source: 'TIME_DRIVEN_CONTINUATION',
      budgetMs: GES_BUILD_QUEUE_V4.EXECUTION_BUDGET_MS
    });
    if (!result || result.status !== 'BUSY') break;
  }

  if (readBuildQueueIndexV4_().length) ensureBuildQueueContinuationTriggerV4_();
  return result || { success: true, status: 'BUSY', queuedProjects: ids.length };
}

/* ========================================================================== *
 * Core queue runner
 * ========================================================================== */

function runBuildQueueSliceCoreV4_(projectId, options) {
  options = options || {};
  var started = Date.now();
  var budget = Number(options.budgetMs || GES_BUILD_QUEUE_V4.EXECUTION_BUDGET_MS);

  var claim = claimBuildQueueLeaseV4_(projectId);
  if (!claim.claimed) {
    if (claim.terminal) return expandBuildQueueStateV4_(claim.state);
    var busy = expandBuildQueueStateV4_(claim.state);
    busy.status = 'BUSY';
    busy.workerBusy = true;
    busy.leaseExpiresAt = Number(claim.state.le || 0);
    return busy;
  }

  var token = claim.token;
  var state = claim.state;
  ensureBuildQueueContinuationTriggerV4_();

  var project = getProject_(state.p);
  if (!project) {
    releaseBuildQueueLeaseV4_(state, token, 'ERROR', 'BUILD_QUEUE_PROJECT_NOT_FOUND');
    throw new Error('BUILD_QUEUE_PROJECT_NOT_FOUND');
  }
  assertProjectWritable_(project);

  while (state.c < state.j.length) {
    var elapsed = Date.now() - started;
    var remaining = budget - elapsed;

    if (elapsed >= Math.max(30000, budget - GES_BUILD_QUEUE_V4.MIN_REMAINING_MS)) {
      state.st = 'QUEUED';
      state.up = nowIso_();
      releaseBuildQueueLeaseV4_(state, token, 'QUEUED', '');
      addBuildQueueIndexV4_(project.projectId);
      ensureBuildQueueContinuationTriggerV4_();
      return expandBuildQueueStateV4_(state);
    }

    var job = state.j[state.c];
    if (job.s === 'DONE' || job.s === 'SKIPPED') {
      state.c++;
      persistBuildQueueOwnedStateV4_(state, token);
      continue;
    }

    var minimumForJob = minimumRemainingForBuildQueueJobV468_(job, project);
    if (remaining < minimumForJob) {
      job.s = 'PENDING';
      job.m = 'WAIT_FOR_FRESH_SLICE_' + minimumForJob;
      state.st = 'QUEUED';
      state.up = nowIso_();
      releaseBuildQueueLeaseV4_(state, token, 'QUEUED', '');
      addBuildQueueIndexV4_(project.projectId);
      ensureBuildQueueContinuationTriggerV4_();
      return expandBuildQueueStateV4_(state);
    }

    job.s = 'RUNNING';
    job.n = Number(job.n || 0) + 1;
    job.sd = nowIso_();
    state.st = 'RUNNING';
    state.up = nowIso_();
    persistBuildQueueOwnedStateV4_(state, token);

    try {
      var result = executeBuildQueueJobV4_(project, job, remaining);
      if (result && result.yielded) {
        job.s = 'PENDING';
        job.m = safeString_(result.message || 'YIELDED');
        state.st = 'QUEUED';
        state.up = nowIso_();
        releaseBuildQueueLeaseV4_(state, token, 'QUEUED', '');
        addBuildQueueIndexV4_(project.projectId);
        ensureBuildQueueContinuationTriggerV4_();
        return expandBuildQueueStateV4_(state);
      }

      job.s = result && result.skipped ? 'SKIPPED' : 'DONE';
      job.cd = nowIso_();
      job.m = truncateBuildQueueMessageV4_(result && (result.message || result.code || result.action) || 'DONE');
      job.rc = safeString_(result && (result.code || result.action || '')).substring(0, 80);
      state.c++;
      state.up = nowIso_();
      persistBuildQueueOwnedStateV4_(state, token);

      // PDF/DOCX and their resource-footer updates are intentionally isolated
      // to one heavy operation per Apps Script execution. This leaves a large
      // safety margin below Google's hard runtime ceiling.
      if (isHeavyBuildQueueJobV468_(job) && !(result && result.skipped) && state.c < state.j.length) {
        releaseBuildQueueLeaseV4_(state, token, 'QUEUED', '');
        addBuildQueueIndexV4_(project.projectId);
        ensureBuildQueueContinuationTriggerV4_();
        return expandBuildQueueStateV4_(state);
      }
    } catch (e) {
      if (safeString_(e && e.message) === 'BUILD_QUEUE_CANCELLED') {
        var cancelled = readBuildQueueStateV4_(project.projectId);
        removeBuildQueueIndexV4_(project.projectId);
        return cancelled ? expandBuildQueueStateV4_(cancelled) : {
          success: true, exists: false, projectId: project.projectId, status: 'CANCELLED'
        };
      }

      job.s = 'ERROR';
      job.m = truncateBuildQueueMessageV4_(e && e.message || e);
      job.cd = nowIso_();
      state.er = job.m;
      state.st = 'ERROR';
      state.up = nowIso_();
      releaseBuildQueueLeaseV4_(state, token, 'ERROR', state.er);
      removeBuildQueueIndexV4_(project.projectId);
      return expandBuildQueueStateV4_(state);
    }
  }

  state.st = 'COMPLETE';
  state.co = nowIso_();
  state.up = nowIso_();
  state.er = '';
  releaseBuildQueueLeaseV4_(state, token, 'COMPLETE', '');
  removeBuildQueueIndexV4_(project.projectId);
  if (!readBuildQueueIndexV4_().length) cleanupBuildQueueContinuationTriggersV4_();
  return expandBuildQueueStateV4_(state);
}

function executeBuildQueueJobV4_(project, job, remainingBudgetMs) {
  if (Number(job.n || 0) > GES_BUILD_QUEUE_V4.MAX_ATTEMPTS) {
    throw new Error('BUILD_QUEUE_MAX_ATTEMPTS_EXCEEDED: ' + job.id);
  }

  if (job.k === 'ASSET_SYNC') {
    var docFile = getSourceDocById_(project, job.d);
    var result = syncAssetForDoc_(project, docFile, job.a);
    if (!result || result.success === false) {
      throw new Error('ASSET_SYNC_FAILED ' + job.a + ': ' + safeString_(result && result.message));
    }
    return result;
  }

  if (job.k === 'ASSET_CREATE') {
    var createDoc = getSourceDocById_(project, job.d);
    var createState = getAssetState_(project, createDoc, job.a);
    if (createState.status !== 'MISSING') {
      return { skipped: true, code: 'NOT_MISSING_' + createState.status, message: job.a + ' no longer MISSING.' };
    }
    var created = createAssetByType_(project, createDoc, job.a);
    if (!created || created.success === false) {
      throw new Error('ASSET_CREATE_FAILED ' + job.a + ': ' + safeString_(created && created.message));
    }
    return created;
  }

  if (job.k === 'ASSET_UPDATE') {
    var updateDoc = getSourceDocById_(project, job.d);
    var updateState = getAssetState_(project, updateDoc, job.a);
    if (['OUTDATED','RENDERER_OUTDATED'].indexOf(updateState.status) === -1) {
      return { skipped: true, code: 'NOT_OUTDATED_' + updateState.status, message: job.a + ' no longer OUTDATED.' };
    }
    var updated = updateAssetByType_(project, updateDoc, job.a);
    if (!updated || updated.success === false) {
      throw new Error('ASSET_UPDATE_FAILED ' + job.a + ': ' + safeString_(updated && updated.message));
    }
    return updated;
  }

  if (job.k === 'PROJECT_ASSET_SYNC') {
    if (typeof syncProjectSingletonAssetV41_ !== 'function') {
      return { skipped: true, code: 'PROJECT_SINGLETON_MODULE_NOT_INSTALLED', message: 'Project singleton module not installed.' };
    }
    var projectResult = syncProjectSingletonAssetV41_(project, job.a);
    if (!projectResult || projectResult.success === false) {
      var code = safeString_(projectResult && projectResult.code || 'PROJECT_ASSET_REVIEW');
      if (['SOURCE_REQUIRED','MISSING_SOURCE','NEEDS_REVIEW','DUPLICATE'].indexOf(code) !== -1) {
        return { skipped: true, code: code, message: safeString_(projectResult && projectResult.message || code) };
      }
      throw new Error('PROJECT_ASSET_SYNC_FAILED ' + job.a + ': ' + safeString_(projectResult && projectResult.message));
    }
    return projectResult;
  }

  if (job.k === 'PROJECT_ASSET_CREATE' || job.k === 'PROJECT_ASSET_UPDATE') {
    if (typeof syncProjectSingletonAssetV41_ !== 'function') {
      return { skipped: true, code: 'PROJECT_SINGLETON_MODULE_NOT_INSTALLED', message: 'Project singleton module not installed.' };
    }
    var singletonState = getProjectSingletonAssetStateV41_(project, job.a);
    var expected = job.k === 'PROJECT_ASSET_CREATE' ? 'MISSING' : 'OUTDATED';
    if (singletonState.status !== expected) {
      return { skipped: true, code: 'PROJECT_ASSET_' + singletonState.status, message: job.a + ' no longer ' + expected + '.' };
    }
    var singletonResult = syncProjectSingletonAssetV41_(project, job.a);
    if (!singletonResult || singletonResult.success === false) {
      throw new Error(job.k + '_FAILED ' + job.a + ': ' + safeString_(singletonResult && singletonResult.message));
    }
    return singletonResult;
  }

  if (job.k === 'CALENDAR_SYNC') {
    if (typeof syncProjectCalendarCoreV4_ !== 'function') {
      return { skipped: true, code: 'CALENDAR_MODULE_NOT_INSTALLED', message: 'Calendar module not installed.' };
    }
    if (typeof getCalendarV2MigrationStateV4 === 'function') {
      var migrationState = getCalendarV2MigrationStateV4(project.projectId);
      if (migrationState && migrationState.required) {
        return { skipped: true, code: 'CALENDAR_V2_MIGRATION_REQUIRED', message: 'Preview/Apply Calendar V2 migration trước khi Sync Calendar.' };
      }
    }
    var calendarBudget = Math.max(60000, Math.min(120000, Number(remainingBudgetMs || 90000) - 15000));
    var calendar = syncProjectCalendarCoreV4_(project.projectId, {
      source: 'BUILD_QUEUE',
      timeBudgetMs: calendarBudget,
      autoQueue: false
    });
    if (calendar && calendar.complete === false) {
      return { yielded: true, message: 'CALENDAR_PARTIAL_' + (calendar.remainingEventKeys || []).length };
    }
    if (!calendar || calendar.success === false) {
      throw new Error('CALENDAR_SYNC_FAILED: ' + safeString_(calendar && calendar.error));
    }
    return { code: 'CALENDAR_SYNC_COMPLETE', message: 'Calendar synced.' };
  }

  if (job.k === 'CALENDAR_VISIBILITY') {
    if (typeof validateProjectCalendarVisibilityV4 !== 'function') {
      return { skipped: true, code: 'CALENDAR_VISIBILITY_MODULE_NOT_INSTALLED', message: 'Visibility module not installed.' };
    }
    if (typeof getCalendarV2MigrationStateV4 === 'function') {
      var visibilityMigration = getCalendarV2MigrationStateV4(project.projectId);
      if (visibilityMigration && visibilityMigration.required) {
        return { skipped: true, code: 'CALENDAR_V2_MIGRATION_REQUIRED', message: 'Calendar visibility audit deferred until V2 migration is applied.' };
      }
    }
    var visibility = validateProjectCalendarVisibilityV4(project.projectId);
    if (visibility && visibility.valid === false && (visibility.errors || []).length) {
      throw new Error('CALENDAR_VISIBILITY_INVALID: ' + visibility.errors.join(', '));
    }
    return { code: 'CALENDAR_VISIBILITY_OK', message: visibility && visibility.valid === false ? 'Completed with warnings.' : 'Visibility valid.' };
  }

  // Backward compatibility for V4.6.6/V4.6.7 queues that already contain
  // one project-level Docs-footer job.
  if (job.k === 'DOC_RESOURCE_FOOTERS') {
    if (typeof syncProjectDocumentResourceFootersV466_ !== 'function') {
      return { skipped: true, code: 'DOC_RESOURCE_FOOTER_MODULE_NOT_INSTALLED', message: 'Document resource footer module not installed.' };
    }
    if (Number(remainingBudgetMs || 0) < GES_BUILD_QUEUE_V4.DOC_FOOTER_MIN_REMAINING_MS) {
      return { yielded: true, message: 'DOC_RESOURCE_FOOTERS_WAIT_FOR_FRESH_SLICE' };
    }
    var footerResult = syncProjectDocumentResourceFootersV466_(project.projectId, {
      source: 'BUILD_QUEUE_LEGACY',
      preRefreshPublicSheet: false,
      postRefreshPublicSheet: false
    });
    if (!footerResult || footerResult.success === false) {
      throw new Error('DOC_RESOURCE_FOOTER_SYNC_FAILED: ' + safeString_(footerResult && footerResult.failedCount));
    }
    return {
      code: 'DOC_RESOURCE_FOOTERS_SYNCED',
      message: 'Google Docs resource footers synced: ' + Number(footerResult.updatedCount || 0) + '/' + Number(footerResult.documentCount || 0)
    };
  }

  if (job.k === 'DOC_RESOURCE_FOOTER') {
    if (typeof syncOneDocumentResourceFooterV466_ !== 'function') {
      return { skipped: true, code: 'DOC_RESOURCE_FOOTER_MODULE_NOT_INSTALLED', message: 'Document resource footer module not installed.' };
    }
    var footerDoc = getSourceDocById_(project, job.d);
    var oneFooter = syncOneDocumentResourceFooterV466_(project, footerDoc, {
      source: 'BUILD_QUEUE_V468'
    });
    if (!oneFooter || oneFooter.success === false) {
      throw new Error('DOC_RESOURCE_FOOTER_FAILED: ' + safeString_(oneFooter && oneFooter.message));
    }
    return {
      code: 'DOC_RESOURCE_FOOTER_SYNCED',
      message: 'Google Docs resource footer synced: ' + footerDoc.getName()
    };
  }

  if (job.k === 'OUTPUT_RESOURCE_FOOTER') {
    if (typeof syncOneOutputResourceFooterV467_ !== 'function') {
      return { skipped: true, code: 'OUTPUT_RESOURCE_FOOTER_MODULE_NOT_INSTALLED', message: 'Unified output resource footer module not installed.' };
    }
    var outputDocV467 = getSourceDocById_(project, job.d);
    var outputModelV467 = collectOutputResourceFooterModelV467_(project, outputDocV467);
    var outputFpV467 = computeOutputResourceFingerprintV467_(outputModelV467);
    var outputResultV467 = syncOneOutputResourceFooterV467_(project, outputDocV467, job.a, outputModelV467, outputFpV467, { source: 'BUILD_QUEUE_V468' });
    if (!outputResultV467 || outputResultV467.success === false) {
      throw new Error('OUTPUT_RESOURCE_FOOTER_FAILED ' + job.a + ': ' + safeString_(outputResultV467 && outputResultV467.message));
    }
    return outputResultV467;
  }

  if (job.k === 'PUBLIC_SHEET_POST_FOOTER_REFRESH' || job.k === 'PUBLIC_SHEET_POST_RESOURCE_REFRESH') {
    if (typeof refreshProjectPublicSheetV43 !== 'function') {
      return { skipped: true, code: 'PUBLIC_SHEET_REFRESH_MODULE_NOT_INSTALLED', message: 'Public Sheet refresh module not installed.' };
    }
    var sheetRefresh = refreshProjectPublicSheetV43(project.projectId);
    if (sheetRefresh && sheetRefresh.success === false) {
      throw new Error('PUBLIC_SHEET_POST_FOOTER_REFRESH_FAILED: ' + safeString_(sheetRefresh.error || sheetRefresh.code));
    }
    return { code: 'PUBLIC_SHEET_POST_RESOURCE_REFRESHED', message: sheetRefresh && sheetRefresh.skipped ? 'Public Sheet refresh skipped.' : 'Public Sheet refreshed after Docs/output resource propagation.' };
  }

  throw new Error('UNKNOWN_BUILD_QUEUE_JOB_KIND: ' + job.k);
}

/* ========================================================================== *
 * Planning / persistence
 * ========================================================================== */

function buildQueuePlanJobsV4_(project, options) {
  options = options || {};
  var mode = normalizeBuildQueueModeV468_(options.mode || 'BUILD_COMPLETE');
  var jobs = [];
  var seq = 1;
  var docs = filterBuildQueueDocsV468_(project, options.selectedDocIds || [], mode);

  function push(kind, id, docId, assetType) {
    jobs.push({
      q: seq++,
      id: id,
      k: kind,
      d: docId || '',
      a: assetType || '',
      s: 'PENDING',
      n: 0,
      sd: '',
      cd: '',
      m: '',
      rc: ''
    });
  }

  function pushFinalPublicRefresh() {
    if (typeof refreshProjectPublicSheetV43 === 'function') {
      push('PUBLIC_SHEET_POST_RESOURCE_REFRESH', 'public-sheet:post-resource-refresh', '', '');
    }
  }

  if (mode === 'CREATE_MISSING') {
    docs.forEach(function(docFile) {
      GES_BUILD_QUEUE_V4.ASSET_ORDER.forEach(function(assetType) {
        if (GES_CONFIG.MANAGED_ASSET_TYPES.indexOf(assetType) === -1) return;
        var state = getAssetState_(project, docFile, assetType);
        if (state.status === 'MISSING') {
          push('ASSET_CREATE', ['create', docFile.getId(), assetType].join(':'), docFile.getId(), assetType);
        }
      });
    });
    (GES_BUILD_QUEUE_V4.PROJECT_ASSET_ORDER || []).forEach(function(assetType) {
      if ((GES_CONFIG.PROJECT_MANAGED_ASSET_TYPES || []).indexOf(assetType) === -1) return;
      var state = getProjectSingletonAssetStateV41_(project, assetType);
      if (state.status === 'MISSING') {
        push('PROJECT_ASSET_CREATE', ['project-create', assetType].join(':'), '', assetType);
      }
    });
    if (jobs.length) pushFinalPublicRefresh();
    return jobs;
  }

  if (mode === 'SYNC_CHANGED') {
    docs.forEach(function(docFile) {
      GES_BUILD_QUEUE_V4.ASSET_ORDER.forEach(function(assetType) {
        if (GES_CONFIG.MANAGED_ASSET_TYPES.indexOf(assetType) === -1) return;
        var state = getAssetState_(project, docFile, assetType);
        if (state.status === 'OUTDATED' || state.status === 'RENDERER_OUTDATED') {
          push('ASSET_UPDATE', ['update', docFile.getId(), assetType].join(':'), docFile.getId(), assetType);
        }
      });
    });
    (GES_BUILD_QUEUE_V4.PROJECT_ASSET_ORDER || []).forEach(function(assetType) {
      if ((GES_CONFIG.PROJECT_MANAGED_ASSET_TYPES || []).indexOf(assetType) === -1) return;
      var state = getProjectSingletonAssetStateV41_(project, assetType);
      if (state.status === 'OUTDATED') {
        push('PROJECT_ASSET_UPDATE', ['project-update', assetType].join(':'), '', assetType);
      }
    });
    if (typeof syncOneDocumentResourceFooterV466_ === 'function') {
      docs.forEach(function(docFile) {
        push('DOC_RESOURCE_FOOTER', ['doc-resource', docFile.getId()].join(':'), docFile.getId(), '');
      });
    }
    if (typeof syncOneOutputResourceFooterV467_ === 'function') {
      docs.forEach(function(docFile) {
        ['SLIDES','HTML','PDF','DOCX'].forEach(function(assetType) {
          push('OUTPUT_RESOURCE_FOOTER', ['output-resource', docFile.getId(), assetType].join(':'), docFile.getId(), assetType);
        });
      });
    }
    pushFinalPublicRefresh();
    return jobs;
  }

  if (mode === 'DOC_RESOURCE') {
    if (typeof syncOneDocumentResourceFooterV466_ === 'function') {
      docs.forEach(function(docFile) {
        push('DOC_RESOURCE_FOOTER', ['doc-resource', docFile.getId()].join(':'), docFile.getId(), '');
      });
    }
    pushFinalPublicRefresh();
    return jobs;
  }

  if (mode === 'OUTPUT_RESOURCE') {
    // Phase 1: make every required output exist/current. Doing this for the
    // whole project first means phase-2 footers see the final URL graph.
    docs.forEach(function(docFile) {
      ['SLIDES','HTML','PDF','DOCX'].forEach(function(assetType) {
        if (GES_CONFIG.MANAGED_ASSET_TYPES.indexOf(assetType) === -1) return;
        var state = getAssetState_(project, docFile, assetType);
        if (['MISSING','OUTDATED','RENDERER_OUTDATED','WRONG_FOLDER'].indexOf(state.status) !== -1) {
          push('ASSET_SYNC', ['ensure-output', docFile.getId(), assetType].join(':'), docFile.getId(), assetType);
        }
      });
    });
    // Phase 2: propagate the now-complete resource graph to each output.
    if (typeof syncOneOutputResourceFooterV467_ === 'function') {
      docs.forEach(function(docFile) {
        ['SLIDES','HTML','PDF','DOCX'].forEach(function(assetType) {
          push('OUTPUT_RESOURCE_FOOTER', ['output-resource', docFile.getId(), assetType].join(':'), docFile.getId(), assetType);
        });
      });
    }
    pushFinalPublicRefresh();
    return jobs;
  }

  if (mode === 'SELECTED_SYNC') {
    docs.forEach(function(docFile) {
      GES_BUILD_QUEUE_V4.ASSET_ORDER.forEach(function(assetType) {
        if (GES_CONFIG.MANAGED_ASSET_TYPES.indexOf(assetType) === -1) return;
        push('ASSET_SYNC', ['selected-asset', docFile.getId(), assetType].join(':'), docFile.getId(), assetType);
      });
      if (typeof syncOneDocumentResourceFooterV466_ === 'function') {
        push('DOC_RESOURCE_FOOTER', ['selected-doc-resource', docFile.getId()].join(':'), docFile.getId(), '');
      }
      if (typeof syncOneOutputResourceFooterV467_ === 'function') {
        ['SLIDES','HTML','PDF','DOCX'].forEach(function(assetType) {
          push('OUTPUT_RESOURCE_FOOTER', ['selected-output-resource', docFile.getId(), assetType].join(':'), docFile.getId(), assetType);
        });
      }
    });
    pushFinalPublicRefresh();
    return jobs;
  }

  // BUILD_COMPLETE: full project orchestration. Source outputs are resolved
  // first, followed by singleton assets, Calendar, one Docs-footer job per
  // source, one output-resource job per asset, then the final Public Sheet.
  docs.forEach(function(docFile) {
    GES_BUILD_QUEUE_V4.ASSET_ORDER.forEach(function(assetType) {
      if (GES_CONFIG.MANAGED_ASSET_TYPES.indexOf(assetType) === -1) return;
      push('ASSET_SYNC', ['asset', docFile.getId(), assetType].join(':'), docFile.getId(), assetType);
    });
  });

  (GES_BUILD_QUEUE_V4.PROJECT_ASSET_ORDER || []).forEach(function(assetType) {
    if ((GES_CONFIG.PROJECT_MANAGED_ASSET_TYPES || []).indexOf(assetType) === -1) return;
    push('PROJECT_ASSET_SYNC', ['project-asset', assetType].join(':'), '', assetType);
  });

  var calendarPending = !!(GES_CONFIG.PROJECT_STRUCTURE_V41 && GES_CONFIG.PROJECT_STRUCTURE_V41.CALENDAR_V2_PENDING);
  if (!calendarPending && typeof syncProjectCalendarCoreV4_ === 'function') {
    push('CALENDAR_SYNC', 'calendar:sync', '', '');
  }
  if (!calendarPending && typeof validateProjectCalendarVisibilityV4 === 'function') {
    push('CALENDAR_VISIBILITY', 'calendar:visibility', '', '');
  }

  if (typeof syncOneDocumentResourceFooterV466_ === 'function') {
    docs.forEach(function(docFile) {
      push('DOC_RESOURCE_FOOTER', ['doc-resource', docFile.getId()].join(':'), docFile.getId(), '');
    });
  }
  if (typeof syncOneOutputResourceFooterV467_ === 'function') {
    docs.forEach(function(docFile) {
      ['SLIDES','HTML','PDF','DOCX'].forEach(function(assetType) {
        push('OUTPUT_RESOURCE_FOOTER', ['output-resource', docFile.getId(), assetType].join(':'), docFile.getId(), assetType);
      });
    });
  }

  if ((typeof syncOneDocumentResourceFooterV466_ === 'function' || typeof syncOneOutputResourceFooterV467_ === 'function') &&
      typeof refreshProjectPublicSheetV43 === 'function') {
    pushFinalPublicRefresh();
  }
  return jobs;
}

function normalizeBuildQueueModeV468_(mode) {
  var value = safeString_(mode || 'BUILD_COMPLETE').trim().toUpperCase();
  var allowed = ['BUILD_COMPLETE','CREATE_MISSING','SYNC_CHANGED','DOC_RESOURCE','OUTPUT_RESOURCE','SELECTED_SYNC'];
  return allowed.indexOf(value) !== -1 ? value : 'BUILD_COMPLETE';
}

function filterBuildQueueDocsV468_(project, selectedDocIds, mode) {
  var docs = getSourceDocs_(project);
  if (normalizeBuildQueueModeV468_(mode) !== 'SELECTED_SYNC') return docs;

  var wanted = {};
  (selectedDocIds || []).forEach(function(id) {
    if (safeString_(id)) wanted[safeString_(id)] = true;
  });
  var selected = docs.filter(function(file) { return !!wanted[file.getId()]; });
  if (!selected.length) throw new Error('SELECTED_SYNC_NO_VALID_SOURCE_DOCS');
  return selected;
}

function isHeavyBuildQueueJobV468_(job) {
  if (!job) return false;
  var assetType = safeString_(job.a).toUpperCase();
  if (['PDF','DOCX'].indexOf(assetType) === -1) return false;
  return ['ASSET_SYNC','ASSET_CREATE','ASSET_UPDATE','OUTPUT_RESOURCE_FOOTER'].indexOf(safeString_(job.k)) !== -1;
}

function minimumRemainingForBuildQueueJobV468_(job, project) {
  if (!job) return GES_BUILD_QUEUE_V4.LIGHT_JOB_MIN_REMAINING_MS;
  if (isHeavyBuildQueueJobV468_(job)) {
    // OUTPUT_RESOURCE_FOOTER can often be skipped from Registry fingerprint
    // alone. Treat that preflight-current case as light so a queue with many
    // already-current PDF/DOCX assets does not burn one continuation per skip.
    if (job.k === 'OUTPUT_RESOURCE_FOOTER' && project && isOutputResourceFooterCurrentV468_(project, job)) {
      return GES_BUILD_QUEUE_V4.LIGHT_JOB_MIN_REMAINING_MS;
    }
    return GES_BUILD_QUEUE_V4.HEAVY_JOB_MIN_REMAINING_MS;
  }
  if (job.k === 'CALENDAR_SYNC') return GES_BUILD_QUEUE_V4.CALENDAR_MIN_REMAINING_MS;
  if (job.k === 'DOC_RESOURCE_FOOTER' || job.k === 'DOC_RESOURCE_FOOTERS') {
    return GES_BUILD_QUEUE_V4.DOC_FOOTER_MIN_REMAINING_MS;
  }
  return GES_BUILD_QUEUE_V4.LIGHT_JOB_MIN_REMAINING_MS;
}

function isOutputResourceFooterCurrentV468_(project, job) {
  try {
    if (!project || !job || job.k !== 'OUTPUT_RESOURCE_FOOTER' || !job.d || !job.a) return false;
    var docFile = getSourceDocById_(project, job.d);
    var reg = getAssetRegistry_(project.projectId, docFile.getId(), job.a) || {};
    if (!safeString_(reg.resourceFooterFingerprint)) return false;
    var desired = getOutputResourceFingerprintV467_(project, docFile);
    return safeString_(reg.resourceFooterFingerprint) === safeString_(desired);
  } catch (ignore) {
    return false;
  }
}

function buildQueueResolveProjectV4_(projectId) {
  var project = projectId ? getProject_(projectId) : getActiveProject_();
  if (!project) throw new Error('BUILD_QUEUE_PROJECT_NOT_FOUND');
  return project;
}

function buildQueuePropertyKeyV4_(projectId) {
  return GES_BUILD_QUEUE_V4.PROPERTY_PREFIX + projectId;
}

function readBuildQueueStateV4_(projectId) {
  var props = getScriptProps_();
  var key = buildQueuePropertyKeyV4_(projectId);
  var raw = props.getProperty(key);
  if (!raw) return null;

  var parsed = jsonParseSafe_(raw, null);
  if (!parsed || parsed.__gesQueueSharded !== 1) return parsed;

  var chunks = [];
  var count = Number(parsed.chunks || 0);
  if (!count) return null;
  for (var i = 0; i < count; i++) {
    var chunk = props.getProperty(key + '_C' + i);
    if (chunk === null) throw new Error('BUILD_QUEUE_STATE_CHUNK_MISSING_' + i);
    chunks.push(chunk);
  }
  return jsonParseSafe_(chunks.join(''), null);
}

function writeBuildQueueStateV4_(state) {
  var props = getScriptProps_();
  var key = buildQueuePropertyKeyV4_(state.p);
  var json = JSON.stringify(state);
  var oldRaw = props.getProperty(key);
  var oldMeta = oldRaw ? jsonParseSafe_(oldRaw, null) : null;
  var oldChunkCount = oldMeta && oldMeta.__gesQueueSharded === 1 ? Number(oldMeta.chunks || 0) : 0;

  if (json.length <= GES_BUILD_QUEUE_V4.STATE_CHUNK_CHARS) {
    props.setProperty(key, json);
    for (var i = 0; i < oldChunkCount; i++) props.deleteProperty(key + '_C' + i);
    return;
  }

  var chunks = splitBuildQueueStringV468_(json, GES_BUILD_QUEUE_V4.STATE_CHUNK_CHARS);
  var payload = {};
  payload[key] = JSON.stringify({
    __gesQueueSharded: 1,
    version: GES_BUILD_QUEUE_V4.VERSION,
    chunks: chunks.length,
    chars: json.length
  });
  chunks.forEach(function(chunk, index) {
    payload[key + '_C' + index] = chunk;
  });
  props.setProperties(payload, false);
  for (var j = chunks.length; j < oldChunkCount; j++) props.deleteProperty(key + '_C' + j);
}

function splitBuildQueueStringV468_(value, chunkChars) {
  var s = safeString_(value);
  var size = Math.max(500, Number(chunkChars || 2500));
  var out = [];
  for (var i = 0; i < s.length; i += size) out.push(s.substring(i, i + size));
  return out;
}

function readBuildQueueIndexV4_() {
  var raw = getScriptProps_().getProperty(GES_BUILD_QUEUE_V4.INDEX_PROPERTY);
  var ids = raw ? jsonParseSafe_(raw, []) : [];
  return Array.isArray(ids) ? ids.filter(Boolean) : [];
}

function writeBuildQueueIndexV4_(ids) {
  getScriptProps_().setProperty(GES_BUILD_QUEUE_V4.INDEX_PROPERTY, JSON.stringify((ids || []).filter(Boolean)));
}

function addBuildQueueIndexV4_(projectId) {
  var ids = readBuildQueueIndexV4_();
  if (ids.indexOf(projectId) === -1) ids.push(projectId);
  writeBuildQueueIndexV4_(ids);
}

function removeBuildQueueIndexV4_(projectId) {
  writeBuildQueueIndexV4_(readBuildQueueIndexV4_().filter(function(id) { return id !== projectId; }));
}

function ensureBuildQueueContinuationTriggerV4_() {
  // Maintain exactly one FUTURE watchdog continuation. The watchdog is armed
  // before heavy work starts, not only when a slice exits gracefully.
  try {
    return withBuildQueueStateLockV4_(function() {
      var handler = GES_BUILD_QUEUE_V4.CONTINUATION_HANDLER;
      var created = ScriptApp.newTrigger(handler)
        .timeBased()
        .after(GES_BUILD_QUEUE_V4.CONTINUATION_DELAY_MS)
        .create();
      var keepId = created.getUniqueId();

      ScriptApp.getProjectTriggers().forEach(function(trigger) {
        if (
          trigger.getHandlerFunction() === handler &&
          trigger.getUniqueId() !== keepId
        ) {
          ScriptApp.deleteTrigger(trigger);
        }
      });
      return keepId;
    });
  } catch (e) {
    throw new Error('BUILD_QUEUE_CONTINUATION_TRIGGER_ERROR: ' + safeString_(e && e.message || e));
  }
}

function cleanupBuildQueueContinuationTriggersV4_() {
  var handler = GES_BUILD_QUEUE_V4.CONTINUATION_HANDLER;
  try {
    ScriptApp.getProjectTriggers().forEach(function(trigger) {
      if (trigger.getHandlerFunction() === handler) {
        ScriptApp.deleteTrigger(trigger);
      }
    });
  } catch (e) {
    // Cleanup is best-effort and must never turn a completed queue into ERROR.
  }
}

/**
 * Diagnostic: inspect queue index, watchdog trigger and active-project lease.
 * Read-only for Drive/Calendar assets.
 */
function inspectBuildQueueContinuationV4() {
  var project = getActiveProject_();
  var handler = GES_BUILD_QUEUE_V4.CONTINUATION_HANDLER;
  var triggers = [];
  try {
    ScriptApp.getProjectTriggers().forEach(function(trigger) {
      if (trigger.getHandlerFunction() === handler) {
        triggers.push({
          uniqueId: trigger.getUniqueId(),
          eventType: safeString_(trigger.getEventType && trigger.getEventType()),
          source: safeString_(trigger.getTriggerSource && trigger.getTriggerSource())
        });
      }
    });
  } catch (e) {
    return {
      success: false,
      error: 'TRIGGER_INSPECTION_FAILED: ' + safeString_(e && e.message || e),
      queuedProjectIds: readBuildQueueIndexV4_()
    };
  }

  var state = project ? readBuildQueueStateV4_(project.projectId) : null;
  return {
    success: true,
    version: GES_BUILD_QUEUE_V4.VERSION,
    activeProjectId: project ? project.projectId : '',
    activeProjectName: project ? project.projectName : '',
    queuedProjectIds: readBuildQueueIndexV4_(),
    continuationHandler: handler,
    continuationTriggerCount: triggers.length,
    continuationTriggers: triggers,
    queueStatus: state ? state.st : 'IDLE',
    cursor: state ? Number(state.c || 0) : 0,
    totalJobs: state ? (state.j || []).length : 0,
    leaseActive: isBuildQueueLeaseActiveV4_(state),
    leaseExpiresAtMs: state ? Number(state.le || 0) : 0,
    lastError: state ? safeString_(state.er || '') : ''
  };
}

/**
 * Safe recovery for a stranded QUEUED/RUNNING queue. It never clears a live
 * worker lease. If the lease is stale, it re-queues the project and arms the
 * watchdog. It does not touch Drive/Calendar assets itself.
 */
function repairActiveBuildQueueContinuationV4() {
  var project = getActiveProject_();
  if (!project) throw new Error('BUILD_QUEUE_PROJECT_NOT_FOUND');

  var repaired = withBuildQueueStateLockV4_(function() {
    var state = readBuildQueueStateV4_(project.projectId);
    if (!state) {
      return { success: true, exists: false, status: 'IDLE', projectId: project.projectId };
    }
    if (state.st === 'COMPLETE' || state.st === 'CANCELLED' || state.st === 'ERROR') {
      return expandBuildQueueStateV4_(state);
    }
    if (isBuildQueueLeaseActiveV4_(state)) {
      var busy = expandBuildQueueStateV4_(state);
      busy.status = 'BUSY';
      busy.workerBusy = true;
      busy.leaseExpiresAt = Number(state.le || 0);
      return busy;
    }

    // Stale RUNNING or an ordinary QUEUED state can be safely re-armed.
    state.st = 'QUEUED';
    state.lk = '';
    state.le = 0;
    state.up = nowIso_();
    writeBuildQueueStateV4_(state);
    addBuildQueueIndexV4_(project.projectId);
    return expandBuildQueueStateV4_(state);
  });

  if (repaired && repaired.exists !== false && repaired.status !== 'BUSY' &&
      repaired.status !== 'COMPLETE' && repaired.status !== 'CANCELLED' &&
      repaired.status !== 'ERROR') {
    repaired.continuationTriggerId = ensureBuildQueueContinuationTriggerV4_();
    repaired.watchdogArmed = true;
  }
  return repaired;
}

/**
 * Manual resume helper. Use after repairActiveBuildQueueContinuationV4() when
 * you want to continue immediately instead of waiting for the watchdog.
 */
function resumeActiveBuildQueueNowV4() {
  var project = getActiveProject_();
  if (!project) throw new Error('BUILD_QUEUE_PROJECT_NOT_FOUND');
  var state = readBuildQueueStateV4_(project.projectId);
  if (!state) return { success: true, exists: false, status: 'IDLE' };
  if (isBuildQueueLeaseActiveV4_(state)) {
    var busy = expandBuildQueueStateV4_(state);
    busy.status = 'BUSY';
    busy.workerBusy = true;
    busy.leaseExpiresAt = Number(state.le || 0);
    return busy;
  }
  addBuildQueueIndexV4_(project.projectId);
  ensureBuildQueueContinuationTriggerV4_();
  return runBuildQueueSliceCoreV4_(project.projectId, {
    source: 'MANUAL_RECOVERY',
    budgetMs: GES_BUILD_QUEUE_V4.EXECUTION_BUDGET_MS
  });
}

function expandBuildQueueStateV4_(state) {
  var jobs = (state.j || []).map(function(job) {
    return {
      seq: job.q,
      jobId: job.id,
      kind: job.k,
      sourceDocId: job.d || '',
      assetType: job.a || '',
      status: job.s,
      attempts: Number(job.n || 0),
      startedAt: job.sd || '',
      completedAt: job.cd || '',
      message: job.m || '',
      resultCode: job.rc || '',
      heavy: isHeavyBuildQueueJobV468_(job)
    };
  });
  var counts = {};
  jobs.forEach(function(job) { counts[job.status] = Number(counts[job.status] || 0) + 1; });
  var completedJobs = Number(counts.DONE || 0) + Number(counts.SKIPPED || 0);
  var totalJobs = jobs.length;
  var cursor = Number(state.c || 0);
  return {
    success: state.st !== 'ERROR',
    exists: true,
    version: state.v,
    runId: state.r,
    projectId: state.p,
    projectName: state.pn,
    queueMode: normalizeBuildQueueModeV468_(state.m || 'BUILD_COMPLETE'),
    status: state.st,
    cursor: cursor,
    totalJobs: totalJobs,
    completedJobs: completedJobs,
    pendingJobs: Math.max(0, totalJobs - completedJobs),
    progressPercent: totalJobs ? Math.round((completedJobs / totalJobs) * 1000) / 10 : 100,
    currentJob: jobs[cursor] || null,
    heavyJobCount: jobs.filter(function(job) { return job.heavy; }).length,
    counts: counts,
    createdAt: state.cr,
    updatedAt: state.up,
    completedAt: state.co,
    lastError: state.er,
    source: state.src,
    jobs: jobs
  };
}

function truncateBuildQueueMessageV4_(value) {
  var s = safeString_(value);
  return s.length <= 500 ? s : s.substring(0, 499) + '…';
}

/* ========================================================================== *
 * Short lock + per-project worker lease
 * ========================================================================== */

function withBuildQueueStateLockV4_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(GES_BUILD_QUEUE_V4.LOCK_TIMEOUT_MS)) {
    throw new Error('BUILD_QUEUE_STATE_LOCK_TIMEOUT');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// Backward-compatible alias for older callers. It is intentionally only for
// short state mutations; do not wrap asset generation or Calendar sync in it.
function withBuildQueueLockV4_(fn) {
  return withBuildQueueStateLockV4_(fn);
}

function isBuildQueueLeaseActiveV4_(state) {
  if (!state) return false;
  return !!safeString_(state.lk) && Number(state.le || 0) > Date.now();
}

function claimBuildQueueLeaseV4_(projectId) {
  var token = 'worker_' + Utilities.getUuid();
  return withBuildQueueStateLockV4_(function() {
    var state = readBuildQueueStateV4_(projectId);
    if (!state) throw new Error('BUILD_QUEUE_NOT_FOUND');

    if (state.st === 'COMPLETE' || state.st === 'CANCELLED') {
      return { claimed: false, terminal: true, state: state, token: '' };
    }

    if (isBuildQueueLeaseActiveV4_(state)) {
      return { claimed: false, busy: true, state: state, token: '' };
    }

    state.lk = token;
    state.le = Date.now() + GES_BUILD_QUEUE_V4.WORKER_LEASE_MS;
    state.st = 'RUNNING';
    state.up = nowIso_();
    writeBuildQueueStateV4_(state);
    return { claimed: true, state: state, token: token };
  });
}

function persistBuildQueueOwnedStateV4_(state, token) {
  return withBuildQueueStateLockV4_(function() {
    var live = readBuildQueueStateV4_(state.p);
    if (!live) throw new Error('BUILD_QUEUE_NOT_FOUND');
    if (live.st === 'CANCELLED') throw new Error('BUILD_QUEUE_CANCELLED');
    if (safeString_(live.lk) !== safeString_(token)) {
      throw new Error('BUILD_QUEUE_LEASE_LOST');
    }

    state.lk = token;
    state.le = Date.now() + GES_BUILD_QUEUE_V4.WORKER_LEASE_MS;
    writeBuildQueueStateV4_(state);
    return state;
  });
}

function releaseBuildQueueLeaseV4_(state, token, nextStatus, errorMessage) {
  return withBuildQueueStateLockV4_(function() {
    var live = readBuildQueueStateV4_(state.p);
    if (!live) return null;

    // Respect an explicit cancel, or a newer worker that reclaimed an expired
    // lease. Never overwrite state that no longer belongs to this worker.
    if (live.st === 'CANCELLED') return live;
    if (safeString_(live.lk) && safeString_(live.lk) !== safeString_(token)) {
      return live;
    }

    state.st = nextStatus || state.st;
    state.er = safeString_(errorMessage || state.er || '');
    state.lk = '';
    state.le = 0;
    state.up = nowIso_();
    writeBuildQueueStateV4_(state);
    return state;
  });
}

/**
 * Diagnostic only. Use when the dashboard shows BUSY/RUNNING after a crashed
 * execution. It never touches Drive/Calendar assets.
 */
function inspectBuildQueueLeaseV4(projectId) {
  var project = buildQueueResolveProjectV4_(projectId || '');
  var state = readBuildQueueStateV4_(project.projectId);
  if (!state) {
    return { success: true, exists: false, projectId: project.projectId, status: 'IDLE' };
  }
  return {
    success: true,
    exists: true,
    projectId: project.projectId,
    status: state.st,
    leaseActive: isBuildQueueLeaseActiveV4_(state),
    leaseExpiresAtMs: Number(state.le || 0),
    cursor: Number(state.c || 0),
    totalJobs: (state.j || []).length,
    lastError: state.er || ''
  };
}

