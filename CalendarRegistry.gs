/**
 * GES V4 Calendar Registry
 * -----------------------------------------------------------------------------
 * Stores Calendar series metadata in the per-project Asset Registry spreadsheet
 * under the tab: "Calendar Events".
 *
 * Identity / anti-duplicate contract
 * ----------------------------------
 * A logical Calendar series is UNIQUE by:
 *   projectId + eventKey
 *
 * - Upserts never use row number, event summary, or Calendar eventId as identity.
 * - Concurrent writes are protected by ScriptLock.
 * - Existing duplicate identities are treated as a CONFLICT and writes refuse to
 *   guess which row is canonical.
 * - A Calendar eventId cannot be mapped to two different eventKeys in the same
 *   project.
 *
 * This module DOES NOT create/update/delete Google Calendar events. It only
 * reads/writes the Calendar Events tab. CalendarAsset.gs will use this module.
 */

const GES_CALENDAR_REGISTRY_V4 = Object.freeze({
  VERSION: '2.0.0-calendar-v2',
  TAB_NAME: 'Calendar Events',

  STATUSES: Object.freeze([
    'PLANNED',
    'MISSING',
    'CURRENT',
    'OUTDATED',
    'DEFERRED',
    'ORPHANED',
    'CONFLICT',
    'NEEDS_REVIEW',
    'ERROR'
  ]),

  FIELDS: Object.freeze([
    Object.freeze({ key: 'key', header: 'Key' }),
    Object.freeze({ key: 'schemaVersion', header: 'Schema Version' }),
    Object.freeze({ key: 'projectId', header: 'Project ID' }),
    Object.freeze({ key: 'projectName', header: 'Project Name' }),
    Object.freeze({ key: 'calendarId', header: 'Calendar ID' }),
    Object.freeze({ key: 'calendarSummary', header: 'Calendar Summary' }),
    Object.freeze({ key: 'eventKey', header: 'Event Key' }),
    Object.freeze({ key: 'eventRole', header: 'Event Role' }),
    Object.freeze({ key: 'templateId', header: 'Template ID' }),
    Object.freeze({ key: 'planVersion', header: 'Plan Version' }),
    Object.freeze({ key: 'eventId', header: 'Event ID' }),
    Object.freeze({ key: 'iCalUid', header: 'iCal UID' }),
    Object.freeze({ key: 'eventHtmlLink', header: 'Event HTML Link' }),
    Object.freeze({ key: 'eventSummary', header: 'Event Summary' }),
    Object.freeze({ key: 'sourceKind', header: 'Source Kind' }),
    Object.freeze({ key: 'assetType', header: 'Asset Type' }),
    Object.freeze({ key: 'assetId', header: 'Asset ID' }),
    Object.freeze({ key: 'assetUrl', header: 'Asset URL' }),
    Object.freeze({ key: 'recurrenceRule', header: 'Recurrence Rule' }),
    Object.freeze({ key: 'byDay', header: 'By Day' }),
    Object.freeze({ key: 'allDay', header: 'All Day' }),
    Object.freeze({ key: 'startDate', header: 'Start Date' }),
    Object.freeze({ key: 'startTime', header: 'Start Time' }),
    Object.freeze({ key: 'durationMinutes', header: 'Duration Minutes' }),
    Object.freeze({ key: 'visibility', header: 'Visibility' }),
    Object.freeze({ key: 'transparency', header: 'Transparency' }),
    Object.freeze({ key: 'location', header: 'Location' }),
    Object.freeze({ key: 'attachmentCount', header: 'Attachment Count' }),
    Object.freeze({ key: 'urlRefCount', header: 'URL Ref Count' }),
    Object.freeze({ key: 'fingerprint', header: 'Fingerprint' }),
    Object.freeze({ key: 'status', header: 'Status' }),
    Object.freeze({ key: 'resolutionMethod', header: 'Resolution Method' }),
    Object.freeze({ key: 'firstSeen', header: 'First Seen' }),
    Object.freeze({ key: 'lastSeen', header: 'Last Seen' }),
    Object.freeze({ key: 'lastSynced', header: 'Last Synced' }),
    Object.freeze({ key: 'eventUpdatedAt', header: 'Event Updated At' }),
    Object.freeze({ key: 'etag', header: 'ETag' }),
    Object.freeze({ key: 'lastSeenRunId', header: 'Last Seen Run ID' }),
    Object.freeze({ key: 'lastError', header: 'Last Error' }),
    Object.freeze({ key: 'notes', header: 'Notes' })
  ])
});

/* ========================================================================== *
 * Public API
 * ========================================================================== */

/**
 * Public: return the Calendar Registry schema contract.
 */
