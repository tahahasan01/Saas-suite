"""The pay-component formula language (St03 §6.5, risk 8).

A deliberately tiny, original expression language: numbers, component codes,
+ - * / and parentheses, comparisons, min/max/round/if. A hand-written Pratt
parser builds an AST that is evaluated over Decimal. No `eval`, no attribute
access, no loops, a hard size limit, and a cycle between components is an
error when the structure is saved, not when payroll runs.
"""
from __future__ import annotations

from decimal import Decimal

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app import payroll_formula as f

D = Decimal


def ev(text: str, **env: object) -> Decimal:
    return f.evaluate(f.parse(text), {k: D(str(v)) for k, v in env.items()})


@pytest.mark.parametrize("text, expected", [
    ("1 + 2 * 3", "7"),
    ("(1 + 2) * 3", "9"),
    ("10 - 4 - 3", "3"),            # left-associative
    ("100 / 8", "12.5"),
    ("-5 + 2", "-3"),
    ("--5", "5"),
    ("2 * -3", "-6"),
    ("0.45 * 1000", "450.00"),
    ("min(3, 1, 2)", "1"),
    ("max(3, 1, 2)", "3"),
    ("round(2.5)", "3"),            # half-up, never banker's
    ("round(-2.5)", "-3"),
    ("round(1234.565, 2)", "1234.57"),
    ("if(1 > 2, 10, 20)", "20"),
    ("if(2 >= 2, 10, 20)", "10"),
    ("3 == 3", "1"),
    ("3 != 3", "0"),
    ("1 < 2", "1"),
    ("2 <= 1", "0"),
])
def test_arithmetic(text, expected):
    assert ev(text) == D(expected)


def test_identifiers_come_from_the_environment():
    assert ev("BASE * 0.1", BASE=50000) == D("5000.0")
    assert ev("BASIC + HRA", BASIC=1000, HRA=450) == D("1450")
    assert ev("if(PAYMENT_DAYS < PERIOD_DAYS, 0, 2000)", PAYMENT_DAYS=28, PERIOD_DAYS=31) == D("0")


def test_references_lists_every_code_used():
    assert f.references(f.parse("BASIC * 0.45 + max(HRA, CONV) + 10")) == {"BASIC", "HRA", "CONV"}
    assert f.references(f.parse("12")) == set()


@pytest.mark.parametrize("text", [
    "", "1 +", "* 2", "(1 + 2", "1 + 2)", "min()", "round(1, 2, 3)", "if(1, 2)",
    "foo(1)", "BASE.x", "BASE[0]", "__import__('os')", "1 ** 2", "1 // 2", "a = 1",
    "lower_case", "1e5", "1.2.3", "1,2", "'text'", "BASE;", "if", "round(1, 7)",
    "round(1, BASE)", "123456789012345", "1.12345",
])
def test_anything_else_is_a_formula_error(text):
    with pytest.raises(f.FormulaError):
        f.parse(text)


def test_errors_point_at_the_problem():
    with pytest.raises(f.FormulaError) as e:
        f.parse("BASE + * 2")
    assert e.value.position == 7


def test_division_by_zero_and_unknown_codes_fail_at_evaluation():
    with pytest.raises(f.FormulaError, match="zero"):
        ev("BASE / DAYS", BASE=1, DAYS=0)
    with pytest.raises(f.FormulaError, match="HRA"):
        ev("HRA * 2")


def test_size_limits():
    with pytest.raises(f.FormulaError, match="long"):
        f.parse("1 + " * 200 + "1")
    with pytest.raises(f.FormulaError, match="(?i)complex|deep"):
        f.parse("(" * 60 + "1" + ")" * 60)
    with pytest.raises(f.FormulaError, match="(?i)complex"):
        f.parse("+".join(["B"] * 120))
    # Deeply nested input must be a FormulaError, never a RecursionError.
    with pytest.raises(f.FormulaError):
        f.parse("-" * 5000 + "1")


def test_huge_results_are_refused():
    with pytest.raises(f.FormulaError, match="large"):
        ev("999999999999 * 999999999999 * 999999999999")


def test_validate_rejects_unknown_codes():
    f.validate("BASE * 0.5 + HRA", known={"BASE", "HRA"})
    with pytest.raises(f.FormulaError, match="MEDICAL"):
        f.validate("BASE + MEDICAL", known={"BASE"})


# ── Ordering components ──────────────────────────────────────────────────────
def test_topological_order_puts_dependencies_first():
    order = f.topo_order({"NET": {"GROSS2"}, "GROSS2": {"BASIC", "HRA"}, "HRA": {"BASIC"}, "BASIC": set()})
    assert order.index("BASIC") < order.index("HRA") < order.index("GROSS2") < order.index("NET")


def test_order_is_stable_for_independent_components():
    assert f.topo_order({"B": set(), "A": set(), "C": set()}) == ["A", "B", "C"]


def test_inputs_outside_the_set_are_ignored():
    assert f.topo_order({"HRA": {"BASE"}}) == ["HRA"]


def test_a_cycle_is_rejected_and_named():
    with pytest.raises(f.CycleError) as e:
        f.topo_order({"A": {"B"}, "B": {"C"}, "C": {"A"}, "D": set()})
    assert set(e.value.cycle) == {"A", "B", "C"}
    with pytest.raises(f.CycleError):
        f.topo_order({"A": {"A"}})


# ── Fuzzing (risk 8) ─────────────────────────────────────────────────────────
@settings(max_examples=400)
@given(st.text(alphabet="0123456789.+-*/()<>=!, ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcmixnroudf", max_size=120))
def test_any_text_parses_or_is_a_formula_error(text):
    try:
        node = f.parse(text)
    except f.FormulaError:
        return
    env = {name: D(7) for name in f.references(node)}
    try:
        f.evaluate(node, env)
    except f.FormulaError:
        pass


@st.composite
def exprs(draw, depth=0):
    """(source text, expected Decimal) built from a tree we evaluate ourselves."""
    if depth > 4 or draw(st.booleans()):
        n = draw(st.integers(min_value=0, max_value=99999))
        return str(n), D(n)
    op = draw(st.sampled_from(["+", "-", "*", "min", "max", "neg", "if"]))
    a_src, a = draw(exprs(depth=depth + 1))
    b_src, b = draw(exprs(depth=depth + 1))
    if op == "neg":
        return f"-({a_src})", -a
    if op in ("min", "max"):
        return f"{op}({a_src}, {b_src})", (min if op == "min" else max)(a, b)
    if op == "if":
        return f"if({a_src} > {b_src}, {a_src}, {b_src})", a if a > b else b
    value = {"+": a + b, "-": a - b, "*": a * b}[op]
    return f"({a_src}) {op} ({b_src})", value


@settings(max_examples=300)
@given(exprs())
def test_generated_expressions_evaluate_like_python(case):
    src, expected = case
    try:
        node = f.parse(src)
    except f.FormulaError as e:
        # The only acceptable refusal of a well-formed expression is its size.
        assert "complex" in str(e).lower() or "long" in str(e).lower() or "deep" in str(e).lower()
        return
    try:
        assert f.evaluate(node, {}) == expected
    except f.FormulaError as e:
        assert "large" in str(e).lower()


def test_the_module_never_calls_the_python_evaluator():
    import ast
    import inspect
    tree = ast.parse(inspect.getsource(f))
    called = {n.func.id for n in ast.walk(tree) if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)}
    assert not called & {"eval", "exec", "compile", "__import__", "getattr", "setattr"}
