#!/usr/bin/env python3
"""
Codegen script that converts Python sqlglot dialect tests into TypeScript vitest files.

Three-phase pipeline: Parse -> Classify -> Emit

Usage:
    python3 scripts/codegen_tests.py              # Generate all dialect test files
    python3 scripts/codegen_tests.py --dialect mysql  # Generate specific dialect only
    python3 scripts/codegen_tests.py --dry-run     # Print to stdout
    python3 scripts/codegen_tests.py --stats       # Print stats only
"""

import argparse
import ast
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

# Paths
SCRIPT_DIR = Path(__file__).parent
SQLGLOT_TS_DIR = SCRIPT_DIR.parent
SQLGLOT_ROOT = SQLGLOT_TS_DIR.parent
PY_TESTS_DIR = SQLGLOT_ROOT / "tests" / "dialects"
TS_TESTS_DIR = SQLGLOT_TS_DIR / "tests" / "dialects"

# Protected files that should never be overwritten
PROTECTED_FILES = {
    "test_mysql_to_postgres.test.ts",
    "test_playground_e2e.test.ts",
    "test_advanced_transpile.test.ts",
}

# Skip these Python test files (not dialect-specific transpile tests)
SKIP_FILES = {"test_dialect.py", "test_pipe_syntax.py"}

# DDL/DML/command keywords that signal a todo test
DDL_DML_KEYWORDS = re.compile(
    r"^\s*(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|MERGE|TRUNCATE|REPLACE\s+INTO)\b",
    re.IGNORECASE,
)
COMMAND_KEYWORDS = re.compile(
    r"^\s*(SET|SHOW|GRANT|REVOKE|LOCK|UNLOCK|EXPLAIN|DESCRIBE|ANALYZE|USE|LOAD|COPY|REFRESH|CALL|EXECUTE|PREPARE|DEALLOCATE|DECLARE|BEGIN|COMMIT|ROLLBACK|CACHE|UNCACHE|ADD\s+JAR|MSCK|OPTIMIZE|VACUUM|CLONE|UNDROP|PUT|GET|REMOVE|LIST|COMMENT|ATTACH|DETACH|KILL)\b",
    re.IGNORECASE,
)
UNSUPPORTED_CLAUSES = re.compile(
    r"\b(PIVOT|UNPIVOT|FETCH\s+(?:FIRST|NEXT)|QUALIFY|ROWS\s+BETWEEN|RANGE\s+BETWEEN|CUBE|ROLLUP|GROUPING\s+SETS|FOR\s+(?:UPDATE|SHARE|NO\s+KEY)|MATCH_RECOGNIZE|CONNECT\s+BY|START\s+WITH|MODEL\s+DIMENSION|LATERAL\s+VIEW|TABLESAMPLE|SAMPLE|LATERAL\s*\(|WITHIN\s+GROUP|WITH\s+ORDINALITY|XMLTABLE|JSON_TABLE|JSON_TO_RECORDSET|JSONB_ARRAY_ELEMENTS|JSON_ARRAY_ELEMENTS)\b",
    re.IGNORECASE,
)

