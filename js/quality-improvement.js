/**
 * Quality Improvement data helpers: role scope, month summaries, plans, comments.
 */
(function (global) {
  'use strict';

  var SUMMARY_CACHE = {};
  var PLAN_CACHE = {};
  var DEFAULT_TIMEOUT_MS = 12000;

  function withTimeout(promise, ms, label) {
    var timeoutMs = ms || DEFAULT_TIMEOUT_MS;
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        reject(new Error((label || 'Request') + ' timed out'));
      }, timeoutMs);
      Promise.resolve(promise).then(function (value) {
        clearTimeout(timer);
        resolve(value);
      }, function (error) {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  function normalizeRole(role) {
    return String(role || '').toLowerCase().trim().replace(/\s+/g, ' ');
  }

  function isSupervisorRole(role) {
    var key = normalizeRole(role);
    return key === 'tmo' || key === 'regional officer' || key === 'super admin' ||
      key === 'admin' || key === 'central';
  }

  function isMidwifeRole(role) {
    var key = normalizeRole(role);
    return key === 'midwife' || key === '';
  }

  function canViewProvider(viewer, provider) {
    if (!viewer || !provider) return false;
    var role = normalizeRole(viewer.role);
    if (role === 'super admin' || role === 'admin' || role === 'central') return true;
    if (viewer.uid && provider.id === viewer.uid) return true;
    if (role === 'tmo') return viewer.township && provider.township === viewer.township;
    if (role === 'regional officer') return viewer.region && provider.region === viewer.region;
    return false;
  }

  async function loadCurrentUserProfile() {
    var user = firebase.auth().currentUser;
    if (!user) throw new Error('Not signed in');
    var data = null;
    if (global.UserCache && UserCache.get) {
      data = await withTimeout(UserCache.get(user.uid), 8000, 'User profile');
    } else {
      var snap = await withTimeout(
        firebase.firestore().collection('users').doc(user.uid).get(),
        8000,
        'User profile'
      );
      data = snap.exists ? snap.data() : null;
    }
    return {
      uid: user.uid,
      role: (data && data.role) || 'Midwife',
      township: (data && data.township) || '',
      region: (data && data.region) || '',
      name: (data && (data.name || data.displayName || data.full_name)) || user.email || '',
      facility_code: (data && data.facility_code) || '',
      provider_type: (data && data.provider_type) || ''
    };
  }

  async function listScopedMidwives(viewer) {
    var role = normalizeRole(viewer.role);
    var query = firebase.firestore().collection('users').where('role', 'in', ['Midwife', 'midwife']);
    if (role === 'tmo' && viewer.township) {
      query = firebase.firestore().collection('users')
        .where('township', '==', viewer.township)
        .where('role', 'in', ['Midwife', 'midwife']);
    } else if (role === 'regional officer' && viewer.region) {
      query = firebase.firestore().collection('users')
        .where('region', '==', viewer.region)
        .where('role', 'in', ['Midwife', 'midwife']);
    } else if (!(role === 'super admin' || role === 'admin' || role === 'central')) {
      return [{
        id: viewer.uid,
        name: viewer.name,
        township: viewer.township,
        region: viewer.region
      }];
    }

    var snap;
    try {
      snap = await withTimeout(query.limit(200).get(), 10000, 'Midwife list');
    } catch (error) {
      // Fallback without composite index: filter client-side from township/region query.
      if (role === 'tmo' && viewer.township) {
        snap = await withTimeout(
          firebase.firestore().collection('users').where('township', '==', viewer.township).limit(300).get(),
          10000,
          'Midwife list'
        );
      } else if (role === 'regional officer' && viewer.region) {
        snap = await withTimeout(
          firebase.firestore().collection('users').where('region', '==', viewer.region).limit(400).get(),
          10000,
          'Midwife list'
        );
      } else {
        throw error;
      }
    }

    var midwives = [];
    snap.forEach(function (doc) {
      var data = doc.data() || {};
      var docRole = normalizeRole(data.role);
      if (docRole !== 'midwife') return;
      midwives.push({
        id: doc.id,
        name: data.name || data.displayName || data.full_name || data.email || doc.id,
        township: data.township || '',
        region: data.region || '',
        facility_code: data.facility_code || ''
      });
    });
    midwives.sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name));
    });
    return midwives;
  }

  async function loadCollection(ref) {
    var snap = await ref.get();
    return snap.docs.map(function (doc) {
      return Object.assign({ id: doc.id }, doc.data() || {});
    });
  }

  async function computeProviderMonthSummary(providerId, month, providerMeta) {
    var Scoring = global.QualityScoring;
    if (!Scoring) throw new Error('QualityScoring is not loaded');

    var patientsSnap = await withTimeout(
      firebase.firestore().collection('patients')
        .where('created_by', '==', providerId)
        .limit(120)
        .get(),
      15000,
      'Patients'
    );

    var indicators = Scoring.emptyIndicatorTotals();
    var processed = 0;
    for (var i = 0; i < patientsSnap.docs.length; i++) {
      var patientDoc = patientsSnap.docs[i];
      var patient = Object.assign({ id: patientDoc.id }, patientDoc.data() || {});
      var patientRef = patientDoc.ref;
      var activity = {
        immediateNewbornCare: await loadCollection(patientRef.collection('immediate_newborn_care')),
        newbornCare: await loadCollection(patientRef.collection('newborn_care'))
      };
      if (!activity.immediateNewbornCare.length && !activity.newbornCare.length) continue;
      var contribution = Scoring.calculatePatientQualityContribution(patient, activity, month);
      var providerPart = contribution.providers && contribution.providers[providerId];
      if (!providerPart) continue;
      Scoring.mergeProviderIndicators(indicators, providerPart.indicators);
      processed += 1;
      if (i % 8 === 0) await new Promise(function (resolve) { setTimeout(resolve, 0); });
    }

    var summary = Scoring.summarizeProviderIndicators(indicators);
    return {
      month: month,
      providerId: providerId,
      providerName: (providerMeta && providerMeta.name) || '',
      township: (providerMeta && providerMeta.township) || '',
      region: (providerMeta && providerMeta.region) || '',
      facilityCode: (providerMeta && providerMeta.facility_code) || '',
      schemaVersion: Scoring.QI_SCHEMA_VERSION,
      indicators: summary.indicators,
      summaryPercentage: summary.summaryPercentage,
      scoredIndicatorCount: summary.scoredIndicatorCount,
      indicatorCount: summary.indicatorCount,
      computedLocally: true,
      patientsProcessed: processed
    };
  }

  async function loadProviderMonthSummary(providerId, month, providerMeta) {
    var cacheKey = month + ':' + providerId;
    if (SUMMARY_CACHE[cacheKey]) return SUMMARY_CACHE[cacheKey];

    try {
      var snap = await withTimeout(
        firebase.firestore()
          .collection('quality_improvement_v1_months')
          .doc(month)
          .collection('providers')
          .doc(providerId)
          .get(),
        8000,
        'QI summary'
      );
      if (snap.exists) {
        var cached = Object.assign({ computedLocally: false }, snap.data() || {});
        SUMMARY_CACHE[cacheKey] = cached;
        return cached;
      }
    } catch (error) {
      console.warn('QI summary read failed, computing locally', error);
    }

    var computed = await computeProviderMonthSummary(providerId, month, providerMeta);
    SUMMARY_CACHE[cacheKey] = computed;
    return computed;
  }

  function clearSummaryCache(providerId, month) {
    if (providerId && month) delete SUMMARY_CACHE[month + ':' + providerId];
    else SUMMARY_CACHE = {};
  }

  async function loadActionPlan(providerId, scoreMonth) {
    var Scoring = global.QualityScoring;
    var docId = Scoring.planDocId(providerId, scoreMonth);
    if (PLAN_CACHE[docId]) return PLAN_CACHE[docId];
    var snap = await withTimeout(
      firebase.firestore().collection('quality_improvement_plans').doc(docId).get(),
      8000,
      'QI plan'
    );
    var plan = snap.exists ? Object.assign({ id: docId }, snap.data() || {}) : {
      id: docId,
      providerId: providerId,
      scoreMonth: scoreMonth,
      targetMonth: Scoring.nextMonthKey(scoreMonth),
      indicators: {}
    };
    PLAN_CACHE[docId] = plan;
    return plan;
  }

  async function saveActionPlanIndicator(viewer, providerId, scoreMonth, indicatorId, payload) {
    var Scoring = global.QualityScoring;
    if (!isMidwifeRole(viewer.role) || viewer.uid !== providerId) {
      throw new Error('Only the midwife owner can edit reasons and targets');
    }
    if (!Scoring.isValidReasonCategory(payload.reasonCategory)) {
      throw new Error('Select a reason category first');
    }
    if (!Scoring.isValidTargetPercent(payload.nextTargetPercent)) {
      throw new Error('Target must be between 0 and 100');
    }
    var explanation = String(payload.explanation || '').trim();
    if (!explanation) throw new Error('Please enter an explanation');

    var docId = Scoring.planDocId(providerId, scoreMonth);
    var indicatorPath = 'indicators.' + indicatorId;
    var update = {
      providerId: providerId,
      scoreMonth: scoreMonth,
      targetMonth: Scoring.nextMonthKey(scoreMonth),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: viewer.uid
    };
    update[indicatorPath] = {
      reasonCategory: payload.reasonCategory,
      explanation: explanation,
      nextTargetPercent: Number(payload.nextTargetPercent),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: viewer.uid
    };
    await firebase.firestore().collection('quality_improvement_plans').doc(docId).set(update, { merge: true });
    delete PLAN_CACHE[docId];
    return loadActionPlan(providerId, scoreMonth);
  }

  async function loadComments(providerId, scoreMonth, indicatorId) {
    var Scoring = global.QualityScoring;
    var docId = Scoring.planDocId(providerId, scoreMonth);
    var snap = await withTimeout(
      firebase.firestore()
        .collection('quality_improvement_plans')
        .doc(docId)
        .collection('comments')
        .where('indicatorId', '==', indicatorId)
        .limit(50)
        .get(),
      8000,
      'QI comments'
    );
    var comments = snap.docs.map(function (doc) {
      return Object.assign({ id: doc.id }, doc.data() || {});
    });
    comments.sort(function (a, b) {
      var aTime = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
      var bTime = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
      return aTime - bTime;
    });
    return comments;
  }

  async function addSupervisorComment(viewer, providerId, scoreMonth, indicatorId, text) {
    if (!isSupervisorRole(viewer.role)) {
      throw new Error('Only TMO and above can comment');
    }
    var body = String(text || '').trim();
    if (!body) throw new Error('Enter a comment');
    var Scoring = global.QualityScoring;
    var docId = Scoring.planDocId(providerId, scoreMonth);
    var planRef = firebase.firestore().collection('quality_improvement_plans').doc(docId);
    await planRef.set({
      providerId: providerId,
      scoreMonth: scoreMonth,
      targetMonth: Scoring.nextMonthKey(scoreMonth),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    await planRef.collection('comments').add({
      indicatorId: indicatorId,
      text: body,
      authorId: viewer.uid,
      authorName: viewer.name || '',
      authorRole: viewer.role,
      township: viewer.township || '',
      region: viewer.region || '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  async function loadActiveTargetsForMidwife(providerId, now) {
    var Scoring = global.QualityScoring;
    var currentMonth = Scoring.currentYangonMonthKey(now);
    var previousMonth = Scoring.previousMonthKey(currentMonth);
    var plan = await loadActionPlan(providerId, previousMonth);
    var targets = {};
    Scoring.INDICATOR_DEFS.forEach(function (indicator) {
      var entry = plan.indicators && plan.indicators[indicator.id];
      if (entry && Scoring.isValidTargetPercent(entry.nextTargetPercent)) {
        targets[indicator.id] = {
          percent: Number(entry.nextTargetPercent),
          reasonCategory: entry.reasonCategory || '',
          explanation: entry.explanation || '',
          scoreMonth: previousMonth,
          targetMonth: currentMonth,
          indicator: indicator
        };
      }
    });
    return {
      currentMonth: currentMonth,
      sourceScoreMonth: previousMonth,
      targets: targets
    };
  }

  global.QualityImprovement = {
    withTimeout: withTimeout,
    normalizeRole: normalizeRole,
    isSupervisorRole: isSupervisorRole,
    isMidwifeRole: isMidwifeRole,
    canViewProvider: canViewProvider,
    loadCurrentUserProfile: loadCurrentUserProfile,
    listScopedMidwives: listScopedMidwives,
    loadProviderMonthSummary: loadProviderMonthSummary,
    computeProviderMonthSummary: computeProviderMonthSummary,
    clearSummaryCache: clearSummaryCache,
    loadActionPlan: loadActionPlan,
    saveActionPlanIndicator: saveActionPlanIndicator,
    loadComments: loadComments,
    addSupervisorComment: addSupervisorComment,
    loadActiveTargetsForMidwife: loadActiveTargetsForMidwife
  };
})(typeof window !== 'undefined' ? window : this);
