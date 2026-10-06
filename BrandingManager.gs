/**
 * Multi-Project Google Entity Stack Manager V4.0
 * BrandingManager.gs
 *
 * Shared branding layer for Slides, temporary Google Docs used to export
 * PDF/DOCX and HTML GES outputs.
 */

const BRANDING_MANAGER_VERSION = '4.0.0-g1';
const BRANDING_CACHE_SECONDS = 21600;
const BRANDING_CACHE_MAX_STRING_LENGTH = 90000;
var BRANDING_BLOB_MEMORY_CACHE_ = {};
var BRANDING_FILE_STAMP_CACHE_ = {};

function getDefaultBrandingConfig_() {
  return {
    schemaVersion: V3_CONFIG.BRANDING_SCHEMA_VERSION || 1,
    brandingManagerVersion: BRANDING_MANAGER_VERSION,
    enabled: true,
    brandName: '',
    websiteUrl: '',
    phones: [],
    email: '',
    address: '',
    logo: {
      enabled: true,
      driveFileId: '',
      publicUrl: '',
      altText: '',
      slideWidthPt: V3_CONFIG.BRANDING.DEFAULT_SLIDE_LOGO_WIDTH_PT || 105,
      slideTopPt: 12,
      slideRightPt: 14,
      docWidthPx: V3_CONFIG.BRANDING.DEFAULT_DOC_LOGO_WIDTH_PX || 130
    },
    cta: {
      enabled: true,
      driveFileId: '',
      publicUrl: '',
      altText: 'Tư vấn ngay',
      label: 'TƯ VẤN NGAY',
      slideLeftPt: 0,
      slideRightPt: 0,
      slideBottomPt: 0,
      slideMaxHeightPt: V3_CONFIG.BRANDING.DEFAULT_SLIDE_CTA_MAX_HEIGHT_PT || 52,
      docWidthPx: V3_CONFIG.BRANDING.DEFAULT_DOC_CTA_WIDTH_PX || 500
    },
    targets: {
      slides: true,
      docs: true,
      pdf: true,
      docx: true,
      html: true
    },
    slides: {
      showLogo: true,
      showCta: true,
      reserveTopPt: 20,
      reserveBottomPt: 56
    },
    docs: {
      showLogo: true,
      showCta: true,
      replaceHeader: true,
      replaceFooter: true
    },
    html: {
      showLogo: true,
      showCta: true,
      logoMaxWidthPx: 180,
      contentMaxWidthPx: 1200
    },
  };
}

function getProjectBranding_(projectOrId) {
  if (projectOrId && typeof projectOrId === 'object' && projectOrId.brandingManagerVersion === BRANDING_MANAGER_VERSION) {
    return brandingDeepClone_(projectOrId);
  }
  const project = resolveBrandingProject_(projectOrId);
  return normalizeBrandingConfig_(project);
}

function resolveBrandingProject_(projectOrId) {
  if (projectOrId && typeof projectOrId === 'object') return projectOrId;
  let projectId = typeof projectOrId === 'string' ? projectOrId.trim() : '';
  if (!projectId && typeof getActiveProjectId_ === 'function') projectId = getActiveProjectId_() || '';
  if (!projectId) return {};
  if (typeof getProject_ === 'function') {
    const p = getProject_(projectId);
    if (p) return p;
  }
  if (typeof getProjectById_ === 'function') {
    const p = getProjectById_(projectId);
    if (p) return p;
  }
  return {};
}

