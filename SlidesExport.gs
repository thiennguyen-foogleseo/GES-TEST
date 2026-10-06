/**
 * Google Docs -> Google Slides, preserving existing Slides File ID on update.
 * V3.2: shared BrandingManager adds project logo + CTA footer image.
 * Includes the V3.1.2 empty-textbox safety fix.
 */

function createSlidesAsset_(project, docFile) {
  assertProjectWritable_(project);
  validateSourceDoc_(project, docFile);
  const state = getAssetState_(project, docFile, 'SLIDES');
  if (state.status !== 'MISSING') {
    return makeAssetResult_(false, project, docFile, 'SLIDES', 'CREATE', 'ALREADY_EXISTS', 'Google Slides đã tồn tại hoặc cần Review.', state.id ? DriveApp.getFileById(state.id) : null);
  }

  const presentation = SlidesApp.create(getExpectedOutputName_(docFile, 'SLIDES'));
  const file = DriveApp.getFileById(presentation.getId());
  try {
    rebuildSlidesFromDocSafely_(project, presentation, docFile);
    presentation.saveAndClose();
    adoptManagedAsset_(project, docFile, 'SLIDES', file, { resolutionMethod: 'CREATE' });
    upsertManagedAssetToRegistrySheet_(project, docFile, 'SLIDES');
    return makeAssetResult_(true, project, docFile, 'SLIDES', 'CREATE', 'CREATED', 'Đã tạo Google Slides có Branding.', file);
  } catch (e) {
    try { file.setTrashed(true); } catch (ignore) {}
    throw e;
  }
}

function updateSlidesAsset_(project, docFile, force) {
  assertProjectWritable_(project);
  validateSourceDoc_(project, docFile);
  const resolved = resolveAssetForDoc_(project, docFile, 'SLIDES');
  if (resolved.ambiguous) return makeAssetResult_(false, project, docFile, 'SLIDES', 'UPDATE', 'DUPLICATE', 'Có nhiều Google Slides trùng. Cần Review.', null);
  if (!resolved.file) return makeAssetResult_(false, project, docFile, 'SLIDES', 'UPDATE', 'NOT_FOUND', 'Chưa có Google Slides để Update.', null);

  const presentation = SlidesApp.openById(resolved.file.getId());
  rebuildSlidesFromDocSafely_(project, presentation, docFile);
  presentation.saveAndClose();
  adoptManagedAsset_(project, docFile, 'SLIDES', resolved.file, { resolutionMethod: resolved.method });
  upsertManagedAssetToRegistrySheet_(project, docFile, 'SLIDES');
  return makeAssetResult_(true, project, docFile, 'SLIDES', 'UPDATE', 'UPDATED', 'Đã cập nhật Google Slides, Branding và giữ nguyên File ID.', resolved.file);
}

function rebuildSlidesFromDocSafely_(project, presentation, docFile) {
  const sections = readDocumentForSlides_(docFile);
  if (!sections.length) throw new Error('Google Docs không có nội dung phù hợp để tạo Slides.');

  const oldSlides = presentation.getSlides();
  const newSlides = [];

  try {
    newSlides.push(createCoverSlideV3_(project, presentation, docFile.getName()));

    sections.forEach(function(section) {
      const chunks = splitSectionForSlides_(section);
      chunks.forEach(function(chunk, index) {
        let title = safeVisibleTextV3_(section.title) || 'Nội dung';
        if (chunks.length > 1 && index > 0) title += ' (tiếp theo)';
        newSlides.push(createContentSlideV3_(project, presentation, title, chunk));
      });
    });

    if (V3_CONFIG.SLIDES.ADD_FINAL_ENTITY_SLIDE) {
      newSlides.push(createFinalEntitySlideV3_(project, presentation));
    }

    // V4.6.7: append a generated resource-link layer after canonical slides.
    // It is not read from the source Document model, so it cannot become
    // canonical article content or create a source/output feedback loop.
    if (typeof collectOutputResourceFooterModelV467_ === 'function' &&
        typeof appendSlidesOutputResourceFooterV467_ === 'function') {
      var resourceModelV467 = collectOutputResourceFooterModelV467_(project, docFile);
      var beforeCountV467 = presentation.getSlides().length;
      appendSlidesOutputResourceFooterV467_(project, presentation, resourceModelV467);
      presentation.getSlides().slice(beforeCountV467).forEach(function(slideV467) { newSlides.push(slideV467); });
    }

    oldSlides.forEach(function(slide) { slide.remove(); });
  } catch (e) {
    newSlides.forEach(function(slide) {
      try { slide.remove(); } catch (ignore) {}
    });
    throw e;
  }
}

