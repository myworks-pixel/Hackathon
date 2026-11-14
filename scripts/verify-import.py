import csv, json
from datetime import datetime

with open('/tmp/farm-import/input.csv', newline='') as f:
    source = list(csv.DictReader(f))
with open('/tmp/farm-import/output.json') as f:
    output = json.load(f)
assert isinstance(output, list) and len(source) == len(output) and 0 < len(output) <= 100
for original, order in zip(source, output):
    values = [str(v).strip() for v in original.values() if v is not None]
    assert order['customer'] in values and order['address'] in values
    assert isinstance(order['kg'], (int, float)) and 0 < order['kg'] <= 10000
    assert datetime.fromisoformat(order['due'].replace('Z', '+00:00')).tzinfo is not None
print('source row count, names, addresses and value types verified; quantities/dates require human review')
