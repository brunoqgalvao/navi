import json
import os
from datetime import datetime
from mitmproxy import http

LOG_DIR = os.path.join(os.path.dirname(__file__), "..", "logs")
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, f"api-requests-{int(datetime.now().timestamp())}.jsonl")

def request(flow: http.HTTPFlow) -> None:
    if "anthropic" in flow.request.host or "claude" in flow.request.host:
        entry = {
            "timestamp": datetime.now().isoformat(),
            "method": flow.request.method,
            "url": flow.request.url,
            "headers": dict(flow.request.headers),
        }
        
        if flow.request.content:
            try:
                body = json.loads(flow.request.content.decode())
                entry["body"] = body
                
                if "system" in body:
                    print("\n" + "="*80)
                    print("SYSTEM PROMPT:")
                    print("="*80)
                    if isinstance(body["system"], list):
                        for item in body["system"]:
                            if isinstance(item, dict) and "text" in item:
                                print(item["text"][:2000] + "..." if len(item["text"]) > 2000 else item["text"])
                    else:
                        print(body["system"][:2000] + "..." if len(str(body["system"])) > 2000 else body["system"])
                    print("="*80 + "\n")
            except:
                entry["body"] = flow.request.content.decode()
        
        with open(LOG_FILE, "a") as f:
            f.write(json.dumps(entry) + "\n")
        
        print(f"[{entry['timestamp']}] {flow.request.method} {flow.request.url}")
