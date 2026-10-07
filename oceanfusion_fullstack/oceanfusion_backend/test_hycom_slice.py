import xarray as xr

url = "https://incois.gov.in/thredds/dodsC/osf/currents2/RSMC_hycom_20260909.nc"

print("Opening HYCOM...")
ds = xr.open_dataset(url)

print("Selecting tiny test slice...")

test = ds["TEMP"].isel(
    TIME=0,
    DEPTH=0,
    LAT=slice(600, 610),
    LON=slice(700, 710)
)

print(test)
print("\nDownloading tiny slice...")

data = test.load()

print("\nSUCCESS!")
print(data)
print("\nMinimum:", float(data.min()))
print("Maximum:", float(data.max()))