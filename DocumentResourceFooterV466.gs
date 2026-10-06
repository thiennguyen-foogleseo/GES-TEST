/**
 * GES V4.6.6 - Google Docs Resource Footer / Entity Stack Link Injection.
 *
 * Adds a generated resource block to the END of each Source Google Doc only
 * after the project URL graph exists. The block is excluded from the canonical
 * content model by DocumentReader.gs so it does not recursively feed Slides /
 * PDF / DOCX / HTML generation.
 */

const GES_DOCUMENT_RESOURCE_FOOTER_V466 = Object.freeze({
  VERSION: '4.6.7.1',
  MARKER: '[[GES_RESOURCE_FOOTER_V466]]',
  TITLE: 'NGUỒN THAM KHẢO THÊM',
  INTRO: 'Danh sách các nguồn và liên kết chúng tôi đề xuất bạn tham khảo:',
  CONTACT_TITLE: 'LIÊN HỆ',
  WEBSITE_TITLE: 'Website',
  COLORS: Object.freeze({ LINK: '#1155CC', TEXT: '#202124', MUTED: '#5F6368' })
});

function getDocumentResourceFooterSchemaV466() {
  return {
    version: GES_DOCUMENT_RESOURCE_FOOTER_V466.VERSION,
    marker: GES_DOCUMENT_RESOURCE_FOOTER_V466.MARKER,
    canonicalContentExcluded: true,
    derivedOutputsIncluded: false,
    flatDocumentResourceList: true,
    sectionHeadingsRendered: false,
    contactTitle: GES_DOCUMENT_RESOURCE_FOOTER_V466.CONTACT_TITLE,
    websiteTitle: GES_DOCUMENT_RESOURCE_FOOTER_V466.WEBSITE_TITLE
  };
}

