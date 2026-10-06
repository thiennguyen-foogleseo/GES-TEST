/**
 * GES V4 - Entity Profile schema v1.0.0
 *
 * Pure schema/normalization/validation helpers.
 * No Project Profile or asset writes happen here.
 */

var GES_ENTITY_PROFILE_SCHEMA_V4 = Object.freeze({
  VERSION: '1.0.0',
  ENTITY_TYPES: [
    'WEBSITE',
    'WEB_PAGE',
    'SERVICE',
    'ARTICLE',
    'PERSON',
    'ORGANIZATION',
    'THING'
  ],
  RELATIONSHIP_PREDICATES: [
    'PUBLISHED_BY',
    'ABOUT',
    'PART_OF',
    'AUTHORED_BY',
    'REPRESENTS',
    'SAME_AS',
    'RELATED_TO'
  ]
});

/** Public: return a safe copy of the Entity Profile schema contract. */
function getEntityProfileSchemaV4() {
  return cloneJson_(GES_ENTITY_PROFILE_SCHEMA_V4);
}

/** Public: validate an Entity Profile without mutating the input. */
function validateEntityProfileV4(profile) {
  var errors = [];
  var warnings = [];
  var p = normalizeEntityProfileV4_(profile);

  if (p.schemaVersion !== GES_ENTITY_PROFILE_SCHEMA_V4.VERSION) {
    errors.push('INVALID_ENTITY_PROFILE_SCHEMA_VERSION');
  }
  if (!p.profileId) errors.push('ENTITY_PROFILE_ID_REQUIRED');
  if (!p.projectId) errors.push('ENTITY_PROJECT_ID_REQUIRED');
  if (!p.primaryEntity.name) errors.push('PRIMARY_ENTITY_NAME_REQUIRED');
  if (GES_ENTITY_PROFILE_SCHEMA_V4.ENTITY_TYPES.indexOf(p.primaryEntity.type) === -1) {
    errors.push('INVALID_PRIMARY_ENTITY_TYPE');
  }

  if (!p.primaryEntity.canonicalUrl) warnings.push('PRIMARY_ENTITY_CANONICAL_URL_MISSING');
  if (!p.organization.brandName && p.primaryEntity.type !== 'ORGANIZATION') {
    warnings.push('ORGANIZATION_BRAND_NAME_MISSING');
  }
  if (!p.organization.websiteUrl) warnings.push('ORGANIZATION_WEBSITE_URL_MISSING');
  if (!p.topic.name) warnings.push('TOPIC_NAME_MISSING');
  if (!(p.contact.phones || []).length) warnings.push('CONTACT_PHONE_MISSING');

  var sameAsSeen = {};
  p.sameAs.forEach(function(item) {
    if (!item.url) warnings.push('SAME_AS_URL_MISSING_' + safeString_(item.type));
    var key = item.type + '|' + item.url;
    if (sameAsSeen[key]) warnings.push('DUPLICATE_SAME_AS_' + safeString_(item.type));
    sameAsSeen[key] = true;
  });

  p.relationships.forEach(function(rel, index) {
    if (!rel.subject || !rel.predicate || !rel.object) {
      errors.push('INVALID_RELATIONSHIP_AT_' + index);
    }
  });

  return {
    valid: errors.length === 0,
    errors: errors,
    warnings: uniqueStringArrayEntityV4_(warnings),
    profile: p
  };
}

/* ------------------------------------------------------------------
 * Private schema normalization
 * ------------------------------------------------------------------ */

function normalizeEntityProfileV4_(raw) {
  raw = raw || {};
  return {
    schemaVersion: safeString_(raw.schemaVersion || GES_ENTITY_PROFILE_SCHEMA_V4.VERSION),
    profileId: safeString_(raw.profileId || ''),
    projectId: safeString_(raw.projectId || ''),
    primaryEntity: normalizePrimaryEntityV4_(raw.primaryEntity),
    organization: normalizeOrganizationEntityV4_(raw.organization),
    topic: normalizeTopicEntityV4_(raw.topic),
    contact: normalizeEntityContactV4_(raw.contact),
    location: normalizeEntityLocationV4_(raw.location),
    sameAs: normalizeSameAsV4_(raw.sameAs),
    relationships: normalizeRelationshipsV4_(raw.relationships),
    provenance: normalizeEntityProvenanceV4_(raw.provenance),
    fingerprint: safeString_(raw.fingerprint || ''),
    updatedAt: safeString_(raw.updatedAt || '')
  };
}

