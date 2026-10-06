/**
 * GES V4 Calendar V2.1 Planner - read only.
 *
 * Builds one deterministic 15-event project plan regardless of Source Doc count.
 * Calendar V2.1 keeps existing logical event keys/Event IDs and updates
 * schedule, descriptions and TARGET_URL hub attachments in-place on Sync.
 */

/**
 * Calendar attachment display-name policy.
 *
 * IMPORTANT:
 * - This changes only the title displayed by Google Calendar.
 * - It never renames the underlying Drive file/folder.
 * - The policy version is included in the event fingerprint so an existing
 *   Calendar V2.1.1 event is reconciled in-place when this policy changes.
 */
const GES_CALENDAR_ATTACHMENT_LABEL_POLICY_V4 = 'mime-v1';

const GES_CALENDAR_ATTACHMENT_TITLE_BY_MIME_V4 = Object.freeze({
  'application/vnd.google-apps.folder': 'Folder',
  'application/vnd.google-apps.spreadsheet': 'Sheet',
  'application/vnd.google-apps.form': 'Form',
  'application/vnd.google-apps.drawing': 'Drawing',
  'application/vnd.google-apps.document': 'Document',
  'application/vnd.google-apps.presentation': 'Presentation'
});

function previewCalendarPlanV4(projectId) {
  var project = resolveCalendarProjectV4_(projectId || '');
  var entity = resolveCalendarEntityProfileV4_(project);
  var snapshot = buildCalendarV2AssetSnapshot_(project);
  var location = resolveCalendarLocationV4_(project, entity);
  var calendar = buildCalendarDefinitionV4_(project, entity, location);
  var context = { project: project, entity: entity, snapshot: snapshot, location: location, calendar: calendar };

  var events = GES_CALENDAR_PLAN_SCHEMA_V4.TEMPLATE.map(function(spec) {
    return buildCalendarPlannedEventV4_(spec, context);
  });

  var warnings = [];
  if (!location.locationText) warnings.push('LOCATION_NOT_RESOLVED');
  if (!snapshot.projectKeyword) warnings.push('PROJECT_KEYWORD_REQUIRED');
  events.forEach(function(event) {
    if (event.availability.status !== 'READY') {
      warnings.push(event.eventKey + ':' + event.availability.status + ':' + event.availability.reason);
    }
  });

  var plan = {
    schemaVersion: GES_CALENDAR_PLAN_SCHEMA_V4.VERSION,
    planType: GES_CALENDAR_PLAN_SCHEMA_V4.PLAN_TYPE,
    mode: GES_CALENDAR_PLAN_SCHEMA_V4.MODE,
    templateId: GES_CALENDAR_PLAN_SCHEMA_V4.TEMPLATE_ID,
    planVersion: GES_CALENDAR_PLAN_SCHEMA_V4.PLAN_VERSION,
    projectId: safeString_(project.projectId),
    projectName: safeString_(project.projectName),
    projectKeyword: snapshot.projectKeyword,
    projectType: safeString_(project.projectType),
    provisioningMode: safeString_(project.provisioningMode),
    calendar: calendar,
    sourceSnapshot: {
      rootFolderId: safeString_(project.rootFolderId),
      registrySheetId: safeString_(project.registrySheetId),
      projectKeyword: snapshot.projectKeyword,
      folderCount: Object.keys(snapshot.folders || {}).filter(function(k) { return snapshot.folders[k] && snapshot.folders[k].exists; }).length,
      exactMatchDocId: safeString_(snapshot.exactMatchDoc && snapshot.exactMatchDoc.id),
      exactMatchSlidesId: safeString_(snapshot.exactMatchSlides && snapshot.exactMatchSlides.id),
      projectUrlSheetId: safeString_(snapshot.projectUrlSheet && snapshot.projectUrlSheet.id),
      projectFormId: safeString_(snapshot.projectForm && snapshot.projectForm.id),
      projectDrawingId: safeString_(snapshot.projectDrawing && snapshot.projectDrawing.id)
    },
    events: events,
    stats: buildCalendarPlanStatsV4_(events),
    warnings: uniqueCalendarStringsV4_(warnings),
    fingerprint: '',
    generatedAt: nowIso_()
  };

  plan.fingerprint = computeCalendarPlanFingerprintV4_(plan);
  var validation = validateCalendarPlanV4(plan);
  if (!validation.valid) throw new Error('Calendar V2.1 Plan không hợp lệ: ' + validation.errors.join(', '));
  plan.validation = validation;
  return plan;
}

