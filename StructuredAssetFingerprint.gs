/**
 * GES V4 - Structured Asset Fingerprints for Google Sheets / Google Forms.
 *
 * Keeps structured assets sensitive to canonical content + entity changes while
 * remaining independent from branding fingerprints used by visual outputs.
 */

const GES_STRUCTURED_ASSET_V4 = Object.freeze({
  VERSION: '1.1.0-public-sheet-v1',
  SHEET_SCHEMA_VERSION: '1.0.0',
  FORM_SCHEMA_VERSION: '1.0.0'
});

var GES_STRUCTURED_FINGERPRINT_CACHE_V4_ = {};
var GES_STRUCTURED_MODEL_CACHE_V4_ = {};
var GES_STRUCTURED_ENTITY_CACHE_V4_ = {};

/** Private integration hook used by Registry.gs. */
function getManagedAssetFingerprintV4_(project, docFile, assetType) {
  var type = safeString_(assetType).toUpperCase();
  if (type !== 'SHEET' && type !== 'FORM') return '';
  var cacheKey = [project.projectId, docFile.getId(), type, docFile.getLastUpdated().getTime()].join('|');
  if (GES_STRUCTURED_FINGERPRINT_CACHE_V4_[cacheKey]) {
    return GES_STRUCTURED_FINGERPRINT_CACHE_V4_[cacheKey];
  }

  var modelKey = project.projectId + '|' + docFile.getId() + '|' + docFile.getLastUpdated().getTime();
  var model = GES_STRUCTURED_MODEL_CACHE_V4_[modelKey];
  if (!model) {
    model = buildCanonicalContentModelV4(docFile.getId(), project.projectId);
    GES_STRUCTURED_MODEL_CACHE_V4_[modelKey] = model;
  }
  var entity = GES_STRUCTURED_ENTITY_CACHE_V4_[project.projectId];
  if (!entity) {
    entity = buildEntityProfileV4(project.projectId);
    GES_STRUCTURED_ENTITY_CACHE_V4_[project.projectId] = entity;
  }
  var payload;

  if (type === 'SHEET') {
    payload = {
      module: GES_STRUCTURED_ASSET_V4.VERSION,
      schema: GES_STRUCTURED_ASSET_V4.SHEET_SCHEMA_VERSION,
      projectId: project.projectId,
      sourceDocId: docFile.getId(),
      content: model.fingerprints,
      entity: entity.fingerprint,
      targetPageUrl: normalizeUrl_(project.targetPageUrl || ''),
      supportingAssets: getStructuredSupportingAssetsFingerprintV4_(project, docFile.getId())
    };
  } else {
    payload = {
      module: GES_STRUCTURED_ASSET_V4.VERSION,
      schema: GES_STRUCTURED_ASSET_V4.FORM_SCHEMA_VERSION,
      projectId: project.projectId,
      sourceDocId: docFile.getId(),
      content: {
        content: model.fingerprints.content,
        structure: model.fingerprints.structure,
        links: model.fingerprints.links
      },
      entity: entity.fingerprint,
      targetPageUrl: normalizeUrl_(project.targetPageUrl || ''),
      formPlan: buildFormFingerprintPlanV4_(model)
    };
  }

  var fp = sha256Hex_(structuredStableJsonV4_(payload));
  GES_STRUCTURED_FINGERPRINT_CACHE_V4_[cacheKey] = fp;
  return fp;
}

function getStructuredSupportingAssetsFingerprintV4_(project, sourceDocId) {
  if (!project.registrySheetId) return '';
  try {
    var ss = SpreadsheetApp.openById(project.registrySheetId);
    var sh = ss.getSheetByName(V3_CONFIG.REGISTRY_TABS.ASSETS);
    if (!sh || sh.getLastRow() < 2) return '';
    var values = sh.getDataRange().getDisplayValues();
    var headers = values[0];
    var idx = {};
    headers.forEach(function(h, i) { idx[safeString_(h)] = i; });
    var rows = [];
    for (var r = 1; r < values.length; r++) {
      if (safeString_(values[r][idx['Project ID']]) !== safeString_(project.projectId)) continue;
      var sourceId = safeString_(values[r][idx['Source Doc ID']]);
      if (sourceId && sourceId !== safeString_(sourceDocId)) continue;
      var type = safeString_(values[r][idx['Asset Type']]).toUpperCase();
      if (!type || type === 'SHEET') continue; // avoid self-reference
      if (safeString_(values[r][idx['System Asset']]).toUpperCase() === 'TRUE') continue;
      rows.push({
        type: type,
        id: safeString_(values[r][idx['Asset ID']]),
        name: safeString_(values[r][idx['Asset Name']]),
        url: safeString_(values[r][idx['Drive/Public URL']]),
        status: safeString_(values[r][idx['Sync Status']]).toUpperCase(),
        lifecycle: safeString_(values[r][idx['Lifecycle Status']]).toUpperCase()
      });
    }
    rows.sort(function(a, b) {
      return (a.type + '|' + a.id).localeCompare(b.type + '|' + b.id);
    });
    return sha256Hex_(structuredStableJsonV4_(rows));
  } catch (e) {
    return '';
  }
}