# Patterns in SQL that indicate unsupported syntax (checked against full SQL)
UNSUPPORTED_SYNTAX = re.compile(
    r"(@@[A-Z]"  # @@GLOBAL.x, @@SESSION.x variables
    r"|MEMBER\s+OF\s*\("  # MEMBER OF()
    r"|\bUSE\s+INDEX\b"  # USE INDEX hints
    r"|\bIGNORE\s+INDEX\b"  # IGNORE INDEX hints
    r"|\bFORCE\s+INDEX\b"  # FORCE INDEX hints
    r"|\bSTRAIGHT_JOIN\b"  # MySQL STRAIGHT_JOIN
    r"|HIGH_PRIORITY"  # MySQL HIGH_PRIORITY
    r"|SQL_CALC_FOUND_ROWS"  # MySQL SQL_CALC_FOUND_ROWS
    r"|/\*\+\s"  # Optimizer hints /*+ ... */
    r"|\bBINARY\s+\w"  # BINARY cast keyword
    r"|_utf8mb4\s*'"  # MySQL introducers _utf8mb4'...'
    r"|_latin1\s"  # MySQL introducers _latin1 ...
    r"|[Nn]'"  # N'...' national string literal
    r"|\bUSING\s+\w+\s*\)"  # CHAR(x USING utf8) / CONVERT USING
    r"|:=\s"  # MySQL assignment operator :=
    r"|\bXOR\b"  # XOR operator
    r"|\b\d+\s*&&\s*\d+"  # && as AND (MySQL)
    r"|\|\|/\s"  # ||/ cube root operator (Postgres)
    r"|\|/\s"  # |/ square root operator (Postgres)
    r"|@@\s"  # @@ full-text search operator (Postgres)
    r"|\bSOUNDS\s+LIKE\b"  # MySQL SOUNDS LIKE
    r"|\be'"  # Postgres e-strings
    r"|\$\$"  # Dollar-quoted strings
    r"|~\*?\s*'"  # Regex match operators (Postgres)
    r"|!\s*~"  # Negated regex match (Postgres)
    r"|\?\s*'"  # JSON ? operator (Postgres)
    r"|ARRAY\s*\["  # ARRAY[...] literal
    r"|ARRAY\s*\("  # ARRAY(SELECT ...)
    r"|\bWINDOW\s+\w+\s+AS\b"  # WINDOW clause
    r"|\bFROM\s+'[^']*'\s+FOR\b"  # SUBSTRING FROM ... FOR (non-standard)
    r"|SUBSTR(?:ING)?\s*\([^)]*\bFROM\b"  # SUBSTRING/SUBSTR(x FROM y)
    r"|TRIM\s*\([^)]*\bFROM\b"  # TRIM(x FROM y)
    r"|\bAS\s+MATERIALIZED\b"  # CTE MATERIALIZED hint
    r"|\bAS\s+NOT\s+MATERIALIZED\b"  # CTE NOT MATERIALIZED hint
    r"|CURRENT_SCHEMA(?!\s*\()"  # CURRENT_SCHEMA without parens
    r"|->>"  # JSON ->> operator
    r"|->\s*'"  # JSON -> 'key' operator
    r"|->\s*\d"  # JSON -> 0 operator
    r"|\bMATCH\s*\([^)]*\)\s*AGAINST\b"  # MySQL MATCH ... AGAINST
    r"|::\w"  # Postgres :: cast operator
    r"|\bINTERVAL\s+'[^']*'\s+\w+"  # INTERVAL '1' YEAR standalone
    r"|\bDISTINCTROW\b"  # MySQL DISTINCTROW
    r"|\bSTRING_AGG\s*\("  # STRING_AGG with ORDER BY
    r"|\bGROUP_CONCAT\s*\("  # GROUP_CONCAT with DISTINCT/ORDER BY
    r"|\bEXPLAIN\s+SELECT\b"  # EXPLAIN SELECT (anywhere, not just start)
    r"|EXTRACT\s*\(\s*QUARTER\b"  # EXTRACT(QUARTER ...)
    r"|^\s*END\s"  # END WORK / END AND CHAIN
    r"|\bONLY\s+\w"  # FROM ONLY t (Postgres inheritance)
    r"|\bX'[0-9A-Fa-f]"  # Hex literals X'...'
    r"|\bx'[0-9A-Fa-f]"  # Hex literals x'...'
    r"|'[^']*'\s*'[^']*'"  # Adjacent string concat 'a' 'b'
    r"|::\w"  # Postgres cast ::type
    r"|\bPARTITION\s*\(\w"  # PARTITION(p0) hint
    r"|\bCHARACTER\s+SET\b"  # CHARACTER SET
    r"|\bCONVERT\s*\("  # CONVERT()
    r"|~\s*\w"  # Bitwise NOT / regex match ~
    r"|\bDATE_(?:ADD|SUB)\s*\([^,]+,\s*INTERVAL\b"  # DATE_ADD/DATE_SUB with INTERVAL
    r"|\bORDER\s+BY\s+BINARY\b"  # ORDER BY BINARY
    r"|\bLATERAL\s+\w"  # LATERAL subquery/function
    r"|\bGENERATE_SERIES\s*\("  # GENERATE_SERIES
    r"|\bOVERLAPS\b"  # OVERLAPS predicate
    r"|\bNOTNULL\b"  # NOTNULL shorthand
    r"|\bISNULL\b"  # ISNULL shorthand (Postgres)
    r"|#>\s*'"  # JSON #> path operator
    r"|#>>\s*'"  # JSON #>> path operator
    r"|\btimestamp\s+'"  # Typed literal timestamp '...'
    r"|\bdate\s+'"  # Typed literal date '...'
    r"|\btime\s+'"  # Typed literal time '...'
    r"|SUBSTRING\s*\([^)]*\bfor\b"  # SUBSTRING(x for y)
    r"|\bROWS\s+\d+\s+PRECEDING\b"  # ROWS N PRECEDING
    r"|\bRANGE\s+\w+\s+PRECEDING\b"  # RANGE ... PRECEDING
    r"|\bEXCLUDE\s+CURRENT\b"  # EXCLUDE CURRENT ROW
    r"|\bt1\s*\*"  # t1* inheritance notation
    r"|\w\s*\^\s*\w"  # ^ operator (Postgres power/MySQL XOR)
    r"|\bx\s*#\s*y"  # # operator (Postgres XOR)
    r"|\bx\s*\?\s*y"  # ? operator
    r"|\|\|(?!/)"  # || concat operator (but not ||/ cube root)
    r"|\bFILTER\s*\(\s*WHERE\b"  # FILTER(WHERE ...) aggregate
    r"|\bROWS\s+FROM\s*\("  # ROWS FROM (...)
    r"|\bRECURSIVE\b"  # WITH RECURSIVE
    r"|\bFOR\s+KEY\s+SHARE\b"  # FOR KEY SHARE
    r"|\bIS\s+JSON\b"  # IS JSON predicate
    r"|\bOVERLAY\s*\("  # OVERLAY function
    r"|\bVALUES\s*\("  # VALUES (...)
    r"|%\(\w+\)s"  # %(param)s placeholder
    r"|\bSELECT\s+\*\s+FROM\s+\w+\s+WHERE\s+\w+\s*=\s*\?"  # ? placeholder
    r"|\bFETCH\s+\d+\s+ROW"  # FETCH N ROW
    r"|\bcol\s*\[\d+\]"  # col[N] bracket indexing
    r"|TRIM\s*\(\s*(?:BOTH|LEADING|TRAILING)\s+'[^']*'\s+FROM\b"  # TRIM(BOTH/LEADING/TRAILING x FROM y)
    r"|TRIM\s*\(\s*(?:BOTH|LEADING|TRAILING)\s+'[^']*'\s*\)"  # TRIM(BOTH 'x')
    r"|\bCOLLATE\s"  # COLLATE clause
    r"|\bINTO\s+UNLOGGED\b"  # SELECT INTO UNLOGGED
    r"|\bpoint\s+'"  # Typed literal point '...'
    r"|NUMRANGE\s*\("  # Range types
    r"|\bSELECT\s+SLOPE\b"  # SLOPE function
    r"|-\|-\s"  # Range adjacency operator
    r"|\bJSON_AGG\s*\("  # JSON_AGG (ORDER BY unsupported)
    r"|\bCORR\s*\("  # CORR function
    r"|\bSELECT\s+\d+\s+FROM\s*\(\s*\("  # Complex nested subquery
    # Parser-transformed functions (identity breaks)
    r"|\bNOW\s*\(\s*\)"  # NOW() -> CURRENT_TIMESTAMP
    r"|\bCURTIME\s*\("  # CURTIME() -> CURRENT_TIME (no parens)
    r"|\bCURDATE\s*\("  # CURDATE() -> CURRENT_DATE (no parens)
    r"|\bCURRENT_TIMESTAMP\s*\(\s*\d"  # CURRENT_TIMESTAMP(N) arg bug
    # Internal sqlglot functions (not real SQL)
    r"|\bTIME_STR_TO_UNIX\s*\("  # Internal function
    r"|\bTIME_STR_TO_TIME\s*\("  # Internal function
    r"|\bTS_OR_DS_TO_DATE\s*\("  # Internal function
    r"|\bTIME_TO_STR\s*\("  # Internal function
    # Arg-swap / complex transforms
    r"|\bINSTR\s*\("  # INSTR -> LOCATE arg swap
    r"|\bXMLELEMENT\s*\("  # XMLELEMENT NAME bug
    r"|\bAS\s+row\b"  # Reserved word `row`
    # MySQL CAST -> TIMESTAMP(x) transform
    r"|\bCAST\s*\([^)]*\bAS\s+TIMESTAMP(?:TZ|LTZ)?\s*\)"  # CAST(x AS TIMESTAMP) -> TIMESTAMP(x)
    # LIMIT with arithmetic expressions
    r"|\bLIMIT\s+\d+\s*[+\-*/]"  # LIMIT with expression (not just literal)
    # AT TIME ZONE
    r"|\bAT\s+TIME\s+ZONE\b"  # AT TIME ZONE clause
    # Integer division // operator
    r"|\d+\s*//\s*\d+"  # // integer division (DuckDB)
    # %s placeholder
    r"|=\s*%s\b"  # %s parameter placeholder
    # NULLS FIRST/LAST (same-dialect normalization)
    r"|\bNULLS\s+(?:FIRST|LAST)\b"  # NULLS FIRST/LAST ordering
    # MySQL backslash-escaped string tests
    r"|'\\[\"tjn]'"  # Backslash escape in string literal
    r"|'[\t\n\r]'"  # Literal control characters in string
    # Same-dialect transforms (Python normalizes these, TS doesn't)
    r"|\bTO_DAYS\s*\("  # TO_DAYS -> DATEDIFF transform
    r"|\bMONTHNAME\s*\("  # MONTHNAME -> DATE_FORMAT transform
    r"|\bDATE_FORMAT\s*\("  # DATE_FORMAT format string normalization
    r")",
    re.IGNORECASE,
)

