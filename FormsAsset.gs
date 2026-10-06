/**
 * GES V4.1 - Project Form singleton.
 *
 * One project -> one managed Google Form, stored directly in PROJECT_ROOT.
 * Legacy per-source Forms are preserved and never auto-adopted in Patch A.
 */

const GES_FORMS_ASSET_V4 = Object.freeze({
  VERSION: '1.1.0-project-singleton',
  MAX_SECTION_COUNT: 12,
  MAX_SECTION_HELP_CHARS: 1000,
  MAX_FAQ_COUNT: 12,
  MAX_FAQ_HELP_CHARS: 1600,
  MAX_CHOICE_COUNT: 20
});

/* ========================================================================== *
 * Public API
 * ========================================================================== */

function previewProjectFormV4(projectId) {
  var project = resolveStructuredProjectV4_(projectId || '');
  var source = resolveProjectPrimarySourceDocV41_(project);
  var state = getProjectSingletonAssetStateV41_(project, 'PROJECT_FORM');
  var plan = null;

  if (source.ready && source.file) {
    var model = buildCanonicalContentModelV4(source.file.getId(), project.projectId);
    plan = buildFormRenderPlanV4_(project, source.file, model);
  }

  return {
    success: true,
    version: GES_FORMS_ASSET_V4.VERSION,
    projectId: project.projectId,
    projectName: project.projectName,
    projectKeyword: getProjectKeywordV41_(project),
    status: state.status,
    formId: state.id || '',
    formUrl: state.url || '',
    resolutionMethod: state.resolutionMethod || '',
    source: {
      ready: !!source.ready,
      status: source.status,
      method: source.method,
      docId: source.file ? source.file.getId() : '',
      docName: source.file ? source.file.getName() : '',
      candidates: Number(source.candidates || 0)
    },
    sectionCount: plan ? plan.sections.length : 0,
    faqCount: plan ? plan.faqs.length : 0,
    interestChoiceCount: plan ? plan.interestChoices.length : 0,
    fingerprint: getProjectManagedAssetFingerprintV41_(project, 'PROJECT_FORM')
  };
}

function previewActiveProjectFormV4() {
  return previewProjectFormV4('');
}

function buildProjectFormV4(projectId) {
  var project = resolveStructuredProjectV4_(projectId || '');
  assertProjectWritable_(project);
  var result = syncProjectSingletonAssetV41_(project, 'PROJECT_FORM');
  return {
    success: result.success !== false,
    version: GES_FORMS_ASSET_V4.VERSION,
    projectId: project.projectId,
    projectName: project.projectName,
    result: result
  };
}

function buildActiveProjectFormV4() {
  return buildProjectFormV4('');
}

/* ========================================================================== *
 * Sync integration
 * ========================================================================== */

function createProjectFormAssetV41_(project) {
  assertProjectWritable_(project);
  var source = resolveProjectPrimarySourceDocV41_(project);
  if (!source.ready || !source.file) {
    throw new Error('PROJECT_FORM_PRIMARY_SOURCE_REQUIRED: ' + safeString_(source.method || source.status));
  }

  var outputName = getProjectSingletonExpectedNameV41_(project, 'PROJECT_FORM');
  var form = FormApp.create(outputName, true);
  var file = DriveApp.getFileById(form.getId());
  ensureFileInFolder_(file, getProjectRoot_(project));

  try {
    renderProjectFormV41_(project, source.file, form);
    var fingerprint = getProjectManagedAssetFingerprintV41_(project, 'PROJECT_FORM');
    tagProjectManagedAssetV41_(project, 'PROJECT_FORM', file, {
      ASSET_SCHEMA_VERSION: 'PROJECT_FORM_V1',
      ASSET_FINGERPRINT: fingerprint,
      RENDERER_VERSION: GES_FORMS_ASSET_V4.VERSION,
      PRIMARY_SOURCE_DOC_ID: source.file.getId(),
      PRIMARY_SOURCE_METHOD: source.method
    });
    saveProjectAssetRegistryV41_(project, 'PROJECT_FORM', file, {
      assetFingerprint: fingerprint,
      rendererVersion: GES_FORMS_ASSET_V4.VERSION,
      resolutionMethod: 'CREATE',
      primarySourceDocId: source.file.getId(),
      primarySourceMethod: source.method,
      publicUrl: safeFormPublishedUrlV4_(form)
    });
    upsertProjectManagedAssetToRegistrySheetV41_(project, 'PROJECT_FORM');
    upsertProjectStructuredAssetUrlVariantsV41_(project, 'PROJECT_FORM', file);
    return makeProjectAssetResultV41_(true, project, 'PROJECT_FORM', 'CREATE', 'CREATED', 'Đã tạo Project Form duy nhất trong PROJECT_ROOT.', file, {
      publicUrl: safeFormPublishedUrlV4_(form),
      assetFingerprint: fingerprint,
      primarySourceDocId: source.file.getId()
    });
  } catch (e) {
    try { clearProjectAssetRegistryV41_(project.projectId, 'PROJECT_FORM'); } catch (ignore0) {}
    try { file.setTrashed(true); } catch (ignore1) {}
    throw e;
  }
}

