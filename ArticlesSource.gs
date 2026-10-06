/** Source Google Docs must live directly in <Root name> Articles. */

function getSourceDocs_(project) {
  const folder = getArticlesFolder_(project, false);
  const it = folder.getFilesByType(MimeType.GOOGLE_DOCS);
  const docs = [];
  while (it.hasNext()) docs.push(it.next());
  docs.sort(function(a, b) { return a.getName().localeCompare(b.getName(), 'vi'); });
  return docs;
}

function getSourceDocById_(project, docId) {
  const file = DriveApp.getFileById(docId);
  validateSourceDoc_(project, file);
  return file;
}

function validateSourceDoc_(project, file) {
  if (!file || file.getMimeType() !== V3_CONFIG.MIME.GOOGLE_DOCS) {
    throw new Error('File nguồn không phải Google Docs.');
  }
  const articles = getArticlesFolder_(project, false);
  if (!isFileDirectlyInFolder_(file, articles)) {
    throw new Error('Google Docs nguồn phải nằm trực tiếp trong folder ' + articles.getName() + '.');
  }
  return true;
}

function serializeSourceDoc_(file, project) {
  return {
    id: file.getId(),
    name: file.getName(),
    url: file.getUrl(),
    modifiedTime: file.getLastUpdated().toISOString(),
    sourceFolderId: project.folders.articlesFolderId,
    sourceFolderName: expectedFolderName_(project, 'ARTICLES')
  };
}
