import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseDate, parseTime } from "./spreadsheet";
import { addDays, formatShiftTime, weekStart } from "./dates";

test("parseTime reads common formats", () => {
  assert.equal(parseTime("7:00"), "07:00");
  assert.equal(parseTime("6:30 AM"), "06:30");
  assert.equal(parseTime("2:30pm"), "14:30");
  assert.equal(parseTime("12am"), "00:00");
  assert.equal(parseTime("12:15 PM"), "12:15");
  assert.equal(parseTime("13:15:00"), "13:15");
  assert.equal(parseTime("0.25"), "06:00");
  assert.equal(parseTime("noon-ish"), null);
  assert.equal(parseTime("25:00"), null);
});

test("parseDate reads ISO and US dates", () => {
  assert.equal(parseDate("2026-11-22"), "2026-11-22");
  assert.equal(parseDate("11/22/2026"), "2026-11-22");
  assert.equal(parseDate("1/5/27"), "2027-01-05");
  assert.equal(parseDate("Nov 22"), null);
});

test("parseCsv handles quotes and CRLF", () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, y","he said ""hi"""\n'), [["a", "b"], ["x, y", 'he said "hi"']]);
});

test("week math", () => {
  // Schedule weeks run Thursday to Wednesday.
  assert.equal(weekStart("2026-11-18"), "2026-11-12"); // Wed -> previous Thu
  assert.equal(weekStart("2026-11-19"), "2026-11-19"); // Thu
  assert.equal(weekStart("2026-11-22"), "2026-11-19"); // Sun -> Thu
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(formatShiftTime("06:30:00", "14:30:00"), "6:30 AM – 2:30 PM");
});
