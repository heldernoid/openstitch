"""Surgical search/replace patch applicator for LLM edit-mode outputs."""
from __future__ import annotations

import re

# Matches <<<<<<< SEARCH\n...\n=======\n...\n>>>>>>> REPLACE
_BLOCK_RE = re.compile(
    r"<{7} SEARCH\r?\n(.*?)\r?\n={7}\r?\n(.*?)\r?\n>{7} REPLACE",
    re.DOTALL,
)


def apply_search_replace(original: str, llm_output: str) -> tuple[str, bool]:
    """
    Parse all <<<<<<< SEARCH / ======= / >>>>>>> REPLACE blocks from *llm_output*
    and apply them in sequence to *original*.

    Returns ``(result_code, True)`` when every block is applied successfully.
    Returns ``(original, False)`` if no blocks are found or any SEARCH text
    cannot be located in the current code.
    """
    blocks = _BLOCK_RE.findall(llm_output)
    if not blocks:
        return original, False

    code = original
    for search_text, replace_text in blocks:
        patched = _apply_block(code, search_text, replace_text)
        if patched is None:
            return original, False
        code = patched

    return code, True


def _apply_block(code: str, search: str, replace: str) -> str | None:
    """Apply a single SEARCH→REPLACE pair. Returns None if search text not found."""
    # 1. Exact substring match (fastest, preferred)
    if search in code:
        return code.replace(search, replace, 1)

    # 2. Whitespace-normalised line match (handles indentation drift)
    code_lines = code.splitlines()
    search_lines = search.splitlines()
    if not search_lines:
        return None

    start = _find_normalized_start(code_lines, search_lines)
    if start is None:
        return None

    end = start + len(search_lines)
    new_lines = code_lines[:start] + replace.splitlines() + code_lines[end:]
    result = "\n".join(new_lines)
    # Preserve trailing newline of the original
    if code.endswith("\n") and not result.endswith("\n"):
        result += "\n"
    return result


def _find_normalized_start(code_lines: list[str], search_lines: list[str]) -> int | None:
    """Return the first line index where *search_lines* match *code_lines* after stripping."""
    norm_code = [line.strip() for line in code_lines]
    norm_search = [line.strip() for line in search_lines]
    n = len(norm_search)
    for i in range(len(norm_code) - n + 1):
        if norm_code[i : i + n] == norm_search:
            return i
    return None
