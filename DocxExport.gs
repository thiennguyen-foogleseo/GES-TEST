function createDocxAsset_(project, docFile) {
  return createBinaryAsset_(project, docFile, 'DOCX', V3_CONFIG.MIME.DOCX);
}
function updateDocxAsset_(project, docFile) {
  return updateBinaryAsset_(project, docFile, 'DOCX', V3_CONFIG.MIME.DOCX);
}
