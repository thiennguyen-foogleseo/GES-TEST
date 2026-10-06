/**
 * GES V4 Calendar Asset V2.1 - PRODUCTION
 * -----------------------------------------------------------------------------
 * Owns creation/adoption of ONE secondary Google Calendar per GES project and
 * low-level CRUD helpers for recurring GES Calendar event series.
 *
 * Design goals
 * - Reuse existing K1 canary Calendar/Event IDs without duplication.
 * - One logical event identity = projectId + eventKey.
 * - No destructive deletes in this module.
 * - Calendar public ACL is enforced through default -> reader.
 * - Calendar event IDs are preserved on update by CalendarSyncManager.gs.
 *
 * Dependencies
 * - CalendarPlanSchema.gs
 * - CalendarPlanner.gs
 * - CalendarRegistry.gs
 * - ProjectManager.gs / WriteGuard.gs
 * - Advanced Google Service: Calendar API v3, symbol "Calendar"
 */

const GES_CALENDAR_ASSET_V4 = Object.freeze({
  VERSION: '2.1.0-calendar-v2-1',
  CALENDAR_PROPERTY_PREFIX: 'GES_V4_CALENDAR_ID_',
  BUILD_LOCK_TIMEOUT_MS: 30000,
  REMOTE_SEARCH_MAX_RESULTS: 100,
  MAX_ATTACHMENTS: 25
});

/* ========================================================================== *
 * Public build / inspect API
 * ========================================================================== */

/**
 * Build or adopt a project's Calendar and create/adopt READY event series.
 * Existing events with the same identity + fingerprint are skipped.
 * Existing events with a different fingerprint are NOT modified here; use
 * CalendarSyncManager.gs for updates.
 */
function buildProjectCalendarV4(projectId) {
  return withCalendarAssetUserLockV4_(function() {
    assertCalendarServiceAvailableV4_();

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
    if (!init.success) {
      throw new Error('CALENDAR_REGISTRY_INVALID: ' + JSON.stringify(init.issues || []));
    }

    var audit = auditCalendarRegistryV4(project.projectId);
    if (!audit.success) {
      throw new Error('CALENDAR_REGISTRY_CONFLICT: ' + JSON.stringify(audit));
    }

    var resolved = ensureProjectCalendarV4_(project, plan);
    var calendarId = resolved.calendarId;
    ensureProjectCalendarPublicAclV4_(calendarId);

    project = persistProjectCalendarProfileV4_(project, plan, calendarId, {
      publicAccess: true,
      lastBuildAt: nowIso_(),
      lastPlanFingerprint: plan.fingerprint,
      moduleVersion: GES_CALENDAR_ASSET_V4.VERSION
    });

    var readyEvents = (plan.events || []).filter(function(event) {
      return event.availability && event.availability.status === 'READY';
    });

    var results = readyEvents.map(function(plannedEvent) {
      return createOrAdoptCalendarEventV4_(project, plan, plannedEvent, calendarId, {
        refuseOutdated: true
      });
    });

    // Persist plan-only rows for non-ready events so the registry reflects the
    // full 15-role Calendar V2.1 plan even when only READY roles have remote events.
    persistNonReadyCalendarPlanRowsV4_(project, plan, calendarId);

    var postAudit = auditCalendarRegistryV4(project.projectId);
    if (!postAudit.success) {
      throw new Error('CALENDAR_POST_BUILD_REGISTRY_CONFLICT: ' + JSON.stringify(postAudit));
    }

    var report = {
      success: true,
      version: GES_CALENDAR_ASSET_V4.VERSION,
      projectId: project.projectId,
      projectName: project.projectName,
      calendarId: calendarId,
      calendarSummary: plan.calendar.summary,
      calendarUrl: calendarAssetCalendarUrlV4_(calendarId),
      calendarCreated: resolved.created,
      calendarAdoptedFrom: resolved.adoptedFrom,
      readyPlanned: readyEvents.length,
      deferredPlanned: plan.stats.deferred,
      createdEvents: results.filter(function(r) { return r.action === 'CREATE'; }).length,
      adoptedEvents: results.filter(function(r) { return r.action === 'ADOPT'; }).length,
      skippedExistingEvents: results.filter(function(r) { return r.action === 'SKIP_EXISTING'; }).length,
      planFingerprint: plan.fingerprint,
      registryAudit: postAudit,
      events: results
    };

    try {
      if (typeof refreshProjectUrlSheetCalendarEventsV41 === 'function') {
        report.projectUrlSheetMirror = refreshProjectUrlSheetCalendarEventsV41(project.projectId);
      }
    } catch (mirrorError) {
      report.projectUrlSheetMirror = { success: false, error: safeString_(mirrorError && mirrorError.message || mirrorError) };
    }
    console.log(JSON.stringify(report, null, 2));
    return report;
  });
}

