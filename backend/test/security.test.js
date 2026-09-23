const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const jwt = require('jsonwebtoken');
const { load, serve, guard } = require('./helpers.cjs');
const source = file => path.join(__dirname, '..', file);
process.env.JWT_SECRET = 'local-test-secret-not-for-deployment-123456';
const headers = { Authorization: 'Bearer fixture' };

test('JWT secret fails closed and authentication uses current company permissions', async t => {
  const {getJwtSecret} = require('../config/jwt');
  const saved = process.env.JWT_SECRET; delete process.env.JWT_SECRET;
  assert.throws(getJwtSecret); process.env.JWT_SECRET='secret'; assert.throws(getJwtSecret); process.env.JWT_SECRET=saved;
  let user = {_id:'111111111111111111111111', company:'222222222222222222222222', role:'member',tokenVersion:0};
  const auth=load(source('middleware/auth.js'), {'../models/User':{findById:async()=>user}});
  const router=express.Router();router.get('/',auth,(q,s)=>s.json({company:q.companyId,role:q.companyRole}));
  const request=await serve(t,express,router);
  const token=jwt.sign({user:{id:user._id,companyId:'333333333333333333333333',role:'admin'},tokenVersion:0},saved);
  const h={Authorization:`Bearer ${token}`};
  const r=await request('GET','/',undefined,h);assert.equal(r.status,200);assert.equal(r.body.company,user.company);assert.equal(r.body.role,'member');
  user.tokenVersion=1;assert.equal((await request('GET','/',undefined,h)).status,401);
  user=null;assert.equal((await request('GET','/',undefined,h)).status,401);
});

test('tracking requires login, accepts zero coordinates and scopes reads/writes',async t=>{
  const calls=[];
  const TrackingSession={
    findOneAndUpdate:async(query,update,options)=>{calls.push({query,update,options});return {lat:update.$set.lat,lng:update.$set.lng}},
    find:async query=>{calls.push({query});return []},deleteOne:async query=>{calls.push({query})}
  };
  const router=load(source('routes/trackingRoutes.js'),{'../middleware/auth':guard,'../models/TrackingSession':TrackingSession});
  const request=await serve(t,express,router);
  for (const [method,url] of [['POST','/start'],['POST','/update'],['POST','/stop'],['GET','/active']]) {
    assert.equal((await request(method,url,method==='GET'?undefined:{})).status,401);
  }
  assert.equal(calls.length,0);
  assert.equal((await request('POST','/start',{lat:0,lng:0},headers)).status,200);
  assert.equal(calls[0].query.company,'222222222222222222222222');assert.equal(calls[0].query.user,'111111111111111111111111');
  assert.equal((await request('POST','/update',{id:'someone-else',lat:1,lng:1},headers)).status,403);
  assert.equal((await request('POST','/start',{lat:91,lng:0},headers)).status,400);
  assert.equal((await request('POST','/start',{lat:'0',lng:0},headers)).status,400);
  assert.equal((await request('GET','/active',undefined,headers)).status,200);
  assert.equal(calls.at(-1).query.company,'222222222222222222222222');assert.ok(calls.at(-1).query.expiresAt.$gt);
  assert.equal((await request('POST','/stop',{},headers)).status,200);assert.equal(calls.at(-1).query.user,'111111111111111111111111');
});

test('vehicles reject owners outside company before saving',async t=>{
  let ownerQuery,created=false;
  function Vehicle(){created=true;}
  const router=load(source('routes/vehicleRoutes.js'),{
    '../middleware/auth':guard,'../models/Vehicle':Vehicle,
    '../models/Member':{exists:async q=>{ownerQuery=q;return null}}
  });
  const request=await serve(t,express,router);
  const r=await request('POST','/',{owner:'333333333333333333333333',make:'Test',model:'Test',year:2024,license:'test'},headers);
  assert.equal(r.status,400);assert.equal(ownerQuery.company,'222222222222222222222222');assert.equal(created,false);
});

test('referenced vehicle owners cannot be deleted',async t=>{
  let deleted=false;
  const router=load(source('routes/memberRoutes.js'),{'../middleware/auth':guard,'../models/Vehicle':{exists:async()=>true},'../models/Member':{findOneAndDelete:async()=>{deleted=true}}});
  const request=await serve(t,express,router);
  assert.equal((await request('DELETE','/333333333333333333333333',undefined,headers)).status,409);assert.equal(deleted,false);
});

