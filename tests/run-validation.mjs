import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const engine = require(path.join(root, 'js/vancomycin-engine.js'));
const cases = JSON.parse(fs.readFileSync(path.join(root, 'tests/mock-cases.json'), 'utf8'));

function toInput(c) {
  const input = {
    structure: '1cpt', targetAuc: 500, mic: c.mic ?? 1, seriousInfection: true,
    notes: c.n || [],
    patient: { age: c.a, sex: c.sx, heightCm: c.ht, weightKg: c.wt, scrMgDl: c.scr, criticalIll: !!c.icu, unstableRenal: !!c.unstableRenal, dialysis: c.dialysis || null, ecmo: !!c.ecmo },
    doses: [], samples: []
  };
  if (c.rg) {
    const t0 = new Date(c.rg.t0).getTime();
    for (let i = 0; i < c.rg.n; i++) input.doses.push({ start: new Date(t0 + i * c.rg.tau * 3600 * 1000).toISOString(), doseMg: c.rg.dose, infusionHr: c.rg.tin });
  }
  if (c.s) input.samples = c.s.map(x => ({ time: new Date(x.t).toISOString(), levelMgL: x.c }));
  return input;
}

const rows = [];
let pass = 0, supported = 0, hardStops = 0;
for (const c of cases) {
  try {
    const out = engine.evaluate(toInput(c));
    const ok = c.exp.supported === true;
    if (ok) pass++;
    supported++;
    rows.push({ id: c.id, disposition: 'supported', model: out.posterior.priorModel, confidence: out.posterior.confidence, cl: +out.posterior.CL.toFixed(3), dose: `${out.recommendation.doseMg} q${out.recommendation.tauHr}h`, auc: +out.recommendation.auc24.toFixed(1), trough: +out.recommendation.troughMgL.toFixed(1), warnings: out.warnings.join('|') || '—', pass: ok });
  } catch (e) {
    const msg = String(e.message || e);
    const ok = c.exp.supported === false && msg === c.exp.flag;
    if (ok) pass++;
    hardStops++;
    rows.push({ id: c.id, disposition: 'hard-stop', model: '—', confidence: '—', cl: '—', dose: '—', auc: '—', trough: '—', warnings: msg, pass: ok });
  }
}

const csv = ['id,disposition,model,confidence,cl,dose,auc,trough,warnings,pass', ...rows.map(r => [r.id,r.disposition,r.model,r.confidence,r.cl,`"${r.dose}"`,r.auc,r.trough,`"${r.warnings}"`,r.pass].join(','))].join('\n');
fs.writeFileSync(path.join(root, 'tests/validation-output.csv'), csv);
const report = { generatedAt: new Date().toISOString(), totalCases: cases.length, passed: pass, failed: cases.length - pass, supported, hardStops, rows };
fs.writeFileSync(path.join(root, 'tests/validation-summary.json'), JSON.stringify(report, null, 2));
console.log(`PASS ${pass}/${cases.length}`);
console.table(rows);
process.exit(pass === cases.length ? 0 : 1);
