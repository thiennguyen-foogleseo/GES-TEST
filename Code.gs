/** Web App entry point and first-run utilities for GES V4. */

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(GES_CONFIG.APP_NAME);
}

function testV4Setup() {
  // V4.5.2: setup inspection must be read-only. setupV4FirstRun() no longer
  // creates a project, and the Clean Installation audit adds clone-safety data.
  const setup = setupV4FirstRun();
  const data = getDashboardData();
  const cleanBaseline = typeof inspectCleanInstallationBaselineV452 === 'function'
    ? inspectCleanInstallationBaselineV452()
    : null;
  Logger.log(JSON.stringify({ setup: setup, dashboard: data.summary, cleanBaseline: cleanBaseline }, null, 2));
  return { setup: setup, dashboard: data, cleanBaseline: cleanBaseline };
}

// Backward-compatible alias used by older deployment notes/tests.
function testV3Setup() {
  return testV4Setup();
}

function setupV4FirstRun() {
  return setupV3FirstRun();
}

function getAppVersion() {
  return {
    app: GES_CONFIG.APP_NAME,
    appVersion: GES_CONFIG.APP_VERSION,
    schemaVersion: GES_CONFIG.SCHEMA_VERSION,
    profileSchemaVersion: GES_CONFIG.PROFILE_SCHEMA_VERSION,
    contentModelSchemaVersion: GES_CONFIG.CONTENT_MODEL_SCHEMA_VERSION,
    entityProfileSchemaVersion: GES_CONFIG.ENTITY_PROFILE_SCHEMA_VERSION
  };
}
