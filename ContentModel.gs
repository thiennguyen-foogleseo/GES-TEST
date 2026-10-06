/**
 * GES V4 - Canonical Content Model builder.
 *
 * Read-only G1 layer:
 * Google Docs -> V3 DocumentReader model -> V4 Canonical Content Model.
 * No source document, asset, registry, or project profile is modified.
 */

/**
 * Public: build the canonical model.
 * docId and projectId are optional only when they can be resolved safely:
 * - projectId omitted -> active project
 * - docId omitted -> project must contain exactly one source Google Doc
 */
function buildCanonicalContentModelV4(docId, projectId) {
  var project = resolveContentModelProjectV4_(projectId);
  var docFile = resolveContentModelSourceDocV4_(project, docId);
  var raw = readDocumentModel_(docFile.getId());

  var warnings = (raw.warnings || []).slice();
  var blocks = canonicalizeBlocksV4_(raw.blocks || [], warnings);
  var page = buildContentPageV4_(project, docFile, blocks);
  var sections = deriveSectionsV4_(blocks);
  var links = extractCanonicalLinksV4_(blocks, project);
  var tables = extractCanonicalTablesV4_(blocks);
  var images = extractCanonicalImagesV4_(blocks);
  var derived = deriveCanonicalContentV4_(blocks, sections);
  var stats = computeCanonicalContentStatsV4_(blocks, links, tables, images);

  if (tables.length) warnings.push('TABLE_CELL_FORMATTING_LIMITED_BY_V3_READER');

  var modified = docFile.getLastUpdated();
  var model = {
    schemaVersion: GES_CONTENT_MODEL_SCHEMA_V4.VERSION,
    modelType: GES_CONTENT_MODEL_SCHEMA_V4.MODEL_TYPE,
    projectId: safeString_(project.projectId || ''),
    source: {
      docId: docFile.getId(),
      docName: docFile.getName(),
      docUrl: docFile.getUrl(),
      mimeType: docFile.getMimeType(),
      modifiedAt: modified ? modified.toISOString() : '',
      modifiedAtMs: modified ? modified.getTime() : 0
    },
    page: page,
    blocks: blocks,
    sections: sections,
    links: links,
    tables: tables,
    images: images,
    derived: derived,
    stats: stats,
    fingerprints: {},
    warnings: uniqueStringArrayContentV4_(warnings),
    generatedAt: nowIso_()
  };

  model.fingerprints = computeContentFingerprintsV4(model);

  var validation = validateCanonicalContentModelV4(model);
  if (!validation.valid) {
    throw new Error('Canonical Content Model V4 không hợp lệ: ' + validation.errors.join(', '));
  }
  model = validation.model;
  model.warnings = uniqueStringArrayContentV4_(model.warnings.concat(validation.warnings || []));
  return model;
}

/** Public: build using the active project. */
function buildActiveCanonicalContentModelV4(docId) {
  return buildCanonicalContentModelV4(docId || '', '');
}

/** Public: small preview for Logs/UI without returning the complete article body. */
function getCanonicalContentModelSummaryV4(docId, projectId) {
  var model = buildCanonicalContentModelV4(docId || '', projectId || '');
  return {
    schemaVersion: model.schemaVersion,
    modelType: model.modelType,
    projectId: model.projectId,
    source: model.source,
    page: model.page,
    stats: model.stats,
    fingerprints: model.fingerprints,
    warningCount: model.warnings.length,
    warnings: model.warnings,
    sectionTitles: model.sections.map(function(section) { return section.title; })
  };
}

/* ------------------------------------------------------------------
 * Private project/source resolution
 * ------------------------------------------------------------------ */

function resolveContentModelProjectV4_(projectId) {
  var project = null;
  if (projectId) {
    if (typeof getProject_ !== 'function') throw new Error('PROJECT_MANAGER_NOT_AVAILABLE');
    project = getProject_(projectId);
  } else {
    if (typeof getActiveProject_ !== 'function') throw new Error('PROJECT_MANAGER_NOT_AVAILABLE');
    project = getActiveProject_();
  }
  if (!project) throw new Error('PROJECT_NOT_FOUND_FOR_CONTENT_MODEL');
  return project;
}

