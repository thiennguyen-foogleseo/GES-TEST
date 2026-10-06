/** Shared helpers. */

function nowIso_() {
  return new Date().toISOString();
}

function safeString_(value) {
  return value === null || value === undefined ? '' : String(value);
}

function extractDriveId_(value) {
  const s = safeString_(value).trim();
  if (!s) return '';
  // Accept raw Google IDs and common Drive/Docs URLs.
  const matches = s.match(/[-\w]{20,}/g);
  return matches && matches.length ? matches[matches.length - 1] : '';
}

function normalizeUrl_(value) {
  return safeString_(value).trim();
}

function randomId_(prefix) {
  return (prefix || '') + Utilities.getUuid().replace(/-/g, '');
}

function sha256Hex_(value) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    safeString_(value),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(b) {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function jsonParseSafe_(value, fallback) {
  try { return JSON.parse(value); } catch (e) { return fallback; }
}

function cloneJson_(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function uniqueBy_(items, keyFn) {
  const map = {};
  (items || []).forEach(function(item) {
    map[keyFn(item)] = item;
  });
  return Object.keys(map).map(function(key) { return map[key]; });
}

function getScriptProps_() {
  return PropertiesService.getScriptProperties();
}

function apiFetchJson_(url, options) {
  const opts = Object.assign({
    muteHttpExceptions: true,
    headers: {}
  }, options || {});
  opts.headers = Object.assign({}, opts.headers || {}, {
    Authorization: 'Bearer ' + ScriptApp.getOAuthToken()
  });
  const response = UrlFetchApp.fetch(url, opts);
  const code = response.getResponseCode();
  const text = response.getContentText();
  const data = text ? jsonParseSafe_(text, { raw: text }) : {};
  if (code < 200 || code >= 300) {
    const message = data && data.error && data.error.message ? data.error.message : text;
    const err = new Error('HTTP ' + code + ': ' + message);
    err.httpCode = code;
    err.responseData = data;
    throw err;
  }
  return data;
}

function makeResult_(success, code, message, extra) {
  return Object.assign({
    success: !!success,
    code: code || '',
    message: message || ''
  }, extra || {});
}

function logEvent_(projectId, action, payload) {
  const entry = {
    timestamp: nowIso_(),
    projectId: projectId || '',
    action: action || '',
    payload: payload || {}
  };
  console.log(JSON.stringify(entry));
  try {
    appendRegistryLog_(projectId, entry);
  } catch (e) {
    console.log('Registry log unavailable: ' + e.message);
  }
  return entry;
}

function htmlEscape_(value) {
  return safeString_(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHtml_(html) {
  return safeString_(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeName_(name) {
  return safeString_(name).replace(/\s+/g, ' ').trim();
}
