/** GES V4.6.7.1 smoke tests for flat Vietnamese Google Docs resource footer. */

function runDocumentResourceFooterV466SmokeTests() {
  var results = [];
  function test(name, fn) {
    try { results.push({ name: name, success: true, detail: fn() }); }
    catch (e) { results.push({ name: name, success: false, detail: safeString_(e && e.message || e) }); }
  }

  test('Resource footer schema V4.6.7.1', function() {
    var s = getDocumentResourceFooterSchemaV466();
    if (s.version !== '4.6.7.1') throw new Error('BAD_VERSION');
    if (!s.canonicalContentExcluded) throw new Error('CANONICAL_EXCLUSION_DISABLED');
    if (s.derivedOutputsIncluded) throw new Error('DERIVED_OUTPUTS_SHOULD_BE_FALSE');
    return s;
  });

  test('Generated marker detection', function() {
    if (!isGesGeneratedResourceFooterMarkerTextV466_('x ' + GES_DOCUMENT_RESOURCE_FOOTER_V466.MARKER + ' y')) throw new Error('MARKER_NOT_DETECTED');
    if (isGesGeneratedResourceFooterMarkerTextV466_('normal article text')) throw new Error('FALSE_POSITIVE_MARKER');
    return { marker: GES_DOCUMENT_RESOURCE_FOOTER_V466.MARKER };
  });

  test('URL dedupe keeps each public URL once', function() {
    var rows = dedupeDocumentResourceLinksV466_([
      { label: 'Example', url: 'https://example.com/a/view' },
      { label: 'Duplicate label ignored by URL identity', url: 'https://example.com/a/view' },
      { label: 'Example preview', url: 'https://example.com/a/preview' }
    ]);
    if (rows.length !== 2) throw new Error('DEDUPE_EXPECTED_2_GOT_' + rows.length);
    return { rows: rows.length };
  });

  test('Variant label uses pure Display Name', function() {
    var label = formatDocumentVariantLabelV466_({ assetType: 'SLIDES', variantType: 'slide preview', anchorName: 'Example Display Name' });
    if (label !== 'Example Display Name') throw new Error('DISPLAY_NAME_NOT_PURE:' + label);
    return { label: label };
  });

  test('Vietnamese fixed labels installed', function() {
    if (GES_DOCUMENT_RESOURCE_FOOTER_V466.TITLE !== 'NGUỒN THAM KHẢO THÊM') throw new Error('BAD_TITLE');
    if (GES_DOCUMENT_RESOURCE_FOOTER_V466.CONTACT_TITLE !== 'LIÊN HỆ') throw new Error('BAD_CONTACT_TITLE');
    if (GES_DOCUMENT_RESOURCE_FOOTER_V466.WEBSITE_TITLE !== 'Website') throw new Error('BAD_WEBSITE_TITLE');
    if (GES_DOCUMENT_RESOURCE_FOOTER_V466.INTRO.indexOf('Danh sách') !== 0) throw new Error('BAD_INTRO');
    return true;
  });

  test('Flat renderer helper installed', function() {
    var flat = flattenDocumentResourceLinksV4671_({
      projectLinks:[{label:'A',url:'https://a.example'}],
      folders:[{label:'B',url:'https://b.example'}],
      docVariants:[{label:'A duplicate URL',url:'https://a.example'}],
      projectAssets:[],calendarEvents:[],googleProducts:[]
    });
    if (flat.length !== 2) throw new Error('FLAT_DEDUPE_EXPECTED_2_GOT_' + flat.length);
    return { rows: flat.length };
  });

  test('Build Queue integration installed', function() {
    if (typeof syncProjectDocumentResourceFootersV466_ !== 'function') throw new Error('SYNC_MODULE_MISSING');
    if (typeof previewActiveDocumentResourceFootersV466 !== 'function') throw new Error('PREVIEW_API_MISSING');
    return { installed: true };
  });

  var out = {
    success: results.every(function(r) { return r.success; }),
    version: '4.6.7.1',
    liveDriveWritesExecuted: false,
    results: results
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/** Read-only live preview against the active project. */
function runDocumentResourceFooterV466LivePreview() {
  return previewActiveDocumentResourceFootersV466();
}
