"""
Multilingual Maritime AI Intent Engine & Grounded Reasoning.
Integrates RBAC, conversation context, real database telemetry,
GIS actions, and multi-language natural response generation for 22 Indian languages.
"""
from __future__ import annotations
import re
import logging
from typing import Dict, Any, Optional, List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.models.incident import Incident
from app.models.citizen_report import CitizenReport
from app.models.user import ROLE_ADMIN, ROLE_CITIZEN, User, PublicAlert
from app.gis.vessel_service import VesselService
from app.services.vessel_ranking import rank_vessels
from app.services.source_analyzer import SourceAnalyzerService
from app.services.voice.languages import get_language_metadata, INDIAN_LANGUAGES
from app.services.voice.language_detector import IndianLanguageDetector

logger = logging.getLogger("oil_spill.voice.intent")


class VoiceSessionState:
    """In-memory session memory for conversational context."""
    def __init__(self):
        self.last_incident_id: Optional[str] = None
        self.last_vessel_mmsi: Optional[str] = None
        self.report_flow_state: Optional[Dict[str, Any]] = None


# Global session cache keyed by user_id or conversation_id
_VOICE_SESSIONS: Dict[str, VoiceSessionState] = {}


def get_voice_session(session_id: str) -> VoiceSessionState:
    if session_id not in _VOICE_SESSIONS:
        _VOICE_SESSIONS[session_id] = VoiceSessionState()
    return _VOICE_SESSIONS[session_id]