function buildFormFingerprintPlanV4_(model) {
  var sections = (model.sections || []).filter(function(section) {
    return Number(section.headingLevel || 0) === 2;
  }).map(function(section) {
    return { id: section.id, title: section.title };
  });
  var faqs = (model.derived && model.derived.faqCandidates || []).map(function(faq) {
    return {
      question: safeString_(faq.question),
      answerBlockIds: (faq.answerBlockIds || []).slice(),
      rule: safeString_(faq.derivationRule),
      confidence: Number(faq.confidence || 0)
    };
  });
  return { sections: sections, faqs: faqs };
}

function structuredStableJsonV4_(value) {
  return JSON.stringify(structuredStableNormalizeV4_(value));
}

function structuredStableNormalizeV4_(value) {
  if (Array.isArray(value)) return value.map(structuredStableNormalizeV4_);
  if (value && typeof value === 'object') {
    var out = {};
    Object.keys(value).sort().forEach(function(key) {
      out[key] = structuredStableNormalizeV4_(value[key]);
    });
    return out;
  }
  return value;
}

/* ========================================================================== *
 * GES V4.1 project-scoped singleton fingerprints
 * ========================================================================== */

function getProjectManagedAssetFingerprintV41_(project, assetType) {
  var type = safeString_(assetType).toUpperCase();
  var entity = buildEntityProfileV4(project.projectId);
  var payload = {
    module: 'PROJECT_STRUCTURE_V41',
    structureVersion: (project.projectStructure && project.projectStructure.version) || '4.1.0',
    projectId: project.projectId,
    projectKeyword: typeof getProjectKeywordV41_ === 'function' ? getProjectKeywordV41_(project) : project.projectName,
    projectType: project.projectType || '',
    targetPageUrl: normalizeUrl_(project.targetPageUrl || ''),
    websiteUrl: normalizeUrl_(project.websiteUrl || ''),
    entityFingerprint: entity && entity.fingerprint || '',
    assetType: type
  };

  if (type === 'PROJECT_URL_SHEET') {
    payload.schema = 'PROJECT_PUBLIC_SHEET_V2_UNIFIED';
    payload.inventory = getProjectInventoryFingerprintV41_(project);
    payload.urlVariants = getProjectUrlVariantsFingerprintV43_(project);
    payload.contentProjection = getProjectContentProjectionFingerprintV43_(project);
    payload.published = getProjectPublicSheetPublishedFingerprintV43_(project);
    payload.extendedGoogleAssets = typeof getExtendedGoogleAssetsFingerprintV465_ === 'function'
      ? getExtendedGoogleAssetsFingerprintV465_(project)
      : '';
  } else if (type === 'PROJECT_FORM') {
    payload.schema = 'PROJECT_FORM_V1';
    var source = resolveProjectPrimarySourceDocV41_(project);
    payload.sourceStatus = source.status || '';
    payload.sourceMethod = source.method || '';
    payload.sourceDocId = source.file ? source.file.getId() : '';
    if (source.file) {
      var model = buildCanonicalContentModelV4(source.file.getId(), project.projectId);
      payload.content = {
        content: model.fingerprints && model.fingerprints.content || '',
        structure: model.fingerprints && model.fingerprints.structure || '',
        links: model.fingerprints && model.fingerprints.links || ''
      };
      payload.formPlan = buildFormFingerprintPlanV4_(model);
    }
  } else if (type === 'PROJECT_DRAWING') {
    payload.schema = 'PROJECT_DRAWING_V1_RESERVED';
  } else if (type === 'PROJECT_MY_MAPS') {
    payload.schema = 'PROJECT_MY_MAPS_V1_RESERVED';
  } else if (type === 'PROJECT_EARTH') {
    payload.schema = 'PROJECT_EARTH_V1_RESERVED';
  }
  return sha256Hex_(structuredStableJsonV4_(payload));
}

function getProjectInventoryFingerprintV41_(project) {
  if (!project.registrySheetId) return '';
  try {
    var ss = SpreadsheetApp.openById(project.registrySheetId);
    var sh = ss.getSheetByName(V3_CONFIG.REGISTRY_TABS.ASSETS);
    if (!sh || sh.getLastRow() < 2) return '';
    var values = sh.getDataRange().getDisplayValues();
    var headers = values[0];
    var idx = {};
    headers.forEach(function(h, i) { idx[safeString_(h)] = i; });
    var rows = [];
    for (var r = 1; r < values.length; r++) {
      if (safeString_(values[r][idx['Project ID']]) !== safeString_(project.projectId)) continue;
      var type = safeString_(values[r][idx['Asset Type']]).toUpperCase();
      if (type === 'PROJECT_URL_SHEET') continue; // avoid self-reference
      rows.push({
        type: type,
        id: safeString_(values[r][idx['Asset ID']]),
        name: safeString_(values[r][idx['Asset Name']]),
        url: safeString_(values[r][idx['Drive/Public URL']]),
        lifecycle: safeString_(values[r][idx['Lifecycle Status']]).toUpperCase(),
        folder: safeString_(values[r][idx['Folder ID']])
      });
    }
    rows.sort(function(a, b) { return (a.type + '|' + a.id).localeCompare(b.type + '|' + b.id); });
    return sha256Hex_(structuredStableJsonV4_(rows));
  } catch (e) {
    return '';
  }
}

