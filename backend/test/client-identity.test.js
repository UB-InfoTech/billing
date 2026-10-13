const test=require("node:test");
const assert=require("node:assert/strict");
const {hasClientIdentity,assertClientIdentity}=require("../utils/clientIdentity");

test("accepts a business name without a contact person",()=>{
  const client={companyName:"Example Textiles",name:""};
  assert.equal(hasClientIdentity(client),true);
  assert.equal(assertClientIdentity(client),true);
});

test("accepts a contact name when a company name is not provided",()=>{
  const client={companyName:" ",name:"Ravi Patel"};
  assert.equal(hasClientIdentity(client),true);
  assert.equal(assertClientIdentity(client),true);
});

test("rejects records that have neither a business nor a contact name",()=>{
  for(const client of [
    {},
    {companyName:"",name:""},
    {companyName:"   ",name:"  "}
  ]){
    assert.equal(hasClientIdentity(client),false);
    assert.throws(
      ()=>assertClientIdentity(client),
      error=>error.status===400&&/customer\/business name or a contact name/i.test(error.message)
    );
  }
});
