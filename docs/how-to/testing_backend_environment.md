# Backend Testing Environment Guide

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Running tests](#running-tests)
- [Project Structure](#project-structure)
- [Writing tests](#writing-tests)
- [Coverage](#coverage)
- [CI/CD](#cicd)

## Overview

This backend testing environment provides a simple way to create and use in memory databases for unit and integration tests. This exists so that testing is not done on the development databases.

## Prerequisites

The following packages are needed to run this test environment:

- pytest
- pytest-cov
- pytest-order
- pytest-xdist

All these packages are included in the requirements.txt file

## Running tests

To run the test environment on all tests, run:

'''bash
pytest
'''

To run only unit tests or integration tests, run:

'''bash
pytest app/tests/unit/
'''

or

'''bash
pytest app/tests/integration/
'''

## Project Structure

In the app/tests/ directory there are 2 separate directories, one for the unit tests, called unit/ and one for the integration tests, called integration/

The unit and integration tests written should go into their appropriate directory

## Writing tests

### The Fixtures

To write tests that use the in memory databases, 2 pytest fixtures will be used.

There first fixture:

'''python
db_test_session
'''

is for the unit tests to use. This fixture yields an in memory test database for the unit test to use, instead of the development database.

The second fixture:

'''python
client
'''

is for the integration tests to use, this fixture yields a TestClient(app) using an override of the get_db function to get a in memory database.

### How to Use the Fixtures

The fixtures are used by injecting them into a test function, the db_test_session fixture can then be used exactly like a non test db would be used, the same for the client fixture, but in this case as a non test client would be used.

#### Examples

'''python

def test_test_session(db_test_session):

    test_user = models.User(
        email="test@test.com",
        password_hash="testhash",
        first_name="John",
        last_name="Doe",
    )

    db_test_session.add(test_user)
    db_test_session.commit()
    db_test_session.refresh(test_user)

    query_user = (
        db_test_session.query(models.User)
        .filter(models.User.id == test_user.id)
        .first()
    )

    assert query_user == test_user

'''

'''python

def test_integration_fixture(client):

    response = client.get("/")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]

'''

### Cleanup

The fixtures clean up the database automatically

## Coverage

The pytest.ini has --cov-fail-under=80, meaning tests fail if less than 80% of the code is executed during testing. The --cov-report=term-missing flag prints a table in the terminal showing each file, its coverage percentage, and the specific line numbers that aren't covered by any test.

## CI/CD

The environment outputs a test.xml file, this can later be parsed by a other CI tools.

---

**Related:** [Testing Guide](./testing.md) | [Unit Testing Guide](./unit-test.md) | [Integration Testing Guide](./integration-test.md) | [CI Pipeline](./CI-pipeline.md)

[← Back to documentation index](../index.md)