function slideMetricsV3_(presentation) {
  return { w: presentation.getPageWidth(), h: presentation.getPageHeight() };
}

function safeVisibleTextV3_(value) {
  return safeString_(value).replace(/\u00A0/g, ' ').trim();
}

function projectBrandLabelV3_(project) {
  const branding = getProjectBranding_(project);
  return safeVisibleTextV3_(branding.brandName || project.brandName || project.projectName || project.rootFolderName || '');
}

function createCoverSlideV3_(project, presentation, title) {
  const slide = presentation.appendSlide(SlidesApp.PredefinedLayout.BLANK);
  const m = slideMetricsV3_(presentation);
  addSlideAccentV3_(slide, m);

  const coverTitle = safeVisibleTextV3_(title) || 'Untitled';
  const titleBox = slide.insertTextBox(coverTitle, m.w * 0.08, m.h * 0.24, m.w * 0.84, m.h * 0.24);
  titleBox.getText().getTextStyle()
    .setFontFamily(V3_CONFIG.SLIDES.FONT_FAMILY)
    .setFontSize(28)
    .setBold(true)
    .setForegroundColor(V3_CONFIG.SLIDES.TEXT_DARK);
  titleBox.getText().getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);

  const brandLabel = projectBrandLabelV3_(project);
  if (brandLabel) {
    const brand = slide.insertTextBox(brandLabel, m.w * 0.18, m.h * 0.60, m.w * 0.64, m.h * 0.08);
    brand.getText().getTextStyle()
      .setFontFamily(V3_CONFIG.SLIDES.FONT_FAMILY)
      .setFontSize(15)
      .setBold(true)
      .setForegroundColor(V3_CONFIG.SLIDES.BRAND_ACCENT);
    brand.getText().getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);
    const branding = getProjectBranding_(project);
    if (branding.websiteUrl) {
      try { brand.getText().getTextStyle().setLinkUrl(branding.websiteUrl); } catch (ignore) {}
    }
  }

  applyBrandingToSlide_(slide, presentation, project);
  return slide;
}

