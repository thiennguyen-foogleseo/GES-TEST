/**
 * GES V4 - Canonical Content fingerprints.
 *
 * Fingerprints are deterministic and exclude generatedAt/random identifiers.
 * This file is pure: no Drive/Docs/Registry writes.
 */

/**
 * Public: compute all deterministic fingerprints for a canonical model.
 * Returns {source, content, structure, links, images, model}.
 */
function computeContentFingerprintsV4(model) {
  var m = normalizeCanonicalContentModelV4_(model);

  var sourcePayload = {
    schemaVersion: m.schemaVersion,
    docId: m.source.docId,
    modifiedAt: m.source.modifiedAt,
    modifiedAtMs: m.source.modifiedAtMs
  };

  var contentPayload = m.blocks.map(function(block) {
    return contentBlockPayloadV4_(block);
  });

  var structurePayload = {
    blocks: m.blocks.map(function(block) {
      return {
        id: block.id,
        order: block.order,
        type: block.type,
        level: block.level || 0,
        ordered: block.ordered === true,
        nestingLevel: Number(block.nestingLevel || 0),
        glyphType: safeString_(block.glyphType || ''),
        tableId: safeString_(block.tableId || '')
      };
    }),
    sections: m.sections.map(function(section) {
      return {
        id: section.id,
        title: section.title,
        headingLevel: section.headingLevel,
        headingBlockId: section.headingBlockId,
        parentSectionId: section.parentSectionId,
        blockIds: (section.blockIds || []).slice()
      };
    })
  };

  var linksPayload = m.links.map(function(link) {
    return {
      blockId: link.blockId,
      tableId: link.tableId,
      cellPath: link.cellPath,
      text: normalizeFingerprintTextV4_(link.text),
      url: normalizeUrl_(link.url),
      type: link.type
    };
  }).sort(function(a, b) {
    return stableStringifyV4_(a).localeCompare(stableStringifyV4_(b));
  });

  var imagesPayload = m.images.map(function(image) {
    return {
      id: image.id,
      blockId: image.blockId,
      runIndex: image.runIndex,
      altTitle: normalizeFingerprintTextV4_(image.altTitle),
      altDescription: normalizeFingerprintTextV4_(image.altDescription),
      width: image.width,
      height: image.height,
      resolutionStatus: image.resolutionStatus
    };
  }).sort(function(a, b) {
    return a.id.localeCompare(b.id);
  });

  var fingerprints = {
    source: sha256Hex_(stableStringifyV4_(sourcePayload)),
    content: sha256Hex_(stableStringifyV4_(contentPayload)),
    structure: sha256Hex_(stableStringifyV4_(structurePayload)),
    links: sha256Hex_(stableStringifyV4_(linksPayload)),
    images: sha256Hex_(stableStringifyV4_(imagesPayload))
  };

  fingerprints.model = sha256Hex_(stableStringifyV4_({
    schemaVersion: GES_CONTENT_MODEL_SCHEMA_V4.VERSION,
    source: fingerprints.source,
    content: fingerprints.content,
    structure: fingerprints.structure,
    links: fingerprints.links,
    images: fingerprints.images
  }));

  return fingerprints;
}

/** Public: quick deterministic check useful during G1 smoke testing. */
function verifyContentFingerprintDeterminismV4(model) {
  var first = computeContentFingerprintsV4(model);
  var second = computeContentFingerprintsV4(cloneJson_(model));
  return {
    deterministic: stableStringifyV4_(first) === stableStringifyV4_(second),
    first: first,
    second: second
  };
}

/* ------------------------------------------------------------------
 * Private fingerprint helpers
 * ------------------------------------------------------------------ */

function contentBlockPayloadV4_(block) {
  var payload = {
    id: block.id,
    type: block.type,
    text: normalizeFingerprintTextV4_(block.text),
    runs: (block.runs || []).map(function(run) {
      if (run.type === 'image') {
        return {
          type: 'image',
          imageId: run.imageId,
          altTitle: normalizeFingerprintTextV4_(run.altTitle),
          altDescription: normalizeFingerprintTextV4_(run.altDescription),
          width: Number(run.width || 0),
          height: Number(run.height || 0)
        };
      }
      return {
        type: 'text',
        text: normalizeFingerprintRunTextV4_(run.text),
        bold: !!run.bold,
        italic: !!run.italic,
        underline: !!run.underline,
        linkUrl: normalizeUrl_(run.linkUrl || '')
      };
    })
  };

  if (block.type === 'heading') payload.level = Number(block.level || 0);
  if (block.type === 'listItem') {
    payload.ordered = !!block.ordered;
    payload.nestingLevel = Number(block.nestingLevel || 0);
    payload.glyphType = safeString_(block.glyphType || '');
  }
  if (block.type === 'table') {
    payload.tableId = safeString_(block.tableId || '');
    payload.rows = normalizeTableFingerprintRowsV4_(block.rows || []);
  }
  return payload;
}

function normalizeTableFingerprintRowsV4_(rows) {
  return (rows || []).map(function(row) {
    return (row || []).map(function(cell) {
      return {
        text: normalizeFingerprintTextV4_(cell.text),
        runs: (cell.runs || []).map(function(run) {
          if (run.type === 'image') {
            return {
              type: 'image',
              imageId: run.imageId,
              altTitle: normalizeFingerprintTextV4_(run.altTitle),
              altDescription: normalizeFingerprintTextV4_(run.altDescription),
              width: Number(run.width || 0),
              height: Number(run.height || 0)
            };
          }
          return {
            type: 'text',
            text: normalizeFingerprintRunTextV4_(run.text),
            bold: !!run.bold,
            italic: !!run.italic,
            underline: !!run.underline,
            linkUrl: normalizeUrl_(run.linkUrl || '')
          };
        })
      };
    });
  });
}

function normalizeFingerprintTextV4_(value) {
  return safeString_(value)
    .replace(/\r\n/g, '\n')
    .replace(/\u00A0/g, ' ')
    .trim();
}

function normalizeFingerprintRunTextV4_(value) {
  return safeString_(value)
    .replace(/\r\n/g, '\n')
    .replace(/\u00A0/g, ' ');
}

/** Stable JSON serializer with recursively sorted object keys. */
function stableStringifyV4_(value) {
  return JSON.stringify(stableNormalizeV4_(value));
}

function stableNormalizeV4_(value) {
  if (Array.isArray(value)) {
    return value.map(stableNormalizeV4_);
  }
  if (value && typeof value === 'object' && Object.prototype.toString.call(value) === '[object Object]') {
    var out = {};
    Object.keys(value).sort().forEach(function(key) {
      if (value[key] === undefined) return;
      out[key] = stableNormalizeV4_(value[key]);
    });
    return out;
  }
  return value;
}
