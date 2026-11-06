const test=require("node:test");
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const mongoose=require("mongoose");
const jwt=require("jsonwebtoken");

process.env.JWT_SECRET ||= "client-activity-integration-tests-only-secret";
const app=require("../server");
const Client=require("../models/Client");
const ClientActivity=require("../models/ClientActivity");
const CalendarEvent=require("../models/Calendar");

const mongoUri=process.env.MONGO_URI;

test("client activity APIs preserve business ownership and allow task completion",{
 skip:!mongoUri?"Set MONGO_URI to run client activity integration tests.":false
},async()=>{
 let server;
 let ownerId;
 let otherOwnerId;
 let clientId;
 try{
  await mongoose.connect(mongoUri,{serverSelectionTimeoutMS:10000});
  await Promise.all([Client.init(),ClientActivity.init()]);
  ownerId=new mongoose.Types.ObjectId();
  otherOwnerId=new mongoose.Types.ObjectId();
  const ownerToken=jwt.sign({user:{id:String(ownerId)}},process.env.JWT_SECRET);
  const otherToken=jwt.sign({user:{id:String(otherOwnerId)}},process.env.JWT_SECRET);
  const suffix=crypto.randomBytes(5).toString("hex");
  const client=await Client.create({
   name:"Activity Integration "+suffix,
   companyName:"Activity Integration Business "+suffix,
   createdBy:ownerId
  });
  clientId=client._id;

  server=app.listen(0,"127.0.0.1");
  await new Promise((resolve,reject)=>{
   server.once("listening",resolve);
   server.once("error",reject);
  });
  const baseUrl="http://127.0.0.1:"+server.address().port+"/api";
  const request=async(path,{method="GET",body,token=ownerToken}={})=>{
   const response=await fetch(baseUrl+path,{
    method,
    headers:{"x-auth-token":token,...(body===undefined?{}:{"content-type":"application/json"})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})
   });
   const text=await response.text();
   let payload;
   try{payload=text?JSON.parse(text):null;}catch{payload=text;}
   return {response,payload};
  };

  const createCalendar=await request("/events",{
   method:"POST",
   body:{title:"Customer review meeting",start:"2026-11-05T10:00:00.000Z",end:"2026-11-05T11:00:00.000Z",clientId}
  });
  assert.equal(createCalendar.response.status,201,JSON.stringify(createCalendar.payload));
  assert.equal(String(createCalendar.payload.clientId),String(clientId));

  const createNote=await request("/clients/"+clientId+"/activities",{
   method:"POST",
   body:{type:"note",subject:"Design discussion",description:"Shared the new catalogue."}
  });
  assert.equal(createNote.response.status,201,JSON.stringify(createNote.payload));
  assert.equal(createNote.payload.type,"note");

  const updateNote=await request("/clients/"+clientId+"/activities/"+createNote.payload._id,{
   method:"PATCH",body:{subject:"Updated design discussion",description:"Customer approved the revised catalogue."}
  });
  assert.equal(updateNote.response.status,200,JSON.stringify(updateNote.payload));
  assert.equal(updateNote.payload.subject,"Updated design discussion");

  const createTask=await request("/clients/"+clientId+"/activities",{
   method:"POST",
   body:{type:"task",subject:"Send quotation",dueAt:"2026-12-01T10:00:00.000Z"}
  });
  assert.equal(createTask.response.status,201,JSON.stringify(createTask.payload));
  assert.equal(createTask.payload.status,"open");

  const updateProfile=await request("/clients/"+clientId,{
   method:"PATCH",body:{notes:"Prefers WhatsApp contact."}
  });
  assert.equal(updateProfile.response.status,200,JSON.stringify(updateProfile.payload));

  const followUpList=await request("/clients/follow-ups?status=open&bucket=all");
  assert.equal(followUpList.response.status,200,JSON.stringify(followUpList.payload));
  assert.ok(followUpList.payload.activities.some(item=>item.subject==="Send quotation"));
  assert.ok(followUpList.payload.activities.some(item=>String(item.client?._id||item.clientId)===String(clientId)));
  assert.equal(followUpList.payload.summary.open,1);
  const hiddenFollowUps=await request("/clients/follow-ups?status=open",{token:otherToken});
  assert.equal(hiddenFollowUps.response.status,200);
  assert.equal(hiddenFollowUps.payload.activities.length,0);

  const profile=await request("/clients/"+clientId);
  assert.equal(profile.response.status,200,JSON.stringify(profile.payload));
  assert.equal(profile.payload.openFollowUpCount,1);
  assert.ok(profile.payload.nextFollowUpAt);
  assert.ok(profile.payload.lastCrmActivityAt);

  const list=await request("/clients/"+clientId+"/activities");
  assert.equal(list.response.status,200,JSON.stringify(list.payload));
  assert.ok(list.payload.activities.some(item=>item.title==="Updated design discussion"));
  assert.ok(list.payload.activities.some(item=>item.title==="Customer review meeting"));
  const profileUpdate=list.payload.activities.find(item=>item.type==="profile_update");
  assert.ok(profileUpdate);
  assert.ok(profileUpdate.description.includes("Notes"));
  const task=list.payload.activities.find(item=>item.title==="Send quotation");
  assert.ok(task);
  assert.equal(task.canUpdateStatus,true);

  const complete=await request("/clients/"+clientId+"/activities/"+createTask.payload._id,{
   method:"PATCH",body:{status:"completed"}
  });
  assert.equal(complete.response.status,200,JSON.stringify(complete.payload));
  assert.equal(complete.payload.status,"completed");
  assert.ok(complete.payload.completedAt);

  const hiddenNoteDelete=await request("/clients/"+clientId+"/activities/"+createNote.payload._id,{
   method:"DELETE",token:otherToken
  });
  assert.equal(hiddenNoteDelete.response.status,404);
  const deleteNote=await request("/clients/"+clientId+"/activities/"+createNote.payload._id,{method:"DELETE"});
  assert.equal(deleteNote.response.status,200,JSON.stringify(deleteNote.payload));

  const hiddenCalendarCreate=await request("/events",{
   method:"POST",token:otherToken,
   body:{title:"Invalid cross-business calendar link",start:"2026-11-05T10:00:00.000Z",end:"2026-11-05T11:00:00.000Z",clientId}
  });
  assert.equal(hiddenCalendarCreate.response.status,400);
  const hiddenList=await request("/clients/"+clientId+"/activities",{token:otherToken});
  assert.equal(hiddenList.response.status,404);
  const hiddenCreate=await request("/clients/"+clientId+"/activities",{
   method:"POST",token:otherToken,body:{type:"note",subject:"Must not be saved"}
  });
  assert.equal(hiddenCreate.response.status,404);
  const hiddenUpdate=await request("/clients/"+clientId+"/activities/"+createTask.payload._id,{
   method:"PATCH",token:otherToken,body:{status:"open"}
  });
  assert.equal(hiddenUpdate.response.status,404);

  const invalid=await request("/clients/"+clientId+"/activities",{
   method:"POST",body:{type:"task",subject:""}
  });
  assert.equal(invalid.response.status,400);
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  if(ownerId){
   await ClientActivity.deleteMany({createdBy:ownerId});
   await CalendarEvent.deleteMany({createdBy:ownerId});
   await Client.deleteMany({createdBy:ownerId,name:/Activity Integration/});
  }
  if(mongoose.connection.readyState===1)await mongoose.disconnect();
 }
});
