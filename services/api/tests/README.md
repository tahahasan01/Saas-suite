# API tests

One folder per module. Every test is automatically marked with its folder name,
so you can run exactly the part you're working on.

| Folder | Marker | Covers |
|--------|--------|--------|
| `core/` | `core` | Auth sessions, database grants, RLS, session tokens, billing limits, CSV parsing |
| `ai/` | `ai` | AI gateway SQL guard |
| `crm/` | `crm` | Leads, scoring, lead CSV import/export |
| `pos/` | `pos` | Sales, returns, cash drawer, purchase orders, product CSV |
| `fbr/` | `fbr` | FBR payload and tax split, filing, retry |
| `hrms/` | `hrms` | Employees, attendance, leave, payroll, employee portal |

Shared fixtures (`client`, `tenant`, `pos_tenant`, `crm_tenant`) live in `conftest.py`.

## Running (from `services/api`)

```bash
python -m pytest                          # everything
python -m pytest tests/pos                # one module by folder
python -m pytest -m fbr                   # one module by marker
python -m pytest -m "pos or fbr"          # several modules
python -m pytest tests/core/test_session_hygiene.py              # one file
python -m pytest tests/ai -k "comma or quoted"                   # by test name
```

On Windows use `.\.venv\Scripts\python -m pytest …`. Most tests need the dev
database (`npm run db:up` from the repo root, then `python -m scripts.migrate`).

## Adding a module

Create `tests/<module>/` with an empty `__init__.py`, add `<module>` to
`MODULE_MARKERS` in `conftest.py`, and register the marker in `pytest.ini`.
`--strict-markers` makes a forgotten registration fail loudly.
