/**
 * GES V4.6.7 — Unified Output Resource Footer & Hyperlink Propagation
 *
 * Adds the same project resource graph used by the V4.6.6 Source Google Docs
 * footer to Slides / HTML / PDF / DOCX without allowing generated resource
 * blocks to become canonical article content.
 */

const GES_OUTPUT_RESOURCE_FOOTER_V467 = Object.freeze({
  VERSION: '4.6.7.1',
  SLIDE_MARKER: '[[GES_OUTPUT_RESOURCE_FOOTER_V467]]',
  HTML_START: '<!-- GES_OUTPUT_RESOURCE_FOOTER_V467_START -->',
  HTML_END: '<!-- GES_OUTPUT_RESOURCE_FOOTER_V467_END -->',
  RESOURCE_TITLE: 'NGUỒN THAM KHẢO THÊM',
  LINKS_PER_SLIDE: 10
});

var GES_OUTPUT_RESOURCE_FP_CACHE_V467_ = {};

function getOutputResourceFooterSchemaV467() {
  return {
    version: GES_OUTPUT_RESOURCE_FOOTER_V467.VERSION,
    outputs: ['SLIDES', 'PDF', 'DOCX', 'HTML'],
    sourceModel: 'DocumentResourceFooterV466',
    sourceFooterCanonical: false,
    hyperlinkPropagation: true
  };
}

function previewActiveOutputResourceFootersV467() {
  var project = getActiveProject_();
  if (!project) throw new Error('Chưa có active project.');
  var rows = getSourceDocs_(project).map(function(docFile) {
    return previewOneOutputResourceFooterV467_(project, docFile);
  });
  return {
    success: true,
    version: GES_OUTPUT_RESOURCE_FOOTER_V467.VERSION,
    projectId: project.projectId,
    projectName: project.projectName,
    documents: rows
  };
}

function previewOneOutputResourceFooterV467_(project, docFile) {
  var model = collectOutputResourceFooterModelV467_(project, docFile);
  var fp = computeOutputResourceFingerprintV467_(model);
  var outputs = {};
  ['SLIDES','PDF','DOCX','HTML'].forEach(function(type) {
    var state = getAssetState_(project, docFile, type);
    var reg = getAssetRegistry_(project.projectId, docFile.getId(), type) || {};
    outputs[type] = {
      status: state.status,
      outputId: state.id || '',
      storedResourceFingerprint: safeString_(reg.resourceFooterFingerprint || ''),
      desiredResourceFingerprint: fp,
      resourceCurrent: !!reg.resourceFooterFingerprint && reg.resourceFooterFingerprint === fp
    };
  });
  return {
    docId: docFile.getId(),
    docName: docFile.getName(),
    resourceLinks: summarizeDocumentResourceFooterModelV466_(model),
    resourceFingerprint: fp,
    outputs: outputs
  };
}

function syncActiveProjectOutputResourceFootersV467() {
  if (typeof queueOutputResourceSyncV468 !== 'function') {
    throw new Error('SELECTIVE_SYNC_QUEUE_V468_NOT_INSTALLED');
  }
  return queueOutputResourceSyncV468();
}

function syncProjectOutputResourceFootersV467_(projectId, options) {
  options = options || {};
  var project = getProject_(projectId);
  if (!project) throw new Error('OUTPUT_RESOURCE_FOOTER_PROJECT_NOT_FOUND');
  assertProjectWritable_(project);

  var results = [];
  getSourceDocs_(project).forEach(function(docFile) {
    results.push(syncOneDocumentOutputResourceFootersV467_(project, docFile, options));
  });
  var failed = results.filter(function(r) { return !r.success; });
  return {
    success: failed.length === 0,
    version: GES_OUTPUT_RESOURCE_FOOTER_V467.VERSION,
    projectId: project.projectId,
    documentCount: results.length,
    failedCount: failed.length,
    results: results
  };
}

function syncOneDocumentOutputResourceFootersV467_(project, docFile, options) {
  options = options || {};
  var model = collectOutputResourceFooterModelV467_(project, docFile);
  var desiredFp = computeOutputResourceFingerprintV467_(model);
  var results = [];
  ['SLIDES','PDF','DOCX','HTML'].forEach(function(type) {
    try {
      results.push(syncOneOutputResourceFooterV467_(project, docFile, type, model, desiredFp, options));
    } catch (e) {
      results.push({ success: false, assetType: type, code: 'OUTPUT_RESOURCE_FOOTER_ERROR', message: e.message || String(e) });
    }
  });
  return {
    success: results.every(function(r) { return r.success !== false; }),
    docId: docFile.getId(),
    docName: docFile.getName(),
    desiredResourceFingerprint: desiredFp,
    results: results
  };
}

