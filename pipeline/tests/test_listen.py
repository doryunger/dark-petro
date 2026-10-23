import json
import unittest

from sts_tiles.listen import parse


def event(key, name="ObjectCreated:Put"):
    return json.dumps({"Records": [{"eventName": name, "s3": {"bucket": {"name": "b"}, "object": {"key": key, "eTag": "x"}}}]})


class Parse(unittest.TestCase):
    def test_test_event(self):
        self.assertEqual(parse('{"Service":"Amazon S3","Event":"s3:TestEvent"}', "sts/"), ("test", []))

    def test_publish_decodes_key(self):
        self.assertEqual(parse(event("sts/21-10-2026/off_sohar/s2.parquet"), "sts/"), ("publish", ["sts/21-10-2026/off_sohar/s2.parquet"]))
        self.assertEqual(parse(event("sts/a+b%2Bc.parquet"), "sts/"), ("publish", ["sts/a b+c.parquet"]))

    def test_ignores_other_keys_and_events(self):
        self.assertEqual(parse(event("captures/x.png"), "sts/")[0], "ignore")
        self.assertEqual(parse(event("sts/x.parquet", "ObjectRemoved:Delete"), "sts/")[0], "ignore")
        self.assertEqual(parse("not json", "sts/")[0], "ignore")


if __name__ == "__main__":
    unittest.main()
