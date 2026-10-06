/**
 * GES V4 - Entity Profile builder/manager (G1 read-only layer).
 *
 * Builds a canonical Entity Profile from the existing V3.2 Project Profile.
 * It DOES NOT save or upgrade the Project Profile. V3 flat aliases remain the
 * source of truth during G1 shadow-mode compatibility.
 */

/**
 * Public: build an Entity Profile for projectId, or active project when omitted.
 */
function buildEntityProfileV4(projectId) {
  var project = resolveEntityProjectV4_(projectId);
  var seed = project.entityProfile ? normalizeEntityProfileV4_(project.entityProfile) : normalizeEntityProfileV4_({});
  var branding = resolveEntityBrandingV4_(project);

  var projectName = normalizeName_(project.projectName || project.brandName || project.rootFolderName || '');
  var projectType = safeString_(project.projectType || 'OTHER').toUpperCase();
  var targetPageUrl = normalizeUrl_(project.targetPageUrl || '');
  var websiteUrl = normalizeUrl_(branding.websiteUrl || project.websiteUrl || seed.organization.websiteUrl || '');
  var canonicalUrl = targetPageUrl || (projectType === 'HOMEPAGE' || projectType === 'BRAND' ? websiteUrl : seed.primaryEntity.canonicalUrl);
  var brandName = normalizeName_(branding.brandName || project.brandName || seed.organization.brandName || projectName);
  var logoId = extractDriveId_((branding.logo && branding.logo.driveFileId) || project.logoFileId || seed.organization.logo.driveFileId || '');
  var logoPublicUrl = normalizeUrl_((branding.logo && branding.logo.publicUrl) || seed.organization.logo.publicUrl || '');
  var phones = normalizePhonesEntityV4_((branding.phones && branding.phones.length) ? branding.phones : [project.phone, project.phone2]);
  var email = safeString_(branding.email || project.email || seed.contact.email || '').trim();
  var address = safeString_(branding.address || project.address || seed.contact.address || '').trim();
  var mapsUrl = normalizeUrl_(project.googleMapsUrl || seed.location.googleMapsUrl || '');
  var sitesUrl = normalizeUrl_(project.googleSitesUrl || findSameAsUrlEntityV4_(seed.sameAs, 'GOOGLE_SITES') || '');
  var language = resolveEntityLanguageV4_(project, seed);

  var sameAs = mergeSameAsEntityV4_(seed.sameAs, [
    { type: 'GOOGLE_SITES', url: sitesUrl },
    { type: 'GOOGLE_MAPS', url: mapsUrl }
  ]);

  var primaryType = mapProjectTypeToPrimaryEntityV4_(projectType);
  var relationships = mergeRelationshipsEntityV4_(seed.relationships, defaultEntityRelationshipsV4_(primaryType));

  var profile = {
    schemaVersion: GES_ENTITY_PROFILE_SCHEMA_V4.VERSION,
    profileId: safeString_(seed.profileId || ('ent_' + safeString_(project.projectId || ''))),
    projectId: safeString_(project.projectId || ''),
    primaryEntity: {
      id: 'primary',
      type: primaryType,
      subtype: projectType,
      name: projectName || seed.primaryEntity.name,
      canonicalUrl: canonicalUrl,
      alternateNames: seed.primaryEntity.alternateNames || [],
      description: seed.primaryEntity.description || '',
      language: language
    },
    organization: {
      id: 'organization',
      brandName: brandName,
      legalName: seed.organization.legalName || normalizeName_(project.legalName || ''),
      websiteUrl: websiteUrl,
      logo: {
        driveFileId: logoId,
        publicUrl: logoPublicUrl
      }
    },
    topic: {
      id: 'topic',
      name: seed.topic.name || projectName,
      aliases: seed.topic.aliases || [],
      parentTopic: seed.topic.parentTopic || '',
      targetPageUrl: targetPageUrl
    },
    contact: {
      phones: phones,
      email: email,
      address: address
    },
    location: {
      googleMapsUrl: mapsUrl,
      googleMapsCid: extractGoogleMapsCidEntityV4_(mapsUrl) || seed.location.googleMapsCid,
      country: safeString_(project.countryCode || project.country || seed.location.country || 'VN').toUpperCase(),
      timezone: safeString_(project.timezone || seed.location.timezone || resolveScriptTimezoneEntityV4_())
    },
    sameAs: sameAs,
    relationships: relationships,
    provenance: buildEntityProvenanceV4_(project, branding),
    fingerprint: '',
    updatedAt: nowIso_()
  };

  profile = normalizeEntityProfileV4_(profile);
  profile.fingerprint = computeEntityProfileFingerprintV4(profile);

  var validation = validateEntityProfileV4(profile);
  if (!validation.valid) {
    throw new Error('Entity Profile V4 không hợp lệ: ' + validation.errors.join(', '));
  }
  profile = validation.profile;
  profile.fingerprint = computeEntityProfileFingerprintV4(profile);
  return profile;
}

