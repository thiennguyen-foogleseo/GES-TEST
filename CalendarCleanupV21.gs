/**
 * GES V4 Calendar V2.1.1 legacy cleanup.
 *
 * Purpose
 * - remove remote Calendar series that belong to this GES project but are not
 *   part of the canonical 15-event Calendar V2.1.1 plan;
 * - preserve registry history by marking legacy rows ORPHANED and clearing the
 *   dead remote Event ID / Event HTML Link;
 * - never delete any canonical V2.1.1 event;
 * - never delete by summary/name guessing alone.
 *
 * Safety identity
 * A remote event is eligible only when at least one of these is true:
 * 1. it is referenced by a project-scoped Calendar Registry legacy row; or
 * 2. it has private extendedProperties.gesProjectId == projectId and a known
 *    legacy event key.
 */

const GES_CALENDAR_V21_CLEANUP = Object.freeze({
  VERSION: '2.1.1-g1',
  KNOWN_LEGACY_KEYS: Object.freeze([
    'PROJECT_HUB',
    'ROOT_FOLDER',
    'PDF_FOLDER',
    'IMAGES_FOLDER',
    'ENTITY_SHEET',
    'DOC_SOURCE',
    'SLIDES_FILE',
    'FORM',
    'DRAWING',
    'PDF_FILE',
    'DOCX_FILE',
    'HTML_FILE'
  ]),
  MAX_REMOTE_PAGES: 8,
  PAGE_SIZE: 250
});

function previewActiveCalendarV21LegacyCleanup() {
  return previewCalendarV21LegacyCleanup('');
}

