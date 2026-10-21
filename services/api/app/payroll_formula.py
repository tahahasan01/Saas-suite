"""The pay-component formula language (St03 §6.5, risk 8). Our own, and tiny.

    BASE * 0.45
    if(PAYMENT_DAYS < PERIOD_DAYS, 0, 2000)
    round(min(BASIC * 0.1, 5000))

Grammar: decimal numbers, component codes (UPPER_CASE), unary minus,
``+ - * /``, parentheses, comparisons (``< <= > >= == !=`` give 1 or 0) and
four functions: ``min(a, …)``, ``max(a, …)``, ``round(x[, 0..2])`` (half-up)
and ``if(cond, then, else)`` (only the chosen branch is evaluated).

A hand-written Pratt parser turns the text into a small AST, which is
evaluated over Decimal. Nothing is ever handed to Python's evaluator, there is
no attribute access, no loops and no user-defined functions; the text, the
tree and the nesting all have hard limits, and every failure is a
FormulaError carrying the character position (fuzzed in the tests).
"""
from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation, localcontext
from typing import Union

MAX_LENGTH = 500      # characters of formula text
MAX_NODES = 100       # AST nodes
MAX_DEPTH = 20        # nesting of parentheses, calls and operators
MAX_MAGNITUDE = Decimal(10) ** 15   # any intermediate value beyond ±10^15 is refused

FUNCTIONS = ("min", "max", "round", "if")
_CODE = re.compile(r"[A-Z][A-Z0-9_]*")
_NUMBER = re.compile(r"\d{1,12}(?:\.\d{1,4})?(?![\d.])")


class FormulaError(ValueError):
    def __init__(self, message: str, position: int = 0) -> None:
        super().__init__(message)
        self.position = position


class CycleError(ValueError):
    def __init__(self, cycle: list[str]) -> None:
        super().__init__("Components refer to each other in a loop: " + " → ".join([*cycle, cycle[0]]))
        self.cycle = cycle


# ── AST ─────────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class Num:
    value: Decimal


@dataclass(frozen=True)
class Var:
    name: str
    pos: int


@dataclass(frozen=True)
class Neg:
    operand: Node


@dataclass(frozen=True)
class Bin:
    op: str
    left: Node
    right: Node
    pos: int


@dataclass(frozen=True)
class Call:
    name: str
    args: tuple[Node, ...]
    pos: int


Node = Union[Num, Var, Neg, Bin, Call]


# ── Tokens ──────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class Tok:
    kind: str     # num | code | func | op | ( | ) | , | end
    text: str
    pos: int


_OPS = ("<=", ">=", "==", "!=", "<", ">", "+", "-", "*", "/")


def _tokens(src: str) -> list[Tok]:
    out: list[Tok] = []
    i = 0
    while i < len(src):
        ch = src[i]
        if ch in " \t":
            i += 1
            continue
        if ch.isascii() and ch.isdigit():
            m = _NUMBER.match(src, i)
            if not m:
                raise FormulaError("Numbers have at most 12 digits and 4 decimals", i)
            out.append(Tok("num", m.group(), i))
            i = m.end()
            continue
        if ch.isascii() and ch.isalpha():
            j = i
            while j < len(src) and src[j].isascii() and (src[j].isalnum() or src[j] == "_"):
                j += 1
            word = src[i:j]
            if word in FUNCTIONS:
                out.append(Tok("func", word, i))
            elif _CODE.fullmatch(word):
                out.append(Tok("code", word, i))
            else:
                raise FormulaError(f"Unknown name {word!r}: codes are UPPER_CASE, functions are "
                                   + ", ".join(FUNCTIONS), i)
            i = j
            continue
        op = next((o for o in _OPS if src.startswith(o, i)), None)
        if op:
            out.append(Tok("op", op, i))
            i += len(op)
            continue
        if ch in "(),":
            out.append(Tok(ch, ch, i))
            i += 1
            continue
        raise FormulaError(f"Unexpected character {ch!r}", i)
    out.append(Tok("end", "", len(src)))
    return out