function syncOneOutputResourceFooterV467_(project, docFile, assetType, model, desiredFp, options) {
  // Ensure Registry/tag writers invoked by update helpers persist the exact
  // resource graph fingerprint used for this propagation pass, even if an
  // earlier dashboard/state calculation cached a pre-Calendar fingerprint.
  GES_OUTPUT_RESOURCE_FP_CACHE_V467_[safeString_(project.projectId) + '|' + safeString_(docFile.getId())] = desiredFp;
  var resolved = resolveAssetForDoc_(project, docFile, assetType);
  if (!resolved.file || resolved.ambiguous) {
    return { success: true, skipped: true, assetType: assetType, code: resolved.ambiguous ? 'DUPLICATE' : 'MISSING' };
  }

  var reg = getAssetRegistry_(project.projectId, docFile.getId(), assetType) || {};
  if (!options.force && safeString_(reg.resourceFooterFingerprint) === desiredFp) {
    return { success: true, skipped: true, assetType: assetType, code: 'RESOURCE_CURRENT', outputId: resolved.file.getId() };
  }

  if (assetType === 'SLIDES') {
    syncSlidesOutputResourceFooterV467_(project, docFile, resolved.file, model);
  } else if (assetType === 'HTML') {
    updateHtmlAsset_(project, docFile);
  } else if (assetType === 'PDF') {
    updatePdfAsset_(project, docFile);
  } else if (assetType === 'DOCX') {
    updateDocxAsset_(project, docFile);
  } else {
    return { success: true, skipped: true, assetType: assetType, code: 'UNSUPPORTED' };
  }

  // create/update helpers re-adopt the asset and persist the current fingerprint.
  if (assetType === 'SLIDES') {
    adoptManagedAsset_(project, docFile, assetType, resolved.file, { resolutionMethod: resolved.method || 'RESOURCE_FOOTER_SYNC' });
    upsertManagedAssetToRegistrySheet_(project, docFile, assetType);
  }

  return { success: true, assetType: assetType, code: 'RESOURCE_FOOTER_SYNCED', outputId: resolved.file.getId(), resourceFingerprint: desiredFp };
}

function collectOutputResourceFooterModelV467_(project, docFile) {
  if (typeof collectDocumentResourceFooterModelV466_ !== 'function') {
    throw new Error('DOCUMENT_RESOURCE_FOOTER_V466_REQUIRED');
  }
  return collectDocumentResourceFooterModelV466_(project, docFile);
}

function computeOutputResourceFingerprintV467_(model) {
  var normalized = {
    version: GES_OUTPUT_RESOURCE_FOOTER_V467.VERSION,
    projectId: safeString_(model && model.projectId),
    docId: safeString_(model && model.docId),
    projectLinks: normalizeOutputResourceLinksV467_(model && model.projectLinks),
    folders: normalizeOutputResourceLinksV467_(model && model.folders),
    docVariants: normalizeOutputResourceLinksV467_(model && model.docVariants),
    projectAssets: normalizeOutputResourceLinksV467_(model && model.projectAssets),
    calendarEvents: normalizeOutputResourceLinksV467_(model && model.calendarEvents),
    googleProducts: normalizeOutputResourceLinksV467_(model && model.googleProducts),
    contact: model && model.contact || {}
  };
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(normalized), Utilities.Charset.UTF_8);
  return bytes.map(function(b) { var v = b < 0 ? b + 256 : b; return ('0' + v.toString(16)).slice(-2); }).join('');
}

function normalizeOutputResourceLinksV467_(links) {
  return (links || []).map(function(x) {
    return { label: safeString_(x.label), url: normalizeUrl_(x.url || '') };
  }).sort(function(a,b) {
    var ak = a.label + '|' + a.url;
    var bk = b.label + '|' + b.url;
    return ak < bk ? -1 : (ak > bk ? 1 : 0);
  });
}

function getOutputResourceFingerprintV467_(project, docFile) {
  var key = safeString_(project.projectId) + '|' + safeString_(docFile.getId());
  if (GES_OUTPUT_RESOURCE_FP_CACHE_V467_[key]) return GES_OUTPUT_RESOURCE_FP_CACHE_V467_[key];
  var fp = computeOutputResourceFingerprintV467_(collectOutputResourceFooterModelV467_(project, docFile));
  GES_OUTPUT_RESOURCE_FP_CACHE_V467_[key] = fp;
  return fp;
}

/* ========================================================================== *
 * Slides propagation
 * ========================================================================== */

function syncSlidesOutputResourceFooterV467_(project, docFile, slideFile, model) {
  var presentation = SlidesApp.openById(slideFile.getId());
  removeSlidesOutputResourceFooterV467_(presentation);
  appendSlidesOutputResourceFooterV467_(project, presentation, model);
  presentation.saveAndClose();
}