function getCalendarRegistrySchemaV4() {
  return {
    version: GES_CALENDAR_REGISTRY_V4.VERSION,
    tabName: GES_CALENDAR_REGISTRY_V4.TAB_NAME,
    statuses: GES_CALENDAR_REGISTRY_V4.STATUSES.slice(),
    headers: GES_CALENDAR_REGISTRY_V4.FIELDS.map(function(field) {
      return field.header;
    }),
    identity: ['Project ID', 'Event Key']
  };
}

/**
 * Public: explicitly create/upgrade the Calendar Events tab for a project.
 * Does not touch Google Calendar.
 */
function initializeCalendarRegistryV4(projectId) {
  var project = resolveCalendarRegistryProjectV4_(projectId || '');
  return withCalendarRegistryLockV4_(function() {
    var sheet = ensureCalendarRegistrySheetV4_(project);
    var audit = auditCalendarRegistrySheetV4_(sheet, project.projectId);
    return {
      success: audit.duplicateIdentityCount === 0,
      projectId: project.projectId,
      projectName: project.projectName,
      registrySheetId: project.registrySheetId,
      tabName: sheet.getName(),
      schemaVersion: GES_CALENDAR_REGISTRY_V4.VERSION,
      rowCount: audit.rowCount,
      duplicateIdentityCount: audit.duplicateIdentityCount,
      eventIdCollisionCount: audit.eventIdCollisionCount,
      issues: audit.issues
    };
  });
}

/**
 * Public: read all Calendar Registry rows for one project.
 * Read-only. Returns [] if the tab does not exist yet.
 */
function getCalendarRegistryRowsV4(projectId) {
  var project = resolveCalendarRegistryProjectV4_(projectId || '');
  var sheet = getCalendarRegistrySheetV4_(project, false);
  if (!sheet) return [];
  return readCalendarRegistryRecordsV4_(sheet).filter(function(record) {
    return record.projectId === project.projectId;
  });
}

/**
 * Public: read exactly one logical Calendar event by projectId + eventKey.
 * Throws if the registry already contains duplicates for this identity.
 */
function getCalendarRegistryRecordV4(projectId, eventKey) {
  var project = resolveCalendarRegistryProjectV4_(projectId || '');
  var normalizedEventKey = normalizeCalendarEventKeyV4_(eventKey);
  var sheet = getCalendarRegistrySheetV4_(project, false);
  if (!sheet) return null;

  var index = buildCalendarRegistryIndexV4_(sheet);
  var identity = calendarRegistryIdentityV4_(project.projectId, normalizedEventKey);
  var rows = index.rowsByIdentity[identity] || [];

  if (rows.length > 1) {
    throw new Error('CALENDAR_REGISTRY_DUPLICATE_IDENTITY: ' + identity + ' @ rows ' + rows.join(','));
  }
  if (!rows.length) return null;
  return readCalendarRegistryRecordAtRowV4_(sheet, rows[0]);
}

/** Public: read project Calendar Registry rows filtered by status. */
function findCalendarRegistryRowsByStatusV4(projectId, status) {
  var wanted = normalizeCalendarRegistryStatusV4_(status, true);
  return getCalendarRegistryRowsV4(projectId).filter(function(record) {
    return record.status === wanted;
  });
}

/**
 * Public: insert or update one Calendar Registry record.
 * Identity is ALWAYS projectId + eventKey.
 */
function upsertCalendarRegistryRecordV4(projectId, record) {
  var project = resolveCalendarRegistryProjectV4_(projectId || '');
  return withCalendarRegistryLockV4_(function() {
    var sheet = ensureCalendarRegistrySheetV4_(project);
    return upsertCalendarRegistryRecordUnlockedV4_(sheet, project, record || {});
  });
}

/**
 * Public: batch upsert. The whole batch is protected by one ScriptLock.
 * Duplicate eventKeys inside the input batch are rejected before writing.
 */
function upsertCalendarRegistryRecordsV4(projectId, records) {
  var project = resolveCalendarRegistryProjectV4_(projectId || '');
  var input = Array.isArray(records) ? records : [];
  assertCalendarRegistryInputBatchUniqueV4_(project.projectId, input);

  return withCalendarRegistryLockV4_(function() {
    var sheet = ensureCalendarRegistrySheetV4_(project);
    var audit = auditCalendarRegistrySheetV4_(sheet, project.projectId);
    if (audit.duplicateIdentityCount > 0) {
      throw new Error(
        'CALENDAR_REGISTRY_HAS_DUPLICATES: repair conflicts before batch write. ' +
        JSON.stringify(audit.duplicateIdentities)
      );
    }

    var results = input.map(function(record) {
      return upsertCalendarRegistryRecordUnlockedV4_(sheet, project, record || {});
    });

    return {
      success: true,
      projectId: project.projectId,
      count: results.length,
      created: results.filter(function(r) { return r.action === 'CREATE'; }).length,
      updated: results.filter(function(r) { return r.action === 'UPDATE'; }).length,
      results: results
    };
  });
}

