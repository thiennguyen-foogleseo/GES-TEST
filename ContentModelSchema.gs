/**
 * GES V4 - Canonical Content Model schema v1.0.0
 *
 * Pure schema/normalization/validation helpers.
 * This file MUST NOT write to Drive, Docs, Registry, or Project Profile.
 */

var GES_CONTENT_MODEL_SCHEMA_V4 = Object.freeze({
  VERSION: '1.0.0',
  MODEL_TYPE: 'GES_CANONICAL_CONTENT',
  BLOCK_TYPES: [
    'title',
    'heading',
    'paragraph',
    'listItem',
    'table',
    'pageBreak',
    'horizontalRule'
  ],
  LINK_TYPES: [
    'INTERNAL',
    'EXTERNAL',
    'GOOGLE_ASSET',
    'UNKNOWN'
  ],
  IMAGE_RESOLUTION_STATUSES: [
    'INLINE_IMAGE_UNRESOLVED',
    'RESOLVED',
    'MISSING',
    'ERROR'
  ]
});

/** Public: return a safe copy of the Content Model schema contract. */
function getCanonicalContentModelSchemaV4() {
  return cloneJson_(GES_CONTENT_MODEL_SCHEMA_V4);
}

/**
 * Public: validate a Canonical Content Model without mutating it.
 * Returns {valid, errors, warnings, model}.
 */
function validateCanonicalContentModelV4(model) {
  var errors = [];
  var warnings = [];
  var m = normalizeCanonicalContentModelV4_(model);

  if (m.schemaVersion !== GES_CONTENT_MODEL_SCHEMA_V4.VERSION) {
    errors.push('INVALID_CONTENT_MODEL_SCHEMA_VERSION');
  }
  if (m.modelType !== GES_CONTENT_MODEL_SCHEMA_V4.MODEL_TYPE) {
    errors.push('INVALID_CONTENT_MODEL_TYPE');
  }
  if (!m.projectId) errors.push('PROJECT_ID_REQUIRED');
  if (!m.source.docId) errors.push('SOURCE_DOC_ID_REQUIRED');
  if (!m.source.docName) warnings.push('SOURCE_DOC_NAME_MISSING');

  var blockIds = {};
  m.blocks.forEach(function(block, index) {
    if (!block.id) {
      errors.push('BLOCK_ID_REQUIRED_AT_' + index);
      return;
    }
    if (blockIds[block.id]) errors.push('DUPLICATE_BLOCK_ID_' + block.id);
    blockIds[block.id] = true;

    if (GES_CONTENT_MODEL_SCHEMA_V4.BLOCK_TYPES.indexOf(block.type) === -1) {
      errors.push('INVALID_BLOCK_TYPE_' + safeString_(block.type));
    }
    if (block.type === 'heading') {
      var level = Number(block.level || 0);
      if (level < 1 || level > 6) errors.push('INVALID_HEADING_LEVEL_' + block.id);
    }
  });

  var sectionIds = {};
  m.sections.forEach(function(section) {
    if (!section.id) {
      errors.push('SECTION_ID_REQUIRED');
      return;
    }
    if (sectionIds[section.id]) errors.push('DUPLICATE_SECTION_ID_' + section.id);
    sectionIds[section.id] = true;
    if (section.headingBlockId && !blockIds[section.headingBlockId]) {
      errors.push('SECTION_HEADING_BLOCK_NOT_FOUND_' + section.id);
    }
    (section.blockIds || []).forEach(function(blockId) {
      if (!blockIds[blockId]) warnings.push('SECTION_BLOCK_NOT_FOUND_' + blockId);
    });
  });

  m.links.forEach(function(link) {
    if (!link.id) errors.push('LINK_ID_REQUIRED');
    if (!link.url) warnings.push('LINK_URL_MISSING_' + safeString_(link.id));
    if (GES_CONTENT_MODEL_SCHEMA_V4.LINK_TYPES.indexOf(link.type) === -1) {
      warnings.push('UNKNOWN_LINK_TYPE_' + safeString_(link.id));
    }
  });

  m.images.forEach(function(image) {
    if (!image.id) errors.push('IMAGE_ID_REQUIRED');
    if (image.blockId && !blockIds[image.blockId]) {
      warnings.push('IMAGE_BLOCK_NOT_FOUND_' + safeString_(image.id));
    }
  });

  if (!m.page.fileNameTitle && !m.page.documentTitle && !m.page.h1) {
    warnings.push('CONTENT_TITLE_NOT_RESOLVED');
  }

  return {
    valid: errors.length === 0,
    errors: errors,
    warnings: uniqueStringArrayContentV4_(warnings),
    model: m
  };
}

