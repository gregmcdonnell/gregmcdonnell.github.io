import pandas as pd
import requests
from io import StringIO

API_KEY = "QPwMRgzYVlKsXCfqYup1n4zVPkikRdMQGnkCoQRp"

# url = "https://developer.nlr.gov/api/nsrdb/v2/solar/nsrdb-GOES-aggregated-v4-0-0-download.csv"
# params = {
#     "wkt": "POINT(-105.27 39.74)",
#     "attributes": "dni,dhi,ghi",
#     "names": "2023",
#     "utc": "true",  
#     "email": "greg.mcdonnell137@gmail.com",
#     "api_key": API_KEY
# }

# response = requests.get(url, params=params)

# metadata = response.text.splitlines()[:2]
# for line in metadata:
#     print(line)

# csv_file_like = StringIO(response.text)
# df = pd.read_csv(csv_file_like, skiprows=2)

# print(df.head())

csv_path = "/Users/gregmcdonnell/Web Apps/portfolio-website/gregmcdonnell.github.io/docs/simulations/pv-power-plant/nsr_phoenix2023.csv"

df = pd.read_csv(csv_path, skiprows=2)

print(df.head(n=24*4))
monthly_profiles = df.groupby(["Month", "Hour"])[["DNI", "DHI", "GHI"]].mean()

profiles = {}

for month in range(1, 13):
    month_data = monthly_profiles.loc[month]
    # month_data = month_data.sort_index()  # ensure hours 0–23 order

    profiles[month] = {
        "DNI": month_data["DNI"].tolist(),
        "DHI": month_data["DHI"].tolist(),
        "GHI": month_data["GHI"].tolist(),
    }
    print(profiles[month])