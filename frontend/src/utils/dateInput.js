/**
 * Helpers for HTML date inputs and inclusive calendar-day filters.
 * Keep YYYY-MM-DD values as calendar dates rather than parsing them as UTC.
 */
export function formatDateInput(value) {
  if (value === null || value === undefined || value === "") return "";

  if (typeof value === "string") {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
    if (match) return match[1];
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getDateRangeBoundary(value, endOfDay = false) {
  if (value === null || value === undefined || value === "") return null;

  let date;
  if (value instanceof Date) {
    date = new Date(value.getTime());
  } else {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
    if (match) {
      date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    } else {
      date = new Date(value);
    }
  }

  if (Number.isNaN(date.getTime())) return null;

  date.setHours(
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0
  );
  return date;
}