function normalizeBrandingConfig_(project) {
  project = project || {};
  if (project.brandingManagerVersion === BRANDING_MANAGER_VERSION) return brandingDeepClone_(project);

  const d = getDefaultBrandingConfig_();
  const raw = project.branding || {};
  const brand = project.brand || {};
  const rawLogo = raw.logo || {};
  const rawCta = raw.cta || {};
  const rawTargets = raw.targets || {};
  const rawSlides = raw.slides || {};
  const rawDocs = raw.docs || {};
  const rawHtml = raw.html || {};

  const phones = brandingNormalizePhones_(
    raw.phones || brand.phones || project.phones || [
      raw.phone1, raw.phone2, brand.phone1, brand.phone2,
      project.phone, project.phone1, project.phone2
    ]
  );

  return {
    schemaVersion: Number(raw.schemaVersion || d.schemaVersion),
    brandingManagerVersion: BRANDING_MANAGER_VERSION,
    enabled: brandingBool_(raw.enabled, d.enabled),
    brandName: brandingFirstNonEmpty_([raw.brandName, brand.name, project.brandName, project.projectName]),
    websiteUrl: brandingFirstNonEmpty_([raw.websiteUrl, brand.websiteUrl, project.websiteUrl]),
    phones: phones,
    email: brandingFirstNonEmpty_([raw.email, brand.email, project.email]),
    address: brandingFirstNonEmpty_([raw.address, brand.address, project.address]),
    logo: {
      enabled: brandingBool_(rawLogo.enabled, d.logo.enabled),
      driveFileId: brandingExtractDriveFileId_(brandingFirstNonEmpty_([rawLogo.driveFileId, raw.logoFileId, brand.logoFileId, project.logoFileId])),
      publicUrl: brandingFirstNonEmpty_([rawLogo.publicUrl, raw.logoPublicUrl, brand.logoPublicUrl, project.logoPublicUrl]),
      altText: brandingFirstNonEmpty_([rawLogo.altText, raw.brandName, brand.name, project.brandName, d.logo.altText]),
      slideWidthPt: brandingNumber_(rawLogo.slideWidthPt, d.logo.slideWidthPt),
      slideTopPt: brandingNumber_(rawLogo.slideTopPt, d.logo.slideTopPt),
      slideRightPt: brandingNumber_(rawLogo.slideRightPt, d.logo.slideRightPt),
      docWidthPx: brandingNumber_(rawLogo.docWidthPx, d.logo.docWidthPx)
    },
    cta: {
      enabled: brandingBool_(rawCta.enabled, d.cta.enabled),
      driveFileId: brandingExtractDriveFileId_(brandingFirstNonEmpty_([rawCta.driveFileId, raw.ctaFooterFileId, project.ctaFooterFileId])),
      publicUrl: brandingFirstNonEmpty_([rawCta.publicUrl, raw.ctaPublicUrl, project.ctaPublicUrl]),
      altText: brandingFirstNonEmpty_([rawCta.altText, d.cta.altText]),
      label: brandingFirstNonEmpty_([rawCta.label, d.cta.label]),
      slideLeftPt: brandingNumber_(rawCta.slideLeftPt, d.cta.slideLeftPt),
      slideRightPt: brandingNumber_(rawCta.slideRightPt, d.cta.slideRightPt),
      slideBottomPt: brandingNumber_(rawCta.slideBottomPt, d.cta.slideBottomPt),
      slideMaxHeightPt: brandingNumber_(rawCta.slideMaxHeightPt, d.cta.slideMaxHeightPt),
      docWidthPx: brandingNumber_(rawCta.docWidthPx, d.cta.docWidthPx)
    },
    targets: {
      slides: brandingBool_(rawTargets.slides, d.targets.slides),
      docs: brandingBool_(rawTargets.docs, d.targets.docs),
      pdf: brandingBool_(rawTargets.pdf, d.targets.pdf),
      docx: brandingBool_(rawTargets.docx, d.targets.docx),
      html: brandingBool_(rawTargets.html, d.targets.html)
    },
    slides: {
      showLogo: brandingBool_(rawSlides.showLogo, d.slides.showLogo),
      showCta: brandingBool_(rawSlides.showCta, d.slides.showCta),
      reserveTopPt: brandingNumber_(rawSlides.reserveTopPt, d.slides.reserveTopPt),
      reserveBottomPt: brandingNumber_(rawSlides.reserveBottomPt, d.slides.reserveBottomPt)
    },
    docs: {
      showLogo: brandingBool_(rawDocs.showLogo, d.docs.showLogo),
      showCta: brandingBool_(rawDocs.showCta, d.docs.showCta),
      replaceHeader: brandingBool_(rawDocs.replaceHeader, d.docs.replaceHeader),
      replaceFooter: brandingBool_(rawDocs.replaceFooter, d.docs.replaceFooter)
    },
    html: {
      showLogo: brandingBool_(rawHtml.showLogo, d.html.showLogo),
      showCta: brandingBool_(rawHtml.showCta, d.html.showCta),
      logoMaxWidthPx: brandingNumber_(rawHtml.logoMaxWidthPx, d.html.logoMaxWidthPx),
      contentMaxWidthPx: brandingNumber_(rawHtml.contentMaxWidthPx, d.html.contentMaxWidthPx)
    }
  };
}

