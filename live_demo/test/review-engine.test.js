const test=require('node:test');
const assert=require('node:assert/strict');
const review=require('../public/review-engine.js');
const now=Date.parse('2026-10-30T12:00:00Z');
const sample=(changes={})=>({id:1,recordedAt:new Date(now).toISOString(),hr:72,spo2:98,quality:87,flag:false,...changes});
const check=(rows,extra={})=>review.evaluate(rows,{now,...extra});

test('no data does not imply health or produce a confidence score',()=>{
 const result=check([]);assert.equal(result.level,'neutral');assert.equal(result.available,0);assert.equal(result.prediction,null);assert(!('confidence' in result));assert.equal(result.alertKey,null);
});
test('a complete in-band sample is a no-flag review, not a diagnosis',()=>{
 const result=check([sample()]);assert.equal(result.level,'good');assert.equal(result.available,3);assert.match(result.detail,/does not rule out/);assert.equal(result.alertKey,null);
});
test('missing quality cannot be called a fully reliable or normal measurement',()=>{
 const result=check([sample({quality:null})]);assert.equal(result.level,'neutral');assert.equal(result.available,2);assert(result.reasons.some(r=>r.id==='missing_quality'));
});
test('each missing physiological field remains incomplete',()=>{
 for(const key of ['hr','spo2']){const result=check([sample({[key]:null})]);assert.equal(result.level,'neutral');assert.equal(result.available,2);assert(result.reasons.some(r=>r.id==='incomplete'));}
});
test('stale, future-dated and unavailable feeds do not produce current health alerts',()=>{
 for(const offset of [-91000,31000]){const result=check([sample({spo2:85,recordedAt:new Date(now+offset).toISOString()})]);assert.equal(result.fresh,false);assert.equal(result.alertKey,null);assert.equal(result.level,'neutral');}
 const result=check([sample({spo2:85})],{feedError:true});assert.equal(result.level,'neutral');assert.equal(result.alertKey,null);
});
test('oxygen escalation boundaries are explicit and linked to their source',()=>{
 const urgent=check([sample({spo2:88})]);assert.equal(urgent.level,'urgent');assert.equal(urgent.alertKey,'very_low_oxygen');assert(urgent.reasons.some(r=>r.source==='oxygen'));
 for(const spo2 of [89,92]){const result=check([sample({spo2})]);assert.equal(result.level,'warning');assert.equal(result.alertKey,'low_oxygen');}
 assert.notEqual(check([sample({spo2:93})]).level,'urgent');
});
test('a possibly serious oxygen estimate is not silenced by poor or missing quality',()=>{
 for(const quality of [null,5]){const result=check([sample({spo2:85,quality})]);assert.equal(result.level,'urgent');assert(result.reasons.some(r=>r.id===(quality===null?'missing_quality':'signal_quality')));}
});
test('zero, sentinel, impossible and nonnumeric values cannot become medical oxygen alerts',()=>{
 for(const spo2 of [0,-999,101,NaN,Infinity,'bad']){const result=check([sample({spo2})]);assert.equal(result.level,'warning');assert.notEqual(result.alertKey,'very_low_oxygen');assert(result.reasons.some(r=>r.id==='invalid_reading'));}
});
test('low signal quality is a reliability warning, not an arrhythmia diagnosis',()=>{
 const result=check([sample({quality:10,flag:true})]);assert.equal(result.level,'warning');assert.equal(result.alertKey,null);assert(result.reasons.some(r=>r.id==='firmware_flag'));assert.match(result.reasons.find(r=>r.id==='firmware_flag').text,/does not establish/);
});
test('ordinary notification eligibility requires distinct consecutive samples with the same flag',()=>{
 const previous=sample({id:1,hr:110,recordedAt:new Date(now-20000).toISOString()});
 const latest=sample({id:2,hr:112});
 assert.equal(check([previous,latest]).persistent,true);assert.equal(check([previous,latest]).alertKey,'pulse_band');
 assert.equal(check([latest,latest]).persistent,false);
 assert.equal(check([sample({hr:72,recordedAt:previous.recordedAt}),latest]).persistent,false);
 assert.equal(check([sample({hr:110,recordedAt:new Date(now-100000).toISOString()}),latest]).persistent,false);
});
test('configured review bands do not masquerade as fixed disease definitions',()=>{
 const result=check([sample({hr:55})],{settings:{...review.DEFAULTS,hrMin:50}});assert(!result.reasons.some(r=>r.id==='pulse_band'));assert.equal(result.level,'good');
});
test('only descriptive trends are returned, with a sample-count and no future event forecast',()=>{
 const rows=[0,1,2,3].map(i=>sample({id:i,hr:70+i*3,recordedAt:new Date(now-(3-i)*20000).toISOString()}));
 const result=check(rows);assert.equal(result.trend.direction,'rising');assert.equal(result.prediction,null);assert.equal(result.trend.samples,4);assert.match(result.trend.text,/not a forecast/);
});