function getProjectCalendarRegistryFingerprintV41_(project) {
  if (!project.registrySheetId) return '';
  try {
    var ss = SpreadsheetApp.openById(project.registrySheetId);
    var sh = ss.getSheetByName('Calendar Events');
    if (!sh || sh.getLastRow() < 2) return '';
    var values = sh.getDataRange().getDisplayValues();
    var normalized = values.slice(1).map(function(row) {
      return row.slice(0, Math.min(row.length, 18));
    });
    return sha256Hex_(structuredStableJsonV4_(normalized));
  } catch (e) {
    return '';
  }
}


/** V4.3: private URL Variants drive the public URL Variants projection. */
function getProjectUrlVariantsFingerprintV43_(project) {
  if (!project.registrySheetId) return '';
  try {
    var ss = SpreadsheetApp.openById(project.registrySheetId);
    var sh = ss.getSheetByName(V3_CONFIG.REGISTRY_TABS.URLS);
    if (!sh || sh.getLastRow() < 2) return '';
    var values = sh.getDataRange().getDisplayValues();
    var idx = {};
    values[0].forEach(function(h, i) { idx[safeString_(h)] = i; });
    var rows = [];
    for (var r = 1; r < values.length; r++) {
      if (safeString_(values[r][idx['Project ID']]) !== safeString_(project.projectId)) continue;
      var url = safeString_(values[r][idx['URL']]);
      if (!url) continue;
      rows.push({
        assetType: safeString_(values[r][idx['Asset Type']]),
        assetId: safeString_(values[r][idx['Asset ID']]),
        variantType: safeString_(values[r][idx['Variant Type']]),
        label: safeString_(values[r][idx['Anchor/Name']]),
        url: url,
        status: safeString_(values[r][idx['URL Status']]),
        publishedId: safeString_(values[r][idx['Published ID']]),
        generatedBy: safeString_(values[r][idx['Generated By']]),
        tiny: safeString_(values[r][idx['TinyURL']]),
        clean: safeString_(values[r][idx['CleanURI']]),
        spoo: safeString_(values[r][idx['Spoo.me']])
      });
    }
    rows.sort(function(a, b) {
      return (a.assetType + '|' + a.assetId + '|' + a.variantType + '|' + a.url)
        .localeCompare(b.assetType + '|' + b.assetId + '|' + b.variantType + '|' + b.url);
    });
    return sha256Hex_(structuredStableJsonV4_(rows));
  } catch (e) {
    return '';
  }
}

/** V4.3 Option B: all direct Articles Docs participate in Public Content. */
function getProjectContentProjectionFingerprintV43_(project) {
  try {
    var docs = getSourceDocs_(project).map(function(file) {
      return {
        id: file.getId(),
        name: file.getName(),
        modifiedMs: file.getLastUpdated().getTime()
      };
    });
    docs.sort(function(a, b) { return a.id.localeCompare(b.id); });
    return sha256Hex_(structuredStableJsonV4_({
      schema: 'PUBLIC_CONTENT_OPTION_B_V1',
      projectKeyword: typeof getProjectKeywordV41_ === 'function' ? getProjectKeywordV41_(project) : project.projectName,
      targetPageUrl: normalizeUrl_(project.targetPageUrl || ''),
      docs: docs
    }));
  } catch (e) {
    return '';
  }
}

function getProjectPublicSheetPublishedFingerprintV43_(project) {
  try {
    // Avoid getProjectSingletonAssetStateV41_ here: that state function itself
    // calculates this fingerprint, which would recurse. Read the stored project
    // singleton registry record directly instead.
    var reg = typeof getProjectAssetRegistryV41_ === 'function'
      ? getProjectAssetRegistryV41_(project.projectId, 'PROJECT_URL_SHEET')
      : null;
    var sheetId = reg && reg.fileId || '';
    if (!sheetId) return '';
    var info = typeof getPublishedInfo_ === 'function' ? getPublishedInfo_(project, 'SHEET', sheetId) : {};
    return sha256Hex_(structuredStableJsonV4_({
      publishedUrl: info && info.publishedUrl || '',
      publishedId: info && info.publishedId || ''
    }));
  } catch (e) {
    return '';
  }
}