test('emergency API reports email failure and escapes descriptions',async t=>{
  let mail,fail=true,query;
  class Emergency {
    constructor(value){Object.assign(this,value);this._id='444444444444444444444444'}
    async save(){return this}
    static find(q){query=q;return {sort:async()=>[]}}
  }
  const router=load(source('routes/emergencyRoutes.js'),{'../middleware/auth':guard,'../models/Emergency':Emergency,'../utils/mailer':{sendMail:async value=>{mail=value;if(fail)throw Error('Offline')}}});
  const request=await serve(t,express,router);
  const body={type:'medical',severity:'high',description:'<img src=x>',location:{lat:0,lng:0},recipientEmail:'test@example.com'};
  let r=await request('POST','/',body,headers);
  assert.equal(r.status,201);assert.equal(r.body.notificationStatus,'failed');assert.ok(mail.html.includes('&lt;img src=x&gt;'));assert.ok(mail.html.includes('destination=0,0'));
  fail=false;r=await request('POST','/',body,headers);assert.equal(r.body.notificationStatus,'accepted');
  assert.equal((await request('POST','/',{...body,recipientEmail:'a@example.com\r\nBcc: b@example.com'},headers)).status,400);
  assert.equal((await request('POST','/',{...body,location:{lat:100,lng:0}},headers)).status,400);
  await request('GET','/',undefined,headers);assert.equal(query.status,'active');assert.equal(query.company,'222222222222222222222222');
});

test('Gmail message construction rejects injected headers',()=>{
  const {buildRawMessage}=require('../utils/mailer');
  assert.throws(()=>buildRawMessage({to:'a@example.com\nBcc:b@example.com',from:'c@example.com',subject:'Test',html:'Hello'}));
  const raw=buildRawMessage({to:'a@example.com',from:'c@example.com',subject:'Test',html:'Hello'});
  assert.ok(Buffer.from(raw,'base64url').toString().includes('To: a@example.com'));
});

test('password changes hash the password and revoke earlier token versions',async()=>{
  const User=require('../models/User');
  const user=new User({name:'Test',email:'test@example.com',phone:'123',password:'new-password',company:'222222222222222222222222'});user.isNew=false;
  await new Promise((resolve,reject)=>User.schema.s.hooks.execPre('save',user,[],err=>err?reject(err):resolve()));
  assert.equal(user.tokenVersion,1);assert.notEqual(user.password,'new-password');assert.equal(await user.matchPassword('new-password'),true);
});

test('registration rejects malformed input before creating a company',async t=>{
  let created=false;
  const router=load(source('routes/authRoutes.js'),{
    '../models/Company':{create:async()=>{created=true}},'../models/User':{},'../utils/mailer':{sendMail:async()=>{throw Error('No mail expected')}}
  });
  const request=await serve(t,express,router);
  assert.equal((await request('POST','/register',{companyName:'Test',name:'Test',email:'test@example.com',password:'password'})).status,400);
  assert.equal((await request('POST','/login',{email:{$ne:null},password:'password'})).status,400);
  assert.equal(created,false);
});

test('regular members cannot mutate fleet records or resolve emergencies', async t => {
  const member = (q,s,n) => {q.companyRole='member';q.companyId='222222222222222222222222';n()};
  for (const [file, actions] of [
    ['vehicleRoutes', [['POST','/'],['DELETE','/333333333333333333333333']]],
    ['memberRoutes', [['POST','/'],['DELETE','/333333333333333333333333']]],
    ['emergencyRoutes', [['PUT','/333333333333333333333333/resolve']]]
  ]) {
    const router=load(source(`routes/${file}.js`),{'../middleware/auth':member});
    const request=await serve(t,express,router);
    for (const [method,url] of actions) assert.equal((await request(method,url,{})).status,403);
  }
});

test('vehicle schema bounds years and canonicalizes license plates', async () => {
  const Vehicle=require('../models/Vehicle');
  const base={make:'Test',model:'Test',license:' ab 12 cd ',owner:'333333333333333333333333',company:'222222222222222222222222'};
  for(const year of [-1, 2020.5, new Date().getFullYear()+2]) assert.ok(new Vehicle({...base,year}).validateSync());
  const vehicle=new Vehicle({...base,year:2020});await vehicle.validate();assert.equal(vehicle.license,'AB12CD');
});