/**
 * Public: patch an existing logical event. Creates a row only when
 * options.createIfMissing === true.
 */
function patchCalendarRegistryRecordV4(projectId, eventKey, patch, options) {
  options = options || {};
  var project = resolveCalendarRegistryProjectV4_(projectId || '');
  var normalizedEventKey = normalizeCalendarEventKeyV4_(eventKey);

  return withCalendarRegistryLockV4_(function() {
    var sheet = options.createIfMissing
      ? ensureCalendarRegistrySheetV4_(project)
      : getCalendarRegistrySheetV4_(project, false);

    if (!sheet) throw new Error('CALENDAR_REGISTRY_TAB_NOT_FOUND');

    var existing = getCalendarRegistryRecordFromSheetV4_(sheet, project.projectId, normalizedEventKey);
    if (!existing && !options.createIfMissing) {
      throw new Error('CALENDAR_REGISTRY_RECORD_NOT_FOUND: ' + normalizedEventKey);
    }

    var incoming = Object.assign({}, patch || {}, { eventKey: normalizedEventKey });
    return upsertCalendarRegistryRecordUnlockedV4_(sheet, project, incoming);
  });
}


/**
 * Public: rename one logical Calendar registry identity in-place while keeping
 * the same row and Calendar Event ID. Used only by explicit Calendar V2
 * migration. It never deletes a Calendar event.
 */
function renameCalendarRegistryEventKeyV4(projectId, oldEventKey, newEventKey, patch) {
  var project = resolveCalendarRegistryProjectV4_(projectId || '');
  var oldKey = normalizeCalendarEventKeyV4_(oldEventKey);
  var newKey = normalizeCalendarEventKeyV4_(newEventKey);
  if (oldKey === newKey) throw new Error('CALENDAR_REGISTRY_RENAME_KEYS_IDENTICAL');

  return withCalendarRegistryLockV4_(function() {
    var sheet = getCalendarRegistrySheetV4_(project, false);
    if (!sheet) throw new Error('CALENDAR_REGISTRY_TAB_NOT_FOUND');
    ensureCalendarRegistryHeadersV4_(sheet);

    var index = buildCalendarRegistryIndexV4_(sheet);
    var oldIdentity = calendarRegistryIdentityV4_(project.projectId, oldKey);
    var newIdentity = calendarRegistryIdentityV4_(project.projectId, newKey);
    var oldRows = index.rowsByIdentity[oldIdentity] || [];
    var newRows = index.rowsByIdentity[newIdentity] || [];
    if (oldRows.length !== 1) throw new Error('CALENDAR_REGISTRY_RENAME_OLD_IDENTITY_COUNT_' + oldRows.length + ': ' + oldKey);
    if (newRows.length) throw new Error('CALENDAR_REGISTRY_RENAME_TARGET_EXISTS: ' + newKey);

    var rowNumber = oldRows[0];
    var record = readCalendarRegistryRecordAtRowV4_(sheet, rowNumber);
    var merged = mergeCalendarRegistryRecordV4_(record, patch || {});
    merged.key = newIdentity;
    merged.schemaVersion = GES_CALENDAR_REGISTRY_V4.VERSION;
    merged.projectId = project.projectId;
    merged.projectName = safeString_(project.projectName || project.brandName || project.rootFolderName);
    merged.eventKey = newKey;
    merged.lastSeen = nowIso_();
    writeCalendarRegistryRecordAtRowV4_(sheet, rowNumber, merged);

    var audit = auditCalendarRegistrySheetV4_(sheet, project.projectId);
    if (audit.duplicateIdentityCount || audit.eventIdCollisionCount || audit.keyMismatchCount) {
      throw new Error('CALENDAR_REGISTRY_RENAME_POST_AUDIT_FAILED: ' + JSON.stringify(audit));
    }
    return { success: true, action: 'RENAME_IN_PLACE', rowNumber: rowNumber, oldEventKey: oldKey, newEventKey: newKey, eventId: merged.eventId || '', record: merged };
  });
}

/** Public convenience: set status plus optional fields. */
function markCalendarRegistryStatusV4(projectId, eventKey, status, patch) {
  var normalizedStatus = normalizeCalendarRegistryStatusV4_(status, true);
  var payload = Object.assign({}, patch || {}, { status: normalizedStatus });
  return patchCalendarRegistryRecordV4(projectId, eventKey, payload, { createIfMissing: false });
}

/**
 * Public convenience used by Calendar scanners: mark one logical event seen.
 */
function touchCalendarRegistrySeenV4(projectId, eventKey, scanRunId) {
  return patchCalendarRegistryRecordV4(projectId, eventKey, {
    lastSeen: nowIso_(),
    lastSeenRunId: safeString_(scanRunId)
  }, { createIfMissing: false });
}

