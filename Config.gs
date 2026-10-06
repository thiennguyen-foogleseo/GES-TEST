/**
 * Multi-Project Google Entity Stack Manager V4.6.8 - Resumable Selective Sync Queue & Large Project Optimization.
 *
 * V4 is intentionally backward-compatible with the stable V3.1 lifecycle
 * profile while adding V4 canonical content + entity schemas in Shadow Mode.
 * Blogger/social publishing and the legacy Sites Renderer are out of scope.
 */

const GES_CONFIG = {
  APP_NAME: 'Multi-Project Google Entity Stack Manager V4.6.8',
  APP_VERSION: '4.6.8-resumable-selective-sync-queue-v1',
  SCHEMA_VERSION: '4.0.0',

  // Keep lifecycle profile storage compatible during G1. V4 entity/content
  // models are versioned independently and are built on demand.
  PROFILE_SCHEMA_VERSION: '3.1.0',
  ENTITY_PROFILE_SCHEMA_VERSION: '1.0.0',
  CONTENT_MODEL_SCHEMA_VERSION: '1.0.0',
  BRANDING_SCHEMA_VERSION: 1,
  REGISTRY_SCHEMA_VERSION: 1,
  URL_RULE_VERSION: 1,
  HTML_RENDERER_VERSION: '1.2.1-resource-footer-v4671',

  PROJECT_TYPES: [
    'UNSPECIFIED',
    'HOMEPAGE',
    'PAGE_TARGET',
    'SERVICE_PAGE',
    'ARTICLE',
    'AUTHOR',
    'BRAND',
    'OTHER'
  ],

  PROVISIONING_MODES: [
    'UNSET',
    'NEW_STACK',
    'MIGRATE_V2'
  ],

  MIGRATION_STATUSES: [
    'UNCLASSIFIED',
    'NOT_REQUIRED',
    'PENDING',
    'PREVIEWED',
    'BACKED_UP',
    'MIGRATING',
    'COMPLETED',
    'VERIFIED',
    'ROLLED_BACK',
    'FAILED'
  ],

  // Clean-master defaults. These values MUST NOT point to any real customer.
  // First-project creation is explicit and NEW_STACK by default.
  BOOTSTRAP: {
    ROOT_FOLDER_ID: '',
    BRAND_NAME: '',
    PROJECT_NAME: '',
    PROJECT_TYPE: 'UNSPECIFIED',
    PROVISIONING_MODE: 'NEW_STACK',
    TARGET_PAGE_URL: '',
    WEBSITE_URL: '',
    GOOGLE_MAPS_URL: '',
    GOOGLE_SITES_URL: '',
    LOGO_FILE_ID: '',
    CTA_FILE_ID: '',
    LOGO_PUBLIC_URL: '',
    CTA_PUBLIC_URL: '',
    PHONE: '',
    PHONE_2: '',
    EMAIL: '',
    ADDRESS: ''
  },

  CLEAN_INSTALLATION_V452: {
    VERSION: '4.5.2',
    POLICY: 'EXPLICIT_FIRST_PROJECT_NO_CUSTOMER_DEFAULTS',
    CLEAN_MASTER_MODE: true,
    ALLOW_IMPLICIT_BOOTSTRAP: false,
    REQUIRE_EXPLICIT_ROOT_FOLDER: true,
    REQUIRE_EXPLICIT_PROJECT_NAME: true,
    REQUIRE_EXPLICIT_PROJECT_TYPE: true,
    REQUIRE_EXPLICIT_BRAND: true,
    REQUIRE_EXPLICIT_WEBSITE: true,
    DEFAULT_PROVISIONING_MODE: 'NEW_STACK'
  },

  FOLDER_SUFFIXES: {
    ARTICLES: 'Articles',
    DOCX: 'DOCX',
    HTML: 'HTML',
    SLIDES: 'Slides',
    PDF: 'PDFs',
    PHOTOS: 'Photos',
    VIDEOS: 'Videos',
    PODCASTS: 'Podcasts',

    // Legacy-only suffixes. V4.1 no longer provisions these folders.
    SHEETS: 'Sheets',
    FORMS: 'Forms'
  },

  MIME: {
    GOOGLE_DOCS: 'application/vnd.google-apps.document',
    GOOGLE_SHEETS: 'application/vnd.google-apps.spreadsheet',
    GOOGLE_FORMS: 'application/vnd.google-apps.form',
    GOOGLE_DRAWINGS: 'application/vnd.google-apps.drawing',
    GOOGLE_SLIDES: 'application/vnd.google-apps.presentation',
    PDF: 'application/pdf',
    DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    HTML: 'text/html'
  },

  // Source-Doc scoped managed outputs. Project-scoped structured assets are
  // handled separately so one project never creates one Form/Sheet per Doc.
  MANAGED_ASSET_TYPES: ['SLIDES', 'PDF', 'DOCX', 'HTML'],
  PROJECT_MANAGED_ASSET_TYPES: ['PROJECT_URL_SHEET', 'PROJECT_FORM'],
  PROJECT_SINGLETON_ASSET_TYPES: ['PROJECT_URL_SHEET', 'PROJECT_FORM', 'PROJECT_DRAWING', 'PROJECT_MY_MAPS', 'PROJECT_EARTH'],
  DRIVE_INVENTORY_TYPES: ['DOC', 'SHEET', 'FORM', 'DRAWING', 'SLIDES', 'PDF', 'DOCX', 'HTML', 'PROJECT_URL_SHEET', 'PROJECT_FORM', 'PROJECT_DRAWING'],

  PROJECT_STRUCTURE_V41: {
    VERSION: '4.1.0',
    MODE: 'PROJECT_CENTRIC',
    MIGRATION_POLICY: 'PRESERVE_LEGACY_NO_AUTO_MIGRATION',
    CANONICAL_FOLDER_KEYS: ['ARTICLES','DOCX','HTML','SLIDES','PDF','PHOTOS','VIDEOS','PODCASTS'],
    RETIRED_FOLDER_KEYS: ['SHEETS','FORMS'],
    CALENDAR_V2_PENDING: false
  },

  CALENDAR_V2: {
    VERSION: '2.0.0',
    TEMPLATE_ID: 'GES_PROJECT_CALENDAR_V2_15_EVENTS',
    EVENT_COUNT: 15,
    MIGRATION_POLICY: 'EXPLICIT_PREVIEW_THEN_APPLY_NO_DELETE'
  },

  PRIVATE_SYSTEM_V45: {
    VERSION: '4.5.0',
    ROOT_NAME: 'GES Private System',
    STORAGE_POLICY: 'GLOBAL_PRIVATE_ROOT_PER_PROJECT_SUBFOLDER',
    MIGRATION_POLICY: 'PREVIEW_APPLY_VERIFY_NO_DELETE',
    ENTITY_RETIREMENT_POLICY: 'PRIVATE_ARCHIVE_INDEX_NO_RUNTIME_DEPENDENCY'
  },

  CANONICAL_FOLDER_NAME_RECONCILE_V451: {
    VERSION: '4.5.1',
    POLICY: 'EXPLICIT_PREVIEW_APPLY_VERIFY_KEEP_FOLDER_IDS',
    EXPECTED_NAME_SOURCE: 'LIVE_PROJECT_ROOT_NAME',
    CANONICAL_FOLDER_COUNT: 8
  },

  PUBLIC_SHEET_V43: {
    VERSION: '1.0.0',
    TABS: ['Assets','URL Variants','Content'],
    CONTENT_MODE: 'ALL_DIRECT_ARTICLES_DOCS',
    SHARE_MODE: 'ANYONE_WITH_LINK_VIEW',
    PUBLISH_MODE: 'MANUAL_PUBLISHED_URL_REQUIRED',
    REGISTRY_SOURCE_OF_TRUTH: true
  },

  PROPERTY_KEYS: {
    PROJECT_INDEX: 'V3_PROJECT_INDEX',
    ACTIVE_PROJECT: 'V3_ACTIVE_PROJECT',
    PROJECT_PREFIX: 'V3_PROJECT_',
    PROFILE_BACKUP_PREFIX: 'V31_PROFILE_BACKUP_',
    ASSET_PREFIX: 'V3_ASSET_',
    PUBLISHED_PREFIX: 'V3_PUBLISHED_',
    SCAN_STATE_PREFIX: 'V3_SCAN_STATE_',
    GLOBAL_SCAN_TRIGGER_ID: 'V3_GLOBAL_SCAN_TRIGGER_ID',
    PRIVATE_SYSTEM_ROOT_ID: 'V45_PRIVATE_SYSTEM_ROOT_ID'
  },

  V3_META_START: '[TCVS_V3_META]',
  V3_META_END: '[/TCVS_V3_META]',

  LEGACY_V2_SOURCE_MARKER: 'TCVS_V2_SOURCE_DOC_ID=',
  LEGACY_V2_TYPE_MARKER: 'TCVS_V2_ASSET_TYPE=',

  SLIDES: {
    MAX_ITEMS_PER_SLIDE: 6,
    MAX_CHARS_PER_SLIDE: 850,
    MAX_CHARS_PER_ITEM: 350,
    FONT_FAMILY: 'Arial',
    TITLE_FONT_SIZE: 24,
    BODY_FONT_SIZE: 15,
    FOOTER_FONT_SIZE: 8,
    BRAND_ACCENT: '#1A73E8',
    TEXT_DARK: '#202124',
    TEXT_GRAY: '#5F6368',
    ADD_FINAL_ENTITY_SLIDE: true
  },

  BRANDING: {
    CACHE_SECONDS: 21600,
    TEMP_DOC_PREFIX: '.GES_BRAND_TMP_',
    DEFAULT_SLIDE_LOGO_WIDTH_PT: 105,
    DEFAULT_SLIDE_CTA_MAX_HEIGHT_PT: 52,
    DEFAULT_DOC_LOGO_WIDTH_PX: 130,
    DEFAULT_DOC_CTA_WIDTH_PX: 500
  },

  SCANNER: {
    DEFAULT_ENABLED: false,
    DEFAULT_INTERVAL_MINUTES: 15,
    FULL_RECONCILE_HOURS: 24,
    PAGE_SIZE: 100,
    EXECUTION_BUDGET_MS: 240000,
    GLOBAL_TRIGGER_MINUTES: 15
  },

  REGISTRY_TABS: {
    ASSETS: 'Assets',
    URLS: 'URL Variants',
    CONFIG: 'Project Config',
    LOG: 'Sync Log',
    ENTITY_CONFIG: 'Entity Config',
    ENTITY_INDEX: 'Entity Index',
    EXTENDED_ASSETS: 'Extended Assets'
  },


  EXTENDED_GOOGLE_ASSETS_V465: {
    VERSION: '4.6.5',
    SCHEMA_VERSION: '1.0.0',
    REGISTRY_TAB: 'Extended Assets',
    PROJECTION_POLICY: 'OPTIONAL_MANUAL_URLS_TO_PRIVATE_REGISTRY_AND_PUBLIC_ASSETS',
    VISIBILITY_CLASSES: ['OPEN_WEB','LINK_PUBLIC','GOOGLE_ACCOUNT_REQUIRED']
  },

  DOCUMENT_RESOURCE_FOOTER_V466: {
    VERSION: '4.6.6',
    MARKER: '[[GES_RESOURCE_FOOTER_V466]]',
    TITLE: 'RECOMMENDED RESOURCES',
    INTRO: 'The list of resources and links we recommend you visit:',
    INCLUDE_PROJECT_FOLDERS: true,
    INCLUDE_DOC_VARIANTS: true,
    INCLUDE_PROJECT_ASSETS: true,
    INCLUDE_CALENDAR_EVENTS: true,
    INCLUDE_EXTENDED_GOOGLE_ASSETS: true,
    INCLUDE_CONTACT: true,
    INCLUDE_WEBSITE: true,
    EXCLUDE_FROM_CANONICAL_CONTENT_MODEL: true,
    INCLUDE_IN_DERIVED_OUTPUTS: false
  },

  PUBLIC_URL_ENRICHMENT_V464: {
    VERSION: '4.6.4.1',
    PROVIDER_POLICY_VERSION: '4.6.4.1',
    ENABLE_QR: true,
    QR_SIZE_PX: 150,
    ENABLE_TINYURL: true,
    ENABLE_CLEANURI: true,
    CLEANURI_SKIP_GOOGLE_CALENDAR: true,
    ENABLE_SPOOME: false,
    MAX_NEW_REQUESTS_PER_RENDER: 120,
    PERSIST_TO_PRIVATE_REGISTRY: true,
    REUSE_PREVIOUS_PUBLIC_SHEET_VALUES: true
  },

  MODIFIED_TIME_TOLERANCE_MS: 1500
};

// Compatibility alias: existing stable V3.2 modules continue to read V3_CONFIG.
const V3_CONFIG = GES_CONFIG;