function resolveContentModelSourceDocV4_(project, docId) {
  if (docId) {
    if (typeof getSourceDocById_ === 'function') {
      return getSourceDocById_(project, docId);
    }
    var file = DriveApp.getFileById(docId);
    if (file.getMimeType() !== MimeType.GOOGLE_DOCS) throw new Error('SOURCE_NOT_GOOGLE_DOCS');
    return file;
  }

  if (typeof getSourceDocs_ !== 'function') {
    throw new Error('SOURCE_DOC_RESOLVER_NOT_AVAILABLE');
  }
  var docs = getSourceDocs_(project);
  if (!docs.length) throw new Error('NO_SOURCE_DOCS_IN_ARTICLES_FOLDER');
  if (docs.length > 1) {
    throw new Error('MULTIPLE_SOURCE_DOCS_REQUIRE_EXPLICIT_DOC_ID: ' + docs.length);
  }
  return docs[0];
}

/* ------------------------------------------------------------------
 * Private canonical block conversion
 * ------------------------------------------------------------------ */

function canonicalizeBlocksV4_(rawBlocks, warnings) {
  var blocks = [];
  (rawBlocks || []).forEach(function(rawBlock, index) {
    rawBlock = rawBlock || {};
    var blockId = 'b' + padNumberContentV4_(index + 1, 6);
    var block = {
      id: blockId,
      order: index + 1,
      type: safeString_(rawBlock.type || ''),
      text: normalizeCanonicalTextV4_(rawBlock.text || ''),
      runs: canonicalizeRunsV4_(rawBlock.runs || [], blockId)
    };

    if (rawBlock.type === 'heading') block.level = Number(rawBlock.level || 0);
    if (rawBlock.type === 'listItem') {
      block.ordered = !!rawBlock.ordered;
      block.nestingLevel = Number(rawBlock.nestingLevel || 0);
      block.glyphType = safeString_(rawBlock.glyphType || '');
    }
    if (rawBlock.type === 'table') {
      block.tableId = 'table_' + padNumberContentV4_(countPriorBlocksOfTypeV4_(rawBlocks, index, 'table') + 1, 3);
      block.rows = canonicalizeTableRowsV4_(rawBlock.rows || [], blockId);
      block.runs = [];
      block.text = '';
    }
    if (rawBlock.type === 'pageBreak' || rawBlock.type === 'horizontalRule') {
      block.text = '';
      block.runs = [];
    }

    if (GES_CONTENT_MODEL_SCHEMA_V4.BLOCK_TYPES.indexOf(block.type) === -1) {
      warnings.push('UNSUPPORTED_SOURCE_BLOCK_' + safeString_(block.type || 'UNKNOWN'));
      return;
    }
    blocks.push(block);
  });
  return blocks;
}

function canonicalizeRunsV4_(runs, blockId) {
  var out = [];
  (runs || []).forEach(function(run, index) {
    run = run || {};
    if (run.type === 'image') {
      out.push({
        type: 'image',
        imageId: 'img_' + blockId + '_r' + padNumberContentV4_(index + 1, 2),
        altTitle: safeString_(run.altTitle || ''),
        altDescription: safeString_(run.altDescription || ''),
        width: Number(run.width || 0),
        height: Number(run.height || 0)
      });
      return;
    }
    out.push({
      type: 'text',
      text: normalizeCanonicalRunTextV4_(run.text || ''),
      bold: !!run.bold,
      italic: !!run.italic,
      underline: !!run.underline,
      linkUrl: normalizeUrl_(run.linkUrl || ''),
      start: Number(run.start || 0),
      end: Number(run.end || 0)
    });
  });
  return out;
}

function canonicalizeTableRowsV4_(rows, blockId) {
  return (rows || []).map(function(row, rowIndex) {
    return (row || []).map(function(cell, cellIndex) {
      cell = cell || {};
      return {
        text: normalizeCanonicalTextV4_(cell.text || ''),
        runs: canonicalizeRunsV4_(cell.runs || [], blockId + '_c' + (rowIndex + 1) + '_' + (cellIndex + 1))
      };
    });
  });
}

/* ------------------------------------------------------------------
 * Private page/title derivation
 * ------------------------------------------------------------------ */

function buildContentPageV4_(project, docFile, blocks) {
  var documentTitle = '';
  var h1 = '';
  for (var i = 0; i < blocks.length; i++) {
    if (!documentTitle && blocks[i].type === 'title') documentTitle = blocks[i].text;
    if (!h1 && blocks[i].type === 'heading' && Number(blocks[i].level) === 1) h1 = blocks[i].text;
    if (documentTitle && h1) break;
  }

  var titleSource = 'FILE_NAME';
  if (documentTitle) titleSource = 'DOC_TITLE';
  else if (h1) titleSource = 'H1';

  var language = 'vi-VN';
  if (project.contentModelConfig && project.contentModelConfig.language) {
    language = safeString_(project.contentModelConfig.language);
  }

  return {
    projectType: safeString_(project.projectType || 'UNSPECIFIED'),
    targetPageUrl: normalizeUrl_(project.targetPageUrl || ''),
    language: language,
    fileNameTitle: docFile.getName(),
    documentTitle: documentTitle,
    h1: h1,
    titleSource: titleSource
  };
}

