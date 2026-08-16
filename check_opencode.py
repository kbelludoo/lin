import sqlite3, json

conn = sqlite3.connect(r'C:\Users\kbell\AppData\Roaming\9router\db\data.sqlite')
cur = conn.cursor()

cur.execute("SELECT id, data FROM providerConnections WHERE provider='opencode-go';")
for r in cur.fetchall():
    print('opencode-go data:', json.loads(r[1]))

cur.execute("SELECT data FROM providerNodes;")
for r in cur.fetchall():
    d = json.loads(r[0])
    if 'opencode' in json.dumps(d).lower() or 'ocg' in json.dumps(d).lower():
        print('Node:', d.get('modelId') or d.get('name') or d)