function buildActiveProjectCalendarV4() {
  return buildProjectCalendarV4('');
}

/** Read-only inspection of Calendar state for a project. */
function inspectProjectCalendarV4(projectId) {
  var plan = previewCalendarPlanV4(projectId || '');
  var project = getProject_(plan.projectId);
  if (!project) throw new Error('CALENDAR_PROJECT_NOT_FOUND');

  var rows = getCalendarRegistryRowsV4(project.projectId);
  var state = collectProjectCalendarIdsV4_(project, rows);

  return {
    success: true,
    projectId: project.projectId,
    projectName: project.projectName,
    calendarIdCandidates: state.ids,
    calendarIdSources: state.sources,
    registryRows: rows.length,
    currentRows: rows.filter(function(r) { return r.status === 'CURRENT'; }).length,
    deferredRows: rows.filter(function(r) { return r.status === 'DEFERRED'; }).length,
    orphanedRows: rows.filter(function(r) { return r.status === 'ORPHANED'; }).length,
    readyPlanned: plan.stats.ready,
    deferredPlanned: plan.stats.deferred,
    planFingerprint: plan.fingerprint,
    calendarUrl: state.ids.length === 1 ? calendarAssetCalendarUrlV4_(state.ids[0]) : ''
  };
}

function inspectActiveProjectCalendarV4() {
  return inspectProjectCalendarV4('');
}

/* ========================================================================== *
 * K1 canary compatibility aliases
 * ========================================================================== */

function buildK1CalendarCanaryV4() {
  var projects = typeof listProjects === 'function' ? listProjects() : [];
  var matches = projects.filter(function(project) {
    var name = calendarAssetNormalizeSearchTextV4_(project.projectName);
    return name.indexOf('bao lanh dien visa k1 mat bao lau') !== -1;
  });
  if (!matches.length) throw new Error('K1_PROJECT_NOT_FOUND');
  if (matches.length > 1) throw new Error('K1_PROJECT_AMBIGUOUS');
  return buildProjectCalendarV4(matches[0].projectId);
}

function inspectK1CalendarCanaryV4() {
  var projects = typeof listProjects === 'function' ? listProjects() : [];
  var matches = projects.filter(function(project) {
    return calendarAssetNormalizeSearchTextV4_(project.projectName)
      .indexOf('bao lanh dien visa k1 mat bao lau') !== -1;
  });
  if (matches.length !== 1) throw new Error('K1_PROJECT_NOT_UNIQUE');
  return inspectProjectCalendarV4(matches[0].projectId);
}

/* ========================================================================== *
 * Calendar resolution / persistence
 * ========================================================================== */

function ensureProjectCalendarV4_(project, plan) {
  var rows = getCalendarRegistryRowsV4(project.projectId);
  var state = collectProjectCalendarIdsV4_(project, rows);

  if (state.ids.length > 1) {
    throw new Error('CALENDAR_MULTIPLE_CALENDAR_IDS: ' + state.ids.join(','));
  }

  if (state.ids.length === 1) {
    var existingId = state.ids[0];
    var existing = getRemoteCalendarOrNullV4_(existingId);
    if (!existing) throw new Error('CALENDAR_STORED_CALENDAR_NOT_FOUND: ' + existingId);

    persistProjectCalendarIdBackupV4_(project.projectId, existingId);
    persistProjectCalendarProfileV4_(project, plan, existingId, {
      adoptedAt: nowIso_(),
      moduleVersion: GES_CALENDAR_ASSET_V4.VERSION
    });

    return {
      calendarId: existingId,
      created: false,
      adoptedFrom: state.sources.join('+') || 'STORED_STATE'
    };
  }

  var body = {
    summary: safeString_(plan.calendar.summary),
    description: safeString_(plan.calendar.description),
    timeZone: safeString_(plan.calendar.timezone),
    location: safeString_(plan.calendar.location && plan.calendar.location.locationText)
  };

  var created = Calendar.Calendars.insert(body);
  if (!created || !created.id) throw new Error('CALENDAR_CREATE_FAILED');

  persistProjectCalendarIdBackupV4_(project.projectId, created.id);
  persistProjectCalendarProfileV4_(project, plan, created.id, {
    publicAccess: false,
    createdAt: nowIso_(),
    state: 'CALENDAR_CREATED_EVENTS_PENDING',
    moduleVersion: GES_CALENDAR_ASSET_V4.VERSION
  });

  return {
    calendarId: created.id,
    created: true,
    adoptedFrom: 'CALENDAR_API_CREATE'
  };
}