# Patterns that work in identity but fail in cross-dialect transpilation
UNSUPPORTED_CROSS_DIALECT = re.compile(
    r"(\bDATE_FORMAT\s*\("  # DATE_FORMAT cross-dialect
    r"|\bDATEDIFF\s*\("  # DATEDIFF cross-dialect
    r"|\bDATE_DIFF\s*\("  # DATE_DIFF cross-dialect
    r"|\bTO_DAYS\s*\("  # TO_DAYS complex transform
    r"|\bFROM_UNIXTIME\s*\("  # FROM_UNIXTIME cross-dialect
    r"|\bTO_TIMESTAMP\s*\("  # TO_TIMESTAMP cross-dialect
    r"|\bSTR_TO_DATE\s*\("  # STR_TO_DATE cross-dialect
    r"|\bDATE_PARSE\s*\("  # DATE_PARSE cross-dialect
    r"|\bMONTHNAME\s*\("  # MONTHNAME complex transform
    r"|\bDAYOFYEAR\s*\("  # Day functions to base dialect
    r"|\bDAYOFMONTH\s*\("  # Day functions to base dialect
    r"|\bDAYOFWEEK\s*\("  # Day functions to base dialect
    r"|\bWEEKOFYEAR\s*\("  # Week functions to base dialect
    r"|\bFULL\s+(?:OUTER\s+)?JOIN\b"  # FULL JOIN -> LEFT JOIN
    r"|\bCONCAT\s*\("  # CONCAT cross-dialect (-> ||)
    r"|\bCHAR_LENGTH\s*\("  # CHAR_LENGTH cross-dialect
    r"|\bCHARACTER_LENGTH\s*\("  # CHARACTER_LENGTH cross-dialect
    r"|\ba\s*/\s*b\b"  # Integer division semantics
    r"|\bCHAR\s*\(\d"  # CHAR(N) -> CHR(N)
    r"|\bARRAY_LENGTH\s*\("  # ARRAY_LENGTH cross-dialect
    r"|\bCARDINALITY\s*\("  # CARDINALITY cross-dialect
    r"|\bSIZE\s*\([^)]*\)"  # SIZE cross-dialect
    r"|\bREPEATED_COUNT\s*\("  # REPEATED_COUNT cross-dialect
    r"|\bJSON_EXTRACT_PATH\s*\("  # JSON cross-dialect
    r"|\bJSON_EXTRACT_PATH_TEXT\s*\("  # JSON cross-dialect
    r"|\bJSONExtractString\s*\("  # JSON cross-dialect
    r"|\bJSONB?_EXISTS\s*\("  # JSON cross-dialect
    r"|\bJSONB?_OBJECT_AGG\s*\("  # JSON cross-dialect
    r"|\bJSON_GROUP_OBJECT\s*\("  # JSON cross-dialect
    r"|\bDATE_BIN\s*\("  # DATE_BIN cross-dialect
    r"|\bDATEADD\s*\("  # DATEADD cross-dialect
    r"|\bGETDATE\s*\("  # GETDATE cross-dialect
    r"|\bUNNEST\s*\("  # UNNEST/EXPLODE cross-dialect
    r"|\bEXPLODE\s*\("  # EXPLODE cross-dialect
    r"|\bANY_VALUE\s*\("  # ANY_VALUE version-aware
    r"|\bRANDOM\s*\("  # RANDOM cross-dialect
    r"|\bDIV\s*\("  # DIV cross-dialect
    r"|\bTO_DATE\s*\("  # TO_DATE cross-dialect
    r"|\bFORMAT\s*\(\d"  # FORMAT cross-dialect
    r"|\bVARIANCE\s*\("  # VARIANCE cross-dialect
    r"|\bVARIANCE_POP\s*\("  # VARIANCE_POP cross-dialect
    r"|\bLOGICAL_OR\s*\("  # LOGICAL_OR cross-dialect
    r"|\bBOOL_OR\s*\("  # BOOL_OR cross-dialect
    r"|\bNULLS\s+(?:FIRST|LAST)\b"  # NULLS FIRST/LAST ordering cross-dialect
    r"|\bDAY\s*\(\w+\)"  # DAY(x) to base dialect
    r"|\bWEEK\s*\(\w+\)"  # WEEK(x) to base dialect
    r"|\bYEAR\s*\(\w+\)"  # YEAR(x) to base dialect
    r"|\bCAST\s*\([^)]*\bAS\s+TEXT\b"  # CAST(x AS TEXT) cross-dialect
    # MySQL-specific types in cross-dialect CAST
    r"|\bMEDIUMBLOB\b"  # MySQL-specific type
    r"|\bLONGBLOB\b"  # MySQL-specific type
    r"|\bTINYBLOB\b"  # MySQL-specific type
    r"|\bMEDIUMTEXT\b"  # MySQL-specific type
    r"|\bLONGTEXT\b"  # MySQL-specific type
    r"|\bTINYTEXT\b"  # MySQL-specific type
    r"|\bMEDIUMINT\b"  # MySQL-specific type
    r")",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Phase 1: Parse
# ---------------------------------------------------------------------------


@dataclass
class ExtractedCall:
    """A single extracted test assertion from Python source."""
    kind: str  # "identity", "all", "skip"
    method_name: str  # Python test method name
    sql: str = ""
    write_sql: str | None = None
    read: dict[str, str] = field(default_factory=dict)
    write: dict[str, str] = field(default_factory=dict)
    skip_reason: str = ""
    has_pretty: bool = False
    has_identify: bool = False
    has_check_command_warning: bool = False
    has_assert_is: bool = False
    has_unsupported_error: bool = False


def resolve_string(node: ast.AST, loop_vars: dict[str, str] | None = None) -> str | None:
    """Try to resolve an AST node to a string value. Returns None if unresolvable."""
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.JoinedStr):
        # f-string: try to resolve all parts
        parts = []
        for v in node.values:
            if isinstance(v, ast.Constant) and isinstance(v.value, str):
                parts.append(v.value)
            elif isinstance(v, ast.FormattedValue):
                inner = resolve_string(v.value, loop_vars)
                if inner is not None:
                    parts.append(inner)
                else:
                    return None
            else:
                return None
        return "".join(parts)
    if isinstance(node, ast.Name) and loop_vars and node.id in loop_vars:
        return loop_vars[node.id]
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        left = resolve_string(node.left, loop_vars)
        right = resolve_string(node.right, loop_vars)
        if left is not None and right is not None:
            return left + right
        return None
    if isinstance(node, ast.Attribute):
        # e.g., exp.DataType.Type.TEXT.value -> just skip
        return None
    if isinstance(node, ast.Call):
        return None
    return None