# ── Pratt parser ────────────────────────────────────────────────────────────
_BINDING = {"<": 10, "<=": 10, ">": 10, ">=": 10, "==": 10, "!=": 10,
            "+": 20, "-": 20, "*": 30, "/": 30}
_UNARY = 40


class _Parser:
    def __init__(self, src: str) -> None:
        self.toks = _tokens(src)
        self.i = 0
        self.nodes = 0
        self.depth = 0

    def peek(self) -> Tok:
        return self.toks[self.i]

    def take(self) -> Tok:
        t = self.toks[self.i]
        self.i += 1
        return t

    def expect(self, kind: str) -> Tok:
        t = self.take()
        if t.kind != kind:
            raise FormulaError(f"Expected {kind!r}" + (f" but found {t.text!r}" if t.text else " before the end"),
                               t.pos)
        return t

    def node(self, n: Node, pos: int) -> Node:
        self.nodes += 1
        if self.nodes > MAX_NODES:
            raise FormulaError(f"Formula is too complex (more than {MAX_NODES} parts)", pos)
        return n

    def expr(self, rbp: int = 0) -> Node:
        self.depth += 1
        if self.depth > MAX_DEPTH:
            raise FormulaError(f"Formula is nested too deep (more than {MAX_DEPTH} levels)", self.peek().pos)
        left = self.prefix()
        while True:
            t = self.peek()
            bp = _BINDING.get(t.text, 0) if t.kind == "op" else 0
            if bp <= rbp:
                break
            self.take()
            right = self.expr(bp)   # same power on the right: left-associative
            left = self.node(Bin(t.text, left, right, t.pos), t.pos)
        self.depth -= 1
        return left

    def prefix(self) -> Node:
        t = self.take()
        if t.kind == "num":
            return self.node(Num(Decimal(t.text)), t.pos)
        if t.kind == "code":
            return self.node(Var(t.text, t.pos), t.pos)
        if t.kind == "op" and t.text == "-":
            return self.node(Neg(self.expr(_UNARY)), t.pos)
        if t.kind == "(":
            inner = self.expr()
            self.expect(")")
            return inner
        if t.kind == "func":
            return self.call(t)
        raise FormulaError(f"Unexpected {t.text!r}" if t.text else "Formula ends too early", t.pos)

    def call(self, t: Tok) -> Node:
        self.expect("(")
        args: list[Node] = []
        if self.peek().kind != ")":
            args.append(self.expr())
            while self.peek().kind == ",":
                self.take()
                args.append(self.expr())
        self.expect(")")
        name = t.text
        if name in ("min", "max") and not args:
            raise FormulaError(f"{name}() needs at least one value", t.pos)
        if name == "if" and len(args) != 3:
            raise FormulaError("if() takes a condition, a value if true and a value if false", t.pos)
        if name == "round":
            if len(args) not in (1, 2):
                raise FormulaError("round() takes a value and optionally 0, 1 or 2 decimals", t.pos)
            if len(args) == 2 and not (isinstance(args[1], Num) and args[1].value in (0, 1, 2)
                                       and args[1].value == args[1].value.to_integral_value()):
                raise FormulaError("round()'s decimals must be 0, 1 or 2", t.pos)
        return self.node(Call(name, tuple(args), t.pos), t.pos)


def parse(src: str) -> Node:
    if len(src) > MAX_LENGTH:
        raise FormulaError(f"Formula is too long (more than {MAX_LENGTH} characters)", MAX_LENGTH)
    if not src.strip():
        raise FormulaError("Formula is empty", 0)
    p = _Parser(src)
    tree = p.expr()
    end = p.peek()
    if end.kind != "end":
        raise FormulaError(f"Unexpected {end.text!r}", end.pos)
    return tree


def references(node: Node) -> set[str]:
    """Every component code the formula reads."""
    if isinstance(node, Var):
        return {node.name}
    if isinstance(node, Neg):
        return references(node.operand)
    if isinstance(node, Bin):
        return references(node.left) | references(node.right)
    if isinstance(node, Call):
        out: set[str] = set()
        for a in node.args:
            out |= references(a)
        return out
    return set()


