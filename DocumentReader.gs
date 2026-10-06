/**
 * Google Docs reader used by Slides, HTML and the GES V4 canonical content layer.
 * Produces a normalized semantic model instead of one-off rendering logic.
 */

function readDocumentModel_(docId) {
  const doc = DocumentApp.openById(docId);
  const body = doc.getBody();
  const model = {
    docId: docId,
    title: doc.getName(),
    blocks: [],
    warnings: []
  };

  for (let i = 0; i < body.getNumChildren(); i++) {
    const child = body.getChild(i);
    const type = child.getType();

    // V4.6.6: the generated resource footer lives in the Source Doc for human
    // navigation only. Stop before the technical marker so footer links never
    // enter canonical content, fingerprints, Slides/PDF/DOCX/HTML, or Public
    // Content projection.
    if (type === DocumentApp.ElementType.PARAGRAPH || type === DocumentApp.ElementType.LIST_ITEM) {
      let markerText = '';
      try { markerText = child.getText(); } catch (ignoreFooterMarker) {}
      if (safeString_(markerText).indexOf('[[GES_RESOURCE_FOOTER_V466]]') !== -1) break;
    }

    if (type === DocumentApp.ElementType.PARAGRAPH) {
      const p = child.asParagraph();
      const block = paragraphToBlock_(p, false, model.warnings);
      if (block) model.blocks.push(block);
    } else if (type === DocumentApp.ElementType.LIST_ITEM) {
      const li = child.asListItem();
      const block = paragraphToBlock_(li, true, model.warnings);
      if (block) model.blocks.push(block);
    } else if (type === DocumentApp.ElementType.TABLE) {
      model.blocks.push(tableToBlock_(child.asTable(), model.warnings));
    } else if (type === DocumentApp.ElementType.PAGE_BREAK) {
      model.blocks.push({ type: 'pageBreak' });
    } else if (type === DocumentApp.ElementType.HORIZONTAL_RULE) {
      model.blocks.push({ type: 'horizontalRule' });
    }
  }
  return model;
}

function paragraphToBlock_(paragraph, isList, warnings) {
  const text = paragraph.getText();
  if (!text || !text.replace(/\u00A0/g, ' ').trim()) return null;

  const heading = paragraph.getHeading ? paragraph.getHeading() : DocumentApp.ParagraphHeading.NORMAL;
  if (heading === DocumentApp.ParagraphHeading.TITLE) {
    return { type: 'title', runs: extractParagraphRuns_(paragraph, warnings), text: text.trim() };
  }

  let level = 0;
  const headingMap = {};
  headingMap[DocumentApp.ParagraphHeading.HEADING1] = 1;
  headingMap[DocumentApp.ParagraphHeading.HEADING2] = 2;
  headingMap[DocumentApp.ParagraphHeading.HEADING3] = 3;
  headingMap[DocumentApp.ParagraphHeading.HEADING4] = 4;
  headingMap[DocumentApp.ParagraphHeading.HEADING5] = 5;
  headingMap[DocumentApp.ParagraphHeading.HEADING6] = 6;
  level = headingMap[heading] || 0;

  if (level) {
    return {
      type: 'heading',
      level: level,
      text: text.trim(),
      runs: extractParagraphRuns_(paragraph, warnings)
    };
  }

  if (isList) {
    let nestingLevel = 0;
    let glyphType = '';
    try { nestingLevel = paragraph.getNestingLevel(); } catch (e) {}
    try { glyphType = safeString_(paragraph.getGlyphType()); } catch (e) {}
    return {
      type: 'listItem',
      ordered: /NUMBER|ROMAN|LATIN|DECIMAL/i.test(glyphType),
      nestingLevel: nestingLevel,
      glyphType: glyphType,
      text: text.trim(),
      runs: extractParagraphRuns_(paragraph, warnings)
    };
  }

  return {
    type: 'paragraph',
    text: text.trim(),
    runs: extractParagraphRuns_(paragraph, warnings)
  };
}

