from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from simulator.full_simulator import FullSimulator
from simulator.workload import Workload

app = FastAPI(
    title="Memory Mirage API",
    description="API for the double-caching simulator",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5176",
        "http://127.0.0.1:5176",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "message": "Memory Mirage backend is running",
    }


class SimulationRequest(BaseModel):
    workload: str = "sequential"
    num_accesses: int = Field(default=100, ge=1, le=5000)
    db_cache_size: int = Field(default=8, ge=1, le=10000)
    os_cache_size: int = Field(default=8, ge=1, le=10000)
    total_blocks: int = Field(default=1000, ge=100, le=10000)
    cache_mode: str = "double_caching"


@app.post("/simulate")
def simulate(request: SimulationRequest):
    # Generate the requested access pattern.
    if request.workload == "sequential":
        workload = Workload.sequential(
            num_blocks=request.num_accesses
        )
    elif request.workload == "random":
        workload = Workload.random(
            num_accesses=request.num_accesses,
            total_blocks=request.total_blocks,
        )
    elif request.workload == "hotspot":
        workload = Workload.hotspot(
            num_accesses=request.num_accesses,
            total_blocks=request.total_blocks,
            hotspot_blocks=min(20, request.total_blocks),
        )
    else:
        return {
            "error": "Unsupported workload. Use sequential, random, or hotspot."
        }

    # Create and run the real simulator.
    simulator = FullSimulator(
        db_cache_size=request.db_cache_size,
        os_cache_size=request.os_cache_size,
        total_blocks=request.total_blocks,
        cache_mode=request.cache_mode,
    )

    simulator.process_workload(workload)

    return {
        "workload": request.workload,
        "cache_mode": request.cache_mode,
        "summary": simulator.get_summary(),
        "history": simulator.logger.data,
        "final_db_blocks": simulator.database.buffer_pool.get_blocks(),
        "final_os_blocks": simulator.os_cache.get_blocks(),
    }