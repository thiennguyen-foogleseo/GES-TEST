/** One global time trigger dispatches scheduled scans across all enabled projects. */

function installGlobalRegistryTrigger() {
  removeGlobalRegistryTrigger();
  const trigger = ScriptApp.newTrigger('scheduledRegistryDispatcher')
    .timeBased()
    .everyMinutes(V3_CONFIG.SCANNER.GLOBAL_TRIGGER_MINUTES)
    .create();
  getScriptProps_().setProperty(V3_CONFIG.PROPERTY_KEYS.GLOBAL_SCAN_TRIGGER_ID, trigger.getUniqueId());
  return { success: true, triggerId: trigger.getUniqueId(), everyMinutes: V3_CONFIG.SCANNER.GLOBAL_TRIGGER_MINUTES };
}

function removeGlobalRegistryTrigger() {
  const targetId = getScriptProps_().getProperty(V3_CONFIG.PROPERTY_KEYS.GLOBAL_SCAN_TRIGGER_ID);
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'scheduledRegistryDispatcher' || (targetId && t.getUniqueId() === targetId)) {
      ScriptApp.deleteTrigger(t);
    }
  });
  getScriptProps_().deleteProperty(V3_CONFIG.PROPERTY_KEYS.GLOBAL_SCAN_TRIGGER_ID);
  return true;
}

function scheduledRegistryDispatcher() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { skipped: true, reason: 'ALREADY_RUNNING' };
  try {
    const now = new Date().getTime();
    const results = [];
    listProjects().forEach(function(project) {
      const cfg = project.scheduledRegistrySync || {};
      if (!cfg.enabled) return;
      const intervalMs = Number(cfg.quickScanIntervalMinutes || V3_CONFIG.SCANNER.DEFAULT_INTERVAL_MINUTES) * 60000;
      const fullMs = Number(cfg.fullReconcileIntervalHours || V3_CONFIG.SCANNER.FULL_RECONCILE_HOURS) * 3600000;
      const lastQuick = cfg.lastQuickScanAt ? new Date(cfg.lastQuickScanAt).getTime() : 0;
      const lastFull = cfg.lastFullReconcileAt ? new Date(cfg.lastFullReconcileAt).getTime() : 0;
      const existing = getScanState_(project.projectId);
      try {
        if (existing && (existing.status === 'RUNNING' || existing.status === 'PAUSED')) {
          results.push(continueProjectScan_(project, existing));
        } else if (!lastFull || now - lastFull >= fullMs) {
          results.push(scanProjectDrive(project.projectId, 'FULL'));
        } else if (!lastQuick || now - lastQuick >= intervalMs) {
          results.push(scanProjectDrive(project.projectId, 'QUICK'));
        }
      } catch (e) {
        logEvent_(project.projectId, 'SCHEDULED_SCAN_ERROR', { result: 'ERROR', message: e.message });
      }
    });
    return results;
  } finally {
    lock.releaseLock();
  }
}

function setScheduledRegistrySync(projectId, enabled, intervalMinutes) {
  const project = getProject_(projectId || getActiveProjectId_());
  if (!project) throw new Error('Project không tồn tại.');
  project.scheduledRegistrySync = project.scheduledRegistrySync || {};
  project.scheduledRegistrySync.enabled = !!enabled;
  if (intervalMinutes) project.scheduledRegistrySync.quickScanIntervalMinutes = Number(intervalMinutes);
  saveProject_(project);
  return sanitizeProjectForClient_(project);
}
