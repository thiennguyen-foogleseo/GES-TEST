/**
 * GES V4.4 - Unified Public Project Sheet schema.
 *
 * The Public Project Sheet is a PUBLIC projection only. It is NOT the source
 * of truth for the GES engine. The private Asset Registry remains authoritative.
 *
 * Public managed tabs:
 *   - Assets  : unified project assets + all AVAILABLE URL variants
 *   - Content : all direct Google Docs in Articles (Option B)
 *
 * Retired public projection tabs are removed after a successful render:
 *   - URL Variants
 *   - Calendar Events
 *   - GES Assets
 */

const GES_PUBLIC_SHEET_V43 = Object.freeze({
  VERSION: '1.1.0-unified-assets',
  ASSET_SCHEMA_VERSION: 'PROJECT_PUBLIC_SHEET_V2_UNIFIED',
  TABS: Object.freeze({
    ASSETS: 'Assets',
    CONTENT: 'Content'
  }),
  GENERATED_TABS: Object.freeze(['Assets', 'Content']),
  RETIRED_PUBLIC_TABS: Object.freeze(['URL Variants', 'Calendar Events', 'GES Assets']),
  MAX_CELL_CHARS: 45000,
  ASSETS_HEADERS: Object.freeze([
    'Asset Type/ Variant Type',
    'Name',
    'QR',
    'URL',
    'Display Name',
    'Date',
    'TinyURL',
    'CleanURI',
    'Last Updated'
  ]),
  CONTENT_HEADERS: Object.freeze([
    'Type','Document','Content','HTML','Source URL','Target URL','Canonical','Modified At','Chunk','Chunks'
  ])
});

/** Public: read-only schema contract for UI/tests. */
function getPublicProjectSheetSchemaV43() {
  return {
    version: GES_PUBLIC_SHEET_V43.VERSION,
    assetSchemaVersion: GES_PUBLIC_SHEET_V43.ASSET_SCHEMA_VERSION,
    tabs: GES_PUBLIC_SHEET_V43.GENERATED_TABS.slice(),
    retiredPublicTabs: GES_PUBLIC_SHEET_V43.RETIRED_PUBLIC_TABS.slice(),
    maxCellChars: GES_PUBLIC_SHEET_V43.MAX_CELL_CHARS,
    headers: {
      assets: GES_PUBLIC_SHEET_V43.ASSETS_HEADERS.slice(),
      content: GES_PUBLIC_SHEET_V43.CONTENT_HEADERS.slice()
    },
    sourceOfTruth: 'PRIVATE_ASSET_REGISTRY',
    publicProjectionOnly: true,
    mergePolicy: 'ASSETS_PLUS_URL_VARIANTS',
    publicRegistryExposure: 'DENY_PRIVATE_REGISTRY'
  };
}