function previewActiveCalendarPlanV4() {
  return previewCalendarPlanV4('');
}

function previewK1CalendarPlanV4() {
  var projects = typeof listProjects === 'function' ? listProjects() : [];
  var matches = projects.filter(function(project) {
    return calendarNormalizeSearchTextV4_(project.projectName).indexOf('bao lanh dien visa k1 mat bao lau') !== -1;
  });
  if (!matches.length) throw new Error('Không tìm thấy Project K1.');
  if (matches.length > 1) throw new Error('Có nhiều Project K1. Dùng previewCalendarPlanV4(projectId).');
  return previewCalendarPlanV4(matches[0].projectId);
}

function getCalendarPlanSummaryV4(projectId) {
  return getCalendarPlanSummaryFromPlanV4_(previewCalendarPlanV4(projectId || ''));
}

function getK1CalendarPlanSummaryV4() {
  var result = getCalendarPlanSummaryFromPlanV4_(previewK1CalendarPlanV4());
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function resolveCalendarProjectV4_(projectId) {
  var project = projectId ? getProject_(projectId) : getActiveProject_();
  if (!project) throw new Error('CALENDAR_PROJECT_NOT_FOUND');
  return project;
}

function resolveCalendarEntityProfileV4_(project) {
  if (typeof buildEntityProfileV4 === 'function') {
    try { return buildEntityProfileV4(project.projectId); } catch (ignore) {}
  }
  return {
    organization: { brandName: safeString_(project.brandName), websiteUrl: safeString_(project.websiteUrl) },
    contact: {
      phones: [safeString_(project.phone), safeString_(project.phone2)].filter(function(v) { return !!v; }),
      email: safeString_(project.email), address: safeString_(project.address)
    },
    location: { googleMapsUrl: safeString_(project.googleMapsUrl), timezone: 'Asia/Ho_Chi_Minh' }
  };
}

function buildCalendarDefinitionV4_(project, entity, location) {
  var brandName = entity && entity.organization ? safeString_(entity.organization.brandName) : safeString_(project.brandName);
  var projectName = safeString_(project.projectName);
  var timezone = entity && entity.location && entity.location.timezone
    ? safeString_(entity.location.timezone)
    : GES_CALENDAR_PLAN_SCHEMA_V4.DEFAULTS.TIMEZONE;
  return {
    summary: projectName + (brandName && brandName !== projectName ? ' - ' + brandName : ''),
    description: 'GES Calendar V2.1 cho Project: ' + projectName,
    timezone: timezone || GES_CALENDAR_PLAN_SCHEMA_V4.DEFAULTS.TIMEZONE,
    publicAccess: true,
    aclRole: 'reader',
    eventVisibility: GES_CALENDAR_PLAN_SCHEMA_V4.DEFAULTS.EVENT_VISIBILITY,
    transparency: GES_CALENDAR_PLAN_SCHEMA_V4.DEFAULTS.TRANSPARENCY,
    recurrenceIndefinite: true,
    location: location
  };
}

function resolveCalendarLocationV4_(project, entity) {
  var latitude = null;
  var longitude = null;
  var mapsUrl = '';

  if (project.calendar && project.calendar.location) {
    latitude = calendarNumberOrNullV4_(project.calendar.location.latitude);
    longitude = calendarNumberOrNullV4_(project.calendar.location.longitude);
    mapsUrl = safeString_(project.calendar.location.mapsUrl || '');
  }
  if ((latitude === null || longitude === null) && entity && entity.location) {
    latitude = latitude === null ? calendarNumberOrNullV4_(entity.location.latitude) : latitude;
    longitude = longitude === null ? calendarNumberOrNullV4_(entity.location.longitude) : longitude;
    mapsUrl = mapsUrl || safeString_(entity.location.googleMapsUrl || '');
  }
  mapsUrl = mapsUrl || safeString_(project.googleMapsUrl || '');

  if (latitude === null || longitude === null) {
    var parsed = parseLatLngFromMapsUrlV4_(mapsUrl);
    if (parsed) { latitude = parsed.latitude; longitude = parsed.longitude; }
  }
  return {
    latitude: latitude,
    longitude: longitude,
    locationText: latitude !== null && longitude !== null ? String(latitude) + ',' + String(longitude) : '',
    mapsUrl: mapsUrl,
    source: latitude !== null && longitude !== null ? 'ENTITY_OR_PROJECT_PROFILE' : 'UNRESOLVED'
  };
}

function parseLatLngFromMapsUrlV4_(url) {
  var match = safeString_(url).match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  return { latitude: Number(match[1]), longitude: Number(match[2]) };
}


function buildCalendarPlannedEventV4_(spec, context) {
  var source = resolveCalendarV2EventSource_(spec, context);
  var recurrence = buildCalendarRecurrenceV4_(spec);
  var availability = buildCalendarAvailabilityV4_(source);
  var summary = buildCalendarEventSummaryV4_(spec, context, source);
  var attachments = buildCalendarEventAttachmentsV4_(spec, source, context);
  var urlRefs = buildCalendarEventUrlRefsV4_(spec, source, context);
  var event = {
    eventKey: spec.eventKey,
    role: spec.role,
    sourceKind: spec.sourceKind,
    summary: summary,
    description: buildCalendarEventDescriptionV4_(spec, context, source, urlRefs),
    location: context.location.locationText,
    visibility: context.calendar.eventVisibility,
    transparency: context.calendar.transparency,
    recurrence: recurrence,
    scheduleLabel: calendarScheduleLabelV4_(recurrence),
    source: source,
    attachments: attachments,
    urlRefs: urlRefs,
    availability: availability,
    extendedPropertiesPreview: {
      gesProjectId: safeString_(context.project.projectId),
      gesEventKey: spec.eventKey,
      gesAssetType: safeString_(source.assetType || ''),
      gesAssetId: safeString_(source.id || ''),
      gesCalendarTemplate: GES_CALENDAR_PLAN_SCHEMA_V4.TEMPLATE_ID,
      gesPlanVersion: String(GES_CALENDAR_PLAN_SCHEMA_V4.PLAN_VERSION),
      gesAttachmentLabelPolicy: GES_CALENDAR_ATTACHMENT_LABEL_POLICY_V4
    },
    fingerprint: ''
  };
  event.fingerprint = computeCalendarEventFingerprintV4_(event);
  event.extendedPropertiesPreview.gesFingerprint = event.fingerprint;
  return event;
}

function buildCalendarAvailabilityV4_(source) {
  var status = safeString_(source && source.status || '').toUpperCase();
  if (source && source.ready) return { ready: true, status: 'READY', reason: safeString_(source.reason || 'SOURCE_RESOLVED') };
  if (status === 'NEEDS_REVIEW') return { ready: false, status: 'NEEDS_REVIEW', reason: safeString_(source.reason || 'NEEDS_REVIEW') };
  if (status === 'DEFERRED') return { ready: false, status: 'DEFERRED', reason: safeString_(source.reason || 'DEFERRED') };
  return { ready: false, status: 'MISSING_SOURCE', reason: safeString_(source && source.reason || 'SOURCE_NOT_FOUND') };
}

function buildCalendarRecurrenceV4_(spec) {
  var allDay = spec.allDay === true;
  var byDay = (spec.byDay || []).slice();
  var parts = ['RRULE:FREQ=WEEKLY', 'BYDAY=' + byDay.join(',')];
  return {
    frequency: 'WEEKLY', byDay: byDay, allDay: allDay,
    startHour: allDay ? null : Number(spec.hour || 0),
    startMinute: allDay ? null : Number(spec.minute || 0),
    durationMinutes: allDay ? null : GES_CALENDAR_PLAN_SCHEMA_V4.DEFAULTS.TIMED_EVENT_DURATION_MINUTES,
    indefinite: true,
    rrulePreview: parts.join(';')
  };
}

function buildCalendarEventSummaryV4_(spec, context, source) {
  var keyword = safeString_(context.snapshot.projectKeyword || context.project.projectName);
  switch (spec.role) {
    case 'TARGET_URL': return safeString_(context.project.targetPageUrl || context.project.websiteUrl || keyword);
    case 'PROJECT_FOLDER': return keyword;
    case 'ARTICLES_FOLDER': return keyword + ' Articles';
    case 'DOCX_FOLDER': return keyword + ' DOCX';
    case 'SLIDES_FOLDER': return keyword + ' Slides';
    case 'PDFS_FOLDER': return keyword + ' PDFs';
    case 'PHOTOS_FOLDER': return keyword + ' Photos';
    case 'VIDEOS_FOLDER': return keyword + ' Videos';
    case 'PODCAST_FOLDER': return keyword + ' Podcasts';
    case 'HTML_FOLDER': return keyword + ' HTML';
    case 'PROJECT_URL_SHEET':
    case 'EXACT_MATCH_DOC':
    case 'EXACT_MATCH_SLIDES':
    case 'PROJECT_FORM':
    case 'PROJECT_DRAWING': return keyword;
    default: return source && source.name ? source.name : keyword;
  }
}

function buildCalendarEventAttachmentsV4_(spec, source, context) {
  if (spec.role === 'TARGET_URL') {
    return buildCalendarTargetHubAttachmentsV21_(context);
  }
  if (!source || !source.ready || !source.id) return [];
  return [calendarV2AttachmentFromSource_(source)];
}

/**
 * TARGET_URL is the hub event for one GES project.
 * Attach only canonical project-level folders/singletons + exact-match Doc/Slides.
 * Do not attach every generated PDF/DOCX/HTML child file.
 */
function buildCalendarTargetHubAttachmentsV21_(context) {
  var snapshot = context.snapshot || {};
  var candidates = [];

  function add(source) {
    if (!source || !source.ready || !source.id) return;
    candidates.push(calendarV2AttachmentFromSource_(source));
  }

  // PROJECT_FOLDER resolves project.rootFolderId. For Homepage this may be the
  // global site root; PAGE_TARGET projects resolve their own project subfolder.
  add(calendarV21FolderSourceFromSnapshot_(snapshot, 'ROOT'));
  ['ARTICLES','DOCX','HTML','SLIDES','PDF','PHOTOS','VIDEOS','PODCASTS'].forEach(function(key) {
    add(calendarV21FolderSourceFromSnapshot_(snapshot, key));
  });

  add(snapshot.projectUrlSheet);
  add(snapshot.projectForm);
  add(snapshot.projectDrawing);
  add(snapshot.exactMatchDoc);
  add(snapshot.exactMatchSlides);

  var seen = {};
  return candidates.filter(function(item) {
    var id = safeString_(item.fileId);
    if (!id || seen[id]) return false;
    seen[id] = true;
    return true;
  }).slice(0, GES_CALENDAR_PLAN_SCHEMA_V4.DEFAULTS.MAX_ATTACHMENTS);
}

function calendarV21FolderSourceFromSnapshot_(snapshot, key) {
  var folder = snapshot && snapshot.folders ? snapshot.folders[key] : null;
  if (!folder || !folder.exists || !folder.id) return null;
  return {
    kind: 'DRIVE_FOLDER',
    assetType: key === 'ROOT' ? 'PROJECT_FOLDER' : key + '_FOLDER',
    id: safeString_(folder.id),
    name: safeString_(folder.name),
    url: safeString_(folder.url),
    mimeType: 'application/vnd.google-apps.folder',
    exists: true,
    ready: true,
    status: 'READY',
    reason: 'CANONICAL_FOLDER_RESOLVED'
  };
}

function calendarV2AttachmentFromSource_(source) {
  return calendarV2NormalizePlannedAttachmentV4_({
    fileId: safeString_(source.id),
    title: safeString_(source.name),
    mimeType: safeString_(source.mimeType),
    fileUrl: safeString_(source.url),
    driveKind: source.kind === 'DRIVE_FOLDER' ? 'FOLDER' : 'FILE'
  });
}

/**
 * Resolve the Calendar display title from MIME type.
 * Unknown MIME types keep their original/fallback title.
 */
function calendarV2AttachmentTitleFromMimeTypeV4_(mimeType, fallbackTitle) {
  var normalizedMime = safeString_(mimeType).trim().toLowerCase();
  var canonical = GES_CALENDAR_ATTACHMENT_TITLE_BY_MIME_V4[normalizedMime];
  if (canonical) return canonical;
  return safeString_(fallbackTitle).trim() || 'Attachment';
}

/**
 * Normalize one planned attachment without mutating the caller's object.
 * The file identity/URL/MIME remain unchanged; only the display title is
 * canonicalized according to the MIME policy above.
 */
function calendarV2NormalizePlannedAttachmentV4_(attachment) {
  attachment = attachment || {};
  var normalized = Object.assign({}, attachment);
  normalized.title = calendarV2AttachmentTitleFromMimeTypeV4_(
    normalized.mimeType,
    normalized.title
  );
  return normalized;
}

function buildCalendarEventUrlRefsV4_(spec, source, context) {
  var refs = [];
  function add(label, url, type) {
    var value = safeString_(url).trim();
    if (value) refs.push({ label: safeString_(label || value), url: value, type: type || 'URL' });
  }

  if (spec.role === 'TARGET_URL') {
    var publicRows = typeof getCalendarPublicAssetRowsV21_ === 'function'
      ? getCalendarPublicAssetRowsV21_(context)
      : [];
    var relevant = typeof selectCalendarTargetRelevantLinksV21_ === 'function'
      ? selectCalendarTargetRelevantLinksV21_(context, publicRows)
      : [];
    relevant.forEach(function(row) {
      add(row.displayName || row.name, row.url, row.variantType || 'PUBLIC_ASSET');
    });

    // Always retain a direct link to the full Public Project Sheet as overflow.
    var publicSheet = context.snapshot.projectUrlSheet;
    if (publicSheet && publicSheet.ready && publicSheet.url) {
      add(
        typeof findCalendarPublicDisplayNameV21_ === 'function'
          ? findCalendarPublicDisplayNameV21_(context, publicSheet.url, publicSheet.name || 'Public Project Sheet')
          : (publicSheet.name || 'Public Project Sheet'),
        publicSheet.url,
        'PROJECT_PUBLIC_SHEET'
      );
    }
  } else if (source && source.url) {
    var displayName = typeof findCalendarPublicDisplayNameV21_ === 'function'
      ? findCalendarPublicDisplayNameV21_(context, source.url, source.name || spec.role)
      : (source.name || spec.role);
    add(displayName, source.url, source.kind || 'SOURCE');
  }
  return uniqueCalendarUrlRefsV4_(refs);
}

function buildCalendarEventDescriptionV4_(spec, context, source, urlRefs) {
  if (spec.role === 'TARGET_URL') {
    return buildCalendarTargetUrlDescriptionV21_(context, urlRefs || []);
  }
  return buildCalendarStandardAssetDescriptionV21_(spec, context, source, urlRefs || []);
}

function buildCalendarTargetUrlDescriptionV21_(context, urlRefs) {
  var targetUrl = safeString_(context.project.targetPageUrl || context.project.websiteUrl);
  var keyword = safeString_(context.snapshot.projectKeyword || context.project.projectName);
  var entity = context.entity || {};
  var org = entity.organization || {};
  var contact = entity.contact || {};
  var brandName = safeString_(org.brandName || context.project.brandName || context.project.projectName);
  var address = safeString_(contact.address || context.project.address);
  var phones = [].concat(contact.phones || [], [context.project.phone, context.project.phone2])
    .map(function(v) { return safeString_(v).trim(); })
    .filter(function(v, i, arr) { return !!v && arr.indexOf(v) === i; });

  var lines = [];
  lines.push('Meeting Topics :');
  lines.push(typeof calendarV21Anchor_ === 'function' ? calendarV21Anchor_(keyword, targetUrl) : (keyword + ': ' + targetUrl));
  lines.push('');
  if (brandName) lines.push(calendarV21SafeHtmlText_(brandName));
  if (address) lines.push(calendarV21SafeHtmlText_(address));
  if (phones.length) lines.push(calendarV21SafeHtmlText_(phones.join(' | ')));
  lines.push('');
  lines.push('RELEVANT INFO for this meeting :');

  var body = lines.join('<br>');
  var used = {};
  var maxChars = (typeof GES_CALENDAR_PUBLIC_SHEET_BRIDGE_V21 !== 'undefined')
    ? GES_CALENDAR_PUBLIC_SHEET_BRIDGE_V21.MAX_TARGET_DESCRIPTION_CHARS
    : 12000;
  (urlRefs || []).forEach(function(ref) {
    var url = safeString_(ref.url).trim();
    if (!url || used[url]) return;
    used[url] = true;
    var line = typeof calendarV21Anchor_ === 'function'
      ? calendarV21Anchor_(ref.label || url, url)
      : ((ref.label || url) + ': ' + url);
    if ((body + '<br>' + line).length > maxChars) return;
    body += '<br>' + line;
  });

  body += '<br><br>Website URL : ' + (typeof calendarV21Anchor_ === 'function'
    ? calendarV21Anchor_(targetUrl || keyword, targetUrl)
    : targetUrl);
  return body;
}

function buildCalendarStandardAssetDescriptionV21_(spec, context, source, urlRefs) {
  var lines = [
    'Weekly Documentation Meeting :',
    'The list of documents to be analysed.',
    '',
    'Document :'
  ];
  var sourceUrl = safeString_(source && source.url);
  var displayName = source && source.name ? source.name : (context.snapshot.projectKeyword || context.project.projectName);
  if (urlRefs && urlRefs.length) {
    displayName = safeString_(urlRefs[0].label || displayName);
    sourceUrl = safeString_(urlRefs[0].url || sourceUrl);
  }
  lines.push(typeof calendarV21Anchor_ === 'function'
    ? calendarV21Anchor_(displayName, sourceUrl)
    : (displayName + (sourceUrl ? ': ' + sourceUrl : '')));
  return lines.map(calendarV21SafeHtmlLine_).join('<br>');
}

function calendarV21SafeHtmlLine_(line) {
  line = safeString_(line);
  if (/^<a\s/i.test(line)) return line;
  return calendarV21SafeHtmlText_(line);
}

function calendarV21SafeHtmlText_(value) {
  return typeof calendarV21EscapeHtml_ === 'function'
    ? calendarV21EscapeHtml_(value)
    : safeString_(value);
}

function computeCalendarEventFingerprintV4_(event) {
  var normalizedAttachments = (event.attachments || []).map(function(attachment) {
    return calendarV2NormalizePlannedAttachmentV4_(attachment);
  });
  return sha256Hex_(calendarStableJsonV4_({
    attachmentLabelPolicy: GES_CALENDAR_ATTACHMENT_LABEL_POLICY_V4,
    eventKey: event.eventKey, role: event.role, summary: event.summary,
    description: event.description, location: event.location,
    visibility: event.visibility, transparency: event.transparency,
    recurrence: event.recurrence, source: event.source,
    attachments: normalizedAttachments, urlRefs: event.urlRefs
  }));
}

function computeCalendarPlanFingerprintV4_(plan) {
  return sha256Hex_(calendarStableJsonV4_({
    schemaVersion: plan.schemaVersion,
    templateId: plan.templateId,
    planVersion: plan.planVersion,
    projectId: plan.projectId,
    projectKeyword: plan.projectKeyword,
    calendar: plan.calendar,
    sourceSnapshot: plan.sourceSnapshot,
    events: (plan.events || []).map(function(event) {
      return { eventKey: event.eventKey, availability: event.availability, fingerprint: event.fingerprint };
    })
  }));
}

function buildCalendarPlanStatsV4_(events) {
  var stats = { total: 0, ready: 0, deferred: 0, missingSource: 0, needsReview: 0, allDaySeries: 0, timedSeries: 0 };
  (events || []).forEach(function(event) {
    stats.total++;
    if (event.availability.status === 'READY') stats.ready++;
    if (event.availability.status === 'DEFERRED') stats.deferred++;
    if (event.availability.status === 'MISSING_SOURCE') stats.missingSource++;
    if (event.availability.status === 'NEEDS_REVIEW') stats.needsReview++;
    if (event.recurrence.allDay) stats.allDaySeries++; else stats.timedSeries++;
  });
  return stats;
}

function getCalendarPlanSummaryFromPlanV4_(plan) {
  return {
    schemaVersion: plan.schemaVersion,
    mode: plan.mode,
    templateId: plan.templateId,
    planVersion: plan.planVersion,
    projectId: plan.projectId,
    projectName: plan.projectName,
    projectKeyword: plan.projectKeyword,
    calendar: plan.calendar,
    stats: plan.stats,
    events: plan.events.map(function(event) {
      return {
        eventKey: event.eventKey, role: event.role, summary: event.summary,
        scheduleLabel: event.scheduleLabel, recurrence: event.recurrence,
        availability: event.availability, source: event.source,
        attachmentCount: event.attachments.length, urlRefCount: event.urlRefs.length,
        fingerprint: event.fingerprint
      };
    }),
    warnings: plan.warnings,
    fingerprint: plan.fingerprint,
    valid: plan.validation.valid
  };
}

function calendarScheduleLabelV4_(recurrence) {
  var days = (recurrence.byDay || []).join(',');
  if (recurrence.allDay) return days + ' | ALL DAY | WEEKLY';
  var hh = String(recurrence.startHour).padStart(2, '0');
  var mm = String(recurrence.startMinute || 0).padStart(2, '0');
  return days + ' | ' + hh + ':' + mm + ' | WEEKLY';
}

function uniqueCalendarUrlRefsV4_(items) {
  var seen = {};
  return (items || []).filter(function(item) {
    var key = safeString_(item.url).trim();
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function uniqueCalendarStringsV4_(items) {
  var seen = {};
  return (items || []).filter(function(item) {
    var key = safeString_(item);
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function calendarNumberOrNullV4_(value) {
  if (value === null || value === undefined || value === '') return null;
  var n = Number(value);
  return isFinite(n) ? n : null;
}

function calendarNormalizeSearchTextV4_(value) {
  var s = safeString_(value).toLowerCase();
  try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (ignore) {}
  s = s.replace(/đ/g, 'd');
  return s.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