def resolve_dict(node: ast.AST, loop_vars: dict[str, str] | None = None) -> dict[str, str] | None:
    """Try to resolve an AST dict node to a {dialect: sql} mapping."""
    if not isinstance(node, ast.Dict):
        return None
    result = {}
    for key, value in zip(node.keys, node.values):
        k = resolve_string(key, loop_vars)
        if k is None:
            return None
        v = resolve_string(value, loop_vars)
        if v is None:
            # Check for UnsupportedError
            if isinstance(value, ast.Name) and value.id == "UnsupportedError":
                result[k] = "__UNSUPPORTED__"
            elif isinstance(value, ast.Attribute) and getattr(value, "attr", "") == "UnsupportedError":
                result[k] = "__UNSUPPORTED__"
            else:
                return None
        else:
            result[k] = v
    return result


def extract_calls_from_stmt(
    stmt: ast.AST,
    method_name: str,
    loop_vars: dict[str, str] | None = None,
) -> list[ExtractedCall]:
    """Extract test calls from a single statement."""
    calls = []

    # Handle expression statements with function calls
    if isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Call):
        call = stmt.value
        calls.extend(_extract_from_call(call, method_name, loop_vars))
    elif isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Attribute):
        # Chained .assert_is() on validate_identity
        calls.extend(_extract_from_chained(stmt.value, method_name, loop_vars))
    # Handle for loops with simple iterables
    elif isinstance(stmt, ast.For) and isinstance(stmt.target, ast.Name):
        var_name = stmt.target.id
        iter_values = _resolve_iterable(stmt.iter)
        if iter_values is not None:
            for val in iter_values:
                lvars = dict(loop_vars or {})
                lvars[var_name] = val
                for body_stmt in stmt.body:
                    calls.extend(extract_calls_from_stmt(body_stmt, method_name, lvars))
        else:
            calls.append(ExtractedCall(
                kind="skip", method_name=method_name,
                skip_reason="unresolvable for-loop iterable",
            ))
    # Handle with statements (subTest, assertLogs, assertRaises)
    elif isinstance(stmt, ast.With):
        for body_stmt in stmt.body:
            calls.extend(extract_calls_from_stmt(body_stmt, method_name, loop_vars))
    # Assignments, assertions, etc. -> skip
    elif isinstance(stmt, ast.Assign) or isinstance(stmt, ast.AugAssign):
        # Often variable setup - skip silently
        pass
    elif isinstance(stmt, ast.Assert):
        calls.append(ExtractedCall(
            kind="skip", method_name=method_name,
            skip_reason="assert statement",
        ))
    else:
        # Other statement types (if, etc.)
        pass

    return calls


