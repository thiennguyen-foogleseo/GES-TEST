/**
 * GES V4.3 - Private Asset Registry privacy validator.
 *
 * Read-only validator. V4.5 adds explicit Preview -> Apply -> Verify migration
 * into the shared GES Private System tree; this function remains non-mutating.
 */

function validateAssetRegistryPrivacyV43(projectId) {
  var project = projectId ? getProject_(projectId) : getActiveProject_();
  if (!project) throw new Error('NO_ACTIVE_PROJECT');
  if (!project.registrySheetId) return { success: true, valid: false, code: 'REGISTRY_MISSING' };

  var file = DriveApp.getFileById(project.registrySheetId);
  var fileAccess = '';
  var filePermission = '';
  try { fileAccess = safeString_(file.getSharingAccess()); } catch (ignore0) {}
  try { filePermission = safeString_(file.getSharingPermission()); } catch (ignore1) {}

  var parentPublic = false;
  var parentFindings = [];
  try {
    var it = file.getParents();
    while (it.hasNext()) {
      var folder = it.next();
      var access = '';
      var permission = '';
      try { access = safeString_(folder.getSharingAccess()); } catch (ignore2) {}
      try { permission = safeString_(folder.getSharingPermission()); } catch (ignore3) {}
      var isPublic = access === 'ANYONE' || access === 'ANYONE_WITH_LINK' ||
        access === safeString_(DriveApp.Access.ANYONE) || access === safeString_(DriveApp.Access.ANYONE_WITH_LINK);
      if (isPublic) parentPublic = true;
      parentFindings.push({ folderId: folder.getId(), folderName: folder.getName(), access: access, permission: permission, public: isPublic });
    }
  } catch (parentError) {}

  var filePublic = fileAccess === 'ANYONE' || fileAccess === 'ANYONE_WITH_LINK' ||
    fileAccess === safeString_(DriveApp.Access.ANYONE) || fileAccess === safeString_(DriveApp.Access.ANYONE_WITH_LINK);
  if (typeof isDriveItemPublicV45_ === 'function') {
    try { filePublic = isDriveItemPublicV45_(project.registrySheetId); } catch (ignore4) {}
  }

  var warnings = [];
  if (filePublic) warnings.push('REGISTRY_FILE_DIRECTLY_PUBLIC');
  if (parentPublic) warnings.push('REGISTRY_PARENT_FOLDER_PUBLIC_INHERITANCE_RISK');

  return {
    success: true,
    valid: !filePublic && !parentPublic,
    projectId: project.projectId,
    registrySheetId: project.registrySheetId,
    fileAccess: fileAccess,
    filePermission: filePermission,
    parentPublic: parentPublic,
    parents: parentFindings,
    warnings: warnings,
    migrationPlanned: typeof previewPrivateSystemStorageV45 === 'function',
    privateStorageStatus: project.privateStorage && project.privateStorage.status || 'NOT_CONFIGURED',
    note: 'V4.5 dùng Preview -> Apply -> Verify để move Registry sang GES Private System và giữ nguyên File ID. Validator này không tự thay đổi Drive.'
  };
}

function validateActiveAssetRegistryPrivacyV43() {
  return validateAssetRegistryPrivacyV43('');
}