function validateProjectBranding_(projectOrConfig) {
  const config = getProjectBranding_(projectOrConfig);
  const errors = [];
  const warnings = [];
  if (!config.enabled) return { valid: true, enabled: false, errors: [], warnings: ['BRANDING_DISABLED'], config: config };
  if (config.logo.enabled && !config.logo.driveFileId && !config.logo.publicUrl) warnings.push('LOGO_NOT_CONFIGURED');
  if (config.cta.enabled && !config.cta.driveFileId && !config.cta.publicUrl) warnings.push('CTA_NOT_CONFIGURED');
  if (!config.websiteUrl) warnings.push('WEBSITE_URL_NOT_CONFIGURED');
  if (!config.phones.length) warnings.push('PHONE_NOT_CONFIGURED');

  if (config.logo.driveFileId) {
    try { getBrandingAssetBlob_(config.logo.driveFileId, { requireImage: true }); }
    catch (e) { errors.push('LOGO_DRIVE_ERROR: ' + e.message); }
  }
  if (config.cta.driveFileId) {
    try { getBrandingAssetBlob_(config.cta.driveFileId, { requireImage: true }); }
    catch (e2) { errors.push('CTA_DRIVE_ERROR: ' + e2.message); }
  }
  return { valid: errors.length === 0, enabled: true, errors: errors, warnings: warnings, config: config };
}

function validateActiveProjectBranding() {
  const project = getActiveProject_();
  if (!project) throw new Error('Chưa có active project.');
  return validateProjectBranding_(project);
}

function getActiveProjectBrandingForClient() {
  const project = getActiveProject_();
  if (!project) throw new Error('Chưa có active project.');
  return getProjectBranding_(project);
}


function getBrandingAssetTargetKey_(assetType) {
  const t = String(assetType || '').toUpperCase();
  if (t === 'SLIDES') return 'slides';
  if (t === 'PDF') return 'pdf';
  if (t === 'DOCX') return 'docx';
  if (t === 'HTML') return 'html';
  if (t === 'DOC' || t === 'DOCS') return 'docs';
  return String(assetType || '').toLowerCase();
}

function getBrandingFileStamp_(fileId) {
  if (!fileId) return 0;
  if (BRANDING_FILE_STAMP_CACHE_[fileId] !== undefined) return BRANDING_FILE_STAMP_CACHE_[fileId];
  try {
    const stamp = DriveApp.getFileById(fileId).getLastUpdated().getTime();
    BRANDING_FILE_STAMP_CACHE_[fileId] = stamp;
    return stamp;
  } catch (e) {
    BRANDING_FILE_STAMP_CACHE_[fileId] = -1;
    return -1;
  }
}

/**
 * Fingerprint of branding inputs that affect one output type. Saved in the
 * asset registry so a branding change makes existing outputs OUTDATED even
 * when the source Docs text did not change.
 */
