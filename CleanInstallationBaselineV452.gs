/**
 * GES V4.5.2 Clean Installation Baseline.
 *
 * Read-only clone-safety/audit helpers plus explicit first-project validation.
 * This module never deletes Script Properties, triggers, Drive files, or
 * Calendar data. A clean master must fail closed instead of guessing a client.
 */

const GES_CLEAN_INSTALLATION_BASELINE_V452 = Object.freeze({
  VERSION: '4.5.2',
  STATUS_CLEAN: 'CLEAN',
  STATUS_DIRTY: 'DIRTY',
  STATUS_BASELINE_INVALID: 'BASELINE_INVALID',
  CUSTOMER_BOOTSTRAP_STRING_KEYS: Object.freeze([
    'ROOT_FOLDER_ID','BRAND_NAME','PROJECT_NAME','TARGET_PAGE_URL','WEBSITE_URL',
    'GOOGLE_MAPS_URL','GOOGLE_SITES_URL','LOGO_FILE_ID','CTA_FILE_ID',
    'LOGO_PUBLIC_URL','CTA_PUBLIC_URL','PHONE','PHONE_2','EMAIL','ADDRESS'
  ])
});

function getCleanInstallationBaselineSchemaV452() {
  return cloneJson_(GES_CLEAN_INSTALLATION_BASELINE_V452);
}

function assertExplicitFirstProjectInputV452_(input) {
  input = input || {};
  var policy = GES_CONFIG.CLEAN_INSTALLATION_V452 || {};
  var errors = [];
  var root = safeString_(input.rootFolderId || input.rootFolderUrl).trim();
  var projectName = safeString_(input.projectName).trim();
  var projectType = safeString_(input.projectType).trim().toUpperCase();
  var brand = safeString_(input.brandName).trim();
  var website = safeString_(input.websiteUrl).trim();
  var mode = safeString_(input.provisioningMode || policy.DEFAULT_PROVISIONING_MODE || 'NEW_STACK').trim().toUpperCase();

  if (policy.REQUIRE_EXPLICIT_ROOT_FOLDER !== false && !root) errors.push('ROOT_FOLDER_REQUIRED');
  if (policy.REQUIRE_EXPLICIT_PROJECT_NAME !== false && !projectName) errors.push('PROJECT_NAME_REQUIRED');
  if (policy.REQUIRE_EXPLICIT_PROJECT_TYPE !== false && (!projectType || projectType === 'UNSPECIFIED')) errors.push('PROJECT_TYPE_REQUIRED');
  if (policy.REQUIRE_EXPLICIT_BRAND !== false && !brand) errors.push('BRAND_NAME_REQUIRED');
  if (policy.REQUIRE_EXPLICIT_WEBSITE !== false && !website) errors.push('WEBSITE_URL_REQUIRED');
  if (mode === 'UNSET') errors.push('PROVISIONING_MODE_REQUIRED');

  if (errors.length) {
    var err = new Error('Clean Installation V4.5.2 yêu cầu cấu hình project rõ ràng: ' + errors.join(', '));
    err.code = 'EXPLICIT_PROJECT_SETUP_REQUIRED';
    err.details = errors;
    throw err;
  }
  return {
    valid: true,
    provisioningMode: mode,
    rootFolderInput: root,
    projectName: projectName,
    projectType: projectType,
    brandName: brand,
    websiteUrl: website
  };
}

function cleanInstallationConfigAuditV452_() {
  var b = GES_CONFIG.BOOTSTRAP || {};
  var p = GES_CONFIG.CLEAN_INSTALLATION_V452 || {};
  var issues = [];
  var nonEmpty = [];

  GES_CLEAN_INSTALLATION_BASELINE_V452.CUSTOMER_BOOTSTRAP_STRING_KEYS.forEach(function(key) {
    if (safeString_(b[key]).trim()) nonEmpty.push(key);
  });
  if (nonEmpty.length) issues.push('CUSTOMER_BOOTSTRAP_VALUES_PRESENT:' + nonEmpty.join(','));
  if (safeString_(b.PROJECT_TYPE).toUpperCase() !== 'UNSPECIFIED') issues.push('BOOTSTRAP_PROJECT_TYPE_NOT_UNSPECIFIED');
  if (safeString_(b.PROVISIONING_MODE).toUpperCase() !== 'NEW_STACK') issues.push('BOOTSTRAP_MODE_NOT_NEW_STACK');
  if (p.CLEAN_MASTER_MODE !== true) issues.push('CLEAN_MASTER_MODE_DISABLED');
  if (p.ALLOW_IMPLICIT_BOOTSTRAP !== false) issues.push('IMPLICIT_BOOTSTRAP_NOT_DISABLED');
  if (safeString_(p.DEFAULT_PROVISIONING_MODE).toUpperCase() !== 'NEW_STACK') issues.push('DEFAULT_MODE_NOT_NEW_STACK');
  if (safeString_(GES_CONFIG.BRANDING && GES_CONFIG.BRANDING.TEMP_DOC_PREFIX) !== '.GES_BRAND_TMP_') issues.push('TEMP_PREFIX_NOT_GENERIC');

  return {
    valid: issues.length === 0,
    issues: issues,
    nonEmptyBootstrapKeys: nonEmpty,
    defaultProvisioningMode: safeString_(p.DEFAULT_PROVISIONING_MODE || b.PROVISIONING_MODE),
    implicitBootstrapAllowed: p.ALLOW_IMPLICIT_BOOTSTRAP === true
  };
}

