import argparse
import os
import sys

# Ensure backend is in python path
sys.path.insert(0, os.path.abspath("backend"))

from app.database.session import SessionLocal, engine, Base
import app.models  # ensure models registered
from app.database.auth_setup import migrate_citizen_reports, seed_initial_admin, seed_demo_data


def main():
    parser = argparse.ArgumentParser(description="Marine Gaurd Database Initialization & Provisioning")
    parser.add_argument(
        "--demo",
        action="store_true",
        help="Explicit opt-in: seed demonstration citizen account and sample incidents (development/test only)",
    )
    args = parser.parse_args()

    print("Verifying database schema...")
    Base.metadata.create_all(bind=engine)
    migrate_citizen_reports(bind=engine)

    with SessionLocal() as db:
        admin_seeded = seed_initial_admin(db)
        if admin_seeded:
            print("Initial administrator provisioned successfully.")
        else:
            print("Administrator provisioning skipped (already exists or credentials not configured).")

        include_demo = args.demo or os.getenv("SEED_DEMO_DATA", "").lower() in ("true", "1", "yes")
        if include_demo:
            demo_seeded = seed_demo_data(db)
            if demo_seeded:
                print("Demonstration data seeded successfully.")
            else:
                print("Demonstration data seeding skipped (not allowed in current environment or already present).")
        else:
            print("Demo data seeding omitted (use --demo or SEED_DEMO_DATA=true to include demo data).")

    print("Database initialization completed successfully.")


if __name__ == "__main__":
    main()