/**
 * Public: integrity audit. Read-only; does not repair/delete rows.
 */
function auditCalendarRegistryV4(projectId) {
  var project = resolveCalendarRegistryProjectV4_(projectId || '');
  var sheet = getCalendarRegistrySheetV4_(project, false);
  if (!sheet) {
    return {
      success: true,
      projectId: project.projectId,
      tabExists: false,
      rowCount: 0,
      duplicateIdentityCount: 0,
      eventIdCollisionCount: 0,
      duplicateIdentities: [],
      eventIdCollisions: [],
      issues: []
    };
  }

  var audit = auditCalendarRegistrySheetV4_(sheet, project.projectId);
  return Object.assign({
    success: audit.duplicateIdentityCount === 0 && audit.eventIdCollisionCount === 0,
    projectId: project.projectId,
    tabExists: true
  }, audit);
}

/* ========================================================================== *
 * Internal project / sheet resolution
 * ========================================================================== */

function resolveCalendarRegistryProjectV4_(projectIdOrProject) {
  if (projectIdOrProject && typeof projectIdOrProject === 'object') {
    if (!projectIdOrProject.projectId) throw new Error('CALENDAR_REGISTRY_PROJECT_ID_REQUIRED');
    return projectIdOrProject;
  }

  var projectId = safeString_(projectIdOrProject).trim();
  var project = projectId ? getProject_(projectId) : getActiveProject_();
  if (!project) throw new Error('CALENDAR_REGISTRY_PROJECT_NOT_FOUND');
  if (!project.projectId) throw new Error('CALENDAR_REGISTRY_PROJECT_ID_REQUIRED');
  return project;
}

function getCalendarRegistrySheetV4_(project, createIfMissing) {
  if (!project || !project.registrySheetId) {
    if (!createIfMissing) return null;
    if (typeof ensureRegistrySpreadsheet_ !== 'function') {
      throw new Error('REGISTRY_SPREADSHEET_NOT_AVAILABLE');
    }
    var createdSs = ensureRegistrySpreadsheet_(project);
    return ensureCalendarRegistrySheetHeadersV4_(createdSs);
  }

  var ss;
  try {
    ss = SpreadsheetApp.openById(project.registrySheetId);
  } catch (e) {
    if (!createIfMissing) return null;
    if (typeof ensureRegistrySpreadsheet_ !== 'function') throw e;
    ss = ensureRegistrySpreadsheet_(project);
  }

  var sheet = ss.getSheetByName(GES_CALENDAR_REGISTRY_V4.TAB_NAME);
  if (!sheet && createIfMissing) return ensureCalendarRegistrySheetHeadersV4_(ss);
  if (sheet && createIfMissing) ensureCalendarRegistryHeadersV4_(sheet);
  return sheet;
}

function ensureCalendarRegistrySheetV4_(project) {
  return getCalendarRegistrySheetV4_(project, true);
}

function ensureCalendarRegistrySheetHeadersV4_(ss) {
  var sheet = ss.getSheetByName(GES_CALENDAR_REGISTRY_V4.TAB_NAME);
  if (!sheet) sheet = ss.insertSheet(GES_CALENDAR_REGISTRY_V4.TAB_NAME);
  ensureCalendarRegistryHeadersV4_(sheet);
  return sheet;
}

/**
 * Non-destructive schema evolution: missing headers are appended.
 * Existing columns are never reordered, so old rows remain aligned.
 */
function ensureCalendarRegistryHeadersV4_(sheet) {
  var required = GES_CALENDAR_REGISTRY_V4.FIELDS.map(function(field) { return field.header; });
  var lastColumn = Math.max(1, sheet.getLastColumn());
  var current = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(function(v) {
    return safeString_(v).trim();
  });

  var hasAnyHeader = current.some(function(v) { return !!v; });
  if (!hasAnyHeader) {
    sheet.getRange(1, 1, 1, required.length).setValues([required]);
    sheet.setFrozenRows(1);
    return;
  }

  var seen = {};
  current.forEach(function(header, index) {
    if (!header) return;
    if (seen[header] !== undefined) {
      throw new Error('CALENDAR_REGISTRY_DUPLICATE_HEADER: ' + header);
    }
    seen[header] = index;
  });

  var missing = required.filter(function(header) { return seen[header] === undefined; });
  if (missing.length) {
    var startColumn = current.length + 1;
    sheet.getRange(1, startColumn, 1, missing.length).setValues([missing]);
  }
  sheet.setFrozenRows(1);
}

/* ========================================================================== *
 * Identity / duplicate protection
 * ========================================================================== */

function calendarRegistryIdentityV4_(projectId, eventKey) {
  var pid = safeString_(projectId).trim();
  var key = normalizeCalendarEventKeyV4_(eventKey);
  if (!pid) throw new Error('CALENDAR_REGISTRY_PROJECT_ID_REQUIRED');
  return pid + '|' + key;
}

