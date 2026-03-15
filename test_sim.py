import asyncio
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from services.simulator import simulate_race_strategy
from models.schemas import PitStopSimulation

def test():
    print("Testing Strategy Simulator")
    try:
        # Simulate Verstappen at 2024 Bahrain Race
        pit_stops = [
            PitStopSimulation(lap=15, compound="HARD"),
            PitStopSimulation(lap=40, compound="SOFT"),
        ]
        
        result = simulate_race_strategy(
            year=2024,
            gp="Bahrain",
            session_type="R",
            driver_code="VER",
            starting_compound="SOFT",
            pit_stops=pit_stops
        )
        print("Simulation Success!")
        print(f"Original Time: {result['original_total_time']}")
        print(f"Simulated Time: {result['simulated_total_time']}")
        print(f"Delta: {result['time_delta']}")
        print(f"Laps simulated: {len(result['simulated_laps'])}")
        
        print("\nFirst 5 simulated laps:")
        for lap in result['simulated_laps'][:5]:
            print(lap.dict())
            
    except Exception as e:
        print(f"Simulation failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test()