function normalizePrimaryEntityV4_(entity) {
  entity = entity || {};
  var type = safeString_(entity.type || 'THING').toUpperCase();
  if (GES_ENTITY_PROFILE_SCHEMA_V4.ENTITY_TYPES.indexOf(type) === -1) type = 'THING';
  return {
    id: safeString_(entity.id || 'primary'),
    type: type,
    subtype: safeString_(entity.subtype || 'OTHER').toUpperCase(),
    name: normalizeName_(entity.name || ''),
    canonicalUrl: normalizeUrl_(entity.canonicalUrl || ''),
    alternateNames: uniqueStringArrayEntityV4_(entity.alternateNames || []),
    description: safeString_(entity.description || '').trim(),
    language: safeString_(entity.language || 'vi-VN')
  };
}

function normalizeOrganizationEntityV4_(organization) {
  organization = organization || {};
  var logo = organization.logo || {};
  return {
    id: safeString_(organization.id || 'organization'),
    brandName: normalizeName_(organization.brandName || ''),
    legalName: normalizeName_(organization.legalName || ''),
    websiteUrl: normalizeUrl_(organization.websiteUrl || ''),
    logo: {
      driveFileId: extractDriveId_(logo.driveFileId || ''),
      publicUrl: normalizeUrl_(logo.publicUrl || '')
    }
  };
}

function normalizeTopicEntityV4_(topic) {
  topic = topic || {};
  return {
    id: safeString_(topic.id || 'topic'),
    name: normalizeName_(topic.name || ''),
    aliases: uniqueStringArrayEntityV4_(topic.aliases || []),
    parentTopic: normalizeName_(topic.parentTopic || ''),
    targetPageUrl: normalizeUrl_(topic.targetPageUrl || '')
  };
}

function normalizeEntityContactV4_(contact) {
  contact = contact || {};
  return {
    phones: normalizePhonesEntityV4_(contact.phones || []),
    email: safeString_(contact.email || '').trim(),
    address: safeString_(contact.address || '').trim()
  };
}

function normalizeEntityLocationV4_(location) {
  location = location || {};
  return {
    googleMapsUrl: normalizeUrl_(location.googleMapsUrl || ''),
    googleMapsCid: safeString_(location.googleMapsCid || ''),
    country: safeString_(location.country || 'VN').toUpperCase(),
    timezone: safeString_(location.timezone || 'Asia/Ho_Chi_Minh')
  };
}

function normalizeSameAsV4_(sameAs) {
  var seen = {};
  var out = [];
  (Array.isArray(sameAs) ? sameAs : []).forEach(function(item) {
    item = item || {};
    var type = safeString_(item.type || 'OTHER').toUpperCase();
    var url = normalizeUrl_(item.url || '');
    if (!url) return;
    var key = type + '|' + url;
    if (seen[key]) return;
    seen[key] = true;
    out.push({ type: type, url: url });
  });
  return out;
}

function normalizeRelationshipsV4_(relationships) {
  var seen = {};
  var out = [];
  (Array.isArray(relationships) ? relationships : []).forEach(function(rel) {
    rel = rel || {};
    var normalized = {
      subject: safeString_(rel.subject || ''),
      predicate: safeString_(rel.predicate || '').toUpperCase(),
      object: safeString_(rel.object || '')
    };
    if (!normalized.subject || !normalized.predicate || !normalized.object) return;
    var key = normalized.subject + '|' + normalized.predicate + '|' + normalized.object;
    if (seen[key]) return;
    seen[key] = true;
    out.push(normalized);
  });
  return out;
}

function normalizeEntityProvenanceV4_(provenance) {
  provenance = provenance || {};
  var out = {};
  Object.keys(provenance).sort().forEach(function(key) {
    out[key] = safeString_(provenance[key] || '');
  });
  return out;
}

function normalizePhonesEntityV4_(phones) {
  var values = Array.isArray(phones) ? phones : [phones];
  var seen = {};
  var out = [];
  values.forEach(function(phone) {
    var s = safeString_(phone).replace(/\s+/g, ' ').trim();
    if (!s || seen[s]) return;
    seen[s] = true;
    out.push(s);
  });
  return out;
}

function uniqueStringArrayEntityV4_(values) {
  var seen = {};
  var out = [];
  (Array.isArray(values) ? values : []).forEach(function(value) {
    var s = safeString_(value).replace(/\s+/g, ' ').trim();
    if (!s || seen[s]) return;
    seen[s] = true;
    out.push(s);
  });
  return out;
}
