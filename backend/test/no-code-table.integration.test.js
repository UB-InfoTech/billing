const test=require("node:test");
const assert=require("node:assert/strict");
const mongoose=require("mongoose");
const jwt=require("jsonwebtoken");

process.env.JWT_SECRET||="billing-integration-tests-only-secret";
const app=require("../server");
const Client=require("../models/Client");
const TableConfiguration=require("../models/TableConfiguration");
const TableCustomValue=require("../models/TableCustomValue");
const FormConfiguration=require("../models/FormConfiguration");

const mongoUri=process.env.MONGO_URI;

test("custom table values persist with correct types and enforce business ownership",{
  skip:!mongoUri?"Set MONGO_URI to run no-code table integration tests.":false
},async()=>{
  let server;
  let ownerId;
  let otherOwnerId;
  let ownerClientId;
  let otherClientId;
  let baseUrl;

  try{
    await mongoose.connect(mongoUri,{serverSelectionTimeoutMS:10000});
    await Promise.all([Client.init(),TableConfiguration.init(),TableCustomValue.init(),FormConfiguration.init()]);

    ownerId=new mongoose.Types.ObjectId();
    otherOwnerId=new mongoose.Types.ObjectId();
    const ownerToken=jwt.sign({user:{id:String(ownerId)}},process.env.JWT_SECRET);
    const otherOwnerToken=jwt.sign({user:{id:String(otherOwnerId)}},process.env.JWT_SECRET);

    const ownerClient=await Client.create({
      createdBy:ownerId,
      name:"No-code integration customer",
      companyName:"Owner business"
    });
    ownerClientId=ownerClient._id;

    const otherClient=await Client.create({
      createdBy:otherOwnerId,
      name:"Other business customer",
      companyName:"Other business"
    });
    otherClientId=otherClient._id;

    server=app.listen(0,"127.0.0.1");
    await new Promise((resolve,reject)=>{
      server.once("listening",resolve);
      server.once("error",reject);
    });
    baseUrl=`http://127.0.0.1:${server.address().port}/api`;

    await FormConfiguration.create({
      createdBy:ownerId,
      formKey:"clients.form",
      fields:[
        {key:"quantity",label:"Quantity",custom:true,fieldType:"number"},
        {key:"rate",label:"Rate",custom:true,fieldType:"currency"},
        {key:"amount",label:"Calculated amount",custom:true,fieldType:"currency",formula:"quantity * rate",editable:false}
      ]
    });

    async function request(path,{method="GET",body,token=ownerToken}={}){
      const response=await fetch(`${baseUrl}${path}`,{
        method,
        headers:{
          "x-auth-token":token,
          ...(body===undefined?{}:{"content-type":"application/json"})
        },
        ...(body===undefined?{}:{body:JSON.stringify(body)})
      });
      const raw=await response.text();
      let data;
      try{data=raw?JSON.parse(raw):null;}catch{data=raw;}
      return {status:response.status,data};
    }

    const formulaClient=await request("/clients",{
      method:"POST",
      body:{
        name:"Calculated customer",
        companyName:"Calculation Test Business",
        customFields:{quantity:4,rate:25,amount:999}
      }
    });
    assert.equal(formulaClient.status,201,JSON.stringify(formulaClient.data));
    assert.equal(formulaClient.data.customFields.amount,100);

    const updatedFormulaClient=await request(`/clients/${formulaClient.data._id}`,{
      method:"PATCH",
      body:{customFields:{quantity:3,rate:20,amount:999}}
    });
    assert.equal(updatedFormulaClient.status,200,JSON.stringify(updatedFormulaClient.data));
    assert.equal(updatedFormulaClient.data.customFields.amount,60);

    const tableKey="no-code-integration";
    const configured=await request(`/table-config/${tableKey}`,{
      method:"PUT",
      body:{columns:[
        {key:"custom_verified",label:"Verified",kind:"custom",fieldType:"boolean",editable:true},
        {key:"custom_note",label:"Internal note",kind:"custom",fieldType:"text",editable:true},
        {
          key:"custom_related_customer",
          label:"Related customer",
          kind:"custom",
          fieldType:"reference",
          editable:true,
          dataSource:{
            type:"lookup",
            resource:"clients",
            valueField:"_id",
            labelField:"companyName",
            searchField:"companyName"
          }
        }
      ]}
    });
    assert.equal(configured.status,200,JSON.stringify(configured.data));

    const invalidBoolean=await request(`/table-config/${tableKey}/values`,{
      method:"PUT",
      body:{rowKey:String(ownerClientId),fieldKey:"custom_verified",value:"maybe"}
    });
    assert.equal(invalidBoolean.status,400);
    assert.match(invalidBoolean.data.message,/choose yes or no/i);

    const savedFalse=await request(`/table-config/${tableKey}/values`,{
      method:"PUT",
      body:{rowKey:String(ownerClientId),fieldKey:"custom_verified",value:false}
    });
    assert.equal(savedFalse.status,200,JSON.stringify(savedFalse.data));
    assert.equal(savedFalse.data.value,false);

    const savedText=await request(`/table-config/${tableKey}/values`,{
      method:"PUT",
      body:{rowKey:String(ownerClientId),fieldKey:"custom_note",value:"Call before delivery"}
    });
    assert.equal(savedText.status,200,JSON.stringify(savedText.data));

    const crossBusinessReference=await request(`/table-config/${tableKey}/values`,{
      method:"PUT",
      body:{rowKey:String(ownerClientId),fieldKey:"custom_related_customer",value:String(otherClientId)}
    });
    assert.equal(crossBusinessReference.status,400);
    assert.match(crossBusinessReference.data.message,/belongs to your business account/i);

    const ownReference=await request(`/table-config/${tableKey}/values`,{
      method:"PUT",
      body:{rowKey:String(ownerClientId),fieldKey:"custom_related_customer",value:String(ownerClientId)}
    });
    assert.equal(ownReference.status,200,JSON.stringify(ownReference.data));

    const ownerValues=await request(`/table-config/${tableKey}/values?rowKeys=${ownerClientId}`);
    assert.equal(ownerValues.status,200);
    assert.equal(ownerValues.data.values.length,3);
    assert.equal(ownerValues.data.values.find(item=>item.fieldKey==="custom_verified").value,false);
    assert.equal(ownerValues.data.values.find(item=>item.fieldKey==="custom_note").value,"Call before delivery");
    assert.equal(ownerValues.data.values.find(item=>item.fieldKey==="custom_related_customer").value,String(ownerClientId));

    const hiddenFromOtherOwner=await request(`/table-config/${tableKey}/values?rowKeys=${ownerClientId}`,{
      token:otherOwnerToken
    });
    assert.equal(hiddenFromOtherOwner.status,200);
    assert.deepEqual(hiddenFromOtherOwner.data.values,[]);
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    if(mongoose.connection.readyState===1){
      if(ownerId&&otherOwnerId){
        await Promise.all([
          TableCustomValue.deleteMany({createdBy:{$in:[ownerId,otherOwnerId]}}),
          TableConfiguration.deleteMany({createdBy:{$in:[ownerId,otherOwnerId]}}),
          FormConfiguration.deleteMany({createdBy:{$in:[ownerId,otherOwnerId]}}),
          Client.deleteMany({createdBy:{$in:[ownerId,otherOwnerId]}})
        ]);
      }
      await mongoose.disconnect();
    }
  }
});
