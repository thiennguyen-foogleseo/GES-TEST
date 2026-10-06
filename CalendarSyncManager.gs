/**
 * GES V4 Calendar Sync Manager
 * -----------------------------------------------------------------------------
 * Reconciles Calendar Plan -> Google Calendar -> Calendar Events registry.
 *
 * Rules
 * - READY + no remote event        => CREATE
 * - READY + same fingerprint       => SKIP / CURRENT
 * - READY + changed fingerprint    => PATCH SAME EVENT ID
 * - DEFERRED + no remote event     => DEFERRED registry row
 * - non-ready + remote event       => ORPHANED (never auto-delete)
 * - registry event not in plan     => ORPHANED (never auto-delete)
 * - duplicate remote identity      => CONFLICT / stop that event
 *
 * No function in this module deletes Calendars or Events.
 */

const GES_CALENDAR_SYNC_V4 = Object.freeze({
  VERSION: '2.2.0-calendar-v2-unified-public-assets',
  LOCK_TIMEOUT_MS: 30000,
  DEFAULT_TIME_BUDGET_MS: 240000,
  CONTINUATION_DELAY_MS: 30000,
  QUEUE_PROPERTY: 'GES_CALENDAR_SYNC_QUEUE_V4',
  CONTINUATION_HANDLER: 'resumeQueuedCalendarSyncV4'
});

/* ========================================================================== *
 * Public API
 * ========================================================================== */

function syncProjectCalendarV4(projectId) {
  return withCalendarSyncUserLockV4_(function() {
    return syncProjectCalendarCoreV4_(projectId || '', {});
  });
}

function syncActiveProjectCalendarV4() {
  return syncProjectCalendarV4('');
}

/**
 * Read-only preview of what Calendar Sync would do.
 */