function collectProjectCalendarIdsV4_(project, registryRows) {
  var ids = [];
  var sources = [];

  function add(id, source) {
    id = safeString_(id).trim();
    if (!id || ids.indexOf(id) !== -1) return;
    ids.push(id);
    sources.push(source);
  }

  if (project.calendar) add(project.calendar.calendarId, 'PROJECT_PROFILE');

  var propId = getScriptProps_().getProperty(
    GES_CALENDAR_ASSET_V4.CALENDAR_PROPERTY_PREFIX + project.projectId
  );
  add(propId, 'SCRIPT_PROPERTY_BACKUP');

  (registryRows || []).forEach(function(row) {
    add(row.calendarId, 'CALENDAR_REGISTRY');
  });

  return { ids: ids, sources: sources };
}

function persistProjectCalendarIdBackupV4_(projectId, calendarId) {
  getScriptProps_().setProperty(
    GES_CALENDAR_ASSET_V4.CALENDAR_PROPERTY_PREFIX + projectId,
    calendarId
  );
}

function persistProjectCalendarProfileV4_(project, plan, calendarId, patch) {
  var existing = project.calendar && typeof project.calendar === 'object'
    ? cloneJson_(project.calendar)
    : {};
  var location = plan.calendar && plan.calendar.location ? plan.calendar.location : {};

  project.calendar = Object.assign(existing, {
    enabled: true,
    mode: 'FULL_GES',
    templateId: plan.templateId,
    planVersion: plan.planVersion,
    calendarId: calendarId,
    calendarSummary: plan.calendar.summary,
    timezone: plan.calendar.timezone,
    eventVisibility: plan.calendar.eventVisibility,
    transparency: plan.calendar.transparency,
    recurrenceIndefinite: true,
    location: {
      latitude: location.latitude,
      longitude: location.longitude,
      locationText: location.locationText,
      mapsUrl: location.mapsUrl
    }
  }, patch || {});

  return saveProject_(project);
}

function getRemoteCalendarOrNullV4_(calendarId) {
  try {
    return Calendar.Calendars.get(calendarId);
  } catch (e) {
    if (calendarAssetLooksNotFoundV4_(e)) return null;
    throw e;
  }
}

function ensureProjectCalendarPublicAclV4_(calendarId) {
  var desired = { scope: { type: 'default' }, role: 'reader' };

  try {
    var current = Calendar.Acl.get(calendarId, 'default');
    if (current && current.role === 'reader') return current;
    return Calendar.Acl.update(desired, calendarId, 'default');
  } catch (e) {
    var text = safeString_(e && e.message || e);
    if (!/not\s+found|404/i.test(text)) throw e;
  }

  try {
    return Calendar.Acl.insert(desired, calendarId);
  } catch (insertError) {
    throw new Error(
      'CALENDAR_PUBLIC_ACL_FAILED: ' +
      safeString_(insertError && insertError.message || insertError)
    );
  }
}

/* ========================================================================== *
 * Event create / adopt primitives
 * ========================================================================== */

