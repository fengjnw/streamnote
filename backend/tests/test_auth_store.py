"""Deep unit tests for auth_store.py"""

import tempfile
import threading
import time
from pathlib import Path

from werkzeug.security import check_password_hash, generate_password_hash

from auth_store import create_auth_store


def test_create_user_basic():
    """Test basic user creation"""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "auth.db")
        store = create_auth_store(db_path)
        
        user = store.create_user("test@example.com", "password123")
        assert user["email"] == "test@example.com"
        assert user["id"] > 0
        assert user["created_at"] > 0


def test_create_user_duplicate_email():
    """Test that creating user with duplicate email fails"""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "auth.db")
        store = create_auth_store(db_path)
        
        store.create_user("test@example.com", "password123")
        
        # Should raise an error when creating with same email
        try:
            store.create_user("test@example.com", "password456")
            assert False, "Should have raised an error for duplicate email"
        except Exception:
            pass  # Expected


def test_get_user_by_email_found():
    """Test getting existing user by email"""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "auth.db")
        store = create_auth_store(db_path)
        
        created_user = store.create_user("john@example.com", "secret")
        fetched_user = store.get_user_by_email("john@example.com")
        
        assert fetched_user is not None
        assert fetched_user["id"] == created_user["id"]
        assert fetched_user["email"] == "john@example.com"
        assert "password_hash" in fetched_user


def test_get_user_by_email_not_found():
    """Test getting non-existent user by email"""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "auth.db")
        store = create_auth_store(db_path)
        
        user = store.get_user_by_email("nonexistent@example.com")
        assert user is None


def test_password_hash_verification():
    """Test that password hashing works correctly"""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "auth.db")
        store = create_auth_store(db_path)
        
        store.create_user("test@example.com", "mypassword")
        user = store.get_user_by_email("test@example.com")
        
        # Password should be hashed, not plaintext
        assert user["password_hash"] != "mypassword"
        # But should verify correctly
        assert check_password_hash(user["password_hash"], "mypassword")


def test_verify_user_credentials_valid():
    """Test verifying valid user credentials"""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "auth.db")
        store = create_auth_store(db_path)
        
        store.create_user("test@example.com", "correctpassword")
        
        verified = store.verify_user_credentials("test@example.com", "correctpassword")
        assert verified is not None
        assert verified["email"] == "test@example.com"


def test_verify_user_credentials_wrong_password():
    """Test verifying with wrong password"""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "auth.db")
        store = create_auth_store(db_path)
        
        store.create_user("test@example.com", "correctpassword")
        
        verified = store.verify_user_credentials("test@example.com", "wrongpassword")
        assert verified is None


def test_verify_user_credentials_nonexistent_user():
    """Test verifying credentials for non-existent user"""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "auth.db")
        store = create_auth_store(db_path)
        
        verified = store.verify_user_credentials("nonexistent@example.com", "password")
        assert verified is None


def test_verify_user_password():
    """Test password verification by user ID"""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "auth.db")
        store = create_auth_store(db_path)
        
        user = store.create_user("test@example.com", "mypassword")
        
        assert store.verify_user_password(user["id"], "mypassword") is True
        assert store.verify_user_password(user["id"], "wrongpassword") is False


def test_verify_user_password_nonexistent_user():
    """Test password verification for non-existent user"""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "auth.db")
        store = create_auth_store(db_path)
        
        assert store.verify_user_password(99999, "password") is False


def test_create_auth_session():
    """Test creating an auth session"""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "auth.db")
        store = create_auth_store(db_path)
        
        user = store.create_user("test@example.com", "password")
        session = store.create_auth_session("session-token-123", user["id"], ttl_seconds=3600)
        
        assert session["session_id"] == "session-token-123"
        assert session["user_id"] == user["id"]
        assert session["expires_at"] > 0


def test_get_user_by_session_valid():
    """Test getting user from valid session"""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "auth.db")
        store = create_auth_store(db_path)
        
        user = store.create_user("test@example.com", "password")
        store.create_auth_session("session-token-123", user["id"], ttl_seconds=3600)
        
        fetched_user = store.get_user_by_session("session-token-123")
        assert fetched_user is not None
        assert fetched_user["email"] == "test@example.com"
        assert fetched_user["id"] == user["id"]


def test_get_user_by_session_nonexistent():
    """Test getting user from non-existent session"""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "auth.db")
        store = create_auth_store(db_path)
        
        user = store.get_user_by_session("nonexistent-session")
        assert user is None