function appendSlidesOutputResourceFooterV467_(project, presentation, model) {
  var groups = buildOutputResourceGroupsV467_(model);
  var pages = [];
  groups.forEach(function(group) {
    var links = group.links || [];
    for (var i = 0; i < links.length; i += GES_OUTPUT_RESOURCE_FOOTER_V467.LINKS_PER_SLIDE) {
      pages.push({ title: group.title, links: links.slice(i, i + GES_OUTPUT_RESOURCE_FOOTER_V467.LINKS_PER_SLIDE) });
    }
  });
  pages.forEach(function(page, index) {
    createOutputResourceSlideV467_(project, presentation, page.title + (pages.length > 1 ? ' ' + (index + 1) + '/' + pages.length : ''), page.links, index === 0);
  });
  appendOutputContactSlideV467_(project, presentation, model);
}

function createOutputResourceSlideV467_(project, presentation, title, links, addMarker) {
  var slide = presentation.appendSlide(SlidesApp.PredefinedLayout.BLANK);
  var m = slideMetricsV3_(presentation);
  addSlideAccentV3_(slide, m);

  if (addMarker) {
    var marker = slide.insertTextBox(GES_OUTPUT_RESOURCE_FOOTER_V467.SLIDE_MARKER, 1, 1, 4, 4);
    try { marker.getText().getTextStyle().setFontSize(1).setForegroundColor('#FFFFFF'); } catch (ignoreMarker) {}
  }

  var titleBox = slide.insertTextBox(title || GES_OUTPUT_RESOURCE_FOOTER_V467.RESOURCE_TITLE, m.w * 0.06, m.h * 0.06, m.w * 0.88, m.h * 0.12);
  titleBox.getText().getTextStyle().setFontFamily(V3_CONFIG.SLIDES.FONT_FAMILY).setFontSize(22).setBold(true).setForegroundColor(V3_CONFIG.SLIDES.TEXT_DARK);

  var text = '';
  var ranges = [];
  (links || []).forEach(function(link, idx) {
    var label = safeString_(link.label);
    var start = text.length;
    text += '• ' + label;
    var end = text.length;
    ranges.push({ start: start + 2, end: end, url: link.url });
    if (idx < links.length - 1) text += '\n\n';
  });
  if (text) {
    var box = slide.insertTextBox(text, m.w * 0.07, m.h * 0.20, m.w * 0.86, m.h * 0.68);
    var tr = box.getText();
    tr.getTextStyle().setFontFamily(V3_CONFIG.SLIDES.FONT_FAMILY).setFontSize(11).setForegroundColor(V3_CONFIG.SLIDES.TEXT_DARK);
    ranges.forEach(function(r) {
      try { tr.getRange(r.start, r.end).getTextStyle().setLinkUrl(r.url).setForegroundColor('#1155CC').setUnderline(true); } catch (ignoreLink) {}
    });
  }
  applyBrandingToSlide_(slide, presentation, project);
  return slide;
}

function appendOutputContactSlideV467_(project, presentation, model) {
  var contact = model && model.contact || {};
  if (!contact.websiteUrl && !contact.targetPageUrl && !contact.email && !contact.address && !(contact.phones || []).length) return;
  var links = [];
  if (contact.websiteUrl) links.push({ label: 'Website — ' + contact.websiteUrl, url: contact.websiteUrl });
  if (contact.targetPageUrl && normalizeUrl_(contact.targetPageUrl) !== normalizeUrl_(contact.websiteUrl)) links.push({ label: 'Target Page — ' + contact.targetPageUrl, url: contact.targetPageUrl });
  if (contact.email) links.push({ label: contact.email, url: 'mailto:' + contact.email });
  (contact.phones || []).forEach(function(phone) { links.push({ label: phone, url: 'tel:' + safeString_(phone).replace(/[^0-9+]/g,'') }); });
  if (contact.address) links.push({ label: contact.address, url: contact.websiteUrl || contact.targetPageUrl || '' });
  createOutputResourceSlideV467_(project, presentation, 'LIÊN HỆ', links.filter(function(x){ return x.url; }), false);
}

function removeSlidesOutputResourceFooterV467_(presentation) {
  var slides = presentation.getSlides();
  var start = -1;
  for (var i = 0; i < slides.length; i++) {
    var elements = slides[i].getPageElements();
    for (var j = 0; j < elements.length; j++) {
      try {
        if (elements[j].getPageElementType() !== SlidesApp.PageElementType.SHAPE) continue;
        var t = elements[j].asShape().getText().asString();
        if (safeString_(t).indexOf(GES_OUTPUT_RESOURCE_FOOTER_V467.SLIDE_MARKER) !== -1) { start = i; break; }
      } catch (ignore) {}
    }
    if (start >= 0) break;
  }
  if (start < 0) return 0;
  var removed = 0;
  for (var k = slides.length - 1; k >= start; k--) { try { slides[k].remove(); removed++; } catch (ignore2) {} }
  return removed;
}

