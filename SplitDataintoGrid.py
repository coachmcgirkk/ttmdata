import pandas as pd
import os
import math
import sys  # for flush()

# Ask user for the value to insert into the "data source" column
data_source_value = input("Enter the value for 'data source': ")

# Load your large CSV
df = pd.read_csv('data.csv', low_memory=False)

# Choose your grid size (in degrees)
LAT_GRID_SIZE = 0.05
LON_GRID_SIZE = 0.05

# Create folder to hold grid CSVs
os.makedirs("grids", exist_ok=True)

def get_grid_cell(lat, lon):
    """Returns the grid cell key for given lat/lon"""
    lat_index = math.floor(lat / LAT_GRID_SIZE)
    lon_index = math.floor(lon / LON_GRID_SIZE)
    return f"{lat_index}_{lon_index}"

# Add a grid key to each row
df['grid'] = df.apply(lambda row: get_grid_cell(row['Latitude'], row['Longitude']), axis=1)

# Add "data source" column
df['data_source'] = data_source_value

# Group and save each grid to its own file
groups = list(df.groupby('grid'))
total = len(groups)

for i, (grid_key, group) in enumerate(groups, 1):
    group.to_csv(f"grids/{grid_key}.csv", index=False)
    percent = (i / total) * 100
    print(f"Progress: {percent:.2f}% ({i}/{total})", end='\r', flush=True)

print("\nDone!")
