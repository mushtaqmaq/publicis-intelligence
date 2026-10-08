// One client record for the whole platform. `departments` says which teams handle the client, e.g. McDonald's by
// Creative, Media and Multimedia but Talabat by Media only. A department only offers the clients it handles.
export const DEPARTMENTS = [
  { id: "strategy", label: "Strategy" },
  { id: "creative", label: "Creative" },
  { id: "media", label: "Media" },
  { id: "multimedia", label: "Multimedia" },
  { id: "search", label: "Search" },
] as const;
export type DepartmentId = (typeof DEPARTMENTS)[number]["id"];
const IDS: string[] = DEPARTMENTS.map((d) => d.id);

// Keeps only known departments, once each, in the standard order.
export function cleanDepartments(input: unknown): DepartmentId[] {
  const want = new Set(Array.isArray(input) ? input.map(String) : []);
  return DEPARTMENTS.filter((d) => want.has(d.id)).map((d) => d.id);
}
export const handles = (client: { departments: string[] }, dept: DepartmentId) => client.departments.includes(dept);
export const departmentLabels = (ids: string[]) => ids.filter((i) => IDS.includes(i)).map((i) => DEPARTMENTS.find((d) => d.id === i)!.label);
