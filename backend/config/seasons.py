"""
Season-level configuration: team colors and metadata.
Drivers are NEVER hardcoded here — they come from FastF1 session data at load time.
"""

from typing import TypedDict


class TeamConfig(TypedDict):
    color: str
    engine: str


class SeasonConfig(TypedDict):
    teams: dict[str, TeamConfig]


SEASON_CONFIG: dict[int, SeasonConfig] = {
    2018: {
        "teams": {
            "Mercedes": {"color": "#00D2BE", "engine": "Mercedes"},
            "Ferrari": {"color": "#DC0000", "engine": "Ferrari"},
            "Red Bull Racing": {"color": "#1E41FF", "engine": "Renault"},
            "McLaren": {"color": "#FF8700", "engine": "Renault"},
            "Renault": {"color": "#FFF500", "engine": "Renault"},
            "Haas F1 Team": {"color": "#BD9B60", "engine": "Ferrari"},
            "Force India": {"color": "#F596C8", "engine": "Mercedes"},
            "Williams": {"color": "#469BFF", "engine": "Mercedes"},
            "Toro Rosso": {"color": "#B01818", "engine": "Honda"},
            "Sauber": {"color": "#9B0000", "engine": "Ferrari"},
        }
    },
    2019: {
        "teams": {
            "Mercedes": {"color": "#00D2BE", "engine": "Mercedes"},
            "Ferrari": {"color": "#DC0000", "engine": "Ferrari"},
            "Red Bull Racing": {"color": "#1E41FF", "engine": "Honda"},
            "McLaren": {"color": "#FF8700", "engine": "Renault"},
            "Renault": {"color": "#FFF500", "engine": "Renault"},
            "Haas F1 Team": {"color": "#BD9B60", "engine": "Ferrari"},
            "Racing Point": {"color": "#F596C8", "engine": "Mercedes"},
            "Williams": {"color": "#469BFF", "engine": "Mercedes"},
            "Toro Rosso": {"color": "#B01818", "engine": "Honda"},
            "Alfa Romeo Racing": {"color": "#960000", "engine": "Ferrari"},
        }
    },
    2020: {
        "teams": {
            "Mercedes": {"color": "#00D2BE", "engine": "Mercedes"},
            "Red Bull Racing": {"color": "#1E41FF", "engine": "Honda"},
            "McLaren": {"color": "#FF8700", "engine": "Renault"},
            "Racing Point": {"color": "#F596C8", "engine": "Mercedes"},
            "Renault": {"color": "#FFF500", "engine": "Renault"},
            "Ferrari": {"color": "#DC0000", "engine": "Ferrari"},
            "AlphaTauri": {"color": "#B01818", "engine": "Honda"},
            "Alfa Romeo Racing": {"color": "#960000", "engine": "Ferrari"},
            "Haas F1 Team": {"color": "#BD9B60", "engine": "Ferrari"},
            "Williams": {"color": "#469BFF", "engine": "Mercedes"},
        }
    },
    2021: {
        "teams": {
            "Mercedes": {"color": "#00D2BE", "engine": "Mercedes"},
            "Red Bull Racing": {"color": "#1E41FF", "engine": "Honda"},
            "McLaren": {"color": "#FF8700", "engine": "Mercedes"},
            "Ferrari": {"color": "#DC0000", "engine": "Ferrari"},
            "Aston Martin": {"color": "#006F62", "engine": "Mercedes"},
            "Alpine": {"color": "#0090FF", "engine": "Renault"},
            "AlphaTauri": {"color": "#B01818", "engine": "Honda"},
            "Alfa Romeo Racing": {"color": "#960000", "engine": "Ferrari"},
            "Haas F1 Team": {"color": "#BD9B60", "engine": "Ferrari"},
            "Williams": {"color": "#469BFF", "engine": "Mercedes"},
        }
    },
    2022: {
        "teams": {
            "Red Bull Racing": {"color": "#3671C6", "engine": "RBPT"},
            "Ferrari": {"color": "#E8002D", "engine": "Ferrari"},
            "Mercedes": {"color": "#27F4D2", "engine": "Mercedes"},
            "Alpine": {"color": "#0093CC", "engine": "Renault"},
            "McLaren": {"color": "#FF8000", "engine": "Mercedes"},
            "Alfa Romeo Racing": {"color": "#B12029", "engine": "Ferrari"},
            "Aston Martin": {"color": "#358C75", "engine": "Mercedes"},
            "Haas F1 Team": {"color": "#B6BABD", "engine": "Ferrari"},
            "AlphaTauri": {"color": "#5E8FAA", "engine": "RBPT"},
            "Williams": {"color": "#37BEDD", "engine": "Mercedes"},
        }
    },
    2023: {
        "teams": {
            "Red Bull Racing": {"color": "#3671C6", "engine": "Honda RBPT"},
            "Mercedes": {"color": "#27F4D2", "engine": "Mercedes"},
            "Ferrari": {"color": "#E8002D", "engine": "Ferrari"},
            "McLaren": {"color": "#FF8000", "engine": "Mercedes"},
            "Aston Martin": {"color": "#229971", "engine": "Mercedes"},
            "Alpine": {"color": "#0093CC", "engine": "Renault"},
            "Williams": {"color": "#64C4FF", "engine": "Mercedes"},
            "AlphaTauri": {"color": "#5E8FAA", "engine": "Honda RBPT"},
            "Alfa Romeo": {"color": "#B12029", "engine": "Ferrari"},
            "Haas F1 Team": {"color": "#B6BABD", "engine": "Ferrari"},
        }
    },
    2024: {
        "teams": {
            "Red Bull Racing": {"color": "#3671C6", "engine": "Honda RBPT"},
            "Ferrari": {"color": "#E8002D", "engine": "Ferrari"},
            "McLaren": {"color": "#FF8000", "engine": "Mercedes"},
            "Mercedes": {"color": "#27F4D2", "engine": "Mercedes"},
            "Aston Martin": {"color": "#229971", "engine": "Mercedes"},
            "Alpine": {"color": "#0093CC", "engine": "Renault"},
            "Williams": {"color": "#64C4FF", "engine": "Mercedes"},
            "RB F1 Team": {"color": "#6692FF", "engine": "Honda RBPT"},
            "Kick Sauber": {"color": "#52E252", "engine": "Ferrari"},
            "Haas F1 Team": {"color": "#B6BABD", "engine": "Ferrari"},
        }
    },
    2025: {
        "teams": {
            "Red Bull Racing": {"color": "#3671C6", "engine": "Honda RBPT"},
            "McLaren": {"color": "#FF8000", "engine": "Mercedes"},
            "Ferrari": {"color": "#E8002D", "engine": "Ferrari"},
            "Mercedes": {"color": "#27F4D2", "engine": "Mercedes"},
            "Aston Martin": {"color": "#229971", "engine": "Mercedes"},
            "Alpine": {"color": "#0093CC", "engine": "Renault"},
            "Williams": {"color": "#64C4FF", "engine": "Mercedes"},
            "Racing Bulls": {"color": "#6692FF", "engine": "Honda RBPT"},
            "Kick Sauber": {"color": "#52E252", "engine": "Ferrari"},
            "Haas F1 Team": {"color": "#B6BABD", "engine": "Ferrari"},
        }
    },
}

