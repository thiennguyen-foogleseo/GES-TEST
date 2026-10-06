/**
 * Shared Google Docs export + in-place binary update.
 * V3.2: PDF/DOCX can be exported from a temporary branded Google Doc copy.
 */

function exportGoogleDocBlob_(docId, mimeType) {
  const url = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(docId) + '/export?mimeType=' + encodeURIComponent(mimeType);
  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) throw new Error('Drive export thất bại. HTTP ' + code + ': ' + response.getContentText());
  return response.getBlob();
}

function updateBinaryFileContent_(fileId, blob, mimeType) {
  const url = 'https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(fileId) + '?uploadType=media';
  const response = UrlFetchApp.fetch(url, {
    method: 'patch',
    contentType: mimeType,
    payload: blob.getBytes(),
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) throw new Error('Update binary thất bại. HTTP ' + code + ': ' + response.getContentText());
}

function shouldUseBrandedDocExport_(project, assetType) {
  const target = String(assetType || '').toLowerCase();
  if (target !== 'pdf' && target !== 'docx') return false;
  const branding = getProjectBranding_(project);
  if (!branding.enabled || !isBrandingEnabledForTarget_(branding, target)) return false;
  return !!(
    (branding.docs.showLogo && branding.logo.enabled && branding.logo.driveFileId) ||
    (branding.docs.showCta && branding.cta.enabled && branding.cta.driveFileId)
  );
}

/**
 * Make a temporary Google Docs copy, add header/footer branding, export it,
 * then trash the temporary copy. The original source Docs is never modified.
 */
function exportGoogleDocBlobForAsset_(project, docFile, assetType, mimeType) {
  const hasResourceFooterV467 = (assetType === 'PDF' || assetType === 'DOCX') &&
    typeof appendOutputResourceFooterToTempDocV467_ === 'function';
  const hasBranding = shouldUseBrandedDocExport_(project, assetType);

  // Before V4.6.7, unbranded exports could be exported directly from the
  // Source Doc. That would now copy the generated Source Docs footer into the
  // binary output. V4.6.7 therefore uses a disposable temp Doc whenever the
  // resource-footer layer is installed, strips the source footer, then appends
  // the output-layer footer explicitly.
  if (!hasBranding && !hasResourceFooterV467) {
    return exportGoogleDocBlob_(docFile.getId(), mimeType);
  }

  const root = getProjectRoot_(project);
  const tempName = (V3_CONFIG.BRANDING.TEMP_DOC_PREFIX || '.GES_BRAND_TMP_') + assetType + '_' + Utilities.getUuid();
  let tempFile = null;

  try {
    tempFile = DriveApp.getFileById(docFile.getId()).makeCopy(tempName, root);
    const tempDoc = DocumentApp.openById(tempFile.getId());

    if (hasResourceFooterV467 && typeof removeExistingDocumentResourceFooterV466_ === 'function') {
      removeExistingDocumentResourceFooterV466_(tempDoc.getBody());
    }

    if (hasBranding) {
      if (assetType === 'PDF') applyBrandingForPdfExport_(tempDoc, project);
      else if (assetType === 'DOCX') applyBrandingForDocxExport_(tempDoc, project);
      else applyBrandingToGoogleDoc_(tempDoc, project, { target: assetType });
    }

    if (hasResourceFooterV467) {
      appendOutputResourceFooterToTempDocV467_(tempDoc, project, docFile);
    }

    tempDoc.saveAndClose();
    Utilities.sleep(250);
    return exportGoogleDocBlob_(tempFile.getId(), mimeType);
  } finally {
    if (tempFile) {
      try { tempFile.setTrashed(true); } catch (ignore) {}
    }
  }
}

function createBinaryAsset_(project, docFile, assetType, mimeType) {
  assertProjectWritable_(project);
  validateSourceDoc_(project, docFile);
  const state = getAssetState_(project, docFile, assetType);
  if (state.status !== 'MISSING') {
    return makeAssetResult_(false, project, docFile, assetType, 'CREATE', 'ALREADY_EXISTS', assetType + ' đã tồn tại hoặc cần Review.', state.id ? DriveApp.getFileById(state.id) : null);
  }

  const blob = exportGoogleDocBlobForAsset_(project, docFile, assetType, mimeType)
    .setName(getExpectedOutputName_(docFile, assetType));
  const folder = getOutputFolderByAssetType_(project, assetType);
  const file = folder.createFile(blob);
  file.setName(getExpectedOutputName_(docFile, assetType));
  adoptManagedAsset_(project, docFile, assetType, file, { resolutionMethod: 'CREATE' });
  upsertManagedAssetToRegistrySheet_(project, docFile, assetType);
  return makeAssetResult_(true, project, docFile, assetType, 'CREATE', 'CREATED', 'Đã tạo ' + assetType + (shouldUseBrandedDocExport_(project, assetType) ? ' có Branding.' : '.'), file);
}

function updateBinaryAsset_(project, docFile, assetType, mimeType) {
  assertProjectWritable_(project);
  validateSourceDoc_(project, docFile);
  const resolved = resolveAssetForDoc_(project, docFile, assetType);
  if (resolved.ambiguous) return makeAssetResult_(false, project, docFile, assetType, 'UPDATE', 'DUPLICATE', 'Có nhiều file ' + assetType + ' trùng.', null);
  if (!resolved.file) return makeAssetResult_(false, project, docFile, assetType, 'UPDATE', 'NOT_FOUND', 'Chưa có ' + assetType + ' để Update.', null);

  const blob = exportGoogleDocBlobForAsset_(project, docFile, assetType, mimeType)
    .setName(getExpectedOutputName_(docFile, assetType));
  updateBinaryFileContent_(resolved.file.getId(), blob, mimeType);
  resolved.file.setName(getExpectedOutputName_(docFile, assetType));
  adoptManagedAsset_(project, docFile, assetType, resolved.file, { resolutionMethod: resolved.method });
  upsertManagedAssetToRegistrySheet_(project, docFile, assetType);
  return makeAssetResult_(true, project, docFile, assetType, 'UPDATE', 'UPDATED', 'Đã cập nhật ' + assetType + ', Branding và giữ nguyên File ID.', resolved.file);
}
