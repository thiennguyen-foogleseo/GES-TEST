/**
 * GES V4.6.8 smoke tests — no Drive writes and no external network calls.
 */

function runSelectiveSyncQueueV468SmokeTests() {
  var results = [];

  function add(name, success, detail) {
    results.push({ name: name, success: !!success, detail: detail || {} });
  }

  var schema = getSelectiveSyncQueueSchemaV468();
  add(
    'V4.6.8 selective queue schema',
    schema.version === '4.6.8' &&
      schema.resumable === true &&
      schema.autoContinuation === true &&
      schema.oneDocResourceJobPerSourceDoc === true &&
      schema.oneOutputResourceJobPerAsset === true,
    schema
  );

  var expectedModes = [
    'BUILD_COMPLETE',
    'CREATE_MISSING',
    'SYNC_CHANGED',
    'DOC_RESOURCE',
    'OUTPUT_RESOURCE',
    'SELECTED_SYNC'
  ];
  add(
    'All batch modes share the same queue',
    expectedModes.every(function(m) { return schema.modes.indexOf(m) !== -1; }),
    { modes: schema.modes }
  );

  add(
    'Heavy job classifier',
    isHeavyBuildQueueJobV468_({ k: 'ASSET_SYNC', a: 'PDF' }) === true &&
      isHeavyBuildQueueJobV468_({ k: 'ASSET_CREATE', a: 'DOCX' }) === true &&
      isHeavyBuildQueueJobV468_({ k: 'OUTPUT_RESOURCE_FOOTER', a: 'PDF' }) === true &&
      isHeavyBuildQueueJobV468_({ k: 'ASSET_SYNC', a: 'HTML' }) === false,
    {}
  );

  add(
    'Heavy jobs require a fresh slice',
    minimumRemainingForBuildQueueJobV468_({ k: 'ASSET_SYNC', a: 'PDF' }) >
      minimumRemainingForBuildQueueJobV468_({ k: 'ASSET_SYNC', a: 'HTML' }),
    {
      heavyMs: minimumRemainingForBuildQueueJobV468_({ k: 'ASSET_SYNC', a: 'PDF' }),
      lightMs: minimumRemainingForBuildQueueJobV468_({ k: 'ASSET_SYNC', a: 'HTML' })
    }
  );

  var longJson = new Array(12001).join('x');
  var chunks = splitBuildQueueStringV468_(longJson, 2500);
  add(
    'Large queue state sharding',
    chunks.length === 5 && chunks.join('') === longJson,
    { chunkCount: chunks.length, chars: longJson.length }
  );

  var out = {
    success: results.every(function(r) { return r.success; }),
    version: '4.6.8',
    liveDriveWritesExecuted: false,
    results: results
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
