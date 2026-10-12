const test=require("node:test");
const assert=require("node:assert/strict");
const {buildCalendarOverlapQuery,parseOptionalDate}=require("../utils/calendarDateRange");

test("returns events that overlap a visible calendar range",()=>{
  const query=buildCalendarOverlapQuery({
    start:"2026-10-01T00:00:00.000Z",
    end:"2026-11-01T00:00:00.000Z",
  });
  assert.ok(query.end.$gt instanceof Date);
  assert.ok(query.start.$lt instanceof Date);
  assert.equal(query.end.$gt.toISOString(),"2026-10-01T00:00:00.000Z");
  assert.equal(query.start.$lt.toISOString(),"2026-11-01T00:00:00.000Z");
});

test("supports an open-ended lower or upper calendar boundary",()=>{
  assert.deepEqual(buildCalendarOverlapQuery({start:"2026-10-01"}),{
    end:{$gt:new Date("2026-10-01")},
  });
  assert.deepEqual(buildCalendarOverlapQuery({end:"2026-11-01"}),{
    start:{$lt:new Date("2026-11-01")},
  });
  assert.deepEqual(buildCalendarOverlapQuery({}),{});
});

test("rejects invalid date filters instead of silently returning all events",()=>{
  assert.throws(()=>parseOptionalDate("not-a-date","start"),error=>error.status===400);
  assert.throws(()=>buildCalendarOverlapQuery({start:"invalid"}),error=>error.status===400);
});

test("rejects a reversed calendar range",()=>{
  assert.throws(
    ()=>buildCalendarOverlapQuery({start:"2026-11-01",end:"2026-10-01"}),
    error=>error.status===400&&/start must be before/i.test(error.message)
  );
});
