---
name: document-reasoning
description: Expert document analysis using PageIndex hierarchical tree structures.
compatibility: Requires PageIndex tree structures in .claude/page-index
metadata:
  role: analyst
  version: "1.0"
---

This skill enables agents to perform deep reasoning over long and complex documents by leveraging PageIndex's vectorless, reasoning-based RAG approach.

## Capabilities

1. **Hierarchy Discovery**: Navigating hierarchical "Table-of-Contents" tree structures to understand document organization.
2. **Context-Aware Retrieval**: Identifying relevant sections based on reasoning rather than simple keyword matching.
3. **Cross-Document Synthesis**: Correlating information across multiple documents indexed by PageIndex.
4. **Traceable Evidence**: Extracting precise information with explicit page and section references.

## Workflow

### 1. Document Mapping

- List all available indexes: `ls -R .claude/page-index`
- Read the high-level tree structure (JSON/MD) for the target document.
- Identify branches of the tree that are relevant to the query.

### 2. Reasoning-based Search

- For each relevant branch, read the `summary` or `description` fields in the PageIndex tree.
- Decide which specific leaf nodes (pages/sections) contain the necessary detail.
- If the tree is large, use `Grep` on the tree files first to find keyword anchors.

### 3. Precision Extraction

- Access the specific document content corresponding to the identified node IDs or page ranges.
- Extract findings while maintaining the context of the surrounding sections.

### 4. Reporting

- Document the reasoning path (how you got from the query to the specific section).
- Cite evidence using the format: `[Document Name, Section X.Y, Page Z]`.
- Provide a clear, synthesized answer to the initial request.

## Gotchas

- **Tree vs. Content**: Always read the tree structure *first* before attempting to read document content.
- **Large Trees**: If a JSON tree is over 1MB, don't read it all at once; use `Grep` or `WebFetch` if applicable.
- **Ambiguous Titles**: If section titles are ambiguous, rely on the `summary` fields provided in the PageIndex tree.
