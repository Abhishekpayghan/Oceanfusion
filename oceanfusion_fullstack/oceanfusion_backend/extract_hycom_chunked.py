import os
import xarray as xr

URL = (
    "https://incois.gov.in/thredds/dodsC/"
    "osf/currents2/RSMC_hycom_20260909.nc"
)

OUTPUT_DIR = "data/model"
OUTPUT_FILE = os.path.join(
    OUTPUT_DIR,
    "OceanFusion_HYCOM_small.nc"
)

os.makedirs(OUTPUT_DIR, exist_ok=True)

print("=" * 60)
print("OCEANFUSION HYCOM - CHUNKED EXTRACTION")
print("=" * 60)

print("\nOpening INCOIS HYCOM...")
ds = xr.open_dataset(URL)

# Required region
region = ds[
    ["TEMP", "SALN", "UVEL", "VVEL"]
].sel(
    LAT=slice(-30, 30),
    LON=slice(30, 120)
)

# Every 2nd grid point
region = region.isel(
    LAT=slice(None, None, 2),
    LON=slice(None, None, 2)
)

print("\nFinal target dimensions:")
print(region.sizes)

# --------------------------------------------------
# Download time chunks
# --------------------------------------------------

time_chunks = [
    slice(0, 4),
    slice(4, 8),
    slice(8, 12),
    slice(12, 16),
    slice(16, 20),
    slice(20, 24),
    slice(24, 28),
]

parts = []

for i, time_slice in enumerate(time_chunks, start=1):

    print("\n" + "=" * 60)
    print(f"DOWNLOADING TIME CHUNK {i}/{len(time_chunks)}")
    print("=" * 60)

    chunk = region.isel(TIME=time_slice)

    print("Time:")
    print(chunk.TIME.values)

    print("Loading chunk from INCOIS...")

    # Force only this small chunk to download
    chunk = chunk.load()

    print("Chunk downloaded successfully.")

    parts.append(chunk)

# --------------------------------------------------
# Combine locally
# --------------------------------------------------

print("\n" + "=" * 60)
print("COMBINING CHUNKS")
print("=" * 60)

final_ds = xr.concat(parts, dim="TIME")

print("\nFinal dataset:")
print(final_ds)

# --------------------------------------------------
# Compression
# --------------------------------------------------

encoding = {}

for variable in final_ds.data_vars:
    encoding[variable] = {
        "zlib": True,
        "complevel": 4,
        "dtype": "float32"
    }

# --------------------------------------------------
# Save
# --------------------------------------------------

print("\nSaving:")
print(OUTPUT_FILE)

final_ds.to_netcdf(
    OUTPUT_FILE,
    format="NETCDF4",
    encoding=encoding
)

print("\n" + "=" * 60)
print("SUCCESS!")
print("=" * 60)

print("\nFile:")
print(OUTPUT_FILE)

print("\nVariables:")
print(list(final_ds.data_vars))

print("\nDimensions:")
print(final_ds.sizes)
