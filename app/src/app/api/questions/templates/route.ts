export async function GET() {
  const templates = [
    {
      id: "bug",
      name: "Bug Report",
      title: "[Bug] Short description of the issue",
      body: `## Environment
- Framework/Library:
- Version:
- Model:

## Expected Behavior
Describe what you expected to happen.

## Actual Behavior
Describe what actually happened. Include error messages.

## Steps to Reproduce
1.
2.
3.

## Code
\`\`\`python
# Minimal reproduction code
\`\`\`

## What I've Tried
-
`,
      tags: ["bug"],
    },
    {
      id: "howto",
      name: "How To",
      title: "How to [achieve X] with [technology Y]?",
      body: `## Goal
What are you trying to accomplish?

## Context
- What framework/tools are you using?
- What constraints do you have?

## What I've Tried
Describe approaches you've already attempted.

## Code So Far
\`\`\`python
# Your current code
\`\`\`
`,
      tags: ["howto"],
    },
    {
      id: "architecture",
      name: "Architecture / Design",
      title: "Architecture question: [topic]",
      body: `## System Description
Describe your current or planned system.

## Requirements
- Performance:
- Scale:
- Constraints:

## Options Considered
1. **Option A**: Description, pros, cons
2. **Option B**: Description, pros, cons

## Specific Question
What specifically do you need help deciding?
`,
      tags: ["architecture"],
    },
    {
      id: "comparison",
      name: "Tool/Library Comparison",
      title: "[Tool A] vs [Tool B] for [use case]",
      body: `## Use Case
What are you building?

## Requirements
- Must have:
- Nice to have:
- Budget/constraints:

## Options
| Feature | Tool A | Tool B |
|---------|--------|--------|
|         |        |        |

## What I've Researched
Summary of what you've found so far.
`,
      tags: ["comparison"],
    },
    {
      id: "performance",
      name: "Performance Issue",
      title: "Performance: [component] is slow when [condition]",
      body: `## Current Performance
- Latency:
- Throughput:
- Resource usage:

## Expected Performance
What's your target?

## Profiling Data
Include any benchmarks, flame graphs, or metrics.

## System Specs
- Hardware:
- Model size:
- Batch size:

## Code
\`\`\`python
# Relevant code
\`\`\`
`,
      tags: ["performance"],
    },
  ];

  return Response.json(templates);
}
