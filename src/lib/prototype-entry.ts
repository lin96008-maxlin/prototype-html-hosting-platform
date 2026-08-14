export const PROTOTYPE_ENTRY_NAMES = ["index.html", "preview.html"] as const;

export function isPrototypeEntryName(value: string) {
  const normalized = value.replaceAll("\\", "/").split("/").pop()?.toLowerCase();
  return PROTOTYPE_ENTRY_NAMES.some((name) => name === normalized);
}

export function findPrototypeEntryPath(paths: string[]) {
  for (const name of PROTOTYPE_ENTRY_NAMES) {
    const entry = paths.find((value) => value.toLowerCase() === name);
    if (entry) return entry;
  }
  return null;
}
