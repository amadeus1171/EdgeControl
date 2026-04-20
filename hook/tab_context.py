#!/usr/bin/env python3
import json
import sys
from pathlib import Path
from urllib.request import urlopen
from urllib.error import URLError

EDGE_CDP_URL = "http://127.0.0.1:9222/json"
STATE_FILE = Path(__file__).parent.parent / "state.json"


def get_tabs() -> list | None:
    try:
        with urlopen(EDGE_CDP_URL, timeout=1) as resp:
            data = json.loads(resp.read())
        return [t for t in data if t.get("type") == "page"]
    except (URLError, OSError, json.JSONDecodeError):
        return None


def get_active_tab() -> dict | None:
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def format_output(active: dict | None, tabs: list) -> str:
    if not tabs:
        return ""
    lines = ["[EDGE BROWSER]"]
    if active:
        lines.append(f'Active tab: "{active["title"]}" ({active["url"]})')
    titles = " · ".join(f'"{t["title"]}"' for t in tabs)
    lines.append(f"All tabs ({len(tabs)}): {titles}")
    lines.append("[/EDGE BROWSER]")
    return "\n".join(lines)


def main() -> None:
    try:
        tabs = get_tabs()
        if not tabs:
            sys.exit(0)
        active = get_active_tab()
        output = format_output(active, tabs)
        if output:
            print(output)
    except Exception:
        pass
    sys.exit(0)


if __name__ == "__main__":
    main()
