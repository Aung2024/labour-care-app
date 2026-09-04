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

  function userDisplayName(data, fallbackId) {
    var profile = data || {};
    return profile.name || profile.displayName || profile.full_name || profile.email || fallbackId || '';
  }

  async function loadTownshipTmo(township) {
    var area = String(township || '').trim();
    if (!area) return null;

    var snap;
    try {
      snap = await withTimeout(
        firebase.firestore().collection('users')
          .where('township', '==', area)
          .where('role', 'in', ['TMO', 'tmo'])
          .limit(8)
          .get(),
        8000,
        'Township TMO'
      );
    } catch (error) {
      snap = await withTimeout(
        firebase.firestore().collection('users').where('township', '==', area).limit(80).get(),
        8000,
        'Township TMO'
      );
    }

    var tmos = [];
    snap.forEach(function (doc) {
      var data = doc.data() || {};
      if (normalizeRole(data.role) !== 'tmo') return;
      tmos.push({
        id: doc.id,
        name: userDisplayName(data, doc.id),
        township: data.township || area
      });
    });
    tmos.sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name));
    });
    return tmos[0] || null;
  }

  async function loadCollection(ref) {
    var snap = await ref.get();
    return snap.docs.map(function (doc) {
      return Object.assign({ id: doc.id }, doc.data() || {});
    });
  }

  async function loadOwnedPatients(providerId) {
    var patients = firebase.firestore().collection('patients');
    var snapshots = await withTimeout(Promise.all([
      patients.where('created_by', '==', providerId).limit(200).get(),
      patients.where('createdBy', '==', providerId).limit(200).get()
    ]), 15000, 'Patients');
    var byId = {};
    snapshots.forEach(function (snapshot) {
      snapshot.docs.forEach(function (doc) { byId[doc.id] = doc; });
    });
    return Object.keys(byId).map(function (id) { return byId[id]; });
  }

  async function loadPatientQualityActivity(patientDoc) {
    var patient = Object.assign({ id: patientDoc.id }, patientDoc.data() || {});
    var activityRows = await Promise.all([
      loadCollection(patientDoc.ref.collection('immediate_newborn_care')),
      loadCollection(patientDoc.ref.collection('newborn_care'))
    ]);
    return {
      patient: patient,
      activity: {
        immediateNewbornCare: activityRows[0],
        newbornCare: activityRows[1]
      }
    };
  }

  async function computeProviderMonthSummary(providerId, month, providerMeta) {
    var Scoring = global.QualityScoring;
    if (!Scoring) throw new Error('QualityScoring is not loaded');

    var patientDocs = await loadOwnedPatients(providerId);
    var indicators = Scoring.emptyIndicatorTotals();
    var processed = 0;
    for (var offset = 0; offset < patientDocs.length; offset += 8) {
      var bundles = await Promise.all(
        patientDocs.slice(offset, offset + 8).map(loadPatientQualityActivity)
      );
      bundles.forEach(function (bundle) {
        var activity = bundle.activity;
        if (!activity.immediateNewbornCare.length && !activity.newbornCare.length) return;
        var contribution = Scoring.calculatePatientQualityContribution(
          bundle.patient,
          activity,
          month
        );
        var providerPart = contribution.providers && contribution.providers[providerId];
        if (!providerPart) return;
        Scoring.mergeProviderIndicators(indicators, providerPart.indicators);
        processed += 1;
      });
      await new Promise(function (resolve) { setTimeout(resolve, 0); });
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

    // Scores are derived from the midwife's own patient records. Cached
    // summaries are optional and must never block the page.
    try {
      var snap = await withTimeout(
        firebase.firestore()
          .collection('quality_improvement_v1_months')
          .doc(month)
          .collection('providers')
          .doc(providerId)
          .get(),
        4000,
        'QI summary'
      );
      if (snap.exists) {
        var cached = Object.assign({ computedLocally: false }, snap.data() || {});
        SUMMARY_CACHE[cacheKey] = cached;
        return cached;
      }
    } catch (error) {
      // Missing QI collections/rules are expected until those rules are
      // deployed. Patient reads are unchanged and used for local scoring.
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
    var snap;
    try {
      snap = await withTimeout(
        firebase.firestore().collection('quality_improvement_plans').doc(docId).get(),
        8000,
        'QI plan'
      );
    } catch (error) {
      if (error && (error.code === 'permission-denied' ||
          String(error.message || '').toLowerCase().indexOf('permission') >= 0)) {
        console.warn('QI plan rules are not deployed yet; using an empty plan.');
        snap = { exists: false };
      } else {
        throw error;
      }
    }
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
    var targetMonth = Scoring.isMonthKey(payload.targetMonth)
      ? payload.targetMonth
      : Scoring.nextMonthKey(scoreMonth) || Scoring.nextMonthKey(Scoring.currentYangonMonthKey(new Date()));
    if (!Scoring.isMonthKey(targetMonth)) {
      throw new Error('Select a target month');
    }
    var explanation = String(payload.explanation || '').trim();
    if (!explanation) throw new Error('Please enter an explanation');
    var nextAction = String(payload.nextAction || '').trim();
    if (!nextAction) throw new Error('Please enter the next action');
    var actionOwnerType = String(payload.actionOwnerType || '').trim();
    if (['self', 'tmo', 'other'].indexOf(actionOwnerType) < 0) {
      throw new Error('Select who will do the action');
    }
    var actionOwner = String(payload.actionOwner || '').trim();
    if (!actionOwner) throw new Error('Please enter who will do the action');
    var actionOwnerId = String(payload.actionOwnerId || '').trim();

    var savedAt = new Date().toISOString();
    var actionRecord = {
      providerId: providerId,
      indicatorId: indicatorId,
      scoreMonth: scoreMonth,
      targetMonth: targetMonth,
      sourceScoreMonth: scoreMonth,
      township: viewer.township || '',
      region: viewer.region || '',
      reasonCategory: payload.reasonCategory,
      explanation: explanation,
      nextAction: nextAction,
      actionOwnerType: actionOwnerType,
      actionOwner: actionOwner,
      actionOwnerId: actionOwnerId,
      nextTargetPercent: Number(payload.nextTargetPercent),
      updatedAt: savedAt,
      updatedBy: viewer.uid
    };
    var actionRef = firebase.firestore()
      .collection('quality_improvement_actions')
      .doc(actionDocId(providerId, indicatorId));
    await actionRef.set(actionRecord, { merge: true });
    if (firebase.firestore().waitForPendingWrites) {
      await firebase.firestore().waitForPendingWrites();
    }
    var verify = await actionRef.get();
    if (!verify.exists) {
      throw new Error('Action did not save to the server. Please try again.');
    }

    try {
      await writePlanIndicator(providerId, scoreMonth, indicatorId, actionRecord);
      await writePlanIndicator(providerId, 'all', indicatorId, actionRecord);
    } catch (error) {
      console.warn('QI plan mirror failed after action save', error);
    }
    return loadActionPlan(providerId, scoreMonth);
  }

  function actionDocId(providerId, indicatorId) {
    return String(providerId) + '__' + String(indicatorId);
  }

  function extractIndicators(plan) {
    var result = {};
    if (!plan || typeof plan !== 'object') return result;
    var indicators = plan.indicators;
    if (indicators && typeof indicators === 'object') {
      Object.keys(indicators).forEach(function (id) {
        result[id] = indicators[id];
      });
    }
    Object.keys(plan).forEach(function (key) {
      if (key.indexOf('indicators.') === 0) {
        result[key.slice('indicators.'.length)] = plan[key];
      }
    });
    return result;
  }

  async function writePlanIndicator(providerId, scoreMonth, indicatorId, actionRecord) {
    var Scoring = global.QualityScoring;
    var docId = Scoring.planDocId(providerId, scoreMonth);
    var ref = firebase.firestore().collection('quality_improvement_plans').doc(docId);
    var existing = {};
    try {
      var snap = await ref.get();
      if (snap.exists) existing = extractIndicators(Object.assign({ id: snap.id }, snap.data() || {}));
    } catch (error) {
      console.warn('QI plan read before save failed', docId, error);
    }
    existing[indicatorId] = {
      reasonCategory: actionRecord.reasonCategory,
      explanation: actionRecord.explanation,
      nextAction: actionRecord.nextAction,
      actionOwnerType: actionRecord.actionOwnerType,
      actionOwner: actionRecord.actionOwner,
      actionOwnerId: actionRecord.actionOwnerId,
      nextTargetPercent: actionRecord.nextTargetPercent,
      targetMonth: actionRecord.targetMonth,
      sourceScoreMonth: actionRecord.sourceScoreMonth,
      updatedAt: actionRecord.updatedAt,
      updatedBy: actionRecord.updatedBy
    };
    await ref.set({
      providerId: providerId,
      scoreMonth: scoreMonth,
      targetMonth: actionRecord.targetMonth,
      hasSavedActions: true,
      indicators: existing,
      updatedAt: actionRecord.updatedAt,
      updatedBy: actionRecord.updatedBy
    }, { merge: true });
    delete PLAN_CACHE[docId];
  }

  function isSavedAction(action) {
    if (!action || typeof action !== 'object') return false;
    return !!(action.nextAction || action.reasonCategory || action.explanation ||
      action.nextTargetPercent != null || action.targetMonth);
  }

  function commentRef(providerId, scoreMonth, indicatorId) {
    var Scoring = global.QualityScoring;
    return firebase.firestore()
      .collection('quality_improvement_plans')
      .doc(Scoring.planDocId(providerId, scoreMonth))
      .collection('comments')
      .doc(String(indicatorId));
  }

  async function loadSupervisorComment(providerId, scoreMonth, indicatorId) {
    var canonical = await withTimeout(commentRef(providerId, scoreMonth, indicatorId).get(), 8000, 'QI comment');
    if (canonical.exists) {
      return Object.assign({ id: canonical.id }, canonical.data() || {});
    }

    try {
      var snap = await withTimeout(
        firebase.firestore()
          .collection('quality_improvement_plans')
          .doc(global.QualityScoring.planDocId(providerId, scoreMonth))
          .collection('comments')
          .where('indicatorId', '==', indicatorId)
          .limit(20)
          .get(),
        8000,
        'QI comments'
      );
      var comments = snap.docs.map(function (doc) {
        return Object.assign({ id: doc.id }, doc.data() || {});
      });
      comments.sort(function (a, b) {
        var aTime = a.updatedAt && a.updatedAt.toMillis ? a.updatedAt.toMillis()
          : (a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0);
        var bTime = b.updatedAt && b.updatedAt.toMillis ? b.updatedAt.toMillis()
          : (b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0);
        return aTime - bTime;
      });
      return comments.length ? comments[comments.length - 1] : null;
    } catch (error) {
      console.warn('QI comment list fallback failed', error);
      return null;
    }
  }

  async function loadComments(providerId, scoreMonth, indicatorId) {
    var comment = await loadSupervisorComment(providerId, scoreMonth, indicatorId);
    return comment ? [comment] : [];
  }

  function formatMonthLabel(month, lang) {
    var Scoring = global.QualityScoring;
    if (Scoring && typeof Scoring.monthLabel === 'function') {
      return Scoring.monthLabel(month, lang);
    }
    if (month === 'all') return lang === 'en' ? 'All time' : 'အချိန်အားလုံး';
    return String(month || '—');
  }

  function knownPlanMonths() {
    var Scoring = global.QualityScoring;
    if (Scoring && typeof Scoring.recentMonthKeys === 'function') {
      return ['all'].concat(Scoring.recentMonthKeys(Scoring.currentYangonMonthKey(new Date()), 18));
    }
    var keys = ['all'];
    var cursor = Scoring.currentYangonMonthKey(new Date());
    for (var i = 0; i < 18 && cursor; i++) {
      keys.push(cursor);
      cursor = Scoring.previousMonthKey(cursor);
    }
    return keys;
  }

  async function loadActionPlans(providerId) {
    var Scoring = global.QualityScoring;
    var byId = {};
    var addPlan = function (docSnap) {
      if (!docSnap || !docSnap.exists) return;
      var data = Object.assign({ id: docSnap.id }, docSnap.data() || {});
      byId[docSnap.id] = data;
    };
    var readDoc = function (docId) {
      return withTimeout(
        firebase.firestore().collection('quality_improvement_plans').doc(docId).get(),
        8000,
        'QI plan'
      ).then(addPlan).catch(function (error) {
        console.warn('QI plan read failed', docId, error);
        return null;
      });
    };

    try {
      var snap = await withTimeout(
        firebase.firestore().collection('quality_improvement_plans')
          .where('providerId', '==', providerId)
          .limit(36)
          .get(),
        8000,
        'Review actions'
      );
      snap.docs.forEach(addPlan);
    } catch (error) {
      console.warn('QI action plan query unavailable, reading known months', error);
    }

    var ids = knownPlanMonths().map(function (month) {
      return Scoring.planDocId(providerId, month);
    });
    await Promise.all(ids.map(readDoc));

    return Object.keys(byId).map(function (id) { return byId[id]; }).sort(function (a, b) {
      return String(b.scoreMonth || '').localeCompare(String(a.scoreMonth || ''));
    });
  }

  async function loadSavedActions(providerId) {
    var Scoring = global.QualityScoring;
    var byIndicator = {};
    var addAction = function (action, fallbackId) {
      if (!action || typeof action !== 'object') return;
      var indicatorId = action.indicatorId || fallbackId;
      if (!indicatorId || !isSavedAction(action)) return;
      byIndicator[indicatorId] = Object.assign({ indicatorId: indicatorId }, action);
    };

    try {
      var snap = await withTimeout(
        firebase.firestore().collection('quality_improvement_actions')
          .where('providerId', '==', providerId)
          .limit(50)
          .get(),
        8000,
        'Saved actions'
      );
      snap.docs.forEach(function (docSnap) {
        addAction(Object.assign({ id: docSnap.id }, docSnap.data() || {}));
      });
    } catch (error) {
      console.warn('QI action query unavailable, reading known action docs', error);
    }

    var actionReads = Scoring.INDICATOR_DEFS.map(function (indicator) {
      return withTimeout(
        firebase.firestore().collection('quality_improvement_actions')
          .doc(actionDocId(providerId, indicator.id))
          .get(),
        8000,
        'QI action'
      ).then(function (docSnap) {
        if (docSnap && docSnap.exists) {
          addAction(Object.assign({ id: docSnap.id }, docSnap.data() || {}), indicator.id);
        }
      }).catch(function (error) {
        console.warn('QI action read failed', indicator.id, error);
      });
    });
    await Promise.all(actionReads);

    if (!Object.keys(byIndicator).length) {
      var plans = await loadActionPlans(providerId);
      plans.forEach(function (plan) {
        var indicators = extractIndicators(plan);
        Object.keys(indicators).forEach(function (indicatorId) {
          if (byIndicator[indicatorId]) return;
          addAction(Object.assign({
            providerId: plan.providerId,
            scoreMonth: plan.scoreMonth,
            targetMonth: plan.targetMonth
          }, indicators[indicatorId] || {}), indicatorId);
        });
      });
    }

    return Object.keys(byIndicator).map(function (id) { return byIndicator[id]; }).sort(function (a, b) {
      return String(b.updatedAt || b.scoreMonth || '').localeCompare(String(a.updatedAt || a.scoreMonth || ''));
    });
  }

  async function saveSupervisorComment(viewer, providerId, scoreMonth, indicatorId, text) {
    if (!isSupervisorRole(viewer.role)) {
      throw new Error('Only TMO and above can comment');
    }
    var body = String(text || '').trim();
    if (!body) throw new Error('Enter a comment');
    var Scoring = global.QualityScoring;
    var planId = Scoring.planDocId(providerId, scoreMonth);
    var planRef = firebase.firestore().collection('quality_improvement_plans').doc(planId);
    await planRef.set({
      providerId: providerId,
      scoreMonth: scoreMonth,
      targetMonth: Scoring.nextMonthKey(scoreMonth) || scoreMonth,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    var existing = await loadSupervisorComment(providerId, scoreMonth, indicatorId);
    var payload = {
      indicatorId: indicatorId,
      text: body,
      authorId: viewer.uid,
      authorName: viewer.name || '',
      authorRole: viewer.role,
      township: viewer.township || '',
      region: viewer.region || '',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (existing && existing.createdAt) payload.createdAt = existing.createdAt;
    else payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    await commentRef(providerId, scoreMonth, indicatorId).set(payload, { merge: true });
    return loadSupervisorComment(providerId, scoreMonth, indicatorId);
  }

  async function addSupervisorComment(viewer, providerId, scoreMonth, indicatorId, text) {
    return saveSupervisorComment(viewer, providerId, scoreMonth, indicatorId, text);
  }

  async function loadActiveTargetsForMidwife(providerId, now) {
    var Scoring = global.QualityScoring;
    var currentMonth = Scoring.currentYangonMonthKey(now);
    var previousMonth = Scoring.previousMonthKey(currentMonth);
    var months = knownPlanMonths();
    var plans = await Promise.all(months.map(function (month) {
      return loadActionPlan(providerId, month);
    }));
    var targets = {};
    plans.forEach(function (plan) {
      Scoring.INDICATOR_DEFS.forEach(function (indicator) {
        if (targets[indicator.id]) return;
        var entry = plan.indicators && plan.indicators[indicator.id];
        if (!entry || !Scoring.isValidTargetPercent(entry.nextTargetPercent)) return;
        var dueMonth = Scoring.isMonthKey(entry.targetMonth)
          ? entry.targetMonth
          : (Scoring.isMonthKey(plan.targetMonth) ? plan.targetMonth : Scoring.nextMonthKey(plan.scoreMonth));
        if (dueMonth !== currentMonth) return;
        targets[indicator.id] = {
          percent: Number(entry.nextTargetPercent),
          reasonCategory: entry.reasonCategory || '',
          explanation: entry.explanation || '',
          scoreMonth: plan.scoreMonth || previousMonth,
          targetMonth: dueMonth,
          indicator: indicator
        };
      });
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
    loadTownshipTmo: loadTownshipTmo,
    loadProviderMonthSummary: loadProviderMonthSummary,
    computeProviderMonthSummary: computeProviderMonthSummary,
    clearSummaryCache: clearSummaryCache,
    loadActionPlan: loadActionPlan,
    isSavedAction: isSavedAction,
    extractIndicators: extractIndicators,
    formatMonthLabel: formatMonthLabel,
    loadActionPlans: loadActionPlans,
    loadSavedActions: loadSavedActions,
    saveActionPlanIndicator: saveActionPlanIndicator,
    loadComments: loadComments,
    loadSupervisorComment: loadSupervisorComment,
    saveSupervisorComment: saveSupervisorComment,
    addSupervisorComment: addSupervisorComment,
    loadActiveTargetsForMidwife: loadActiveTargetsForMidwife
  };
})(typeof window !== 'undefined' ? window : this);