function extractParagraphRuns_(paragraph, warnings) {
  const runs = [];
  const childCount = paragraph.getNumChildren ? paragraph.getNumChildren() : 0;
  let logicalOffset = 0;

  for (let i = 0; i < childCount; i++) {
    const child = paragraph.getChild(i);
    const type = child.getType();

    if (type === DocumentApp.ElementType.TEXT) {
      const textEl = child.asText();
      const txt = textEl.getText();
      if (!txt) continue;
      const indices = textEl.getTextAttributeIndices();
      const starts = indices && indices.length ? indices : [0];
      for (let k = 0; k < starts.length; k++) {
        const start = starts[k];
        const end = (k + 1 < starts.length ? starts[k + 1] : txt.length);
        if (end <= start) continue;
        let attrs = {};
        try { attrs = textEl.getAttributes(start) || {}; } catch (e) {}
        let linkUrl = '';
        try { linkUrl = textEl.getLinkUrl(start) || ''; } catch (e) {}
        runs.push({
          type: 'text',
          text: txt.substring(start, end),
          bold: attrs[DocumentApp.Attribute.BOLD] === true,
          italic: attrs[DocumentApp.Attribute.ITALIC] === true,
          underline: attrs[DocumentApp.Attribute.UNDERLINE] === true,
          linkUrl: linkUrl,
          start: logicalOffset + start,
          end: logicalOffset + end
        });
      }
      logicalOffset += txt.length;
    }

    else if (type === DocumentApp.ElementType.INLINE_IMAGE) {
      const image = child.asInlineImage();
      let altTitle = '';
      let altDescription = '';
      try { altTitle = image.getAltTitle() || ''; } catch (e) {}
      try { altDescription = image.getAltDescription() || ''; } catch (e) {}
      runs.push({
        type: 'image',
        imageKey: 'img_' + Utilities.getUuid().replace(/-/g, '').substring(0, 10),
        altTitle: altTitle,
        altDescription: altDescription,
        width: safeImageDim_(image, 'width'),
        height: safeImageDim_(image, 'height')
      });
      warnings.push('INLINE_IMAGE_REQUIRES_IMAGE_MANAGER');
    }
  }

  // Fallback for paragraphs represented as text but with no child runs.
  if (!runs.length && paragraph.getText()) {
    runs.push({ type: 'text', text: paragraph.getText(), bold: false, italic: false, underline: false, linkUrl: '', start: 0, end: paragraph.getText().length });
  }
  return runs;
}

function safeImageDim_(image, type) {
  try { return type === 'width' ? image.getWidth() : image.getHeight(); } catch (e) { return 0; }
}

function tableToBlock_(table, warnings) {
  const rows = [];
  for (let r = 0; r < table.getNumRows(); r++) {
    const row = table.getRow(r);
    const cells = [];
    for (let c = 0; c < row.getNumCells(); c++) {
      const cell = row.getCell(c);
      cells.push({
        text: cell.getText().trim(),
        runs: [{ type: 'text', text: cell.getText(), bold: false, italic: false, underline: false, linkUrl: '' }]
      });
    }
    rows.push(cells);
  }
  return { type: 'table', rows: rows };
}

function readDocumentForSlides_(docFile) {
  const model = readDocumentModel_(docFile.getId());
  const sections = [];
  let current = { title: 'Giới thiệu', items: [] };

  model.blocks.forEach(function(block) {
    if (block.type === 'title') return;
    if (block.type === 'heading' && (block.level === 1 || block.level === 2)) {
      if (current.items.length) sections.push(current);
      current = { title: block.text, items: [] };
      return;
    }
    if (block.type === 'heading') {
      current.items.push({
        text: block.text,
        isSubheading: true,
        isBullet: false,
        runs: normalizeRunsForSlides_(block.runs)
      });
      return;
    }
    if (block.type === 'paragraph') {
      current.items.push({
        text: block.text,
        isSubheading: false,
        isBullet: false,
        runs: normalizeRunsForSlides_(block.runs)
      });
      return;
    }
    if (block.type === 'listItem') {
      current.items.push({
        text: block.text,
        isSubheading: false,
        isBullet: true,
        runs: normalizeRunsForSlides_(block.runs)
      });
      return;
    }
    if (block.type === 'table') {
      block.rows.forEach(function(row) {
        const text = row.map(function(cell) { return cell.text; }).join(' • ');
        if (text) current.items.push({ text: text, isBullet: true, isSubheading: false, runs: [] });
      });
    }
  });
  if (current.items.length) sections.push(current);
  return sections;
}

function normalizeRunsForSlides_(runs) {
  const out = [];
  let pos = 0;
  (runs || []).forEach(function(run) {
    if (run.type !== 'text') return;
    const start = pos;
    pos += run.text.length;
    if (run.linkUrl) out.push({ start: start, end: pos, url: run.linkUrl });
  });
  return out;
}

function splitSectionForSlides_(section) {
  const chunks = [];
  let current = [];
  let chars = 0;
  (section.items || []).forEach(function(item) {
    let text = safeString_(item.text);
    if (text.length > V3_CONFIG.SLIDES.MAX_CHARS_PER_ITEM) {
      text = text.substring(0, V3_CONFIG.SLIDES.MAX_CHARS_PER_ITEM - 1) + '…';
      item = Object.assign({}, item, { text: text });
    }
    const wouldOverflow = current.length >= V3_CONFIG.SLIDES.MAX_ITEMS_PER_SLIDE ||
      chars + text.length > V3_CONFIG.SLIDES.MAX_CHARS_PER_SLIDE;
    if (wouldOverflow && current.length) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push(item);
    chars += text.length;
  });
  if (current.length) chunks.push(current);
  return chunks;
}