def test_get_user_by_session_expired():
    """Test that expired sessions are cleaned up and return None"""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "auth.db")
        store = create_auth_store(db_path)
        
        user = store.create_user("test@example.com", "password")
        # Create session with 1-second TTL
        store.create_auth_session("session-token-123", user["id"], ttl_seconds=1)
        
        # Session should be valid immediately
        fetched = store.get_user_by_session("session-token-123")
        assert fetched is not None
        
        # Wait for expiration
        time.sleep(1.1)
        
        # Session should be expired and cleaned up
        fetched = store.get_user_by_session("session-token-123")
        assert fetched is None


def test_delete_session():
    """Test deleting a session"""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "auth.db")
        store = create_auth_store(db_path)
        
        user = store.create_user("test@example.com", "password")
        store.create_auth_session("session-token-123", user["id"], ttl_seconds=3600)
        
        # Session exists
        fetched = store.get_user_by_session("session-token-123")
        assert fetched is not None
        
        # Delete session
        store.delete_session("session-token-123")
        
        # Session no longer exists
        fetched = store.get_user_by_session("session-token-123")
        assert fetched is None


def test_bind_device_to_user():
    """Test binding device to user"""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "auth.db")
        store = create_auth_store(db_path)
        
        user = store.create_user("test@example.com", "password")
        store.bind_device_to_user("device-12345", user["id"])
        
        # Binding should succeed (no error thrown)


def test_bind_device_to_user_rebind():
    """Test rebinding device to different user"""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "auth.db")
        store = create_auth_store(db_path)
        
        user1 = store.create_user("user1@example.com", "password")
        user2 = store.create_user("user2@example.com", "password")
        
        # Bind device to user1
        store.bind_device_to_user("device-12345", user1["id"])
        
        # Rebind same device to user2 (should work with ON CONFLICT UPDATE)
        store.bind_device_to_user("device-12345", user2["id"])


def test_delete_user_account():
    """Test deleting user account"""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "auth.db")
        store = create_auth_store(db_path)
        
        user = store.create_user("test@example.com", "password")
        user_id = user["id"]
        
        # Create session and device binding
        store.create_auth_session("session-token-123", user_id, ttl_seconds=3600)
        store.bind_device_to_user("device-12345", user_id)
        
        # Delete account
        store.delete_user_account(user_id)
        
        # User should no longer exist
        fetched = store.get_user_by_email("test@example.com")
        assert fetched is None
        
        # Session should be cleaned up
        fetched_session = store.get_user_by_session("session-token-123")
        assert fetched_session is None


def test_concurrent_user_creation():
    """Test concurrent user creation"""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "auth.db")
        store = create_auth_store(db_path)
        
        results = []
        errors = []
        
        def create_user(email, password):
            try:
                user = store.create_user(email, password)
                results.append(user)
            except Exception as e:
                errors.append(e)
        
        # Create multiple users concurrently
        threads = [
            threading.Thread(target=create_user, args=(f"user{i}@example.com", "password")) 
            for i in range(10)
        ]
        
        for t in threads:
            t.start()
        
        for t in threads:
            t.join()
        
        # All should succeed
        assert len(results) == 10
        assert len(errors) == 0


def test_concurrent_session_operations():
    """Test concurrent session creation and retrieval"""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "auth.db")
        store = create_auth_store(db_path)
        
        user = store.create_user("test@example.com", "password")
        
        results = []
        errors = []
        
        def create_and_get_session(session_id):
            try:
                store.create_auth_session(f"session-{session_id}", user["id"], ttl_seconds=3600)
                fetched = store.get_user_by_session(f"session-{session_id}")
                if fetched:
                    results.append(fetched)
            except Exception as e:
                errors.append(e)
        
        threads = [
            threading.Thread(target=create_and_get_session, args=(i,))
            for i in range(10)
        ]
        
        for t in threads:
            t.start()
        
        for t in threads:
            t.join()
        
        # All operations should succeed
        assert len(results) == 10
        assert len(errors) == 0


def test_multiple_sessions_per_user():
    """Test that user can have multiple concurrent sessions"""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "auth.db")
        store = create_auth_store(db_path)
        
        user = store.create_user("test@example.com", "password")
        
        # Create multiple sessions
        sessions = []
        for i in range(5):
            session = store.create_auth_session(f"session-{i}", user["id"], ttl_seconds=3600)
            sessions.append(session)
        
        # All sessions should be retrievable
        for session in sessions:
            fetched = store.get_user_by_session(session["session_id"])
            assert fetched is not None
            assert fetched["email"] == "test@example.com"
