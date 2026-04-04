"""Unit tests for diff_apply.apply_search_replace."""
from __future__ import annotations

import pytest
from src.diff_apply import apply_search_replace

# ── Helpers ──────────────────────────────────────────────────────────────────

def make_block(search: str, replace: str) -> str:
    return f"<<<<<<< SEARCH\n{search}\n=======\n{replace}\n>>>>>>> REPLACE"


# ── Tests ─────────────────────────────────────────────────────────────────────

def test_single_block_applied():
    original = '<button>Submit</button>'
    llm_output = make_block('<button>Submit</button>', '<button class="primary">Submit</button>')
    result, ok = apply_search_replace(original, llm_output)
    assert ok is True
    assert result == '<button class="primary">Submit</button>'


def test_multiple_blocks_applied_in_sequence():
    original = "line one\nline two\nline three"
    llm_output = (
        make_block("line one", "LINE ONE")
        + "\n"
        + make_block("line three", "LINE THREE")
    )
    result, ok = apply_search_replace(original, llm_output)
    assert ok is True
    assert result == "LINE ONE\nline two\nLINE THREE"


def test_search_not_found_returns_original_false():
    original = "const x = 1"
    llm_output = make_block("const y = 99", "const y = 100")
    result, ok = apply_search_replace(original, llm_output)
    assert ok is False
    assert result == original


def test_no_blocks_returns_original_false():
    original = "some code"
    llm_output = "Here is the updated code: some code"  # no markers
    result, ok = apply_search_replace(original, llm_output)
    assert ok is False
    assert result == original


def test_malformed_block_missing_equals_ignored():
    # Missing ======= separator — regex won't match, treated as no blocks
    original = "const x = 1"
    llm_output = "<<<<<<< SEARCH\nconst x = 1\n>>>>>>> REPLACE"
    result, ok = apply_search_replace(original, llm_output)
    assert ok is False
    assert result == original


def test_whitespace_normalised_matching():
    # Model omits leading indentation in SEARCH block
    original = "    const x = 1\n    const y = 2\n"
    # Search text has no leading indent
    llm_output = make_block("const x = 1", "const x = 42")
    result, ok = apply_search_replace(original, llm_output)
    assert ok is True
    assert "const x = 42" in result
    assert "const y = 2" in result


def test_multiline_block_exact():
    original = "function foo() {\n  return 1;\n}\n"
    llm_output = make_block("function foo() {\n  return 1;\n}", "function foo() {\n  return 99;\n}")
    result, ok = apply_search_replace(original, llm_output)
    assert ok is True
    assert "return 99;" in result


def test_second_block_fails_rolls_back_entirely():
    original = "line one\nline two\nline three"
    llm_output = (
        make_block("line one", "LINE ONE")
        + "\n"
        + make_block("line NONEXISTENT", "whatever")
    )
    result, ok = apply_search_replace(original, llm_output)
    assert ok is False
    assert result == original  # original restored, not partially applied


def test_trailing_newline_preserved():
    original = "const x = 1\n"
    llm_output = make_block("const x = 1", "const x = 2")
    result, ok = apply_search_replace(original, llm_output)
    assert ok is True
    assert result.endswith("\n")


def test_full_file_output_returns_false():
    # If the model ignores the surgical prompt and returns a full file,
    # there are no marker blocks so we fall back
    original = "export default function App() { return <div>hi</div> }"
    llm_output = "export default function App() { return <div>hello</div> }"
    result, ok = apply_search_replace(original, llm_output)
    assert ok is False
    assert result == original
