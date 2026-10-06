const V4_PROFILE_TRANSFER_FILE_ID =
  '1j8hsKGVim9BQxE43rt5q4mVKiSr3uFws';


function importProjectProfilesIntoV4Dev() {

  if (
    !V4_PROFILE_TRANSFER_FILE_ID ||
    V4_PROFILE_TRANSFER_FILE_ID ===
      'PASTE_BACKUP_FILE_ID_HERE'
  ) {
    throw new Error(
      'Chưa nhập V4_PROFILE_TRANSFER_FILE_ID.'
    );
  }

  const file =
    DriveApp.getFileById(
      V4_PROFILE_TRANSFER_FILE_ID
    );

  const text =
    file
      .getBlob()
      .getDataAsString('UTF-8');

  const source =
    JSON.parse(text);

  const allowed = {};

  Object.keys(source).forEach(function(key) {

    if (key === 'V3_PROJECT_INDEX') {
      allowed[key] = source[key];
      return;
    }

    if (key === 'V3_ACTIVE_PROJECT') {
      allowed[key] = source[key];
      return;
    }

    if (
      key.indexOf('V3_PROJECT_') === 0 &&
      key !== 'V3_PROJECT_INDEX'
    ) {
      allowed[key] = source[key];
    }
  });

  if (!allowed.V3_PROJECT_INDEX) {
    throw new Error(
      'Backup không có V3_PROJECT_INDEX.'
    );
  }

  if (!allowed.V3_ACTIVE_PROJECT) {
    throw new Error(
      'Backup không có V3_ACTIVE_PROJECT.'
    );
  }

  PropertiesService
    .getScriptProperties()
    .setProperties(
      allowed,
      false
    );

  const active =
    getActiveProject_();

  if (!active) {
    throw new Error(
      'Import xong nhưng vẫn không resolve được active project.'
    );
  }

  // Safety:
  // Force DEV profile back to Shadow Mode.
  active.writeState =
    active.writeState || {};

  active.writeState.writeEnabled = false;
  active.writeState.shadowMode = true;
  active.writeState.reason =
    'V4_G1_DEV_IMPORT_SHADOW_MODE';

  // Compatibility aliases
  active.writeEnabled = false;
  active.shadowMode = true;

  saveProject_(active);

  const result = {
    success: true,

    importedProperties:
      Object.keys(allowed).length,

    activeProjectId:
      active.projectId,

    projectName:
      active.projectName,

    projectType:
      active.projectType,

    provisioningMode:
      active.provisioningMode,

    rootFolderId:
      active.rootFolderId,

    registrySheetId:
      active.registrySheetId,

    writeEnabled:
      false,

    shadowMode:
      true
  };

  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}