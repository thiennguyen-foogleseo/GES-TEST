/** Resolve existing derivative assets without creating duplicates. */

function fileMatchesAssetType_(file, assetType) {
  return file.getMimeType() === getAssetMime_(assetType);
}

function getLegacyOutputNames_(docFile, assetType) {
  const names = [getExpectedOutputName_(docFile, assetType)];
  if (assetType === 'SLIDES') names.push(docFile.getName() + ' - Google Slides');
  return names;
}

function findFilesByPredicateInFolder_(folder, predicate) {
  const out = [];
  const it = folder.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    try { if (predicate(f)) out.push(f); } catch (e) {}
  }
  return out;
}

function resolveAssetForDoc_(project, docFile, assetType) {
  const targetFolder = getOutputFolderByAssetType_(project, assetType);
  const root = getProjectRoot_(project);
  const docId = docFile.getId();
  const reg = getAssetRegistry_(project.projectId, docId, assetType);

  // 1) Registered File ID.
  if (reg && reg.fileId) {
    try {
      const f = DriveApp.getFileById(reg.fileId);
      if (!f.isTrashed() && fileMatchesAssetType_(f, assetType)) {
        return buildResolved_(f, 'REGISTRY_ID', targetFolder);
      }
    } catch (e) {}
  }

  // 2) V3 source markers in target folder + root for legacy placement.
  let candidates = [];
  [targetFolder, root].forEach(function(folder) {
    candidates = candidates.concat(findFilesByPredicateInFolder_(folder, function(f) {
      return fileMatchesAssetType_(f, assetType) && assetMatchesV3Marker_(f, project, docId, assetType);
    }));
  });
  candidates = uniqueBy_(candidates, function(f) { return f.getId(); });
  if (candidates.length === 1) {
    const markerMeta = readV3Meta_(candidates[0].getDescription() || '');
    const markerSyncMs = Number(markerMeta.SOURCE_MODIFIED_AT_SYNC_MS || 0) || candidates[0].getLastUpdated().getTime();
    saveAssetRegistry_(project, docFile, assetType, candidates[0], {
      resolutionMethod: 'V3_MARKER_RECOVERY',
      sourceModifiedAtSyncMs: markerSyncMs,
      sourceModifiedAtSync: new Date(markerSyncMs).toISOString(),
      rendererVersion: markerMeta.RENDERER_VERSION || (assetType === 'HTML' ? V3_CONFIG.HTML_RENDERER_VERSION : ''),
      brandingFingerprint: markerMeta.BRANDING_FINGERPRINT || ''
    });
    return buildResolved_(candidates[0], 'V3_MARKER', targetFolder);
  }
  if (candidates.length > 1) return ambiguousResolved_(candidates, 'V3_MARKER_DUPLICATE', targetFolder);

  // 3) Legacy V2 description markers.
  candidates = [];
  [targetFolder, root].forEach(function(folder) {
    candidates = candidates.concat(findFilesByPredicateInFolder_(folder, function(f) {
      return fileMatchesAssetType_(f, assetType) && assetMatchesV2Marker_(f, docId, assetType);
    }));
  });
  candidates = uniqueBy_(candidates, function(f) { return f.getId(); });
  if (candidates.length === 1) return buildResolved_(candidates[0], 'V2_MARKER', targetFolder, true);
  if (candidates.length > 1) return ambiguousResolved_(candidates, 'V2_MARKER_DUPLICATE', targetFolder);

  // 4) Exact-name fallback. Only auto-resolve if unique in target/root.
  const names = getLegacyOutputNames_(docFile, assetType);
  candidates = [];
  [targetFolder, root].forEach(function(folder) {
    names.forEach(function(name) {
      const it = folder.getFilesByName(name);
      while (it.hasNext()) {
        const f = it.next();
        if (fileMatchesAssetType_(f, assetType)) candidates.push(f);
      }
    });
  });
  candidates = uniqueBy_(candidates, function(f) { return f.getId(); });
  if (candidates.length === 1) return buildResolved_(candidates[0], 'NAME_FALLBACK', targetFolder, true);
  if (candidates.length > 1) return ambiguousResolved_(candidates, 'NAME_DUPLICATE', targetFolder);

  return {
    file: null,
    ambiguous: false,
    candidates: [],
    method: 'NONE',
    targetFolderId: targetFolder.getId(),
    targetFolderName: targetFolder.getName(),
    needsPlacement: false,
    legacy: false
  };
}

function buildResolved_(file, method, targetFolder, legacy) {
  return {
    file: file,
    ambiguous: false,
    candidates: [file.getId()],
    method: method,
    targetFolderId: targetFolder.getId(),
    targetFolderName: targetFolder.getName(),
    needsPlacement: !isFileDirectlyInFolder_(file, targetFolder),
    legacy: !!legacy
  };
}

function ambiguousResolved_(files, method, targetFolder) {
  return {
    file: null,
    ambiguous: true,
    candidates: files.map(function(f) { return f.getId(); }),
    duplicateCount: files.length,
    method: method,
    targetFolderId: targetFolder.getId(),
    targetFolderName: targetFolder.getName(),
    needsPlacement: false,
    legacy: false
  };
}

function getAssetState_(project, docFile, assetType) {
  const resolved = resolveAssetForDoc_(project, docFile, assetType);
  const status = computeAssetStatus_(project, docFile, assetType, resolved);
  const file = resolved.file;
  return {
    type: assetType,
    status: status,
    duplicateCount: resolved.duplicateCount || 0,
    targetFolderName: resolved.targetFolderName || '',
    needsPlacement: !!resolved.needsPlacement,
    resolutionMethod: resolved.method || '',
    legacy: !!resolved.legacy,
    id: file ? file.getId() : '',
    name: file ? file.getName() : '',
    url: file ? file.getUrl() : '',
    updated: file ? file.getLastUpdated().toISOString() : ''
  };
}