/* ------------------------------------------------------------------
 * Private normalization helpers
 * ------------------------------------------------------------------ */

function normalizeCanonicalContentModelV4_(raw) {
  var input = raw || {};
  var out = {
    schemaVersion: safeString_(input.schemaVersion || GES_CONTENT_MODEL_SCHEMA_V4.VERSION),
    modelType: safeString_(input.modelType || GES_CONTENT_MODEL_SCHEMA_V4.MODEL_TYPE),
    projectId: safeString_(input.projectId || ''),
    source: normalizeContentSourceV4_(input.source),
    page: normalizeContentPageV4_(input.page),
    blocks: normalizeContentBlocksV4_(input.blocks),
    sections: normalizeContentSectionsV4_(input.sections),
    links: normalizeContentLinksV4_(input.links),
    tables: normalizeContentTablesV4_(input.tables),
    images: normalizeContentImagesV4_(input.images),
    derived: normalizeContentDerivedV4_(input.derived),
    stats: normalizeContentStatsV4_(input.stats),
    fingerprints: normalizeContentFingerprintsV4_(input.fingerprints),
    warnings: uniqueStringArrayContentV4_(input.warnings || []),
    generatedAt: safeString_(input.generatedAt || '')
  };
  return out;
}

function normalizeContentSourceV4_(source) {
  source = source || {};
  return {
    docId: safeString_(source.docId || ''),
    docName: safeString_(source.docName || ''),
    docUrl: normalizeUrl_(source.docUrl || ''),
    mimeType: safeString_(source.mimeType || ''),
    modifiedAt: safeString_(source.modifiedAt || ''),
    modifiedAtMs: Number(source.modifiedAtMs || 0)
  };
}

function normalizeContentPageV4_(page) {
  page = page || {};
  return {
    projectType: safeString_(page.projectType || 'UNSPECIFIED'),
    targetPageUrl: normalizeUrl_(page.targetPageUrl || ''),
    language: safeString_(page.language || 'vi-VN'),
    fileNameTitle: safeString_(page.fileNameTitle || ''),
    documentTitle: safeString_(page.documentTitle || ''),
    h1: safeString_(page.h1 || ''),
    titleSource: safeString_(page.titleSource || 'FILE_NAME')
  };
}

function normalizeContentBlocksV4_(blocks) {
  return (Array.isArray(blocks) ? blocks : []).map(function(block, index) {
    block = block || {};
    var out = {
      id: safeString_(block.id || ''),
      order: Number(block.order || (index + 1)),
      type: safeString_(block.type || ''),
      text: safeString_(block.text || ''),
      runs: normalizeContentRunsV4_(block.runs)
    };

    if (block.level !== undefined) out.level = Number(block.level || 0);
    if (block.ordered !== undefined) out.ordered = !!block.ordered;
    if (block.nestingLevel !== undefined) out.nestingLevel = Number(block.nestingLevel || 0);
    if (block.glyphType !== undefined) out.glyphType = safeString_(block.glyphType || '');
    if (block.tableId !== undefined) out.tableId = safeString_(block.tableId || '');
    if (Array.isArray(block.rows)) out.rows = normalizeTableRowsV4_(block.rows);
    return out;
  });
}

function normalizeContentRunsV4_(runs) {
  return (Array.isArray(runs) ? runs : []).map(function(run) {
    run = run || {};
    if (run.type === 'image') {
      return {
        type: 'image',
        imageId: safeString_(run.imageId || ''),
        altTitle: safeString_(run.altTitle || ''),
        altDescription: safeString_(run.altDescription || ''),
        width: Number(run.width || 0),
        height: Number(run.height || 0)
      };
    }
    return {
      type: 'text',
      text: safeString_(run.text || ''),
      bold: !!run.bold,
      italic: !!run.italic,
      underline: !!run.underline,
      linkUrl: normalizeUrl_(run.linkUrl || ''),
      start: Number(run.start || 0),
      end: Number(run.end || 0)
    };
  });
}