function updateProjectFormAssetV41_(project) {
  assertProjectWritable_(project);
  var source = resolveProjectPrimarySourceDocV41_(project);
  if (!source.ready || !source.file) {
    throw new Error('PROJECT_FORM_PRIMARY_SOURCE_REQUIRED: ' + safeString_(source.method || source.status));
  }

  var resolved = resolveProjectSingletonAssetV41_(project, 'PROJECT_FORM');
  if (!resolved.file || resolved.ambiguous) throw new Error('PROJECT_FORM_UPDATE_ASSET_NOT_RESOLVED');
  var file = resolved.file;
  ensureFileInFolder_(file, getProjectRoot_(project));
  var expectedName = getProjectSingletonExpectedNameV41_(project, 'PROJECT_FORM');
  if (file.getName() !== expectedName) file.setName(expectedName);

  var form = FormApp.openById(file.getId());
  renderProjectFormV41_(project, source.file, form);
  var fingerprint = getProjectManagedAssetFingerprintV41_(project, 'PROJECT_FORM');
  tagProjectManagedAssetV41_(project, 'PROJECT_FORM', file, {
    ASSET_SCHEMA_VERSION: 'PROJECT_FORM_V1',
    ASSET_FINGERPRINT: fingerprint,
    RENDERER_VERSION: GES_FORMS_ASSET_V4.VERSION,
    PRIMARY_SOURCE_DOC_ID: source.file.getId(),
    PRIMARY_SOURCE_METHOD: source.method
  });
  saveProjectAssetRegistryV41_(project, 'PROJECT_FORM', file, {
    assetFingerprint: fingerprint,
    rendererVersion: GES_FORMS_ASSET_V4.VERSION,
    resolutionMethod: resolved.method || 'PROJECT_REGISTRY_ID',
    primarySourceDocId: source.file.getId(),
    primarySourceMethod: source.method,
    publicUrl: safeFormPublishedUrlV4_(form)
  });
  upsertProjectManagedAssetToRegistrySheetV41_(project, 'PROJECT_FORM');
  upsertProjectStructuredAssetUrlVariantsV41_(project, 'PROJECT_FORM', file);
  return makeProjectAssetResultV41_(true, project, 'PROJECT_FORM', 'UPDATE', 'UPDATED', 'Đã cập nhật Project Form và giữ nguyên File ID.', file, {
    publicUrl: safeFormPublishedUrlV4_(form),
    assetFingerprint: fingerprint,
    primarySourceDocId: source.file.getId()
  });
}

/* Legacy per-source entrypoints are intentionally retired in Patch A. */
function createFormAsset_(project, docFile) {
  throw new Error('FORM_IS_PROJECT_SINGLETON_V41: dùng buildProjectFormV4().');
}
function updateFormAsset_(project, docFile) {
  throw new Error('FORM_IS_PROJECT_SINGLETON_V41: dùng buildProjectFormV4().');
}

/* ========================================================================== *
 * Renderer
 * ========================================================================== */

function renderProjectFormV41_(project, docFile, form) {
  var model = buildCanonicalContentModelV4(docFile.getId(), project.projectId);
  var entity = buildEntityProfileV4(project.projectId);
  var validation = validateCanonicalContentModelV4(model);
  if (!validation.valid) throw new Error('FORM_CONTENT_MODEL_INVALID: ' + validation.errors.join(', '));
  var plan = buildFormRenderPlanV4_(project, docFile, model);

  form.setTitle(getProjectSingletonExpectedNameV41_(project, 'PROJECT_FORM'));
  form.setDescription(buildFormDescriptionV41_(project, entity, model, docFile));
  try { form.setPublished(true); } catch (ignore0) {}
  try { form.setIsQuiz(false); } catch (ignore1) {}
  try { form.setCollectEmail(false); } catch (ignore2) {}
  try { form.setLimitOneResponsePerUser(false); } catch (ignore3) {}
  try { form.setAcceptingResponses(true); } catch (ignore4) {}
  try { form.setConfirmationMessage(buildFormConfirmationMessageV4_(project)); } catch (ignore5) {}

  var items = form.getItems();
  for (var i = items.length - 1; i >= 0; i--) form.deleteItem(items[i]);

  if (plan.intro) {
    form.addSectionHeaderItem().setTitle('Thông tin chính').setHelpText(plan.intro);
  }
  if (plan.interestChoices.length) {
    form.addMultipleChoiceItem()
      .setTitle('Bạn đang quan tâm nội dung nào?')
      .setChoiceValues(plan.interestChoices.slice(0, GES_FORMS_ASSET_V4.MAX_CHOICE_COUNT))
      .setRequired(false);
  }
  plan.sections.forEach(function(section) {
    form.addSectionHeaderItem().setTitle(section.title).setHelpText(section.helpText || '');
  });
  if (plan.faqs.length) {
    form.addSectionHeaderItem().setTitle('Câu hỏi thường gặp').setHelpText('Các câu hỏi dưới đây được lấy từ nội dung nguồn của project.');
    plan.faqs.forEach(function(faq) {
      form.addSectionHeaderItem().setTitle(faq.question).setHelpText(faq.answer || '');
    });
  }
  form.addSectionHeaderItem()
    .setTitle(entity.organization.brandName || project.brandName || project.projectName)
    .setHelpText(buildFormEntityFooterV4_(project, entity));
  return form;
}

