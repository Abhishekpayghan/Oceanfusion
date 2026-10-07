import xarray as xr
import os

# INCOIS HYCOM remote dataset
url = "https://incois.gov.in/thredds/dodsC/osf/currents2/RSMC_hycom_20260909.nc"

print("Opening INCOIS HYCOM...")
ds = xr.open_dataset(url)

print("Original dataset:")
print(ds)

# ---------------------------------------------------
# 1. Select OceanFusion region
# ---------------------------------------------------

print("\nSelecting OceanFusion region...")

subset = ds.sel(
    LAT=slice(-30, 30),
    LON=slice(30, 120)
)

# ---------------------------------------------------
# 2. Keep only required variables
# ---------------------------------------------------

print("Selecting required variables...")

subset = subset[
    [
        "TEMP",
        "SALN",
        "UVEL",
        "VVEL"
    ]
]

# ---------------------------------------------------
# 3. Output folder
# ---------------------------------------------------

output_dir = "data/model"
os.makedirs(output_dir, exist_ok=True)

output_file = os.path.join(
    output_dir,
    "OceanFusion_HYCOM_small.nc"
)

# ---------------------------------------------------
# 4. Compression
# ---------------------------------------------------

encoding = {}

for variable in subset.data_vars:
    encoding[variable] = {
        "zlib": True,
        "complevel": 4
    }

# ---------------------------------------------------
# 5. Save smaller NetCDF
# ---------------------------------------------------

print("\nCreating smaller NetCDF...")
print("This may take some time because data is being downloaded from INCOIS.")

subset.to_netcdf(
    output_file,
    format="NETCDF4",
    encoding=encoding
)

print("\n================================")
print("SUCCESS!")
print("Small HYCOM file created:")
print(output_file)
print("================================")

print("\nSmall dataset:")
print(subset)