function normalizeCalendarEventKeyV4_(eventKey) {
  var value = safeString_(eventKey).trim().toUpperCase();
  if (!value) throw new Error('CALENDAR_REGISTRY_EVENT_KEY_REQUIRED');
  if (value.indexOf('|') !== -1) throw new Error('CALENDAR_REGISTRY_EVENT_KEY_INVALID: pipe is not allowed');
  return value;
}

function normalizeCalendarRegistryStatusV4_(status, required) {
  var value = safeString_(status).trim().toUpperCase();
  if (!value && !required) return '';
  if (!value) throw new Error('CALENDAR_REGISTRY_STATUS_REQUIRED');
  if (GES_CALENDAR_REGISTRY_V4.STATUSES.indexOf(value) === -1) {
    throw new Error('CALENDAR_REGISTRY_INVALID_STATUS: ' + value);
  }
  return value;
}

function assertCalendarRegistryInputBatchUniqueV4_(projectId, records) {
  var seen = {};
  var eventIds = {};

  (records || []).forEach(function(record, index) {
    var key = normalizeCalendarEventKeyV4_(record && record.eventKey);
    var identity = calendarRegistryIdentityV4_(projectId, key);
    if (seen[identity] !== undefined) {
      throw new Error(
        'CALENDAR_REGISTRY_DUPLICATE_INPUT_IDENTITY: ' + identity +
        ' at indexes ' + seen[identity] + ',' + index
      );
    }
    seen[identity] = index;

    var eventId = safeString_(record && record.eventId).trim();
    if (eventId) {
      if (eventIds[eventId] && eventIds[eventId] !== key) {
        throw new Error(
          'CALENDAR_REGISTRY_INPUT_EVENT_ID_COLLISION: ' + eventId +
          ' maps to ' + eventIds[eventId] + ' and ' + key
        );
      }
      eventIds[eventId] = key;
    }
  });
}

function buildCalendarRegistryIndexV4_(sheet) {
  var records = readCalendarRegistryRecordsWithRowsV4_(sheet);
  var rowsByIdentity = {};
  var rowsByEventId = {};
  var keyMismatches = [];

  records.forEach(function(item) {
    var record = item.record;
    if (!record.projectId || !record.eventKey) return;

    var identity;
    try {
      identity = calendarRegistryIdentityV4_(record.projectId, record.eventKey);
    } catch (e) {
      return;
    }

    rowsByIdentity[identity] = rowsByIdentity[identity] || [];
    rowsByIdentity[identity].push(item.rowNumber);

    if (record.key && record.key !== identity) {
      keyMismatches.push({
        row: item.rowNumber,
        storedKey: record.key,
        expectedKey: identity
      });
    }

    if (record.eventId) {
      var eventScopeKey = record.projectId + '|' + record.eventId;
      rowsByEventId[eventScopeKey] = rowsByEventId[eventScopeKey] || [];
      rowsByEventId[eventScopeKey].push({
        row: item.rowNumber,
        eventKey: record.eventKey
      });
    }
  });

  return {
    records: records,
    rowsByIdentity: rowsByIdentity,
    rowsByEventId: rowsByEventId,
    keyMismatches: keyMismatches
  };
}

function auditCalendarRegistrySheetV4_(sheet, projectId) {
  var index = buildCalendarRegistryIndexV4_(sheet);
  var duplicateIdentities = [];
  var eventIdCollisions = [];
  var issues = [];

  Object.keys(index.rowsByIdentity).forEach(function(identity) {
    var rows = index.rowsByIdentity[identity];
    if (rows.length <= 1) return;
    if (projectId && identity.indexOf(projectId + '|') !== 0) return;
    duplicateIdentities.push({ identity: identity, rows: rows.slice() });
    issues.push('DUPLICATE_IDENTITY ' + identity + ' rows=' + rows.join(','));
  });

  Object.keys(index.rowsByEventId).forEach(function(scopeKey) {
    var items = index.rowsByEventId[scopeKey];
    if (items.length <= 1) return;
    if (projectId && scopeKey.indexOf(projectId + '|') !== 0) return;

    var uniqueEventKeys = {};
    items.forEach(function(item) { uniqueEventKeys[item.eventKey] = true; });
    var eventKeys = Object.keys(uniqueEventKeys);
    if (eventKeys.length <= 1) return;

    eventIdCollisions.push({
      eventIdScope: scopeKey,
      eventKeys: eventKeys,
      rows: items.map(function(item) { return item.row; })
    });
    issues.push('EVENT_ID_COLLISION ' + scopeKey + ' eventKeys=' + eventKeys.join(','));
  });

  index.keyMismatches.forEach(function(mismatch) {
    issues.push(
      'KEY_MISMATCH row=' + mismatch.row +
      ' stored=' + mismatch.storedKey +
      ' expected=' + mismatch.expectedKey
    );
  });

  var projectRows = index.records.filter(function(item) {
    return !projectId || item.record.projectId === projectId;
  });

  return {
    rowCount: projectRows.length,
    duplicateIdentityCount: duplicateIdentities.length,
    eventIdCollisionCount: eventIdCollisions.length,
    keyMismatchCount: index.keyMismatches.length,
    duplicateIdentities: duplicateIdentities,
    eventIdCollisions: eventIdCollisions,
    keyMismatches: index.keyMismatches,
    issues: issues
  };
}