def validate(src: str, known: set[str]) -> Node:
    """Parse and check that every code is one of `known` (at save time)."""
    tree = parse(src)
    unknown = sorted(references(tree) - known)
    if unknown:
        raise FormulaError("Unknown code" + ("s " if len(unknown) > 1 else " ") + ", ".join(unknown), 0)
    return tree


# ── Evaluation ──────────────────────────────────────────────────────────────
def _checked(v: Decimal, pos: int) -> Decimal:
    if abs(v) > MAX_MAGNITUDE:
        raise FormulaError("Result is too large", pos)
    return v


def _eval(node: Node, env: Mapping[str, Decimal]) -> Decimal:
    if isinstance(node, Num):
        return node.value
    if isinstance(node, Var):
        if node.name not in env:
            raise FormulaError(f"No value for {node.name}", node.pos)
        return env[node.name]
    if isinstance(node, Neg):
        return -_eval(node.operand, env)
    if isinstance(node, Bin):
        a, b = _eval(node.left, env), _eval(node.right, env)
        op = node.op
        if op == "+":
            return _checked(a + b, node.pos)
        if op == "-":
            return _checked(a - b, node.pos)
        if op == "*":
            return _checked(a * b, node.pos)
        if op == "/":
            if b == 0:
                raise FormulaError("Division by zero", node.pos)
            return _checked(a / b, node.pos)
        result = {"<": a < b, "<=": a <= b, ">": a > b, ">=": a >= b, "==": a == b, "!=": a != b}[op]
        return Decimal(1) if result else Decimal(0)
    # Call
    if node.name == "if":
        cond = _eval(node.args[0], env)
        return _eval(node.args[1] if cond != 0 else node.args[2], env)
    values = [_eval(a, env) for a in node.args]
    if node.name == "min":
        return min(values)
    if node.name == "max":
        return max(values)
    digits = int(values[1]) if len(values) == 2 else 0
    return values[0].quantize(Decimal(1).scaleb(-digits), rounding=ROUND_HALF_UP)


def evaluate(node: Node, env: Mapping[str, Decimal]) -> Decimal:
    with localcontext() as ctx:
        ctx.prec = 34
        try:
            return _eval(node, env)
        except InvalidOperation as e:   # e.g. quantize beyond the precision
            raise FormulaError(f"Can't compute this formula ({type(e).__name__})", 0)


# ── Ordering ────────────────────────────────────────────────────────────────
def topo_order(deps: Mapping[str, set[str]]) -> list[str]:
    """Codes ordered so each comes after the codes it reads. References to
    names outside `deps` (BASE, PERIOD_DAYS …) are inputs and ignored. Ties
    break alphabetically, so the order is stable. A loop is a CycleError."""
    inside = {code: {d for d in refs if d in deps} for code, refs in deps.items()}
    waiting = {code: len(refs) for code, refs in inside.items()}
    readers: dict[str, list[str]] = {code: [] for code in inside}
    for code, refs in inside.items():
        for d in refs:
            readers[d].append(code)
    ready = sorted(c for c, n in waiting.items() if n == 0)
    order: list[str] = []
    while ready:
        code = ready.pop(0)
        order.append(code)
        for r in readers[code]:
            waiting[r] -= 1
            if waiting[r] == 0:
                ready.append(r)
        ready.sort()
    if len(order) < len(inside):
        raise CycleError(_find_cycle({c: inside[c] for c in inside if c not in order}))
    return order


def _find_cycle(graph: Mapping[str, set[str]]) -> list[str]:
    # Every node left has an unresolved dependency inside the leftover graph,
    # so walking dependencies from any of them must revisit a node.
    start = sorted(graph)[0]
    path: list[str] = []
    seen: dict[str, int] = {}
    node = start
    while node not in seen:
        seen[node] = len(path)
        path.append(node)
        node = sorted(d for d in graph[node] if d in graph)[0]
    return path[seen[node]:]