function createOrAdoptCalendarEventV4_(project, plan, plannedEvent, calendarId, options) {
  options = options || {};

  var existingRegistry = getCalendarRegistryRecordV4(project.projectId, plannedEvent.eventKey);
  if (existingRegistry && existingRegistry.calendarId && existingRegistry.calendarId !== calendarId) {
    throw new Error(
      'CALENDAR_EVENT_CALENDAR_MISMATCH: ' + plannedEvent.eventKey +
      ' registry=' + existingRegistry.calendarId + ' resolved=' + calendarId
    );
  }

  if (existingRegistry && existingRegistry.eventId) {
    var remoteByRegistry = getRemoteCalendarEventOrNullV4_(calendarId, existingRegistry.eventId);
    if (remoteByRegistry) {
      assertRemoteCalendarEventIdentityV4_(remoteByRegistry, project.projectId, plannedEvent.eventKey);
      var remoteFingerprint = getRemoteCalendarEventFingerprintV4_(remoteByRegistry);
      if (remoteFingerprint === plannedEvent.fingerprint) {
        writeCalendarRegistryFromRemoteV4_(
          project, plan, plannedEvent, calendarId, remoteByRegistry,
          'REGISTRY_EVENT_ID', 'CURRENT', ''
        );
        return calendarAssetResultV4_('SKIP_EXISTING', plannedEvent, remoteByRegistry);
      }
      if (options.refuseOutdated !== false) {
        throw new Error('CALENDAR_EXISTING_EVENT_OUTDATED: ' + plannedEvent.eventKey);
      }
      return calendarAssetResultV4_('OUTDATED', plannedEvent, remoteByRegistry);
    }
  }

  var remoteMatches = findRemoteGesEventsV4_(calendarId, project.projectId, plannedEvent.eventKey);
  if (remoteMatches.length > 1) {
    throw new Error(
      'CALENDAR_REMOTE_DUPLICATE_EVENT: ' + plannedEvent.eventKey +
      ' count=' + remoteMatches.length
    );
  }

  if (remoteMatches.length === 1) {
    var adopted = remoteMatches[0];
    var adoptedFingerprint = getRemoteCalendarEventFingerprintV4_(adopted);
    if (adoptedFingerprint !== plannedEvent.fingerprint && options.refuseOutdated !== false) {
      throw new Error('CALENDAR_ADOPTED_EVENT_OUTDATED: ' + plannedEvent.eventKey);
    }
    writeCalendarRegistryFromRemoteV4_(
      project, plan, plannedEvent, calendarId, adopted,
      'REMOTE_EXTENDED_PROPERTIES',
      adoptedFingerprint === plannedEvent.fingerprint ? 'CURRENT' : 'OUTDATED',
      ''
    );
    return calendarAssetResultV4_(
      adoptedFingerprint === plannedEvent.fingerprint ? 'ADOPT' : 'OUTDATED',
      plannedEvent,
      adopted
    );
  }

  var firstStart = computeCalendarFirstStartV4_(plannedEvent.recurrence, plan.calendar.timezone);
  var resource = buildCalendarEventResourceV4_(project, plan, plannedEvent, firstStart);
  var insertOptions = {
    sendUpdates: 'none',
    supportsAttachments: Array.isArray(resource.attachments) && resource.attachments.length > 0
  };

  var created = Calendar.Events.insert(resource, calendarId, insertOptions);
  if (!created || !created.id) {
    throw new Error('CALENDAR_EVENT_CREATE_FAILED: ' + plannedEvent.eventKey);
  }

  writeCalendarRegistryFromRemoteV4_(
    project, plan, plannedEvent, calendarId, created,
    'CALENDAR_API_CREATE', 'CURRENT', ''
  );
  return calendarAssetResultV4_('CREATE', plannedEvent, created, firstStart);
}

function getRemoteCalendarEventOrNullV4_(calendarId, eventId) {
  try {
    return Calendar.Events.get(calendarId, eventId);
  } catch (e) {
    if (calendarAssetLooksNotFoundV4_(e)) return null;
    throw e;
  }
}

function findRemoteGesEventsV4_(calendarId, projectId, eventKey) {
  var options = {
    maxResults: GES_CALENDAR_ASSET_V4.REMOTE_SEARCH_MAX_RESULTS,
    showDeleted: false,
    singleEvents: false,
    privateExtendedProperty: 'gesProjectId=' + projectId
  };

  var response = Calendar.Events.list(calendarId, options);
  var items = response && Array.isArray(response.items) ? response.items : [];
  return items.filter(function(event) {
    var p = event && event.extendedProperties && event.extendedProperties.private
      ? event.extendedProperties.private
      : {};
    return safeString_(p.gesProjectId) === safeString_(projectId) &&
      safeString_(p.gesEventKey) === safeString_(eventKey);
  });
}

function assertRemoteCalendarEventIdentityV4_(remoteEvent, projectId, eventKey) {
  var p = remoteEvent && remoteEvent.extendedProperties && remoteEvent.extendedProperties.private
    ? remoteEvent.extendedProperties.private
    : {};
  if (safeString_(p.gesProjectId) !== safeString_(projectId)) {
    throw new Error('CALENDAR_REMOTE_PROJECT_ID_MISMATCH: ' + eventKey);
  }
  if (safeString_(p.gesEventKey) !== safeString_(eventKey)) {
    throw new Error('CALENDAR_REMOTE_EVENT_KEY_MISMATCH: ' + eventKey);
  }
}