function assertCalendarRegistryEventIdAvailableV4_(index, projectId, eventKey, eventId) {
  var id = safeString_(eventId).trim();
  if (!id) return;

  var scopeKey = projectId + '|' + id;
  var existing = index.rowsByEventId[scopeKey] || [];
  var conflicts = existing.filter(function(item) {
    return item.eventKey !== eventKey;
  });

  if (conflicts.length) {
    throw new Error(
      'CALENDAR_REGISTRY_EVENT_ID_COLLISION: eventId ' + id +
      ' already belongs to eventKey(s) ' +
      conflicts.map(function(item) { return item.eventKey; }).join(',')
    );
  }
}

/* ========================================================================== *
 * Upsert implementation
 * ========================================================================== */

function upsertCalendarRegistryRecordUnlockedV4_(sheet, project, incomingRecord) {
  ensureCalendarRegistryHeadersV4_(sheet);

  var eventKey = normalizeCalendarEventKeyV4_(incomingRecord.eventKey);
  if (incomingRecord.projectId && safeString_(incomingRecord.projectId) !== project.projectId) {
    throw new Error('CALENDAR_REGISTRY_PROJECT_ID_MISMATCH');
  }

  var identity = calendarRegistryIdentityV4_(project.projectId, eventKey);
  var index = buildCalendarRegistryIndexV4_(sheet);
  var rows = index.rowsByIdentity[identity] || [];

  if (rows.length > 1) {
    throw new Error('CALENDAR_REGISTRY_DUPLICATE_IDENTITY: ' + identity + ' @ rows ' + rows.join(','));
  }

  var existing = rows.length ? readCalendarRegistryRecordAtRowV4_(sheet, rows[0]) : null;
  var merged = mergeCalendarRegistryRecordV4_(existing, incomingRecord);
  var now = nowIso_();

  merged.key = identity;
  merged.schemaVersion = GES_CALENDAR_REGISTRY_V4.VERSION;
  merged.projectId = project.projectId;
  merged.projectName = safeString_(project.projectName || project.brandName || project.rootFolderName);
  merged.eventKey = eventKey;
  merged.status = normalizeCalendarRegistryStatusV4_(merged.status || 'PLANNED', true);
  merged.firstSeen = existing && existing.firstSeen ? existing.firstSeen : (merged.firstSeen || now);
  merged.lastSeen = merged.lastSeen || now;

  assertCalendarRegistryEventIdAvailableV4_(index, project.projectId, eventKey, merged.eventId);

  var action;
  var rowNumber;
  if (existing) {
    rowNumber = rows[0];
    writeCalendarRegistryRecordAtRowV4_(sheet, rowNumber, merged);
    action = 'UPDATE';
  } else {
    rowNumber = Math.max(2, sheet.getLastRow() + 1);
    writeCalendarRegistryRecordAtRowV4_(sheet, rowNumber, merged);
    action = 'CREATE';
  }

  return {
    success: true,
    action: action,
    key: identity,
    rowNumber: rowNumber,
    projectId: project.projectId,
    eventKey: eventKey,
    eventId: merged.eventId || '',
    status: merged.status,
    record: merged
  };
}

function mergeCalendarRegistryRecordV4_(existing, incoming) {
  var out = existing ? Object.assign({}, existing) : {};
  var source = incoming || {};

  GES_CALENDAR_REGISTRY_V4.FIELDS.forEach(function(field) {
    var key = field.key;
    if (source[key] !== undefined) out[key] = source[key];
  });

  // Convenience aliases accepted from Calendar API / planner callers.
  if (source.htmlLink !== undefined && source.eventHtmlLink === undefined) out.eventHtmlLink = source.htmlLink;
  if (source.iCalUID !== undefined && source.iCalUid === undefined) out.iCalUid = source.iCalUID;
  if (source.eTag !== undefined && source.etag === undefined) out.etag = source.eTag;
  if (source.updated !== undefined && source.eventUpdatedAt === undefined) out.eventUpdatedAt = source.updated;

  out.eventKey = normalizeCalendarEventKeyV4_(source.eventKey !== undefined ? source.eventKey : out.eventKey);

  if (out.byDay && !Array.isArray(out.byDay)) {
    out.byDay = safeString_(out.byDay).split(',').map(function(v) { return v.trim(); }).filter(function(v) { return !!v; });
  }
  if (!out.byDay) out.byDay = [];

  if (out.status) out.status = normalizeCalendarRegistryStatusV4_(out.status, true);
  return out;
}