function getBrandingFingerprint_(projectOrConfig, assetType) {
  const c = getProjectBranding_(projectOrConfig);
  const key = getBrandingAssetTargetKey_(assetType);
  if (!c.enabled || !c.targets[key]) return '';

  let effective = true;
  if (key === 'slides') effective = !!((c.slides.showLogo && c.logo.driveFileId) || (c.slides.showCta && c.cta.driveFileId));
  if (key === 'pdf' || key === 'docx' || key === 'docs') effective = !!((c.docs.showLogo && c.logo.driveFileId) || (c.docs.showCta && c.cta.driveFileId));
  if (!effective && key !== 'html') return '';

  const payload = {
    manager: BRANDING_MANAGER_VERSION,
    key: key,
    brandName: c.brandName,
    websiteUrl: c.websiteUrl,
    phones: c.phones,
    email: c.email,
    address: c.address,
    logo: {
      enabled: c.logo.enabled,
      id: c.logo.driveFileId,
      stamp: getBrandingFileStamp_(c.logo.driveFileId),
      publicUrl: c.logo.publicUrl,
      altText: c.logo.altText,
      slideWidthPt: c.logo.slideWidthPt,
      docWidthPx: c.logo.docWidthPx
    },
    cta: {
      enabled: c.cta.enabled,
      id: c.cta.driveFileId,
      stamp: getBrandingFileStamp_(c.cta.driveFileId),
      publicUrl: c.cta.publicUrl,
      label: c.cta.label,
      slideMaxHeightPt: c.cta.slideMaxHeightPt,
      docWidthPx: c.cta.docWidthPx
    },
    target: c.targets[key],
    slides: key === 'slides' ? c.slides : null,
    docs: (key === 'pdf' || key === 'docx' || key === 'docs') ? c.docs : null,
    html: key === 'html' ? c.html : null
  };
  return sha256Hex_(JSON.stringify(payload));
}

function getBrandingAssetBlob_(fileIdOrUrl, options) {
  options = options || {};
  const fileId = brandingExtractDriveFileId_(fileIdOrUrl);
  if (!fileId) return null;
  let file;
  try { file = DriveApp.getFileById(fileId); }
  catch (e) { throw new Error('Không truy cập được branding file ' + fileId + ': ' + e.message); }

  const stamp = file.getLastUpdated() ? file.getLastUpdated().getTime() : 0;
  const cacheKey = 'BRANDING_BLOB_V32_' + fileId + '_' + stamp;
  if (BRANDING_BLOB_MEMORY_CACHE_[cacheKey]) return brandingCopyBlob_(BRANDING_BLOB_MEMORY_CACHE_[cacheKey]);

  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);
  if (cached) {
    try {
      const data = JSON.parse(cached);
      const blob = Utilities.newBlob(Utilities.base64Decode(data.base64), data.mimeType, data.name);
      BRANDING_BLOB_MEMORY_CACHE_[cacheKey] = blob;
      return brandingCopyBlob_(blob);
    } catch (ignore) {}
  }

  const blob = file.getBlob();
  const mimeType = String(blob.getContentType() || '');
  if (options.requireImage !== false && mimeType.indexOf('image/') !== 0) {
    throw new Error('Branding file không phải image: ' + fileId + ' (' + mimeType + ')');
  }
  BRANDING_BLOB_MEMORY_CACHE_[cacheKey] = blob;

  try {
    const payload = JSON.stringify({
      base64: Utilities.base64Encode(blob.getBytes()),
      mimeType: mimeType,
      name: blob.getName() || file.getName()
    });
    if (payload.length <= BRANDING_CACHE_MAX_STRING_LENGTH) cache.put(cacheKey, payload, BRANDING_CACHE_SECONDS);
  } catch (ignore2) {}
  return brandingCopyBlob_(blob);
}

function getLogoBlob_(projectOrConfig) {
  const c = getProjectBranding_(projectOrConfig);
  if (!c.enabled || !c.logo.enabled || !c.logo.driveFileId) return null;
  return getBrandingAssetBlob_(c.logo.driveFileId, { requireImage: true });
}

function getCtaFooterBlob_(projectOrConfig) {
  const c = getProjectBranding_(projectOrConfig);
  if (!c.enabled || !c.cta.enabled || !c.cta.driveFileId) return null;
  return getBrandingAssetBlob_(c.cta.driveFileId, { requireImage: true });
}