/** Public: build Entity Profile for current active project. */
function buildActiveEntityProfileV4() {
  return buildEntityProfileV4('');
}

/**
 * Public: deterministic Entity Profile fingerprint.
 * Excludes updatedAt, provenance and fingerprint itself.
 */
function computeEntityProfileFingerprintV4(profile) {
  var p = normalizeEntityProfileV4_(profile);
  var payload = {
    schemaVersion: p.schemaVersion,
    primaryEntity: {
      id: p.primaryEntity.id,
      type: p.primaryEntity.type,
      subtype: p.primaryEntity.subtype,
      name: p.primaryEntity.name,
      canonicalUrl: p.primaryEntity.canonicalUrl,
      alternateNames: (p.primaryEntity.alternateNames || []).slice().sort(),
      description: p.primaryEntity.description,
      language: p.primaryEntity.language
    },
    organization: p.organization,
    topic: {
      id: p.topic.id,
      name: p.topic.name,
      aliases: (p.topic.aliases || []).slice().sort(),
      parentTopic: p.topic.parentTopic,
      targetPageUrl: p.topic.targetPageUrl
    },
    contact: p.contact,
    location: p.location,
    sameAs: (p.sameAs || []).slice().sort(function(a, b) {
      return entityStableJsonV4_(a).localeCompare(entityStableJsonV4_(b));
    }),
    relationships: (p.relationships || []).slice().sort(function(a, b) {
      return entityStableJsonV4_(a).localeCompare(entityStableJsonV4_(b));
    })
  };
  return sha256Hex_(entityStableJsonV4_(payload));
}

/** Public: lightweight summary for Apps Script Logs/UI. */
function getEntityProfileSummaryV4(projectId) {
  var profile = buildEntityProfileV4(projectId || '');
  var validation = validateEntityProfileV4(profile);
  return {
    schemaVersion: profile.schemaVersion,
    profileId: profile.profileId,
    projectId: profile.projectId,
    primaryEntity: profile.primaryEntity,
    organization: profile.organization,
    topic: profile.topic,
    contact: profile.contact,
    location: profile.location,
    sameAs: profile.sameAs,
    relationships: profile.relationships,
    fingerprint: profile.fingerprint,
    valid: validation.valid,
    warnings: validation.warnings
  };
}

/* ------------------------------------------------------------------
 * Private project/branding resolution
 * ------------------------------------------------------------------ */

function resolveEntityProjectV4_(projectId) {
  var project = null;
  if (projectId) {
    if (typeof getProject_ !== 'function') throw new Error('PROJECT_MANAGER_NOT_AVAILABLE');
    project = getProject_(projectId);
  } else {
    if (typeof getActiveProject_ !== 'function') throw new Error('PROJECT_MANAGER_NOT_AVAILABLE');
    project = getActiveProject_();
  }
  if (!project) throw new Error('PROJECT_NOT_FOUND_FOR_ENTITY_PROFILE');
  return project;
}

function resolveEntityBrandingV4_(project) {
  if (typeof getProjectBranding_ === 'function') {
    try { return getProjectBranding_(project) || {}; } catch (e) {}
  }
  return project.branding || {};
}

function resolveEntityLanguageV4_(project, seed) {
  if (project.contentModelConfig && project.contentModelConfig.language) {
    return safeString_(project.contentModelConfig.language);
  }
  if (seed && seed.primaryEntity && seed.primaryEntity.language) return safeString_(seed.primaryEntity.language);
  return 'vi-VN';
}

/* ------------------------------------------------------------------
 * Private entity mapping/merge helpers
 * ------------------------------------------------------------------ */