/* ------------------------------------------------------------------
 * Private section/link/table/image derivation
 * ------------------------------------------------------------------ */

function deriveSectionsV4_(blocks) {
  var sections = [];
  var stack = [];
  var currentSection = null;

  blocks.forEach(function(block) {
    if (block.type === 'heading') {
      var level = Number(block.level || 0);
      while (stack.length && Number(stack[stack.length - 1].headingLevel) >= level) stack.pop();
      var section = {
        id: 'sec_' + padNumberContentV4_(sections.length + 1, 3),
        title: block.text,
        headingLevel: level,
        headingBlockId: block.id,
        parentSectionId: stack.length ? stack[stack.length - 1].id : '',
        blockIds: []
      };
      sections.push(section);
      stack.push(section);
      currentSection = section;
      return;
    }
    if (currentSection) currentSection.blockIds.push(block.id);
  });

  return sections;
}

function extractCanonicalLinksV4_(blocks, project) {
  var links = [];

  function addRunLink(blockId, tableId, cellPath, run) {
    if (!run || run.type !== 'text' || !run.linkUrl) return;
    links.push({
      id: 'link_' + padNumberContentV4_(links.length + 1, 3),
      blockId: blockId,
      tableId: tableId || '',
      cellPath: cellPath || '',
      text: normalizeCanonicalTextV4_(run.text || ''),
      url: normalizeUrl_(run.linkUrl),
      type: classifyCanonicalLinkV4_(run.linkUrl, project)
    });
  }

  blocks.forEach(function(block) {
    (block.runs || []).forEach(function(run) {
      addRunLink(block.id, '', '', run);
    });
    if (block.type === 'table') {
      (block.rows || []).forEach(function(row, r) {
        (row || []).forEach(function(cell, c) {
          (cell.runs || []).forEach(function(run) {
            addRunLink(block.id, block.tableId || '', 'r' + (r + 1) + 'c' + (c + 1), run);
          });
        });
      });
    }
  });
  return links;
}

function extractCanonicalTablesV4_(blocks) {
  return blocks.filter(function(block) { return block.type === 'table'; }).map(function(block) {
    var maxColumns = 0;
    (block.rows || []).forEach(function(row) { maxColumns = Math.max(maxColumns, (row || []).length); });
    return {
      id: block.tableId,
      blockId: block.id,
      rowCount: (block.rows || []).length,
      columnCount: maxColumns,
      rows: cloneJson_(block.rows || [])
    };
  });
}

function extractCanonicalImagesV4_(blocks) {
  var images = [];
  blocks.forEach(function(block) {
    (block.runs || []).forEach(function(run, index) {
      if (run.type !== 'image') return;
      images.push({
        id: run.imageId,
        blockId: block.id,
        runIndex: index,
        altTitle: run.altTitle,
        altDescription: run.altDescription,
        width: run.width,
        height: run.height,
        resolutionStatus: 'INLINE_IMAGE_UNRESOLVED'
      });
    });
  });
  return images;
}

function classifyCanonicalLinkV4_(url, project) {
  var host = extractHostnameContentV4_(url);
  if (!host) return 'UNKNOWN';

  var googleAssetHosts = [
    'docs.google.com',
    'drive.google.com',
    'slides.google.com',
    'sheets.google.com',
    'forms.google.com',
    'sites.google.com'
  ];
  if (googleAssetHosts.some(function(domain) { return host === domain || host.slice(-(domain.length + 1)) === '.' + domain; })) {
    return 'GOOGLE_ASSET';
  }

  var internalHosts = [];
  var websiteHost = extractHostnameContentV4_(project.websiteUrl || '');
  var targetHost = extractHostnameContentV4_(project.targetPageUrl || '');
  if (websiteHost) internalHosts.push(websiteHost);
  if (targetHost && internalHosts.indexOf(targetHost) === -1) internalHosts.push(targetHost);

  if (internalHosts.some(function(domain) { return host === domain || host.slice(-(domain.length + 1)) === '.' + domain; })) {
    return 'INTERNAL';
  }
  return 'EXTERNAL';
}

/* ------------------------------------------------------------------
 * Private derived candidates / stats
 * ------------------------------------------------------------------ */