function clearBrandingMemoryCache_() {
  BRANDING_BLOB_MEMORY_CACHE_ = {};
  BRANDING_FILE_STAMP_CACHE_ = {};
  return { success: true };
}

function getBrandingBlobDataUri_(blob) {
  if (!blob) return '';
  return 'data:' + (blob.getContentType() || 'application/octet-stream') + ';base64,' + Utilities.base64Encode(blob.getBytes());
}

function resolveBrandingImageSrc_(assetConfig, mode) {
  assetConfig = assetConfig || {};
  mode = mode || 'DATA_URI_ALLOWED';
  const publicUrl = String(assetConfig.publicUrl || '').trim();
  if (publicUrl && brandingIsSafeHttpUrl_(publicUrl)) return publicUrl;
  if (mode === 'PUBLIC_URL_ONLY') return '';
  const fileId = brandingExtractDriveFileId_(assetConfig.driveFileId);
  if (!fileId) return '';
  try { return getBrandingBlobDataUri_(getBrandingAssetBlob_(fileId, { requireImage: true })); }
  catch (e) { return ''; }
}

function getSlideBrandingReservedSpace_(presentation, projectOrConfig) {
  const c = getProjectBranding_(projectOrConfig);
  if (!c.enabled || !c.targets.slides) return { topPt: 0, bottomPt: 0 };
  return {
    topPt: c.slides.showLogo ? c.slides.reserveTopPt : 0,
    bottomPt: c.slides.showCta ? c.slides.reserveBottomPt : 0
  };
}

function applyBrandingToSlide_(slide, presentation, projectOrConfig) {
  if (!slide) throw new Error('SLIDE_REQUIRED');
  if (!presentation) throw new Error('PRESENTATION_REQUIRED');
  const c = getProjectBranding_(projectOrConfig);
  if (!c.enabled || !c.targets.slides) return { success: true, skipped: true };

  const pageWidth = presentation.getPageWidth();
  const pageHeight = presentation.getPageHeight();
  const result = { success: true, logoAdded: false, ctaAdded: false, topReservedPt: 0, bottomReservedPt: 0 };

  if (c.slides.showLogo && c.logo.enabled && c.logo.driveFileId) {
    try {
      const image = slide.insertImage(getLogoBlob_(c));
      const size = brandingResizeSlideImageByWidth_(image, c.logo.slideWidthPt);
      image.setLeft(Math.max(0, pageWidth - size.width - c.logo.slideRightPt));
      image.setTop(Math.max(0, c.logo.slideTopPt));
      brandingSetSlideImageLink_(image, c.websiteUrl);
      result.logoAdded = true;
      result.topReservedPt = Math.max(c.slides.reserveTopPt, size.height + c.logo.slideTopPt);
    } catch (e) { result.logoError = e.message; }
  }

  if (c.slides.showCta && c.cta.enabled && c.cta.driveFileId) {
    try {
      const image = slide.insertImage(getCtaFooterBlob_(c));
      const availableWidth = pageWidth - c.cta.slideLeftPt - c.cta.slideRightPt;
      const size = brandingFitSlideImage_(image, availableWidth, c.cta.slideMaxHeightPt);
      image.setLeft(Math.max(0, (pageWidth - size.width) / 2));
      image.setTop(Math.max(0, pageHeight - size.height - c.cta.slideBottomPt));
      brandingSetSlideImageLink_(image, c.websiteUrl);
      result.ctaAdded = true;
      result.bottomReservedPt = size.height + c.cta.slideBottomPt;
    } catch (e2) { result.ctaError = e2.message; }
  }
  return result;
}

function applyBrandingToPresentation_(presentationOrId, projectOrConfig) {
  const presentation = typeof presentationOrId === 'string' ? SlidesApp.openById(presentationOrId) : presentationOrId;
  if (!presentation) throw new Error('PRESENTATION_REQUIRED');
  const results = presentation.getSlides().map(function(slide) {
    return applyBrandingToSlide_(slide, presentation, projectOrConfig);
  });
  return { success: true, count: results.length, results: results };
}

