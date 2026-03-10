# test to check if client fixture works
def test_integration_fixture(client):
    response = client.get("/")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
