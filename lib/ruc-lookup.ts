export function getRucCandidate(document: string): string | null {
  const value = document.trim();
  if (/^[0-9]{13}$/.test(value)) return value;
  if (/^[0-9]{10}$/.test(value)) return `${value}001`;
  return null;
}

type SavedCustomerName = {
  document_number: string | null;
  legal_name: string | null;
  display_name: string | null;
};

export function findSavedCustomerName(rows: SavedCustomerName[], documents: string[]) {
  for (const document of documents) {
    const matches = rows.filter((row) => row.document_number === document);
    if (matches.length > 1) return { status: "ambiguous" } as const;
    const row = matches[0];
    const name = row?.legal_name?.trim() || row?.display_name?.trim();
    if (name) return { status: "found", name, matchedDocument: document } as const;
  }
  return { status: "absent" } as const;
}