function cleanInstallationRuntimePropertyKeysV452_(properties) {
  properties = properties || {};
  var exact = {};
  exact[GES_CONFIG.PROPERTY_KEYS.PROJECT_INDEX] = true;
  exact[GES_CONFIG.PROPERTY_KEYS.ACTIVE_PROJECT] = true;
  exact[GES_CONFIG.PROPERTY_KEYS.GLOBAL_SCAN_TRIGGER_ID] = true;
  exact[GES_CONFIG.PROPERTY_KEYS.PRIVATE_SYSTEM_ROOT_ID] = true;
  var prefixes = [
    GES_CONFIG.PROPERTY_KEYS.PROJECT_PREFIX,
    GES_CONFIG.PROPERTY_KEYS.PROFILE_BACKUP_PREFIX,
    GES_CONFIG.PROPERTY_KEYS.ASSET_PREFIX,
    GES_CONFIG.PROPERTY_KEYS.PUBLISHED_PREFIX,
    GES_CONFIG.PROPERTY_KEYS.SCAN_STATE_PREFIX
  ].filter(function(v) { return !!v; });

  return Object.keys(properties).filter(function(key) {
    if (exact[key]) return true;
    return prefixes.some(function(prefix) { return key.indexOf(prefix) === 0; });
  }).sort();
}

function inspectCleanInstallationBaselineV452() {
  var props = getScriptProps_().getProperties();
  var runtimeKeys = cleanInstallationRuntimePropertyKeysV452_(props);
  var projectIds = listProjectIds_();
  var activeProjectId = safeString_(props[GES_CONFIG.PROPERTY_KEYS.ACTIVE_PROJECT]);
  var triggerCount = 0;
  var triggerError = '';
  try {
    triggerCount = ScriptApp.getProjectTriggers().length;
  } catch (e) {
    triggerError = safeString_(e && e.message || e);
  }

  var config = cleanInstallationConfigAuditV452_();
  var runtimeIssues = [];
  if (projectIds.length) runtimeIssues.push('PROJECTS_PRESENT');
  if (activeProjectId) runtimeIssues.push('ACTIVE_PROJECT_PRESENT');
  if (runtimeKeys.length) runtimeIssues.push('GES_RUNTIME_PROPERTIES_PRESENT');
  if (triggerCount) runtimeIssues.push('INSTALLABLE_TRIGGERS_PRESENT');
  if (triggerError) runtimeIssues.push('TRIGGER_AUDIT_FAILED');

  var status = !config.valid
    ? GES_CLEAN_INSTALLATION_BASELINE_V452.STATUS_BASELINE_INVALID
    : (runtimeIssues.length ? GES_CLEAN_INSTALLATION_BASELINE_V452.STATUS_DIRTY : GES_CLEAN_INSTALLATION_BASELINE_V452.STATUS_CLEAN);

  return {
    success: config.valid,
    version: GES_CLEAN_INSTALLATION_BASELINE_V452.VERSION,
    status: status,
    config: config,
    runtime: {
      clean: runtimeIssues.length === 0,
      issues: runtimeIssues,
      projectCount: projectIds.length,
      projectIds: projectIds.slice(),
      activeProjectId: activeProjectId,
      gesRuntimePropertyCount: runtimeKeys.length,
      gesRuntimePropertyKeys: runtimeKeys,
      installableTriggerCount: triggerCount,
      triggerAuditError: triggerError
    },
    invariants: {
      readOnlyAudit: true,
      noAutomaticCleanup: true,
      noImplicitProjectCreation: true,
      newStackDefault: true
    }
  };
}

function validateCleanInstallationBaselineV452() {
  var report = inspectCleanInstallationBaselineV452();
  report.validBaseline = !!(report.config && report.config.valid);
  report.runtimeClean = !!(report.runtime && report.runtime.clean);
  return report;
}