function applyBrandingToGoogleDoc_(documentOrId, projectOrConfig, options) {
  options = options || {};
  const doc = typeof documentOrId === 'string' ? DocumentApp.openById(documentOrId) : documentOrId;
  if (!doc) throw new Error('DOCUMENT_REQUIRED');
  const c = getProjectBranding_(projectOrConfig);
  const target = String(options.target || 'DOCS').toLowerCase();
  if (!c.enabled || !isBrandingEnabledForTarget_(c, target)) return { success: true, skipped: true, reason: target.toUpperCase() + '_BRANDING_DISABLED' };

  const result = { success: true, logoAdded: false, ctaAdded: false };
  if (c.docs.showLogo && c.logo.enabled && c.logo.driveFileId) {
    try {
      let header = doc.getHeader();
      if (!header) header = doc.addHeader();
      if (c.docs.replaceHeader) brandingClearContainer_(header);
      const img = header.appendImage(getLogoBlob_(c));
      brandingResizeInlineImage_(img, c.logo.docWidthPx);
      const parent = img.getParent();
      if (parent && parent.getType() === DocumentApp.ElementType.PARAGRAPH) parent.asParagraph().setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
      result.logoAdded = true;
    } catch (e) { result.logoError = e.message; }
  }

  if (c.docs.showCta && c.cta.enabled && c.cta.driveFileId) {
    try {
      let footer = doc.getFooter();
      if (!footer) footer = doc.addFooter();
      if (c.docs.replaceFooter) brandingClearContainer_(footer);
      const img = footer.appendImage(getCtaFooterBlob_(c));
      brandingResizeInlineImage_(img, c.cta.docWidthPx);
      const parent = img.getParent();
      if (parent && parent.getType() === DocumentApp.ElementType.PARAGRAPH) parent.asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      result.ctaAdded = true;
    } catch (e2) { result.ctaError = e2.message; }
  }
  if (options.saveAndClose === true) doc.saveAndClose();
  return result;
}

function applyBrandingForPdfExport_(documentOrId, projectOrConfig) {
  return applyBrandingToGoogleDoc_(documentOrId, projectOrConfig, { target: 'PDF' });
}

function applyBrandingForDocxExport_(documentOrId, projectOrConfig) {
  return applyBrandingToGoogleDoc_(documentOrId, projectOrConfig, { target: 'DOCX' });
}

function renderBrandingCss_(projectOrConfig) {
  const c = getProjectBranding_(projectOrConfig);
  return '<style>' +
    '.v32-brand-wrap{box-sizing:border-box;width:100%;max-width:' + c.html.contentMaxWidthPx + 'px;margin:0 auto}' +
    '.v32-brand-header{display:flex;justify-content:flex-end;align-items:center;margin:0 0 18px}' +
    '.v32-brand-logo{display:block;width:auto;max-width:' + c.html.logoMaxWidthPx + 'px;height:auto}' +
    '.v32-brand-cta{margin:28px 0 0;width:100%}.v32-brand-cta img{display:block;width:100%;max-width:100%;height:auto}' +
    '.v32-brand-cta-fallback{box-sizing:border-box;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:12px;padding:14px 16px;border-radius:8px;background:#0b4d7a;color:#fff;font-family:Arial,sans-serif}' +
    '.v32-brand-cta-fallback a{color:#fff;text-decoration:none;font-weight:600}.v32-brand-cta-button{display:inline-block;padding:9px 16px;border:2px solid #fff;border-radius:28px}' +
    '@media(max-width:640px){.v32-brand-header{justify-content:center}.v32-brand-cta-fallback{flex-direction:column}}' +
    '</style>';
}