function deriveCanonicalContentV4_(blocks, sections) {
  var firstHeadingOrder = null;
  blocks.some(function(block) {
    if (block.type === 'heading') {
      firstHeadingOrder = block.order;
      return true;
    }
    return false;
  });

  var introBlockIds = blocks.filter(function(block) {
    return firstHeadingOrder === null || block.order < firstHeadingOrder;
  }).filter(function(block) {
    return block.type !== 'title';
  }).map(function(block) { return block.id; });

  var sectionMap = {};
  sections.forEach(function(section) { sectionMap[section.id] = section; });
  var faqRoots = {};
  sections.forEach(function(section) {
    if (isExplicitFaqHeadingV4_(section.title)) faqRoots[section.id] = true;
  });

  var faqCandidates = [];
  sections.forEach(function(section) {
    var parent = section.parentSectionId ? sectionMap[section.parentSectionId] : null;
    var insideFaq = !!faqRoots[section.parentSectionId] || (parent && parent.parentSectionId && !!faqRoots[parent.parentSectionId]);
    var explicitQuestion = /\?\s*$/.test(section.title);
    if (!explicitQuestion && !insideFaq) return;

    faqCandidates.push({
      question: section.title,
      answerBlockIds: (section.blockIds || []).slice(),
      sourceBlockIds: [section.headingBlockId].concat(section.blockIds || []),
      derivationRule: explicitQuestion ? 'HEADING_ENDS_WITH_QUESTION_MARK' : 'HEADING_UNDER_EXPLICIT_FAQ_SECTION',
      confidence: explicitQuestion ? 1 : 0.9
    });
  });

  return {
    introBlockIds: introBlockIds,
    faqCandidates: faqCandidates,
    facts: [],
    timelineCandidates: []
  };
}

function computeCanonicalContentStatsV4_(blocks, links, tables, images) {
  var headingCount = 0;
  var h1 = 0;
  var h2 = 0;
  var h3 = 0;
  var textParts = [];

  blocks.forEach(function(block) {
    if (block.type === 'heading') {
      headingCount++;
      if (block.level === 1) h1++;
      if (block.level === 2) h2++;
      if (block.level === 3) h3++;
    }
    if (block.type === 'table') {
      (block.rows || []).forEach(function(row) {
        (row || []).forEach(function(cell) { if (cell.text) textParts.push(cell.text); });
      });
    } else if (block.text) {
      textParts.push(block.text);
    }
  });

  return {
    blockCount: blocks.length,
    wordCount: countWordsContentV4_(textParts.join(' ')),
    headingCount: headingCount,
    h1Count: h1,
    h2Count: h2,
    h3Count: h3,
    linkCount: links.length,
    tableCount: tables.length,
    imageCount: images.length
  };
}

/* ------------------------------------------------------------------
 * Private low-level helpers
 * ------------------------------------------------------------------ */

function normalizeCanonicalTextV4_(value) {
  return safeString_(value).replace(/\r\n/g, '\n').replace(/\u00A0/g, ' ').trim();
}

function normalizeCanonicalRunTextV4_(value) {
  return safeString_(value).replace(/\r\n/g, '\n').replace(/\u00A0/g, ' ');
}

function padNumberContentV4_(value, size) {
  var s = String(Number(value || 0));
  while (s.length < size) s = '0' + s;
  return s;
}

function countPriorBlocksOfTypeV4_(blocks, beforeIndex, type) {
  var count = 0;
  for (var i = 0; i < beforeIndex; i++) {
    if (blocks[i] && blocks[i].type === type) count++;
  }
  return count;
}

function extractHostnameContentV4_(url) {
  var s = normalizeUrl_(url).toLowerCase();
  if (!s) return '';
  var match = s.match(/^(?:https?:\/\/)?([^\/:?#]+)(?:[\/:?#]|$)/i);
  return match && match[1] ? match[1].replace(/^www\./, '') : '';
}

function isExplicitFaqHeadingV4_(text) {
  var s = normalizeCanonicalTextV4_(text).toLowerCase();
  return s.indexOf('faq') !== -1 ||
    s.indexOf('câu hỏi thường gặp') !== -1 ||
    s.indexOf('hoi dap') !== -1 ||
    s.indexOf('hỏi đáp') !== -1 ||
    s.indexOf('giải đáp') !== -1;
}

function countWordsContentV4_(text) {
  var s = normalizeCanonicalTextV4_(text);
  if (!s) return 0;
  return s.split(/\s+/).filter(function(token) { return !!token; }).length;
}