def _extract_from_chained(node: ast.AST, method_name: str, loop_vars: dict[str, str] | None) -> list[ExtractedCall]:
    """Handle chained calls like self.validate_identity(...).assert_is(...)."""
    if isinstance(node, ast.Attribute) and node.attr == "assert_is":
        if isinstance(node.value, ast.Call):
            calls = _extract_from_call(node.value, method_name, loop_vars)
            for c in calls:
                c.has_assert_is = True
            return calls
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
        if node.func.attr == "assert_is":
            inner = node.func.value
            if isinstance(inner, ast.Call):
                calls = _extract_from_call(inner, method_name, loop_vars)
                for c in calls:
                    c.has_assert_is = True
                return calls
    return []


def _extract_from_call(
    call: ast.Call,
    method_name: str,
    loop_vars: dict[str, str] | None,
) -> list[ExtractedCall]:
    """Extract from a direct function call node."""
    # Check for chained .assert_is()
    if isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute):
        if call.func.attr == "assert_is":
            inner = call.func.value
            if isinstance(inner, ast.Call):
                calls = _extract_from_call(inner, method_name, loop_vars)
                for c in calls:
                    c.has_assert_is = True
                return calls

    func_name = _get_method_name(call)
    if func_name == "validate_identity":
        return _extract_validate_identity(call, method_name, loop_vars)
    elif func_name == "validate_all":
        return _extract_validate_all(call, method_name, loop_vars)
    elif func_name in ("assertEqual", "assertIn", "assertNotIn", "assertIsInstance",
                        "assertRaises", "assertLogs", "assertTrue", "assertFalse",
                        "assertIsNone", "assertIsNotNone", "parse_one",
                        "assert_duckdb_sql"):
        return [ExtractedCall(
            kind="skip", method_name=method_name,
            skip_reason=f"{func_name} call",
        )]
    return []


def _get_method_name(call: ast.Call) -> str | None:
    """Get the method name from self.method_name(...) pattern."""
    if isinstance(call.func, ast.Attribute) and isinstance(call.func.value, ast.Name):
        if call.func.value.id == "self":
            return call.func.attr
    if isinstance(call.func, ast.Attribute):
        return call.func.attr
    return None


def _extract_validate_identity(
    call: ast.Call,
    method_name: str,
    loop_vars: dict[str, str] | None,
) -> list[ExtractedCall]:
    """Extract from self.validate_identity(sql, write_sql=None, ...)."""
    if not call.args:
        return []
    sql = resolve_string(call.args[0], loop_vars)
    if sql is None:
        return [ExtractedCall(kind="skip", method_name=method_name, skip_reason="unresolvable SQL string")]

    write_sql = None
    if len(call.args) > 1:
        write_sql = resolve_string(call.args[1], loop_vars)
        if write_sql is None:
            return [ExtractedCall(kind="skip", method_name=method_name, skip_reason="unresolvable write_sql")]

    # Check keyword args
    has_pretty = False
    has_identify = False
    has_ccw = False
    for kw in call.keywords:
        if kw.arg == "write_sql":
            write_sql = resolve_string(kw.value, loop_vars)
            if write_sql is None:
                return [ExtractedCall(kind="skip", method_name=method_name, skip_reason="unresolvable write_sql")]
        elif kw.arg == "pretty":
            has_pretty = _is_truthy(kw.value)
        elif kw.arg == "identify":
            has_identify = _is_truthy(kw.value)
        elif kw.arg == "check_command_warning":
            has_ccw = _is_truthy(kw.value)

    return [ExtractedCall(
        kind="identity",
        method_name=method_name,
        sql=sql,
        write_sql=write_sql,
        has_pretty=has_pretty,
        has_identify=has_identify,
        has_check_command_warning=has_ccw,
    )]


