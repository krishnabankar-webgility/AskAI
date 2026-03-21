# GitHub Copilot Global Instructions

This repository contains custom Copilot prompts for automating Jira and SQL Server workflows.

## Available Prompts

Use these prompts in **Copilot Chat** in Visual Studio by typing `/` and selecting the prompt name:

| Prompt | Purpose |
|--------|---------|
| `/jira-automation` | Jira workflow automation: create Stories, subtasks, worklogs, sprint lifecycle |
| `/db-automation` | SQL Server database restore and operations |

## General Guidelines

- Always ask for missing required inputs before taking action
- Never store credentials, passwords, or connection strings in repo files
- Use Jira/Atlassian MCP tools when available for Jira operations
- Use `sqlcmd` for SQL Server operations; ask for server instance if not provided
- Mask secrets (`***`) in all output — never repeat full passwords
