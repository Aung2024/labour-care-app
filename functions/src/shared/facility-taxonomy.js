'use strict';

// Keep this mapping aligned with js/facility-config.js. The browser registry
// owns labels; Functions only needs stable codes and filter dimensions.
const FACILITY_TAXONOMY = Object.freeze({
  '001': ['doms', 'district_hospital'],
  '002': ['other', 'other'],
  '003': ['other', 'other'],
  '004': ['other', 'maternity_home'],
  '005': ['doph', 'regional_public_health_department'],
  '006': ['doph', 'township_public_health_department'],
  '007': ['doms', 'township_hospital'],
  '008': ['doph', 'mch'],
  '009': ['doph', 'srhc'],
  '010': ['doph', 'srhc'],
  '011': ['doph', 'srhc'],
  '012': ['doph', 'srhc'],
  '013': ['doph', 'rhc'],
  '014': ['doph', 'srhc'],
  '015': ['doph', 'srhc'],
  '016': ['doph', 'srhc'],
  '017': ['doph', 'srhc'],
  '018': ['doph', 'rhc'],
  '019': ['doph', 'srhc'],
  '020': ['doph', 'srhc'],
  '021': ['doph', 'srhc'],
  '022': ['doph', 'srhc'],
  '023': ['doms', 'township_hospital'],
  '024': ['doms', 'station_hospital'],
  '025': ['doph', 'station_health_unit'],
  '026': ['doph', 'srhc'],
  '027': ['doph', 'srhc'],
  '028': ['doph', 'srhc'],
  '029': ['doph', 'srhc'],
  '030': ['doph', 'srhc'],
  '031': ['doph', 'srhc'],
  '032': ['doph', 'mch'],
  '033': ['doph', 'rhc'],
  '034': ['doph', 'srhc'],
  '035': ['doph', 'srhc'],
  '036': ['doph', 'srhc'],
  '037': ['doph', 'srhc'],
  '038': ['doph', 'srhc'],
  '039': ['doph', 'rhc'],
  '040': ['doph', 'srhc'],
  '041': ['doph', 'srhc'],
  '042': ['doph', 'srhc'],
  '043': ['doph', 'srhc']
});

function facilityTaxonomy(code) {
  const facilityCode = String(code || '');
  const value = FACILITY_TAXONOMY[facilityCode] || ['other', 'other'];
  return {
    facilityCode,
    department: value[0],
    facilityType: value[1]
  };
}

function facilityTypes(department) {
  return Array.from(new Set(Object.values(FACILITY_TAXONOMY)
    .filter((value) => !department || value[0] === department)
    .map((value) => value[1]))).sort();
}

module.exports = {
  FACILITY_TAXONOMY,
  facilityTaxonomy,
  facilityTypes
};
