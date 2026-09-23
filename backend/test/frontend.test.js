const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function setup(){
  const elements=new Map();
  function element(){return {value:'',textContent:'',children:[],style:{},classList:{add(){},remove(){},toggle(){}},insertRow(){const row=element();this.children.push(row);return row},insertCell(){const cell=element();this.children.push(cell);return cell},appendChild(child){this.children.push(child)},insertBefore(child){this.children.unshift(child)},addEventListener(name,fn){this[name]=fn},set innerHTML(value){if(value!== '<option value="">Select Owner</option>')throw Error('Unsafe HTML rendering');}}}
  const document={getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id)},querySelector(id){return this.getElementById(id)},createElement:element};
  const notices=[],requests=[];
  const ctx=vm.createContext({document,console,Date,Map,Set,Number,String,encodeURIComponent,BASE_URL:'http://unused/api',navigator:{},setTimeout(){},clearInterval(){},authFetch:async(url,options)=>{requests.push({url,options});return {ok:false}},fetch:async()=>{throw Error('No external calls allowed')}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../../Frontend/app.js'),'utf8'),ctx);
  ctx.showNotification=(message,type)=>notices.push({message,type});
  document.getElementById('emergencyType').value='medical';document.getElementById('severityLevel').value='high';
  return {ctx,document,notices,requests,run:code=>vm.runInContext(code,ctx)};
}
test('failed emergency HTTP request never claims success',async()=>{
  const x=setup();await x.run('confirmEmergency()');
  assert.equal(x.run('emergencyActive'),false);assert.equal(x.run('activeEmergencyIds.length'),0);
  assert.ok(x.notices.at(-1).message.includes('Could not confirm'));
  assert.equal(x.notices.some(n=>/Help is on the way|services have been notified|Contacted/.test(n.message)),false);
});
test('email failure is visible and resolution persists on the server',async()=>{
  const x=setup();x.ctx.authFetch=async()=>({ok:true,json:async()=>({_id:'alert-1',notificationStatus:'failed'})});
  await x.run('confirmEmergency()');assert.equal(x.run('emergencyActive'),true);
  assert.ok(x.document.getElementById('emergencyBannerDetail').textContent.includes('Email failed'));
  x.ctx.authFetch=async()=>({ok:false});await x.run('resolveEmergency()');assert.equal(x.run('emergencyActive'),true);
  let request;x.ctx.authFetch=async(url,options)=>{request={url,options};return {ok:true}};
  await x.run('resolveEmergency()');assert.equal(request.options.method,'PUT');assert.ok(request.url.endsWith('/alert-1/resolve'));assert.equal(x.run('emergencyActive'),false);
});
test('stored member and vehicle values render as literal text',()=>{
  const x=setup();x.run(`users=[{_id:'member',name:'<img src=x onerror=alert(1)>',email:'test@example.com'}];vehicles=[{_id:'vehicle',make:'<svg onload=alert(1)>',model:'Test',year:2024,license:'Test',owner:'member'}];updateUserTable();updateVehicleTable();`);
  assert.equal(x.document.querySelector('#userTable tbody').children[0].children[0].textContent,'<img src=x onerror=alert(1)>');
  assert.equal(x.document.querySelector('#vehicleTable tbody').children[0].children[0].textContent,'<svg onload=alert(1)>');
});
test('logout clears data and ignores late GPS callbacks',()=>{
  const x=setup();let callback;x.ctx.navigator.geolocation={getCurrentPosition(success){callback=success}};
  x.run('getCurrentLocation();resetAppSession();');callback({coords:{latitude:1,longitude:2,accuracy:1}});
  assert.equal(x.run('currentLocation'),null);assert.equal(x.run('users.length'),0);assert.equal(x.run('trackingInterval'),null);
});

test('contact save/delete failures preserve displayed data',async()=>{
  const x=setup();
  x.ctx.authFetch=async()=>({ok:true,json:async()=>({_id:'contact-1',name:'Test',phone:'12345',relation:'family'})});
  assert.equal(await x.run("saveContact({name:'Test',phone:'12345',relation:'family'})"),true);
  assert.equal(x.run('contacts.length'),1);
  x.ctx.authFetch=async()=>({ok:false,json:async()=>({msg:'Not saved'})});
  assert.equal(await x.run("saveContact({name:'Other',phone:'67890',relation:'family'})"),false);
  assert.equal(x.run('contacts.length'),1);
  await x.run("deleteContact('contact-1')");assert.equal(x.run('contacts.length'),1);
  x.ctx.authFetch=async()=>({ok:true});await x.run("deleteContact('contact-1')");assert.equal(x.run('contacts.length'),0);
});

test('login reloads contacts saved against the account',async()=>{
  const x=setup();
  x.ctx.authFetch=async url=>({ok:true,json:async()=>url.endsWith('/contacts')?[{_id:'saved',name:'Saved contact',phone:'12345',relation:'family'}]:[]});
  await x.run('initializeApp()');
  assert.equal(x.run('contacts[0]._id'),'saved');
  assert.equal(x.document.querySelector('#contactTable tbody').children[0].children[0].textContent,'Saved contact');
});

test('login does not automatically request device location',async()=>{
 const x=setup();let requests=0;x.ctx.navigator.geolocation={getCurrentPosition(){requests++}};
 x.ctx.authFetch=async()=>({ok:true,json:async()=>[]});await x.run('initializeApp()');assert.equal(requests,0);
});
test('location requests are serialized and failure stops tracking without a toast storm',()=>{
 const x=setup();let fail,options,calls=0;
 x.ctx.navigator.geolocation={getCurrentPosition(success,error,opts){calls++;fail=error;options=opts}};
 x.run('startTracking();getCurrentLocation();getCurrentLocation()');assert.equal(calls,1);assert.equal(options.enableHighAccuracy,false);assert.equal(options.timeout,30000);
 fail({code:2});assert.equal(x.run('trackingRequested'),false);assert.equal(x.run('trackingInterval'),null);assert.equal(x.notices.length,0);
 assert.ok(x.document.getElementById('trackingStatus').textContent.includes('enter coordinates'));
});
test('stopping tracking ignores an outstanding location callback',()=>{
 const x=setup();let success;x.ctx.navigator.geolocation={getCurrentPosition(ok){success=ok}};
 x.run('startTracking();stopTracking()');success({coords:{latitude:1,longitude:2,accuracy:4}});assert.equal(x.run('currentLocation'),null);
});
test('manual position validates coordinates and labels them as non-live',()=>{
 const x=setup();x.document.getElementById('manualLatitude').value='0';x.document.getElementById('manualLongitude').value='0';
 x.run('useManualLocation()');assert.equal(x.run('currentLocation.lat'),0);assert.ok(x.document.getElementById('currentCoords').textContent.includes('entered manually'));
 x.document.getElementById('manualLatitude').value='91';x.run('useManualLocation()');assert.equal(x.run('currentLocation.lat'),0);assert.ok(x.document.getElementById('trackingStatus').textContent.includes('-90'));
});
test('tracking starts its timer only after a valid reading and preserves zero coordinates',()=>{
 const x=setup();let success,timers=0;x.ctx.setInterval=()=>{timers++;return 1};
 x.ctx.navigator.geolocation={getCurrentPosition(ok){success=ok}};
 x.run('startTracking()');assert.equal(timers,0);
 success({coords:{latitude:0,longitude:0,accuracy:25}});
 assert.equal(timers,1);assert.equal(x.run('currentLocation.lat'),0);assert.equal(x.document.getElementById('trackingStatus').textContent,'Local tracking active');
});