def _extract_validate_all(
    call: ast.Call,
    method_name: str,
    loop_vars: dict[str, str] | None,
) -> list[ExtractedCall]:
    """Extract from self.validate_all(sql, read={...}, write={...}, ...)."""
    if not call.args:
        return []
    sql = resolve_string(call.args[0], loop_vars)
    if sql is None:
        return [ExtractedCall(kind="skip", method_name=method_name, skip_reason="unresolvable SQL string")]

    read = {}
    write = {}
    has_pretty = False
    has_identify = False
    has_unsupported = False

    for kw in call.keywords:
        if kw.arg == "read":
            r = resolve_dict(kw.value, loop_vars)
            if r is None:
                return [ExtractedCall(kind="skip", method_name=method_name, skip_reason="unresolvable read dict")]
            read = r
        elif kw.arg == "write":
            w = resolve_dict(kw.value, loop_vars)
            if w is None:
                return [ExtractedCall(kind="skip", method_name=method_name, skip_reason="unresolvable write dict")]
            write = w
            has_unsupported = any(v == "__UNSUPPORTED__" for v in w.values())
        elif kw.arg == "pretty":
            has_pretty = _is_truthy(kw.value)
        elif kw.arg == "identify":
            has_identify = _is_truthy(kw.value)

    return [ExtractedCall(
        kind="all",
        method_name=method_name,
        sql=sql,
        read=read,
        write=write,
        has_pretty=has_pretty,
        has_identify=has_identify,
        has_unsupported_error=has_unsupported,
    )]


def _is_truthy(node: ast.AST) -> bool:
    if isinstance(node, ast.Constant):
        return bool(node.value)
    return True  # assume True for non-constant


def _resolve_iterable(node: ast.AST) -> list[str] | None:
    """Resolve a simple iterable (tuple/list of strings) to a list of string values."""
    if isinstance(node, (ast.Tuple, ast.List)):
        values = []
        for elt in node.elts:
            if isinstance(elt, ast.Constant) and isinstance(elt.value, str):
                values.append(elt.value)
            elif isinstance(elt, ast.Starred):
                inner = _resolve_iterable(elt.value)
                if inner is not None:
                    values.extend(inner)
                else:
                    return None
            else:
                return None
        return values
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "range":
        # range(start, stop) for numeric iteration
        args = node.args
        if len(args) == 2:
            start = args[0]
            stop = args[1]
            if isinstance(start, ast.Constant) and isinstance(stop, ast.Constant):
                return [str(i) for i in range(start.value, stop.value)]
        if len(args) == 1:
            stop = args[0]
            if isinstance(stop, ast.Constant):
                return [str(i) for i in range(stop.value)]
    return None


def extract_from_file(filepath: Path) -> tuple[str, list[ExtractedCall]]:
    """Parse a Python test file and extract all test calls.
    Returns (dialect_name, calls)."""
    source = filepath.read_text()
    tree = ast.parse(source, filename=str(filepath))

    dialect = None
    calls: list[ExtractedCall] = []

    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            # Find dialect = "xxx" class attribute
            for item in node.body:
                if isinstance(item, ast.Assign):
                    for target in item.targets:
                        if isinstance(target, ast.Name) and target.id == "dialect":
                            if isinstance(item.value, ast.Constant):
                                dialect = item.value.value

            # Extract test methods
            for item in node.body:
                if isinstance(item, ast.FunctionDef) and item.name.startswith("test_"):
                    method_name = item.name
                    for stmt in item.body:
                        calls.extend(extract_calls_from_stmt(stmt, method_name))

    return dialect or filepath.stem.replace("test_", ""), calls


# ---------------------------------------------------------------------------
# Phase 2: Classify
# ---------------------------------------------------------------------------


def should_be_todo(call: ExtractedCall) -> str | None:
    """Return a reason string if this call should be it.todo(), or None for it()."""
    if call.kind == "skip":
        return call.skip_reason or "unsupported call type"

    if call.has_assert_is:
        return "assert_is check"

    if call.has_pretty:
        return "pretty=True not supported"

    if call.has_identify:
        return "identify=True not supported"

    if call.has_check_command_warning:
        return "check_command_warning"

    if call.has_unsupported_error:
        return "UnsupportedError in write"

    sql = call.sql
    if not sql:
        return "empty SQL"

    if DDL_DML_KEYWORDS.match(sql):
        return "DDL/DML not supported"

    if COMMAND_KEYWORDS.match(sql):
        return "command not supported"

    if UNSUPPORTED_CLAUSES.search(sql):
        return "unsupported clause"

    if UNSUPPORTED_SYNTAX.search(sql):
        return "unsupported syntax"

    # For validate_all, also check read/write SQL for DDL/DML
    if call.kind == "all":
        for dialect, dsql in {**call.read, **call.write}.items():
            if dsql == "__UNSUPPORTED__":
                continue
            if DDL_DML_KEYWORDS.match(dsql):
                return "DDL/DML in read/write"

    return None


# ---------------------------------------------------------------------------
# Phase 3: Emit
# ---------------------------------------------------------------------------


