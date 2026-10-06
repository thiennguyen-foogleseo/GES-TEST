/**
 * GES V4 Calendar Visibility Validator
 * -----------------------------------------------------------------------------
 * Read-only checks for:
 * - Calendar public ACL (default -> reader)
 * - Calendar metadata / timezone / location
 * - Registry event visibility state
 * - Drive attachment sharing state (informational; does NOT change sharing)
 */

const GES_CALENDAR_VISIBILITY_V4 = Object.freeze({
  VERSION: '2.0.0-calendar-v2'
});

function validateProjectCalendarVisibilityV4(projectId) {
  assertCalendarServiceAvailableV4_();

  var plan = previewCalendarPlanV4(projectId || '');
  var project = getProject_(plan.projectId);
  if (!project) throw new Error('CALENDAR_PROJECT_NOT_FOUND');

  var rows = getCalendarRegistryRowsV4(project.projectId);
  var state = collectProjectCalendarIdsV4_(project, rows);
  var errors = [];
  var warnings = [];

  if (state.ids.length === 0) errors.push('CALENDAR_ID_NOT_FOUND');
  if (state.ids.length > 1) errors.push('MULTIPLE_CALENDAR_IDS');

  var calendarId = state.ids.length === 1 ? state.ids[0] : '';
  var acl = null;
  var remoteCalendar = null;

  if (calendarId) {
    try {
      remoteCalendar = Calendar.Calendars.get(calendarId);
    } catch (e) {
      errors.push('CALENDAR_REMOTE_NOT_FOUND');
    }

    if (remoteCalendar) {
      try {
        acl = Calendar.Acl.get(calendarId, 'default');
        if (!acl || acl.role !== 'reader') errors.push('CALENDAR_NOT_PUBLIC_READER');
      } catch (e2) {
        errors.push('CALENDAR_PUBLIC_ACL_NOT_FOUND');
      }

      if (safeString_(remoteCalendar.timeZone) !== safeString_(plan.calendar.timezone)) {
        warnings.push('CALENDAR_TIMEZONE_MISMATCH');
      }
      if (safeString_(remoteCalendar.location) !== safeString_(plan.calendar.location.locationText)) {
        warnings.push('CALENDAR_LOCATION_MISMATCH');
      }
    }
  }

  var driveAssets = collectCalendarDriveAssetsForVisibilityV4_(plan);
  var driveChecks = driveAssets.map(function(asset) {
    return inspectCalendarDriveSharingV4_(asset);
  });

  driveChecks.forEach(function(check) {
    if (check.status === 'ERROR') warnings.push('DRIVE_SHARING_CHECK_ERROR:' + check.assetId);
    if (check.publiclyReachable === false) warnings.push('DRIVE_ASSET_NOT_PUBLIC:' + check.assetId);
  });

  var currentRows = rows.filter(function(row) { return row.status === 'CURRENT'; });
  currentRows.forEach(function(row) {
    if (safeString_(row.visibility) !== 'public') warnings.push('EVENT_NOT_PUBLIC:' + row.eventKey);
    if (safeString_(row.transparency) !== 'transparent') warnings.push('EVENT_NOT_TRANSPARENT:' + row.eventKey);
  });

  var result = {
    valid: errors.length === 0,
    errors: errors,
    warnings: uniqueCalendarStringsV4_(warnings),
    projectId: project.projectId,
    projectName: project.projectName,
    calendarId: calendarId,
    calendarUrl: calendarId ? calendarAssetCalendarUrlV4_(calendarId) : '',
    publicAclRole: acl ? acl.role : '',
    calendarTimeZone: remoteCalendar ? remoteCalendar.timeZone : '',
    calendarLocation: remoteCalendar ? remoteCalendar.location : '',
    registryCurrentEvents: currentRows.length,
    driveAssets: driveChecks
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}

function validateActiveProjectCalendarVisibilityV4() {
  return validateProjectCalendarVisibilityV4('');
}

function collectCalendarDriveAssetsForVisibilityV4_(plan) {
  var byId = {};
  (plan.events || []).forEach(function(event) {
    (event.attachments || []).forEach(function(item) {
      var fileId = safeString_(item.fileId);
      if (!fileId || byId[fileId]) return;
      byId[fileId] = {
        assetId: fileId,
        title: safeString_(item.title),
        mimeType: safeString_(item.mimeType),
        fileUrl: safeString_(item.fileUrl)
      };
    });
  });
  return Object.keys(byId).map(function(id) { return byId[id]; });
}

function inspectCalendarDriveSharingV4_(asset) {
  try {
    var isFolder = safeString_(asset.mimeType) === 'application/vnd.google-apps.folder';
    var item = isFolder ? DriveApp.getFolderById(asset.assetId) : DriveApp.getFileById(asset.assetId);
    var access = item.getSharingAccess();
    var permission = item.getSharingPermission();
    var accessText = safeString_(access);
    var permissionText = safeString_(permission);
    var publicReachable = /ANYONE/i.test(accessText) || /ANYONE_WITH_LINK/i.test(accessText);
    return {
      assetId: asset.assetId,
      title: asset.title || item.getName(),
      mimeType: asset.mimeType || (isFolder ? 'application/vnd.google-apps.folder' : item.getMimeType()),
      fileUrl: asset.fileUrl || item.getUrl(),
      sharingAccess: accessText, sharingPermission: permissionText,
      publiclyReachable: publicReachable, status: 'OK'
    };
  } catch (e) {
    return {
      assetId: asset.assetId, title: asset.title, mimeType: asset.mimeType, fileUrl: asset.fileUrl,
      sharingAccess: '', sharingPermission: '', publiclyReachable: null, status: 'ERROR',
      error: safeString_(e && e.message || e)
    };
  }
}
