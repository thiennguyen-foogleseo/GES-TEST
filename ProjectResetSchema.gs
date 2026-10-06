/**
 * GES V4 Project Reset Schema - PREVIEW ONLY.
 *
 * This module defines reset intentions only. It contains no destructive
 * implementation. Patch D deliberately ships without any execute/apply reset
 * function.
 */

const GES_PROJECT_RESET_V44 = Object.freeze({
  VERSION: '1.0.0-preview',
  PREVIEW_ONLY: true,
  DEFAULT_MODE: 'RESET_TEST_BUILD',

  MODES: Object.freeze({
    RESET_OUTPUTS: Object.freeze({
      label: 'Reset generated outputs only',
      description: 'Preview trashing only confirmed GES-generated Drive outputs. Registry, Calendar and runtime state remain unchanged.',
      trashManagedDriveAssets: true,
      clearRegistryManagedRows: false,
      clearCalendarManagedEvents: false,
      clearRuntimeState: false,
      trashProjectRoot: false,
      removeProjectProfile: false,
      removeRegistryFile: false,
      removeCalendarContainer: false
    }),

    RESET_TEST_BUILD: Object.freeze({
      label: 'Reset test build',
      description: 'Recommended development reset: preserve Project Root, source Docs, media, legacy files, Project Profile, Registry file and Calendar container; preview removal of confirmed generated outputs plus managed runtime state/events so the build can be tested again.',
      trashManagedDriveAssets: true,
      clearRegistryManagedRows: true,
      clearCalendarManagedEvents: true,
      clearRuntimeState: true,
      trashProjectRoot: false,
      removeProjectProfile: false,
      removeRegistryFile: false,
      removeCalendarContainer: false
    }),

    RESET_GES_STATE: Object.freeze({
      label: 'Reset GES state only',
      description: 'Keep Drive outputs in place for later adoption/reconcile, but preview clearing project-scoped Registry/runtime/Calendar managed state.',
      trashManagedDriveAssets: false,
      clearRegistryManagedRows: true,
      clearCalendarManagedEvents: true,
      clearRuntimeState: true,
      trashProjectRoot: false,
      removeProjectProfile: false,
      removeRegistryFile: false,
      removeCalendarContainer: false
    }),

    FULL_PROJECT_PURGE: Object.freeze({
      label: 'Full project purge',
      description: 'Preview only. Would remove the entire Project Root and project-scoped system state. Future execution must require an explicit disposable-test flag and must never target the global/site root.',
      trashManagedDriveAssets: true,
      clearRegistryManagedRows: true,
      clearCalendarManagedEvents: true,
      clearRuntimeState: true,
      trashProjectRoot: true,
      removeProjectProfile: true,
      removeRegistryFile: true,
      removeCalendarContainer: true
    })
  }),

  ALWAYS_PROTECTED: Object.freeze([
    'SOURCE_DOCS',
    'PROJECT_CONFIG',
    'BRANDING_CONFIG',
    'LOGO_FILE',
    'CTA_FILE',
    'LEGACY_UNMANAGED_ASSETS',
    'GLOBAL_SCAN_TRIGGER',
    'OTHER_PROJECTS'
  ]),

  TEST_BUILD_PROTECTED: Object.freeze([
    'PROJECT_ROOT',
    'CANONICAL_FOLDERS',
    'ARTICLES_FOLDER',
    'PHOTOS_FOLDER',
    'VIDEOS_FOLDER',
    'PODCASTS_FOLDER',
    'PRIVATE_ASSET_REGISTRY_FILE',
    'CALENDAR_CONTAINER',
    'PROJECT_PROFILE',
    'MIGRATION_HISTORY'
  ]),

  MAX_PREVIEW_ITEMS: 250,
  MAX_TREE_NODES: 800
});

function getProjectResetSchemaV44() {
  return cloneJson_(GES_PROJECT_RESET_V44);
}

function normalizeProjectResetModeV44_(mode) {
  mode = safeString_(mode || GES_PROJECT_RESET_V44.DEFAULT_MODE).trim().toUpperCase();
  if (!GES_PROJECT_RESET_V44.MODES[mode]) {
    throw new Error('PROJECT_RESET_MODE_INVALID: ' + mode);
  }
  return mode;
}

function getProjectResetModeConfigV44_(mode) {
  mode = normalizeProjectResetModeV44_(mode);
  return cloneJson_(GES_PROJECT_RESET_V44.MODES[mode]);
}
