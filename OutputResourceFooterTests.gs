/** Smoke tests for GES V4.6.7.1 unified output resource footer. */
function runOutputResourceFooterV467SmokeTests() {
  var results = [];
  function t(name, fn) {
    try { var d = fn(); results.push({ name: name, success: true, detail: d === undefined ? true : d }); }
    catch (e) { results.push({ name: name, success: false, detail: e.message || String(e) }); }
  }
  t('V4.6.7.1 schema installed', function() {
    var s = getOutputResourceFooterSchemaV467();
    if (s.version !== '4.6.7.1') throw new Error('BAD_VERSION');
    if (s.outputs.join(',') !== 'SLIDES,PDF,DOCX,HTML') throw new Error('BAD_OUTPUTS');
    return s;
  });
  t('HTML footer markers installed', function() {
    var html = '<html><body><p>A</p></body></html>';
    var model = { projectLinks:[{label:'A',url:'https://example.com'}], folders:[],docVariants:[],projectAssets:[],calendarEvents:[],googleProducts:[],contact:{} };
    var section = renderOutputResourceFooterHtmlV467_(model);
    if (section.indexOf(GES_OUTPUT_RESOURCE_FOOTER_V467.HTML_START) < 0) throw new Error('NO_HTML_START');
    if (section.indexOf('href="https://example.com"') < 0) throw new Error('NO_HTML_LINK');
    if (section.indexOf('NGUỒN THAM KHẢO THÊM') < 0) throw new Error('NO_VI_RESOURCE_TITLE');
    if (removeOutputResourceFooterHtmlV467_(html + section).indexOf(section) >= 0) throw new Error('HTML_REMOVE_FAILED');
    return true;
  });
  t('Fingerprint deterministic', function() {
    var m = { projectId:'p',docId:'d',projectLinks:[{label:'B',url:'https://b.example'},{label:'A',url:'https://a.example'}],folders:[],docVariants:[],projectAssets:[],calendarEvents:[],googleProducts:[],contact:{} };
    var a = computeOutputResourceFingerprintV467_(m);
    m.projectLinks.reverse();
    var b = computeOutputResourceFingerprintV467_(m);
    if (!a || a !== b) throw new Error('NON_DETERMINISTIC');
    return a;
  });
  t('V4.6.6 source footer dependency available', function() {
    if (typeof collectDocumentResourceFooterModelV466_ !== 'function') throw new Error('V466_MODEL_MISSING');
    if (typeof appendDocumentResourceFooterV466_ !== 'function') throw new Error('V466_WRITER_MISSING');
    return true;
  });
  return { success: results.every(function(x){return x.success;}), version:'4.6.7.1', liveDriveWritesExecuted:false, results:results };
}
