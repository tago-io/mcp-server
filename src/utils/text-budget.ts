/** Makes a value safe inside one Markdown table cell: escapes pipes and collapses whitespace. */
function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

/** Truncates to a UTF-8 byte budget on codepoint boundaries, marking the cut with an ellipsis. */
function truncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) {
    return value;
  }
  const budget = maxBytes - Buffer.byteLength("…", "utf8");
  let truncated = "";
  let bytes = 0;
  for (const char of value) {
    const charBytes = Buffer.byteLength(char, "utf8");
    if (bytes + charBytes > budget) {
      break;
    }
    truncated += char;
    bytes += charBytes;
  }
  return `${truncated}…`;
}

export { escapeTableCell, truncateUtf8 };
