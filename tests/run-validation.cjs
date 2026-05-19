const fs = require('fs');
const path = require('path');
const VancoEngine = require('../js/vancomycin-engine.js');
const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'mock-cases.json'), 'utf8'));
const rows=[]; let pass=0;
for (const c of cases) {
  try {
    const r = VancoEngine.runCase({ ...c, method: 'bayesian', priorConfidence: 'medium' });
    const ok = Number.isFinite(r.expectedAUC) && r.adjustedDose >= 250 && r.adjustedDose <= 3000 && r.interval > 0 && r.pk.cl > 0 && r.pk.vd > 0;
    if (ok) pass++;
    rows.push({id:c.id, pass:ok, model:r.estimate.model.name, crcl:r.patient.crcl.toFixed(1), cl:r.pk.cl.toFixed(2), vd:r.pk.vd.toFixed(1), currentAUC:r.currentAUC.toFixed(0), adjustedDose:r.adjustedDose, expectedAUC:r.expectedAUC.toFixed(0), predTrough:r.predicted.trough.toFixed(1), alerts:r.safety.map(a=>a.text).join('|')});
  } catch (e) {
    rows.push({id:c.id, pass:false, error:e.message});
  }
}
const headers = Object.keys(rows[0]);
fs.writeFileSync(path.join(__dirname, 'validation-output.csv'), headers.join(',')+'\n'+rows.map(r=>headers.map(h=>`"${String(r[h]??'').replace(/"/g,'""')}"`).join(',')).join('\n'));
const summary = { total:cases.length, passed:pass, failed:cases.length-pass, generatedAt:new Date().toISOString(), note:'Numerical smoke validation only. Requires institutional clinical validation before patient care use.' };
fs.writeFileSync(path.join(__dirname, 'validation-summary.json'), JSON.stringify(summary,null,2));
console.log(summary);
if (pass !== cases.length) process.exit(1);