function mapProjectTypeToPrimaryEntityV4_(projectType) {
  var map = {
    HOMEPAGE: 'WEBSITE',
    PAGE_TARGET: 'WEB_PAGE',
    SERVICE_PAGE: 'SERVICE',
    ARTICLE: 'ARTICLE',
    AUTHOR: 'PERSON',
    BRAND: 'ORGANIZATION',
    OTHER: 'THING',
    UNSPECIFIED: 'THING'
  };
  return map[projectType] || 'THING';
}

function defaultEntityRelationshipsV4_(primaryType) {
  var relationships = [];
  if (primaryType !== 'ORGANIZATION') {
    relationships.push({ subject: 'primary', predicate: 'PUBLISHED_BY', object: 'organization' });
  }
  relationships.push({ subject: 'primary', predicate: 'ABOUT', object: 'topic' });
  return relationships;
}

function mergeRelationshipsEntityV4_(base, extra) {
  return normalizeRelationshipsV4_((base || []).concat(extra || []));
}

function mergeSameAsEntityV4_(base, extra) {
  return normalizeSameAsV4_((base || []).concat(extra || []));
}

function findSameAsUrlEntityV4_(sameAs, type) {
  var wanted = safeString_(type).toUpperCase();
  var items = Array.isArray(sameAs) ? sameAs : [];
  for (var i = 0; i < items.length; i++) {
    if (safeString_(items[i].type).toUpperCase() === wanted && items[i].url) return items[i].url;
  }
  return '';
}

function extractGoogleMapsCidEntityV4_(url) {
  var s = normalizeUrl_(url);
  if (!s) return '';
  var match = s.match(/[?&]cid=([0-9]+)/i);
  return match && match[1] ? match[1] : '';
}

function resolveScriptTimezoneEntityV4_() {
  try {
    var tz = Session.getScriptTimeZone();
    return tz || 'Asia/Ho_Chi_Minh';
  } catch (e) {
    return 'Asia/Ho_Chi_Minh';
  }
}

function buildEntityProvenanceV4_(project, branding) {
  var useBrandingName = !!(branding && branding.brandName);
  var useBrandingWebsite = !!(branding && branding.websiteUrl);
  var useBrandingPhones = !!(branding && branding.phones && branding.phones.length);
  var useBrandingEmail = !!(branding && branding.email);
  var useBrandingAddress = !!(branding && branding.address);
  var useBrandingLogo = !!(branding && branding.logo && branding.logo.driveFileId);

  return {
    primaryEntityName: 'PROJECT_PROFILE.projectName',
    canonicalUrl: project.targetPageUrl ? 'PROJECT_PROFILE.targetPageUrl' : 'PROJECT_PROFILE.websiteUrl',
    projectType: 'PROJECT_PROFILE.projectType',
    brandName: useBrandingName ? 'PROJECT_PROFILE.branding.brandName' : 'PROJECT_PROFILE.brandName',
    websiteUrl: useBrandingWebsite ? 'PROJECT_PROFILE.branding.websiteUrl' : 'PROJECT_PROFILE.websiteUrl',
    logoDriveFileId: useBrandingLogo ? 'PROJECT_PROFILE.branding.logo.driveFileId' : 'PROJECT_PROFILE.logoFileId',
    phones: useBrandingPhones ? 'PROJECT_PROFILE.branding.phones' : 'PROJECT_PROFILE.phone/phone2',
    email: useBrandingEmail ? 'PROJECT_PROFILE.branding.email' : 'PROJECT_PROFILE.email',
    address: useBrandingAddress ? 'PROJECT_PROFILE.branding.address' : 'PROJECT_PROFILE.address',
    googleMapsUrl: 'PROJECT_PROFILE.googleMapsUrl',
    googleSitesUrl: 'PROJECT_PROFILE.googleSitesUrl'
  };
}

/* ------------------------------------------------------------------
 * Private stable fingerprint serializer
 * ------------------------------------------------------------------ */

function entityStableJsonV4_(value) {
  return JSON.stringify(entityStableNormalizeV4_(value));
}

function entityStableNormalizeV4_(value) {
  if (Array.isArray(value)) return value.map(entityStableNormalizeV4_);
  if (value && typeof value === 'object' && Object.prototype.toString.call(value) === '[object Object]') {
    var out = {};
    Object.keys(value).sort().forEach(function(key) {
      if (value[key] === undefined) return;
      out[key] = entityStableNormalizeV4_(value[key]);
    });
    return out;
  }
  return value;
}
