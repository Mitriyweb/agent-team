/**
 * Ambient module declarations for non-TS asset imports (Bun text/json imports).
 */
declare module "*.md" {
  const content: string;
  export default content;
}