function getRemoteCalendarEventFingerprintV4_(remoteEvent) {
  var p = remoteEvent && remoteEvent.extendedProperties && remoteEvent.extendedProperties.private
    ? remoteEvent.extendedProperties.private
    : {};
  return safeString_(p.gesFingerprint);
}

function writeCalendarRegistryFromRemoteV4_(project, plan, plannedEvent, calendarId, remoteEvent, resolutionMethod, status, lastError) {
  var record = buildCalendarRegistryRecordFromPlanEventV4_(
    project,
    plan,
    plannedEvent,
    {
      calendarId: calendarId,
      id: remoteEvent && remoteEvent.id,
      iCalUID: remoteEvent && remoteEvent.iCalUID,
      htmlLink: remoteEvent && remoteEvent.htmlLink,
      updated: remoteEvent && remoteEvent.updated,
      etag: remoteEvent && remoteEvent.etag,
      startDate: calendarAssetRemoteStartLabelV4_(remoteEvent),
      status: status || 'CURRENT',
      resolutionMethod: resolutionMethod || 'CALENDAR_API',
      lastSynced: status === 'CURRENT' ? nowIso_() : '',
      lastError: lastError || '',
      notes: 'CALENDAR_ASSET_V4_' + GES_CALENDAR_ASSET_V4.VERSION
    }
  );
  return upsertCalendarRegistryRecordV4(project.projectId, record);
}

function persistNonReadyCalendarPlanRowsV4_(project, plan, calendarId) {
  (plan.events || []).forEach(function(event) {
    if (event.availability && event.availability.status === 'READY') return;

    var existing = getCalendarRegistryRecordV4(project.projectId, event.eventKey);
    var status = event.availability && event.availability.status === 'DEFERRED'
      ? 'DEFERRED'
      : (event.availability && event.availability.status === 'NEEDS_REVIEW' ? 'NEEDS_REVIEW' : 'MISSING');

    var record = buildCalendarRegistryRecordFromPlanEventV4_(
      project,
      plan,
      event,
      {
        calendarId: calendarId,
        id: existing ? existing.eventId : '',
        iCalUID: existing ? existing.iCalUid : '',
        htmlLink: existing ? existing.eventHtmlLink : '',
        status: existing && existing.eventId ? 'ORPHANED' : status,
        resolutionMethod: 'PLAN_ONLY',
        lastError: '',
        notes: 'PLAN_AVAILABILITY_' + safeString_(event.availability && event.availability.status)
      }
    );

    upsertCalendarRegistryRecordV4(project.projectId, record);
  });
}

function calendarAssetResultV4_(action, plannedEvent, remoteEvent, firstStart) {
  return {
    eventKey: plannedEvent.eventKey,
    action: action,
    eventId: safeString_(remoteEvent && remoteEvent.id),
    htmlLink: safeString_(remoteEvent && remoteEvent.htmlLink),
    firstStart: firstStart ? firstStart.label : calendarAssetRemoteStartLabelV4_(remoteEvent),
    fingerprint: plannedEvent.fingerprint
  };
}

/* ========================================================================== *
 * Event resource / attachments / recurrence
 * ========================================================================== */

function buildCalendarEventResourceV4_(project, plan, plannedEvent, firstStart) {
  var resource = {
    summary: plannedEvent.summary,
    description: plannedEvent.description,
    location: plannedEvent.location,
    visibility: plannedEvent.visibility || 'public',
    transparency: plannedEvent.transparency || 'transparent',
    recurrence: [plannedEvent.recurrence.rrulePreview],
    reminders: { useDefault: false },
    extendedProperties: {
      private: {
        gesProjectId: safeString_(project.projectId),
        gesEventKey: safeString_(plannedEvent.eventKey),
        gesAssetType: safeString_(plannedEvent.source && plannedEvent.source.assetType || ''),
        gesAssetId: safeString_(plannedEvent.source && plannedEvent.source.id || ''),
        gesCalendarTemplate: safeString_(plan.templateId),
        gesPlanVersion: String(plan.planVersion || 1),
        gesFingerprint: safeString_(plannedEvent.fingerprint),
        gesAttachmentLabelPolicy: GES_CALENDAR_ATTACHMENT_LABEL_POLICY_V4,
        gesModuleVersion: GES_CALENDAR_ASSET_V4.VERSION,
        gesCalendarSchema: 'V2.1'
      }
    }
  };

  if (plannedEvent.recurrence.allDay) {
    resource.start = { date: firstStart.startDate };
    resource.end = { date: firstStart.endDate };
  } else {
    resource.start = {
      dateTime: firstStart.startDateTime,
      timeZone: plan.calendar.timezone
    };
    resource.end = {
      dateTime: firstStart.endDateTime,
      timeZone: plan.calendar.timezone
    };
  }

  var attachments = buildCalendarAttachmentsV4_(plannedEvent.attachments || []);
  if (attachments.length) resource.attachments = attachments;

  return resource;
}