function buildFormRenderPlanV4_(project, docFile, model) {
  var blockMap = {};
  (model.blocks || []).forEach(function(block) { blockMap[block.id] = block; });

  var intro = (model.derived && model.derived.introBlockIds || []).map(function(id) {
    return blockMap[id] ? formBlockTextV4_(blockMap[id]) : '';
  }).filter(Boolean).join('\n');
  intro = truncateFormTextV4_(intro, GES_FORMS_ASSET_V4.MAX_SECTION_HELP_CHARS);

  var sections = (model.sections || []).filter(function(section) {
    return Number(section.headingLevel || 0) === 2;
  }).slice(0, GES_FORMS_ASSET_V4.MAX_SECTION_COUNT).map(function(section) {
    var content = (section.blockIds || []).map(function(blockId) {
      return blockMap[blockId] ? formBlockTextV4_(blockMap[blockId]) : '';
    }).filter(Boolean).join('\n');
    return {
      id: section.id,
      title: section.title,
      helpText: truncateFormTextV4_(content, GES_FORMS_ASSET_V4.MAX_SECTION_HELP_CHARS)
    };
  });

  var faqs = (model.derived && model.derived.faqCandidates || []).slice(0, GES_FORMS_ASSET_V4.MAX_FAQ_COUNT).map(function(faq) {
    var answer = (faq.answerBlockIds || []).map(function(blockId) {
      return blockMap[blockId] ? formBlockTextV4_(blockMap[blockId]) : '';
    }).filter(Boolean).join('\n');
    return {
      question: safeString_(faq.question),
      answer: truncateFormTextV4_(answer, GES_FORMS_ASSET_V4.MAX_FAQ_HELP_CHARS)
    };
  });

  return {
    intro: intro,
    sections: sections,
    faqs: faqs,
    interestChoices: sections.map(function(section) { return section.title; }).filter(Boolean)
  };
}

function buildFormDescriptionV41_(project, entity, model, docFile) {
  var lines = [];
  lines.push('Project GES: ' + (project.projectName || ''));
  lines.push('Project keyword: ' + getProjectKeywordV41_(project));
  lines.push('Nguồn nội dung chính: ' + docFile.getName());
  if (project.targetPageUrl) lines.push('Trang nội dung: ' + project.targetPageUrl);
  if (entity.organization.websiteUrl) lines.push('Website: ' + entity.organization.websiteUrl);
  if (entity.organization.brandName) lines.push('Đơn vị: ' + entity.organization.brandName);
  lines.push('Không nhập thông tin cá nhân nhạy cảm, số hộ chiếu, mã hồ sơ hoặc thông tin định danh vào biểu mẫu này.');
  lines.push('Content fingerprint: ' + safeString_(model.fingerprints && model.fingerprints.model).substring(0, 16));
  return lines.join('\n');
}

function buildFormConfirmationMessageV4_(project) {
  var target = normalizeUrl_(project.targetPageUrl || project.websiteUrl || '');
  return target ? ('Cảm ơn bạn. Xem nội dung đầy đủ tại: ' + target) : 'Cảm ơn bạn.';
}

function buildFormEntityFooterV4_(project, entity) {
  var lines = [];
  if (entity.organization.websiteUrl) lines.push('Website: ' + entity.organization.websiteUrl);
  if (entity.contact.phones && entity.contact.phones.length) lines.push('Hotline: ' + entity.contact.phones.join(' | '));
  if (entity.contact.email) lines.push('Email: ' + entity.contact.email);
  if (entity.contact.address) lines.push('Địa chỉ: ' + entity.contact.address);
  if (project.targetPageUrl) lines.push('Nội dung đầy đủ: ' + project.targetPageUrl);
  return lines.join('\n');
}

function formBlockTextV4_(block) {
  if (!block) return '';
  if (block.type === 'table') {
    return (block.rows || []).map(function(row) {
      return (row || []).map(function(cell) { return safeString_(cell && cell.text); }).join(' | ');
    }).join('\n');
  }
  return safeString_(block.text).trim();
}

function truncateFormTextV4_(text, maxChars) {
  var s = safeString_(text).trim();
  return s.length <= maxChars ? s : s.substring(0, Math.max(0, maxChars - 1)).trim() + '…';
}

function safeFormPublishedUrlV4_(form) {
  try { return form.getPublishedUrl() || ''; } catch (e) { return ''; }
}
