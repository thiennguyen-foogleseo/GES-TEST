/** Central guard for all production writes (V3.1 lifecycle aware). */

function assertProjectWritable_(project) {
  if (!project) throw new Error('Không có active project.');
  project = normalizeProjectProfileV31_(project);

  if (project.enabled === false) throw new Error('Project đang bị disable.');

  if (project.upgrade && project.upgrade.requiresLifecycleConfirmation) {
    const err = new Error('Project Profile đã nâng lên V3.1 nhưng chưa xác nhận Project Type / Setup Mode. Hãy xác nhận lifecycle trước khi ghi dữ liệu.');
    err.code = 'LIFECYCLE_CONFIRMATION_REQUIRED';
    throw err;
  }

  if (project.provisioningMode === 'UNSET') {
    const err = new Error('Project chưa xác định NEW_STACK hay MIGRATE_V2.');
    err.code = 'PROVISIONING_MODE_UNSET';
    throw err;
  }

  if (project.provisioningMode === 'MIGRATE_V2') {
    if (!project.migration || project.migration.status !== 'VERIFIED') {
      const err = new Error('Project MIGRATE_V2 chưa được Verify Migration. Không được ghi production data.');
      err.code = 'MIGRATION_NOT_VERIFIED';
      throw err;
    }
  }

  if (!project.writeState.writeEnabled || project.writeState.shadowMode) {
    const modeText = project.provisioningMode === 'NEW_STACK'
      ? 'Đây là NEW_STACK. Hãy Validate rồi Enable V3 Write; không cần V2 Migration.'
      : 'Hãy hoàn tất Migration + Verify rồi Enable V3 Write.';
    const err = new Error('V3 đang ở Shadow Mode / Write Disabled. ' + modeText);
    err.code = 'PROJECT_WRITE_DISABLED';
    throw err;
  }
}

function assertAssetSafeToWrite_(project, docFile, assetType) {
  assertProjectWritable_(project);
  validateSourceDoc_(project, docFile);
  const resolved = resolveAssetForDoc_(project, docFile, assetType);
  if (resolved.ambiguous) {
    const err = new Error('Asset ' + assetType + ' có nhiều candidate. Không được tự động ghi.');
    err.code = 'AMBIGUOUS_ASSET';
    throw err;
  }
  return resolved;
}