/* ========================================================================== *
 * Sheet row serialization / parsing
 * ========================================================================== */

function calendarRegistryHeaderMapV4_(sheet) {
  var lastColumn = Math.max(1, sheet.getLastColumn());
  var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(function(v) {
    return safeString_(v).trim();
  });
  var map = {};
  headers.forEach(function(header, index) {
    if (header) map[header] = index + 1;
  });
  return { headers: headers, columns: map };
}

function readCalendarRegistryRecordsV4_(sheet) {
  return readCalendarRegistryRecordsWithRowsV4_(sheet).map(function(item) {
    return item.record;
  });
}

function readCalendarRegistryRecordsWithRowsV4_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];

  var headerInfo = calendarRegistryHeaderMapV4_(sheet);
  var lastColumn = sheet.getLastColumn();
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, lastColumn).getValues();

  return values.map(function(row, index) {
    return {
      rowNumber: index + 2,
      record: calendarRegistryRowToRecordV4_(row, headerInfo.columns)
    };
  }).filter(function(item) {
    var record = item.record;
    return !!(record.key || record.projectId || record.eventKey || record.eventId);
  });
}

function readCalendarRegistryRecordAtRowV4_(sheet, rowNumber) {
  var headerInfo = calendarRegistryHeaderMapV4_(sheet);
  var row = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
  return calendarRegistryRowToRecordV4_(row, headerInfo.columns);
}

function getCalendarRegistryRecordFromSheetV4_(sheet, projectId, eventKey) {
  var index = buildCalendarRegistryIndexV4_(sheet);
  var identity = calendarRegistryIdentityV4_(projectId, eventKey);
  var rows = index.rowsByIdentity[identity] || [];
  if (rows.length > 1) {
    throw new Error('CALENDAR_REGISTRY_DUPLICATE_IDENTITY: ' + identity + ' @ rows ' + rows.join(','));
  }
  return rows.length ? readCalendarRegistryRecordAtRowV4_(sheet, rows[0]) : null;
}

function calendarRegistryRowToRecordV4_(row, columns) {
  function value(header) {
    var column = columns[header];
    return column ? row[column - 1] : '';
  }

  var record = {};
  GES_CALENDAR_REGISTRY_V4.FIELDS.forEach(function(field) {
    record[field.key] = value(field.header);
  });

  record.projectId = safeString_(record.projectId);
  record.projectName = safeString_(record.projectName);
  record.eventKey = safeString_(record.eventKey).trim().toUpperCase();
  record.eventRole = safeString_(record.eventRole);
  record.calendarId = safeString_(record.calendarId);
  record.eventId = safeString_(record.eventId);
  record.assetType = safeString_(record.assetType).toUpperCase();
  record.status = safeString_(record.status).toUpperCase();
  record.byDay = safeString_(record.byDay).split(',').map(function(v) { return v.trim(); }).filter(function(v) { return !!v; });
  record.allDay = parseCalendarRegistryBooleanV4_(record.allDay);
  record.planVersion = parseCalendarRegistryNumberV4_(record.planVersion);
  record.durationMinutes = parseCalendarRegistryNumberV4_(record.durationMinutes);
  record.attachmentCount = parseCalendarRegistryNumberV4_(record.attachmentCount);
  record.urlRefCount = parseCalendarRegistryNumberV4_(record.urlRefCount);
  return record;
}

function writeCalendarRegistryRecordAtRowV4_(sheet, rowNumber, record) {
  ensureCalendarRegistryHeadersV4_(sheet);
  var headerInfo = calendarRegistryHeaderMapV4_(sheet);
  var lastColumn = sheet.getLastColumn();
  var row = new Array(lastColumn).fill('');

  GES_CALENDAR_REGISTRY_V4.FIELDS.forEach(function(field) {
    var column = headerInfo.columns[field.header];
    if (!column) throw new Error('CALENDAR_REGISTRY_HEADER_MISSING: ' + field.header);
    row[column - 1] = calendarRegistrySerializeValueV4_(field.key, record[field.key]);
  });

  sheet.getRange(rowNumber, 1, 1, lastColumn).setValues([row]);
}