function normalizeContentSectionsV4_(sections) {
  return (Array.isArray(sections) ? sections : []).map(function(section) {
    section = section || {};
    return {
      id: safeString_(section.id || ''),
      title: safeString_(section.title || ''),
      headingLevel: Number(section.headingLevel || 0),
      headingBlockId: safeString_(section.headingBlockId || ''),
      parentSectionId: safeString_(section.parentSectionId || ''),
      blockIds: uniqueStringArrayContentV4_(section.blockIds || [])
    };
  });
}

function normalizeContentLinksV4_(links) {
  return (Array.isArray(links) ? links : []).map(function(link) {
    link = link || {};
    return {
      id: safeString_(link.id || ''),
      blockId: safeString_(link.blockId || ''),
      tableId: safeString_(link.tableId || ''),
      cellPath: safeString_(link.cellPath || ''),
      text: safeString_(link.text || ''),
      url: normalizeUrl_(link.url || ''),
      type: safeString_(link.type || 'UNKNOWN')
    };
  });
}

function normalizeContentTablesV4_(tables) {
  return (Array.isArray(tables) ? tables : []).map(function(table) {
    table = table || {};
    return {
      id: safeString_(table.id || ''),
      blockId: safeString_(table.blockId || ''),
      rowCount: Number(table.rowCount || 0),
      columnCount: Number(table.columnCount || 0),
      rows: normalizeTableRowsV4_(table.rows)
    };
  });
}

function normalizeTableRowsV4_(rows) {
  return (Array.isArray(rows) ? rows : []).map(function(row) {
    return (Array.isArray(row) ? row : []).map(function(cell) {
      cell = cell || {};
      return {
        text: safeString_(cell.text || ''),
        runs: normalizeContentRunsV4_(cell.runs)
      };
    });
  });
}

function normalizeContentImagesV4_(images) {
  return (Array.isArray(images) ? images : []).map(function(image) {
    image = image || {};
    return {
      id: safeString_(image.id || ''),
      blockId: safeString_(image.blockId || ''),
      runIndex: Number(image.runIndex || 0),
      altTitle: safeString_(image.altTitle || ''),
      altDescription: safeString_(image.altDescription || ''),
      width: Number(image.width || 0),
      height: Number(image.height || 0),
      resolutionStatus: safeString_(image.resolutionStatus || 'INLINE_IMAGE_UNRESOLVED')
    };
  });
}

function normalizeContentDerivedV4_(derived) {
  derived = derived || {};
  return {
    introBlockIds: uniqueStringArrayContentV4_(derived.introBlockIds || []),
    faqCandidates: Array.isArray(derived.faqCandidates) ? cloneJson_(derived.faqCandidates) : [],
    facts: Array.isArray(derived.facts) ? cloneJson_(derived.facts) : [],
    timelineCandidates: Array.isArray(derived.timelineCandidates) ? cloneJson_(derived.timelineCandidates) : []
  };
}

function normalizeContentStatsV4_(stats) {
  stats = stats || {};
  return {
    blockCount: Number(stats.blockCount || 0),
    wordCount: Number(stats.wordCount || 0),
    headingCount: Number(stats.headingCount || 0),
    h1Count: Number(stats.h1Count || 0),
    h2Count: Number(stats.h2Count || 0),
    h3Count: Number(stats.h3Count || 0),
    linkCount: Number(stats.linkCount || 0),
    tableCount: Number(stats.tableCount || 0),
    imageCount: Number(stats.imageCount || 0)
  };
}

function normalizeContentFingerprintsV4_(fingerprints) {
  fingerprints = fingerprints || {};
  return {
    source: safeString_(fingerprints.source || ''),
    content: safeString_(fingerprints.content || ''),
    structure: safeString_(fingerprints.structure || ''),
    links: safeString_(fingerprints.links || ''),
    images: safeString_(fingerprints.images || ''),
    model: safeString_(fingerprints.model || '')
  };
}

function uniqueStringArrayContentV4_(values) {
  var seen = {};
  var out = [];
  (Array.isArray(values) ? values : []).forEach(function(value) {
    var s = safeString_(value).trim();
    if (!s || seen[s]) return;
    seen[s] = true;
    out.push(s);
  });
  return out;
}
