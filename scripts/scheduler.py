import json
import sys
from datetime import datetime, timedelta

def parse_time(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))

if len(sys.argv) > 1 and sys.argv[1] == '-':
    data = json.load(sys.stdin)
else:
    with open(sys.argv[1] if len(sys.argv) > 1 else '/tmp/schedule-input.json') as f:
        data = json.load(f)
workers = {w['id']: w for w in data['workers'] if w['available']}
free_at = {key: parse_time(data['now']) for key in workers}
finish = {}
blocked = set()
result = []
pending = list(data['tasks'])
for _ in range(len(pending) + 1):
    changed = False
    for task in list(pending):
        dependency = task.get('dependsOn')
        if dependency and dependency not in finish and any(t['id'] == dependency for t in pending):
            continue
        eligible = [key for key, w in workers.items() if task['kind'] in w['skills'] and key not in task.get('declinedWorkerIds', [])]
        if dependency in blocked:
            eligible = []
        if task['status'] == 'accepted':
            eligible = [key for key in eligible if key == task['workerId']]
        if not eligible:
            blocked.add(task['id'])
            result.append({'id': task['id'], 'workerId': '', 'feasible': False})
            pending.remove(task)
            changed = True
            continue
        key = min(eligible, key=lambda key: free_at[key])
        start = max(free_at[key], finish.get(dependency, parse_time(data['now'])))
        # Configurable estimates, not map/traffic predictions: sort 30, pack 30, local delivery 60 min.
        end = start + timedelta(minutes={'sort': 30, 'pack': 30, 'deliver': 60}[task['kind']])
        free_at[key] = end
        finish[task['id']] = end
        result.append({'id': task['id'], 'workerId': key, 'start': start.isoformat(), 'end': end.isoformat(), 'feasible': end <= parse_time(task['due'])})
        pending.remove(task)
        changed = True
    if not changed:
        break
assert not pending, 'cyclic dependencies'
print(json.dumps(result))
