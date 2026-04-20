import json
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock
from urllib.error import URLError

sys.path.insert(0, str(Path(__file__).parent.parent))
from hook.tab_context import get_tabs, get_active_tab, format_output


def _mock_urlopen(data):
    m = MagicMock()
    m.__enter__ = lambda s: s
    m.__exit__ = MagicMock(return_value=False)
    m.read.return_value = json.dumps(data).encode()
    return m


def test_get_tabs_returns_only_page_type():
    targets = [
        {"type": "page", "title": "Google", "url": "https://google.com", "id": "1"},
        {"type": "worker", "title": "Worker", "url": "ws://x", "id": "2"},
        {"type": "page", "title": "GitHub", "url": "https://github.com", "id": "3"},
    ]
    with patch("hook.tab_context.urlopen", return_value=_mock_urlopen(targets)):
        result = get_tabs()
    assert result is not None
    assert len(result) == 2
    assert all(t["type"] == "page" for t in result)


def test_get_tabs_returns_none_when_edge_not_running():
    with patch("hook.tab_context.urlopen", side_effect=URLError("connection refused")):
        result = get_tabs()
    assert result is None


def test_get_tabs_returns_none_on_malformed_json():
    m = MagicMock()
    m.__enter__ = lambda s: s
    m.__exit__ = MagicMock(return_value=False)
    m.read.return_value = b"not json"
    with patch("hook.tab_context.urlopen", return_value=m):
        result = get_tabs()
    assert result is None


def test_get_active_tab_reads_state_file(tmp_path):
    state = {"tabId": "1", "title": "Google", "url": "https://google.com", "updatedAt": "2026-01-01T00:00:00Z"}
    state_file = tmp_path / "state.json"
    state_file.write_text(json.dumps(state))
    with patch("hook.tab_context.STATE_FILE", state_file):
        result = get_active_tab()
    assert result is not None
    assert result["title"] == "Google"
    assert result["url"] == "https://google.com"


def test_get_active_tab_returns_none_when_file_missing(tmp_path):
    with patch("hook.tab_context.STATE_FILE", tmp_path / "state.json"):
        result = get_active_tab()
    assert result is None


def test_get_active_tab_returns_none_on_malformed_json(tmp_path):
    state_file = tmp_path / "state.json"
    state_file.write_text("not json")
    with patch("hook.tab_context.STATE_FILE", state_file):
        result = get_active_tab()
    assert result is None


def test_format_output_with_active_tab():
    active = {"title": "Admin", "url": "http://localhost:8001/admin"}
    tabs = [
        {"title": "Admin", "url": "http://localhost:8001/admin"},
        {"title": "GitHub", "url": "https://github.com"},
    ]
    output = format_output(active, tabs)
    assert output.startswith("[EDGE BROWSER]")
    assert output.endswith("[/EDGE BROWSER]")
    assert 'Active tab: "Admin" (http://localhost:8001/admin)' in output
    assert "All tabs (2):" in output
    assert '"Admin"' in output
    assert '"GitHub"' in output


def test_format_output_without_active_tab():
    tabs = [{"title": "Google", "url": "https://google.com"}]
    output = format_output(None, tabs)
    assert "Active tab:" not in output
    assert "All tabs (1):" in output


def test_format_output_empty_tabs_returns_empty_string():
    output = format_output(None, [])
    assert output == ""
