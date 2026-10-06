/**
 * GES V4 Calendar V2.1.1 plan schema.
 *
 * Project-centric contract:
 * - exactly 15 logical recurring event roles per GES project;
 * - no event multiplication by Source Doc count;
 * - Project URL Sheet / Project Form / Project Drawing are project singletons;
 * - exact-match Doc/Slides are resolved by Project Keyword;
 * - My Maps / Earth remain outside Calendar V2 and will be handled later.
 */

const GES_CALENDAR_PLAN_SCHEMA_V4 = Object.freeze({
  VERSION: '2.1.1',
  PLAN_TYPE: 'GES_CALENDAR_PLAN',
  MODE: 'PREVIEW_ONLY',
  TEMPLATE_ID: 'GES_PROJECT_CALENDAR_V2_15_EVENTS',
  PLAN_VERSION: 4,

  DEFAULTS: Object.freeze({
    TIMEZONE: 'Asia/Ho_Chi_Minh',
    PUBLIC_ACCESS: true,
    EVENT_VISIBILITY: 'public',
    TRANSPARENCY: 'transparent',
    RECURRENCE_FREQUENCY: 'WEEKLY',
    RECURRENCE_INDEFINITE: true,
    TIMED_EVENT_DURATION_MINUTES: 15,
    MAX_ATTACHMENTS: 25
  }),

  DAYS: Object.freeze({
    MO: 'MONDAY', TU: 'TUESDAY', WE: 'WEDNESDAY', TH: 'THURSDAY',
    FR: 'FRIDAY', SA: 'SATURDAY', SU: 'SUNDAY'
  }),

  AVAILABILITY: Object.freeze([
    'READY', 'DEFERRED', 'MISSING_SOURCE', 'NEEDS_REVIEW'
  ]),

  SOURCE_KINDS: Object.freeze([
    'TARGET_URL', 'DRIVE_FOLDER', 'DRIVE_FILE'
  ]),

  EVENT_ROLES: Object.freeze([
    'TARGET_URL',
    'PROJECT_FOLDER',
    'ARTICLES_FOLDER',
    'DOCX_FOLDER',
    'SLIDES_FOLDER',
    'PDFS_FOLDER',
    'PHOTOS_FOLDER',
    'VIDEOS_FOLDER',
    'PODCAST_FOLDER',
    'HTML_FOLDER',
    'PROJECT_URL_SHEET',
    'EXACT_MATCH_DOC',
    'EXACT_MATCH_SLIDES',
    'PROJECT_FORM',
    'PROJECT_DRAWING'
  ]),

  /**
   * Calendar V2.1 schedule baseline confirmed from the user's reference Calendar.
   * Timed events use a 15-minute duration for API-safe start/end semantics.
   * PROJECT_FOLDER always resolves project.rootFolderId: Homepage may point to the
   * global site root; PAGE_TARGET projects point to their own project subfolder.
   */
  TEMPLATE: Object.freeze([
    Object.freeze({
      eventKey: 'TARGET_URL', role: 'TARGET_URL', sourceKind: 'TARGET_URL',
      allDay: true, byDay: ['MO','TU','WE','TH','FR'], hour: null, minute: null
    }),
    Object.freeze({
      eventKey: 'PROJECT_FOLDER', role: 'PROJECT_FOLDER', sourceKind: 'DRIVE_FOLDER', folderKey: 'ROOT',
      allDay: false, byDay: ['TU'], hour: 8, minute: 0
    }),
    Object.freeze({
      eventKey: 'ARTICLES_FOLDER', role: 'ARTICLES_FOLDER', sourceKind: 'DRIVE_FOLDER', folderKey: 'ARTICLES',
      allDay: false, byDay: ['SA'], hour: 9, minute: 0
    }),
    Object.freeze({
      eventKey: 'DOCX_FOLDER', role: 'DOCX_FOLDER', sourceKind: 'DRIVE_FOLDER', folderKey: 'DOCX',
      allDay: false, byDay: ['SA'], hour: 13, minute: 0
    }),
    Object.freeze({
      eventKey: 'SLIDES_FOLDER', role: 'SLIDES_FOLDER', sourceKind: 'DRIVE_FOLDER', folderKey: 'SLIDES',
      allDay: false, byDay: ['TH'], hour: 9, minute: 0
    }),
    Object.freeze({
      eventKey: 'PDFS_FOLDER', role: 'PDFS_FOLDER', sourceKind: 'DRIVE_FOLDER', folderKey: 'PDF',
      allDay: false, byDay: ['WE'], hour: 10, minute: 0
    }),
    Object.freeze({
      eventKey: 'PHOTOS_FOLDER', role: 'PHOTOS_FOLDER', sourceKind: 'DRIVE_FOLDER', folderKey: 'PHOTOS',
      allDay: false, byDay: ['TH'], hour: 16, minute: 0
    }),
    Object.freeze({
      eventKey: 'VIDEOS_FOLDER', role: 'VIDEOS_FOLDER', sourceKind: 'DRIVE_FOLDER', folderKey: 'VIDEOS',
      allDay: false, byDay: ['SU'], hour: 17, minute: 0
    }),
    Object.freeze({
      eventKey: 'PODCAST_FOLDER', role: 'PODCAST_FOLDER', sourceKind: 'DRIVE_FOLDER', folderKey: 'PODCASTS',
      allDay: false, byDay: ['SU'], hour: 13, minute: 0
    }),
    Object.freeze({
      eventKey: 'HTML_FOLDER', role: 'HTML_FOLDER', sourceKind: 'DRIVE_FOLDER', folderKey: 'HTML',
      allDay: false, byDay: ['SU'], hour: 9, minute: 0
    }),
    Object.freeze({
      eventKey: 'PROJECT_URL_SHEET', role: 'PROJECT_URL_SHEET', sourceKind: 'DRIVE_FILE', assetType: 'PROJECT_URL_SHEET',
      allDay: true, byDay: ['MO','TU','WE','TH','FR'], hour: null, minute: null
    }),
    Object.freeze({
      eventKey: 'EXACT_MATCH_DOC', role: 'EXACT_MATCH_DOC', sourceKind: 'DRIVE_FILE', assetType: 'DOC',
      allDay: true, byDay: ['MO','TU','WE','TH','FR'], hour: null, minute: null
    }),
    Object.freeze({
      eventKey: 'EXACT_MATCH_SLIDES', role: 'EXACT_MATCH_SLIDES', sourceKind: 'DRIVE_FILE', assetType: 'SLIDES',
      allDay: false, byDay: ['TU'], hour: 16, minute: 0
    }),
    Object.freeze({
      eventKey: 'PROJECT_FORM', role: 'PROJECT_FORM', sourceKind: 'DRIVE_FILE', assetType: 'PROJECT_FORM',
      allDay: false, byDay: ['FR'], hour: 11, minute: 0
    }),
    Object.freeze({
      eventKey: 'PROJECT_DRAWING', role: 'PROJECT_DRAWING', sourceKind: 'DRIVE_FILE', assetType: 'PROJECT_DRAWING',
      allDay: false, byDay: ['FR'], hour: 7, minute: 0
    })
  ])
});