function renderBrandHeaderHtml_(projectOrConfig, options) {
  options = options || {};
  const c = getProjectBranding_(projectOrConfig);
  if (!c.enabled || !c.logo.enabled) return '';
  const src = resolveBrandingImageSrc_(c.logo, options.imageMode || 'DATA_URI_ALLOWED');
  if (!src) return '';
  const url = brandingSafeUrl_(c.websiteUrl);
  let img = '<img class="v32-brand-logo" src="' + brandingEscapeHtmlAttr_(src) + '" alt="' + brandingEscapeHtmlAttr_(c.logo.altText || c.brandName) + '">';
  if (url) img = '<a href="' + brandingEscapeHtmlAttr_(url) + '" target="_blank" rel="noopener">' + img + '</a>';
  return '<header class="v32-brand-header">' + img + '</header>';
}

function renderBrandCtaFooterHtml_(projectOrConfig, options) {
  options = options || {};
  const c = getProjectBranding_(projectOrConfig);
  if (!c.enabled || !c.cta.enabled) return '';
  const src = resolveBrandingImageSrc_(c.cta, options.imageMode || 'DATA_URI_ALLOWED');
  const url = brandingSafeUrl_(c.websiteUrl);
  if (src) {
    let img = '<img src="' + brandingEscapeHtmlAttr_(src) + '" alt="' + brandingEscapeHtmlAttr_(c.cta.altText) + '">';
    if (url) img = '<a href="' + brandingEscapeHtmlAttr_(url) + '" target="_blank" rel="noopener">' + img + '</a>';
    return '<footer class="v32-brand-cta">' + img + '</footer>';
  }
  return renderBrandCtaFallbackHtml_(c);
}

function renderBrandCtaFallbackHtml_(projectOrConfig) {
  const c = getProjectBranding_(projectOrConfig);
  const parts = [];
  const url = brandingSafeUrl_(c.websiteUrl);
  if (url) parts.push('<a class="v32-brand-cta-button" href="' + brandingEscapeHtmlAttr_(url) + '" target="_blank" rel="noopener">' + brandingEscapeHtml_(c.cta.label || 'TƯ VẤN NGAY') + '</a>');
  c.phones.forEach(function(phone) {
    const tel = brandingPhoneHref_(phone);
    if (tel) parts.push('<a href="' + brandingEscapeHtmlAttr_(tel) + '">' + brandingEscapeHtml_(phone) + '</a>');
  });
  if (url) parts.push('<a href="' + brandingEscapeHtmlAttr_(url) + '" target="_blank" rel="noopener">' + brandingEscapeHtml_(brandingDisplayDomain_(url)) + '</a>');
  if (!parts.length) return '';
  return '<footer class="v32-brand-cta"><div class="v32-brand-cta-fallback">' + parts.join('<span aria-hidden="true">|</span>') + '</div></footer>';
}

function wrapHtmlWithBranding_(bodyHtml, projectOrConfig, options) {
  options = options || {};
  const c = getProjectBranding_(projectOrConfig);
  if (!c.enabled || !c.targets.html) return String(bodyHtml || '');
  const header = c.html.showLogo ? renderBrandHeaderHtml_(c, { imageMode: 'DATA_URI_ALLOWED' }) : '';
  const footer = c.html.showCta ? renderBrandCtaFooterHtml_(c, { imageMode: 'DATA_URI_ALLOWED' }) : '';
  const fragment = renderBrandingCss_(c) + '<div class="v32-brand-wrap">' + header + '<main class="v32-brand-content">' + String(bodyHtml || '') + '</main>' + footer + '</div>';
  if (options.fullDocument !== true) return fragment;
  const title = String(options.title || c.brandName || '');
  return '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + brandingEscapeHtml_(title) + '</title></head><body>' + fragment + '</body></html>';
}

function isBrandingEnabledForTarget_(projectOrConfig, target) {
  const c = getProjectBranding_(projectOrConfig);
  if (!c.enabled) return false;
  target = String(target || '').toLowerCase();
  return Object.prototype.hasOwnProperty.call(c.targets, target) ? !!c.targets[target] : false;
}

