const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const crypto=require('node:crypto');
const mongoose=require('mongoose');
const express=require('express');
const {load,serve}=require('./helpers.cjs');
const User=require('../models/User');
const Company=require('../models/Company');
const registerCompany=require('../services/registerCompany');
let first,second;
before(async()=>{
 const uri=process.env.TEST_MONGO_URI;
 if(!uri || !/^mongodb:\/\/(127\.0\.0\.1|localhost):/.test(uri)) throw Error('Set TEST_MONGO_URI to an isolated local MongoDB replica set');
 await mongoose.connect(uri,{dbName:`vehicle_${crypto.randomBytes(6).toString('hex')}_test`});await Promise.all([User.init(),Company.init()]);
 first=await registerCompany({companyName:'First',name:'First',email:'first@example.com',phone:'12345',password:'test-password'});
 second=await registerCompany({companyName:'Second',name:'Second',email:'second@example.com',phone:'12345',password:'test-password'});
});
after(async()=>{if(mongoose.connection.readyState){await mongoose.connection.dropDatabase();await mongoose.disconnect()}});

test('failed user insertion rolls back company creation',async()=>{
 const before=await Company.countDocuments();
 await assert.rejects(registerCompany({companyName:'Rollback duplicate',name:'Test',email:'first@example.com',phone:'12345',password:'test-password'}));
 assert.equal(await Company.countDocuments(),before);
 await assert.rejects(registerCompany({companyName:'Rollback validation',name:'Test',email:'invalid@example.com',phone:'12345',password:'x'}));
 assert.equal(await Company.countDocuments(),before);assert.equal(await User.countDocuments({email:'invalid@example.com'}),0);
});

test('contacts persist and cannot be read or deleted by another account',async t=>{
 const auth=(req,res,next)=>{const owner=req.headers.authorization==='second'?second:first;req.userId=owner.user.id;req.companyId=owner.company.id;next()};
 const router=load(path.join(__dirname,'../routes/contactRoutes.js'),{'../middleware/auth':auth});
 const request=await serve(t,express,router);
 const created=await request('POST','/',{name:'Contact',phone:'+123456789',relation:'family'});assert.equal(created.status,201);
 const fresh=await User.findById(first.user.id);assert.equal(fresh.emergencyContacts.length,1);
 assert.equal((await request('GET','/')).body[0].name,'Contact');
 assert.deepEqual((await request('GET','/',undefined,{Authorization:'second'})).body,[]);
 assert.equal((await request('DELETE',`/${created.body._id}`,undefined,{Authorization:'second'})).status,404);
 assert.equal((await request('DELETE',`/${created.body._id}`)).status,200);
 assert.equal((await User.findById(first.user.id)).emergencyContacts.length,0);
});

test('concurrent duplicate contacts produce one saved entry',async t=>{
 const auth=(req,res,next)=>{req.userId=first.user.id;req.companyId=first.company.id;next()};
 const router=load(path.join(__dirname,'../routes/contactRoutes.js'),{'../middleware/auth':auth});const request=await serve(t,express,router);
 const body={name:'Duplicate',phone:'+11234567',relation:'friend'};
 const results=await Promise.all([request('POST','/',body),request('POST','/',body)]);
 assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
 assert.equal((await User.findById(first.user.id)).emergencyContacts.filter(c=>c.phone===body.phone).length,1);
});

test('request counters coordinate across two middleware instances',async t=>{
 const {createLimiter}=require('../middleware/rateLimit');
 const router=express.Router();
 for(const name of ['a','b'])router.post('/'+name,createLimiter({scope:'contact-test',limit:2,key:q=>q.body.email.toLowerCase()}),(q,s)=>s.json({ok:true}));
 const request=await serve(t,express,router);
 assert.equal((await request('POST','/a',{email:'TEST@example.com'})).status,200);
 assert.equal((await request('POST','/b',{email:'test@example.com'})).status,200);
 assert.equal((await request('POST','/a',{email:'test@example.com'})).status,429);
});

test('simultaneous owner deletion and vehicle creation cannot leave a dangling reference',async()=>{
 const Member=require('../models/Member');const Vehicle=require('../models/Vehicle');
 const {createVehicle,deleteMember}=require('../services/vehicleOwnership');
 await Promise.all([Member.init(),Vehicle.init()]);
 for(let i=0;i<12;i++) {
  const owner=await Member.create({name:'Race',email:`race${i}@example.com`,company:first.company.id});
  const results=await Promise.allSettled([
   createVehicle({make:'Test',model:'Test',year:2020,license:`RACE${i}`,owner:owner.id,company:first.company.id}),
   deleteMember(owner.id,first.company.id)
  ]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const vehicle=await Vehicle.findOne({owner:owner.id});const savedOwner=await Member.findById(owner.id);
  assert.ok(!vehicle || savedOwner,'a saved vehicle must retain its owner');
 }
});

test('admin can create fleet records and duplicate plate formats are rejected',async t=>{
 const Member=require('../models/Member');
 const owner=await Member.create({name:'Plate',email:'plate@example.com',company:first.company.id});
 const auth=(q,s,n)=>{q.companyRole='admin';q.companyId=first.company.id;n()};
 const request=await serve(t,express,load(path.join(__dirname,'../routes/vehicleRoutes.js'),{'../middleware/auth':auth}));
 const body={make:'Test',model:'Test',year:2020,license:' Ab 123 ',owner:owner.id};
 const result=await request('POST','/',body);assert.equal(result.status,201);assert.equal(result.body.license,'AB123');
 assert.equal((await request('POST','/',{...body,license:'aB123'})).status,400);
 assert.equal((await request('POST','/',{...body,license:'DIFFERENT',year:-2})).status,400);
 assert.equal((await request('DELETE',`/${result.body._id}`)).status,200);
 const members=await serve(t,express,load(path.join(__dirname,'../routes/memberRoutes.js'),{'../middleware/auth':auth}));
 assert.equal((await members('DELETE',`/${owner.id}`)).status,200);
});

test('plate migration reports collisions without writing and applies a clean batch',async()=>{
 const Vehicle=require('../models/Vehicle');const {spawnSync}=require('node:child_process');
 const company=new mongoose.Types.ObjectId(),owner=new mongoose.Types.ObjectId();
 const a=await Vehicle.collection.insertOne({company,owner,license:'old 55',make:'Test',model:'Test',year:2020});
 const b=await Vehicle.collection.insertOne({company,owner,license:'OLD55',make:'Test',model:'Test',year:2020});
 const uri=new URL(process.env.TEST_MONGO_URI);uri.pathname='/'+mongoose.connection.name;
 const run=(...args)=>spawnSync(process.execPath,[path.join(__dirname,'../scripts/normalize-plates.js'),...args],{env:{...process.env,MONGO_URI:uri.toString()},encoding:'utf8'});
 let result=run('--apply');assert.equal(result.status,1,result.stderr);
 assert.equal((await Vehicle.collection.findOne({_id:a.insertedId})).license,'old 55');
 await Vehicle.collection.deleteOne({_id:b.insertedId});
 result=run();assert.equal(result.status,0,result.stderr);
 assert.equal((await Vehicle.collection.findOne({_id:a.insertedId})).license,'old 55');
 result=run('--apply');assert.equal(result.status,0,result.stderr);
 assert.equal((await Vehicle.collection.findOne({_id:a.insertedId})).license,'OLD55');
});