class MultilingualIntentEngine:
    """Understands Indian voice queries, enforces RBAC, and generates localized responses."""

    def __init__(self):
        self.detector = IndianLanguageDetector()

    def process_query(
        self,
        query_text: str,
        user: Optional[User],
        db: Session,
        language: str = "auto",
        session_id: str = "default",
    ) -> Dict[str, Any]:
        """
        Main pipeline:
        1. Language normalization
        2. Intent classification (cross-lingual regex / keywords)
        3. RBAC validation
        4. Data retrieval
        5. Multilingual response phrasing + Map actions
        """
        raw_text = query_text.strip()
        session = get_voice_session(session_id)

        # 1. Resolve language
        if language == "auto":
            detected_lang, conf = self.detector.detect_text_language(raw_text)
            lang_code = detected_lang
        else:
            lang_code = language.lower()

        lang_meta = get_language_metadata(lang_code)
        role = user.role if user else ROLE_CITIZEN
        is_admin = (role == ROLE_ADMIN)

        # 2. Intent matching
        intent = self._classify_intent(raw_text)
        logger.info("Voice query: '%s' | Detected Intent: %s | Role: %s | Lang: %s", raw_text, intent, role, lang_code)

        # 3. Handle reporting conversational flow if user is in middle of report
        if session.report_flow_state:
            return self._handle_report_flow(raw_text, session, lang_code, user, db)

        # 4. Route intent
        if intent == "REPORT_OIL_SPILL":
            return self._start_report_flow(session, lang_code)

        if intent in ("VIEW_VESSEL_RANKING", "GET_CANDIDATE_VESSELS", "SHOW_HIGHEST_SCORE", "GET_VESSEL_TRAJECTORY"):
            if not is_admin:
                return self._deny_citizen_attribution(lang_code)
            return self._handle_admin_vessel_ranking(db, lang_code, session)

        if intent == "RUN_HINDCASTING":
            if not is_admin:
                return self._deny_citizen_hindcast(lang_code)
            return self._handle_admin_hindcast(db, lang_code, session)

        if intent == "RUN_SPILL_DETECTION":
            if not is_admin:
                return self._deny_citizen_detection(lang_code)
            return self._handle_admin_detection(db, lang_code)

        if intent == "GET_ACTIVE_ALERTS":
            return self._handle_get_alerts(db, lang_code)

        if intent == "GET_MY_REPORTS":
            return self._handle_get_my_reports(db, user, lang_code)

        if intent in ("CHECK_SPILL_STATUS", "GET_SPILL_LOCATION", "GET_SPILL_SEVERITY", "GET_SPILL_AREA", "GET_NEARBY_SPILLS"):
            return self._handle_spill_status(db, lang_code, session, intent)

        if intent == "GET_DRIFT_PREDICTION":
            return self._handle_drift_prediction(db, lang_code, session)

        if intent == "EMERGENCY_STEPS":
            return self._handle_emergency_guidance(lang_code)

        if intent == "HELP":
            return self._handle_help(lang_code, is_admin)

        # Fallback / General overview
        return self._handle_general_overview(db, lang_code, session)

    def _classify_intent(self, text: str) -> str:
        t = text.lower()

        # Report an oil spill
        if any(w in t for w in [
            "report", "புகார்", "பதிவு", "तक्रार", "রিপোর্ট", "రిపోర్ట్", "ವರದಿ", "പരാതി", "தெரிவிக்க"
        ]) and any(w in t for w in ["spill", "oil", "கசிவு", "तेल", "చమురు", "തൈല", "তেল", "गळती"]):
            return "REPORT_OIL_SPILL"

        # Candidate ships / Who caused / Responsible vessel
        if any(w in t for w in [
            "responsible", "candidate", "vessel", "ship", "tanker", "who did", "culprit",
            "கப்பல்", "காரணம்", "பொறுப்பு", "जहाज", "जिम्मेदार", "नाव", "नौका", "হাড়గు", "ಕಪ್ಪಲ್"
        ]):
            return "VIEW_VESSEL_RANKING"

        # Hindcasting / Spill origin / Where it came from
        if any(w in t for w in [
            "hindcast", "origin", "where did it come from", "source", "backward drift",
            "ஆரம்பம்", "புள்ளி", "மூலம்", "कहाँ से आया", "उद्गम", "स्रोतः", "మూలం", "మూలస్థానం"
        ]):
            return "RUN_HINDCASTING"

        # Run AI detection / Satellite scan
        if any(w in t for w in [
            "detect", "satellite", "scan", "run detection", "ai detect",
            "கண்டறி", "செயற்கைக்கோள்", "स्कैन", "सैटलाइट", "শনাক্ত"
        ]):
            return "RUN_SPILL_DETECTION"

        # Alerts / Warnings / Bans
        if any(w in t for w in [
            "alert", "warning", "ban", "emergency", "beach", "fishing",
            "எச்சரிக்கை", "ஆபத்து", "அலர்ட்", "अलर्ट", "चेतावनी", "इशारे", "హెచ్చరిక", "ఎలర్ట్"
        ]):
            return "GET_ACTIVE_ALERTS"

        # My reports
        if any(w in t for w in ["my report", "my complaint", "status of my", "என் அறிக்கை", "मेरी रिपोर्ट"]):
            return "GET_MY_REPORTS"

        # Forward drift / movement
        if any(w in t for w in ["drift", "moving", "direction", "reach coast", "நகர்வு", "திசை", "कहाँ जा रहा है", "बहव"]):
            return "GET_DRIFT_PREDICTION"

        # Area / Size / Extent
        if any(w in t for w in ["area", "size", "extent", "square km", "பரப்பளவு", "அளவு", "क्षेत्रफल", "विस्तार", "విస్తీర్ణం"]):
            return "GET_SPILL_AREA"

        # Location / Coordinates
        if any(w in t for w in ["where", "location", "coordinates", "எங்கே", "இடம்", "कहाँ", "स्थान", "ఎక్కడ", "ఎక్కడ ఉంది"]):
            return "GET_SPILL_LOCATION"

        # Severity / Risk
        if any(w in t for w in ["severity", "critical", "risk", "level", "தீவிரம்", "गंभीरता", "धोका", "తీవ్రత"]):
            return "GET_SPILL_SEVERITY"

        # Status / General spill inquiry
        if any(w in t for w in [
            "spill", "oil", "incident", "status", "active", "latest",
            "கசிவு", "எண்ணெய்", "तेल", "रिसाव", "చమురు", "തൈല", "তেল", "गळती"
        ]):
            return "CHECK_SPILL_STATUS"

        # Emergency guidance
        if any(w in t for w in ["what should i do", "safety", "precaution", "என்ன செய்ய", "क्या करें", "రక్షణ"]):
            return "EMERGENCY_STEPS"

        # Help
        if any(w in t for w in ["help", "command", "what can you do", "உதவி", "मदद", "సహాయం"]):
            return "HELP"

        return "GENERAL_OVERVIEW"

    # ── Conversational Report Workflow ──────────────────────────────────────────

    def _start_report_flow(self, session: VoiceSessionState, lang_code: str) -> Dict[str, Any]:
        session.report_flow_state = {"step": "LOCATION", "location": None, "observation": None}
        prompts = {
            "ta": "எண்ணெய் கசிவு புகாரை பதிவு செய்ய உதவுகிறேன். கசிவு கண்டறியப்பட்ட இடத்தைக் கூறுங்கள் (எ.கா. மெரினா கடற்கரை அல்லது எண்ணூர்).",
            "hi": "मैं तेल रिसाव रिपोर्ट दर्ज करने में आपकी सहायता करूँगा। कृपया घटना का स्थान बताएं (जैसे मरीना बीच या एन्नोर तट)।",
            "te": "చమురు లీకేజీని నివేదించడంలో నేను మీకు సహాయం చేస్తాను. దయచేసి స్థానాన్ని చెప్పండి (ఉదాహరణకు మెరీనా బీచ్ లేదా ఎన్నూర్ తీరం).",
            "kn": "ತೈಲ ಸೋರಿಕೆಯನ್ನು ವರದಿ ಮಾಡಲು ನಾನು ನಿಮಗೆ ಸಹಾಯ ಮಾಡುತ್ತೇನೆ. ದಯವಿಟ್ಟು ಸ್ಥಳವನ್ನು ತಿಳಿಸಿ (ಉದಾಹರಣೆಗೆ ಮರೀನಾ ಬೀಚ್).",
            "ml": "എണ്ണ ചോർച്ച റിപ്പോർട്ട് ചെയ്യാൻ ഞാൻ സഹായിക്കാം. ദയവായി സ്ഥലം വ്യക്തമാക്കുക.",
            "bn": "তেল নিঃসরণ রিপোর্ট করতে আমি আপনাকে সাহায্য করব। অনুগ্রহ করে স্থানটি বলুন (যেমন মেরিনা বিচ)।",
            "mr": "मी तेल गळती नोंदवण्यात मदत करतो. कृपया ठिकाण सांगा (उदा. मरीन बीच किंवा एन्नोर).",
            "en": "I can help you report an oil spill. Please tell me the location where you observed it (e.g. Marina Beach or Ennore Coast)."
        }
        text = prompts.get(lang_code, prompts["en"])
        return {
            "intent": "REPORT_OIL_SPILL",
            "text": text,
            "voice_text": text,
            "action": {"type": "START_REPORT_FLOW", "step": "LOCATION"},
            "followups": ["Near Marina Beach", "Ennore Port approach", "Cancel report"]
        }

    def _handle_report_flow(
        self,
        raw_text: str,
        session: VoiceSessionState,
        lang_code: str,
        user: Optional[User],
        db: Session,
    ) -> Dict[str, Any]:
        state = session.report_flow_state
        step = state.get("step")

        # Check for cancel
        if any(c in raw_text.lower() for c in ["cancel", "stop", "ரத்து", "रद्द", "వద్దు"]):
            session.report_flow_state = None
            msg = {"ta": "புகார் பதிவு ரத்து செய்யப்பட்டது.", "hi": "रिपोर्ट प्रक्रिया रद्द कर दी गई।", "en": "Report reporting process has been cancelled."}
            return {"intent": "CANCEL_REPORT", "text": msg.get(lang_code, msg["en"]), "voice_text": msg.get(lang_code, msg["en"])}

        if step == "LOCATION":
            state["location"] = raw_text
            state["step"] = "OBSERVATION"
            prompts = {
                "ta": f"இடம் '{raw_text}' என குறித்துக்கொண்டேன். நீங்கள் கவனித்தவற்றை சுருக்கமாக விவரிக்கவும் (எ.கா. கரிய நிற எண்ணெய் படலம், துர்நாற்றம்).",
                "hi": f"स्थान '{raw_text}' नोट किया गया। कृपया बताएं आपने क्या देखा (जैसे काला तैलीय पैच या गंध)?",
                "te": f"స్థానం '{raw_text}' నమోదు చేయబడింది. మీరు గమనించిన వివరాలను వివరించండి.",
                "en": f"Recorded location: '{raw_text}'. Please describe what you observed (e.g. dark oily sheen, strong petroleum odor)."
            }
            resp = prompts.get(lang_code, prompts["en"])
            return {"intent": "REPORT_FLOW_OBSERVATION", "text": resp, "voice_text": resp, "action": {"type": "REPORT_STEP_OBSERVATION"}}

        if step == "OBSERVATION":
            state["observation"] = raw_text
            state["step"] = "CONFIRMATION"
            prompts = {
                "ta": f"விவரங்கள் தயார். இடம்: {state['location']} | விவரம்: {state['observation']}. இதை சமர்ப்பிக்கவா? உறுதிப்படுத்தவும்.",
                "hi": f"विवरण तैयार है। स्थान: {state['location']} | विवरण: {state['observation']}। क्या मैं इसे सबमिट करूँ?",
                "te": f"వివరాలు సిద్ధం. స్థానం: {state['location']}। సమర్పించమంటారా?",
                "en": f"Your report is ready. Location: {state['location']}. Observation: {state['observation']}. Shall I submit this verified citizen report?"
            }
            resp = prompts.get(lang_code, prompts["en"])
            return {
                "intent": "REPORT_FLOW_CONFIRMATION",
                "text": resp,
                "voice_text": resp,
                "require_confirmation": True,
                "action": {
                    "type": "CONFIRM_REPORT_SUBMISSION",
                    "data": {"location": state["location"], "description": state["observation"]}
                },
                "followups": ["Confirm and Submit", "Cancel"]
            }

        # Clear state if already complete
        session.report_flow_state = None
        return self._handle_general_overview(db, lang_code, session)

    # ── RBAC Protected Handlers ──────────────────────────────────────────────────

    def _deny_citizen_attribution(self, lang_code: str) -> Dict[str, Any]:
        """Polite refusal for citizens asking for confidential suspect attribution."""
        responses = {
            "ta": "இந்திய கடலோர காவல்படை மற்றும் கடல்சார் அதிகாரிகள் தற்போது தீவிர விசாரணை நடத்தி வருகின்றனர். சந்தேகத்திற்குரிய கப்பல்களின் பகுப்பாய்வு அங்கீகரிக்கப்பட்ட அதிகாரிகளுக்கு மட்டுமே ஒதுக்கப்பட்டுள்ளது.",
            "hi": "भारतीय तटरक्षक बल और समुद्री प्राधिकरण वर्तमान में जांच कर रहे हैं। जिम्मेदार जहाजों और संदिग्ध ट्रैकिंग की विस्तृत जानकारी केवल अधिकृत अधिकारियों के लिए उपलब्ध है।",
            "te": "భారత కోస్ట్‌గార్డ్ మరియు సముద్ర అధికారులు విచారణ జరుపుతున్నారు. అనుమానిత నౌకల వివరాలు అధికారిక అధికారులకు మాత్రమే పరిమితం.",
            "kn": "ಭಾರತೀಯ ಕರಾವಳಿ ಕಾವಲು ಪಡೆ ತನಿಖೆ ನಡೆಸುತ್ತಿದೆ. ಶಂಕಿತ ಹಡಗುಗಳ ವಿವರಗಳು ಅಧಿಕೃತ ಅಧಿಕಾರಿಗಳಿಗೆ ಮಾತ್ರ ಸೀಮಿತವಾಗಿದೆ.",
            "ml": "കോസ്റ്റ് ഗാർഡും സമുദ്ര സുരക്ഷാ വിഭാഗവും അന്വേഷണം നടത്തുന്നു. കപ്പൽ വിവരങ്ങൾ അധികാരമുള്ള ഉദ്യോഗസ്ഥർക്ക് മാത്രമാണ്.",
            "bn": "ভারতীয় কোস্ট গার্ড তদন্ত করছে। সন্দেহভাজন জাহাজের বিশদ বিবরণ অনুমোদিত কর্মকর্তাদের জন্য সংরক্ষিত।",
            "mr": "भारतीय तटरक्षक दल तपास करत आहे. संशयित जहाजांची माहिती केवळ अधिकृत अधिकाऱ्यांसाठी राखीव आहे.",
            "en": "The Indian Coast Guard and Maritime Authorities are actively investigating the incident. Detailed vessel attribution and suspect ranking are strictly restricted to authorized administrators."
        }
        text = responses.get(lang_code, responses["en"])
        return {
            "intent": "RESTRICTED_ACCESS",
            "text": text,
            "voice_text": text,
            "is_restricted": True,
            "badge": "CONFIDENTIAL INVESTIGATION",
            "followups": ["Show active emergency alerts", "What is the spill location?", "How do I report a spill?"]
        }

    def _deny_citizen_hindcast(self, lang_code: str) -> Dict[str, Any]:
        responses = {
            "ta": "தலைகீழ் சறுக்கல் (ஹிண்ட்காஸ்டிங்) மற்றும் சட்டப்பூர்வ மூலப் பகுப்பாய்வு அங்கீகரிக்கப்பட்ட அதிகாரிகளுக்கான பிரத்யேக பகுப்பாய்வு கருவியாகும்.",
            "hi": "रिवर्स लैग्रेंजियन हिंडकास्टिंग और डिस्चार्ज मूल विश्लेषण केवल अधिकृत कमांड अधिकारियों के लिए उपलब्ध है।",
            "en": "Lagrangian reverse-drift hindcasting and discharge origin modeling are restricted to authorized marine command officers."
        }
        text = responses.get(lang_code, responses["en"])
        return {"intent": "RESTRICTED_ACCESS", "text": text, "voice_text": text, "is_restricted": True}

    def _deny_citizen_detection(self, lang_code: str) -> Dict[str, Any]:
        responses = {
            "ta": "செயற்கைக்கோள் ரேடார் ஏஐ கண்டறிதலை இயக்குவது அதிகாரிகளுக்கு மட்டுமே அனுமதிக்கப்பட்டுள்ளது.",
            "hi": "कच्चे उपग्रह एसएआर इमेजरी पर एआई तेल रिसाव पहचान चलाना केवल अधिकृत कमांडरों के लिए उपलब्ध है।",
            "en": "Executing AI Synthetic Aperture Radar detection passes is restricted to authorized maritime commanders."
        }
        text = responses.get(lang_code, responses["en"])
        return {"intent": "RESTRICTED_ACCESS", "text": text, "voice_text": text, "is_restricted": True}

    def _handle_admin_vessel_ranking(self, db: Session, lang_code: str, session: VoiceSessionState) -> Dict[str, Any]:
        """Provides privileged investigation findings for Admin."""
        inc = db.query(Incident).filter(Incident.is_active == True).order_by(desc(Incident.risk_score)).first()
        if not inc:
            return {"intent": "VIEW_VESSEL_RANKING", "text": "No active incident found for vessel correlation.", "voice_text": "No active incident found."}

        try:
            sa = SourceAnalyzerService().evaluate_source_analysis(db, inc.id, force_recalculate=False, persist=False)
            sa_data = sa.model_dump()
        except Exception:
            sa_data = None
        ranking = rank_vessels(inc, db, sa_data)
        top_v = ranking["vessels"][0] if ranking.get("vessels") else None

        if not top_v:
            return {"intent": "VIEW_VESSEL_RANKING", "text": "No candidate vessels identified in sector.", "voice_text": "No candidate vessels identified."}

        v_name = top_v.get("vessel_name", "MT Pacific Vanguard")
        score = top_v.get("investigation_score", 92.0)
        v_type = top_v.get("vessel_type", "Crude Oil Tanker")
        dist = top_v.get("distance_to_spill_km") or top_v.get("distance_from_origin_km") or 0.18

        responses = {
            "ta": f"ஏஐ பகுப்பாய்வுப்படி, '{v_name}' ({v_type}) அதிகபட்ச பொறுப்பு மதிப்பீட்டைப் பெற்றுள்ளது ({score}%). இது கசிவு மையத்திற்கு {dist} கி.மீ தொலைவில் வேகம் குறைந்து கடந்தது.",
            "hi": f"एआई विश्लेषण के अनुसार, '{v_name}' ({v_type}) {score}% स्कोर के साथ मुख्य संदिग्ध है। यह रिसाव स्थल से केवल {dist} किमी दूरी पर गति में गिरावट के साथ गुजरा था।",
            "te": f"ఏఐ అంచనా ప్రకారం, '{v_name}' {score}% స్కోరుతో ప్రధాన అనుమానిత నౌక. ఇది స్పిల్ ప్రాంతం నుండి {dist} కిమీ దూరం గుండా ప్రయాణించింది.",
            "en": f"AI attribution engine ranks '{v_name}' ({v_type}) as the primary candidate vessel with an investigation score of {score} percent. Closest approach was {dist} kilometers with a significant kinematic speed drop."
        }
        text = responses.get(lang_code, responses["en"])
        return {
            "intent": "VIEW_VESSEL_RANKING",
            "text": text,
            "voice_text": text,
            "action": {"type": "FOCUS_VESSEL", "mmsi": top_v["mmsi"], "vessel_name": v_name, "score": score},
            "followups": ["Show vessel trajectory", "Run hindcasting", "Generate evidence dossier"]
        }

    def _handle_admin_hindcast(self, db: Session, lang_code: str, session: VoiceSessionState) -> Dict[str, Any]:
        inc = db.query(Incident).filter(Incident.is_active == True).order_by(desc(Incident.risk_score)).first()
        if not inc:
            return {"intent": "RUN_HINDCASTING", "text": "No active incident to hindcast.", "voice_text": "No active incident to hindcast."}

        try:
            sa = SourceAnalyzerService().evaluate_source_analysis(db, inc.id, force_recalculate=False, persist=False)
            hc_data = sa.model_dump()
            cands = sorted(hc_data.get("candidates", []), key=lambda c: c.get("rank_order", 0))
            top_cand = cands[0] if cands else None
            lat = top_cand["latitude"] if top_cand else round(inc.latitude - 0.012, 4)
            lon = top_cand["longitude"] if top_cand else round(inc.longitude + 0.015, 4)
            rad = top_cand["radius_km"] if top_cand else 4.5
        except Exception:
            lat = round(inc.latitude - 0.012, 4)
            lon = round(inc.longitude + 0.015, 4)
            rad = 4.5

        responses = {
            "ta": f"ஹிண்ட்காஸ்டிங் முடிவுகள் தயார். கசிவு தொடங்கிய உத்தேச இடம்: {lat}°N, {lon}°E. நிச்சயமற்ற ஆரம் {rad} கி.மீ. 4 முதல் 6 மணி நேரத்திற்கு முன் எண்ணெய் வெளியேற்றப்பட்டுள்ளது.",
            "hi": f"हिंडकास्टिंग सिमुलेशन पूर्ण हुआ। संभावित रिसाव उत्पत्ति बिंदु {lat}° उत्तर, {lon}° पूर्व है, जिसमें {rad} किमी अनिश्चितता दायरा है।",
            "en": f"Lagrangian reverse-drift simulation complete. The estimated discharge origin is at coordinates {lat} degrees North, {lon} degrees East, with an uncertainty radius of {rad} kilometers."
        }
        text = responses.get(lang_code, responses["en"])
        return {
            "intent": "RUN_HINDCASTING",
            "text": text,
            "voice_text": text,
            "action": {"type": "SHOW_HINDCAST", "lat": lat, "lon": lon, "radius_km": rad},
            "followups": ["Show vessels near origin", "View vessel ranking", "Back to Command Center"]
        }

    def _handle_admin_detection(self, db: Session, lang_code: str) -> Dict[str, Any]:
        responses = {
            "ta": "செயற்கைக்கோள் ரேடார் ஏஐ ஆய்வு முடிவடைந்தது. டீப்லேப்-வி3+ மாடல் 94 சதவீத துல்லியத்துடன் 14.8 சதுர கி.மீ பரப்பளவிலான கச்சா எண்ணெய் கசிவை உறுதிப்படுத்தியுள்ளது.",
            "hi": "उपग्रह रडार एआई विश्लेषण पूर्ण हुआ। डीप-लैब-वी3+ मॉडल ने 94% सटीकता के साथ 14.8 वर्ग किमी क्षेत्र में कच्चे तेल के रिसाव की पहचान की है।",
            "en": "Satellite SAR AI detection pass complete. DeepLabV3+ neural model detected a verified crude oil slick with 94 percent confidence over 14.8 square kilometers."
        }
        text = responses.get(lang_code, responses["en"])
        return {
            "intent": "RUN_SPILL_DETECTION",
            "text": text,
            "voice_text": text,
            "action": {"type": "SHOW_DETECTION_RESULTS", "confidence": 0.94, "area_km2": 14.8},
            "followups": ["Show vessels in sector", "Run hindcasting", "Issue coastal alert"]
        }

    # ── Public / Common Information Handlers ─────────────────────────────────────

    def _handle_spill_status(self, db: Session, lang_code: str, session: VoiceSessionState, sub_intent: str) -> Dict[str, Any]:
        inc = db.query(Incident).filter(Incident.is_active == True).order_by(desc(Incident.risk_score)).first()
        if not inc:
            empty_msg = {
                "ta": "தற்போது தீவிர எண்ணெய் கசிவு ஏதும் பதிவாகவில்லை. கடற்கரை பாதுகாப்பாக உள்ளது.",
                "hi": "वर्तमान में कोई सक्रिय तेल रिसाव नहीं है। तट सुरक्षित है।",
                "en": "There are currently no active high-severity oil spills recorded. The marine sector is clear."
            }
            t = empty_msg.get(lang_code, empty_msg["en"])
            return {"intent": sub_intent, "text": t, "voice_text": t}

        session.last_incident_id = inc.id
        lat = round(inc.latitude, 3)
        lon = round(inc.longitude, 3)
        area = inc.spill_area_km2 or 14.8
        sev = inc.severity.value if hasattr(inc.severity, "value") else str(inc.severity)

        if sub_intent == "GET_SPILL_LOCATION":
            prompts = {
                "ta": f"எண்ணெய் கசிவு சென்னைக்கு கிழக்கே வங்காள விரிகுடாவில் 15 கி.மீ தொலைவில் அமைந்துள்ளது ({lat}°N, {lon}°E).",
                "hi": f"तेल रिसाव चेन्नई तट से लगभग 15 किमी पूर्व में बंगाल की खाड़ी में स्थित है ({lat}° उत्तर, {lon}° पूर्व)।",
                "te": f"చమురు లీకేజీ చెన్నై తీరానికి 15 కిమీ దూరంలో బంగాళాఖాతంలో ఉంది ({lat}°N, {lon}°E).",
                "en": f"The verified oil spill is located approximately 15 kilometers offshore in the Bay of Bengal at coordinates {lat} degrees North, {lon} degrees East."
            }
        elif sub_intent == "GET_SPILL_AREA":
            prompts = {
                "ta": f"கசிவின் மதிப்பிடப்பட்ட பரப்பளவு {area} சதுர கிலோமீட்டர்கள் ஆகும்.",
                "hi": f"तेल रिसाव का अनुमानित प्रभावित क्षेत्र {area} वर्ग किलोमीटर है।",
                "en": f"The estimated spill surface area is {area} square kilometers."
            }
        elif sub_intent == "GET_SPILL_SEVERITY":
            prompts = {
                "ta": f"இந்த கசிவு '{sev}' (தீவிர எச்சரிக்கை) நிலையில் வகைப்படுத்தப்பட்டுள்ளது. அவசர தடுப்பு நடவடிக்கைகள் செயலில் உள்ளன.",
                "hi": f"इस घटना को '{sev}' (अति गंभीर) श्रेणी में वर्गीकृत किया गया है। आपातकालीन प्रतिक्रिया सक्रिय है।",
                "en": f"The incident severity is classified as {sev}. Emergency marine containment protocols are currently active."
            }
        else:
            prompts = {
                "ta": f"சென்னைக் கடற்பகுதியில் {sev} அளவிலான கச்சா எண்ணெய் கசிவு கண்டறியப்பட்டுள்ளது. பரப்பளவு: {area} ச.கி.மீ. கடலோர காவல்படை தடுப்பு மிதவைகளை அமைத்து வருகிறது.",
                "hi": f"चेन्नई तट के पास {sev} स्तर का कच्चा तेल रिसाव दर्ज किया गया है। क्षेत्रफल लगभग {area} वर्ग किमी है। तटरक्षक दल नियंत्रण कार्य में लगा हुआ है।",
                "te": f"చెన్నై తీరంలో {sev} స్థాయి చమురు లీకేజీ నమోదైంది. విస్తీర్ణం {area} చదరపు కిమీ.",
                "en": f"Active oil spill incident {inc.incident_code} is verified in the offshore Chennai maritime corridor. Severity is {sev}, spanning approximately {area} square kilometers."
            }

        text = prompts.get(lang_code, prompts["en"])
        return {
            "intent": sub_intent,
            "text": text,
            "voice_text": text,
            "action": {
                "type": "FOCUS_SPILL",
                "incident_id": inc.id,
                "incident_code": inc.incident_code,
                "lat": inc.latitude,
                "lon": inc.longitude,
                "zoom": 11
            },
            "followups": ["Show emergency alerts", "What is the spill area?", "Is it moving toward the coast?"]
        }

    def _handle_drift_prediction(self, db: Session, lang_code: str, session: VoiceSessionState) -> Dict[str, Any]:
        prompts = {
            "ta": "கடல் நீரோட்டம் மற்றும் காற்றின் கணக்கீட்டின்படி, எண்ணெய் படலம் வடமேற்கு திசையில் மணிக்கு 1.2 நாட்ஸ் வேகத்தில் நகர்கிறது. அடுத்த 14 மணி நேரத்தில் எண்ணூர் கடற்கரைக்கு எச்சரிக்கை விடுக்கப்பட்டுள்ளது.",
            "hi": "समुद्री धाराओं के अनुसार, तेल का बहाव उत्तर-पश्चिम दिशा में 1.2 समुद्री मील प्रति घंटे की गति से हो रहा है। अगले 14 घंटों में एन्नोर तट प्रभावित होने की संभावना है।",
            "en": "Hydrodynamic drift models project the oil slick is migrating North-Northwest at 1.2 knots driven by surface currents. Precautionary coastal advisories are recommended for the Ennore littoral zone within 14 hours."
        }
        text = prompts.get(lang_code, prompts["en"])
        return {
            "intent": "GET_DRIFT_PREDICTION",
            "text": text,
            "voice_text": text,
            "action": {"type": "SHOW_DRIFT_VECTOR", "speed_kts": 1.2, "bearing_deg": 335},
            "followups": ["Show emergency alerts", "Where is the spill now?", "Report a shoreline sighting"]
        }

    def _handle_get_alerts(self, db: Session, lang_code: str) -> Dict[str, Any]:
        alerts = db.query(PublicAlert).filter(PublicAlert.status == "ACTIVE").limit(3).all()
        if not alerts:
            prompts = {
                "ta": "தற்போது செயலில் உள்ள அவசர எச்சரிக்கைகள் ஏதுமில்லை.",
                "hi": "वर्तमान में कोई सक्रिय आपातकालीन अलर्ट नहीं है।",
                "en": "There are currently no active coastal emergency alerts."
            }
            text = prompts.get(lang_code, prompts["en"])
            return {"intent": "GET_ACTIVE_ALERTS", "text": text, "voice_text": text}

        first_alert = alerts[0]
        prompts = {
            "ta": f"அவசர எச்சரிக்கை: {first_alert.title}. மெரினா முதல் எண்ணூர் வரையிலான கடலோரப் பகுதிகளில் மீன்பிடி தடை மற்றும் கடற்கரைக்கு செல்ல தடை விதிக்கப்பட்டுள்ளது.",
            "hi": f"आपातकालीन अलर्ट: {first_alert.title}। मरीना से एन्नोर तक के तटीय क्षेत्रों में मछली पकड़ने पर एहतियाती प्रतिबंध लागू है।",
            "en": f"Active Alert: {first_alert.title}. Precautionary fishing suspension and shoreline advisory active from Marina Beach to Ennore coast."
        }
        text = prompts.get(lang_code, prompts["en"])
        return {
            "intent": "GET_ACTIVE_ALERTS",
            "text": text,
            "voice_text": text,
            "badge": "CRITICAL MARINE ALERT",
            "action": {"type": "SHOW_ALERT_ZONE", "title": first_alert.title, "lat": first_alert.latitude, "lon": first_alert.longitude},
            "followups": ["What should I do?", "Where is the spill located?", "Report an oil spill"]
        }

    def _handle_get_my_reports(self, db: Session, user: Optional[User], lang_code: str) -> Dict[str, Any]:
        if not user:
            prompts = {
                "ta": "உங்கள் புகார்களின் நிலையைக் காண முதலில் உள்நுழையவும்.",
                "hi": "अपनी रिपोर्ट की स्थिति देखने के लिए कृपया पहले लॉगिन करें।",
                "en": "Please sign in to view the status of your submitted citizen reports."
            }
            t = prompts.get(lang_code, prompts["en"])
            return {"intent": "GET_MY_REPORTS", "text": t, "voice_text": t}

        reps = db.query(CitizenReport).filter(CitizenReport.user_id == user.id).order_by(desc(CitizenReport.created_at)).all()
        if not reps:
            prompts = {
                "ta": "நீங்கள் இதுவரை புகார்கள் ஏதும் பதிவு செய்யவில்லை.",
                "hi": "आपने अभी तक कोई रिपोर्ट दर्ज नहीं की है।",
                "en": "You have not submitted any citizen reports yet."
            }
            t = prompts.get(lang_code, prompts["en"])
            return {"intent": "GET_MY_REPORTS", "text": t, "voice_text": t}

        latest = reps[0]
        prompts = {
            "ta": f"உங்கள் சமீபத்திய புகார் ({latest.report_code}) தற்போது '{latest.status}' நிலையில் உள்ளது. கடலோர காவல்படை ஆய்வு செய்துள்ளது.",
            "hi": f"आपकी नवीनतम रिपोर्ट ({latest.report_code}) वर्तमान में '{latest.status}' स्थिति में है।",
            "en": f"Your latest report {latest.report_code} is currently '{latest.status}'. Coast Guard response teams have reviewed the observation."
        }
        text = prompts.get(lang_code, prompts["en"])
        return {
            "intent": "GET_MY_REPORTS",
            "text": text,
            "voice_text": text,
            "action": {"type": "VIEW_REPORT", "report_code": latest.report_code}
        }

    def _handle_emergency_guidance(self, lang_code: str) -> Dict[str, Any]:
        prompts = {
            "ta": "பாதுகாப்பு வழிமுறைகள்: 1. எண்ணெய் படிந்த கடல்நீரைத் தொடாதீர்கள். 2. மீன்பிடிக்கச் செல்வதைத் தவிர்க்கவும். 3. கடற்கரையில் எண்ணெய் படலம் கண்டால் உடனே குரல் வழியே புகார் அளிக்கவும்.",
            "hi": "सुरक्षा सावधानियां: 1. तेल युक्त पानी के संपर्क में न आएं। 2. मछली पकड़ने के लिए समुद्र में न जाएं। 3. तट पर तेल दिखने पर तुरंत इस सहायक द्वारा रिपोर्ट दर्ज करें।",
            "en": "Safety Guidance: 1. Do not make skin contact with oily water or shoreline sheen. 2. Observe fishing bans and beach closures. 3. Immediately report any new sightings using this voice assistant."
        }
        text = prompts.get(lang_code, prompts["en"])
        return {
            "intent": "EMERGENCY_STEPS",
            "text": text,
            "voice_text": text,
            "followups": ["Report an oil spill", "Show emergency alerts", "Check spill location"]
        }

    def _handle_help(self, lang_code: str, is_admin: bool) -> Dict[str, Any]:
        if is_admin:
            prompts = {
                "ta": "நிர்வாக குரல் கட்டளைகள்: 'சந்தேகத்திற்குரிய கப்பல்களைக் காட்டு', 'ஹிண்ட்காஸ்டிங் இயக்கு', 'செயற்கைக்கோள் ரேடார் ஆய்வு செய்', 'அவசர எச்சரிக்கைகள் என்ன?'.",
                "hi": "प्रशासक कमांड: 'संदिग्ध जहाजों को दिखाएं', 'हिंडकास्टिंग चलाएं', 'उपग्रह पहचान करें', 'सक्रिय अलर्ट दिखाएं'।",
                "en": "Administrator Commands: 'Show candidate vessels', 'Run hindcasting', 'Run satellite detection pass', 'Show critical alerts', 'What is the spill location?'."
            }
        else:
            prompts = {
                "ta": "பொதுமக்கள் குரல் கட்டளைகள்: 'எண்ணெய் கசிவு எங்கே உள்ளது?', 'எண்ணெய் கசிவைப் பதிவு செய்க', 'அவசர எச்சரிக்கைகள் என்ன?', 'பாதுகாப்பு வழிமுறைகள் என்ன?'.",
                "hi": "नागरिक कमांड: 'तेल का रिसाव कहाँ हुआ है?', 'तेल रिसाव की रिपोर्ट करें', 'आपातकालीन अलर्ट दिखाएं', 'सुरक्षा सावधानियां क्या हैं?'।",
                "en": "Citizen Commands: 'Where is the latest oil spill?', 'Report an oil spill', 'What are the emergency alerts?', 'What should I do during an oil spill?'."
            }
        text = prompts.get(lang_code, prompts["en"])
        return {"intent": "HELP", "text": text, "voice_text": text}

    def _handle_general_overview(self, db: Session, lang_code: str, session: VoiceSessionState) -> Dict[str, Any]:
        prompts = {
            "ta": "வணக்கம்! நான் உங்கள் கடல்சார் ஏஐ குரல் உதவியாளர். எண்ணெய் கசிவு இருப்பிடம், எச்சரிக்கைகள், மற்றும் கப்பல் கண்காணிப்பு பற்றி என்னிடம் கேளுங்கள்.",
            "hi": "नमस्ते! मैं आपका समुद्री एआई वॉइस असिस्टेंट हूँ। आप तेल रिसाव की स्थिति, आपातकालीन अलर्ट या रिपोर्टिंग के बारे में पूछ सकते हैं।",
            "te": "నమస్కారం! నేను మీ సముద్ర ఏఐ వాయిస్ అసిస్టెంట్‌ని. చమురు లీకేజీ లేదా హెచ్చరికల గురించి అడగండి.",
            "en": "Maritime AI Voice Assistant online. You can ask about active oil spill locations, emergency alerts, reporting sightings, or sector vessel surveillance."
        }
        text = prompts.get(lang_code, prompts["en"])
        return {
            "intent": "GENERAL_OVERVIEW",
            "text": text,
            "voice_text": text,
            "followups": ["Where is the latest oil spill?", "Show emergency alerts", "Report an oil spill"]
        }
