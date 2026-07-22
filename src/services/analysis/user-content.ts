/**
 * Fences user-authored content (script source, console output) so it renders
 * as an inert block. The fence is always longer than any backtick run inside
 * the content, so the content cannot break out of the block.
 */
function fenceUserContent(content: string): string {
  const longestBacktickRun = content.match(/`+/g)?.reduce((max, run) => Math.max(max, run.length), 0) ?? 0;
  const fence = "`".repeat(Math.max(3, longestBacktickRun + 1));
  return `${fence}\n${content}\n${fence}`;
}

export { fenceUserContent };
