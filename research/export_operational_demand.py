from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import pandas as pd
import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
BACKEND_ENV = ROOT / 'backend' / '.env'
RESEARCH_DATA_DIR = ROOT / 'research' / 'data'
OUTPUT_PATH = RESEARCH_DATA_DIR / 'operational_demand.csv'


def get_database_url() -> str:
    if BACKEND_ENV.exists():
        load_dotenv(BACKEND_ENV)
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        raise RuntimeError('DATABASE_URL is not set. Configure backend/.env before exporting operational demand data.')

    parsed = urlsplit(database_url)
    cleaned = urlunsplit((parsed.scheme, parsed.netloc, parsed.path, '', ''))
    return cleaned


def build_query() -> str:
    return """
        SELECT
            DATE(st."timestamp" AT TIME ZONE 'UTC') AS date,
            b."medicineId" AS medicine_id,
            SUM(st.quantity) AS quantity_issued
        FROM "StockTransaction" st
        INNER JOIN "Batch" b ON b.id = st."batchId"
        WHERE st.type = 'OUT'
        GROUP BY DATE(st."timestamp" AT TIME ZONE 'UTC'), b."medicineId"
        ORDER BY date, medicine_id
    """


def export_operational_demand() -> pd.DataFrame:
    database_url = get_database_url()

    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cursor:
            cursor.execute('SET search_path TO public;')
            cursor.execute(build_query())
            rows = cursor.fetchall()

    if not rows:
        raise RuntimeError('No OUT stock transactions were found in the operational database.')

    df = pd.DataFrame(rows, columns=['date', 'medicine_id', 'quantity_issued'])
    df['date'] = pd.to_datetime(df['date'], utc=True)
    df['quantity_issued'] = df['quantity_issued'].astype(int)
    df['is_synthetic'] = False
    df = df[['date', 'medicine_id', 'quantity_issued', 'is_synthetic']]
    df = df.sort_values(['medicine_id', 'date']).reset_index(drop=True)
    RESEARCH_DATA_DIR.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUTPUT_PATH, index=False)
    return df


def main() -> None:
    df = export_operational_demand()
    print(
        {
            'rows': int(len(df)),
            'medicines': int(df['medicine_id'].nunique()),
            'date_from': df['date'].min().isoformat(),
            'date_to': df['date'].max().isoformat(),
            'output_path': str(OUTPUT_PATH),
        }
    )


if __name__ == '__main__':
    main()