function brandingResizeSlideImageByWidth_(image, targetWidth) {
  const ow = image.getWidth();
  const oh = image.getHeight();
  if (!ow || !oh) return { width: targetWidth, height: 0 };
  const h = targetWidth * (oh / ow);
  image.setWidth(targetWidth); image.setHeight(h);
  return { width: targetWidth, height: h };
}

function brandingFitSlideImage_(image, maxWidth, maxHeight) {
  const ow = image.getWidth();
  const oh = image.getHeight();
  if (!ow || !oh) return { width: 0, height: 0 };
  const scale = Math.min(maxWidth / ow, maxHeight > 0 ? maxHeight / oh : maxWidth / ow);
  const width = ow * scale;
  const height = oh * scale;
  image.setWidth(width); image.setHeight(height);
  return { width: width, height: height };
}

function brandingSetSlideImageLink_(image, url) {
  url = brandingSafeUrl_(url);
  if (!url || !image) return;
  try { if (typeof image.setLinkUrl === 'function') image.setLinkUrl(url); } catch (ignore) {}
}

function brandingResizeInlineImage_(image, targetWidth) {
  if (!image) return;
  const ow = image.getWidth();
  const oh = image.getHeight();
  if (!ow || !oh) return;
  image.setWidth(Math.round(targetWidth));
  image.setHeight(Math.round(targetWidth * (oh / ow)));
}

function brandingClearContainer_(container) {
  if (!container) return;
  while (container.getNumChildren() > 0) container.removeChild(container.getChild(0));
}

function brandingBool_(value, fallback) {
  if (value === true || value === false) return value;
  return !!fallback;
}

function brandingNumber_(value, fallback) {
  const n = Number(value);
  return isNaN(n) || !isFinite(n) ? (Number(fallback) || 0) : n;
}

function brandingFirstNonEmpty_(values) {
  values = Array.isArray(values) ? values : [];
  for (let i = 0; i < values.length; i++) {
    if (values[i] !== null && values[i] !== undefined && String(values[i]).trim()) return String(values[i]).trim();
  }
  return '';
}

function brandingNormalizePhones_(input) {
  const values = Array.isArray(input) ? input : [input];
  const out = [];
  const seen = {};
  values.forEach(function(v) {
    if (v === null || v === undefined) return;
    const p = String(v).trim();
    if (p && !seen[p]) { seen[p] = true; out.push(p); }
  });
  return out;
}

function brandingPhoneHref_(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  const prefix = raw.charAt(0) === '+' ? '+' : '';
  const digits = raw.replace(/[^0-9]/g, '');
  return digits ? 'tel:' + prefix + digits : '';
}

function brandingExtractDriveFileId_(value) {
  value = String(value || '').trim();
  if (!value) return '';
  if (/^[A-Za-z0-9_-]{15,}$/.test(value)) return value;
  const patterns = [/\/d\/([A-Za-z0-9_-]{15,})/, /[?&]id=([A-Za-z0-9_-]{15,})/, /\/folders\/([A-Za-z0-9_-]{15,})/];
  for (let i = 0; i < patterns.length; i++) {
    const m = value.match(patterns[i]);
    if (m && m[1]) return m[1];
  }
  const g = value.match(/([A-Za-z0-9_-]{20,})/);
  return g && g[1] ? g[1] : '';
}

function brandingSafeUrl_(url) {
  url = String(url || '').trim();
  return brandingIsSafeHttpUrl_(url) ? url : '';
}

function brandingIsSafeHttpUrl_(url) {
  return /^https?:\/\/[^\s]+$/i.test(String(url || '').trim());
}

function brandingDisplayDomain_(url) {
  return String(url || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '');
}

function brandingEscapeHtml_(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function brandingEscapeHtmlAttr_(value) { return brandingEscapeHtml_(value); }

function brandingCopyBlob_(blob) {
  if (!blob) return null;
  try { if (typeof blob.copyBlob === 'function') return blob.copyBlob(); } catch (ignore) {}
  return Utilities.newBlob(blob.getBytes(), blob.getContentType(), blob.getName());
}

function brandingDeepClone_(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}
