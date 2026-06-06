#!/usr/bin/env node
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const PORT = Number(process.env.FULL_BACKEND_SMOKE_PORT || 4121);
const BASE = process.env.FULL_BACKEND_SMOKE_BASE || `http://127.0.0.1:${PORT}`;
const shouldSpawn = !process.env.FULL_BACKEND_SMOKE_BASE;
const required = [
  ['GET','/api/ml/dependencies'], ['GET','/api/ml/health'], ['GET','/api/ml/model'], ['GET','/api/ml/model-runs'], ['GET','/api/ml/predictions'], ['GET','/api/ml/feature-importance'], ['GET','/api/ml/drift'], ['GET','/api/ml/model-card'], ['POST','/api/ml/infer/SPY'],
  ['GET','/api/historical/providers'], ['GET','/api/historical/datasets'], ['POST','/api/historical/use-for-ml'], ['POST','/api/historical/use-for-backtest'], ['POST','/api/historical/use-for-correlation'],
  ['POST','/api/backtest/run'], ['GET','/api/backtest/runs'],
  ['GET','/api/macro/correlation'], ['GET','/api/macro/beta'], ['GET','/api/macro/sector-rotation'], ['GET','/api/macro/volatility-heatmap'],
  ['GET','/api/providers/health'], ['GET','/api/providers/credentials'], ['GET','/api/providers/active'], ['GET','/api/feed/status'], ['GET','/api/feeds/tick/SPY'], ['GET','/api/feeds/candle/SPY'], ['GET','/api/feeds/orderbook/SPY'],
  ['GET','/api/portfolio/summary'], ['GET','/api/portfolio/positions'], ['GET','/api/portfolio/pnl'], ['GET','/api/portfolio/exposure'], ['GET','/api/portfolio/drawdown'], ['GET','/api/portfolio/history'],
  ['GET','/api/risk/summary'], ['GET','/api/risk/limits'], ['GET','/api/risk/var'], ['GET','/api/risk/drawdown'], ['GET','/api/risk/exposure'], ['GET','/api/risk/alerts'],
  ['GET','/api/definitely-missing-smoke-route'],
];
function wait(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function waitForHealth(){ const end=Date.now()+20000; while(Date.now()<end){ try{ const r=await fetch(`${BASE}/health`); if(r.ok) return; }catch{} await wait(250);} throw new Error('backend startup timeout'); }
function hasInvalid(value, seen=new WeakSet()) { if (typeof value === 'number') return !Number.isFinite(value); if (!value || typeof value !== 'object') return false; if (seen.has(value)) return false; seen.add(value); return Object.values(value).some((v)=>hasInvalid(v, seen)); }
async function run(){
 const results=[];
 for (const [method, endpoint] of required){
  const result={method,endpoint,ok:false,status:0,json:false};
  try{
   const body = method === 'POST' ? JSON.stringify({}) : undefined;
   const res=await fetch(`${BASE}${endpoint}`,{method,headers:{'Content-Type':'application/json'},body});
   result.status=res.status; const contentType=res.headers.get('content-type') || ''; const text=await res.text();
   if(/html/i.test(contentType)||/^\s*</.test(text)) throw new Error('HTML returned from API');
   let parsed; try{ parsed=text?JSON.parse(text):null; result.json=true; }catch{ throw new Error('invalid JSON'); }
   if (hasInvalid(parsed)) throw new Error('NaN/Infinity in JSON');
   if(endpoint.includes('definitely-missing')) { if(res.status!==404 || parsed?.status!=='endpoint_not_found') throw new Error('unknown API route contract failed'); }
   else if(res.status===404) throw new Error('required route returned 404');
   result.ok=true;
  }catch(e){ result.error=e.message; }
  results.push(result);
 }
 const summary={ok:results.every(r=>r.ok),generatedAt:new Date().toISOString(),baseUrl:BASE,total:results.length,passed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,results};
 fs.writeFileSync(path.join(process.cwd(),'FULL_BACKEND_SMOKE_RESULTS.json'),`${JSON.stringify(summary,null,2)}\n`); console.log(JSON.stringify(summary,null,2)); if(!summary.ok) process.exitCode=1;
}
(async()=>{ let child=null; try{ if(shouldSpawn){ child=spawn(process.execPath,['server/index.cjs'],{env:{...process.env,PORT:String(PORT),MONGO_URI:'',PROVIDER_STATE_FILE:path.join(process.cwd(),'data','full-backend-smoke-provider-state.json')},stdio:['ignore','pipe','pipe']}); child.stdout.on('data',d=>process.stdout.write(d)); child.stderr.on('data',d=>process.stderr.write(d)); await waitForHealth(); } await run(); } catch(e){ const summary={ok:false,generatedAt:new Date().toISOString(),baseUrl:BASE,error:e.message,results:[]}; fs.writeFileSync(path.join(process.cwd(),'FULL_BACKEND_SMOKE_RESULTS.json'),`${JSON.stringify(summary,null,2)}\n`); console.error(e); process.exitCode=1; } finally{ if(child) child.kill('SIGTERM'); } })();
