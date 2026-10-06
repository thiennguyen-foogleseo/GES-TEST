function createPdfAsset_(project, docFile) {
  return createBinaryAsset_(project, docFile, 'PDF', V3_CONFIG.MIME.PDF);
}
function updatePdfAsset_(project, docFile) {
  return updateBinaryAsset_(project, docFile, 'PDF', V3_CONFIG.MIME.PDF);
}
