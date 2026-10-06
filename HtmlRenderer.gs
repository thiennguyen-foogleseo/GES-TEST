/** Semantic HTML renderer shared by GES HTML export. Branding aware. */

function renderDocumentModelToHtml_(model, project, options) {
  options = options || {};
  const warnings = (model.warnings || []).slice();
  const parts = [];
  let listStack = [];

  function closeListsTo_(level) {
    while (listStack.length > level) parts.push('</' + listStack.pop() + '>');
  }

  model.blocks.forEach(function(block) {
    if (block.type !== 'listItem') closeListsTo_(0);

    if (block.type === 'title') {
      if (options.includeTitleInBody !== false) parts.push('<h1>' + renderRunsHtml_(block.runs, warnings) + '</h1>');
    }
    else if (block.type === 'heading') {
      const level = Math.max(1, Math.min(6, Number(block.level || 2)));
      parts.push('<h' + level + '>' + renderRunsHtml_(block.runs, warnings) + '</h' + level + '>');
    }
    else if (block.type === 'paragraph') {
      parts.push('<p>' + renderRunsHtml_(block.runs, warnings) + '</p>');
    }
    else if (block.type === 'listItem') {
      const desiredDepth = Math.max(0, Number(block.nestingLevel || 0)) + 1;
      const tag = block.ordered ? 'ol' : 'ul';
      while (listStack.length < desiredDepth) {
        listStack.push(tag);
        parts.push('<' + tag + '>');
      }
      while (listStack.length > desiredDepth) parts.push('</' + listStack.pop() + '>');
      if (listStack.length && listStack[listStack.length - 1] !== tag) {
        parts.push('</' + listStack.pop() + '>');
        listStack.push(tag);
        parts.push('<' + tag + '>');
      }
      parts.push('<li>' + renderRunsHtml_(block.runs, warnings) + '</li>');
    }
    else if (block.type === 'table') {
      parts.push(renderTableHtml_(block));
    }
    else if (block.type === 'horizontalRule') {
      parts.push('<hr>');
    }
  });
  closeListsTo_(0);

  const body = sanitizeGeneratedHtml_(parts.join('\n'));
  const title = htmlEscape_(model.title || project.brandName || 'Document');
  const branding = getProjectBranding_(project);
  const brandingEnabled = branding.enabled && branding.targets.html;

  let brandHeader = '';
  let brandFooter = '';
  let brandCss = '';
  if (brandingEnabled) {
    brandCss = renderBrandingCss_(branding);
    if (branding.html.showLogo) brandHeader = renderBrandHeaderHtml_(branding, { imageMode: 'DATA_URI_ALLOWED' });
    if (branding.html.showCta) brandFooter = renderBrandCtaFooterHtml_(branding, { imageMode: 'DATA_URI_ALLOWED' });
  } else if (options.includeBrandFooter !== false) {
    brandFooter = renderBrandFooter_(project);
  }

  const baseCss = '<style>' +
    'body{font-family:Arial,sans-serif;line-height:1.65;color:#202124;margin:0;padding:24px}' +
    'main{max-width:920px;margin:0 auto}' +
    'img{max-width:100%;height:auto}.table-scroll{overflow-x:auto}' +
    'table{border-collapse:collapse;width:100%}td,th{padding:8px;border-bottom:1px solid #ddd;vertical-align:top}' +
    'a{overflow-wrap:anywhere}.v3-image-placeholder{padding:14px;background:#f3f4f6;border-radius:8px;color:#5f6368}' +
    'footer{margin-top:36px;padding-top:16px;color:#5f6368;font-size:13px}' +
    '</style>';

  const content = brandingEnabled
    ? '<div class="v32-brand-wrap">' + brandHeader + '<main class="v32-brand-content">' + body + '</main>' + brandFooter + '</div>'
    : '<main>' + body + brandFooter + '</main>';

  const full = [
    '<!doctype html>',
    '<html lang="vi">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>' + title + '</title>',
    baseCss,
    brandCss,
    '</head>',
    '<body>',
    content,
    '</body>',
    '</html>'
  ].join('\n');

  return {
    fullHtml: full,
    bodyHtml: body,
    brandedBodyHtml: brandingEnabled ? brandHeader + body + brandFooter : body + brandFooter,
    warnings: uniqueBy_(warnings, function(x) { return x; })
  };
}

function renderRunsHtml_(runs, warnings) {
  return (runs || []).map(function(run) {
    if (run.type === 'image') {
      warnings.push('INLINE_IMAGE_PLACEHOLDER');
      const alt = htmlEscape_(run.altDescription || run.altTitle || 'Ảnh trong Google Docs');
      return '<span class="v3-image-placeholder" data-image-key="' + htmlEscape_(run.imageKey) + '">[Ảnh: ' + alt + ']</span>';
    }
    let text = htmlEscape_(run.text || '');
    if (!text) return '';
    if (run.bold) text = '<strong>' + text + '</strong>';
    if (run.italic) text = '<em>' + text + '</em>';
    if (run.underline) text = '<u>' + text + '</u>';
    const url = sanitizeLinkUrl_(run.linkUrl || '');
    if (url) text = '<a href="' + htmlEscape_(url) + '">' + text + '</a>';
    return text;
  }).join('');
}

function renderTableHtml_(block) {
  const rows = block.rows || [];
  const body = rows.map(function(row) {
    return '<tr>' + row.map(function(cell) {
      return '<td>' + htmlEscape_(cell.text || '') + '</td>';
    }).join('') + '</tr>';
  }).join('');
  return '<div class="table-scroll"><table><tbody>' + body + '</tbody></table></div>';
}

function sanitizeLinkUrl_(url) {
  const s = safeString_(url).trim();
  if (!s) return '';
  if (/^(https?:|mailto:|tel:)/i.test(s)) return s;
  return '';
}

function sanitizeGeneratedHtml_(html) {
  let out = safeString_(html);
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  out = out.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  out = out.replace(/href\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, 'href="#"');
  return out;
}

function renderBrandFooter_(project) {
  if (!project || (!project.brandName && !project.websiteUrl)) return '';
  const label = htmlEscape_(project.brandName || project.websiteUrl);
  const url = sanitizeLinkUrl_(project.websiteUrl || '');
  return '<footer>Nguồn: ' + (url ? '<a href="' + htmlEscape_(url) + '">' + label + '</a>' : label) + '</footer>';
}
