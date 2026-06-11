_MAGIC = "CARSCANNERRECORD"


def _read_lp(data: bytes, i: int) -> tuple[str, int]:
    """Read a u8-length-prefixed latin-1 string; returns (text, next_index)."""
    n = data[i]
    i += 1
    return data[i:i + n].decode("latin-1"), i + n


def parse_brc_header(content: bytes) -> dict | None:
    """Parse the Car Scanner .brc header for vehicle identity. Returns
    {vin, label, engine} or None if it isn't a .brc. Only the header is read —
    the proprietary binary records are intentionally ignored."""
    try:
        i = 0
        magic, i = _read_lp(content, i)
        if magic != _MAGIC:
            return None
        i += 4  # u32 version (little-endian) — skip
        vin, i = _read_lp(content, i)
        label, i = _read_lp(content, i)
        engine, i = _read_lp(content, i)
        return {"vin": vin, "label": label, "engine": engine}
    except (IndexError, UnicodeDecodeError):
        return None
