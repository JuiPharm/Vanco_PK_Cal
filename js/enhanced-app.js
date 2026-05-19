let oneCompartmentChart;
let twoCompartmentChart;
let comparisonChart;
let oneCompartmentParameters = {};
let twoCompartmentParameters = {};
let bayesianParameters = { oneCompartment: {}, twoCompartment: {} };
let complexityScore = 0;
const INFUSION_RATE = 600; // mg/hour corresponding to max 10 mg/min
const populationModels = VancoEngine.MODELS;

document.addEventListener('DOMContentLoaded', () => {
  initializeRealTimeComplexity();
  const patient = calculatePatientParameters();
  assessComplexity(patient);
});
function $(id){ return document.getElementById(id); }
function fmt(n,d=1){ return Number.isFinite(Number(n)) ? Number(n).toFixed(d) : 'N/A'; }
function alertBox(msg, type='warning') {
  const div = document.createElement('div');
  const cls = type==='danger'?'danger-card pulse-animation': type==='success'?'success-card':'warning-card';
  div.className = `${cls} rounded-xl p-4 shadow-lg mb-3`;
  div.innerHTML = `<i class="fas fa-exclamation-triangle mr-2"></i>${msg}`;
  $('safetyAlerts').appendChild(div);
}
function resetForm() {
  ['weight','height','age','scr','currentDose','peakLevel','troughLevel','troughTime'].forEach(id=>$(id).value='');
  $('gender').value='male'; $('targetAUC').value='500'; $('mic').value='1'; $('interval').value='12'; $('peakTime').value='1'; $('dosesGiven').value='0';
  ['criticallyIll','renalImpairment','dialysis','hepaticImpairment'].forEach(id=>$(id).checked=false);
  $('modelingMethod').value='auto'; $('priorConfidence').value='medium';
  ['patientSummaryCard','bayesianStatusCard','comparisonChartCard'].forEach(id=>$(id).style.display='none');
  $('resultsSection').innerHTML=''; $('safetyAlerts').innerHTML='';
  if (oneCompartmentChart) oneCompartmentChart.destroy(); if (twoCompartmentChart) twoCompartmentChart.destroy(); if (comparisonChart) comparisonChart.destroy();
  updateComplexityPanel(0, ['กรุณากรอกข้อมูลผู้ป่วย']);
}
function initializeRealTimeComplexity() {
  document.querySelectorAll('input,select').forEach(el => el.addEventListener('input', () => assessComplexity(calculatePatientParameters())));
  document.querySelectorAll('input,select').forEach(el => el.addEventListener('change', () => assessComplexity(calculatePatientParameters())));
}
function calculatePatientParameters() {
  const raw = { weight: parseFloat($('weight').value), height: parseFloat($('height').value), age: parseFloat($('age').value), sex: $('gender').value, scr: parseFloat($('scr').value), criticallyIll: $('criticallyIll').checked, renalImpairment: $('renalImpairment').checked, dialysis: $('dialysis').checked, hepaticImpairment: $('hepaticImpairment').checked, mic: parseFloat($('mic').value)||1 };
  if (!raw.weight || !raw.height || !raw.age || !raw.scr) return { ...raw, weight:raw.weight||null, height:raw.height||null, age:raw.age||null, scr:raw.scr||null, gender:raw.sex, crCl:null, bmi:null, bsa:null, adjustedWeight:null, idealWeight:null, isPediatric:false };
  const p = VancoEngine.enrichPatient(raw);
  return { ...p, gender:p.sex, crCl:p.crcl, adjustedWeight:p.adjbw, idealWeight:p.ibw };
}
function assessComplexity(patient) {
  let score=0, factors=[];
  if (!patient.weight || !patient.height || !patient.age || !patient.scr) { complexityScore=0; updateComplexityPanel(0,['กรุณากรอกข้อมูลเพิ่ม']); return 0; }
  if (patient.bmi>=40) { score+=30; factors.push('BMI ≥ 40 (อ้วนมาก)'); } else if (patient.bmi>=30) { score+=15; factors.push('BMI ≥ 30 (อ้วน)'); }
  if (patient.age>=75) { score+=20; factors.push('อายุ ≥ 75 ปี'); } else if (patient.age>=65) { score+=10; factors.push('อายุ ≥ 65 ปี'); }
  if (patient.dialysis) { score+=40; factors.push('รับการฟอกไต'); } else if (patient.crCl<30) { score+=30; factors.push('CrCl < 30'); } else if (patient.crCl<50) { score+=20; factors.push('CrCl < 50'); } else if (patient.crCl>130) { score+=25; factors.push('Augmented renal clearance'); }
  if (patient.criticallyIll) { score+=25; factors.push('ผู้ป่วยอาการหนัก'); }
  if (patient.renalImpairment) { score+=25; factors.push('ไตทำงานไม่คงที่'); }
  if (patient.hepaticImpairment) { score+=10; factors.push('ตับบกพร่อง'); }
  complexityScore=Math.min(score,100); updateComplexityPanel(complexityScore, factors.length?factors:['ไม่มีปัจจัยซับซ้อน']); return complexityScore;
}
function updateComplexityPanel(score, factors) {
  const panel=$('complexityPanel'), fill=$('complexityFill'), text=$('complexityText'), recommendation=$('methodRecommendation');
  panel.style.display='block'; fill.style.width=score+'%';
  let level='ต่ำ', color='complexity-low', method='Population PK';
  if (factors[0]==='กรุณากรอกข้อมูลเพิ่ม' || factors[0]==='กรุณากรอกข้อมูลผู้ป่วย') { level='รอข้อมูล'; method='กรุณากรอกข้อมูลผู้ป่วย'; }
  else if (score<30) { level='ต่ำ (Low)'; method='Population PK'; }
  else if (score<50) { level='ปานกลาง (Medium)'; color='complexity-medium'; method='Population PK หรือ Bayesian'; }
  else if (score<75) { level='สูง (High)'; color='complexity-high'; method='Bayesian Optimization แนะนำ'; }
  else { level='วิกฤต (Critical)'; color='complexity-critical'; method='Bayesian Optimization จำเป็น'; }
  fill.className=`complexity-fill ${color}`; text.innerHTML=`<strong>ระดับความซับซ้อน:</strong> ${level} (${score}%)<br><strong>ปัจจัย:</strong> ${factors.join(', ')}`; recommendation.textContent=method;
}
function selectPopulationModel(patient) {
  const m = VancoEngine.selectModel(patient);
  updateModelBadge(m); return m;
}
function updateModelBadge(model) { const badge=$('selectedModel'); badge.textContent=model.name; badge.className=`ml-auto model-badge ${model.badge}`; }
function getCurrentInputs(requireDose=false) {
  const patient=calculatePatientParameters();
  if (!patient.weight || !patient.height || !patient.age || !patient.scr) { window.alert('กรุณากรอกข้อมูลผู้ป่วยให้ครบถ้วน'); return null; }
  const dose=parseFloat($('currentDose').value);
  if (requireDose && !dose) { window.alert('กรุณาระบุ Current Dose'); return null; }
  return { patient, dose, interval:parseFloat($('interval').value)||12, targetAUC:parseFloat($('targetAUC').value)||500, peak:parseFloat($('peakLevel').value), trough:parseFloat($('troughLevel').value), peakTime:parseFloat($('peakTime').value), troughTime:parseFloat($('troughTime').value), method:$('modelingMethod').value, priorConfidence:$('priorConfidence').value };
}
function estimateFromInputs(inp, fallbackDose=1000) {
  const method = inp.method==='auto' ? ((complexityScore>=50 || inp.peak || inp.trough) ? 'bayesian' : 'population') : inp.method;
  const est = VancoEngine.estimatePk({ patient:inp.patient, dose: inp.dose || fallbackDose, interval:inp.interval, peak:inp.peak, trough:inp.trough, peakTime:inp.peakTime, troughTime:inp.troughTime, method, priorConfidence:inp.priorConfidence });
  if (est.error) alertBox(est.error, 'warning');
  if (est.usedBayesian) updateBayesianSummary(est, inp); else $('bayesianStatusCard').style.display='none';
  updateModelBadge(est.model); return est;
}
function calculateOneCompartmentPK(patient, model) { const pk=model.one(patient); return {...pk, ke:pk.cl/pk.vd, halfLife:0.693/(pk.cl/pk.vd), model:model.name}; }
function calculateTwoCompartmentPK(patient, model) { const pk=model.one(patient); return {cl:pk.cl, v1:pk.vd*0.55, v2:pk.vd*0.45, q:Math.max(2, pk.cl*0.5), alpha:pk.cl/(pk.vd*0.55)+0.4, beta:pk.cl/pk.vd, k10:pk.cl/(pk.vd*0.55), k12:0.3, k21:0.4, halfLifeAlpha:1, halfLifeBeta:0.693/(pk.cl/pk.vd), model:model.name}; }
function calculateInitialDose() {
  const inp=getCurrentInputs(false); if(!inp) return; $('safetyAlerts').innerHTML=''; assessComplexity(inp.patient);
  const model=selectPopulationModel(inp.patient); const pk=calculateOneCompartmentPK(inp.patient, model);
  const rec=VancoEngine.recommendMaintenance({patient:inp.patient,targetAUC:inp.targetAUC,interval:inp.interval,pk});
  const pred=VancoEngine.predictedPeakTrough(rec.dose,rec.interval,pk);
  const results={type:'initial',oneCompartment:{dose:rec.dose,interval:rec.interval,expectedPeak:pred.peak,expectedTrough:pred.trough,expectedAUC:rec.auc,aucMic:rec.auc/inp.patient.mic,model:model.name},twoCompartment:{dose:rec.dose,interval:rec.interval,expectedPeak:pred.peak,expectedTrough:pred.trough,expectedAUC:rec.auc,aucMic:rec.auc/inp.patient.mic,model:model.name}};
  showPatientSummary(inp.patient, pk); displayResults(results); createConcentrationChart(results, pk, pk);
}
function calculateAUC() {
  const inp=getCurrentInputs(true); if(!inp) return; $('safetyAlerts').innerHTML=''; assessComplexity(inp.patient);
  const est=estimateFromInputs(inp, inp.dose); const pk=est.finalPk; const auc=VancoEngine.auc24(inp.dose,inp.interval,pk.cl); const pred=VancoEngine.predictedPeakTrough(inp.dose,inp.interval,pk);
  const results={type:'auc',oneCompartment:{currentDose:inp.dose,interval:inp.interval,calculatedAUC:auc,aucMic:auc/inp.patient.mic,peakLevel:Number.isFinite(inp.peak)?inp.peak:'N/A',troughLevel:Number.isFinite(inp.trough)?inp.trough:'N/A',usedBayesian:est.usedBayesian,model:pk.model},twoCompartment:{currentDose:inp.dose,interval:inp.interval,calculatedAUC:auc,aucMic:auc/inp.patient.mic,peakLevel:Number.isFinite(inp.peak)?inp.peak:'N/A',troughLevel:Number.isFinite(inp.trough)?inp.trough:'N/A',usedBayesian:est.usedBayesian,model:pk.model}};
  results.oneCompartment.expectedTrough=pred.trough; results.twoCompartment.expectedTrough=pred.trough;
  showPatientSummary(inp.patient, pk); displayResults(results); createConcentrationChart(results, pk, pk); if(est.usedBayesian) createComparisonChart(inp.patient, est.priorPk, pk, inp.dose, inp.interval);
}
function adjustDose() {
  const inp=getCurrentInputs(true); if(!inp) return; $('safetyAlerts').innerHTML=''; assessComplexity(inp.patient);
  const est=estimateFromInputs(inp, inp.dose); const pk=est.finalPk; const currentAUC=VancoEngine.auc24(inp.dose,inp.interval,pk.cl); const adj=VancoEngine.adjustDose({currentDose:inp.dose,interval:inp.interval,currentAUC,targetAUC:inp.targetAUC}); const pred=VancoEngine.predictedPeakTrough(adj.newDose,inp.interval,pk); const expAUC=VancoEngine.auc24(adj.newDose,inp.interval,pk.cl);
  const results={type:'adjust',oneCompartment:{currentDose:inp.dose,adjustedDose:adj.newDose,interval:inp.interval,targetAUC:inp.targetAUC,currentAUC:currentAUC.toFixed(0),expectedAUC:expAUC,expectedPeak:pred.peak,expectedTrough:pred.trough,aucMic:expAUC/inp.patient.mic,usedBayesian:est.usedBayesian,model:pk.model},twoCompartment:{currentDose:inp.dose,adjustedDose:adj.newDose,interval:inp.interval,targetAUC:inp.targetAUC,currentAUC:currentAUC.toFixed(0),expectedAUC:expAUC,expectedPeak:pred.peak,expectedTrough:pred.trough,aucMic:expAUC/inp.patient.mic,usedBayesian:est.usedBayesian,model:pk.model}};
  showPatientSummary(inp.patient, pk); displayResults(results); createConcentrationChart(results, pk, pk); if(est.usedBayesian) createComparisonChart(inp.patient, est.priorPk, pk, adj.newDose, inp.interval);
}
function calculateLoadingDose() {
  const inp=getCurrentInputs(false); if(!inp) return; $('safetyAlerts').innerHTML=''; const model=selectPopulationModel(inp.patient); const pk=calculateOneCompartmentPK(inp.patient, model); const ld=VancoEngine.recommendLoading(inp.patient, inp.patient.criticallyIll?'severe':'normal');
  const peak=VancoEngine.concentrationOneComp(ld.dose,24,VancoEngine.getInfusionTimeHours(ld.dose)+1,pk);
  const results={type:'loading',oneCompartment:{loadingDose:ld.dose,peakEstimate:peak,model:model.name},twoCompartment:{loadingDose:ld.dose,peakEstimate:peak,model:model.name}};
  showPatientSummary(inp.patient, pk); displayResults(results); createLoadingDoseChart(results, pk, pk); alertBox(`Infusion time ที่แนะนำ: อย่างน้อย ${ld.infusionMinutes} นาที (≤10 mg/min)`, 'success');
}
function updateBayesianSummary(est, inp) {
  const card=$('bayesianStatusCard'); card.style.display='block'; $('optimizationBadge').textContent='Optimized'; $('optimizationBadge').className='ml-auto text-xs bg-green-500 px-3 py-1 rounded-full text-white'; $('bayesianMethod').textContent=est.method; $('bayesianIterations').textContent='MAP'; $('bayesianConvergence').textContent='Completed';
  const prior=est.priorPk, fin=est.finalPk; const clChange=(fin.cl-prior.cl)/prior.cl*100; const vdChange=(fin.vd-prior.vd)/prior.vd*100; const curAuc=inp.dose?VancoEngine.auc24(inp.dose,inp.interval,fin.cl):null;
  $('parameterChanges').innerHTML=`<div class="flex justify-between"><span>Clearance:</span><span>${fmt(prior.cl,2)} → ${fmt(fin.cl,2)} L/hr (${clChange>=0?'+':''}${fmt(clChange,1)}%)</span></div><div class="flex justify-between"><span>Vd:</span><span>${fmt(prior.vd,1)} → ${fmt(fin.vd,1)} L (${vdChange>=0?'+':''}${fmt(vdChange,1)}%)</span></div><div class="flex justify-between"><span>Half-life:</span><span>${fmt(0.693/(fin.cl/fin.vd),1)} hr</span></div>${curAuc?`<div class="flex justify-between"><span>AUC24:</span><span>${fmt(curAuc,0)} mg·h/L</span></div>`:''}`;
}
function showPatientSummary(patient, pk) {
  $('patientSummaryCard').style.display='block';
  $('patientSummary').innerHTML=`<div><strong>น้ำหนัก:</strong> ${fmt(patient.weight,1)} kg</div><div><strong>BMI:</strong> ${fmt(patient.bmi,1)}</div><div><strong>CrCl:</strong> ${fmt(patient.crCl,1)} mL/min</div><div><strong>Half-Life:</strong> ${fmt(pk.halfLife || 0.693/(pk.cl/pk.vd),1)} hr</div><div><strong>อายุ:</strong> ${patient.age||'N/A'} ปี</div><div><strong>เพศ:</strong> ${patient.gender==='female'?'หญิง':'ชาย'}</div><div><strong>SCr:</strong> ${fmt(patient.scr,1)} mg/dL</div><div><strong>MIC:</strong> ${fmt(patient.mic,1)} mg/L</div><div><strong>สถานะ:</strong> ${patient.criticallyIll?'อาการหนัก ':''}${patient.dialysis?'ฟอกไต ':''}${patient.renalImpairment?'ไตไม่คงที่ ':''}${patient.hepaticImpairment?'ตับบกพร่อง':''}</div>`;
}
function displayResults(results) {
  const section=$('resultsSection'); const div=document.createElement('div'); div.className='result-card rounded-xl p-6 shadow-lg'; let h='';
  if(results.type==='auc') h=`<h2 class="text-xl font-semibold mb-4 flex items-center"><i class="fas fa-chart-area mr-2"></i>AUC Calculations ${results.oneCompartment.usedBayesian?'<span class="ml-auto text-xs bg-blue-500 px-2 py-1 rounded-full text-white">Bayesian Optimized</span>':''}</h2><div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm"><div><h4 class="font-semibold mb-2">One-Compartment Model (${results.oneCompartment.model})</h4><div><strong>ขนาดยา:</strong> ${results.oneCompartment.currentDose} mg ทุก ${results.oneCompartment.interval} ชม.</div><div><strong>Peak:</strong> ${results.oneCompartment.peakLevel} mg/L</div><div><strong>Trough:</strong> ${results.oneCompartment.troughLevel} mg/L</div><div><strong>AUC24:</strong> ${fmt(results.oneCompartment.calculatedAUC,0)} mg·h/L</div><div><strong>AUC/MIC:</strong> ${fmt(results.oneCompartment.aucMic,0)}</div></div><div><h4 class="font-semibold mb-2">Clinical Target</h4><div>เป้าหมายแนะนำ: 400–600 mg·h/L</div><div>สถานะ: ${statusText(results.oneCompartment.calculatedAUC)}</div></div></div>`;
  if(results.type==='initial') h=`<h2 class="text-xl font-semibold mb-4 flex items-center"><i class="fas fa-play mr-2"></i>Initial Dose Recommendation</h2><div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm"><div><h4 class="font-semibold mb-2">One-Compartment Model (${results.oneCompartment.model})</h4><div><strong>Dose:</strong> ${results.oneCompartment.dose} mg q${results.oneCompartment.interval}h</div><div><strong>Expected Peak:</strong> ${fmt(results.oneCompartment.expectedPeak,1)} mg/L</div><div><strong>Expected Trough:</strong> ${fmt(results.oneCompartment.expectedTrough,1)} mg/L</div><div><strong>Expected AUC:</strong> ${fmt(results.oneCompartment.expectedAUC,0)} mg·h/L</div></div><div><h4 class="font-semibold mb-2">Clinical Target</h4><div>AUC/MIC: ${fmt(results.oneCompartment.aucMic,0)}</div><div>${statusText(results.oneCompartment.expectedAUC)}</div></div></div>`;
  if(results.type==='adjust') h=`<h2 class="text-xl font-semibold mb-4 flex items-center"><i class="fas fa-adjust mr-2"></i>Dose Adjustment ${results.oneCompartment.usedBayesian?'<span class="ml-auto text-xs bg-blue-500 px-2 py-1 rounded-full text-white">Bayesian Optimized</span>':''}</h2><div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm"><div><h4 class="font-semibold mb-2">One-Compartment Model (${results.oneCompartment.model})</h4><div><strong>Current:</strong> ${results.oneCompartment.currentDose} mg q${results.oneCompartment.interval}h</div><div><strong>Current AUC:</strong> ${results.oneCompartment.currentAUC}</div><div><strong>Adjusted Dose:</strong> ${results.oneCompartment.adjustedDose} mg q${results.oneCompartment.interval}h</div><div><strong>Expected AUC:</strong> ${fmt(results.oneCompartment.expectedAUC,0)}</div><div><strong>Expected Trough:</strong> ${fmt(results.oneCompartment.expectedTrough,1)} mg/L</div></div><div><h4 class="font-semibold mb-2">คำแนะนำ</h4><div>${statusText(results.oneCompartment.expectedAUC)}</div><div>ติดตาม TDM หลังเปลี่ยน dose หรือเมื่อ renal function เปลี่ยน</div></div></div>`;
  if(results.type==='loading') h=`<h2 class="text-xl font-semibold mb-4 flex items-center"><i class="fas fa-bolt mr-2"></i>Loading Dose</h2><div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm"><div><h4 class="font-semibold mb-2">One-Compartment Model (${results.oneCompartment.model})</h4><div><strong>Loading Dose:</strong> ${results.oneCompartment.loadingDose} mg</div><div><strong>Peak ที่คาด:</strong> ${fmt(results.oneCompartment.peakEstimate,1)} mg/L</div></div><div><h4 class="font-semibold mb-2">Safety</h4><div>ให้ไม่เร็วเกิน 10 mg/min และสูงสุด 3,000 mg</div></div></div>`;
  div.innerHTML=h; section.innerHTML=''; section.appendChild(div); checkSafetyAlerts(results);
}
function statusText(auc){ if(auc<400) return '<span class="text-yellow-200 font-semibold">ต่ำกว่าเป้าหมาย</span>'; if(auc>600) return '<span class="text-red-200 font-semibold">สูงกว่าเป้าหมาย</span>'; return '<span class="text-green-200 font-semibold">อยู่ในช่วงเป้าหมาย</span>'; }
function checkSafetyAlerts(results) {
  let auc = results.oneCompartment.calculatedAUC || results.oneCompartment.expectedAUC; let trough=results.oneCompartment.expectedTrough; const patient=calculatePatientParameters();
  VancoEngine.safety({auc,trough,patient}).forEach(a=>alertBox(a.text,a.type));
}
function createConcentrationChart(results, pk1, pk2) { const dose=results.oneCompartment.adjustedDose||results.oneCompartment.currentDose||results.oneCompartment.dose||1000; const interval=results.oneCompartment.interval||12; drawDualCharts(dose,interval,pk1,pk2); }
function createLoadingDoseChart(results, pk1, pk2) { const dose=results.oneCompartment.loadingDose||1000; drawDualCharts(dose,24,pk1,pk2); }
function drawDualCharts(dose, interval, pk1, pk2) {
  const pts=VancoEngine.buildProfile(dose,interval,pk1,Math.max(24,interval*2),0.5); const labels=pts.map(p=>p.time), data=pts.map(p=>p.conc);
  const cfg=(title)=>({type:'line',data:{labels,datasets:[{label:'Vancomycin Concentration',data, borderColor:'rgb(99,102,241)', backgroundColor:'rgba(99,102,241,0.1)', tension:0.25, fill:true}]},options:{responsive:true,maintainAspectRatio:false,plugins:{title:{display:true,text:title}},scales:{x:{title:{display:true,text:'Time (hours)'}},y:{title:{display:true,text:'Concentration (mg/L)'},beginAtZero:true}}}});
  if(oneCompartmentChart) oneCompartmentChart.destroy(); if(twoCompartmentChart) twoCompartmentChart.destroy();
  oneCompartmentChart=new Chart($('oneCompartmentChart').getContext('2d'),cfg('One-Compartment Profile'));
  twoCompartmentChart=new Chart($('twoCompartmentChart').getContext('2d'),cfg('Model-Based Profile'));
  $('chartMethodBadge').style.display='inline-block';
}
function createComparisonChart(patient, priorPk, finalPk, dose, interval) {
  $('comparisonChartCard').style.display='block'; if(comparisonChart) comparisonChart.destroy(); const labels=['CL (L/hr)','Vd (L)','AUC24']; const priorAuc=VancoEngine.auc24(dose,interval,priorPk.cl), finalAuc=VancoEngine.auc24(dose,interval,finalPk.cl);
  comparisonChart=new Chart($('comparisonChart').getContext('2d'),{type:'bar',data:{labels,datasets:[{label:'Population',data:[priorPk.cl,priorPk.vd,priorAuc]},{label:'Bayesian/MAP',data:[finalPk.cl,finalPk.vd,finalAuc]}]},options:{responsive:true,maintainAspectRatio:false,plugins:{title:{display:true,text:'Population vs Bayesian Parameters'}}}});
}
