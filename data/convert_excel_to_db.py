#!/usr/bin/env python3
import pandas as pd
import sqlite3
import os
import sys
from pathlib import Path

def clean_column_name(col_name):
    """
    Clean and normalize column names for SQLite compatibility.
    """
    if pd.isna(col_name) or col_name == '':
        return 'unnamed_column'
    
    # Convert to string and strip whitespace
    col_name = str(col_name).strip()
    
    # Replace problematic characters
    col_name = col_name.replace(' ', '_').replace('-', '_').replace('.', '_')
    col_name = col_name.replace('(', '').replace(')', '').replace('[', '').replace(']', '')
    col_name = col_name.replace('/', '_').replace('\\', '_').replace('&', 'and')
    
    # Remove multiple underscores
    while '__' in col_name:
        col_name = col_name.replace('__', '_')
    
    # Remove leading/trailing underscores
    col_name = col_name.strip('_')
    
    # Ensure it doesn't start with a number
    if col_name and col_name[0].isdigit():
        col_name = f'col_{col_name}'
    
    # If empty after cleaning, use default name
    if not col_name:
        col_name = 'unnamed_column'
    
    return col_name

def excel_to_sqlite(excel_path, db_path=None):
    """
    Convert all sheets in an Excel file to tables in a SQLite database.
    Each sheet becomes a separate table with the same name.
    """
    # Extract filename without extension for db name if not provided
    if db_path is None:
        db_path = excel_path.replace('.xlsx', '.db')
    
    print(f"Converting {excel_path} to {db_path}...")
    
    # Read all sheets from the Excel file
    excel = pd.ExcelFile(excel_path)
    sheet_names = excel.sheet_names
    
    print(f"Found {len(sheet_names)} sheets: {sheet_names}")
    
    # Connect to SQLite database
    conn = sqlite3.connect(db_path)
    
    # Process each sheet
    for sheet_name in sheet_names:
        print(f"Processing sheet: {sheet_name}")
        
        try:
            # Read the sheet into a pandas DataFrame
            df = pd.read_excel(excel, sheet_name=sheet_name)
            
            # Convert sheet name to valid SQLite table name
            table_name = clean_column_name(sheet_name)
            
            # Clean and handle duplicate column names
            original_cols = df.columns.tolist()
            cleaned_cols = []
            col_counts = {}
            
            print(f"  - Original columns: {original_cols}")
            
            for i, col in enumerate(original_cols):
                # Clean the column name
                cleaned_col = clean_column_name(col)
                
                # Handle duplicates by adding a counter
                if cleaned_col.lower() in col_counts:
                    col_counts[cleaned_col.lower()] += 1
                    final_col = f"{cleaned_col}_{col_counts[cleaned_col.lower()]}"
                    print(f"  - Renaming duplicate column '{col}' to '{final_col}'")
                else:
                    col_counts[cleaned_col.lower()] = 0
                    final_col = cleaned_col
                
                cleaned_cols.append(final_col)
            
            # Assign the cleaned columns back to the DataFrame
            df.columns = cleaned_cols
            
            print(f"  - Final columns: {cleaned_cols}")
            
            # Write the DataFrame to a SQLite table
            df.to_sql(table_name, conn, if_exists='replace', index=False)
            
            print(f"  - Created table '{table_name}' with {len(df)} rows and {len(df.columns)} columns")
            
        except Exception as e:
            print(f"  - Error processing sheet '{sheet_name}': {str(e)}")
            continue
    
    # Close the connection
    conn.close()
    
    print(f"Conversion complete: {db_path}")
    return db_path

def main():
    # Get Excel file(s) from command line or use default path
    if len(sys.argv) > 1:
        excel_paths = sys.argv[1:]
    else:
        # Find all Excel files in data directory
        data_dir = Path('data')
        excel_paths = list(data_dir.glob('*.xlsx'))
        
    if not excel_paths:
        print("No Excel files found!")
        sys.exit(1)
        
    # Convert each Excel file to a SQLite database
    for excel_path in excel_paths:
        if isinstance(excel_path, Path):
            excel_path = str(excel_path)
        excel_to_sqlite(excel_path)
        
    print("All conversions completed successfully!")

if __name__ == "__main__":
    main()