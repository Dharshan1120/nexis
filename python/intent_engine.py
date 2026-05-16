import json
import os
from pathlib import Path
from rapidfuzz import process, fuzz

class IntentEngine:
    def __init__(self, intents_file="data/intents.json"):
        base_dir = Path(__file__).resolve().parent
        self.intents_file = base_dir / intents_file
        self.intents = []
        self.flat_examples = []
        self.example_to_intent = {}
        self.context = {"last_app": None}
        self.load_intents()

    def load_intents(self):
        try:
            if not self.intents_file.exists():
                print(f"[intent] Intents file not found: {self.intents_file}")
                return
                
            with open(self.intents_file, "r", encoding="utf-8") as f:
                self.intents = json.load(f)
                
            for intent in self.intents:
                for example in intent.get("examples", []):
                    self.flat_examples.append(example)
                    self.example_to_intent[example] = intent
            print(f"[intent] Loaded {len(self.intents)} intents with {len(self.flat_examples)} examples.")
        except Exception as e:
            print(f"[intent] Error loading intents: {e}")

    def update_context(self, action_id):
        if action_id and (action_id.startswith("open_") or action_id.startswith("close_")):
            app = action_id.split("_", 1)[1]
            if app not in ["desktop", "downloads", "documents", "pictures", "file_manager", "nexis"]:
                self.context["last_app"] = app

    def process_command(self, text: str) -> dict:
        normalized = text.strip().lower()
        if not normalized:
            return {"ok": False, "response": "Empty input"}
            
        # Context Resolution
        # If user says "close it" after "open chrome"
        if normalized in ["close it", "kill it", "shut it down", "exit it", "quit it"]:
            if self.context.get("last_app"):
                print(f"[intent] Context resolution: 'close it' -> 'close {self.context['last_app']}'")
                normalized = f"close {self.context['last_app']}"

        # Fuzzy matching
        if not self.flat_examples:
            return {"ok": False, "response": "No intents loaded."}

        match = process.extractOne(normalized, self.flat_examples, scorer=fuzz.WRatio)
        if match:
            best_phrase, score, _ = match
            confidence = score / 100.0
            
            matched_intent = self.example_to_intent[best_phrase]
            threshold = matched_intent.get("threshold", 0.70)
            action_id = matched_intent.get("action")
            
            print(f"[intent] Match: '{normalized}' -> '{best_phrase}' (confidence: {confidence:.2f}, action: {action_id})")
            
            # High confidence -> execute directly
            if confidence >= threshold:
                self.update_context(action_id)
                return {
                    "ok": True,
                    "actionId": action_id,
                    "confidence": confidence,
                    "matched_phrase": best_phrase,
                    "normalized": normalized
                }
                
            # Medium confidence -> ask for confirmation
            elif confidence >= threshold - 0.15:
                return {
                    "ok": False,
                    "needsConfirmation": True,
                    "actionId": action_id,
                    "confidence": confidence,
                    "matched_phrase": best_phrase,
                    "normalized": normalized
                }

        return {
            "ok": False,
            "response": "Command not recognized locally."
        }

# Global singleton
_intent_engine = None

def get_intent_engine():
    global _intent_engine
    if _intent_engine is None:
        _intent_engine = IntentEngine()
    return _intent_engine

def run_command(text: str) -> dict:
    engine = get_intent_engine()
    return engine.process_command(text)
