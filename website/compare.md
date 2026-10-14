---
aside: false
sidebar: false
title: Compare
description: How ctxman compares with open-source context packers and enterprise code-context platforms, with sources.
---

<script setup>
import CompareMatrix from './.vitepress/components/CompareMatrix.vue';
import landscape from './.vitepress/data/landscape.json';
</script>

# How ctxman compares

Two kinds of tools prepare code for language models. **Context packers** (Repomix, Gitingest,
code2prompt, Aider's repo map) run on your machine and turn a repository into text a model can
read. **Code-context platforms** (Sourcegraph, GitHub Copilot, Augment Code, Unblocked) index
code on a server, often with tickets, chat and wikis, and serve it to their own assistant and to
other agents over MCP.

ctxman is a context packer with the controls teams ask platforms for: token budgets, a policy file
and an audit log, PR and history context, and an MCP server, all without an account or a server.

<CompareMatrix lang="en" />

## Where ctxman is different

- **Token counts you can check.** Every file and function has a count, for the encoding of the
  model you target, and `ctxman count --api` gets Claude's exact count from Anthropic. None of the
  enterprise products we looked at documents user-visible token counts.
- **A budget, not a hope.** `ctxman pack --budget` and `ctxman map --tokens` fill a token budget
  with the highest-ranked files and functions and never exceed it; `--max-tokens` turns it into a
  CI check.
- **Why the code looks like this.** `ctxman why file:function` collects the commits, referenced
  issues, owners, co-changed files and design notes behind a function, from git and the repository.
  Platforms such as Unblocked do this with Slack, Jira and Confluence on their servers; ctxman stays
  on the machine and covers what git and the repository record.
- **Governance without a server.** A policy file in the repository (or one set by the organisation
  with `CTXMAN_POLICY`) denies paths, requires redaction and caps export size for the CLI, the API
  and the MCP server alike, and every export is written to an audit log.

## What ctxman doesn't do

ctxman has no hosted index, no single sign-on or roles, and doesn't read tickets, chat or wikis.
If you need answers across a whole organisation's repositories and discussions, with permissions
enforced per user, a platform such as Sourcegraph or Unblocked is built for that, and ctxman can
still prepare the context you send to it.

The table records what each product documents as of {{ landscape.checked }}. Corrections are
welcome in [an issue]({{ landscape.roadmapUrl }}).