def escape_ts_string(s: str, use_double: bool = True) -> str:
    """Escape a string for TypeScript. Returns the string WITH surrounding quotes."""
    # First escape backslashes, then control characters
    s = s.replace("\\", "\\\\")
    s = s.replace("\n", "\\n")
    s = s.replace("\r", "\\r")
    s = s.replace("\t", "\\t")
    s = s.replace("\0", "\\0")

    if use_double:
        if '"' in s and "'" not in s:
            return "'" + s.replace("'", "\\'") + "'"
        if '"' in s and "'" in s:
            escaped = s.replace("`", "\\`").replace("${", "\\${")
            return "`" + escaped + "`"
        return '"' + s.replace('"', '\\"') + '"'
    return "'" + s.replace("'", "\\'") + "'"


def truncate_desc(s: str, maxlen: int = 80) -> str:
    """Truncate a string for use in test descriptions."""
    if len(s) <= maxlen:
        return s
    return s[:maxlen - 3] + "..."


def emit_file(dialect: str, calls: list[ExtractedCall]) -> str:
    """Generate the full TypeScript test file content."""
    lines: list[str] = []

    # Header
    lines.append("// @generated by codegen_tests.py -- DO NOT EDIT")
    lines.append('import { describe, it, expect } from "vitest";')
    lines.append('import { transpile } from "../../src/index.js";')
    lines.append("")
    lines.append(f'const DIALECT = {escape_ts_string(dialect)};')
    lines.append("")

    # Helper functions
    lines.append("function validateIdentity(sql: string, writeSql?: string): void {")
    lines.append("  const result = transpile(sql, { readDialect: DIALECT, writeDialect: DIALECT })[0];")
    lines.append("  expect(result).toBe(writeSql ?? sql);")
    lines.append("}")
    lines.append("")

    # Group calls by method_name
    groups: dict[str, list[ExtractedCall]] = {}
    for call in calls:
        groups.setdefault(call.method_name, []).append(call)

    # Emit each group as a describe block
    dialect_label = dialect.replace("_", " ").title().replace(" ", "")
    for method_name, method_calls in groups.items():
        label = method_name.replace("test_", "")
        desc = f"{dialect_label}: {label}"
        lines.append(f"describe({escape_ts_string(desc)}, () => {{")

        # Track test names for dedup
        name_counts: dict[str, int] = {}

        for call in method_calls:
            todo_reason = should_be_todo(call)

            if todo_reason:
                # Emit it.todo()
                if call.sql:
                    desc_text = truncate_desc(call.sql, 70)
                    todo_desc = f"{desc_text} ({todo_reason})"
                else:
                    todo_desc = f"{call.method_name}: {todo_reason}"

                todo_desc = _dedup_name(todo_desc, name_counts)
                lines.append(f"  it.todo({escape_ts_string(todo_desc)});")
            elif call.kind == "identity":
                _emit_identity_test(lines, call, name_counts)
            elif call.kind == "all":
                _emit_all_tests(lines, call, name_counts, dialect)

        lines.append("});")
        lines.append("")

    return "\n".join(lines)


def _dedup_name(name: str, counts: dict[str, int]) -> str:
    """Append (2), (3), etc. for duplicate names."""
    counts[name] = counts.get(name, 0) + 1
    if counts[name] > 1:
        return f"{name} ({counts[name]})"
    return name


def _emit_identity_test(lines: list[str], call: ExtractedCall, counts: dict[str, int]) -> None:
    """Emit an it() block for a validate_identity call."""
    if call.write_sql:
        desc = truncate_desc(f"{call.sql} -> {call.write_sql}", 90)
    else:
        desc = truncate_desc(call.sql, 90)

    desc = _dedup_name(desc, counts)
    sql_str = escape_ts_string(call.sql)

    lines.append(f"  it({escape_ts_string(desc)}, () => {{")
    if call.write_sql:
        lines.append(f"    validateIdentity({sql_str}, {escape_ts_string(call.write_sql)});")
    else:
        lines.append(f"    validateIdentity({sql_str});")
    lines.append("  });")