# Historical team name normalization — maps old names to 2025 canonical names
# Used for cross-season ML training and display normalization
TEAM_NAME_MAP: dict[str, str] = {
    # Racing Bulls lineage
    "RB F1 Team": "Racing Bulls",
    "Visa Cash App RB": "Racing Bulls",
    "AlphaTauri": "Racing Bulls",
    "Toro Rosso": "Racing Bulls",
    # Kick Sauber lineage
    "Alfa Romeo": "Kick Sauber",
    "Alfa Romeo Racing": "Kick Sauber",
    "Sauber": "Kick Sauber",
    # Alpine lineage
    "Renault": "Alpine",
    "Alpine F1 Team": "Alpine",
    # Aston Martin lineage
    "Racing Point": "Aston Martin",
    "Force India": "Aston Martin",
    "BWT Racing Point": "Aston Martin",
    "Aston Martin Aramco": "Aston Martin",
    # Other minor variants
    "Red Bull": "Red Bull Racing",
    "Red Bull Racing Honda": "Red Bull Racing",
    "Haas": "Haas F1 Team",
}


def get_team_color(team_name: str, year: int) -> str:
    """Resolve team color from season config with fallback."""
    config = SEASON_CONFIG.get(year, SEASON_CONFIG[2025])
    teams = config["teams"]

    if team_name in teams:
        return teams[team_name]["color"]

    # Try normalization
    normalized = TEAM_NAME_MAP.get(team_name, team_name)
    if normalized in teams:
        return teams[normalized]["color"]

    # Fallback to 2025 config
    fallback_teams = SEASON_CONFIG[2025]["teams"]
    normalized_2025 = TEAM_NAME_MAP.get(team_name, team_name)
    return fallback_teams.get(normalized_2025, {}).get("color", "#FFFFFF")


def normalize_team_name(team_name: str) -> str:
    """Normalize historical team names to current canonical names."""
    return TEAM_NAME_MAP.get(team_name, team_name)
