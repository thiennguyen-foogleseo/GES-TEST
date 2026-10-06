/**
 * GES V4.3 - Public Content projection.
 *
 * Option B contract:
 * - Every direct Google Doc in the project Articles folder is projected.
 * - Exact-match Project Keyword doc is marked Canonical = YES.
 * - Source Docs remain authoritative; this module is read-only against Docs.
 * - Large content is chunked only when required by the Sheets 50k cell limit.
 */

const GES_PUBLIC_CONTENT_V43 = Object.freeze({
  VERSION: '1.0.0',
  TYPE: 'article',
  MAX_CELL_CHARS: 45000
});

/** Public: preview all content rows without writing a Spreadsheet. */
function previewProjectContentProjectionV43(projectId) {
  var project = resolvePublicSheetProjectV43_(projectId || '');
  var projection = buildProjectContentProjectionV43_(project);
  return {
    success: true,
    version: GES_PUBLIC_CONTENT_V43.VERSION,
    projectId: project.projectId,
    projectName: project.projectName,
    projectKeyword: getProjectKeywordV41_(project),
    sourceDocCount: projection.documents.length,
    rowCount: projection.rows.length,
    documents: projection.documents.map(function(d) {
      return {
        docId: d.docId,
        docName: d.docName,
        canonical: d.canonical,
        modifiedAt: d.modifiedAt,
        plainTextChars: d.plainTextChars,
        htmlChars: d.htmlChars,
        chunkCount: d.chunkCount,
        warnings: d.warnings
      };
    })
  };
}

function previewActiveProjectContentProjectionV43() {
  return previewProjectContentProjectionV43('');
}

/** Private: build row-oriented public content projection. */
function buildProjectContentProjectionV43_(project) {
  var docs = getSourceDocs_(project).slice().sort(function(a, b) {
    return safeString_(a.getName()).localeCompare(safeString_(b.getName()));
  });
  var keyword = normalizePublicExactMatchV43_(getProjectKeywordV41_(project));
  var rows = [];
  var documents = [];

  docs.forEach(function(docFile) {
    var model = buildCanonicalContentModelV4(docFile.getId(), project.projectId);
    var rendered = renderDocumentModelToHtml_(model, project, {
      includeTitleInBody: true,
      includeBrandFooter: false
    });
    var plainText = renderCanonicalModelPlainTextV43_(model);
    var html = safeString_(rendered && rendered.bodyHtml || '');
    var plainChunks = splitPublicSheetCellTextV43_(plainText, GES_PUBLIC_CONTENT_V43.MAX_CELL_CHARS);
    var htmlChunks = splitPublicSheetCellTextV43_(html, GES_PUBLIC_CONTENT_V43.MAX_CELL_CHARS);
    var chunkCount = Math.max(plainChunks.length, htmlChunks.length, 1);
    var canonical = normalizePublicExactMatchV43_(docFile.getName()) === keyword;

    for (var i = 0; i < chunkCount; i++) {
      rows.push({
        type: GES_PUBLIC_CONTENT_V43.TYPE,
        document: docFile.getName(),
        content: plainChunks[i] || '',
        html: htmlChunks[i] || '',
        sourceUrl: docFile.getUrl(),
        targetUrl: project.targetPageUrl || '',
        canonical: canonical ? 'YES' : 'NO',
        modifiedAt: docFile.getLastUpdated().toISOString(),
        chunk: i + 1,
        chunks: chunkCount
      });
    }

    documents.push({
      docId: docFile.getId(),
      docName: docFile.getName(),
      canonical: canonical,
      modifiedAt: docFile.getLastUpdated().toISOString(),
      plainTextChars: plainText.length,
      htmlChars: html.length,
      chunkCount: chunkCount,
      warnings: (model.warnings || []).slice()
    });
  });

  return {
    projectId: project.projectId,
    projectKeyword: getProjectKeywordV41_(project),
    rows: rows,
    documents: documents
  };
}

function renderCanonicalModelPlainTextV43_(model) {
  var out = [];
  (model.blocks || []).forEach(function(block) {
    if (block.type === 'title' || block.type === 'heading' || block.type === 'paragraph') {
      var text = safeString_(block.text).trim();
      if (text) out.push(text);
    } else if (block.type === 'listItem') {
      var itemText = safeString_(block.text).trim();
      if (itemText) out.push((block.ordered ? '1. ' : '- ') + itemText);
    } else if (block.type === 'table') {
      (block.rows || []).forEach(function(row) {
        var cells = (row || []).map(function(cell) { return safeString_(cell && cell.text || '').trim(); });
        if (cells.some(Boolean)) out.push(cells.join('\t'));
      });
    } else if (block.type === 'horizontalRule') {
      out.push('---');
    }
  });
  return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

function splitPublicSheetCellTextV43_(text, maxChars) {
  var value = safeString_(text);
  var max = Math.max(1000, Number(maxChars || GES_PUBLIC_CONTENT_V43.MAX_CELL_CHARS));
  if (!value) return [''];
  if (value.length <= max) return [value];

  var chunks = [];
  var remaining = value;
  while (remaining.length > max) {
    var cut = remaining.lastIndexOf('\n\n', max);
    if (cut < Math.floor(max * 0.65)) cut = remaining.lastIndexOf('\n', max);
    if (cut < Math.floor(max * 0.65)) cut = remaining.lastIndexOf(' ', max);
    if (cut < Math.floor(max * 0.65)) cut = max;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks.length ? chunks : [''];
}

function normalizePublicExactMatchV43_(value) {
  return safeString_(value)
    .normalize ? safeString_(value).normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()
               : safeString_(value).trim().replace(/\s+/g, ' ').toLowerCase();
}
