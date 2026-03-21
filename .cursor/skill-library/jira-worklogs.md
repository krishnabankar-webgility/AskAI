# Skill: Jira worklogs and story completion

Use this skill for story-point-to-hours conversion, per-subtask worklogs, and closing Stories with consistent logging.

## 4. Worklog automation logic

### 4.1 Conversion

- **1 Story Point = 4 hours** of work (total for the Story’s engineering effort).

Examples:

- `2 SP` → 8 hours total  
- `2.5 SP` → 10 hours total  

### 4.2 Distribution

Divide **total hours equally** across the **three** subtasks:

\[
\text{hours per subtask} = \frac{\text{Story Points} \times 4}{3}
\]

Round to **one decimal** for logging if the tool allows; otherwise round to nearest **0.25h** and document rounding in the output.

### 4.3 When to log

- **When a subtask moves to DONE:** Log work on that subtask = **one third** of total (per §4.2), **unless** work was already logged for that subtask—then **do not duplicate**; adjust only if the user asks.  
- **When the Story moves to DONE:**  
  - Ensure **all subtasks** are **DONE** (transition any that are not, if workflow allows).  
  - For any subtask that **never received** its share of worklog, **log the remaining** allocated hours so the **sum of worklogs** matches **SP × 4** (minus what was already logged).

Always leave a brief **comment** on the Story when bulk-updating subtasks or worklogs for traceability.

## 5. Story completion rule

When the **Story** is set to **DONE** (or user asks to complete the Story):

1. Mark **Analysis**, **Implementation**, and **Unit Testing** subtasks **DONE** (in sensible order if the workflow requires).  
2. Apply **§4.3** so worklogs are complete and consistent.  
