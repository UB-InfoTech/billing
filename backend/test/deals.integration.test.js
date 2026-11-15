const test=require("node:test");
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const mongoose=require("mongoose");
const jwt=require("jsonwebtoken");

process.env.JWT_SECRET ||= "sales-deals-integration-tests-only-secret";
const app=require("../server");
const Deal=require("../models/Deal");
const SalesPipeline=require("../models/SalesPipeline");
const Client=require("../models/Client");

const mongoUri=process.env.MONGO_URI;

test("sales deal APIs keep opportunities separate and enforce business ownership",{
 skip:!mongoUri?"Set MONGO_URI to run sales deal integration tests.":false
},async()=>{
 let server,ownerId,otherOwnerId,clientId;
 try{
  await mongoose.connect(mongoUri,{serverSelectionTimeoutMS:10000});
  await Promise.all([Deal.init(),SalesPipeline.init(),Client.init()]);
  ownerId=new mongoose.Types.ObjectId();
  otherOwnerId=new mongoose.Types.ObjectId();
  const ownerToken=jwt.sign({user:{id:String(ownerId)}},process.env.JWT_SECRET);
  const otherToken=jwt.sign({user:{id:String(otherOwnerId)}},process.env.JWT_SECRET);
  const suffix=crypto.randomBytes(5).toString("hex");
  const client=await Client.create({
   name:"Deal Contact "+suffix,companyName:"Deal Customer "+suffix,
   phone:"9876543210",createdBy:ownerId
  });
  clientId=client._id;

  server=app.listen(0,"127.0.0.1");
  await new Promise((resolve,reject)=>{server.once("listening",resolve);server.once("error",reject);});
  const base="http://127.0.0.1:"+server.address().port+"/api";
  const request=async(path,{method="GET",body,token=ownerToken}={})=>{
   const response=await fetch(base+path,{
    method,headers:{"x-auth-token":token,...(body===undefined?{}:{"content-type":"application/json"})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})
   });
   const text=await response.text();let payload;
   try{payload=text?JSON.parse(text):null;}catch{payload=text;}
   return {response,payload};
  };

  const pipeline=await request("/deals/pipeline");
  assert.equal(pipeline.response.status,200,JSON.stringify(pipeline.payload));
  assert.equal(pipeline.payload.stages.filter(stage=>stage.outcome==="open").length,5);

  const create=await request("/deals",{
   method:"POST",body:{
    title:"Annual uniform supply",contactName:"New prospect "+suffix,
    value:125000,expectedCloseDate:"2026-12-20",
    nextAction:"Call to confirm fabric samples",nextActionAt:"2026-11-16T10:00:00+05:30",
    source:"Referral"
   }
  });
  assert.equal(create.response.status,201,JSON.stringify(create.payload));
  const dealId=create.payload._id;
  assert.equal(create.payload.status,"open");
  assert.equal(create.payload.value,125000);
  assert.equal(create.payload.stageHistory.length,1);
  assert.equal(create.payload.clientId,null);

  const linked=await request("/deals",{
   method:"POST",body:{title:"Repeat order",clientId:String(clientId),value:25000}
  });
  assert.equal(linked.response.status,201,JSON.stringify(linked.payload));
  assert.equal(String(linked.payload.clientId._id),String(clientId));

  const crossBusiness=await request("/deals",{
   method:"POST",token:otherToken,body:{title:"Private customer",clientId:String(clientId),value:100}
  });
  assert.equal(crossBusiness.response.status,400);

  const list=await request("/deals");
  assert.equal(list.response.status,200);
  assert.equal(list.payload.total,2);
  const hiddenList=await request("/deals",{token:otherToken});
  assert.equal(hiddenList.payload.total,0);

  const summary=await request("/deals/summary");
  assert.equal(summary.response.status,200);
  assert.equal(summary.payload.openCount,2);
  assert.equal(summary.payload.pipelineValue,150000);

  const stages=pipeline.payload.stages.filter(stage=>stage.outcome==="open").map(stage=>({
   key:stage.key,label:stage.label,probability:stage.probability
  }));
  const proposal=stages.find(stage=>stage.key==="proposal-sent");
  const move=await request("/deals/"+dealId+"/stage",{method:"PATCH",body:{stageKey:proposal.key}});
  assert.equal(move.response.status,200,JSON.stringify(move.payload));
  assert.equal(move.payload.stageKey,proposal.key);
  assert.equal(move.payload.stageHistory.length,2);

  const lost=await request("/deals/"+dealId+"/stage",{method:"PATCH",body:{stageKey:"lost"}});
  assert.equal(lost.response.status,400);
  const markLost=await request("/deals/"+dealId+"/stage",{
   method:"PATCH",body:{stageKey:"lost",lostReason:"Budget not approved",lostNotes:"Customer postponed the purchase."}
  });
  assert.equal(markLost.response.status,200,JSON.stringify(markLost.payload));
  assert.equal(markLost.payload.status,"lost");
  assert.equal(markLost.payload.lostReason,"Budget not approved");

  const hiddenUpdate=await request("/deals/"+dealId,{method:"PATCH",token:otherToken,body:{title:"Hijack"}});
  assert.equal(hiddenUpdate.response.status,404);
  const hiddenMove=await request("/deals/"+dealId+"/stage",{method:"PATCH",token:otherToken,body:{stageKey:"won"}});
  assert.equal(hiddenMove.response.status,404);

  const stageInUse=await request("/deals",{
   method:"POST",body:{title:"Stage migration check",contactName:"Test prospect",stageKey:"proposal-sent",value:5000}
  });
  assert.equal(stageInUse.response.status,201,JSON.stringify(stageInUse.payload));
  const wonProspect=await request("/deals",{
   method:"POST",body:{title:"New account conversion",contactName:"Converted prospect "+suffix,contactPhone:"9998887776",value:45000}
  });
  assert.equal(wonProspect.response.status,201,JSON.stringify(wonProspect.payload));
  const markWon=await request("/deals/"+wonProspect.payload._id+"/stage",{method:"PATCH",body:{stageKey:"won"}});
  assert.equal(markWon.response.status,200,JSON.stringify(markWon.payload));
  const conversion=await request("/deals/"+wonProspect.payload._id+"/convert-customer",{method:"POST",body:{}});
  assert.equal(conversion.response.status,201,JSON.stringify(conversion.payload));
  assert.equal(conversion.payload.created,true);
  assert.ok(conversion.payload.deal.clientId);

  const duplicateProspect=await request("/deals",{
   method:"POST",body:{title:"Existing contact opportunity",contactName:"Known customer again",contactPhone:"9876543210",value:5000}
  });
  const duplicateWon=await request("/deals/"+duplicateProspect.payload._id+"/stage",{method:"PATCH",body:{stageKey:"won"}});
  assert.equal(duplicateWon.response.status,200);
  const duplicateLink=await request("/deals/"+duplicateProspect.payload._id+"/convert-customer",{method:"POST",body:{}});
  assert.equal(duplicateLink.response.status,200,JSON.stringify(duplicateLink.payload));
  assert.equal(duplicateLink.payload.created,false);
  assert.equal(String(duplicateLink.payload.customerId),String(clientId));

  const removeInUse=await request("/deals/pipeline",{
   method:"PUT",body:{stages:stages.filter(stage=>stage.key!=="proposal-sent")}
  });
  assert.equal(removeInUse.response.status,409);
  const badPipeline=await request("/deals/pipeline",{
   method:"PUT",body:{stages:[{label:"Only one",probability:50}]}
  });
  assert.equal(badPipeline.response.status,400);
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  if(ownerId){
   await Deal.deleteMany({createdBy:ownerId});
   await SalesPipeline.deleteMany({createdBy:ownerId});
   await Client.deleteMany({createdBy:ownerId});
  }
  if(mongoose.connection.readyState===1)await mongoose.disconnect();
 }
});