function buildCalendarEventPatchV4_(project, plan, plannedEvent, remoteEvent) {
  var patch = {
    summary: plannedEvent.summary,
    description: plannedEvent.description,
    location: plannedEvent.location,
    visibility: plannedEvent.visibility || 'public',
    transparency: plannedEvent.transparency || 'transparent',
    recurrence: [plannedEvent.recurrence.rrulePreview],
    reminders: { useDefault: false },
    extendedProperties: {
      private: Object.assign(
        {},
        remoteEvent && remoteEvent.extendedProperties && remoteEvent.extendedProperties.private
          ? remoteEvent.extendedProperties.private
          : {},
        {
          gesProjectId: safeString_(project.projectId),
          gesEventKey: safeString_(plannedEvent.eventKey),
          gesAssetType: safeString_(plannedEvent.source && plannedEvent.source.assetType || ''),
          gesAssetId: safeString_(plannedEvent.source && plannedEvent.source.id || ''),
          gesCalendarTemplate: safeString_(plan.templateId),
          gesPlanVersion: String(plan.planVersion || 1),
          gesFingerprint: safeString_(plannedEvent.fingerprint),
          gesAttachmentLabelPolicy: GES_CALENDAR_ATTACHMENT_LABEL_POLICY_V4,
          gesModuleVersion: GES_CALENDAR_ASSET_V4.VERSION,
        gesCalendarSchema: 'V2.1'
        }
      )
    }
  };

  var attachments = buildCalendarAttachmentsV4_(plannedEvent.attachments || []);
  patch.attachments = attachments;

  if (!calendarRemoteScheduleMatchesPlanV4_(remoteEvent, plannedEvent, plan.calendar.timezone)) {
    var firstStart = computeCalendarFirstStartV4_(plannedEvent.recurrence, plan.calendar.timezone);
    if (plannedEvent.recurrence.allDay) {
      patch.start = { date: firstStart.startDate };
      patch.end = { date: firstStart.endDate };
    } else {
      patch.start = { dateTime: firstStart.startDateTime, timeZone: plan.calendar.timezone };
      patch.end = { dateTime: firstStart.endDateTime, timeZone: plan.calendar.timezone };
    }
  }

  return patch;
}

function buildCalendarAttachmentsV4_(plannedAttachments) {
  var seen = {};
  var out = [];

  (plannedAttachments || []).forEach(function(item) {
    var fileId = safeString_(item.fileId).trim();
    if (!fileId || seen[fileId]) return;

    var driveKind = safeString_(item.driveKind || 'FILE').toUpperCase();
    var url = safeString_(item.fileUrl);
    var title = safeString_(item.title);
    var mimeType = safeString_(item.mimeType);

    try {
      if (driveKind === 'FOLDER' || mimeType === 'application/vnd.google-apps.folder') {
        var folder = DriveApp.getFolderById(fileId);
        url = url || folder.getUrl();
        title = title || folder.getName();
        mimeType = 'application/vnd.google-apps.folder';
      } else {
        var file = DriveApp.getFileById(fileId);
        url = url || file.getUrl();
        title = title || file.getName();
        mimeType = mimeType || file.getMimeType();
      }
    } catch (e) {
      throw new Error('CALENDAR_ATTACHMENT_DRIVE_ITEM_NOT_FOUND: ' + fileId);
    }

    // Calendar display title is intentionally independent from the Drive name.
    // Resolve from the final MIME type after Drive lookup so stale/missing MIME
    // data in a plan can never leak a project-specific filename into Calendar.
    title = calendarV2AttachmentTitleFromMimeTypeV4_(mimeType, title);

    seen[fileId] = true;
    out.push({ fileUrl: url, title: title, mimeType: mimeType });
  });

  if (out.length > GES_CALENDAR_ASSET_V4.MAX_ATTACHMENTS) {
    throw new Error('CALENDAR_TOO_MANY_ATTACHMENTS: ' + out.length);
  }
  return out;
}

