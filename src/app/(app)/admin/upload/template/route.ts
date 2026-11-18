import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/auth";
import { addDays, today, weekStart } from "@/lib/dates";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "head_pro")) return new Response("Not allowed", { status: 403 });
  const kind = new URL(req.url).searchParams.get("kind") === "roster" ? "roster" : "schedule";

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(kind === "roster" ? "Roster" : "Schedule");
  if (kind === "roster") {
    ws.columns = [
      { header: "Name", key: "name", width: 24 },
      { header: "Email", key: "email", width: 30 },
      { header: "Phone", key: "phone", width: 16 },
      { header: "Department", key: "department", width: 18 },
      { header: "Role", key: "role", width: 16 },
    ];
    ws.addRow({ name: "Jamie Example", email: "jamie@example.com", phone: "706-555-0100", department: "Cart Attendants", role: "Employee" });
    ws.addRow({ name: "Pat Example", email: "pat@example.com", phone: "706-555-0101", department: "Cart Attendants", role: "Assistant Pro" });
  } else {
    ws.columns = [
      { header: "Date", key: "date", width: 14 },
      { header: "Employee", key: "employee", width: 24 },
      { header: "Department", key: "department", width: 18 },
      { header: "Start", key: "start", width: 10 },
      { header: "End", key: "end", width: 10 },
      { header: "Note", key: "note", width: 24 },
    ];
    const mon = addDays(weekStart(today()), 7);
    ws.addRow({ date: mon, employee: "Jamie Example", department: "Cart Attendants", start: "6:30 AM", end: "2:30 PM" });
    ws.addRow({ date: mon, employee: "jamie2@example.com", department: "Starters", start: "7:00 AM", end: "3:00 PM", note: "Shotgun start" });
  }
  ws.getRow(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="reynolds-${kind}-template.xlsx"`,
    },
  });
}
