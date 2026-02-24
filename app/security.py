from dotenv import load_dotenv
import os
from argon2 import PasswordHasher, exceptions as ArgonExceptions

load_dotenv()
HASHING_PEPPER = os.getenv("HASHING_PEPPER", "")

if HASHING_PEPPER == "":
    raise ValueError(
        "Please supply a hashing pepper using the env var 'HASHING_PEPPER'"
    )

ph = PasswordHasher()


def make_hash(password: str) -> str:
    return ph.hash(password + HASHING_PEPPER)


def verify_hash(stored_hash: str, password: str) -> bool:
    try:
        is_valid = ph.verify(stored_hash, password + HASHING_PEPPER)
        if is_valid and ph.check_needs_rehash(stored_hash):
            pass  # TODO store new hash
    except ArgonExceptions.VerifyMismatchError:
        return False
    return is_valid
