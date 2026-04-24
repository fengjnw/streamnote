import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from session_store import create_session_store


def _build_state(index: int):
    return {
        "sessions": {
            f"s-{index}": {
                "id": f"s-{index}",
                "name": f"Session {index}",
                "transcripts": {
                    "0": {
                        "text": f"hello {index}",
                        "timestamp": index,
                    }
                },
            }
        },
        "currentSessionId": f"s-{index}",
        "defaultSettings": {
            "defaultLanguage": "Chinese",
            "defaultExplanationLanguage": "Chinese",
        },
    }


def test_session_store_concurrent_writes_do_not_fail():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "sessions.db")
        store = create_session_store(db_path)

        device_id = "test-device-123"

        def write_once(index: int):
            state = _build_state(index)
            updated_at = store.save_state(device_id, state)
            assert isinstance(updated_at, int)

        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(write_once, range(40)))

        result = store.get_state(device_id)
        assert result is not None
        assert isinstance(result["updated_at"], int)

        state = result["state"]
        assert isinstance(state.get("sessions"), dict)
        assert isinstance(state.get("currentSessionId"), str)
        assert isinstance(state.get("defaultSettings"), dict)