function createContentSlideV3_(project, presentation, title, items) {
  const slide = presentation.appendSlide(SlidesApp.PredefinedLayout.BLANK);
  const m = slideMetricsV3_(presentation);
  const reserve = getSlideBrandingReservedSpace_(presentation, project);
  addSlideAccentV3_(slide, m);

  const safeTitle = safeVisibleTextV3_(title) || 'Nội dung';
  const titleBox = slide.insertTextBox(safeTitle, m.w * 0.06, m.h * 0.07, m.w * 0.72, m.h * 0.15);
  titleBox.getText().getTextStyle()
    .setFontFamily(V3_CONFIG.SLIDES.FONT_FAMILY)
    .setFontSize(V3_CONFIG.SLIDES.TITLE_FONT_SIZE)
    .setBold(true)
    .setForegroundColor(V3_CONFIG.SLIDES.TEXT_DARK);

  let bodyText = '';
  const ranges = [];

  (items || []).forEach(function(item, index) {
    const itemText = safeString_(item && item.text);
    const prefix = (item && (item.isBullet || item.isSubheading)) ? '• ' : '';
    const start = bodyText.length;
    bodyText += prefix + itemText;
    const end = bodyText.length;
    ranges.push({ start: start, end: end, prefixLength: prefix.length, item: item || {} });
    if (index < items.length - 1) bodyText += '\n\n';
  });

  if (safeVisibleTextV3_(bodyText)) {
    const bodyTop = m.h * 0.24;
    const bottomPadding = Math.max(18, reserve.bottomPt + 10);
    const bodyHeight = Math.max(50, m.h - bodyTop - bottomPadding);
    const bodyBox = slide.insertTextBox(bodyText, m.w * 0.06, bodyTop, m.w * 0.88, bodyHeight);
    const body = bodyBox.getText();
    body.getTextStyle()
      .setFontFamily(V3_CONFIG.SLIDES.FONT_FAMILY)
      .setFontSize(V3_CONFIG.SLIDES.BODY_FONT_SIZE)
      .setForegroundColor(V3_CONFIG.SLIDES.TEXT_DARK);

    ranges.forEach(function(info) {
      if (info.item.isSubheading && info.end > info.start) {
        try {
          body.getRange(info.start, info.end).getTextStyle().setBold(true).setForegroundColor(V3_CONFIG.SLIDES.BRAND_ACCENT);
        } catch (ignore) {}
      }
      (info.item.runs || []).forEach(function(run) {
        const s = info.start + info.prefixLength + run.start;
        const e = info.start + info.prefixLength + run.end;
        if (e <= s || !run.url) return;
        try { body.getRange(s, e).getTextStyle().setLinkUrl(run.url); } catch (ignore2) {}
      });
    });
  }

  applyBrandingToSlide_(slide, presentation, project);
  return slide;
}

function createFinalEntitySlideV3_(project, presentation) {
  const slide = presentation.appendSlide(SlidesApp.PredefinedLayout.BLANK);
  const m = slideMetricsV3_(presentation);
  const reserve = getSlideBrandingReservedSpace_(presentation, project);
  const branding = getProjectBranding_(project);
  addSlideAccentV3_(slide, m);

  const brandLabel = projectBrandLabelV3_(project) || 'Dự án';
  const title = slide.insertTextBox('Kết nối với ' + brandLabel, m.w * 0.07, m.h * 0.08, m.w * 0.70, m.h * 0.14);
  title.getText().getTextStyle()
    .setFontFamily(V3_CONFIG.SLIDES.FONT_FAMILY)
    .setFontSize(26)
    .setBold(true)
    .setForegroundColor(V3_CONFIG.SLIDES.TEXT_DARK);

  const lines = [];
  if (branding.websiteUrl) lines.push('Website: ' + branding.websiteUrl);
  if (project.targetPageUrl) lines.push('Trang mục tiêu: ' + project.targetPageUrl);
  if (project.googleMapsUrl) lines.push('Google Maps: ' + project.googleMapsUrl);
  if (project.googleSitesUrl) lines.push('Google Sites: ' + project.googleSitesUrl);
  (branding.phones || []).forEach(function(phone, i) {
    lines.push((i === 0 ? 'Hotline: ' : 'Hotline ' + (i + 1) + ': ') + phone);
  });
  if (branding.email) lines.push('Email: ' + branding.email);
  if (branding.address) lines.push('Địa chỉ: ' + branding.address);

  if (lines.length) {
    const entityText = lines.join('\n\n');
    const top = m.h * 0.24;
    const height = Math.max(70, m.h - top - Math.max(20, reserve.bottomPt + 12));
    const box = slide.insertTextBox(entityText, m.w * 0.10, top, m.w * 0.80, height);
    box.getText().getTextStyle()
      .setFontFamily(V3_CONFIG.SLIDES.FONT_FAMILY)
      .setFontSize(14)
      .setForegroundColor(V3_CONFIG.SLIDES.TEXT_DARK);
  }

  applyBrandingToSlide_(slide, presentation, project);
  return slide;
}

function addSlideAccentV3_(slide, m) {
  const bar = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, 0, m.w, 6);
  bar.getFill().setSolidFill(V3_CONFIG.SLIDES.BRAND_ACCENT);
  bar.getBorder().setTransparent();
}
