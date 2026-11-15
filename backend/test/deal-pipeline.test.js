const test=require("node:test");
const assert=require("node:assert/strict");
const {DEFAULT_DEAL_STAGES,normalizeOpenStages,dealAttentionRank}=require("../utils/dealPipeline");

test("default sales pipeline starts with practical open stages and closed outcomes",()=>{
 assert.deepEqual(DEFAULT_DEAL_STAGES.slice(0,5).map(stage=>stage.label),[
  "New enquiry","Contacted","Qualified","Quote sent","Negotiation"
 ]);
 assert.equal(DEFAULT_DEAL_STAGES[5].outcome,"won");
 assert.equal(DEFAULT_DEAL_STAGES[6].outcome,"lost");
});

test("pipeline stage settings require two to twelve unique open stages and restore closed outcomes",()=>{
 const stages=normalizeOpenStages([
  {key:"enquiry",label:"Enquiry",probability:10},
  {key:"qualified",label:"Qualified",probability:50}
 ]);
 assert.equal(stages.length,4);
 assert.equal(stages[2].key,"won");
 assert.equal(stages[3].key,"lost");
 assert.equal(stages[1].probability,50);
 assert.throws(()=>normalizeOpenStages([{label:"Only stage",probability:50}]),/at least two/);
 assert.throws(()=>normalizeOpenStages([
  {label:"First",probability:10},{label:"first",probability:20}
 ]),/unique/);
 assert.throws(()=>normalizeOpenStages([
  {label:"First",probability:10},{label:"Second",probability:101}
 ]),/between 0 and 100/);
});

test("deal attention ranks overdue, due today, no next action, then future",()=>{
 const now=new Date("2026-11-15T10:00:00+05:30");
 assert.equal(dealAttentionRank({status:"open",nextActionAt:"2026-11-15T03:00:00Z"},now),0);
 assert.equal(dealAttentionRank({status:"open",nextActionAt:"2026-11-15T18:00:00+05:30"},now),1);
 assert.equal(dealAttentionRank({status:"open",nextAction:"",nextActionAt:null},now),2);
 assert.equal(dealAttentionRank({status:"open",nextActionAt:"2026-11-16T10:00:00+05:30"},now),3);
 assert.equal(dealAttentionRank({status:"won",nextActionAt:"2026-11-14T10:00:00+05:30"},now),4);
});