/** Read-only preview for all Source Docs in the active project. */
function previewActiveDocumentResourceFootersV466() {
  var project = getActiveProject_();
  if (!project) throw new Error('Chưa có active project.');
  var docs = getSourceDocs_(project);
  var rows = docs.map(function(docFile) {
    var model = collectDocumentResourceFooterModelV466_(project, docFile);
    return summarizeDocumentResourceFooterModelV466_(model);
  });
  var out = {
    success: true,
    version: GES_DOCUMENT_RESOURCE_FOOTER_V466.VERSION,
    projectId: project.projectId,
    projectName: project.projectName,
    documentCount: rows.length,
    documents: rows
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/** Public write: sync every Source Doc for the active project. */
function syncActiveProjectDocumentResourceFootersV466() {
  if (typeof queueDocsResourceSyncV468 !== 'function') {
    throw new Error('SELECTIVE_SYNC_QUEUE_V468_NOT_INSTALLED');
  }
  return queueDocsResourceSyncV468();
}

/** Public write for an explicit project. */
function syncProjectDocumentResourceFootersV466(projectId) {
  var project = projectId ? getProject_(projectId) : getActiveProject_();
  if (!project) throw new Error('DOCUMENT_RESOURCE_FOOTER_PROJECT_NOT_FOUND');
  if (typeof startBuildQueueV4 !== 'function') {
    throw new Error('SELECTIVE_SYNC_QUEUE_V468_NOT_INSTALLED');
  }
  return startBuildQueueV4(project.projectId, {
    runNow: true,
    source: 'PUBLIC_API_DOC_RESOURCE_SYNC',
    mode: 'DOC_RESOURCE'
  });
}

/**
 * Internal project-level writer. Build Queue uses pre/post refresh = false and
 * performs one final Public Sheet refresh as a separate job.
 */
function syncProjectDocumentResourceFootersV466_(projectId, options) {
  options = options || {};
  var project = projectId ? getProject_(projectId) : getActiveProject_();
  if (!project) throw new Error('DOCUMENT_RESOURCE_FOOTER_PROJECT_NOT_FOUND');
  assertProjectWritable_(project);

  var preRefresh = null;
  if (options.preRefreshPublicSheet && typeof refreshProjectPublicSheetV43 === 'function') {
    try { preRefresh = refreshProjectPublicSheetV43(project.projectId); }
    catch (e0) { preRefresh = { success: false, error: safeString_(e0 && e0.message || e0) }; }
  }

  var docs = getSourceDocs_(project);
  var results = [];
  docs.forEach(function(docFile) {
    results.push(syncOneDocumentResourceFooterV466_(project, docFile, options));
  });

  var postRefresh = null;
  if (options.postRefreshPublicSheet && typeof refreshProjectPublicSheetV43 === 'function') {
    try { postRefresh = refreshProjectPublicSheetV43(project.projectId); }
    catch (e1) { postRefresh = { success: false, error: safeString_(e1 && e1.message || e1) }; }
  }

  var failures = results.filter(function(r) { return !r.success; });
  var out = {
    success: failures.length === 0,
    version: GES_DOCUMENT_RESOURCE_FOOTER_V466.VERSION,
    projectId: project.projectId,
    projectName: project.projectName,
    source: safeString_(options.source || ''),
    documentCount: docs.length,
    updatedCount: results.filter(function(r) { return r.updated; }).length,
    failedCount: failures.length,
    results: results,
    preRefreshPublicSheet: preRefresh,
    postRefreshPublicSheet: postRefresh
  };
  try {
    logEvent_(project.projectId, 'DOC_RESOURCE_FOOTER_SYNC_V466', {
      source: out.source,
      documentCount: out.documentCount,
      updatedCount: out.updatedCount,
      failedCount: out.failedCount,
      version: out.version
    });
  } catch (ignore) {}
  return out;
}

function syncOneDocumentResourceFooterV466_(project, docFile, options) {
  try {
    var model = collectDocumentResourceFooterModelV466_(project, docFile);
    var doc = DocumentApp.openById(docFile.getId());
    var body = doc.getBody();

    removeExistingDocumentResourceFooterV466_(body);
    appendDocumentResourceFooterV466_(body, model);
    doc.saveAndClose();

    // This generated block is intentionally ignored by DocumentReader. Acknowledge
    // only the managed footer mutation so source assets do not become OUTDATED.
    var acknowledged = acknowledgeDocumentResourceFooterMutationV466_(project, docFile.getId());

    return Object.assign({
      success: true,
      updated: true,
      docId: docFile.getId(),
      docName: docFile.getName(),
      version: GES_DOCUMENT_RESOURCE_FOOTER_V466.VERSION
    }, summarizeDocumentResourceFooterModelV466_(model), {
      mutationAcknowledgement: acknowledged
    });
  } catch (e) {
    return {
      success: false,
      updated: false,
      docId: docFile && docFile.getId ? docFile.getId() : '',
      docName: docFile && docFile.getName ? docFile.getName() : '',
      error: safeString_(e && e.message || e)
    };
  }
}

function collectDocumentResourceFooterModelV466_(project, docFile) {
  var registry = typeof readPrivateRegistryProjectionV43_ === 'function'
    ? readPrivateRegistryProjectionV43_(project)
    : { assets: [], urls: [] };
  var model = {
    version: GES_DOCUMENT_RESOURCE_FOOTER_V466.VERSION,
    projectId: project.projectId,
    projectName: project.projectName,
    projectKeyword: typeof getProjectKeywordV41_ === 'function' ? getProjectKeywordV41_(project) : project.projectName,
    docId: docFile.getId(),
    docName: docFile.getName(),
    projectLinks: [],
    folders: [],
    docVariants: [],
    projectAssets: [],
    calendarEvents: [],
    googleProducts: [],
    contact: getDocumentResourceFooterContactV466_(project)
  };

  // Target Page is listed once in the flat resource list. Website is rendered
  // once in the dedicated Website block at the bottom to avoid duplication.
  addResourceFooterLinkV466_(model.projectLinks, model.projectKeyword, project.targetPageUrl || '', 'target');

  try {
    getProjectFolderSummary_(project).forEach(function(folder) {
      if (!folder || !folder.exists || folder.legacy || !folder.url) return;
      addResourceFooterLinkV466_(model.folders, folder.name, folder.url, 'folder:' + folder.key);
    });
  } catch (ignoreFolders) {}

  // Every public-safe URL Variant tied to THIS Source Doc.
  (registry.urls || []).forEach(function(v) {
    if (safeString_(v.sourceDocId) !== safeString_(docFile.getId())) return;
    if (!isDocumentFooterVariantAvailableV466_(v)) return;
    var label = formatDocumentVariantLabelV466_(v);
    addResourceFooterLinkV466_(model.docVariants, label, v.url, 'variant:' + safeString_(v.assetType) + ':' + safeString_(v.variantType));
  });

  // Project-scoped singleton variants: Public Sheet, Form and Drawing.
  var singletonIds = typeof getPublicProjectionSingletonIdsV44_ === 'function'
    ? getPublicProjectionSingletonIdsV44_(project)
    : { publicSheetId: '', projectFormId: '', projectDrawingId: '' };
  var singletonIdMap = {};
  [singletonIds.publicSheetId, singletonIds.projectFormId, singletonIds.projectDrawingId].filter(Boolean).forEach(function(id) { singletonIdMap[id] = true; });
  (registry.urls || []).forEach(function(v) {
    if (!v.assetId || !singletonIdMap[safeString_(v.assetId)]) return;
    if (!isDocumentFooterVariantAvailableV466_(v)) return;
    addResourceFooterLinkV466_(model.projectAssets, formatProjectAssetVariantLabelV466_(v), v.url, 'project-asset:' + safeString_(v.assetType) + ':' + safeString_(v.variantType));
  });

  // Ensure the managed Public Project Sheet itself is represented even before
  // URL Variant generation catches up.
  try {
    var sheetState = getProjectSingletonAssetStateV41_(project, 'PROJECT_URL_SHEET');
    if (sheetState && sheetState.id && sheetState.url) {
      addResourceFooterLinkV466_(model.projectAssets, sheetState.name || model.projectName, sheetState.url, 'project-sheet');
      if (typeof getProjectPublicSheetPublishedInfoV43_ === 'function') {
        var published = getProjectPublicSheetPublishedInfoV43_(project, sheetState.id) || {};
        addResourceFooterLinkV466_(model.projectAssets, sheetState.name || model.projectName, published.publishedUrl || '', 'project-sheet-published');
      }
    }
  } catch (ignoreSheet) {}

  // All canonical Calendar event links for the project.
  try {
    var events = typeof getCalendarRegistryRowsV4 === 'function' ? getCalendarRegistryRowsV4(project.projectId) : [];
    events.forEach(function(event) {
      if (!event || !event.eventHtmlLink) return;
      var status = safeString_(event.status).toUpperCase();
      if (status === 'ORPHANED' || status === 'ERROR') return;
      var role = safeString_(event.eventRole || event.eventKey || 'Event');
      var summary = safeString_(event.eventSummary || role);
      addResourceFooterLinkV466_(model.calendarEvents, summary, event.eventHtmlLink, 'calendar:' + safeString_(event.eventKey));
    });
  } catch (ignoreCalendar) {}

  // Every configured Extended Google Asset (NotebookLM, My Maps, Earth,
  // Apps Script Web App, Colab, Sites, AI Studio, Vids, Pics, Drawing...).
  try {
    var ext = typeof readExtendedGoogleAssetsRegistryV465_ === 'function'
      ? readExtendedGoogleAssetsRegistryV465_(project)
      : (typeof getExtendedGoogleAssetDescriptorsV465_ === 'function' ? getExtendedGoogleAssetDescriptorsV465_(project) : []);
    ext.forEach(function(asset) {
      if (!asset || !asset.url || safeString_(asset.urlStatus).toUpperCase() === 'INVALID') return;
      var type = safeString_(asset.assetType || asset.publicType || 'GOOGLE_ASSET');
      var name = safeString_(asset.assetName || model.projectName);
      addResourceFooterLinkV466_(model.googleProducts, name, asset.url, 'google:' + type);
    });
  } catch (ignoreExtended) {}

  model.projectLinks = dedupeDocumentResourceLinksV466_(model.projectLinks);
  model.folders = dedupeDocumentResourceLinksV466_(model.folders);
  model.docVariants = dedupeDocumentResourceLinksV466_(model.docVariants);
  model.projectAssets = dedupeDocumentResourceLinksV466_(model.projectAssets);
  model.calendarEvents = dedupeDocumentResourceLinksV466_(model.calendarEvents);
  model.googleProducts = dedupeDocumentResourceLinksV466_(model.googleProducts);
  return model;
}

function getDocumentResourceFooterContactV466_(project) {
  var branding = project && project.branding || {};
  var phones = Array.isArray(branding.phones) ? branding.phones.slice() : [];
  if (!phones.length) {
    [project && project.phone, project && project.phone2].forEach(function(v) { if (safeString_(v)) phones.push(safeString_(v)); });
  }
  return {
    brandName: safeString_(branding.brandName || project.brandName || project.projectName),
    phones: phones.filter(Boolean),
    email: safeString_(branding.email || project.email || ''),
    address: safeString_(branding.address || project.address || ''),
    websiteUrl: safeString_(branding.websiteUrl || project.websiteUrl || ''),
    targetPageUrl: safeString_(project.targetPageUrl || '')
  };
}

function isDocumentFooterVariantAvailableV466_(v) {
  if (!v || !v.url) return false;
  var status = safeString_(v.urlStatus).toUpperCase();
  return !status || status === 'AVAILABLE';
}

function formatDocumentVariantLabelV466_(v) {
  var name = safeString_(v.anchorName || v.assetName || '').trim();
  return name || safeString_(v.variantType || v.assetType || 'Asset').trim();
}

function formatProjectAssetVariantLabelV466_(v) {
  var name = safeString_(v.anchorName || v.assetName || '').trim();
  return name || safeString_(v.variantType || v.assetType || 'Asset').trim();
}

function addResourceFooterLinkV466_(list, label, url, key) {
  url = safeString_(url).trim();
  label = safeString_(label).trim();
  if (!url || !label) return;
  list.push({ key: safeString_(key), label: label, url: url });
}

function dedupeDocumentResourceLinksV466_(links) {
  var seen = {};
  return (links || []).filter(function(link) {
    var key = normalizeUrl_(link.url || '');
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function flattenDocumentResourceLinksV4671_(model) {
  var ordered = [];
  [
    model && model.projectLinks,
    model && model.folders,
    model && model.docVariants,
    model && model.projectAssets,
    model && model.calendarEvents,
    model && model.googleProducts
  ].forEach(function(group) {
    (group || []).forEach(function(link) { ordered.push(link); });
  });
  return dedupeDocumentResourceLinksV466_(ordered);
}

function summarizeDocumentResourceFooterModelV466_(model) {
  return {
    docId: model.docId,
    docName: model.docName,
    projectLinks: model.projectLinks.length,
    folders: model.folders.length,
    docVariants: model.docVariants.length,
    projectAssets: model.projectAssets.length,
    calendarEvents: model.calendarEvents.length,
    googleProducts: model.googleProducts.length,
    totalResourceLinks: flattenDocumentResourceLinksV4671_(model).length
  };
}

function appendDocumentResourceFooterV466_(body, model) {
  // Hidden technical marker. DocumentReader stops here, so generated resources
  // never enter the canonical content model or derived output renderers.
  var marker = body.appendParagraph(GES_DOCUMENT_RESOURCE_FOOTER_V466.MARKER);
  try {
    marker.setSpacingBefore(0).setSpacingAfter(0);
    marker.editAsText().setFontSize(1).setForegroundColor('#FFFFFF');
  } catch (ignoreMarkerStyle) {}

  try { body.appendHorizontalRule(); } catch (ignoreRule) {}
  appendDocumentFooterHeadingV466_(body, GES_DOCUMENT_RESOURCE_FOOTER_V466.TITLE, DocumentApp.ParagraphHeading.HEADING1);
  var intro = body.appendParagraph(GES_DOCUMENT_RESOURCE_FOOTER_V466.INTRO);
  try { intro.setSpacingAfter(8); intro.editAsText().setFontSize(10).setForegroundColor(GES_DOCUMENT_RESOURCE_FOOTER_V466.COLORS.TEXT); } catch (ignoreIntro) {}

  // V4.6.7.1: render one flat hyperlink list only. Internal grouping remains in
  // the model for deterministic ordering/fingerprints, but group titles are not
  // written into the Source Google Doc.
  flattenDocumentResourceLinksV4671_(model).forEach(function(link) {
    appendDocumentFooterLinkedTextV466_(body, link.label, link.url);
  });

  var contact = model.contact || {};
  if (contact.address || contact.email || (contact.phones || []).length) {
    appendDocumentFooterHeadingV466_(body, GES_DOCUMENT_RESOURCE_FOOTER_V466.CONTACT_TITLE, DocumentApp.ParagraphHeading.HEADING1);
    if (contact.address) appendDocumentFooterPlainTextV466_(body, contact.address);
    (contact.phones || []).forEach(function(phone) { appendDocumentFooterPlainTextV466_(body, phone); });
    if (contact.email) appendDocumentFooterLinkedTextV466_(body, contact.email, 'mailto:' + contact.email);
  }

  // Website is intentionally rendered exactly once, separate from the resource
  // list. Target Page is intentionally NOT repeated here.
  if (contact.websiteUrl) {
    appendDocumentFooterHeadingV466_(body, GES_DOCUMENT_RESOURCE_FOOTER_V466.WEBSITE_TITLE, DocumentApp.ParagraphHeading.HEADING1);
    appendDocumentFooterLinkedTextV466_(body, contact.brandName || model.projectName || contact.websiteUrl, contact.websiteUrl);
  }
}

function appendDocumentFooterHeadingV466_(body, text, heading) {
  var p = body.appendParagraph(text);
  try { p.setHeading(heading || DocumentApp.ParagraphHeading.HEADING2).setSpacingBefore(12).setSpacingAfter(6); } catch (ignore) {}
  return p;
}

function appendDocumentFooterCategoryV466_(body, title, links) {
  if (!links || !links.length) return;
  appendDocumentFooterHeadingV466_(body, title, DocumentApp.ParagraphHeading.HEADING3);
  links.forEach(function(link) {
    appendDocumentFooterLinkedTextV466_(body, link.label, link.url);
  });
}

function appendDocumentFooterLinkedTextV466_(body, label, url) {
  var p = body.appendParagraph('');
  var t = p.appendText(safeString_(label));
  try {
    t.setLinkUrl(safeString_(url));
    t.setForegroundColor(GES_DOCUMENT_RESOURCE_FOOTER_V466.COLORS.LINK);
    t.setUnderline(true);
    t.setFontSize(10);
    p.setSpacingAfter(2);
  } catch (ignore) {}
  return p;
}

function appendDocumentFooterPlainTextV466_(body, value) {
  var p = body.appendParagraph(safeString_(value));
  try { p.setSpacingAfter(2); p.editAsText().setFontSize(10).setForegroundColor(GES_DOCUMENT_RESOURCE_FOOTER_V466.COLORS.TEXT); } catch (ignore) {}
  return p;
}

function removeExistingDocumentResourceFooterV466_(body) {
  var markerIndex = -1;
  for (var i = 0; i < body.getNumChildren(); i++) {
    var child = body.getChild(i);
    var type = child.getType();
    if (type !== DocumentApp.ElementType.PARAGRAPH && type !== DocumentApp.ElementType.LIST_ITEM) continue;
    var text = '';
    try { text = child.getText(); } catch (ignore) {}
    if (isGesGeneratedResourceFooterMarkerTextV466_(text)) {
      markerIndex = i;
      break;
    }
  }
  if (markerIndex < 0) return { removed: false, removedElements: 0 };
  var removed = 0;
  for (var j = body.getNumChildren() - 1; j >= markerIndex; j--) {
    try { body.getChild(j).removeFromParent(); removed++; } catch (ignore2) {}
  }
  return { removed: true, removedElements: removed };
}

function isGesGeneratedResourceFooterMarkerTextV466_(text) {
  return safeString_(text).indexOf(GES_DOCUMENT_RESOURCE_FOOTER_V466.MARKER) !== -1;
}

/**
 * Footer-only writes change Drive modified time. Managed outputs should remain
 * CURRENT because canonical user content did not change. This function advances
 * their stored source sync time to the footer write time and refreshes Registry
 * inventory rows. A subsequent project-sheet refresh stores the new sheet
 * fingerprint using the post-footer source timestamps.
 */
function acknowledgeDocumentResourceFooterMutationV466_(project, docId) {
  var docFile = DriveApp.getFileById(docId);
  var sourceMs = docFile.getLastUpdated().getTime();
  var sourceIso = new Date(sourceMs).toISOString();
  var updated = [];

  (GES_CONFIG.MANAGED_ASSET_TYPES || []).forEach(function(assetType) {
    try {
      var reg = getAssetRegistry_(project.projectId, docId, assetType);
      if (!reg || !reg.fileId) return;
      reg.sourceModifiedAtSyncMs = sourceMs;
      reg.sourceModifiedAtSync = sourceIso;
      reg.resourceFooterVersion = GES_DOCUMENT_RESOURCE_FOOTER_V466.VERSION;
      reg.resourceFooterAcknowledgedAt = nowIso_();
      getScriptProps_().setProperty(assetRegistryKey_(project.projectId, docId, assetType), JSON.stringify(reg));

      try {
        var assetFile = DriveApp.getFileById(reg.fileId);
        var meta = readV3Meta_(assetFile.getDescription() || '');
        meta.SOURCE_MODIFIED_AT_SYNC_MS = sourceMs;
        meta.SOURCE_MODIFIED_AT_SYNC = sourceIso;
        meta.RESOURCE_FOOTER_VERSION = GES_DOCUMENT_RESOURCE_FOOTER_V466.VERSION;
        assetFile.setDescription(mergeV3MetaIntoDescription_(assetFile.getDescription() || '', meta));
      } catch (ignoreAssetMeta) {}

      try { upsertManagedAssetToRegistrySheet_(project, docFile, assetType); } catch (ignoreRegistrySheet) {}
      updated.push(assetType);
    } catch (ignoreType) {}
  });

  return { sourceModifiedAtSyncMs: sourceMs, sourceModifiedAtSync: sourceIso, managedAssetTypesAcknowledged: updated };
}
