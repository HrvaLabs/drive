from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_relay_forwards_between_two_peers_both_ways():
    with client.websocket_connect("/sync/TESTCODE") as a, \
         client.websocket_connect("/sync/TESTCODE") as b:
        a.send_text("offer-from-a")
        assert b.receive_text() == "offer-from-a"
        b.send_text("answer-from-b")
        assert a.receive_text() == "answer-from-b"


def test_third_peer_is_rejected():
    with client.websocket_connect("/sync/FULLROOM") as _a, \
         client.websocket_connect("/sync/FULLROOM") as _b:
        with client.websocket_connect("/sync/FULLROOM") as c:
            # the relay closes the third socket immediately
            try:
                c.receive_text()
                raised = False
            except Exception:
                raised = True
            assert raised


def test_room_is_reusable_after_both_disconnect():
    with client.websocket_connect("/sync/AGAIN") as a:
        a.send_text("noop")
    with client.websocket_connect("/sync/AGAIN") as a2, \
         client.websocket_connect("/sync/AGAIN") as b2:
        a2.send_text("hello")
        assert b2.receive_text() == "hello"
