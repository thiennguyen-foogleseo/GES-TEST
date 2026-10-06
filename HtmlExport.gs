/** Google Docs -> clean semantic HTML; updates preserve Drive File ID. GES V4. */

function renderSourceDocHtml_(project, docFile) {
  const model = readDocumentModel_(docFile.getId());
  const rendered = renderDocumentModelToHtml_(model, project, { includeTitleInBody: true, includeBrandFooter: true });
  // V4.6.7: generated project-resource hyperlinks are injected after canonical
  // HTML rendering. DocumentReader already excludes the Source Docs footer.
  if (typeof injectOutputResourceFooterHtmlV467_ === 'function') {
    rendered.fullHtml = injectOutputResourceFooterHtmlV467_(rendered.fullHtml, project, docFile);
  }
  return rendered;
}

function createHtmlAsset_(project, docFile) {
  assertProjectWritable_(project);
  validateSourceDoc_(project, docFile);
  const state = getAssetState_(project, docFile, 'HTML');
  if (state.status !== 'MISSING') return makeAssetResult_(false, project, docFile, 'HTML', 'CREATE', 'ALREADY_EXISTS', 'HTML đã tồn tại hoặc cần Review.', state.id ? DriveApp.getFileById(state.id) : null);
  const rendered = renderSourceDocHtml_(project, docFile);
  const blob = Utilities.newBlob(rendered.fullHtml, V3_CONFIG.MIME.HTML, getExpectedOutputName_(docFile, 'HTML'));
  const file = getOutputFolderByAssetType_(project, 'HTML').createFile(blob);
  adoptManagedAsset_(project, docFile, 'HTML', file, {
    resolutionMethod: 'CREATE',
    extraMeta: { RENDER_WARNINGS: (rendered.warnings || []).join(',') }
  });
  upsertManagedAssetToRegistrySheet_(project, docFile, 'HTML');
  return makeAssetResult_(true, project, docFile, 'HTML', 'CREATE', 'CREATED', 'Đã tạo HTML.', file, { warnings: rendered.warnings });
}

function updateHtmlAsset_(project, docFile) {
  assertProjectWritable_(project);
  validateSourceDoc_(project, docFile);
  const resolved = resolveAssetForDoc_(project, docFile, 'HTML');
  if (resolved.ambiguous) return makeAssetResult_(false, project, docFile, 'HTML', 'UPDATE', 'DUPLICATE', 'Có nhiều HTML trùng.', null);
  if (!resolved.file) return makeAssetResult_(false, project, docFile, 'HTML', 'UPDATE', 'NOT_FOUND', 'Chưa có HTML để Update.', null);
  const rendered = renderSourceDocHtml_(project, docFile);
  const blob = Utilities.newBlob(rendered.fullHtml, V3_CONFIG.MIME.HTML, getExpectedOutputName_(docFile, 'HTML'));
  updateBinaryFileContent_(resolved.file.getId(), blob, V3_CONFIG.MIME.HTML);
  adoptManagedAsset_(project, docFile, 'HTML', resolved.file, {
    resolutionMethod: resolved.method,
    extraMeta: { RENDER_WARNINGS: (rendered.warnings || []).join(',') }
  });
  upsertManagedAssetToRegistrySheet_(project, docFile, 'HTML');
  return makeAssetResult_(true, project, docFile, 'HTML', 'UPDATE', 'UPDATED', 'Đã cập nhật HTML và giữ nguyên File ID.', resolved.file, { warnings: rendered.warnings });
}