function calendarRegistrySerializeValueV4_(key, value) {
  if (key === 'byDay') {
    return Array.isArray(value) ? value.join(',') : safeString_(value);
  }
  if (key === 'allDay') {
    if (value === true) return 'TRUE';
    if (value === false) return 'FALSE';
    return '';
  }
  if (['planVersion','durationMinutes','attachmentCount','urlRefCount'].indexOf(key) !== -1) {
    if (value === '' || value === null || value === undefined) return '';
    var number = Number(value);
    return isNaN(number) ? safeString_(value) : number;
  }
  return value === null || value === undefined ? '' : value;
}

function parseCalendarRegistryBooleanV4_(value) {
  if (value === true || value === false) return value;
  var normalized = safeString_(value).trim().toUpperCase();
  if (normalized === 'TRUE') return true;
  if (normalized === 'FALSE') return false;
  return null;
}

function parseCalendarRegistryNumberV4_(value) {
  if (value === '' || value === null || value === undefined) return null;
  var number = Number(value);
  return isNaN(number) ? null : number;
}

/* ========================================================================== *
 * Planner -> Registry adapter for CalendarAsset.gs (private helper)
 * ========================================================================== */

/**
 * Private helper reserved for CalendarAsset.gs.
 * Converts a planned event + optional remote Calendar API response into a
 * registry record. It does not write anything by itself.
 */
function buildCalendarRegistryRecordFromPlanEventV4_(project, plan, plannedEvent, remote) {
  remote = remote || {};
  var recurrence = plannedEvent.recurrence || {};
  var source = plannedEvent.source || {};
  var availability = plannedEvent.availability || {};

  var derivedStatus;
  if (availability.status === 'DEFERRED') derivedStatus = 'DEFERRED';
  else if (availability.status === 'NEEDS_REVIEW') derivedStatus = 'NEEDS_REVIEW';
  else if (!availability.ready) derivedStatus = 'MISSING';
  else derivedStatus = remote.id || remote.eventId ? 'CURRENT' : 'MISSING';

  return {
    projectId: project.projectId,
    projectName: project.projectName,
    calendarId: safeString_(remote.calendarId || (plan.calendar && plan.calendar.calendarId) || ''),
    calendarSummary: safeString_((plan.calendar && plan.calendar.summary) || ''),
    eventKey: plannedEvent.eventKey,
    eventRole: plannedEvent.role,
    templateId: safeString_(plan.templateId),
    planVersion: Number(
      plannedEvent.extendedPropertiesPreview && plannedEvent.extendedPropertiesPreview.gesPlanVersion || 1
    ),
    eventId: safeString_(remote.id || remote.eventId || ''),
    iCalUid: safeString_(remote.iCalUID || remote.iCalUid || ''),
    eventHtmlLink: safeString_(remote.htmlLink || remote.eventHtmlLink || ''),
    eventSummary: safeString_(plannedEvent.summary),
    sourceKind: safeString_(plannedEvent.sourceKind),
    assetType: safeString_(source.assetType || '').toUpperCase(),
    assetId: safeString_(source.id),
    assetUrl: safeString_(source.url),
    recurrenceRule: safeString_(recurrence.rrulePreview),
    byDay: Array.isArray(recurrence.byDay) ? recurrence.byDay.slice() : [],
    allDay: recurrence.allDay === true,
    startDate: safeString_(remote.startDate || ''),
    startTime: recurrence.allDay
      ? ''
      : padCalendarRegistryTimeV4_(recurrence.startHour) + ':' + padCalendarRegistryTimeV4_(recurrence.startMinute),
    durationMinutes: recurrence.durationMinutes,
    visibility: safeString_(plannedEvent.visibility),
    transparency: safeString_(plannedEvent.transparency),
    location: safeString_(plannedEvent.location),
    attachmentCount: Array.isArray(plannedEvent.attachments) ? plannedEvent.attachments.length : 0,
    urlRefCount: Array.isArray(plannedEvent.urlRefs) ? plannedEvent.urlRefs.length : 0,
    fingerprint: safeString_(plannedEvent.fingerprint),
    status: safeString_(remote.status || derivedStatus).toUpperCase(),
    resolutionMethod: safeString_(remote.resolutionMethod || (remote.id ? 'CALENDAR_API_CREATE_OR_ADOPT' : 'PLAN_ONLY')),
    lastSynced: safeString_(remote.lastSynced || ''),
    eventUpdatedAt: safeString_(remote.updated || remote.eventUpdatedAt || ''),
    etag: safeString_(remote.etag || remote.eTag || ''),
    lastSeenRunId: safeString_(remote.lastSeenRunId || ''),
    lastError: safeString_(remote.lastError || ''),
    notes: safeString_(remote.notes || '')
  };
}

function padCalendarRegistryTimeV4_(value) {
  var number = Number(value || 0);
  return number < 10 ? '0' + number : String(number);
}

/* ========================================================================== *
 * Lock helper
 * ========================================================================== */

function withCalendarRegistryLockV4_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('CALENDAR_REGISTRY_LOCK_TIMEOUT');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
