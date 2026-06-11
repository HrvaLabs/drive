from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect

from app import brc as brc_mod
from app.analysis import build_drive_analysis
from app.models import DriveAnalysis
from app.parsing import is_supported_layout, parse_drive

app = FastAPI(title="HrvaDrive Analysis")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# Device-sync pairing relay: forwards the WebRTC handshake between exactly two
# live sockets in a room. NOTHING is stored — the room map holds only open
# connections and disappears when they close. Payloads are never logged.
_sync_rooms: dict[str, list[WebSocket]] = {}


@app.websocket("/sync/{code}")
async def sync_relay(ws: WebSocket, code: str) -> None:
    await ws.accept()
    room = _sync_rooms.setdefault(code, [])
    if len(room) >= 2:
        await ws.close(code=4000, reason="room full")
        return
    room.append(ws)
    try:
        while True:
            msg = await ws.receive_text()
            for peer in list(room):
                if peer is not ws:
                    await peer.send_text(msg)
    except WebSocketDisconnect:
        pass
    finally:
        if ws in room:
            room.remove(ws)
        if not room:
            _sync_rooms.pop(code, None)


@app.post("/analyze", response_model=DriveAnalysis)
async def analyze(
    file: UploadFile = File(...),
    format: str = Form("vertical_layout"),
    pricePerL: float | None = Form(None),
    annualKm: int | None = Form(None),
    vin: str | None = Form(None),
    label: str | None = Form(None),
    engine: str | None = Form(None),
    brc: UploadFile | None = File(None),
) -> DriveAnalysis:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="empty file")
    if not is_supported_layout(content):
        raise HTTPException(status_code=400, detail="not a supported export (vertical or horizontal CSV)")
    df = parse_drive(content)
    if brc is not None:
        vehicle = brc_mod.parse_brc_header(await brc.read())
    elif vin or label or engine:
        vehicle = {"vin": vin, "label": label, "engine": engine}
    else:
        vehicle = None
    return build_drive_analysis(df, source=format, price_per_l=pricePerL, annual_km=annualKm, vehicle=vehicle)