def _emit_all_tests(
    lines: list[str],
    call: ExtractedCall,
    counts: dict[str, int],
    dialect: str,
) -> None:
    """Emit individual it() blocks for each read/write entry in a validate_all call."""
    emitted_any = False

    # Read entries: other dialect -> this dialect
    for read_dialect, read_sql in call.read.items():
        if read_sql == "__UNSUPPORTED__":
            continue

        desc = truncate_desc(f"{read_dialect} -> {dialect}: {read_sql}", 90)
        desc = _dedup_name(desc, counts)
        todo = None

        # Check if the read SQL itself is unsupported
        if DDL_DML_KEYWORDS.match(read_sql):
            todo = "DDL/DML not supported"
        elif COMMAND_KEYWORDS.match(read_sql):
            todo = "command not supported"
        elif UNSUPPORTED_CLAUSES.search(read_sql):
            todo = "unsupported clause"
        elif UNSUPPORTED_SYNTAX.search(read_sql):
            todo = "unsupported syntax"
        elif read_dialect != dialect and UNSUPPORTED_CROSS_DIALECT.search(read_sql):
            todo = "cross-dialect transform"

        if todo:
            lines.append(f"  it.todo({escape_ts_string(f'{desc} ({todo})')});")
        else:
            lines.append(f"  it({escape_ts_string(desc)}, () => {{")
            lines.append(f"    const result = transpile({escape_ts_string(read_sql)}, {{ readDialect: {escape_ts_string(read_dialect)}, writeDialect: DIALECT }})[0];")
            lines.append(f"    expect(result).toBe({escape_ts_string(call.sql)});")
            lines.append("  });")
        emitted_any = True

    # Write entries: this dialect -> other dialect
    for write_dialect, write_sql in call.write.items():
        if write_sql == "__UNSUPPORTED__":
            desc = truncate_desc(f"{dialect} -> {write_dialect}: {call.sql}", 90)
            desc = _dedup_name(desc, counts)
            lines.append(f"  it.todo({escape_ts_string(f'{desc} (UnsupportedError)')});")
            emitted_any = True
            continue

        desc = truncate_desc(f"{dialect} -> {write_dialect}: {call.sql}", 90)
        desc = _dedup_name(desc, counts)
        todo = None

        if DDL_DML_KEYWORDS.match(write_sql):
            todo = "DDL/DML not supported"
        elif COMMAND_KEYWORDS.match(write_sql):
            todo = "command not supported"
        elif UNSUPPORTED_CLAUSES.search(write_sql):
            todo = "unsupported clause"
        elif UNSUPPORTED_SYNTAX.search(write_sql):
            todo = "unsupported syntax"
        elif write_dialect != dialect and (UNSUPPORTED_CROSS_DIALECT.search(call.sql) or UNSUPPORTED_CROSS_DIALECT.search(write_sql)):
            todo = "cross-dialect transform"

        if todo:
            lines.append(f"  it.todo({escape_ts_string(f'{desc} ({todo})')});")
        else:
            lines.append(f"  it({escape_ts_string(desc)}, () => {{")
            lines.append(f"    const result = transpile({escape_ts_string(call.sql)}, {{ readDialect: DIALECT, writeDialect: {escape_ts_string(write_dialect)} }})[0];")
            lines.append(f"    expect(result).toBe({escape_ts_string(write_sql)});")
            lines.append("  });")
        emitted_any = True

    # If no read/write entries, emit the identity part
    if not emitted_any:
        desc = truncate_desc(call.sql, 90)
        desc = _dedup_name(desc, counts)
        lines.append(f"  it({escape_ts_string(desc)}, () => {{")
        lines.append(f"    validateIdentity({escape_ts_string(call.sql)});")
        lines.append("  });")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def get_dialect_files() -> list[tuple[str, Path]]:
    """Get list of (dialect_name, filepath) for all Python dialect test files."""
    files = []
    for f in sorted(PY_TESTS_DIR.glob("test_*.py")):
        if f.name in SKIP_FILES:
            continue
        # Map Python filename to dialect
        dialect = f.stem.replace("test_", "")
        files.append((dialect, f))
    return files


def get_ts_filename(dialect: str) -> str:
    """Get the TS test filename for a dialect."""
    return f"test_{dialect}.test.ts"


def main():
    parser = argparse.ArgumentParser(description="Generate TypeScript test files from Python sqlglot tests")
    parser.add_argument("--dialect", help="Generate only for this dialect")
    parser.add_argument("--dry-run", action="store_true", help="Print to stdout instead of writing files")
    parser.add_argument("--stats", action="store_true", help="Print statistics only")
    args = parser.parse_args()

    dialect_files = get_dialect_files()
    if args.dialect:
        dialect_files = [(d, f) for d, f in dialect_files if d == args.dialect]
        if not dialect_files:
            print(f"Error: dialect '{args.dialect}' not found", file=sys.stderr)
            sys.exit(1)

    total_active = 0
    total_todo = 0

    for dialect, filepath in dialect_files:
        ts_filename = get_ts_filename(dialect)
        if ts_filename in PROTECTED_FILES:
            if not args.stats:
                print(f"  SKIP {ts_filename} (protected)")
            continue

        dialect_name, calls = extract_from_file(filepath)

        if args.stats:
            active = sum(1 for c in calls if should_be_todo(c) is None and c.kind != "skip")
            todo = sum(1 for c in calls if should_be_todo(c) is not None)
            # Count individual read/write entries for validate_all
            expanded_active = 0
            expanded_todo = 0
            for c in calls:
                todo_reason = should_be_todo(c)
                if c.kind == "all" and todo_reason is None:
                    n = len(c.read) + len(c.write)
                    if n == 0:
                        n = 1
                    expanded_active += n
                elif c.kind == "identity" and todo_reason is None:
                    expanded_active += 1
                elif todo_reason is not None:
                    if c.kind == "all":
                        n = len(c.read) + len(c.write)
                        expanded_todo += max(n, 1)
                    else:
                        expanded_todo += 1

            total_active += expanded_active
            total_todo += expanded_todo
            print(f"  {dialect:20s}  methods={len(set(c.method_name for c in calls)):3d}  "
                  f"calls={len(calls):4d}  active={expanded_active:4d}  todo={expanded_todo:4d}")
            continue

        content = emit_file(dialect_name, calls)
        ts_path = TS_TESTS_DIR / ts_filename

        if args.dry_run:
            print(f"=== {ts_filename} ===")
            print(content)
            print()
        else:
            ts_path.write_text(content)
            # Count stats
            active = content.count("\n  it(")
            todo = content.count("\n  it.todo(")
            total_active += active
            total_todo += todo
            print(f"  WRITE {ts_filename:40s}  active={active:4d}  todo={todo:4d}")

    if args.stats or not args.dry_run:
        print(f"\nTotal: active={total_active}  todo={total_todo}  combined={total_active + total_todo}")


if __name__ == "__main__":
    main()
