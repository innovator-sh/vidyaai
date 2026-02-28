"""Test script to verify UserManager functionality."""

import sys
import os

# Add project root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'vidyaai_rag'))

from db.user_manager import UserManager

def test_user_manager():
    """Test UserManager basic functionality."""
    print("Testing UserManager...")
    
    # Create UserManager instance
    user_manager = UserManager()
    print("✓ UserManager initialized")
    
    # Test creating a new user mapping
    test_firebase_uid = "test_firebase_uid_123"
    student_id = user_manager.get_or_create_student_id(test_firebase_uid)
    print(f"✓ Created mapping: {test_firebase_uid} -> {student_id}")
    
    # Test retrieving existing mapping
    retrieved_student_id = user_manager.get_student_id(test_firebase_uid)
    assert retrieved_student_id == student_id, "Student ID mismatch!"
    print(f"✓ Retrieved mapping: {test_firebase_uid} -> {retrieved_student_id}")
    
    # Test idempotency (calling again should return same student_id)
    student_id_2 = user_manager.get_or_create_student_id(test_firebase_uid)
    assert student_id_2 == student_id, "Student ID should be the same!"
    print(f"✓ Idempotency check passed: {student_id_2} == {student_id}")
    
    # Test reverse lookup
    firebase_uid = user_manager.get_firebase_uid(student_id)
    assert firebase_uid == test_firebase_uid, "Firebase UID mismatch!"
    print(f"✓ Reverse lookup: {student_id} -> {firebase_uid}")
    
    # Test user exists
    exists = user_manager.user_exists(test_firebase_uid)
    assert exists, "User should exist!"
    print(f"✓ User exists check passed")
    
    print("\n✅ All tests passed!")
    print(f"Database location: {user_manager.db_path}")

if __name__ == "__main__":
    test_user_manager()