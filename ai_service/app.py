from collections import deque
from datetime import datetime, timezone
import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel, Field
from sklearn.ensemble import IsolationForest

app = FastAPI(title="Prototype Measurement Anomaly Scorer")
history = deque(maxlen=1000)
model = None

class Reading(BaseModel):
    heartRate: float = Field(ge=25, le=240)
    spo2: float = Field(ge=70, le=100)
    signalQuality: float = Field(ge=0, le=100)
    irregularPulseFlag: bool = False

@app.get("/health")
def health():
    return {"ok": True, "mode": "experimental anomaly scoring; not a medical diagnosis"}

@app.post("/score")
def score(r: Reading):
    global model
    x = np.array([[r.heartRate, r.spo2, r.signalQuality]], dtype=float)
    history.append(x[0])
    flags = []
    if r.signalQuality < 40:
        flags.append("low_signal_quality")
    if r.heartRate < 50 or r.heartRate > 120:
        flags.append("heart_rate_outside_configured_review_band")
    if r.spo2 < 92:
        flags.append("spo2_below_configured_review_threshold")
    if r.irregularPulseFlag:
        flags.append("pulse_interval_variability_flag_from_firmware")
    # Train only after sufficient local samples; this is unsupervised anomaly scoring,
    # not an arrhythmia classifier. The model can learn abnormal data if data are poor.
    anomaly = None
    if len(history) >= 50:
        arr = np.array(history, dtype=float)
        model = IsolationForest(contamination=0.05, random_state=42)
        model.fit(arr)
        anomaly = int(model.predict(x)[0] == -1)
        if anomaly:
            flags.append("unusual_relative_to_recent_device_history")
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "reviewFlags": flags,
        "unsupervisedAnomaly": anomaly,
        "historySamples": len(history),
        "disclaimer": "Experimental screening aid only. Not validated for diagnosis or arrhythmia detection."
    }

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
