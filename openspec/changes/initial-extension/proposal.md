# Proposal: Lifecycle Hooks Logger Extension

## What

A Pi coding agent extension that captures every lifecycle hook from the Prompt → Completion flow and writes structured JSONL to a log file configurable by the end user.

## Why

Orchestration layers, monitoring dashboards, and debugging tools need a reliable way to observe what the Pi agent does. Currently there is no built-in mechanism for external consumers to access lifecycle data. This extension bridges that gap by providing a persistent, append-only log that any process can tail or query.

## Goals

- Log all 19 lifecycle hooks defined in the Prompt → Completion lifecycle with rich, hook-specific fields
- Let users configure the output path via CLI flag or environment variable
- Each line is valid JSONL so standard tools (`jq`, `grep`, `tail -f`) work out of the box
- Clear the log on each new session so the file never grows unbounded

## Non-Goals

- Real-time notification or streaming to remote services (file-based is the transport)
- Hooks outside the Prompt → Completion lifecycle (session management, model changes, user_bash)
- Complex query language or index over the log file
- Web UI or dashboard