/* Vancomycin TDM Production Calculation Engine v3.0
   For pharmacist-supervised TDM and institutional validation only.
   Not a certified medical device.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VancoEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const LIMITS = {
    aucMin: 400,
    aucMax: 600,
    aucToxic: 650,
    maxLoadingDose: 3000,
    maxSingleDose: 3000,
    maxDailyDose: 4500,
    minDose: 250,
    doseRound: 250,
    maxInfusionRateMgMin: 10,
    residualSigmaMgL: 2.5,
    minCL: 0.05,
    maxCL: 15,
    minVd: 10,
    maxVd: 300
  };

  function num(x, fallback = null) {
    const n = Number(x);
    return Number.isFinite(n) ? n : fallback;
  }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function roundTo(x, step = LIMITS.doseRound) { return Math.round(x / step) * step; }
  function safePow(x, p) { return Math.pow(Math.max(x, 1e-9), p); }

  function ibw(heightCm, sex) {
    const inchesOver60 = (heightCm - 152.4) / 2.54;
    return (sex === 'female' ? 45.5 : 50) + 2.3 * inchesOver60;
  }
  function bmi(weight, heightCm) { return weight / Math.pow(heightCm / 100, 2); }
  function bsa(weight, heightCm) { return Math.sqrt((heightCm * weight) / 3600); }
  function adjbw(tbw, ibwKg) { return ibwKg + 0.4 * (tbw - ibwKg); }
  function crclCockcroftGault({ age, weight, scr, sex, height }) {
    const b = height ? bmi(weight, height) : null;
    let wt = weight;
    if (b && b >= 30) wt = adjbw(weight, ibw(height, sex));
    let crcl = ((140 - age) * wt) / (72 * scr);
    if (sex === 'female') crcl *= 0.85;
    return Math.max(0, crcl);
  }
  function crclPer173(crcl, bsaValue) { return crcl / Math.max(bsaValue || 1.73, 0.5) * 1.73; }

  function enrichPatient(input) {
    const p = {
      weight: num(input.weight),
      height: num(input.height),
      age: num(input.age),
      sex: input.sex || input.gender || 'male',
      scr: num(input.scr),
      criticallyIll: !!input.criticallyIll,
      dialysis: !!input.dialysis,
      renalImpairment: !!input.renalImpairment,
      hepaticImpairment: !!input.hepaticImpairment,
      mic: num(input.mic, 1)
    };
    p.bmi = p.weight && p.height ? bmi(p.weight, p.height) : null;
    p.bsa = p.weight && p.height ? bsa(p.weight, p.height) : null;
    p.ibw = p.height ? ibw(p.height, p.sex) : null;
    p.adjbw = p.bmi && p.bmi >= 30 ? adjbw(p.weight, p.ibw) : p.weight;
    p.crcl = p.dialysis ? 3.5 : crclCockcroftGault({ age: p.age, weight: p.weight, scr: p.scr, sex: p.sex, height: p.height });
    p.crcl173 = crclPer173(p.crcl, p.bsa);
    p.isPediatric = p.age && p.age < 18;
    return p;
  }

  const MODELS = {
    buelga: {
      name: 'Buelga 2005', badge: 'buelga', description: 'ผู้ป่วยทั่วไป',
      cvCL: 0.28, cvVd: 0.37,
      applies: p => !p.criticallyIll && (!p.bmi || p.bmi < 30),
      one: p => ({ cl: clamp(1.08 * (p.crcl * 0.06), LIMITS.minCL, LIMITS.maxCL), vd: clamp(0.98 * p.weight, LIMITS.minVd, LIMITS.maxVd) })
    },
    adane: {
      name: 'Adane 2015', badge: 'adane', description: 'ผู้ป่วยอ้วนมาก',
      cvCL: 0.35, cvVd: 0.30,
      applies: p => !p.criticallyIll && p.bmi >= 40 && p.weight >= 120,
      one: p => ({ cl: clamp(6.54 * (p.crcl / 125), LIMITS.minCL, LIMITS.maxCL), vd: clamp(0.51 * p.weight, LIMITS.minVd, LIMITS.maxVd) })
    },
    roberts: {
      name: 'Roberts 2011', badge: 'roberts', description: 'ผู้ป่วยอาการหนัก',
      cvCL: 0.39, cvVd: 0.37,
      applies: p => p.criticallyIll && (!p.bmi || p.bmi < 30),
      one: p => ({ cl: clamp(4.58 * (p.crcl173 / 100), LIMITS.minCL, LIMITS.maxCL), vd: clamp(1.53 * p.weight, LIMITS.minVd, LIMITS.maxVd) })
    },
    masich: {
      name: 'Masich 2020', badge: 'masich', description: 'ผู้ป่วยอาการหนัก + อ้วน',
      cvCL: 0.40, cvVd: 0.35,
      applies: p => p.criticallyIll && p.bmi >= 30 && p.weight > 100,
      one: p => ({ cl: clamp(3.23 * safePow(p.crcl / 40, 0.69), LIMITS.minCL, LIMITS.maxCL), vd: clamp(0.78 * p.weight, LIMITS.minVd, LIMITS.maxVd) })
    }
  };
  function selectModel(patient) {
    if (patient.dialysis) return MODELS.buelga;
    if (MODELS.masich.applies(patient)) return MODELS.masich;
    if (MODELS.adane.applies(patient)) return MODELS.adane;
    if (MODELS.roberts.applies(patient)) return MODELS.roberts;
    return MODELS.buelga;
  }
  function getInfusionTimeHours(doseMg) {
    return Math.max(1, doseMg / (LIMITS.maxInfusionRateMgMin * 60));
  }
  function auc24(doseMg, intervalHr, clLh) { return (doseMg * (24 / intervalHr)) / clLh; }
  function ke(pk) { return pk.cl / pk.vd; }
  function halfLife(pk) { return 0.693 / ke(pk); }
  function concentrationOneComp(doseMg, intervalHr, timeAfterDoseStartHr, pk, infusionHr = getInfusionTimeHours(doseMg)) {
    const k = ke(pk), R0 = doseMg / infusionHr;
    const t = ((timeAfterDoseStartHr % intervalHr) + intervalHr) % intervalHr;
    const denom = Math.max(1 - Math.exp(-k * intervalHr), 1e-12);
    if (t <= infusionHr) {
      const pre = (R0 / pk.cl) * (Math.exp(-k * (intervalHr - infusionHr + t)) * (1 - Math.exp(-k * infusionHr)) / denom);
      const during = (R0 / pk.cl) * (1 - Math.exp(-k * t));
      return pre + during;
    }
    const cmax = (R0 / pk.cl) * (1 - Math.exp(-k * infusionHr)) / denom;
    return cmax * Math.exp(-k * (t - infusionHr));
  }
  function predictedPeakTrough(dose, interval, pk) {
    const tin = getInfusionTimeHours(dose);
    return {
      peak: concentrationOneComp(dose, interval, tin + 1, pk, tin),
      trough: concentrationOneComp(dose, interval, interval, pk, tin),
      truePeak: concentrationOneComp(dose, interval, tin, pk, tin),
      tin
    };
  }
  function observedPkFromTwoLevels({ dose, interval, peak, trough, peakTime, troughTime }) {
    const tin = getInfusionTimeHours(dose);
    const t1 = num(peakTime, tin + 1), t2 = num(troughTime, interval);
    if (!(peak > 0 && trough > 0 && peak > trough && t2 > t1)) throw new Error('Peak ต้องมากกว่า Trough และ Trough Time ต้องมากกว่า Peak Time');
    const k = Math.log(peak / trough) / (t2 - t1);
    if (!Number.isFinite(k) || k <= 0) throw new Error('คำนวณ elimination rate ไม่ได้');
    const cmaxEoi = peak * Math.exp(k * (t1 - tin));
    const denom = k * cmaxEoi * Math.max(1 - Math.exp(-k * interval), 1e-12);
    const vd = clamp((dose / tin) * (1 - Math.exp(-k * tin)) / denom, LIMITS.minVd, LIMITS.maxVd);
    const cl = clamp(k * vd, LIMITS.minCL, LIMITS.maxCL);
    return { cl, vd, ke: k, halfLife: 0.693 / k, cTruePeak: cmaxEoi, cTrueTrough: cmaxEoi * Math.exp(-k * (interval - tin)), tin };
  }
  function bayesianMapGrid({ priorPk, model, levels, dose, interval, priorConfidence='medium' }) {
    const conf = { low: 1.6, medium: 1.0, high: 0.65 }[priorConfidence] || 1.0;
    const cvCL = (model.cvCL || 0.35) * conf;
    const cvVd = (model.cvVd || 0.35) * conf;
    const sigma = LIMITS.residualSigmaMgL;
    let best = { obj: Infinity, cl: priorPk.cl, vd: priorPk.vd };
    const clMin = clamp(priorPk.cl * 0.25, LIMITS.minCL, LIMITS.maxCL), clMax = clamp(priorPk.cl * 3.2, LIMITS.minCL, LIMITS.maxCL);
    const vdMin = clamp(priorPk.vd * 0.4, LIMITS.minVd, LIMITS.maxVd), vdMax = clamp(priorPk.vd * 2.2, LIMITS.minVd, LIMITS.maxVd);
    for (let i=0;i<=48;i++) {
      const cl = clMin * Math.pow(clMax / clMin, i / 48);
      for (let j=0;j<=48;j++) {
        const vd = vdMin * Math.pow(vdMax / vdMin, j / 48);
        const pk = { cl, vd };
        let obj = Math.pow(Math.log(cl / priorPk.cl) / cvCL, 2) + Math.pow(Math.log(vd / priorPk.vd) / cvVd, 2);
        for (const lv of levels) {
          const pred = concentrationOneComp(dose, interval, lv.time, pk);
          obj += Math.pow((lv.value - pred) / sigma, 2);
        }
        if (obj < best.obj) best = { obj, cl, vd };
      }
    }
    return { cl: best.cl, vd: best.vd, ke: best.cl / best.vd, halfLife: 0.693 / (best.cl / best.vd), objective: best.obj };
  }
  function combineWithObserved(priorPk, obsPk, model, priorConfidence='medium') {
    const conf = { low: 0.35, medium: 0.5, high: 0.7 }[priorConfidence] || 0.5; // weight to prior
    const cl = clamp(conf * priorPk.cl + (1-conf) * obsPk.cl, LIMITS.minCL, LIMITS.maxCL);
    const vd = clamp(conf * priorPk.vd + (1-conf) * obsPk.vd, LIMITS.minVd, LIMITS.maxVd);
    return { cl, vd, ke: cl / vd, halfLife: 0.693 / (cl / vd), observed: obsPk };
  }
  function estimatePk({ patient, dose, interval, peak, trough, peakTime, troughTime, method='auto', priorConfidence='medium' }) {
    const model = selectModel(patient);
    const base = model.one(patient);
    const priorPk = { ...base, ke: base.cl/base.vd, halfLife: 0.693/(base.cl/base.vd), model: model.name, modelKey: Object.keys(MODELS).find(k=>MODELS[k]===model), badge:model.badge };
    const hasPeak = Number.isFinite(num(peak));
    const hasTrough = Number.isFinite(num(trough));
    if (method === 'population' || (!hasPeak && !hasTrough)) return { finalPk: priorPk, priorPk, model, usedBayesian:false, method:'Population PK' };
    if (hasPeak && hasTrough) {
      try {
        const obs = observedPkFromTwoLevels({dose, interval, peak:num(peak), trough:num(trough), peakTime:num(peakTime), troughTime:num(troughTime, interval)});
        const finalPk = combineWithObserved(priorPk, obs, model, priorConfidence);
        finalPk.model = model.name; finalPk.modelKey=priorPk.modelKey; finalPk.badge=model.badge;
        return { finalPk, priorPk, observedPk: obs, model, usedBayesian:true, method:'MAP + Two-level PK' };
      } catch (e) {
        return { finalPk: priorPk, priorPk, model, usedBayesian:false, method:'Population PK', error:e.message };
      }
    }
    const levels=[];
    if (hasPeak) levels.push({ value:num(peak), time:num(peakTime, getInfusionTimeHours(dose)+1) });
    if (hasTrough) levels.push({ value:num(trough), time:num(troughTime, interval) });
    const finalPk = bayesianMapGrid({ priorPk, model, levels, dose, interval, priorConfidence });
    finalPk.model = model.name; finalPk.modelKey=priorPk.modelKey; finalPk.badge=model.badge;
    return { finalPk, priorPk, model, usedBayesian:true, method:'Bayesian MAP (single level)' };
  }
  function chooseInterval(patient) {
    if (patient.dialysis) return 48;
    if (patient.crcl >= 120) return 8;
    if (patient.crcl >= 50) return 12;
    if (patient.crcl >= 25) return 24;
    return 48;
  }
  function recommendMaintenance({ patient, targetAUC = 500, interval=null, pk=null }) {
    const model = selectModel(patient); const prior = pk || model.one(patient);
    const tau = interval || chooseInterval(patient);
    let dose = roundTo((targetAUC * prior.cl) / (24/tau), LIMITS.doseRound);
    dose = clamp(dose, LIMITS.minDose, LIMITS.maxSingleDose);
    const daily = dose * (24/tau);
    if (daily > LIMITS.maxDailyDose) dose = roundTo((LIMITS.maxDailyDose)/(24/tau), LIMITS.doseRound);
    return { dose, interval: tau, auc: auc24(dose,tau,prior.cl), pk: prior, model:model.name };
  }
  function recommendLoading(patient, severity='normal') {
    let mgkg = patient.criticallyIll || severity === 'severe' ? 25 : 20;
    if (patient.bmi >= 30) mgkg = patient.criticallyIll ? 25 : 20;
    const dose = roundTo(clamp(patient.weight * mgkg, 500, LIMITS.maxLoadingDose), LIMITS.doseRound);
    return { dose, mgkg, weight: patient.weight, infusionMinutes: Math.ceil(getInfusionTimeHours(dose)*60) };
  }
  function adjustDose({ currentDose, interval, currentAUC, targetAUC }) {
    let newDose = roundTo(currentDose * (targetAUC / currentAUC), LIMITS.doseRound);
    newDose = clamp(newDose, LIMITS.minDose, LIMITS.maxSingleDose);
    return { newDose, percentChange: ((newDose-currentDose)/currentDose)*100 };
  }
  function safety({ auc, trough, patient }) {
    const alerts=[];
    if (patient && patient.dialysis) alerts.push({type:'danger', text:'ผู้ป่วย RRT/HD: ควรใช้ dose-by-level และ protocol เฉพาะของหน่วยงาน'});
    if (patient && patient.renalImpairment) alerts.push({type:'warning', text:'ไตทำงานไม่คงที่: ควรใช้ TDM ถี่ขึ้นและตรวจ SCr ซ้ำ'});
    if (auc > LIMITS.aucToxic) alerts.push({type:'danger', text:'AUC > 650 mg·h/L: เสี่ยง nephrotoxicity สูง'});
    else if (auc > LIMITS.aucMax) alerts.push({type:'warning', text:'AUC > 600 mg·h/L: สูงกว่าเป้าหมาย'});
    else if (auc < LIMITS.aucMin) alerts.push({type:'warning', text:'AUC < 400 mg·h/L: อาจต่ำกว่าเป้าหมายการรักษา'});
    if (trough && trough > 20) alerts.push({type:'warning', text:'Predicted trough >20 mg/L'});
    if (trough && trough > 25) alerts.push({type:'danger', text:'Predicted trough >25 mg/L: ควรพิจารณาลด dose/ยืด interval'});
    return alerts;
  }
  function buildProfile(dose, interval, pk, hours=48, step=0.5) {
    const pts=[]; const tin=getInfusionTimeHours(dose);
    for (let t=0; t<=hours+1e-9; t+=step) pts.push({ time:+t.toFixed(2), conc: concentrationOneComp(dose, interval, t, pk, tin) });
    return pts;
  }
  function runCase(input) {
    const patient = enrichPatient(input);
    const targetAUC = num(input.targetAUC, 500);
    const interval = num(input.interval, chooseInterval(patient));
    const dose = num(input.dose || input.currentDose, null);
    const est = estimatePk({ patient, dose: dose || 1000, interval, peak: input.peakLevel, trough: input.troughLevel, peakTime: input.peakTime, troughTime: input.troughTime, method: input.method || input.modelingMethod || 'auto', priorConfidence: input.priorConfidence || 'medium' });
    const pk = est.finalPk;
    const maint = dose ? null : recommendMaintenance({patient, targetAUC, interval, pk});
    const currentDose = dose || maint.dose;
    const tau = interval || maint.interval;
    const currentAUC = auc24(currentDose, tau, pk.cl);
    const adj = adjustDose({ currentDose, interval: tau, currentAUC, targetAUC });
    const pred = predictedPeakTrough(adj.newDose, tau, pk);
    return { patient, estimate:est, pk, currentDose, interval:tau, currentAUC, adjustedDose:adj.newDose, percentChange:adj.percentChange, expectedAUC:auc24(adj.newDose,tau,pk.cl), predicted:pred, loading:recommendLoading(patient), safety:safety({auc:auc24(adj.newDose,tau,pk.cl), trough:pred.trough, patient}) };
  }
  return { LIMITS, MODELS, num, clamp, roundTo, enrichPatient, selectModel, getInfusionTimeHours, auc24, ke, halfLife, concentrationOneComp, predictedPeakTrough, observedPkFromTwoLevels, estimatePk, recommendMaintenance, recommendLoading, adjustDose, safety, buildProfile, runCase };
});
