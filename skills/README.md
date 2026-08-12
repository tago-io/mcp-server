# TagoIO Agent Skills

Skills that teach an AI assistant how to do specific TagoIO work. Each one is a folder with a
`SKILL.md` following the [Agent Skills](https://agentskills.io) open standard, so it loads in any
compatible client: Claude Code, Cursor, GitHub Copilot, Gemini CLI, and others.

| Skill | What it teaches |
| ----- | --------------- |
| [custom-widget-development](custom-widget-development/SKILL.md) | Authoring, uploading, debugging, and placing TagoIO custom dashboard widgets (`.tsx` React components) |

## The MCP server is a prerequisite

These skills drive the TagoIO MCP server's tools. `custom-widget-development`, for example, walks
through `get_custom_widget_code`, `upload_custom_widget_code`, and `widget_schema_lookup`.

Install a skill without connecting the server and your assistant will follow the instructions, then
fail to call any of the tools they name. Set up the server first: see
[Client setup](../README.md#client-setup) in the root README.

## Installing a skill

Skills ship inside the `@tago-io/mcp-server` npm package, so an installed package already has them
on disk. To install one directly for Claude Code:

```bash
# all projects
mkdir -p ~/.claude/skills/custom-widget-development
curl -fsSL https://raw.githubusercontent.com/tago-io/mcp-server/master/skills/custom-widget-development/SKILL.md \
  -o ~/.claude/skills/custom-widget-development/SKILL.md

# one project
mkdir -p .claude/skills/custom-widget-development
curl -fsSL https://raw.githubusercontent.com/tago-io/mcp-server/master/skills/custom-widget-development/SKILL.md \
  -o .claude/skills/custom-widget-development/SKILL.md
```

For other clients, put the same file wherever that client loads skills or reusable prompts from.
