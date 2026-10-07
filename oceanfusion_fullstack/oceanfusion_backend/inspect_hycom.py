import xarray as xr

url = "https://incois.gov.in/thredds/dodsC/osf/currents2/RSMC_hycom_20260909.nc"

print("Opening INCOIS HYCOM...")

ds = xr.open_dataset(url)

print("\n========== DATASET ==========")
print(ds)

print("\n========== VARIABLES ==========")
for var in ds.data_vars:
    print(var)

print("\n========== COORDINATES ==========")
for coord in ds.coords:
    print(coord)

print("\n========== DIMENSIONS ==========")
print(ds.dims)