/**
 * Return a stable Drive identity for a Calendar attachment.
 * Calendar API normally returns fileId. URL extraction is a defensive fallback
 * for older/partial event resources.
 */
function calendarAttachmentIdentityV4_(attachment) {
  attachment = attachment || {};
  var directId = safeString_(attachment.fileId).trim();
  if (directId) return directId;

  var url = safeString_(attachment.fileUrl).trim();
  if (!url) return '';

  var patterns = [
    /\/folders\/([^\/?#]+)/i,
    /\/d\/([^\/?#]+)/i,
    /[?&]id=([^&#]+)/i
  ];
  for (var i = 0; i < patterns.length; i++) {
    var match = url.match(patterns[i]);
    if (match && match[1]) return safeString_(match[1]);
  }
  return url;
}

/**
 * Verify the actual remote Calendar attachment titles against the current
 * MIME-label policy. This protects against UI/manual drift even when the stored
 * gesFingerprint still equals the desired fingerprint.
 */
function calendarRemoteAttachmentLabelsMatchPlanV4_(remoteEvent, plannedEvent) {
  var expected = (plannedEvent && plannedEvent.attachments || []).map(function(item) {
    return calendarV2NormalizePlannedAttachmentV4_(item);
  });
  var actual = remoteEvent && Array.isArray(remoteEvent.attachments)
    ? remoteEvent.attachments
    : [];

  if (expected.length !== actual.length) return false;
  if (!expected.length) return true;

  var actualByIdentity = {};
  actual.forEach(function(item) {
    var key = calendarAttachmentIdentityV4_(item);
    if (!key || actualByIdentity[key]) return;
    actualByIdentity[key] = item;
  });

  for (var i = 0; i < expected.length; i++) {
    var expectedItem = expected[i];
    var identity = calendarAttachmentIdentityV4_(expectedItem);
    var actualItem = identity ? actualByIdentity[identity] : null;
    if (!actualItem) return false;

    var expectedTitle = calendarV2AttachmentTitleFromMimeTypeV4_(
      expectedItem.mimeType,
      expectedItem.title
    );
    if (safeString_(actualItem.title).trim() !== expectedTitle) return false;
  }
  return true;
}

function calendarRemoteScheduleMatchesPlanV4_(remoteEvent, plannedEvent, timezone) {
  if (!remoteEvent || !remoteEvent.start) return false;

  var remoteRule = remoteEvent.recurrence && remoteEvent.recurrence.length
    ? safeString_(remoteEvent.recurrence[0])
    : '';
  if (remoteRule !== safeString_(plannedEvent.recurrence.rrulePreview)) return false;

  if (plannedEvent.recurrence.allDay) return !!remoteEvent.start.date;
  if (!remoteEvent.start.dateTime) return false;

  try {
    var d = new Date(remoteEvent.start.dateTime);
    var hh = Number(Utilities.formatDate(d, timezone, 'H'));
    var mm = Number(Utilities.formatDate(d, timezone, 'm'));
    return hh === Number(plannedEvent.recurrence.startHour || 0) &&
      mm === Number(plannedEvent.recurrence.startMinute || 0);
  } catch (e) {
    return false;
  }
}

function computeCalendarFirstStartV4_(recurrence, timezone) {
  timezone = safeString_(timezone || 'Asia/Ho_Chi_Minh');
  var byDay = recurrence && Array.isArray(recurrence.byDay) ? recurrence.byDay.slice() : [];
  if (!byDay.length) throw new Error('CALENDAR_BYDAY_REQUIRED');

  var now = new Date();
  var localDate = Utilities.formatDate(now, timezone, 'yyyy-MM-dd');
  var localTime = Utilities.formatDate(now, timezone, 'HH:mm');
  var dateParts = localDate.split('-').map(Number);
  var timeParts = localTime.split(':').map(Number);
  var baseUtcDate = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2]));
  var currentMinutes = timeParts[0] * 60 + timeParts[1];
  var targetMinutes = recurrence.allDay
    ? -1
    : Number(recurrence.startHour || 0) * 60 + Number(recurrence.startMinute || 0);

  var dayCodesByJsDay = ['SU','MO','TU','WE','TH','FR','SA'];
  var selected = null;

  for (var offset = 0; offset < 14; offset++) {
    var candidate = new Date(baseUtcDate.getTime() + offset * 86400000);
    var code = dayCodesByJsDay[candidate.getUTCDay()];
    if (byDay.indexOf(code) === -1) continue;

    if (recurrence.allDay && offset === 0) continue;
    if (!recurrence.allDay && offset === 0 && targetMinutes <= currentMinutes) continue;

    selected = candidate;
    break;
  }

  if (!selected) throw new Error('CALENDAR_FIRST_START_NOT_RESOLVED');

  var dateString = calendarAssetUtcDateToYmdV4_(selected);
  if (recurrence.allDay) {
    return {
      allDay: true,
      startDate: dateString,
      endDate: calendarAssetUtcDateToYmdV4_(new Date(selected.getTime() + 86400000)),
      label: dateString
    };
  }

  var startInstant = calendarAssetLocalDateTimeToUtcV4_(
    dateString,
    Number(recurrence.startHour || 0),
    Number(recurrence.startMinute || 0),
    timezone
  );
  var endInstant = new Date(
    startInstant.getTime() + Number(recurrence.durationMinutes || 15) * 60000
  );

  return {
    allDay: false,
    startDate: dateString,
    startDateTime: startInstant.toISOString(),
    endDateTime: endInstant.toISOString(),
    label: Utilities.formatDate(startInstant, timezone, 'yyyy-MM-dd HH:mm')
  };
}

function calendarAssetLocalDateTimeToUtcV4_(dateString, hour, minute, timezone) {
  var parts = dateString.split('-').map(Number);
  var guessMs = Date.UTC(parts[0], parts[1] - 1, parts[2], hour, minute, 0, 0);
  var guess = new Date(guessMs);
  var offsetMinutes = calendarAssetTimezoneOffsetMinutesV4_(guess, timezone);
  var actual = new Date(guessMs - offsetMinutes * 60000);
  var correctedOffset = calendarAssetTimezoneOffsetMinutesV4_(actual, timezone);
  if (correctedOffset !== offsetMinutes) {
    actual = new Date(guessMs - correctedOffset * 60000);
  }
  return actual;
}

function calendarAssetTimezoneOffsetMinutesV4_(date, timezone) {
  var raw = Utilities.formatDate(date, timezone, 'Z');
  var match = raw.match(/^([+-])(\d{2})(\d{2})$/);
  if (!match) throw new Error('CALENDAR_TIMEZONE_OFFSET_UNRESOLVED: ' + timezone);
  var sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

function calendarAssetUtcDateToYmdV4_(date) {
  return [
    date.getUTCFullYear(),
    calendarAssetPad2V4_(date.getUTCMonth() + 1),
    calendarAssetPad2V4_(date.getUTCDate())
  ].join('-');
}

function calendarAssetPad2V4_(value) {
  return Number(value) < 10 ? '0' + Number(value) : String(Number(value));
}

function calendarAssetRemoteStartLabelV4_(event) {
  if (!event || !event.start) return '';
  return safeString_(event.start.date || event.start.dateTime || '');
}

/* ========================================================================== *
 * Service / lock / misc helpers
 * ========================================================================== */

function assertCalendarServiceAvailableV4_() {
  if (typeof Calendar === 'undefined' || !Calendar.Events || !Calendar.Calendars || !Calendar.Acl) {
    throw new Error('CALENDAR_ADVANCED_SERVICE_NOT_AVAILABLE');
  }
  return true;
}

// Compatibility alias used by the old canary package.
function assertCalendarAdvancedServiceAvailableV4_() {
  return assertCalendarServiceAvailableV4_();
}

function calendarAssetLooksNotFoundV4_(error) {
  return /not\s+found|404/i.test(safeString_(error && error.message || error));
}

function calendarAssetCalendarUrlV4_(calendarId) {
  return 'https://calendar.google.com/calendar/u/0/r?cid=' + encodeURIComponent(calendarId);
}

function withCalendarAssetUserLockV4_(fn) {
  var lock = LockService.getUserLock();
  if (!lock.tryLock(GES_CALENDAR_ASSET_V4.BUILD_LOCK_TIMEOUT_MS)) {
    throw new Error('CALENDAR_ASSET_LOCK_TIMEOUT');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function calendarAssetNormalizeSearchTextV4_(value) {
  var s = safeString_(value).toLowerCase();
  try {
    s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch (e) {}
  return s.replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim();
}
