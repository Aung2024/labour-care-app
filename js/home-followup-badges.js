/**
 * Refresh HRT/KMC home card badges on login (online) without opening those modules.
 */
(function (global) {
  'use strict';

  var MAX_PATIENTS = 60;
  var CONCURRENCY = 5;

  async function mapWithConcurrency(items, limit, fn) {
    var out = [];
    for (var i = 0; i < items.length; i += limit) {
      var batch = items.slice(i, i + limit);
      var part = await Promise.all(batch.map(fn));
      out.push.apply(out, part);
    }
    return out;
  }

  async function fetchMidwifePatients(db, uid) {
    var map = new Map();
    var queries = [
      db.collection('patients').where('created_by', '==', uid),
      db.collection('patients').where('createdBy', '==', uid),
      db.collection('patients').where('care_team_midwife_ids', 'array-contains', uid)
    ];
    for (var i = 0; i < queries.length; i++) {
      try {
        var snap = await queries[i].limit(MAX_PATIENTS).get();
        if (snap && snap.forEach) {
          snap.forEach(function (doc) {
            if (!map.has(doc.id)) map.set(doc.id, { id: doc.id, ...(doc.data() || {}) });
          });
        }
      } catch (e) { /* ignore */ }
    }
    return Array.from(map.values()).slice(0, MAX_PATIENTS);
  }

  async function fetchAncVisits(db, patientId) {
    var ref = db.collection('patients').doc(patientId).collection('antenatal_visits');
    try {
      var snap = await ref.orderBy('visitDate', 'desc').limit(12).get();
      var visits = [];
      snap.forEach(function (d) { visits.push({ id: d.id, data: d.data() || {} }); });
      return visits;
    } catch (e) {
      try {
        var snap2 = await ref.limit(12).get();
        var out = [];
        snap2.forEach(function (d) { out.push({ id: d.id, data: d.data() || {} }); });
        return out;
      } catch (e2) {
        return [];
      }
    }
  }

  async function fetchHrtActions(db, patientId) {
    try {
      var snap = await db.collection('patients').doc(patientId).collection('hrt_actions')
        .orderBy('recordedAt', 'desc').limit(10).get();
      var actions = [];
      snap.forEach(function (d) { actions.push(d.data() || {}); });
      return actions;
    } catch (e) {
      return [];
    }
  }

  async function fetchNewbornVisits(db, patientId) {
    try {
      var snap = await db.collection('patients').doc(patientId).collection('newborn_care')
        .orderBy('visit_number', 'asc').limit(10).get();
      var visits = [];
      snap.forEach(function (d) { visits.push(d.data() || {}); });
      return visits;
    } catch (e) {
      try {
        var snap2 = await db.collection('patients').doc(patientId).collection('newborn_care').limit(10).get();
        var out = [];
        snap2.forEach(function (d) { out.push(d.data() || {}); });
        return out;
      } catch (e2) {
        return [];
      }
    }
  }

  async function fetchKmcActions(db, patientId) {
    try {
      var snap = await db.collection('patients').doc(patientId).collection('kmc_actions')
        .orderBy('recordedAt', 'desc').limit(10).get();
      var actions = [];
      snap.forEach(function (d) { actions.push(d.data() || {}); });
      return actions;
    } catch (e) {
      return [];
    }
  }

  function getHrtCompleteAction(actions) {
    actions = actions || [];
    for (var i = 0; i < actions.length; i++) {
      var a = actions[i];
      if (a && a.type === 'resolved' && (
        a.resolvedReason === 'completed' ||
        a.resolvedReason === 'delivered_safely' ||
        a.resolvedReason === 'death' ||
        a.resolvedReason === 'transferred' ||
        a.outcome === 'alive' ||
        a.outcome === 'death' ||
        a.outcome === 'transfer'
      )) {
        return a;
      }
    }
    return null;
  }

  function isHrtActiveRow(visits, actions) {
    if (!global.HighRiskUtils) return false;
    if (!HighRiskUtils.isPatientHighRisk({ antenatalVisits: visits })) return false;
    if (getHrtCompleteAction(actions)) return false;
    return true;
  }

  function isKmcActiveRow(patient, newbornVisits, kmcActions, birthAnchor, latestAnc) {
    if (!global.KmcUtils) return false;
    var newbornCare = newbornVisits[0] || {};
    var evaluations = KmcUtils.evaluateKmcEligibilityForBabies(patient, newbornCare, birthAnchor, latestAnc);
    for (var i = 0; i < evaluations.length; i++) {
      var evalResult = evaluations[i];
      var babyIndex = parseInt(evalResult.babyIndex, 10) || 1;
      var decision = KmcUtils.getLatestKmcDecisionForBaby(newbornVisits, babyIndex) || {};
      var potential = !!(evalResult.eligible || decision.potential_kmc);
      if (!potential) continue;
      if ((decision.kmc_selected || '').toLowerCase() !== 'yes') continue;
      if (KmcUtils.getCompleteActionForBaby(kmcActions, babyIndex)) continue;
      return true;
    }
    return false;
  }

  async function refreshFollowUpBadges(db, user) {
    if (!db || !user || !user.uid) return { hrt: 0, kmc: 0 };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;

    var patients = await fetchMidwifePatients(db, user.uid);
    var hrtCount = 0;
    var kmcCount = 0;

    await mapWithConcurrency(patients, CONCURRENCY, async function (p) {
      var visits = await fetchAncVisits(db, p.id);
      var hrtActions = await fetchHrtActions(db, p.id);
      if (isHrtActiveRow(visits, hrtActions)) hrtCount++;

      var newbornVisits = await fetchNewbornVisits(db, p.id);
      if (!newbornVisits.length) return;
      var kmcActions = await fetchKmcActions(db, p.id);
      var birthAnchor = null;
      if (global.BirthDeliveryAnchor && BirthDeliveryAnchor.fetchSharedDeliveryAnchor) {
        try {
          birthAnchor = await BirthDeliveryAnchor.fetchSharedDeliveryAnchor(p.id);
        } catch (e) { /* ignore */ }
      }
      var latestAnc = visits.length ? (visits[0].data || visits[0]) : null;
      if (isKmcActiveRow(p, newbornVisits, kmcActions, birthAnchor, latestAnc)) kmcCount++;
    });

    try {
      sessionStorage.setItem('hrtActiveFollowUpCount', String(hrtCount));
      sessionStorage.setItem('hrtActiveFollowUpCountAt', String(Date.now()));
      sessionStorage.setItem('kmcActiveFollowUpCount', String(kmcCount));
      sessionStorage.setItem('kmcActiveFollowUpCountAt', String(Date.now()));
    } catch (e) { /* ignore */ }

    return { hrt: hrtCount, kmc: kmcCount };
  }

  global.HomeFollowUpBadges = {
    refreshFollowUpBadges: refreshFollowUpBadges
  };
})(typeof window !== 'undefined' ? window : this);
