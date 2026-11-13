"""Pure event classification shared by the existing pipeline and drill-down builder."""
VIOLENT = {"Assault", "Robbery", "Homicide", "Rape", "Sex Offense", "Human Trafficking (A), Commercial Sex Acts",
           "Human Trafficking (B), Involuntary Servitude", "Human Trafficking, Commercial Sex Acts"}
PROPERTY = {"Larceny Theft", "Burglary", "Motor Vehicle Theft", "Motor Vehicle Theft?", "Malicious Mischief", "Vandalism", "Arson", "Stolen Property"}
VEHICLE_BREAKIN_SUB = {"Larceny - From Vehicle", "Theft From Vehicle", "Larceny - Auto Parts"}
DRUG = {"Drug Offense", "Drug Violation"}
NOT_CRIME = {"Non-Criminal", "Lost Property", "Missing Person", "Recovered Vehicle", "Suspicious Occ", "Suspicious", "Miscellaneous Investigation", "Case Closure", "Courtesy Report", "Traffic Collision", "Vehicle Impounded", "Vehicle Misplaced", "Fire Report", "Suicide", "Warrant", "Traffic Violation Arrest", "Other", None, ""}
CRIME_GROUPS = ("violent", "property", "vehicle_breakin", "drug", "other")


def crime_groups(category, sub):
    # Pandas represents absent source text as NaN. It is unknown, not an offence.
    if not isinstance(category, str) or category in NOT_CRIME:
        return []
    if category in VIOLENT:
        return ["violent"]
    if category in PROPERTY:
        return ["property", "vehicle_breakin"] if sub in VEHICLE_BREAKIN_SUB else ["property"]
    if category in DRUG:
        return ["drug"]
    return ["other"]


PEDESTRIAN = {"Vehicle-Pedestrian", "Bicycle-Pedestrian", "Vehicle-Bicycle-Pedestrian", "Pedestrian Only or Pedestrian-Parked Car"}
CYCLIST = {"Vehicle-Bicycle", "Bicycle Only", "Bicycle-Pedestrian", "Bicycle-Parked Car", "Bicycle-Unknown/Not Stated", "Vehicle-Bicycle-Pedestrian"}
VEHICLE_ONLY = {"Vehicle(s) Only Involved"}


def crash_flags(row):
    kind = row.get("dph_col_grp_description")
    return (int(kind in PEDESTRIAN) | (int(kind in CYCLIST) << 1)
            | (int(kind in VEHICLE_ONLY) << 2)
            | (int(row.get("collision_severity") in {"Fatal", "Injury (Severe)"}) << 3))
