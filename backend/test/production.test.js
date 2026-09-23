const test=require('node:test');const assert=require('node:assert/strict');
const validate=require('../config/production');
test('production refuses demo mode, missing secrets and unsafe origins',()=>{
 assert.throws(()=>validate({NODE_ENV:'production'}));
 const env={NODE_ENV:'production',MONGO_URI:'mongodb://localhost/db',JWT_SECRET:'a'.repeat(40),FRONTEND_URL:'https://example.com',CORS_ORIGIN:'https://example.com'};
 assert.doesNotThrow(()=>validate(env));
 for(const patch of [{DEMO_MODE:'true'},{JWT_SECRET:'secret'},{CORS_ORIGIN:'*'},{FRONTEND_URL:'http://example.com'}])assert.throws(()=>validate({...env,...patch}));
});
