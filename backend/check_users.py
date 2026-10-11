from pathlib import Path
import sqlite3

PROJECT_ROOT = Path(__file__).resolve().parent.parent

target_dbs = [
    PROJECT_ROOT / "oilspill.db",
    PROJECT_ROOT / "backend" / "oilspill.db",
    PROJECT_ROOT / "test.db",
    PROJECT_ROOT / "backend" / "test.db",
]

for db_path in target_dbs:
    if db_path.exists():
        print(f"\n--- Checking {db_path} ({db_path.stat().st_size} bytes) ---")
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        try:
            c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
            tables = [t[0] for t in c.fetchall()]
            print(f"Tables ({len(tables)}):", tables[:8], "..." if len(tables) > 8 else "")
            if "users" in tables:
                c.execute("SELECT id, name, email, role FROM users")
                users = c.fetchall()
                print(f"Users ({len(users)}):")
                for u in users:
                    print(" -", u[1], u[2], u[3])
        except Exception as e:
            print("Error querying db:", e)
        conn.close()
    else:
        print(f"\n--- {db_path} does not exist ---")

