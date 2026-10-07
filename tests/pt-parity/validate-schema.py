"""Validate frozen envelopes with Draft 2020-12 and date-time format assertions."""
import copy
import json
import re
from datetime import datetime
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker

root = Path(__file__).resolve().parents[2]
schema = json.loads((root / 'contracts/pt-os.v1.schema.json').read_text())
Draft202012Validator.check_schema(schema)
formats = FormatChecker()


# jsonschema's optional RFC3339 dependency is not present in every local venv.
# Always assert the timestamp subset emitted by this contract (zoned ISO dates).
@formats.checks('date-time', raises=ValueError)
def zoned_iso_timestamp(value):
    if not isinstance(value, str):
        return True
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})', value):
        return False
    return datetime.fromisoformat(value.upper()).tzinfo is not None


validator = Draft202012Validator(schema, format_checker=formats)
fixtures = json.loads((root / 'tests/pt-parity/envelopes.json').read_text())
fixtures += json.loads((root / 'tests/pt-parity/radar-envelopes.json').read_text())
fixtures += json.loads((root / 'tests/pt-parity/crew-envelopes.json').read_text())
fixtures += json.loads((root / 'tests/pt-parity/command-envelopes.json').read_text())
fixtures += json.loads((root / 'tests/pt-parity/deliverables-envelopes.json').read_text())
for row in fixtures:
    validator.validate(row['envelope'])

original = fixtures[0]['envelope']
invalid = []
for key in schema['required']:
    example = copy.deepcopy(original)
    del example[key]
    invalid.append((f'missing {key}', example))
for key, value in [('contractRevision', 'pt-os.v2'), ('schemaVersion', 2), ('generatedAt', 'not-a-date'), ('validUntil', None), ('telegramToken', 'fixture-only')]:
    example = copy.deepcopy(original)
    example[key] = value
    invalid.append((f'invalid {key}', example))
for key, value in [('freshness', 'offline'), ('blocked', 'yes'), ('revision', ''), ('sourceAt', 'yesterday'), ('sessionId', 'fixture-only')]:
    example = copy.deepcopy(original)
    example['sources'][0][key] = value
    invalid.append((f'invalid source {key}', example))
for label, example in invalid:
    assert not validator.is_valid(example), label
print(f'Draft 2020-12: {len(fixtures)} valid envelopes accepted; {len(invalid)} invalid envelopes rejected.')
