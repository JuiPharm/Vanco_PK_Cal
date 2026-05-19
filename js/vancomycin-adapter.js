(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const num = id => Number($(id)?.value);
  const val = id => String($(id)?.value || '').trim();
  const checked = id => !!$(id)?.checked;

  function dateFromLocal(id) {
    const v = val(id);
    return v ? new Date(v).toISOString() : null;
  }

  function buildDoseHistory() {
    const start = dateFromLocal('firstDoseStart');
    const doseMg = num('doseMg');
    const tauHr = num('tauHr');
    const infusionHr = num('infusionHr') || window.VancomycinEngine.utils.minInfusionHr(doseMg);
    const count = Math.max(0, Math.floor(num('doseCount') || 0));
    if (!start || !doseMg || !tauHr || !count) return [];
    const t0 = new Date(start).getTime();
    return Array.from({ length: count }, (_, i) => ({
      start: new Date(t0 + i * tauHr * 3600 * 1000).toISOString(),
      doseMg,
      infusionHr
    }));
  }

  function buildSamples() {
    const samples = [];
    const t1 = dateFromLocal('level1Time'), l1 = num('level1');
    const t2 = dateFromLocal('level2Time'), l2 = num('level2');
    if (t1 && Number.isFinite(l1) && l1 > 0) samples.push({ time: t1, levelMgL: l1 });
    if (t2 && Number.isFinite(l2) && l2 > 0) samples.push({ time: t2, levelMgL: l2 });
    return samples;
  }

  function collectInput() {
    const notes = [];
    if (checked('nephrotoxin')) notes.push('nephrotoxin');
    return {
      structure: val('pkStructure') || '1cpt',
      forcedModel: val('forcedModel') || undefined,
      targetAuc: num('targetAuc') || 500,
      mic: num('mic') || 1,
      seriousInfection: checked('seriousInfection'),
      notes,
      patient: {
        age: num('age'),
        sex: val('sex') || 'M',
        heightCm: num('heightCm'),
        weightKg: num('weightKg'),
        scrMgDl: num('scrMgDl'),
        criticalIll: checked('criticalIll'),
        unstableRenal: checked('unstableRenal'),
        dialysis: val('dialysisMode') || null,
        ecmo: checked('ecmo')
      },
      doses: buildDoseHistory(),
      samples: buildSamples()
    };
  }

  function pill(text) {
    const cls = text.includes('HARD') || text.includes('TOO_HIGH') || text.includes('THERAPY') || text.includes('UNSUPPORTED') || text.includes('AKI') || text.includes('UNSTABLE') ? 'danger' : (text === '—' ? '' : 'warn');
    return `<span class="pill ${cls}">${text}</span>`;
  }

  function renderResult(res) {
    $('resultModel').textContent = `${res.posterior.priorModel || res.posterior.structure} (${res.posterior.confidence})`;
    $('resultCL').textContent = `${res.posterior.CL.toFixed(2)} L/h`;
    $('resultAUC').textContent = `${res.recommendation.auc24.toFixed(0)} mg·h/L`;
    $('resultDose').textContent = `${res.recommendation.doseMg} mg q${res.recommendation.tauHr}h`;
    $('resultInfusion').textContent = `${res.recommendation.infusionHr.toFixed(1)} h`;
    $('resultLoading').textContent = res.loadingDose ? `${res.loadingDose.doseMg} mg over ${res.loadingDose.infusionHr.toFixed(1)} h` : '—';
    $('resultWarnings').innerHTML = res.warnings.length ? res.warnings.map(pill).join('') : pill('—');
    const rows = res.options.map(o => `<tr><td>${o.doseMg} mg q${o.tauHr}h</td><td>${o.auc24.toFixed(0)}</td><td>${o.troughMgL.toFixed(1)}</td></tr>`).join('');
    $('alternativesBody').innerHTML = rows || '<tr><td colspan="3">—</td></tr>';
  }

  function renderError(e) {
    $('resultModel').textContent = 'Hard stop';
    $('resultCL').textContent = '—';
    $('resultAUC').textContent = '—';
    $('resultDose').textContent = '—';
    $('resultInfusion').textContent = '—';
    $('resultLoading').textContent = '—';
    $('resultWarnings').innerHTML = pill(e.message || String(e));
    $('alternativesBody').innerHTML = '<tr><td colspan="3">No automated recommendation</td></tr>';
  }

  function calculate() {
    try { renderResult(window.VancomycinEngine.evaluate(collectInput())); }
    catch (e) { renderError(e); }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('calculateBtn')?.addEventListener('click', calculate);
    calculate();
  });
})();
