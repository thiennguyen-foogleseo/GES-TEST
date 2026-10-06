/** Non-destructive tests for GES V4.6.5 Extended Google Assets. */
function runExtendedGoogleAssetsV465SmokeTests() {
  var results=[];
  function check(name,fn){try{results.push({name:name,success:true,detail:fn()});}catch(e){results.push({name:name,success:false,detail:safeString_(e&&e.message||e)});}}

  check('V4.6.5 schema installed', function(){
    if (typeof normalizeExtendedGoogleAssetsV465_ !== 'function') throw new Error('NORMALIZER_MISSING');
    if (GES_EXTENDED_GOOGLE_ASSETS_V465.VERSION !== '4.6.5') throw new Error('VERSION_MISMATCH');
    return {version:GES_EXTENDED_GOOGLE_ASSETS_V465.VERSION,tab:GES_EXTENDED_GOOGLE_ASSETS_V465.REGISTRY_TAB};
  });

  check('Manual Google product URLs normalize into descriptors', function(){
    var p={projectId:'prj_test',projectName:'Example',projectKeyword:'Example Keyword',extendedGoogleAssets:{
      notebookLmPublicUrl:'https://notebooklm.google.com/notebook/test',
      googleMyMapsUrl:'https://www.google.com/maps/d/viewer?mid=test',
      googleSitesUrl:'https://sites.google.com/view/example',
      googleAiStudioUrl:'https://example.ai.studio',
      googleColabUrl:'https://colab.research.google.com/drive/test'
    }};
    var rows=getExtendedGoogleAssetDescriptorsV465_(p);
    if (rows.length !== 5) throw new Error('DESCRIPTOR_COUNT_EXPECTED_5_GOT_'+rows.length);
    var notebook=rows.filter(function(x){return x.assetType==='EXT_GOOGLE_NOTEBOOKLM';})[0];
    if (!notebook || notebook.visibilityClass!=='GOOGLE_ACCOUNT_REQUIRED') throw new Error('NOTEBOOKLM_VISIBILITY_MISMATCH');
    return {count:rows.length,notebookVisibility:notebook.visibilityClass};
  });

  check('Google Drawing accepts File ID or URL', function(){
    var x=normalizeExtendedGoogleAssetsV465_({googleDrawingFileIdOrUrl:'1AbCdEfGhIjKlMnOpQrStUvWxYz123456'});
    if (!x.googleDrawingFileId) throw new Error('DRAWING_FILE_ID_NOT_CAPTURED');
    if (x.googleDrawingUrl.indexOf('/drawings/d/')===-1) throw new Error('DRAWING_URL_NOT_DERIVED');
    return {fileId:x.googleDrawingFileId,url:x.googleDrawingUrl};
  });

  check('Project Config extended keys installed', function(){
    var rows=getExtendedGoogleAssetProjectConfigRowsV465_({projectId:'p',projectName:'P',projectKeyword:'P',extendedGoogleAssets:{notebookLmPublicUrl:'https://notebooklm.google.com/notebook/test'}});
    var map={}; rows.forEach(function(r){map[r[0]]=r[1];});
    getExtendedGoogleAssetVerificationKeysV465_().forEach(function(k){if (!Object.prototype.hasOwnProperty.call(map,k)) throw new Error('MISSING_KEY_'+k);});
    return {keys:getExtendedGoogleAssetVerificationKeysV465_().length};
  });

  check('Public projection can include extended assets without Registry mutation', function(){
    var p={projectId:'p',projectName:'P',projectKeyword:'P',targetPageUrl:'',registrySheetId:'',folders:{},extendedGoogleAssets:{
      notebookLmPublicUrl:'https://notebooklm.google.com/notebook/test',
      appsScriptWebAppUrl:'https://script.google.com/macros/s/test/exec'
    }};
    var projection=buildUnifiedPublicAssetsProjectionV44_(p);
    var urls=projection.map(function(r){return r[3];});
    if (urls.indexOf('https://notebooklm.google.com/notebook/test')===-1) throw new Error('NOTEBOOKLM_NOT_PROJECTED');
    if (urls.indexOf('https://script.google.com/macros/s/test/exec')===-1) throw new Error('APPS_SCRIPT_NOT_PROJECTED');
    return {projected:2};
  });

  var success=results.every(function(r){return r.success;});
  var out={success:success,version:'4.6.5',liveCallsExecuted:false,results:results};
  Logger.log(JSON.stringify(out,null,2));
  return out;
}