/* ========================================================================== *
 * Google Docs temp-export footer (PDF / DOCX)
 * ========================================================================== */

function appendOutputResourceFooterToTempDocV467_(tempDoc, project, docFile) {
  if (typeof removeExistingDocumentResourceFooterV466_ === 'function') {
    removeExistingDocumentResourceFooterV466_(tempDoc.getBody());
  }
  var model = collectOutputResourceFooterModelV467_(project, docFile);
  // Reuse V4.6.6 rich DocumentApp hyperlink writer. The temp file is trashed
  // after export, so the V4.6.6 marker never enters canonical source content.
  appendDocumentResourceFooterV466_(tempDoc.getBody(), model);
  return model;
}

/* ========================================================================== *
 * HTML propagation
 * ========================================================================== */

function injectOutputResourceFooterHtmlV467_(fullHtml, project, docFile) {
  var model = collectOutputResourceFooterModelV467_(project, docFile);
  var section = renderOutputResourceFooterHtmlV467_(model);
  var html = safeString_(fullHtml);
  html = removeOutputResourceFooterHtmlV467_(html);
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, section + '\n</body>');
  return html + section;
}

function removeOutputResourceFooterHtmlV467_(html) {
  var start = html.indexOf(GES_OUTPUT_RESOURCE_FOOTER_V467.HTML_START);
  var end = html.indexOf(GES_OUTPUT_RESOURCE_FOOTER_V467.HTML_END);
  if (start < 0 || end < start) return html;
  return html.substring(0, start) + html.substring(end + GES_OUTPUT_RESOURCE_FOOTER_V467.HTML_END.length);
}

function renderOutputResourceFooterHtmlV467_(model) {
  var parts = [GES_OUTPUT_RESOURCE_FOOTER_V467.HTML_START, '<section class="ges-resource-footer" aria-label="Nguồn tham khảo thêm">', '<h2>NGUỒN THAM KHẢO THÊM</h2>'];
  buildOutputResourceGroupsV467_(model).forEach(function(group) {
    if (!group.links.length) return;
    parts.push('<h3>' + escapeHtmlV467_(group.title) + '</h3><ul>');
    group.links.forEach(function(link) {
      parts.push('<li><a href="' + escapeHtmlAttrV467_(link.url) + '">' + escapeHtmlV467_(link.label) + '</a></li>');
    });
    parts.push('</ul>');
  });
  var c = model.contact || {};
  if (c.address || c.email || (c.phones || []).length || c.websiteUrl || c.targetPageUrl) {
    parts.push('<h2>LIÊN HỆ</h2>');
    if (c.address) parts.push('<p>' + escapeHtmlV467_(c.address) + '</p>');
    (c.phones || []).forEach(function(p) { parts.push('<p><a href="tel:' + escapeHtmlAttrV467_(safeString_(p).replace(/[^0-9+]/g,'')) + '">' + escapeHtmlV467_(p) + '</a></p>'); });
    if (c.email) parts.push('<p><a href="mailto:' + escapeHtmlAttrV467_(c.email) + '">' + escapeHtmlV467_(c.email) + '</a></p>');
    parts.push('<h2>Website</h2>');
    if (c.websiteUrl) parts.push('<p><a href="' + escapeHtmlAttrV467_(c.websiteUrl) + '">' + escapeHtmlV467_(c.websiteUrl) + '</a></p>');
    if (c.targetPageUrl && normalizeUrl_(c.targetPageUrl) !== normalizeUrl_(c.websiteUrl)) parts.push('<p><a href="' + escapeHtmlAttrV467_(c.targetPageUrl) + '">Target Page — ' + escapeHtmlV467_(c.targetPageUrl) + '</a></p>');
  }
  parts.push('</section>', GES_OUTPUT_RESOURCE_FOOTER_V467.HTML_END);
  return parts.join('\n');
}

function buildOutputResourceGroupsV467_(model) {
  return [
    { title: 'Project & Website', links: model.projectLinks || [] },
    { title: 'Project Folders', links: model.folders || [] },
    { title: 'Article Assets & Variants', links: model.docVariants || [] },
    { title: 'Project Assets', links: model.projectAssets || [] },
    { title: 'Calendar Events', links: model.calendarEvents || [] },
    { title: 'Google Products', links: model.googleProducts || [] }
  ];
}

function escapeHtmlV467_(s) {
  return safeString_(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function escapeHtmlAttrV467_(s) { return escapeHtmlV467_(s); }

function getOutputResourceFingerprintSafeV467_(project, docFile) {
  try { return getOutputResourceFingerprintV467_(project, docFile); }
  catch (e) { return ''; }
}