function previewCalendarV21LegacyCleanup(projectId) {
  assertCalendarServiceAvailableV4_();
  var project = projectId ? getProject_(projectId) : getActiveProject_();
  if (!project) throw new Error('NO_ACTIVE_PROJECT');

  var rows = typeof getCalendarRegistryRowsV4 === 'function'
    ? (getCalendarRegistryRowsV4(project.projectId) || [])
    : [];

  var state = typeof collectProjectCalendarIdsV4_ === 'function'
    ? collectProjectCalendarIdsV4_(project, rows)
    : { ids: project.calendar && project.calendar.calendarId ? [project.calendar.calendarId] : [] };

  var blockers = [];
  if ((state.ids || []).length > 1) blockers.push('MULTIPLE_PROJECT_CALENDARS');
  var calendarId = (state.ids || []).length === 1 ? state.ids[0] : '';

  var canonicalKeys = {};
  (GES_CALENDAR_PLAN_SCHEMA_V4.EVENT_ROLES || []).forEach(function(key) {
    canonicalKeys[safeString_(key).toUpperCase()] = true;
  });
  var knownLegacy = {};
  GES_CALENDAR_V21_CLEANUP.KNOWN_LEGACY_KEYS.forEach(function(key) { knownLegacy[key] = true; });

  var canonicalEventIds = {};
  rows.forEach(function(row) {
    var key = safeString_(row.eventKey).toUpperCase();
    var id = safeString_(row.eventId).trim();
    if (canonicalKeys[key] && id) canonicalEventIds[id] = key;
  });

  var remoteManaged = calendarV211ListManagedRemoteEvents_(calendarId, project.projectId);
  remoteManaged.forEach(function(remote) {
    var p = calendarV211RemotePrivate_(remote);
    var key = safeString_(p.gesEventKey).toUpperCase();
    if (canonicalKeys[key] && remote.id) canonicalEventIds[remote.id] = key;
  });

  var candidateByEventId = {};
  var reviewRequired = [];
  var registryLegacyRows = [];

  rows.forEach(function(row) {
    var key = safeString_(row.eventKey).toUpperCase();
    if (canonicalKeys[key]) return;

    if (!knownLegacy[key]) {
      reviewRequired.push({
        type: 'UNKNOWN_NON_CANONICAL_REGISTRY_KEY',
        eventKey: key,
        eventId: safeString_(row.eventId),
        status: safeString_(row.status),
        templateId: safeString_(row.templateId)
      });
      return;
    }

    registryLegacyRows.push({
      eventKey: key,
      eventId: safeString_(row.eventId),
      status: safeString_(row.status),
      eventSummary: safeString_(row.eventSummary),
      templateId: safeString_(row.templateId),
      assetId: safeString_(row.assetId)
    });

    var eventId = safeString_(row.eventId).trim();
    if (!eventId) return;
    if (canonicalEventIds[eventId]) {
      blockers.push('LEGACY_EVENT_ID_COLLIDES_WITH_CANONICAL:' + key + ':' + canonicalEventIds[eventId]);
      return;
    }
    calendarV211MergeCleanupCandidate_(candidateByEventId, {
      eventId: eventId,
      eventKey: key,
      source: 'REGISTRY',
      eventSummary: safeString_(row.eventSummary),
      registryEventKeys: [key]
    });
  });

  remoteManaged.forEach(function(remote) {
    var p = calendarV211RemotePrivate_(remote);
    var key = safeString_(p.gesEventKey).toUpperCase();
    if (!key || canonicalKeys[key]) return;
    if (!knownLegacy[key]) {
      reviewRequired.push({
        type: 'UNKNOWN_NON_CANONICAL_REMOTE_KEY',
        eventKey: key,
        eventId: safeString_(remote.id),
        eventSummary: safeString_(remote.summary)
      });
      return;
    }
    if (canonicalEventIds[remote.id]) {
      blockers.push('REMOTE_LEGACY_ID_COLLIDES_WITH_CANONICAL:' + key + ':' + canonicalEventIds[remote.id]);
      return;
    }
    calendarV211MergeCleanupCandidate_(candidateByEventId, {
      eventId: safeString_(remote.id),
      eventKey: key,
      source: 'REMOTE_EXTENDED_PROPERTIES',
      eventSummary: safeString_(remote.summary),
      htmlLink: safeString_(remote.htmlLink),
      registryEventKeys: []
    });
  });

  var deleteCandidates = Object.keys(candidateByEventId).map(function(id) {
    var item = candidateByEventId[id];
    var remote = calendarV211GetRemoteEventOrNull_(calendarId, id);
    item.remoteExists = !!remote;
    item.remoteSummary = remote ? safeString_(remote.summary) : safeString_(item.eventSummary);
    item.remoteHtmlLink = remote ? safeString_(remote.htmlLink) : safeString_(item.htmlLink);
    return item;
  });

  var registryHistoryOnly = registryLegacyRows.filter(function(row) {
    return !safeString_(row.eventId).trim();
  });

  blockers = calendarV211UniqueStrings_(blockers);
  var result = {
    success: blockers.length === 0,
    previewOnly: true,
    version: GES_CALENDAR_V21_CLEANUP.VERSION,
    projectId: project.projectId,
    projectName: project.projectName,
    calendarId: calendarId,
    canonicalEventCount: Object.keys(canonicalKeys).length,
    registryRowCount: rows.length,
    registryLegacyRowCount: registryLegacyRows.length,
    remoteManagedCount: remoteManaged.length,
    deleteCandidateCount: deleteCandidates.filter(function(x) { return x.remoteExists; }).length,
    alreadyMissingRemoteCount: deleteCandidates.filter(function(x) { return !x.remoteExists; }).length,
    reviewRequiredCount: reviewRequired.length,
    deleteCandidates: deleteCandidates,
    registryHistoryOnly: registryHistoryOnly,
    reviewRequired: reviewRequired,
    blockers: blockers,
    destructiveActions: deleteCandidates.filter(function(x) { return x.remoteExists; }).map(function(x) {
      return { action: 'DELETE_REMOTE_LEGACY_CALENDAR_EVENT', eventId: x.eventId, eventKeys: x.eventKeys.slice() };
    }),
    canonicalKeys: Object.keys(canonicalKeys),
    note: 'Apply removes only known legacy remote series. Registry history is preserved as ORPHANED.'
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function applyActiveCalendarV21LegacyCleanup() {
  return applyCalendarV21LegacyCleanup('');
}

function applyCalendarV21LegacyCleanup(projectId) {
  assertCalendarServiceAvailableV4_();
  var project = projectId ? getProject_(projectId) : getActiveProject_();
  if (!project) throw new Error('NO_ACTIVE_PROJECT');
  assertProjectWritable_(project);
  if (typeof assertCalendarV2MigrationReadyV4_ === 'function') {
    assertCalendarV2MigrationReadyV4_(project.projectId);
  }

  var preview = previewCalendarV21LegacyCleanup(project.projectId);
  if (preview.blockers.length) {
    throw new Error('CALENDAR_V21_CLEANUP_BLOCKED: ' + preview.blockers.join(','));
  }

  var lock = LockService.getUserLock();
  if (!lock.tryLock(30000)) throw new Error('CALENDAR_V21_CLEANUP_LOCK_TIMEOUT');
  try {
    // Re-preview under lock so a changed Calendar/Registry cannot reuse a stale plan.
    preview = previewCalendarV21LegacyCleanup(project.projectId);
    if (preview.blockers.length) throw new Error('CALENDAR_V21_CLEANUP_BLOCKED_AFTER_LOCK: ' + preview.blockers.join(','));

    var now = nowIso_();
    var results = [];

    preview.deleteCandidates.forEach(function(item) {
      var deleted = false;
      var alreadyMissing = !item.remoteExists;
      if (item.remoteExists && preview.calendarId) {
        try {
          Calendar.Events.remove(preview.calendarId, item.eventId, { sendUpdates: 'none' });
          deleted = true;
        } catch (e) {
          if (calendarV211LooksNotFound_(e)) alreadyMissing = true;
          else throw e;
        }
      }

      var historyKeys = (item.eventKeys || []).slice();
      if (!historyKeys.length) historyKeys = (item.registryEventKeys || []).slice();
      historyKeys = calendarV211UniqueStrings_(historyKeys);
      historyKeys.forEach(function(eventKey) {
        var existing = null;
        try { existing = getCalendarRegistryRecordV4(project.projectId, eventKey); } catch (ignoreExisting) {}
        var oldId = safeString_((existing && existing.eventId) || item.eventId);
        var oldNotes = safeString_(existing && existing.notes);
        var marker = 'LEGACY_REMOTE_REMOVED_V21 eventId=' + oldId + ' removedAt=' + now;
        var notes = oldNotes ? (oldNotes + ' | ' + marker) : marker;
        patchCalendarRegistryRecordV4(project.projectId, eventKey, {
          calendarId: preview.calendarId,
          eventId: '',
          eventHtmlLink: '',
          status: 'ORPHANED',
          resolutionMethod: 'CALENDAR_V21_LEGACY_REMOTE_REMOVED',
          lastSeen: now,
          lastSynced: now,
          lastError: '',
          notes: notes
        }, { createIfMissing: true });
      });

      // Preserve history for a remote-only managed legacy event.
      if (!historyKeys.length && item.eventKeys && item.eventKeys.length) {
        item.eventKeys.forEach(function(eventKey) {
          upsertCalendarRegistryRecordV4(project.projectId, {
            eventKey: eventKey,
            calendarId: preview.calendarId,
            eventId: '',
            eventHtmlLink: '',
            eventSummary: safeString_(item.remoteSummary),
            status: 'ORPHANED',
            resolutionMethod: 'CALENDAR_V21_REMOTE_ONLY_LEGACY_REMOVED',
            firstSeen: now,
            lastSeen: now,
            lastSynced: now,
            notes: 'LEGACY_REMOTE_REMOVED_V21 eventId=' + item.eventId + ' removedAt=' + now
          });
        });
      }

      results.push({
        eventId: item.eventId,
        eventKeys: item.eventKeys,
        action: deleted ? 'DELETE_REMOTE_LEGACY_EVENT' : (alreadyMissing ? 'REMOTE_ALREADY_MISSING' : 'NO_REMOTE_ACTION'),
        success: true
      });
    });

    // Legacy rows without a remote Event ID remain history-only ORPHANED rows.
    preview.registryHistoryOnly.forEach(function(item) {
      try {
        patchCalendarRegistryRecordV4(project.projectId, item.eventKey, {
          status: 'ORPHANED',
          resolutionMethod: 'CALENDAR_V21_LEGACY_HISTORY_ONLY',
          lastSeen: now,
          notes: calendarV211AppendNote_(item.notes, 'LEGACY_HISTORY_ONLY_V21')
        }, { createIfMissing: false });
      } catch (ignoreHistoryOnly) {}
    });

    var projection = null;
    try {
      if (typeof rebuildActiveCalendarV2PublicProjectionV45 === 'function') {
        projection = rebuildActiveCalendarV2PublicProjectionV45();
      } else if (typeof finalizeCalendarV2PublicProjectionV45_ === 'function' && preview.calendarId) {
        projection = finalizeCalendarV2PublicProjectionV45_(project, preview.calendarId);
      }
    } catch (projectionError) {
      projection = { success: false, error: safeString_(projectionError && projectionError.message || projectionError) };
    }

    var audit = auditCalendarRegistryV4(project.projectId);
    var result = {
      success: results.every(function(r) { return r.success !== false; }) && audit.success,
      version: GES_CALENDAR_V21_CLEANUP.VERSION,
      projectId: project.projectId,
      projectName: project.projectName,
      calendarId: preview.calendarId,
      deletedRemoteCount: results.filter(function(r) { return r.action === 'DELETE_REMOTE_LEGACY_EVENT'; }).length,
      alreadyMissingRemoteCount: results.filter(function(r) { return r.action === 'REMOTE_ALREADY_MISSING'; }).length,
      preservedRegistryHistory: true,
      results: results,
      registryAudit: audit,
      publicProjection: projection,
      nextAction: 'RUN_SYNC_CALENDAR_V2_1_1'
    };
    console.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    lock.releaseLock();
  }
}

function calendarV211ListManagedRemoteEvents_(calendarId, projectId) {
  if (!calendarId) return [];
  var items = [];
  var pageToken = '';
  var pages = 0;
  do {
    var options = {
      maxResults: GES_CALENDAR_V21_CLEANUP.PAGE_SIZE,
      showDeleted: false,
      singleEvents: false,
      privateExtendedProperty: 'gesProjectId=' + projectId
    };
    if (pageToken) options.pageToken = pageToken;
    var response = Calendar.Events.list(calendarId, options);
    (response && response.items || []).forEach(function(item) { items.push(item); });
    pageToken = safeString_(response && response.nextPageToken);
    pages++;
  } while (pageToken && pages < GES_CALENDAR_V21_CLEANUP.MAX_REMOTE_PAGES);
  return items;
}

function calendarV211RemotePrivate_(remote) {
  return remote && remote.extendedProperties && remote.extendedProperties.private
    ? remote.extendedProperties.private
    : {};
}

function calendarV211GetRemoteEventOrNull_(calendarId, eventId) {
  if (!calendarId || !eventId) return null;
  try { return Calendar.Events.get(calendarId, eventId); }
  catch (e) {
    if (calendarV211LooksNotFound_(e)) return null;
    throw e;
  }
}

function calendarV211LooksNotFound_(error) {
  if (typeof calendarAssetLooksNotFoundV4_ === 'function') return calendarAssetLooksNotFoundV4_(error);
  var text = safeString_(error && error.message || error).toLowerCase();
  return text.indexOf('not found') !== -1 || text.indexOf('404') !== -1 || text.indexOf('410') !== -1;
}

function calendarV211MergeCleanupCandidate_(map, incoming) {
  var id = safeString_(incoming && incoming.eventId).trim();
  if (!id) return;
  if (!map[id]) {
    map[id] = {
      eventId: id,
      eventKeys: [],
      sources: [],
      registryEventKeys: [],
      eventSummary: '',
      htmlLink: ''
    };
  }
  var out = map[id];
  var key = safeString_(incoming.eventKey).toUpperCase();
  if (key && out.eventKeys.indexOf(key) === -1) out.eventKeys.push(key);
  var source = safeString_(incoming.source);
  if (source && out.sources.indexOf(source) === -1) out.sources.push(source);
  (incoming.registryEventKeys || []).forEach(function(k) {
    k = safeString_(k).toUpperCase();
    if (k && out.registryEventKeys.indexOf(k) === -1) out.registryEventKeys.push(k);
  });
  out.eventSummary = out.eventSummary || safeString_(incoming.eventSummary);
  out.htmlLink = out.htmlLink || safeString_(incoming.htmlLink);
}

function calendarV211UniqueStrings_(values) {
  var seen = {};
  var out = [];
  (values || []).forEach(function(value) {
    var key = safeString_(value);
    if (!key || seen[key]) return;
    seen[key] = true;
    out.push(key);
  });
  return out;
}

function calendarV211AppendNote_(existing, addition) {
  var a = safeString_(existing).trim();
  var b = safeString_(addition).trim();
  if (!a) return b;
  if (!b || a.indexOf(b) !== -1) return a;
  return a + ' | ' + b;
}
