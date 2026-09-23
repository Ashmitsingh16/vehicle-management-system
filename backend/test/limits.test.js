const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {serve}=require('./helpers.cjs');
const {createLimiter,configureProxy}=require('../middleware/rateLimit');

test('limiter fails closed when its store is unavailable',async t=>{
 const router=express.Router();let reached=false;
 router.get('/',createLimiter({scope:'failure-test',limit:1,store:{findOneAndUpdate:async()=>{throw Error('offline')}}}),(q,s)=>{reached=true;s.json({ok:true})});
 const request=await serve(t,express,router);
 assert.equal((await request('GET','/')).status,503);assert.equal(reached,false);
});

test('forwarded addresses are not trusted without explicit configuration',()=>{
 const prior=process.env.TRUST_PROXY_HOPS;
 try {
  delete process.env.TRUST_PROXY_HOPS;const app=express();configureProxy(app);assert.equal(app.get('trust proxy'),0);
  process.env.TRUST_PROXY_HOPS='true';assert.throws(()=>configureProxy(app));
 } finally {if(prior===undefined)delete process.env.TRUST_PROXY_HOPS;else process.env.TRUST_PROXY_HOPS=prior}
});
