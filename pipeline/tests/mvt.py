import struct


def varint(buf: bytes, pos: int) -> tuple[int, int]:
    shift = result = 0
    while True:
        b = buf[pos]
        pos += 1
        result |= (b & 0x7F) << shift
        if not b & 0x80:
            return result, pos
        shift += 7


def fields(buf: bytes):
    pos = 0
    while pos < len(buf):
        key, pos = varint(buf, pos)
        number, wire = key >> 3, key & 7
        if wire == 0:
            value, pos = varint(buf, pos)
        elif wire == 1:
            value, pos = buf[pos:pos + 8], pos + 8
        elif wire == 2:
            size, pos = varint(buf, pos)
            value, pos = buf[pos:pos + size], pos + size
        elif wire == 5:
            value, pos = buf[pos:pos + 4], pos + 4
        else:
            raise ValueError("unsupported wire type")
        yield number, value


def packed(buf: bytes) -> list[int]:
    out, pos = [], 0
    while pos < len(buf):
        value, pos = varint(buf, pos)
        out.append(value)
    return out


def value_of(buf: bytes):
    for number, raw in fields(buf):
        if number == 1:
            return raw.decode()
        if number == 2:
            return struct.unpack("<f", raw)[0]
        if number == 3:
            return struct.unpack("<d", raw)[0]
        if number in (4, 5):
            return raw
        if number == 6:
            return (raw >> 1) ^ -(raw & 1)
        if number == 7:
            return bool(raw)
    return None


def decode(tile: bytes) -> list[dict]:
    out = []
    for number, layer in fields(tile):
        if number != 3:
            continue
        keys, values, features = [], [], []
        for n, raw in fields(layer):
            if n == 3:
                keys.append(raw.decode())
            elif n == 4:
                values.append(value_of(raw))
            elif n == 2:
                features.append(raw)
        for feature in features:
            tags = []
            for n, raw in fields(feature):
                if n == 2:
                    tags = packed(raw)
            out.append({keys[tags[i]]: values[tags[i + 1]] for i in range(0, len(tags), 2)})
    return out
