import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeGrid, parseDayDate, parseScheduleGrid, parseShiftCell } from "./schedule-grid";

test("shift codes from the course sheets", () => {
  assert.deepEqual(parseShiftCell("6:00-2:00"), { startTime: "06:00", endTime: "14:00", label: null });
  assert.deepEqual(parseShiftCell("6:00-2:30"), { startTime: "06:00", endTime: "14:30", label: null });
  assert.deepEqual(parseShiftCell("11:00-6:30"), { startTime: "11:00", endTime: "18:30", label: null });
  assert.deepEqual(parseShiftCell("9:00-5:00"), { startTime: "09:00", endTime: "17:00", label: null });
  assert.deepEqual(parseShiftCell("7:30-EOE"), { startTime: "07:30", endTime: null, label: "EOE" });
  assert.deepEqual(parseShiftCell("12:30-CL"), { startTime: "12:30", endTime: null, label: "CL" });
  assert.deepEqual(parseShiftCell("1:00-CL"), { startTime: "13:00", endTime: null, label: "CL" });
  assert.deepEqual(parseShiftCell("7am - 3pm"), { startTime: "07:00", endTime: "15:00", label: null });
  assert.deepEqual(parseShiftCell("Open"), { startTime: null, endTime: null, label: "Open" });
  assert.deepEqual(parseShiftCell("Here"), { startTime: null, endTime: null, label: "Here" });
  assert.equal(parseShiftCell("*"), "off");
  assert.equal(parseShiftCell(""), "off");
  assert.equal(parseShiftCell("RO"), "requested_off");
  assert.ok("error" in (parseShiftCell("6:00-99:00") as object));
});

test("dates without a year pick the nearest year", () => {
  assert.equal(parseDayDate("May 1", "2026-04-20"), "2026-05-01");
  // An old sheet uploaded in November is last May, not next May.
  assert.equal(parseDayDate("May 1", "2026-11-18"), "2026-05-01");
  assert.equal(parseDayDate("Nov 19", "2026-11-18"), "2026-11-19");
  assert.equal(parseDayDate("Jan 2", "2026-12-28"), "2027-01-02");
  assert.equal(parseDayDate("Dec 30", "2027-01-03"), "2026-12-30");
  assert.equal(parseDayDate("2026-05-01", "2020-01-01"), "2026-05-01");
  assert.equal(parseDayDate("5/1", "2026-04-20"), "2026-05-01");
  assert.equal(parseDayDate("Here", "2026-04-20"), null);
});

const D = ["Thursday", "Friday", "Saturday", "Sunday", "Monday", "Tuesday", "Wednesday"];
const sec = (t: string) => ["", "", ...D.map(() => t)];
// Same shape as a course sheet, with made-up people.
const grid = [
  ["", "", ...D],
  ["", "", "May 1", "May 2", "May 3", "May 4", "May 5", "May 6", "May 7"],
  ["", "Information", "Member Guest", "Member Guest", "", "", "", "", ""],
  ["", "AM Players", "96", "96", "96", "90", "", "104", "96"],
  sec("Golf Professionals"),
  ["Pat Pro", "(555) 555-0101", "Here", "Here", "*", "Open", "Close", "", ""],
  sec("Cart Attendants"),
  ["Sam Sample (On Call)", "(555) 555-0102", "6:00-2:00", "*", "6:00-EOE", "RO", "12:00-CL", "", ""],
  ["Alex Example", "", "", "", "", "", "", "6:00-2:30", "7:00-3:00"],
];

test("reads the names-down, days-across layout", () => {
  assert.ok(looksLikeGrid(grid));
  const r = parseScheduleGrid(grid, "2026-04-25");
  assert.deepEqual(r.errors, []);
  assert.equal(r.requestedOff, 1);
  assert.deepEqual(
    r.people.map((p) => [p.name, p.phone, p.section]),
    [
      ["Pat Pro", "(555) 555-0101", "Golf Professionals"],
      ["Sam Sample", "(555) 555-0102", "Cart Attendants"],
      ["Alex Example", null, "Cart Attendants"],
    ],
  );
  assert.equal(r.shifts.length, 4 + 3 + 2);
  assert.deepEqual(r.shifts.find((s) => s.name === "Sam Sample" && s.date === "2026-05-05"), {
    name: "Sam Sample",
    section: "Cart Attendants",
    date: "2026-05-05",
    startTime: "12:00",
    endTime: null,
    label: "CL",
  });
  assert.equal(r.shifts.find((s) => s.name === "Pat Pro" && s.date === "2026-05-04")?.label, "Open");
});

test("reports cells it can't read", () => {
  const bad = grid.map((r) => [...r]);
  bad[7][3] = "6:00-99:00";
  const r = parseScheduleGrid(bad, "2026-04-25");
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /Sam Sample, Friday/);
});