function previewCalendarSyncV4(projectId) {
  assertCalendarServiceAvailableV4_();

  var plan = previewCalendarPlanV4(projectId || '');
  var project = getProject_(plan.projectId);
  if (!project) throw new Error('CALENDAR_PROJECT_NOT_FOUND');

  var rows = getCalendarRegistryRowsV4(project.projectId);
  var migrationState = typeof getCalendarV2MigrationStateV4 === 'function'
    ? getCalendarV2MigrationStateV4(project.projectId)
    : { required: false, status: 'NOT_INSTALLED' };
  if (migrationState.required) {
    var blocked = {
      success: false, blocked: true, reason: 'CALENDAR_V2_MIGRATION_REQUIRED',
      projectId: project.projectId, projectName: project.projectName,
      migration: migrationState,
      migrationPreview: typeof previewCalendarV2MigrationV4 === 'function' ? previewCalendarV2MigrationV4(project.projectId) : null,
      stats: { CALENDAR_V2_MIGRATION_REQUIRED: 1 }, actions: []
    };
    console.log(JSON.stringify(blocked, null, 2));
    return blocked;
  }
  var calendarState = collectProjectCalendarIdsV4_(project, rows);
  var calendarId = calendarState.ids.length === 1 ? calendarState.ids[0] : '';
  var actions = [];

  (plan.events || []).forEach(function(event) {
    var availability = event.availability && event.availability.status || 'MISSING_SOURCE';
    var existing = getCalendarRegistryRecordV4(project.projectId, event.eventKey);

    if (availability !== 'READY') {
      actions.push({
        eventKey: event.eventKey,
        availability: availability,
        action: existing && existing.eventId ? 'MARK_ORPHANED' : availability
      });
      return;
    }

    if (!calendarId) {
      actions.push({ eventKey: event.eventKey, availability: availability, action: 'CREATE_CALENDAR_THEN_EVENT' });
      return;
    }

    var remote = null;
    if (existing && existing.eventId) {
      remote = getRemoteCalendarEventOrNullV4_(calendarId, existing.eventId);
    }

    if (!remote) {
      var matches = findRemoteGesEventsV4_(calendarId, project.projectId, event.eventKey);
      if (matches.length > 1) {
        actions.push({ eventKey: event.eventKey, availability: availability, action: 'CONFLICT_REMOTE_DUPLICATE' });
        return;
      }
      remote = matches.length === 1 ? matches[0] : null;
    }

    if (!remote) {
      actions.push({ eventKey: event.eventKey, availability: availability, action: 'CREATE' });
      return;
    }

    var remoteFingerprint = getRemoteCalendarEventFingerprintV4_(remote);
    var attachmentLabelsCurrent = calendarRemoteAttachmentLabelsMatchPlanV4_(remote, event);
    actions.push({
      eventKey: event.eventKey,
      availability: availability,
      eventId: remote.id,
      attachmentLabelsCurrent: attachmentLabelsCurrent,
      action: remoteFingerprint === event.fingerprint && attachmentLabelsCurrent
        ? 'SKIP_CURRENT'
        : 'PATCH_SAME_EVENT_ID'
    });
  });

  var plannedKeys = {};
  (plan.events || []).forEach(function(event) { plannedKeys[event.eventKey] = true; });
  rows.forEach(function(row) {
    if (!plannedKeys[row.eventKey]) {
      actions.push({ eventKey: row.eventKey, eventId: row.eventId, action: 'MARK_ORPHANED_NOT_IN_PLAN' });
    }
  });

  var result = {
    success: calendarState.ids.length <= 1,
    projectId: project.projectId,
    projectName: project.projectName,
    calendarId: calendarId,
    calendarIdCandidates: calendarState.ids,
    planFingerprint: plan.fingerprint,
    stats: calendarSyncCountActionsV4_(actions),
    publicProjectionPreview: typeof previewCalendarUrlProjectionV45 === 'function'
      ? previewCalendarUrlProjectionV45(project.projectId)
      : null,
    actions: actions
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}

/** Read-only Calendar + Registry health summary. */
function inspectCalendarSyncStateV4(projectId) {
  var plan = previewCalendarPlanV4(projectId || '');
  var project = getProject_(plan.projectId);
  if (!project) throw new Error('CALENDAR_PROJECT_NOT_FOUND');

  var rows = getCalendarRegistryRowsV4(project.projectId);
  var state = collectProjectCalendarIdsV4_(project, rows);
  var audit = auditCalendarRegistryV4(project.projectId);

  return {
    success: state.ids.length <= 1 && audit.success,
    projectId: project.projectId,
    projectName: project.projectName,
    calendarIdCandidates: state.ids,
    calendarUrl: state.ids.length === 1 ? calendarAssetCalendarUrlV4_(state.ids[0]) : '',
    plan: {
      total: plan.stats.total,
      ready: plan.stats.ready,
      deferred: plan.stats.deferred,
      missingSource: plan.stats.missingSource,
      needsReview: plan.stats.needsReview,
      fingerprint: plan.fingerprint
    },
    registry: {
      total: rows.length,
      current: rows.filter(function(r) { return r.status === 'CURRENT'; }).length,
      outdated: rows.filter(function(r) { return r.status === 'OUTDATED'; }).length,
      deferred: rows.filter(function(r) { return r.status === 'DEFERRED'; }).length,
      orphaned: rows.filter(function(r) { return r.status === 'ORPHANED'; }).length,
      error: rows.filter(function(r) { return r.status === 'ERROR'; }).length,
      conflict: rows.filter(function(r) { return r.status === 'CONFLICT'; }).length,
      missing: rows.filter(function(r) { return r.status === 'MISSING'; }).length,
      needsReview: rows.filter(function(r) { return r.status === 'NEEDS_REVIEW'; }).length,
      audit: audit
    }
  };
}

/* ========================================================================== *
 * Core sync - intentionally no outer UserLock so BUILD COMPLETE GES can call it
 * inside its own orchestration without deadlocking.
 * ========================================================================== */

function syncProjectCalendarCoreV4_(projectId, options) {
  options = options || {};
  assertCalendarServiceAvailableV4_();

  var startedAtMs = Date.now();
  var timeBudgetMs = Number(options.timeBudgetMs || GES_CALENDAR_SYNC_V4.DEFAULT_TIME_BUDGET_MS);
  if (!isFinite(timeBudgetMs) || timeBudgetMs < 60000) timeBudgetMs = 60000;

  var plan = previewCalendarPlanV4(projectId || '');
  var validation = validateCalendarPlanV4(plan);
  if (!validation.valid) {
    throw new Error('CALENDAR_PLAN_INVALID: ' + validation.errors.join(', '));
  }

  var project = getProject_(plan.projectId);
  if (!project) throw new Error('CALENDAR_PROJECT_NOT_FOUND');
  assertProjectWritable_(project);
  if (typeof assertCalendarV2MigrationReadyV4_ === 'function') {
    assertCalendarV2MigrationReadyV4_(project.projectId);
  }

  var init = initializeCalendarRegistryV4(project.projectId);
  if (!init.success) throw new Error('CALENDAR_REGISTRY_INVALID');

  var preAudit = auditCalendarRegistryV4(project.projectId);
  if (!preAudit.success) {
    throw new Error('CALENDAR_REGISTRY_CONFLICT: ' + JSON.stringify(preAudit));
  }

  var calendarResolution = ensureProjectCalendarV4_(project, plan);
  var calendarId = calendarResolution.calendarId;
  ensureProjectCalendarPublicAclV4_(calendarId);
  syncCalendarMetadataV4_(calendarId, plan.calendar);

  project = persistProjectCalendarProfileV4_(project, plan, calendarId, {
    publicAccess: true,
    lastSyncStartedAt: nowIso_(),
    lastPlanFingerprint: plan.fingerprint,
    syncModuleVersion: GES_CALENDAR_SYNC_V4.VERSION,
    syncState: 'RUNNING'
  });

  // Read the registry ONCE. Existing CURRENT/DEFERRED rows can be skipped
  // without another Calendar API lookup. This is the main performance guard.
  var registryRowsAtStart = getCalendarRegistryRowsV4(project.projectId);
  var registryByEventKey = {};
  registryRowsAtStart.forEach(function(row) {
    registryByEventKey[safeString_(row.eventKey).toUpperCase()] = row;
  });

  var results = [];
  var plannedKeys = {};
  var continuationRequired = false;
  var remainingEventKeys = [];

  for (var i = 0; i < (plan.events || []).length; i++) {
    var plannedEvent = plan.events[i];
    plannedKeys[plannedEvent.eventKey] = true;

    var availability = plannedEvent.availability && plannedEvent.availability.status || 'MISSING_SOURCE';
    var existing = registryByEventKey[safeString_(plannedEvent.eventKey).toUpperCase()] || null;

    // Fast path: trust our own registry when the calendar/event identity and
    // fingerprint already match. Remote validation belongs to Audit/Repair.
    if (
      availability === 'READY' &&
      existing &&
      safeString_(existing.calendarId) === safeString_(calendarId) &&
      safeString_(existing.eventId) &&
      safeString_(existing.eventHtmlLink) &&
      safeString_(existing.status).toUpperCase() === 'CURRENT' &&
      safeString_(existing.fingerprint) === safeString_(plannedEvent.fingerprint)
    ) {
      results.push({
        eventKey: plannedEvent.eventKey,
        action: 'SKIP_CURRENT_FAST',
        success: true,
        eventId: existing.eventId,
        fingerprint: plannedEvent.fingerprint
      });
      continue;
    }

    var expectedNonReadyStatus = calendarSyncRegistryStatusForAvailabilityV4_(availability, !!(existing && existing.eventId));
    if (
      availability !== 'READY' &&
      existing &&
      safeString_(existing.calendarId) === safeString_(calendarId) &&
      !safeString_(existing.eventId) &&
      safeString_(existing.status).toUpperCase() === expectedNonReadyStatus &&
      safeString_(existing.fingerprint) === safeString_(plannedEvent.fingerprint)
    ) {
      results.push({
        eventKey: plannedEvent.eventKey,
        action: 'SKIP_' + expectedNonReadyStatus + '_FAST',
        success: true,
        availability: availability
      });
      continue;
    }

    // Never start another slow remote operation when the execution is close
    // to the Apps Script hard runtime limit. Resume in a later execution.
    if (calendarSyncShouldYieldV4_(startedAtMs, timeBudgetMs)) {
      continuationRequired = true;
      for (var rest = i; rest < plan.events.length; rest++) {
        remainingEventKeys.push(plan.events[rest].eventKey);
      }
      break;
    }

    try {
      if (availability !== 'READY') {
        results.push(syncNonReadyCalendarEventV4_(project, plan, plannedEvent, calendarId));
      } else {
        results.push(syncReadyCalendarEventV4_(project, plan, plannedEvent, calendarId));
      }
    } catch (e) {
      var message = safeString_(e && e.message || e);
      try {
        patchCalendarRegistryRecordV4(
          project.projectId,
          plannedEvent.eventKey,
          {
            calendarId: calendarId,
            status: /DUPLICATE|CONFLICT/i.test(message) ? 'CONFLICT' : 'ERROR',
            lastError: message,
            lastSeen: nowIso_(),
            notes: 'CALENDAR_SYNC_V4_' + GES_CALENDAR_SYNC_V4.VERSION
          },
          { createIfMissing: true }
        );
      } catch (registryError) {}

      results.push({
        eventKey: plannedEvent.eventKey,
        action: 'ERROR',
        success: false,
        error: message
      });
    }
  }

  // Only perform orphan reconciliation after the entire current plan has been
  // visited. Doing it on a partial run could misclassify rows.
  if (!continuationRequired) {
    var registryRows = getCalendarRegistryRowsV4(project.projectId);
    registryRows.forEach(function(row) {
      if (plannedKeys[row.eventKey]) return;
      try {
        markCalendarRegistryStatusV4(project.projectId, row.eventKey, 'ORPHANED', {
          lastSeen: nowIso_(),
          notes: 'EVENT_KEY_NOT_IN_CURRENT_PLAN'
        });
        results.push({
          eventKey: row.eventKey,
          action: 'MARK_ORPHANED_NOT_IN_PLAN',
          success: true,
          eventId: row.eventId
        });
      } catch (e) {
        results.push({
          eventKey: row.eventKey,
          action: 'ERROR_MARKING_ORPHANED',
          success: false,
          error: safeString_(e && e.message || e)
        });
      }
    });
  }

  var postAudit = auditCalendarRegistryV4(project.projectId);
  project = getProject_(project.projectId);
  project.calendar = Object.assign(project.calendar || {}, {
    lastSyncCompletedAt: continuationRequired ? safeString_(project.calendar && project.calendar.lastSyncCompletedAt) : nowIso_(),
    lastSyncYieldedAt: continuationRequired ? nowIso_() : '',
    lastPlanFingerprint: plan.fingerprint,
    lastSyncSuccess: results.every(function(r) { return r.success !== false; }),
    syncModuleVersion: GES_CALENDAR_SYNC_V4.VERSION,
    syncState: continuationRequired ? 'QUEUED' : 'COMPLETE',
    remainingEventKeys: continuationRequired ? remainingEventKeys : []
  });
  saveProject_(project);

  if (continuationRequired && options.autoQueue !== false) {
    queueCalendarSyncContinuationV4_(project.projectId, {
      source: safeString_(options.source || 'CALENDAR_SYNC'),
      planFingerprint: plan.fingerprint,
      remainingEventKeys: remainingEventKeys
    });
  } else if (!continuationRequired) {
    clearCalendarSyncContinuationV4_(project.projectId);
  }

  var report = {
    success: results.every(function(r) { return r.success !== false; }) && postAudit.success,
    complete: !continuationRequired,
    queued: continuationRequired,
    version: GES_CALENDAR_SYNC_V4.VERSION,
    projectId: project.projectId,
    projectName: project.projectName,
    calendarId: calendarId,
    calendarUrl: calendarAssetCalendarUrlV4_(calendarId),
    calendarCreated: calendarResolution.created,
    planFingerprint: plan.fingerprint,
    elapsedMs: Date.now() - startedAtMs,
    timeBudgetMs: timeBudgetMs,
    remainingEventKeys: remainingEventKeys,
    stats: calendarSyncCountActionsV4_(results),
    registryAudit: postAudit,
    results: results
  };

  // V4.5 end-to-end projection finalizer:
  // Calendar Events remain PRIVATE. After the entire sync completes, CURRENT
  // Calendar/Event URLs are reconciled into PRIVATE URL Variants and the unified
  // PUBLIC Assets tab is refreshed automatically. A partial continuation never
  // publishes an incomplete Calendar view.
  if (!continuationRequired) {
    try {
      if (typeof finalizeCalendarV2PublicProjectionV45_ === 'function') {
        report.publicProjection = finalizeCalendarV2PublicProjectionV45_(project, calendarId);
      } else {
        // Backward-compatible fallback for Patch C installations.
        var fallbackUrls = typeof syncCalendarEventUrlVariantsToRegistryV43_ === 'function'
          ? syncCalendarEventUrlVariantsToRegistryV43_(project, { calendarId: calendarId })
          : { success: false, skipped: true, code: 'CALENDAR_URL_PROJECTOR_NOT_AVAILABLE' };
        var fallbackSheet = typeof refreshProjectPublicSheetV43 === 'function'
          ? refreshProjectPublicSheetV43(project.projectId)
          : { success: false, skipped: true, code: 'PUBLIC_SHEET_MODULE_NOT_AVAILABLE' };
        report.publicProjection = {
          success: fallbackUrls.success !== false && fallbackSheet.success !== false,
          privateUrlVariants: fallbackUrls,
          publicSheet: fallbackSheet,
          validation: { success: true, valid: null, code: 'V45_VALIDATOR_NOT_AVAILABLE' }
        };
      }
    } catch (projectionError) {
      // Calendar Sync itself remains successful; projection failure is reported
      // separately so BuildQueue does not recreate Calendar events unnecessarily.
      report.publicProjection = {
        success: false,
        error: safeString_(projectionError && projectionError.message || projectionError)
      };
    }
  }
  console.log(JSON.stringify(report, null, 2));
  return report;
}

function calendarSyncRegistryStatusForAvailabilityV4_(availability, hasRemoteEvent) {
  if (hasRemoteEvent) return 'ORPHANED';
  if (availability === 'DEFERRED') return 'DEFERRED';
  if (availability === 'NEEDS_REVIEW') return 'NEEDS_REVIEW';
  return 'MISSING';
}

function calendarSyncShouldYieldV4_(startedAtMs, timeBudgetMs) {
  return (Date.now() - startedAtMs) >= timeBudgetMs;
}

/* ========================================================================== *
 * READY event reconciliation
 * ========================================================================== */

function syncReadyCalendarEventV4_(project, plan, plannedEvent, calendarId) {
  var registry = getCalendarRegistryRecordV4(project.projectId, plannedEvent.eventKey);

  if (registry && registry.calendarId && registry.calendarId !== calendarId) {
    throw new Error('CALENDAR_EVENT_CALENDAR_MISMATCH: ' + plannedEvent.eventKey);
  }

  var remote = null;
  var resolutionMethod = '';

  if (registry && registry.eventId) {
    remote = getRemoteCalendarEventOrNullV4_(calendarId, registry.eventId);
    if (remote) resolutionMethod = 'REGISTRY_EVENT_ID';
  }

  if (!remote) {
    var matches = findRemoteGesEventsV4_(calendarId, project.projectId, plannedEvent.eventKey);
    if (matches.length > 1) {
      throw new Error('CALENDAR_REMOTE_DUPLICATE_EVENT: ' + plannedEvent.eventKey + ' count=' + matches.length);
    }
    if (matches.length === 1) {
      remote = matches[0];
      resolutionMethod = 'REMOTE_EXTENDED_PROPERTIES';
    }
  }

  if (!remote) {
    var createdResult = createOrAdoptCalendarEventV4_(
      project, plan, plannedEvent, calendarId, { refuseOutdated: false }
    );
    createdResult.success = true;
    return createdResult;
  }

  assertRemoteCalendarEventIdentityV4_(remote, project.projectId, plannedEvent.eventKey);
  var remoteFingerprint = getRemoteCalendarEventFingerprintV4_(remote);
  var attachmentLabelsCurrent = calendarRemoteAttachmentLabelsMatchPlanV4_(remote, plannedEvent);

  if (remoteFingerprint === plannedEvent.fingerprint && attachmentLabelsCurrent) {
    writeCalendarRegistryFromRemoteV4_(
      project, plan, plannedEvent, calendarId, remote,
      resolutionMethod || 'REMOTE_CURRENT', 'CURRENT', ''
    );
    return {
      eventKey: plannedEvent.eventKey,
      action: 'SKIP_CURRENT',
      success: true,
      eventId: remote.id,
      fingerprint: plannedEvent.fingerprint,
      attachmentLabelsCurrent: true
    };
  }

  var patch = buildCalendarEventPatchV4_(project, plan, plannedEvent, remote);
  var updated = Calendar.Events.patch(
    patch,
    calendarId,
    remote.id,
    {
      sendUpdates: 'none',
      supportsAttachments: true
    }
  );

  if (!updated || !updated.id) {
    throw new Error('CALENDAR_EVENT_PATCH_FAILED: ' + plannedEvent.eventKey);
  }

  writeCalendarRegistryFromRemoteV4_(
    project, plan, plannedEvent, calendarId, updated,
    'CALENDAR_API_PATCH_SAME_EVENT_ID', 'CURRENT', ''
  );

  return {
    eventKey: plannedEvent.eventKey,
    action: 'UPDATE_SAME_EVENT_ID',
    success: true,
    eventId: updated.id,
    previousFingerprint: remoteFingerprint,
    fingerprint: plannedEvent.fingerprint,
    attachmentLabelsChanged: !attachmentLabelsCurrent
  };
}

/* ========================================================================== *
 * DEFERRED / missing / review handling
 * ========================================================================== */

function syncNonReadyCalendarEventV4_(project, plan, plannedEvent, calendarId) {
  var registry = getCalendarRegistryRecordV4(project.projectId, plannedEvent.eventKey);
  var remote = null;

  if (registry && registry.eventId) {
    remote = getRemoteCalendarEventOrNullV4_(calendarId, registry.eventId);
  }

  if (!remote) {
    var matches = findRemoteGesEventsV4_(calendarId, project.projectId, plannedEvent.eventKey);
    if (matches.length > 1) {
      throw new Error('CALENDAR_REMOTE_DUPLICATE_EVENT: ' + plannedEvent.eventKey + ' count=' + matches.length);
    }
    remote = matches.length === 1 ? matches[0] : null;
  }

  var availability = plannedEvent.availability && plannedEvent.availability.status || 'MISSING_SOURCE';
  var desiredStatus;
  if (remote) desiredStatus = 'ORPHANED';
  else if (availability === 'DEFERRED') desiredStatus = 'DEFERRED';
  else if (availability === 'NEEDS_REVIEW') desiredStatus = 'NEEDS_REVIEW';
  else desiredStatus = 'MISSING';

  var record = buildCalendarRegistryRecordFromPlanEventV4_(
    project,
    plan,
    plannedEvent,
    {
      calendarId: calendarId,
      id: remote && remote.id,
      iCalUID: remote && remote.iCalUID,
      htmlLink: remote && remote.htmlLink,
      updated: remote && remote.updated,
      etag: remote && remote.etag,
      startDate: calendarAssetRemoteStartLabelV4_(remote),
      status: desiredStatus,
      resolutionMethod: remote ? 'REMOTE_EXISTS_SOURCE_NOT_READY' : 'PLAN_ONLY',
      lastError: '',
      notes: 'AVAILABILITY_' + availability
    }
  );
  upsertCalendarRegistryRecordV4(project.projectId, record);

  return {
    eventKey: plannedEvent.eventKey,
    action: remote ? 'MARK_ORPHANED' : desiredStatus,
    success: true,
    eventId: remote ? remote.id : '',
    availability: availability
  };
}

/* ========================================================================== *
 * Calendar metadata
 * ========================================================================== */

function syncCalendarMetadataV4_(calendarId, plannedCalendar) {
  var remote = getRemoteCalendarOrNullV4_(calendarId);
  if (!remote) throw new Error('CALENDAR_NOT_FOUND: ' + calendarId);

  var desired = {
    summary: safeString_(plannedCalendar.summary),
    description: safeString_(plannedCalendar.description),
    location: safeString_(plannedCalendar.location && plannedCalendar.location.locationText),
    timeZone: safeString_(plannedCalendar.timezone)
  };

  var changed =
    safeString_(remote.summary) !== desired.summary ||
    safeString_(remote.description) !== desired.description ||
    safeString_(remote.location) !== desired.location ||
    safeString_(remote.timeZone) !== desired.timeZone;

  if (!changed) return { changed: false, calendar: remote };
  var updated = Calendar.Calendars.update(desired, calendarId);
  return { changed: true, calendar: updated };
}

/* ========================================================================== *
 * Helpers
 * ========================================================================== */

function calendarSyncCountActionsV4_(items) {
  var counts = {};
  (items || []).forEach(function(item) {
    var key = safeString_(item.action || 'UNKNOWN');
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

/* ========================================================================== *
 * Resumable continuation queue
 * ========================================================================== */

function getCalendarSyncContinuationStateV4(projectId) {
  var project = projectId ? getProject_(projectId) : getActiveProject_();
  if (!project) throw new Error('CALENDAR_PROJECT_NOT_FOUND');
  var queue = readCalendarSyncQueueV4_();
  return {
    projectId: project.projectId,
    queued: !!queue[project.projectId],
    state: queue[project.projectId] || null
  };
}

function cancelCalendarSyncContinuationV4(projectId) {
  var project = projectId ? getProject_(projectId) : getActiveProject_();
  if (!project) throw new Error('CALENDAR_PROJECT_NOT_FOUND');
  clearCalendarSyncContinuationV4_(project.projectId);
  return { success: true, projectId: project.projectId, queued: false };
}

function queueCalendarSyncContinuationV4_(projectId, metadata) {
  var queue = readCalendarSyncQueueV4_();
  queue[projectId] = Object.assign({}, queue[projectId] || {}, metadata || {}, {
    projectId: projectId,
    queuedAt: nowIso_(),
    attempts: Number(queue[projectId] && queue[projectId].attempts || 0)
  });
  writeCalendarSyncQueueV4_(queue);
  ensureCalendarSyncContinuationTriggerV4_();
}

function clearCalendarSyncContinuationV4_(projectId) {
  var queue = readCalendarSyncQueueV4_();
  if (queue[projectId]) {
    delete queue[projectId];
    writeCalendarSyncQueueV4_(queue);
  }
}

function resumeQueuedCalendarSyncV4() {
  var queue = readCalendarSyncQueueV4_();
  var ids = Object.keys(queue);
  if (!ids.length) return { success: true, complete: true, queuedProjects: 0 };

  ids.sort(function(a, b) {
    return safeString_(queue[a].queuedAt).localeCompare(safeString_(queue[b].queuedAt));
  });

  var projectId = ids[0];
  var item = queue[projectId] || {};
  item.attempts = Number(item.attempts || 0) + 1;
  item.lastAttemptAt = nowIso_();
  queue[projectId] = item;
  writeCalendarSyncQueueV4_(queue);

  var result;
  try {
    result = withCalendarSyncUserLockV4_(function() {
      return syncProjectCalendarCoreV4_(projectId, {
        source: 'TIME_DRIVEN_CONTINUATION',
        timeBudgetMs: GES_CALENDAR_SYNC_V4.DEFAULT_TIME_BUDGET_MS,
        autoQueue: true
      });
    });
  } catch (e) {
    item.lastError = safeString_(e && e.message || e);
    item.lastAttemptAt = nowIso_();
    queue = readCalendarSyncQueueV4_();
    queue[projectId] = Object.assign({}, queue[projectId] || {}, item);
    writeCalendarSyncQueueV4_(queue);
    ensureCalendarSyncContinuationTriggerV4_();
    throw e;
  }

  if (result && result.complete) clearCalendarSyncContinuationV4_(projectId);
  else ensureCalendarSyncContinuationTriggerV4_();

  // If another project is queued, schedule another continuation.
  if (Object.keys(readCalendarSyncQueueV4_()).length) ensureCalendarSyncContinuationTriggerV4_();
  return result;
}

function readCalendarSyncQueueV4_() {
  var raw = PropertiesService.getScriptProperties().getProperty(GES_CALENDAR_SYNC_V4.QUEUE_PROPERTY);
  if (!raw) return {};
  try {
    var parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

function writeCalendarSyncQueueV4_(queue) {
  PropertiesService.getScriptProperties().setProperty(
    GES_CALENDAR_SYNC_V4.QUEUE_PROPERTY,
    JSON.stringify(queue || {})
  );
}

function ensureCalendarSyncContinuationTriggerV4_() {
  var handler = GES_CALENDAR_SYNC_V4.CONTINUATION_HANDLER;
  var exists = ScriptApp.getProjectTriggers().some(function(trigger) {
    return trigger.getHandlerFunction() === handler;
  });
  if (exists) return;
  ScriptApp.newTrigger(handler)
    .timeBased()
    .after(GES_CALENDAR_SYNC_V4.CONTINUATION_DELAY_MS)
    .create();
}

function withCalendarSyncUserLockV4_(fn) {
  var lock = LockService.getUserLock();
  if (!lock.tryLock(GES_CALENDAR_SYNC_V4.LOCK_TIMEOUT_MS)) {
    throw new Error('CALENDAR_SYNC_LOCK_TIMEOUT');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
