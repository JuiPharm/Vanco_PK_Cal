/*
 * vancomycin-engine.js
 * Adult vancomycin AUC-guided TDM calculation engine with MAP Bayesian update.
 * Scope: supervised adult inpatient use after institutional validation only.
 * This is not a standalone certified medical device and must not be used without pharmacist/clinician review.
 */
(function (root) {
  'use strict';

  const CFG = {
    targetAucDefault: 500,
    targetRange: [400, 600],
    alertAuc: 600,
    hardStopAuc: 650,
    maxObeseDailyDose: 4500,
    highDailyDoseWarning: 4000,
    intervalCandidates: [6, 8, 12, 18, 24, 36, 48],
    roundDoseMg: 250,
    maxSingleDoseMg: 3000,
    minDoseMg: 250,
    maxInfusionRateMgMin: 10,
    residue: {
      buelga:  { add: 2.0, prop: 0.12, omegaClCv: 0.30, omegaVCv: 0.25 },
      adane:   { add: 2.0, prop: 0.12, omegaClCv: 0.35, omegaVCv: 0.20 },
      roberts: { add: 2.5, prop: 0.15, omegaClCv: 0.40, omegaVCv: 0.35 },
      masich:  { add: 2.5, prop: 0.15, omegaClCv: 0.40, omegaVCv: 0.30 }
    },
    twoCompDefault: { enabled: false, prior: null }
  };

  const exp = Math.exp, log = Math.log, sqrt = Math.sqrt;
  const roundTo = (x, step) => Math.round(x / step) * step;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const finiteOr = (x, fallback) => Number.isFinite(x) ? x : fallback;

  function toDate(x) { return x instanceof Date ? x : new Date(x); }
  function hoursBetween(a, b) { return (toDate(b).getTime() - toDate(a).getTime()) / 36e5; }
  function bmi(weightKg, heightCm) { return weightKg / ((heightCm / 100) ** 2); }
  function ibw(heightCm, sex) { return (String(sex).toUpperCase().startsWith('F') ? 45.5 : 50) + 0.91 * (heightCm - 152.4); }
  function adjbw(tbw, ibwKg) { return ibwKg + 0.4 * (tbw - ibwKg); }
  function bsa(weightKg, heightCm) { return sqrt((weightKg * heightCm) / 3600); }

  function chooseWeightForCG(p) {
    const i = ibw(p.heightCm, p.sex);
    if (!Number.isFinite(i) || i <= 0) return p.weightKg;
    const ratio = p.weightKg / i;
    if (ratio < 1) return p.weightKg;
    if (ratio <= 1.25 && bmi(p.weightKg, p.heightCm) <= 30) return i;
    return adjbw(p.weightKg, i);
  }

  function cockcroftGault(age, sex, scrMgDl, weightKg) {
    const femaleFactor = String(sex).toUpperCase().startsWith('F') ? 0.85 : 1.0;
    return ((140 - age) * weightKg * femaleFactor) / (72 * scrMgDl);
  }

  function crclSelected(p) { return cockcroftGault(p.age, p.sex, p.scrMgDl, chooseWeightForCG(p)); }
  function egfrNorm173(p) { return crclSelected(p) * 1.73 / bsa(p.weightKg, p.heightCm); }
  function crclTotalBWNorm173(p) { return cockcroftGault(p.age, p.sex, p.scrMgDl, p.weightKg) * 1.73 / bsa(p.weightKg, p.heightCm); }
  function crclIdms(p) { return cockcroftGault(p.age, p.sex, p.scrMgDl * 1.065 + 0.067, chooseWeightForCG(p)); }

  function minInfusionHr(doseMg) {
    return Math.max(1, doseMg / (CFG.maxInfusionRateMgMin * 60));
  }

  function selectPopModel(p, forcedModel) {
    const wt = p.weightKg;
    const bodyMassIndex = bmi(wt, p.heightCm);
    const make = (model) => {
      switch (model) {
        case 'masich': return { model: 'masich', CL: 3.23 * Math.pow(Math.max(crclSelected(p), 1) / 40, 0.69), V: 0.78 * wt, applicability: (bodyMassIndex >= 30 && wt > 100 && p.criticalIll) ? 'green' : 'amber' };
        case 'roberts': return { model: 'roberts', CL: 4.58 * Math.max(egfrNorm173(p), 1) / 100, V: 1.53 * wt, applicability: p.criticalIll ? 'green' : 'amber' };
        case 'adane': return { model: 'adane', CL: 6.54 * Math.max(crclTotalBWNorm173(p), 1) / 125, V: 0.51 * wt, applicability: (bodyMassIndex > 40 && wt >= 120 && !p.criticalIll) ? 'green' : 'amber' };
        case 'buelga':
        default: return { model: 'buelga', CL: Math.round(Math.max(crclIdms(p), 1)) * 60 / 1000 * 1.08, V: 0.98 * wt, applicability: (!p.criticalIll && !(bodyMassIndex > 40 && wt >= 120)) ? 'green' : 'amber' };
      }
    };
    if (forcedModel) return make(forcedModel);
    if (p.criticalIll && bodyMassIndex >= 30 && wt > 100) return make('masich');
    if (p.criticalIll) return make('roberts');
    if (bodyMassIndex > 40 && wt >= 120) return make('adane');
    return make('buelga');
  }

  function concentration1CptAt(time, doses, CL, V) {
    const k = CL / V;
    let c = 0;
    for (const d of doses || []) {
      const dt = hoursBetween(d.start, time);
      if (dt <= 0) continue;
      const infusionHr = Math.max(d.infusionHr || minInfusionHr(d.doseMg), 1e-6);
      const rate = d.doseMg / infusionHr;
      if (dt <= infusionHr) {
        c += (rate / CL) * (1 - exp(-k * dt));
      } else {
        c += (rate / CL) * (1 - exp(-k * infusionHr)) * exp(-k * (dt - infusionHr));
      }
    }
    return Math.max(c, 0);
  }

  function twoCompMicro(par) {
    const { CL, V1, Q, V2 } = par;
    const k10 = CL / V1, k12 = Q / V1, k21 = Q / V2;
    const s = k10 + k12 + k21;
    const disc = Math.max(0, s * s - 4 * k21 * k10);
    const alpha = (s + sqrt(disc)) / 2;
    const beta = (s - sqrt(disc)) / 2;
    const A = (alpha - k21) / (V1 * (alpha - beta));
    const B = (k21 - beta) / (V1 * (alpha - beta));
    return { alpha, beta, A, B };
  }

  function concentration2CptAt(time, doses, par) {
    const { alpha, beta, A, B } = twoCompMicro(par);
    let c = 0;
    for (const d of doses || []) {
      const dt = hoursBetween(d.start, time);
      if (dt <= 0) continue;
      const infusionHr = Math.max(d.infusionHr || minInfusionHr(d.doseMg), 1e-6);
      const R = d.doseMg / infusionHr;
      if (dt <= infusionHr) {
        c += R * (A * (1 - exp(-alpha * dt)) / alpha + B * (1 - exp(-beta * dt)) / beta);
      } else {
        c += R * (
          A * (1 - exp(-alpha * infusionHr)) / alpha * exp(-alpha * (dt - infusionHr)) +
          B * (1 - exp(-beta * infusionHr)) / beta * exp(-beta * (dt - infusionHr))
        );
      }
    }
    return Math.max(c, 0);
  }

  function cvToLogSd(cv) { return sqrt(log(cv * cv + 1)); }

  function nelderMead(f, x0, step = 0.1, maxIter = 600) {
    const n = x0.length;
    const simplex = [x0.slice()];
    for (let i = 0; i < n; i++) { const x = x0.slice(); x[i] += step; simplex.push(x); }
    let vals = simplex.map(f);
    for (let iter = 0; iter < maxIter; iter++) {
      const idx = simplex.map((_, i) => i).sort((a, b) => vals[a] - vals[b]);
      const sorted = idx.map(i => simplex[i]); const sortedVals = idx.map(i => vals[i]);
      simplex.splice(0, simplex.length, ...sorted); vals.splice(0, vals.length, ...sortedVals);
      const best = simplex[0], worst = simplex[n];
      const centroid = Array.from({ length: n }, (_, j) => simplex.slice(0, n).reduce((sum, x) => sum + x[j], 0) / n);
      const reflect = centroid.map((c, j) => c + (c - worst[j]));
      const fr = f(reflect);
      if (fr < vals[0]) {
        const expand = centroid.map((c, j) => c + 2 * (reflect[j] - c)); const fe = f(expand);
        simplex[n] = fe < fr ? expand : reflect; vals[n] = Math.min(fe, fr);
      } else if (fr < vals[n - 1]) {
        simplex[n] = reflect; vals[n] = fr;
      } else {
        const contract = centroid.map((c, j) => c + 0.5 * (worst[j] - c)); const fc = f(contract);
        if (fc < vals[n]) { simplex[n] = contract; vals[n] = fc; }
        else {
          for (let i = 1; i < simplex.length; i++) {
            simplex[i] = simplex[i].map((x, j) => best[j] + 0.5 * (x - best[j])); vals[i] = f(simplex[i]);
          }
        }
      }
      if (Math.max(...vals) - Math.min(...vals) < 1e-7) break;
    }
    const bestI = vals.indexOf(Math.min(...vals));
    return { x: simplex[bestI], fx: vals[bestI] };
  }

  function posterior1Cpt(input) {
    const prior = selectPopModel(input.patient, input.forcedModel);
    const err = CFG.residue[prior.model];
    const mu = [log(Math.max(prior.CL, 1e-6)), log(Math.max(prior.V, 1e-6))];
    const sd = [cvToLogSd(err.omegaClCv), cvToLogSd(err.omegaVCv)];
    const doses = input.doses || [], samples = input.samples || [];
    if (!samples.length) {
      return { structure: '1cpt', priorModel: prior.model, priorApplicability: prior.applicability, priorCL: prior.CL, priorV: prior.V, CL: prior.CL, V: prior.V, kel: prior.CL / prior.V, halfLifeHr: 0.693 / (prior.CL / prior.V), confidence: 'prior-only' };
    }
    function objective(x) {
      const CL = exp(x[0]), V = exp(x[1]);
      let val = 0.5 * (((x[0] - mu[0]) / sd[0]) ** 2 + ((x[1] - mu[1]) / sd[1]) ** 2);
      for (const s of samples) {
        const pred = Math.max(1e-6, concentration1CptAt(s.time, doses, CL, V));
        const sigma = sqrt(err.add ** 2 + (err.prop * pred) ** 2);
        val += 0.5 * ((s.levelMgL - pred) / sigma) ** 2 + log(sigma);
      }
      return finiteOr(val, 1e99);
    }
    const opt = nelderMead(objective, mu, 0.15, 900);
    const CL = exp(opt.x[0]), V = exp(opt.x[1]);
    return { structure: '1cpt', priorModel: prior.model, priorApplicability: prior.applicability, priorCL: prior.CL, priorV: prior.V, CL, V, kel: CL / V, halfLifeHr: 0.693 / (CL / V), confidence: samples.length >= 2 ? 'two-level-map' : 'one-level-map' };
  }

  function posterior2Cpt(input) {
    const prior = CFG.twoCompDefault.prior;
    if (!CFG.twoCompDefault.enabled || !prior) throw new Error('TWO_COMP_PRIOR_NOT_VALIDATED');
    const doses = input.doses || [], samples = input.samples || [];
    const mu = [log(prior.CL), log(prior.V1), log(prior.Q), log(prior.V2)];
    const sd = [cvToLogSd(prior.omega.CL), cvToLogSd(prior.omega.V1), cvToLogSd(prior.omega.Q), cvToLogSd(prior.omega.V2)];
    function objective(x) {
      const par = { CL: exp(x[0]), V1: exp(x[1]), Q: exp(x[2]), V2: exp(x[3]) };
      let val = 0;
      for (let i = 0; i < x.length; i++) val += 0.5 * ((x[i] - mu[i]) / sd[i]) ** 2;
      for (const s of samples) {
        const pred = Math.max(1e-6, concentration2CptAt(s.time, doses, par));
        const sigma = sqrt(prior.err.add ** 2 + (prior.err.prop * pred) ** 2);
        val += 0.5 * ((s.levelMgL - pred) / sigma) ** 2 + log(sigma);
      }
      return finiteOr(val, 1e99);
    }
    const opt = nelderMead(objective, mu, 0.12, 1200);
    return { structure: '2cpt', priorModel: prior.modelId, CL: exp(opt.x[0]), V1: exp(opt.x[1]), Q: exp(opt.x[2]), V2: exp(opt.x[3]), confidence: samples.length >= 2 ? 'two-level-map-2cpt' : 'one-level-map-2cpt' };
  }

  function steadyState1Cpt(doseMg, tauHr, infusionHr, CL, V) {
    const k = CL / V;
    const peak = doseMg * (1 - exp(-k * infusionHr)) / (infusionHr * V * k * (1 - exp(-k * tauHr)));
    const trough = peak * exp(-k * (tauHr - infusionHr));
    const auc24 = (doseMg * (24 / tauHr)) / CL;
    return { peak, trough, auc24 };
  }

  function recommendRegimen(par, patient, targetAuc = CFG.targetAucDefault) {
    const CL = par.CL;
    const V = par.structure === '2cpt' ? par.V1 + par.V2 : par.V;
    const hl = 0.693 / (CL / V);
    const targetTau = hl < 6 ? 8 : hl < 12 ? 12 : hl < 24 ? 24 : 36;
    const out = [];
    for (const tauHr of CFG.intervalCandidates) {
      let doseMg = roundTo((targetAuc * CL * tauHr) / 24, CFG.roundDoseMg);
      doseMg = clamp(doseMg, CFG.minDoseMg, CFG.maxSingleDoseMg);
      const infusionHr = minInfusionHr(doseMg);
      const dailyDoseMg = doseMg * (24 / tauHr);
      const ss = steadyState1Cpt(doseMg, tauHr, infusionHr, CL, V);
      let score = Math.abs(ss.auc24 - targetAuc);
      if (ss.auc24 < CFG.targetRange[0]) score += (CFG.targetRange[0] - ss.auc24) * 4;
      if (ss.auc24 > CFG.targetRange[1]) score += (ss.auc24 - CFG.targetRange[1]) * 4;
      if (ss.auc24 > CFG.hardStopAuc) score += 1000;
      if (dailyDoseMg > CFG.maxObeseDailyDose && bmi(patient.weightKg, patient.heightCm) >= 30) score += 300;
      if (dailyDoseMg > CFG.highDailyDoseWarning) score += 80;
      score += Math.abs(tauHr - targetTau) * 1.5;
      if (ss.trough < 8) score += (8 - ss.trough) * 2;
      if (ss.trough > 20) score += (ss.trough - 20) * 4;
      out.push({ doseMg, tauHr, infusionHr, dailyDoseMg, auc24: ss.auc24, peakMgL: ss.peak, troughMgL: ss.trough, score });
    }
    out.sort((a, b) => a.score - b.score);
    return { best: out[0], alternatives: out.slice(0, 3) };
  }

  function buildLoadingDose(patient, seriousInfection = true) {
    if (!seriousInfection) return null;
    const mgkg = bmi(patient.weightKg, patient.heightCm) >= 30 ? 22.5 : (patient.criticalIll ? 25 : 20);
    const doseMg = Math.min(CFG.maxSingleDoseMg, roundTo(patient.weightKg * mgkg, CFG.roundDoseMg));
    return { doseMg, infusionHr: minInfusionHr(doseMg), mgPerKg: mgkg };
  }

  function validateInput(input) {
    if (!input || !input.patient) throw new Error('MISSING_INPUT');
    const p = input.patient;
    const required = ['age','heightCm','weightKg','scrMgDl'];
    for (const k of required) if (!Number.isFinite(Number(p[k])) || Number(p[k]) <= 0) throw new Error(`INVALID_${k.toUpperCase()}`);
    if (p.age < 18) throw new Error('ADULT_ONLY');
    if ((input.mic ?? 1) >= 2) throw new Error('MIC_TOO_HIGH');
    if (p.unstableRenal) throw new Error('UNSTABLE_RENAL_FUNCTION');
    if (['IHD', 'HD', 'CRRT', 'SLED', 'PD'].includes(String(p.dialysis || '').toUpperCase())) throw new Error('RENAL_REPLACEMENT_THERAPY');
    if (p.ecmo) throw new Error('ECMO_UNSUPPORTED_BY_DEFAULT_MODELS');
    for (const s of (input.samples || [])) {
      if (!Number.isFinite(Number(s.levelMgL)) || Number(s.levelMgL) <= 0) throw new Error('INVALID_SAMPLE_LEVEL');
      for (const d of (input.doses || [])) {
        const fromStart = hoursBetween(d.start, s.time);
        const infusionHr = Math.max(Number(d.infusionHr || minInfusionHr(d.doseMg)), 1e-6);
        if (fromStart > 0 && fromStart < infusionHr) throw new Error('SAMPLE_DURING_INFUSION');
      }
    }
    if ((input.samples || []).length && !(input.doses || []).length) throw new Error('SAMPLES_REQUIRE_DOSE_HISTORY');
  }

  function evaluate(input) {
    validateInput(input);
    const patient = input.patient;
    const posterior = input.structure === '2cpt' ? posterior2Cpt(input) : posterior1Cpt(input);
    const dosing = recommendRegimen(posterior, patient, input.targetAuc || CFG.targetAucDefault);
    const warnings = [];
    if (dosing.best.auc24 < CFG.targetRange[0]) warnings.push('AUC_BELOW_TARGET');
    if (dosing.best.auc24 > CFG.alertAuc) warnings.push('AUC_ABOVE_TARGET');
    if (dosing.best.auc24 > CFG.hardStopAuc) warnings.push('AUC_HARD_STOP');
    if (dosing.best.dailyDoseMg > CFG.highDailyDoseWarning) warnings.push('HIGH_DAILY_DOSE');
    if (posterior.priorApplicability === 'amber') warnings.push('MODEL_EXTRAPOLATION_WARNING');
    if ((input.notes || []).includes('concomitant_pip_tazo') || (input.notes || []).includes('nephrotoxin')) warnings.push('NEPHROTOXIN_RISK');
    return {
      ok: true,
      posterior,
      loadingDose: buildLoadingDose(patient, input.seriousInfection !== false),
      recommendation: dosing.best,
      options: dosing.alternatives,
      warnings,
      audit: { timestamp: new Date().toISOString(), version: 'v2.0.0', scope: 'adult-inpatient-default', targetAuc: input.targetAuc || CFG.targetAucDefault }
    };
  }

  const api = { cfg: CFG, utils: { bmi, ibw, adjbw, bsa, cockcroftGault, crclSelected, egfrNorm173, minInfusionHr }, selectPopModel, concentration1CptAt, concentration2CptAt, steadyState1Cpt, evaluate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.VancomycinEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