function getCalendarPlanSchemaV4() {
  return cloneJson_(GES_CALENDAR_PLAN_SCHEMA_V4);
}

function validateCalendarPlanV4(plan) {
  var errors = [];
  var warnings = [];

  if (!plan || typeof plan !== 'object') {
    return { valid: false, errors: ['PLAN_REQUIRED'], warnings: [] };
  }
  if (safeString_(plan.schemaVersion) !== GES_CALENDAR_PLAN_SCHEMA_V4.VERSION) errors.push('INVALID_SCHEMA_VERSION');
  if (safeString_(plan.planType) !== GES_CALENDAR_PLAN_SCHEMA_V4.PLAN_TYPE) errors.push('INVALID_PLAN_TYPE');
  if (safeString_(plan.mode) !== GES_CALENDAR_PLAN_SCHEMA_V4.MODE) errors.push('PLAN_MUST_BE_PREVIEW_ONLY');
  if (!safeString_(plan.projectId)) errors.push('PROJECT_ID_REQUIRED');
  if (!safeString_(plan.projectName)) errors.push('PROJECT_NAME_REQUIRED');
  if (!plan.calendar || !safeString_(plan.calendar.summary)) errors.push('CALENDAR_SUMMARY_REQUIRED');
  if (!plan.calendar || !safeString_(plan.calendar.timezone)) errors.push('CALENDAR_TIMEZONE_REQUIRED');
  if (!Array.isArray(plan.events)) errors.push('EVENTS_ARRAY_REQUIRED');
  if ((plan.events || []).length !== GES_CALENDAR_PLAN_SCHEMA_V4.EVENT_ROLES.length) errors.push('CALENDAR_V2_1_REQUIRES_15_EVENTS');

  var seenKeys = {};
  (plan.events || []).forEach(function(event, index) {
    var prefix = 'EVENT_' + index + '_';
    var key = safeString_(event.eventKey);
    if (!key) errors.push(prefix + 'KEY_REQUIRED');
    if (key && seenKeys[key]) errors.push(prefix + 'DUPLICATE_EVENT_KEY_' + key);
    if (key) seenKeys[key] = true;

    if (GES_CALENDAR_PLAN_SCHEMA_V4.EVENT_ROLES.indexOf(safeString_(event.role)) === -1) errors.push(prefix + 'INVALID_ROLE');
    if (GES_CALENDAR_PLAN_SCHEMA_V4.SOURCE_KINDS.indexOf(safeString_(event.sourceKind)) === -1) errors.push(prefix + 'INVALID_SOURCE_KIND');
    if (!event.recurrence || safeString_(event.recurrence.frequency) !== 'WEEKLY') errors.push(prefix + 'INVALID_RECURRENCE');
    if (!event.recurrence || !Array.isArray(event.recurrence.byDay) || !event.recurrence.byDay.length) errors.push(prefix + 'BYDAY_REQUIRED');
    if (!event.availability || GES_CALENDAR_PLAN_SCHEMA_V4.AVAILABILITY.indexOf(safeString_(event.availability.status)) === -1) errors.push(prefix + 'INVALID_AVAILABILITY');
  });

  GES_CALENDAR_PLAN_SCHEMA_V4.EVENT_ROLES.forEach(function(role) {
    if (!seenKeys[role]) errors.push('MISSING_EVENT_ROLE_' + role);
  });

  if (plan.calendar && plan.calendar.publicAccess !== true) warnings.push('CALENDAR_NOT_PUBLIC');
  if (!plan.calendar || !plan.calendar.location || !safeString_(plan.calendar.location.locationText)) warnings.push('CALENDAR_LOCATION_MISSING');

  return { valid: errors.length === 0, errors: errors, warnings: warnings };
}

function calendarStableJsonV4_(value) {
  return JSON.stringify(calendarStableNormalizeV4_(value));
}

function calendarStableNormalizeV4_(value) {
  if (Array.isArray(value)) return value.map(calendarStableNormalizeV4_);
  if (value && typeof value === 'object' && Object.prototype.toString.call(value) === '[object Object]') {
    var out = {};
    Object.keys(value).sort().forEach(function(key) {
      if (value[key] === undefined) return;
      out[key] = calendarStableNormalizeV4_(value[key]);
    });
    return out;
  }
  return value;
}
