# OmniQA AI Bridge — AI-Readable Project Brief

## 1. Project Name

**OmniQA AI Bridge**

## 2. Project Owner / Context

The project is created for a QA manager working in a production advertising agency.

The team already has internal tools for:

- video file comparison,
- PDF comparison,
- HTML5 package validation,
- QA reporting,
- workflow automation,
- production task support,
- client-specific validation processes.

The goal is **not** to replace those existing tools.

The goal is to build a secure communication, orchestration and collaboration layer between:

- local repositories,
- existing QA tools,
- IDEs,
- Git,
- test runners,
- local AI models,
- cloud AI models,
- coding agents,
- human reviewers.

---

## 3. Main Goal

Build a local-first AI bridge that allows AI models and coding agents to safely assist with:

- project understanding,
- code development,
- debugging,
- test execution,
- patch generation,
- code review,
- report interpretation,
- automation design,
- QA process supervision,
- routine task automation,
- coordination between multiple coding agents.

The bridge should reduce manual copy-paste between chat and IDE.

The bridge should provide AI with controlled access to project context without exposing sensitive client data by default.

---

## 4. Key Principle

The system should follow this principle:

> Local first. Cloud only when explicitly approved.

The bridge must never send sensitive data, client assets, credentials, production files, or confidential materials to external AI providers without explicit human approval.

---

## 5. What This Project Is

OmniQA AI Bridge is:

- a local CLI tool,
- a project context manager,
- a secure AI communication layer,
- a tool orchestrator,
- an agent router,
- a patch manager,
- a test runner wrapper,
- a report interpreter,
- a knowledge base connector,
- a human approval workflow,
- a bridge between existing QA tools and AI models.

---

## 6. What This Project Is Not

OmniQA AI Bridge is **not**:

- a new video comparison tool,
- a new PDF comparison tool,
- a new HTML5 validator,
- a replacement for existing QA tools,
- a fully autonomous deploy system,
- a tool that silently sends files to cloud AI,
- a tool that applies code changes without review.

---

## 7. Target Users

Primary users:

- QA Manager,
- QA automation developer,
- internal tools developer,
- production QA specialist.

Secondary users:

- coding agents,
- AI assistants,
- local LLMs,
- cloud LLMs,
- CI/test systems.

---

## 8. Core Use Cases

### 8.1 Development Assistance

The bridge should help develop and maintain existing QA tools.

Example user command:

```bash
omniqa dev "Add support for a new HTML5 validation profile for client X"
```
