export function departmentDisplayName(name: string | null | undefined) {
  if (name === "Admission" || name === "Admissions") return "Admissions & Registration";
  if (name === "Examination") return "Examinations";
  if (name === "Dispatch") return "Mail & Dispatch";
  if (name === "IT" || name === "Information Technology") return "Information Technology (IT)";
  if (name === "Curriculum") return "Syllabus";
  return name || "";
}
