function invalidDate(label){
  const error=new Error("Invalid "+label+" date/time filter.");
  error.status=400;
  return error;
}

function parseOptionalDate(value,label){
  if(value===undefined||value===null||String(value).trim()==="")return null;
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))throw invalidDate(label);
  return date;
}

/**
 * FullCalendar ranges are half-open; event records should be returned whenever
 * they overlap the requested window, including multi-day events that started
 * before the visible calendar range.
 */
function buildCalendarOverlapQuery(params={}){
  const start=parseOptionalDate(params.start,"start");
  const end=parseOptionalDate(params.end,"end");
  if(start&&end&&start>end){
    const error=new Error("Calendar start must be before or equal to the end.");
    error.status=400;
    throw error;
  }

  const query={};
  if(start)query.end={$gt:start};
  if(end)query.start={$lt:end};
  return query;
}

module.exports={buildCalendarOverlapQuery,parseOptionalDate};
