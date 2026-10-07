import requests
import re

url = "https://incois.gov.in/thredds/catalog/osf/currents2/catalog.html"

response = requests.get(url, timeout=30)

print("STATUS:", response.status_code)

text = response.text

print("\n--- NCSS REFERENCES ---")
for x in re.findall(r'[^"\']*ncss[^"\']*', text, re.IGNORECASE):
    print(x)

print("\n--- OPENDAP REFERENCES ---")
for x in re.findall(r'[^"\']*dodsC[^"\']*', text, re.IGNORECASE):
    print(x)

print("\n--- SERVICE REFERENCES ---")
for x in re.findall(r'serviceName[^>]*', text, re.IGNORECASE):
    print(x)

print("\n--- HYCOM FILES ---")
for x in re.findall(r'RSMC_hycom[^<"]*', text, re.IGNORECASE):
    print(x)